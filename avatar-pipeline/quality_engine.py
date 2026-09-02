"""SD-Turbo + IP-Adapter Plus Face — clean reference-based avatar transforms."""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.quality")

FRAME_SIZE = int(__import__("os").environ.get("FRAME_SIZE", "512"))

DEFAULT_PROMPT = (
    "photorealistic portrait photo, same pose, detailed face, natural skin texture, "
    "sharp focus, professional lighting, high quality, 8k uhd"
)
DEFAULT_NEGATIVE = (
    "blurry, distorted, deformed, ugly, bad anatomy, disfigured, low quality, "
    "cartoon, painting, watermark, text, extra limbs, mutated face"
)
REF_PROMPT = (
    "photo of the same person from the reference image, same pose as camera, "
    "detailed face, natural skin, photorealistic, sharp focus, cinematic lighting"
)


class QualityEngine:
    """SD-Turbo when no reference; IP-Adapter Plus Face when reference is set."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._turbo = None
        self._ip = None
        self._reference: Optional[Image.Image] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = DEFAULT_PROMPT
        self.negative = DEFAULT_NEGATIVE
        self.steps = 4
        self.strength = 0.38
        self.guidance = 7.5
        self.reference_strength = 0.78
        self.mode = "turbo"
        self.acceleration = "sd-turbo"
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.float16 if self._device == "cuda" else torch.float32

    def _load_turbo(self) -> None:
        if self._turbo is not None:
            return
        from diffusers import AutoPipelineForImage2Image

        logger.info("Loading SD-Turbo (%spx)...", FRAME_SIZE)
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sd-turbo",
            torch_dtype=self._dtype,
            variant="fp16" if self._device == "cuda" else None,
        )
        pipe.to(self._device)
        pipe.set_progress_bar_config(disable=True)
        self._turbo = pipe
        logger.info("SD-Turbo ready")

    def _load_ip(self) -> None:
        if self._ip is not None:
            return
        from diffusers import DPMSolverMultistepScheduler, StableDiffusionImg2ImgPipeline

        logger.info("Loading SD 1.5 + IP-Adapter Plus Face (%spx)...", FRAME_SIZE)
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=self._dtype,
            safety_checker=None,
        )
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe.load_ip_adapter(
            "h94/IP-Adapter",
            subfolder="models",
            weight_name="ip-adapter-plus-face_sd15.bin",
        )
        pipe.to(self._device)
        pipe.set_progress_bar_config(disable=True)
        self._ip = pipe
        logger.info("IP-Adapter Plus Face ready")

    def load(self) -> None:
        if self.ready:
            return
        self._load_turbo()
        self.ready = True

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self.mode = "turbo"
                self.acceleration = "sd-turbo"
                return
            self._reference = image.convert("RGB")
            self.mode = "ip-adapter-face"
            self.acceleration = "ip-adapter-plus-face"
            if self.prompt == DEFAULT_PROMPT:
                self.prompt = REF_PROMPT

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()

        if float(rgb.mean()) < 15:
            raise ValueError("Camera frame is black — select a working camera")

        t0 = time.perf_counter()
        pil = Image.fromarray(rgb).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)

        with self._lock:
            prompt = self.prompt
            negative = self.negative
            strength = min(max(self.strength, 0.15), 0.75)
            steps = max(2, min(self.steps, 8))
            guidance = self.guidance
            ref_strength = min(max(self.reference_strength, 0.2), 1.0)
            reference = self._reference.copy() if self._reference is not None else None

        try:
            with torch.inference_mode():
                if reference is not None:
                    if self._ip is None:
                        self._load_ip()
                    ref = reference.resize((512, 512), Image.Resampling.LANCZOS)
                    self._ip.set_ip_adapter_scale(ref_strength)
                    out_rgb = np.array(
                        self._ip(
                            prompt=prompt,
                            negative_prompt=negative,
                            image=pil,
                            ip_adapter_image=ref,
                            num_inference_steps=steps,
                            strength=strength,
                            guidance_scale=guidance,
                        ).images[0]
                    )
                    self.mode = "ip-adapter-face"
                    self.acceleration = "ip-adapter-plus-face"
                else:
                    if self._turbo is None:
                        self._load_turbo()
                    out_rgb = np.array(
                        self._turbo(
                            prompt=prompt,
                            negative_prompt=negative,
                            image=pil,
                            num_inference_steps=min(steps, 4),
                            strength=min(max(strength, 0.2), 0.65),
                            guidance_scale=1.0,
                        ).images[0]
                    )
                    self.mode = "turbo"
                    self.acceleration = "sd-turbo"
            self.last_error = None
        except Exception as exc:
            self.last_error = str(exc)
            raise

        elapsed = time.perf_counter() - t0
        self.last_ms = elapsed * 1000
        self._times.append(elapsed)
        if len(self._times) > 60:
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
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()

    def update_prompt(self, prompt: str, negative: str = "") -> None:
        with self._lock:
            self.prompt = prompt
            if negative:
                self.negative = negative
