"""StreamDiffusion (speed) + IP-Adapter Plus (reference identity).

Repos:
  https://github.com/cumulo-autumn/StreamDiffusion
  https://github.com/tencent-ailab/IP-Adapter
  https://github.com/InstantID/InstantID  (optional stronger face path)

Mode:
  - No reference  → StreamDiffusion SD-Turbo (target 30–90 fps)
  - With reference → Diffusers img2img + IP-Adapter Plus (identity, slower)
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.stream_ip")

FRAME_SIZE = int(os.environ.get("FRAME_SIZE", "512"))
PROC_SIZE = int(os.environ.get("PROC_SIZE", "512"))
STREAM_ROOT = Path(__file__).resolve().parent / "StreamDiffusion"
IP_ROOT = Path(__file__).resolve().parent / "IP-Adapter"
ENGINE_DIR = os.environ.get("STREAM_ENGINES", str(Path(__file__).resolve().parent / "engines"))
ACCEL_FILE = Path(__file__).resolve().parent / ".stream_accel"

if STREAM_ROOT.exists():
    sys.path.insert(0, str(STREAM_ROOT))
if IP_ROOT.exists():
    sys.path.insert(0, str(IP_ROOT))


class StreamIPEngine:
    """Fast StreamDiffusion path + IP-Adapter when a reference photo is set."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stream = None
        self._ip_pipe = None
        self._reference: Optional[Image.Image] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = (
            "photorealistic full body photo of the same person as the reference, "
            "same pose as camera, detailed face and clothes, sharp focus"
        )
        self.negative = (
            "blurry, distorted, deformed, ugly, bad anatomy, cartoon, low quality, watermark"
        )
        self.strength = 0.55
        self.reference_strength = 0.75
        self.steps = 3
        self.mode = "streamdiffusion"
        self.acceleration = "streamdiffusion"
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.float16 if self._device == "cuda" else torch.float32

    def _preferred_accel(self) -> str:
        if ACCEL_FILE.exists():
            return ACCEL_FILE.read_text().strip() or "none"
        return os.environ.get("STREAM_ACCEL", "none")

    def _load_stream(self) -> None:
        if self._stream is not None:
            return
        from utils.wrapper import StreamDiffusionWrapper

        accel = self._preferred_accel()
        if accel == "tensorrt":
            engines = Path(ENGINE_DIR)
            if not any(engines.rglob("unet.engine")):
                accel = "none"

        logger.info("Loading StreamDiffusion SD-Turbo (%spx, accel=%s)...", PROC_SIZE, accel)
        stream = StreamDiffusionWrapper(
            model_id_or_path="stabilityai/sd-turbo",
            t_index_list=[45],
            frame_buffer_size=1,
            width=PROC_SIZE,
            height=PROC_SIZE,
            warmup=8,
            acceleration=accel,
            mode="img2img",
            use_denoising_batch=True,
            cfg_type="none",
            use_lcm_lora=False,
            use_tiny_vae=True,
            output_type="pil",
            engine_dir=ENGINE_DIR,
            device=self._device,
            dtype=self._dtype,
        )
        stream.prepare(
            prompt=self.prompt,
            negative_prompt=self.negative,
            num_inference_steps=50,
            guidance_scale=1.0,
            delta=0.5,
        )
        self._stream = stream
        self.acceleration = f"streamdiffusion-{accel}"
        ACCEL_FILE.write_text(accel)
        logger.info("StreamDiffusion ready")

    def _load_ip(self) -> None:
        if self._ip_pipe is not None:
            return
        from diffusers import LCMScheduler, StableDiffusionImg2ImgPipeline

        logger.info("Loading SD1.5 + LCM + IP-Adapter Plus (%spx)...", PROC_SIZE)
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=self._dtype,
            safety_checker=None,
        )
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
        pipe.fuse_lora()
        pipe.load_ip_adapter(
            "h94/IP-Adapter",
            subfolder="models",
            weight_name="ip-adapter-plus_sd15.bin",
        )
        pipe.to(self._device)
        pipe.set_progress_bar_config(disable=True)
        self._ip_pipe = pipe
        logger.info("IP-Adapter Plus ready")

    def load(self) -> None:
        if self.ready:
            return
        # Prefer stream path first for fast no-ref mode
        try:
            self._load_stream()
        except Exception as exc:
            logger.warning("StreamDiffusion unavailable (%s) — IP path only", exc)
        self.ready = True

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self.mode = "streamdiffusion"
                return
            self._reference = image.convert("RGB")
            self.mode = "streamdiffusion+ip-adapter"

    def update_prompt(self, prompt: str, negative: str = "") -> None:
        with self._lock:
            self.prompt = prompt
            if negative:
                self.negative = negative
        if self._stream is not None:
            self._stream.prepare(
                prompt=self.prompt,
                negative_prompt=self.negative,
                num_inference_steps=50,
                guidance_scale=1.0,
                delta=0.5,
            )

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()
        if float(rgb.mean()) < 12:
            raise ValueError("Camera frame is black — pick another camera")

        t0 = time.perf_counter()
        pil = Image.fromarray(rgb).resize((PROC_SIZE, PROC_SIZE), Image.Resampling.LANCZOS)

        with self._lock:
            reference = self._reference.copy() if self._reference is not None else None
            prompt = self.prompt
            negative = self.negative
            strength = min(max(self.strength, 0.25), 0.8)
            ref_strength = min(max(self.reference_strength, 0.3), 1.0)
            steps = max(2, min(self.steps, 6))

        try:
            with torch.inference_mode():
                if reference is not None:
                    if self._ip_pipe is None:
                        self._load_ip()
                    ref = reference.resize((PROC_SIZE, PROC_SIZE), Image.Resampling.LANCZOS)
                    self._ip_pipe.set_ip_adapter_scale(ref_strength)
                    out = self._ip_pipe(
                        prompt=prompt,
                        negative_prompt=negative,
                        image=pil,
                        ip_adapter_image=ref,
                        num_inference_steps=steps,
                        strength=strength,
                        guidance_scale=1.0,
                    ).images[0]
                    self.mode = "ip-adapter-plus"
                    self.acceleration = "lcm+ip-adapter-plus"
                else:
                    if self._stream is None:
                        self._load_stream()
                    tensor = self._stream.preprocess_image(pil)
                    out = self._stream(image=tensor)
                    if isinstance(out, list):
                        out = out[0]
                    self.mode = "streamdiffusion"
                    self.acceleration = getattr(self, "acceleration", "streamdiffusion")
            out_rgb = np.array(out.convert("RGB"))
            if FRAME_SIZE != PROC_SIZE:
                out_rgb = cv2.resize(out_rgb, (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LINEAR)
            self.last_error = None
        except Exception as exc:
            self.last_error = str(exc)
            raise

        elapsed = time.perf_counter() - t0
        self.last_ms = elapsed * 1000
        self._times.append(elapsed)
        if len(self._times) > 120:
            self._times.pop(0)
        self.fps = 1.0 / (sum(self._times) / len(self._times)) if self._times else 0.0
        return out_rgb

    def process_jpeg(self, jpeg_bytes: bytes) -> bytes:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Invalid JPEG")
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        out_rgb = self.process_rgb(rgb)
        out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()
