"""Real-time Video-to-Video diffusion pipeline with optional IP-Adapter reference."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class PipelineSettings:
    prompt: str = "high quality portrait, cinematic lighting, detailed"
    negative_prompt: str = "blurry, low quality, distorted, ugly, watermark"
    strength: float = 0.45
    guidance_scale: float = 7.0
    steps: int = 4
    width: int = 512
    height: int = 512
    reference_strength: float = 0.65


@dataclass
class PipelineStats:
    fps: float = 0.0
    latency_ms: float = 0.0
    model_loaded: bool = False
    device: str = "cpu"
    last_error: str | None = None
    has_reference: bool = False
    mode: str = "turbo"


class Vid2VidPipeline:
    """SD-Turbo for webcam-only; SD 1.5 + IP-Adapter when a reference photo is set."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._turbo_pipe = None
        self._ip_pipe = None
        self._settings = PipelineSettings()
        self.stats = PipelineStats()
        self._frame_times: list[float] = []
        self._reference_image: Image.Image | None = None

    @property
    def settings(self) -> PipelineSettings:
        return self._settings

    def update_settings(self, **kwargs: Any) -> PipelineSettings:
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._settings, key) and value is not None:
                    setattr(self._settings, key, value)
            if self._ip_pipe is not None and "reference_strength" in kwargs:
                scale = min(max(float(kwargs["reference_strength"]), 0.0), 1.0)
                self._ip_pipe.set_ip_adapter_scale(scale)
            return self._settings

    def set_reference_image(self, image: Image.Image | None) -> None:
        with self._lock:
            self._reference_image = image.convert("RGB") if image is not None else None
            self.stats.has_reference = self._reference_image is not None
            self.stats.mode = "reference" if self._reference_image else "turbo"

    def get_reference_preview(self) -> bytes | None:
        with self._lock:
            if self._reference_image is None:
                return None
            buf = BytesIO()
            self._reference_image.save(buf, format="JPEG", quality=90)
            return buf.getvalue()

    def _load_turbo_sync(self) -> None:
        if self._turbo_pipe is not None:
            return
        from diffusers import AutoPipelineForImage2Image

        device = self.stats.device
        dtype = torch.float16 if device == "cuda" else torch.float32
        logger.info("Loading SD-Turbo on %s...", device)
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sd-turbo",
            torch_dtype=dtype,
            variant="fp16" if device == "cuda" else None,
        )
        pipe.to(device)
        if device == "cuda":
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                pass
        self._turbo_pipe = pipe

    def _load_ip_sync(self) -> None:
        if self._ip_pipe is not None:
            return
        from diffusers import StableDiffusionImg2ImgPipeline, DPMSolverMultistepScheduler

        device = self.stats.device
        dtype = torch.float16 if device == "cuda" else torch.float32
        logger.info("Loading SD 1.5 + IP-Adapter on %s...", device)
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=dtype,
            safety_checker=None,
        )
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe.load_ip_adapter(
            "h94/IP-Adapter",
            subfolder="models",
            weight_name="ip-adapter_sd15.bin",
        )
        pipe.to(device)
        if device == "cuda":
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                pass
        scale = self._settings.reference_strength if self._reference_image else 0.0
        pipe.set_ip_adapter_scale(scale)
        self._ip_pipe = pipe

    def load_model_sync(self) -> None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.stats.device = device
        self._load_turbo_sync()
        self.stats.model_loaded = True
        logger.info("Turbo model ready on %s", device)

    async def ensure_loaded(self) -> None:
        if self.stats.model_loaded:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.load_model_sync)

    async def ensure_ip_loaded(self) -> None:
        await self.ensure_loaded()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._load_ip_sync)

    def _resize(self, image: Image.Image) -> Image.Image:
        w, h = self._settings.width, self._settings.height
        if image.size != (w, h):
            return image.resize((w, h), Image.Resampling.LANCZOS)
        return image

    def process_frame_sync(self, frame: np.ndarray) -> np.ndarray:
        start = time.perf_counter()
        pil = Image.fromarray(frame[:, :, ::-1] if frame.shape[2] == 3 else frame)
        pil = self._resize(pil)

        with self._lock:
            settings = PipelineSettings(
                prompt=self._settings.prompt,
                negative_prompt=self._settings.negative_prompt,
                strength=self._settings.strength,
                guidance_scale=self._settings.guidance_scale,
                steps=self._settings.steps,
                width=self._settings.width,
                height=self._settings.height,
                reference_strength=self._settings.reference_strength,
            )
            reference = self._reference_image

        with torch.inference_mode():
            if reference is not None:
                if self._ip_pipe is None:
                    self._load_ip_sync()
                ref = reference.resize((512, 512), Image.Resampling.LANCZOS)
                self._ip_pipe.set_ip_adapter_scale(settings.reference_strength)
                result = self._ip_pipe(
                    prompt=settings.prompt,
                    negative_prompt=settings.negative_prompt,
                    image=pil,
                    ip_adapter_image=ref,
                    num_inference_steps=max(1, settings.steps),
                    strength=min(max(settings.strength, 0.05), 0.95),
                    guidance_scale=settings.guidance_scale,
                ).images[0]
            else:
                if self._turbo_pipe is None:
                    self._load_turbo_sync()
                result = self._turbo_pipe(
                    prompt=settings.prompt,
                    image=pil,
                    num_inference_steps=max(1, min(settings.steps, 4)),
                    strength=min(max(settings.strength, 0.05), 0.95),
                    guidance_scale=1.0,
                ).images[0]

        out = np.array(result.convert("RGB"))
        elapsed = time.perf_counter() - start
        self._frame_times.append(elapsed)
        if len(self._frame_times) > 30:
            self._frame_times.pop(0)
        self.stats.latency_ms = elapsed * 1000
        if self._frame_times:
            self.stats.fps = 1.0 / (sum(self._frame_times) / len(self._frame_times))
        self.stats.mode = "reference" if reference is not None else "turbo"
        return out[:, :, ::-1]

    async def process_frame(self, frame: np.ndarray) -> np.ndarray:
        if self._reference_image is not None:
            await self.ensure_ip_loaded()
        else:
            await self.ensure_loaded()
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self.process_frame_sync, frame)
        except Exception as exc:
            self.stats.last_error = str(exc)
            logger.exception("Frame processing failed")
            raise


pipeline = Vid2VidPipeline()
