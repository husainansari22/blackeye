"""Real-time Video-to-Video diffusion pipeline."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class PipelineSettings:
    prompt: str = "cyberpunk neon city portrait, cinematic lighting, highly detailed"
    negative_prompt: str = "blurry, low quality, distorted, ugly, watermark"
    strength: float = 0.45
    guidance_scale: float = 1.0
    steps: int = 2
    width: int = 512
    height: int = 512


@dataclass
class PipelineStats:
    fps: float = 0.0
    latency_ms: float = 0.0
    model_loaded: bool = False
    device: str = "cpu"
    last_error: str | None = None


class Vid2VidPipeline:
    """Frame-by-frame img2img using SD-Turbo for low-latency transformation."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipe = None
        self._settings = PipelineSettings()
        self.stats = PipelineStats()
        self._frame_times: list[float] = []
        self._load_task: asyncio.Task | None = None

    @property
    def settings(self) -> PipelineSettings:
        return self._settings

    def update_settings(self, **kwargs: Any) -> PipelineSettings:
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._settings, key) and value is not None:
                    setattr(self._settings, key, value)
            return self._settings

    def load_model_sync(self) -> None:
        if self._pipe is not None:
            return

        from diffusers import AutoPipelineForImage2Image

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        logger.info("Loading SD-Turbo img2img on %s...", device)
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sd-turbo",
            torch_dtype=dtype,
            variant="fp16" if device == "cuda" else None,
        )
        pipe.to(device)
        if device == "cuda":
            pipe.enable_model_cpu_offload = False
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                pass

        self._pipe = pipe
        self.stats.model_loaded = True
        self.stats.device = device
        logger.info("Model loaded on %s", device)

    async def ensure_loaded(self) -> None:
        if self._pipe is not None:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.load_model_sync)

    def _resize(self, image: Image.Image) -> Image.Image:
        w, h = self._settings.width, self._settings.height
        if image.size != (w, h):
            return image.resize((w, h), Image.Resampling.LANCZOS)
        return image

    def process_frame_sync(self, frame: np.ndarray) -> np.ndarray:
        if self._pipe is None:
            raise RuntimeError("Model not loaded")

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
            )

        with torch.inference_mode():
            result = self._pipe(
                prompt=settings.prompt,
                image=pil,
                num_inference_steps=max(1, settings.steps),
                strength=min(max(settings.strength, 0.05), 0.95),
                guidance_scale=settings.guidance_scale,
            ).images[0]

        out = np.array(result.convert("RGB"))
        elapsed = time.perf_counter() - start
        self._frame_times.append(elapsed)
        if len(self._frame_times) > 30:
            self._frame_times.pop(0)
        self.stats.latency_ms = elapsed * 1000
        if self._frame_times:
            self.stats.fps = 1.0 / (sum(self._frame_times) / len(self._frame_times))
        return out[:, :, ::-1]

    async def process_frame(self, frame: np.ndarray) -> np.ndarray:
        await self.ensure_loaded()
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self.process_frame_sync, frame)
        except Exception as exc:
            self.stats.last_error = str(exc)
            logger.exception("Frame processing failed")
            raise


pipeline = Vid2VidPipeline()
