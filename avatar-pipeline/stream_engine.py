"""StreamDiffusion + TensorRT real-time img2img (SD-Turbo, 60+ fps target)."""

from __future__ import annotations

import gc
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.stream")

STREAM_ROOT = Path(__file__).resolve().parent / "StreamDiffusion"
if STREAM_ROOT.exists():
    sys.path.insert(0, str(STREAM_ROOT))

FRAME_SIZE = int(os.environ.get("FRAME_SIZE", "384"))
ENGINE_DIR = os.environ.get("STREAM_ENGINES", str(Path(__file__).resolve().parent / "engines"))
ACCELERATION = os.environ.get("STREAM_ACCEL", "tensorrt")  # tensorrt | xformers | none
ACCEL_FILE = Path(__file__).resolve().parent / ".stream_accel"


def _color_transfer(ref_rgb: np.ndarray, src_rgb: np.ndarray, amount: float = 0.55) -> np.ndarray:
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


def _trt_ready() -> bool:
    """True only if compiled TensorRT engine binaries exist."""
    root = Path(ENGINE_DIR)
    if not root.exists():
        return False
    for p in root.rglob("*"):
        if p.is_file() and p.name == "unet.engine" and p.stat().st_size > 1_000_000:
            return True
    return False


def _accel_candidates(preferred: str) -> list[str]:
    order: list[str] = []
    for accel in (preferred, ACCELERATION, "none"):
        if accel == "tensorrt" and not _trt_ready():
            continue
        if accel == "xformers":
            continue  # broken on Blackwell sm_120
        if accel and accel not in order:
            order.append(accel)
    if "none" not in order:
        order.append("none")
    return order


class StreamAvatarEngine:
    """SD-Turbo via StreamDiffusion — TensorRT when available."""

    def __init__(self) -> None:
        self._lock = __import__("threading").Lock()
        self._stream = None
        self._reference_rgb: Optional[np.ndarray] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = "sharp portrait photo, detailed face, cinematic lighting, high quality"
        self.negative = "blurry, low quality, distorted, deformed, ugly"
        self.strength = 0.45
        self.color_amount = 0.55
        self.mode = "stream-turbo"
        accel = ACCELERATION
        if ACCEL_FILE.exists():
            accel = ACCEL_FILE.read_text().strip() or accel
        self.acceleration = accel

    def _create_stream(self, accel: str):
        from utils.wrapper import StreamDiffusionWrapper  # StreamDiffusion repo

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        return StreamDiffusionWrapper(
            model_id_or_path="stabilityai/sd-turbo",
            t_index_list=[45],
            frame_buffer_size=1,
            width=FRAME_SIZE,
            height=FRAME_SIZE,
            warmup=10,
            acceleration=accel,
            mode="img2img",
            use_denoising_batch=True,
            cfg_type="none",
            use_lcm_lora=False,
            use_tiny_vae=True,
            output_type="pil",
            engine_dir=ENGINE_DIR,
            device=device,
            dtype=dtype,
        )

    def load(self) -> None:
        if self.ready:
            return

        preferred = self.acceleration
        last_exc: Optional[Exception] = None

        for accel in _accel_candidates(preferred):
            try:
                logger.info(
                    "Loading StreamDiffusion SD-Turbo (%spx, accel=%s)...",
                    FRAME_SIZE,
                    accel,
                )
                stream = self._create_stream(accel)
                stream.prepare(
                    prompt=self.prompt,
                    negative_prompt=self.negative,
                    num_inference_steps=50,
                    guidance_scale=1.0,
                    delta=0.5,
                )
                self._stream = stream
                # Wrapper may silently fall back when TRT/xformers fail
                actual = accel
                if accel == "tensorrt" and not _trt_ready():
                    actual = "none"
                self.acceleration = actual
                self.mode = f"stream-turbo ({actual})"
                self.ready = True
                ACCEL_FILE.write_text(actual)
                logger.info("StreamDiffusion ready (accel=%s)", actual)
                return
            except Exception as exc:
                last_exc = exc
                logger.warning("StreamDiffusion accel=%s failed: %s", accel, exc)
                self._stream = None
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        raise RuntimeError(f"StreamDiffusion failed for all accelerations: {last_exc}")

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference_rgb = None
                return
            self._reference_rgb = np.array(
                image.convert("RGB").resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
            )

    def update_prompt(self, prompt: str, negative: str = "") -> None:
        with self._lock:
            self.prompt = prompt
            self.negative = negative
        if self._stream:
            self._stream.prepare(
                prompt=prompt,
                negative_prompt=negative,
                num_inference_steps=50,
                guidance_scale=1.0,
                delta=0.5,
            )

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()

        t0 = time.perf_counter()
        pil = Image.fromarray(rgb).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)

        with self._lock:
            ref_rgb = self._reference_rgb.copy() if self._reference_rgb is not None else None
            color_amount = self.color_amount

        try:
            tensor = self._stream.preprocess_image(pil)
            out = self._stream(image=tensor)
            if isinstance(out, list):
                out = out[0]
            out_rgb = np.array(out.convert("RGB"))
            if ref_rgb is not None and color_amount > 0:
                out_rgb = _color_transfer(ref_rgb, out_rgb, color_amount)
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
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()
