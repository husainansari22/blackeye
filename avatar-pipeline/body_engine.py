"""Full-body avatar transform: person mask + SD-Turbo/LCM + IP-Adapter Plus."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.body")

PROC_SIZE = int(os.environ.get("PROC_SIZE", "384"))
OUT_SIZE = int(os.environ.get("FRAME_SIZE", "512"))


def _person_mask(rgb: np.ndarray) -> np.ndarray:
    """Fast person segmentation 0..1 float mask."""
    try:
        import mediapipe as mp

        if not hasattr(_person_mask, "_seg"):
            _person_mask._seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
        seg = _person_mask._seg
        res = seg.process(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        mask = res.segmentation_mask.astype(np.float32)
        mask = cv2.GaussianBlur(mask, (7, 7), 0)
        return np.clip(mask, 0, 1)
    except Exception:
        # fallback: center ellipse covers upper body
        h, w = rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.float32)
        cv2.ellipse(mask, (w // 2, int(h * 0.45)), (int(w * 0.35), int(h * 0.48)), 0, 0, 360, 1.0, -1)
        return cv2.GaussianBlur(mask, (21, 21), 0)


def _blend_person(original: np.ndarray, generated: np.ndarray, mask: np.ndarray, amount: float) -> np.ndarray:
    m = mask[..., None] * amount
    out = original.astype(np.float32) * (1 - m) + generated.astype(np.float32) * m
    return np.clip(out, 0, 255).astype(np.uint8)


class BodyTransformEngine:
    """Reference photo drives full appearance; webcam drives pose via img2img."""

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
        self.prompt = (
            "full body photo of the same person from reference, same pose, "
            "detailed face and hair, natural skin, photorealistic, sharp focus, same clothes as reference"
        )
        self.negative = (
            "blurry, distorted, deformed, ugly, bad anatomy, extra limbs, "
            "cartoon, low quality, watermark, wrong clothes"
        )
        self.steps = 2
        self.strength = 0.58
        self.guidance = 1.2
        self.reference_strength = 0.82
        self.body_blend = 0.92
        self.mode = "body-turbo"
        self.acceleration = "sd-turbo+ip-plus"
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.float16 if self._device == "cuda" else torch.float32

    def _load_turbo(self) -> None:
        if self._turbo is not None:
            return
        from diffusers import AutoPipelineForImage2Image

        logger.info("Loading SD-Turbo (%spx)...", PROC_SIZE)
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sd-turbo",
            torch_dtype=self._dtype,
            variant="fp16" if self._device == "cuda" else None,
        )
        pipe.to(self._device)
        pipe.set_progress_bar_config(disable=True)
        self._turbo = pipe

    def _load_ip(self) -> None:
        if self._ip is not None:
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
        self._ip = pipe

    def load(self) -> None:
        if self.ready:
            return
        self._load_turbo()
        self.ready = True

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self.mode = "body-turbo"
                self.acceleration = "sd-turbo"
                return
            self._reference = image.convert("RGB")
            self.mode = "body-ip-plus"
            self.acceleration = "lcm+ip-plus"

    def _generate(self, pil: Image.Image, reference: Optional[Image.Image]) -> Image.Image:
        if reference is not None:
            if self._ip is None:
                self._load_ip()
            ref = reference.resize((PROC_SIZE, PROC_SIZE), Image.Resampling.LANCZOS)
            with self._lock:
                prompt = self.prompt
                negative = self.negative
                steps = max(2, min(self.steps, 4))
                strength = min(max(self.strength, 0.35), 0.75)
                ref_strength = min(max(self.reference_strength, 0.4), 1.0)
            self._ip.set_ip_adapter_scale(ref_strength)
            return self._ip(
                prompt=prompt,
                negative_prompt=negative,
                image=pil,
                ip_adapter_image=ref,
                num_inference_steps=steps,
                strength=strength,
                guidance_scale=1.0,
            ).images[0]

        if self._turbo is None:
            self._load_turbo()
        with self._lock:
            prompt = self.prompt
            strength = min(max(self.strength, 0.3), 0.7)
            steps = min(self.steps, 4)
        return self._turbo(
            prompt=prompt,
            image=pil,
            num_inference_steps=steps,
            strength=strength,
            guidance_scale=1.0,
        ).images[0]

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()

        if float(rgb.mean()) < 15:
            raise ValueError("Camera frame is black — select a working camera")

        t0 = time.perf_counter()
        orig = rgb
        if max(orig.shape[:2]) != PROC_SIZE:
            pil_in = Image.fromarray(orig).resize((PROC_SIZE, PROC_SIZE), Image.Resampling.LANCZOS)
            work_rgb = np.array(pil_in)
        else:
            work_rgb = orig
            pil_in = Image.fromarray(work_rgb)

        with self._lock:
            reference = self._reference.copy() if self._reference is not None else None
            blend = self.body_blend

        if reference is None:
            raise ValueError("Upload a reference photo first")

        mask = _person_mask(work_rgb)

        try:
            with torch.inference_mode():
                gen = self._generate(pil_in, reference)
            gen_rgb = np.array(gen)
            out_rgb = _blend_person(work_rgb, gen_rgb, mask, blend)
            self.last_error = None
            self.mode = "body-ip-plus"
            self.acceleration = "lcm+ip-plus"
        except Exception as exc:
            self.last_error = str(exc)
            raise

        if OUT_SIZE != PROC_SIZE:
            out_rgb = cv2.resize(out_rgb, (OUT_SIZE, OUT_SIZE), interpolation=cv2.INTER_LINEAR)

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

    def update_prompt(self, prompt: str, negative: str = "") -> None:
        with self._lock:
            self.prompt = prompt
            if negative:
                self.negative = negative
