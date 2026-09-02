"""
app.py — Real-time full-body avatar transformation server
FastAPI + ControlNet OpenPose + IP-Adapter reference styling
Bind: 0.0.0.0:80  |  Public: https://50.35.188.73:20001
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

import cv2
import numpy as np
import torch
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pathlib import Path

from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("avatar")

APP_PASSWORD = os.environ.get("APP_PASSWORD", "@535846.oZ")
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE.startswith("cuda") else torch.float32
FRAME_SIZE = int(os.environ.get("FRAME_SIZE", "384"))

if DEVICE.startswith("cuda"):
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
_tokens: set[str] = set()
_token_lock = threading.Lock()


def _verify_password(password: str) -> bool:
    return secrets.compare_digest(password, APP_PASSWORD)


def _issue_token() -> str:
    token = secrets.token_urlsafe(32)
    with _token_lock:
        _tokens.add(token)
    return token


def _check_token(token: Optional[str]) -> bool:
    if not token:
        return False
    with _token_lock:
        return token in _tokens


def require_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else None
    if not token:
        token = request.headers.get("X-Session-Token")
    if not token:
        token = request.query_params.get("token")
    if not _check_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token



def _color_transfer(ref_rgb: np.ndarray, src_rgb: np.ndarray, amount: float = 0.55) -> np.ndarray:
    """Fast LAB color transfer — applies reference palette without slow IP-Adapter."""
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


class AvatarPipeline:
    """LCM-LoRA img2img for speed; optional reference color transfer."""

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
        self.guidance = 1.0
        self.strength = 0.55
        self.color_amount = 0.6

    def load(self) -> None:
        if self.ready:
            return
        from diffusers import LCMScheduler, StableDiffusionImg2ImgPipeline

        logger.info("Loading LCM-LoRA img2img on %s (%spx)...", DEVICE, FRAME_SIZE)
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=DTYPE,
            safety_checker=None,
        )
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
        pipe.fuse_lora()
        if DEVICE.startswith("cuda"):
            pipe.to(DEVICE)
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                logger.info("xformers unavailable, using default attention")
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        self.ready = True
        logger.info("LCM pipeline ready on %s", DEVICE)

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self._reference_rgb = None
                return
            img = image.convert("RGB")
            self._reference = img
            self._reference_rgb = np.array(img.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS))

    def process_jpeg(self, jpeg_bytes: bytes) -> bytes:
        if not self.ready:
            self.load()

        t0 = time.perf_counter()
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Invalid JPEG")

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)

        with self._lock:
            prompt = self.prompt
            negative = self.negative
            steps = max(2, min(self.steps, 6))
            guidance = self.guidance
            strength = self.strength
            color_amount = self.color_amount
            ref_rgb = self._reference_rgb.copy() if self._reference_rgb is not None else None

        try:
            with torch.inference_mode():
                result = self._pipe(
                    prompt=prompt,
                    negative_prompt=negative,
                    image=pil,
                    num_inference_steps=steps,
                    strength=min(max(strength, 0.2), 0.85),
                    guidance_scale=guidance,
                ).images[0]
            out_rgb = np.array(result)
            if ref_rgb is not None and color_amount > 0:
                out_rgb = _color_transfer(ref_rgb, out_rgb, color_amount)
            self.last_error = None
        except Exception as exc:
            self.last_error = str(exc)
            raise

        out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not ok:
            raise RuntimeError("JPEG encode failed")

        elapsed = time.perf_counter() - t0
        self.last_ms = elapsed * 1000
        self._times.append(elapsed)
        if len(self._times) > 60:
            self._times.pop(0)
        self.fps = 1.0 / (sum(self._times) / len(self._times)) if self._times else 0.0
        return buf.tobytes()


USE_REALTIME = os.environ.get("USE_REALTIME", "0") == "1"
USE_STREAM = os.environ.get("USE_STREAM", "1") == "1"

if USE_REALTIME:
    from realtime_engine import RealtimeEngine

    pipeline = RealtimeEngine()
    logger.info("Using local SD-Turbo realtime engine (Decart-style, no API)")
elif USE_STREAM:
    try:
        from stream_engine import StreamAvatarEngine

        pipeline = StreamAvatarEngine()
        logger.info("Using StreamDiffusion SD-Turbo")
    except Exception as exc:
        logger.warning("StreamDiffusion unavailable (%s), falling back to LCM", exc)
        pipeline = AvatarPipeline()
else:
    pipeline = AvatarPipeline()


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, pipeline.load)
    yield


app = FastAPI(title="Avatar Stream", lifespan=lifespan)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.post("/api/login")
async def login(body: dict):
    password = body.get("password", "")
    if not _verify_password(password):
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"token": _issue_token()}


@app.get("/api/status")
async def status(token: str = Depends(require_token)):
    has_ref = getattr(pipeline, "_reference_rgb", None) is not None or getattr(
        pipeline, "_reference", None
    ) is not None
    mode = getattr(pipeline, "mode", "lcm")
    if has_ref and mode.startswith("stream"):
        mode = "stream+ref"
    elif has_ref:
        mode = f"{mode}+ref"
    return {
        "ready": pipeline.ready,
        "device": DEVICE,
        "fps": round(pipeline.fps, 2),
        "latency_ms": round(pipeline.last_ms, 1),
        "has_reference": has_ref,
        "mode": mode,
        "frame_size": FRAME_SIZE,
        "acceleration": getattr(pipeline, "acceleration", "lcm"),
        "last_error": pipeline.last_error,
    }


@app.post("/api/reference")
async def upload_reference(
    request: Request,
    file: UploadFile = File(...),
    token: str = Depends(require_token),
):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Max 10 MB")
    arr = np.frombuffer(data, np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pipeline.set_reference(Image.fromarray(rgb))
    return {"ok": True}


@app.delete("/api/reference")
async def clear_reference(token: str = Depends(require_token)):
    pipeline.set_reference(None)
    return {"ok": True}


@app.post("/api/settings")
async def update_settings(body: dict, token: str = Depends(require_token)):
    for key in ("prompt", "negative", "steps", "guidance", "strength", "reference_strength"):
        if key in body and body[key] is not None:
            attr = "negative" if key == "negative" else key
            setattr(pipeline, attr, body[key])
    if hasattr(pipeline, "update_prompt") and "prompt" in body:
        pipeline.update_prompt(pipeline.prompt, pipeline.negative)
    return {"ok": True}


@app.post("/process-frame")
async def process_frame(request: Request, token: str = Depends(require_token)):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty frame")
    loop = asyncio.get_event_loop()
    try:
        out = await loop.run_in_executor(None, pipeline.process_jpeg, body)
    except Exception as exc:
        logger.exception("Frame error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(content=out, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/health")
async def health():
    return {"status": "ok", "ready": pipeline.ready, "device": DEVICE}


# ---------------------------------------------------------------------------
# Web UI (bookfua-style · GPU-only)
# ---------------------------------------------------------------------------
_UI_PATH = Path(__file__).resolve().parent / "web_ui.html"
HTML_PAGE = _UI_PATH.read_text(encoding="utf-8") if _UI_PATH.exists() else "<h1>web_ui.html missing</h1>"


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(HTML_PAGE)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=80, workers=1, log_level="info")
