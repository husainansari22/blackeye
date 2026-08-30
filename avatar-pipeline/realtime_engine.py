"""Local realtime img2img — Decart-style prompt + reference, no external API."""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.realtime")

FRAME_SIZE = int(__import__("os").environ.get("FRAME_SIZE", "384"))


def _color_transfer(ref_rgb: np.ndarray, src_rgb: np.ndarray, amount: float = 0.5) -> np.ndarray:
    ref = cv2.cvtColor(ref_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    src = cv2.cvtColor(src_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    out = src.copy()
    for ch in range(3):
        s_mean, s_std = src[:, :, ch].mean(), src[:, :, ch].std() + 1e-6
        r_mean, r_std = ref[:, :, ch].mean(), ref[:, :, ch].std()
        out[:, :, ch] = (src[:, :, ch] - s_mean) * (r_std / s_std) + r_mean
    out = np.clip(out, 0, 255).astype(np.uint8)
    blended = cv2.cvtColor(out, cv2.COLOR_LAB2RGB)
    if amount < 1.0:
        blended = cv2.addWeighted(blended, amount, src_rgb, 1.0 - amount, 0)
    return blended


class RealtimeEngine:
    """LCM-LoRA img2img (fast, stable on Blackwell). Reference via color transfer."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipe = None
        self._reference: Optional[Image.Image] = None
        self._reference_rgb: Optional[np.ndarray] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = "sharp portrait photo, detailed face, cinematic lighting, high quality"
        self.negative = "blurry, low quality, distorted, deformed, ugly, watermark, text"
        self.steps = 2
        self.strength = 0.55
        self.guidance = 1.0
        self.reference_strength = 0.55
        self.color_amount = 0.55
        self.mode = "lcm"
        self.acceleration = "lcm-lora"
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.float16 if self._device == "cuda" else torch.float32

    def _load(self) -> None:
        if self._pipe is not None:
            return
        from diffusers import LCMScheduler, StableDiffusionImg2ImgPipeline

        logger.info("Loading LCM-LoRA on %s (%spx)...", self._device, FRAME_SIZE)
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=self._dtype,
            safety_checker=None,
        )
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
        pipe.fuse_lora()
        pipe.to(self._device)
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        logger.info("LCM-LoRA ready")

    def load(self) -> None:
        if self.ready:
            return
        self._load()
        self.ready = True

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self._reference_rgb = None
                self.mode = "lcm"
                return
            img = image.convert("RGB")
            self._reference = img
            self._reference_rgb = np.array(img.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS))
            self.mode = "lcm+ref"

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()

        mean_bright = float(rgb.mean())
        if mean_bright < 15:
            raise ValueError("Camera frame is black — select a working camera or use Video file")

        t0 = time.perf_counter()
        pil = Image.fromarray(rgb).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)

        with self._lock:
            prompt = self.prompt
            negative = self.negative
            steps = max(2, min(self.steps, 6))
            strength = min(max(self.strength, 0.2), 0.85)
            guidance = self.guidance
            ref_rgb = self._reference_rgb.copy() if self._reference_rgb is not None else None
            color_amount = self.reference_strength if ref_rgb is not None else 0.0

        try:
            with torch.inference_mode():
                out = self._pipe(
                    prompt=prompt,
                    negative_prompt=negative,
                    image=pil,
                    num_inference_steps=steps,
                    strength=strength,
                    guidance_scale=guidance,
                ).images[0]
            out_rgb = np.array(out)
            if ref_rgb is not None and color_amount > 0:
                out_rgb = _color_transfer(ref_rgb, out_rgb, color_amount)
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
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()
