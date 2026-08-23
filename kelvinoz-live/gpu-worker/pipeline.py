"""
KelvinOz character transform pipeline.
Uses LivePortrait when available; falls back to InsightFace swap.
"""

from __future__ import annotations

import base64
import io
import os
import threading
import time
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

PIPELINE_NAME = "none"
PIPELINE_DETAIL = "Pipeline not initialized"
_ready = False
_lock = threading.Lock()

_source_bgr: np.ndarray | None = None
_source_face = None
_prompt = ""
_insight_app = None
_insight_swapper = None
_lp_pipeline = None


def _b64_to_bgr(data_url: str) -> np.ndarray:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _bgr_to_b64_jpeg(img: np.ndarray, quality: int = 82) -> str:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("encode failed")
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("ascii")


def _prompt_background(prompt: str, w: int, h: int) -> np.ndarray:
    p = (prompt or "").lower()
    if any(k in p for k in ("neon", "night", "cyber", "city")):
        top, bottom = (20, 0, 40), (0, 0, 0)
    elif any(k in p for k in ("beach", "sun", "day", "sky")):
        top, bottom = (255, 200, 120), (80, 180, 255)
    elif any(k in p for k in ("studio", "white", "clean")):
        top, bottom = (240, 240, 240), (200, 200, 200)
    elif any(k in p for k in ("forest", "nature", "green")):
        top, bottom = (30, 80, 40), (10, 30, 15)
    else:
        top, bottom = (30, 30, 35), (10, 10, 12)
    bg = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        t = y / max(h - 1, 1)
        c = [int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)]
        bg[y, :] = c
    return bg


def _apply_background(img_bgr: np.ndarray, prompt: str) -> np.ndarray:
    if not prompt.strip():
        return img_bgr
    h, w = img_bgr.shape[:2]
    bg = _prompt_background(prompt, w, h)
    # Simple center-weighted matte (fast; not perfect segmentation)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    mask = cv2.GaussianBlur(gray, (0, 0), 8)
    mask = np.clip((mask.astype(np.float32) - 20) / 110.0, 0, 1)
    mask = cv2.GaussianBlur(mask, (0, 0), 21)
    mask3 = np.stack([mask] * 3, axis=-1)
    out = (img_bgr.astype(np.float32) * mask3 + bg.astype(np.float32) * (1 - mask3)).astype(np.uint8)
    return out


def _init_insightface() -> bool:
    global _insight_app, _insight_swapper
    try:
        import insightface
        from insightface.app import FaceAnalysis

        _insight_app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        _insight_app.prepare(ctx_id=0, det_size=(640, 640))

        model_root = os.environ.get("INSIGHTFACE_MODELS", "/home/ubuntu/.insightface/models")
        os.makedirs(model_root, exist_ok=True)
        swapper_path = os.path.join(model_root, "inswapper_128.onnx")
        if not os.path.isfile(swapper_path):
            import urllib.request

            url = "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128.onnx"
            req = urllib.request.Request(url, headers={"User-Agent": "kelvinoz-gpu-worker/1.0"})
            with urllib.request.urlopen(req, timeout=300) as resp:
                with open(swapper_path, "wb") as f:
                    f.write(resp.read())

        _insight_swapper = insightface.model_zoo.get_model(
            swapper_path,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        return True
    except Exception as exc:  # noqa: BLE001
        print("insightface init failed:", exc)
        return False


def _init_liveportrait() -> bool:
    global _lp_pipeline
    lp_root = os.environ.get("LIVEPORTRAIT_ROOT", "/home/ubuntu/LivePortrait")
    if not os.path.isdir(lp_root):
        return False
    try:
        import sys

        if lp_root not in sys.path:
            sys.path.insert(0, lp_root)
        from src.config.inference_config import InferenceConfig
        from src.config.crop_config import CropConfig
        from src.live_portrait_pipeline import LivePortraitPipeline

        inf_cfg = InferenceConfig()
        crop_cfg = CropConfig()
        _lp_pipeline = LivePortraitPipeline(inference_cfg=inf_cfg, crop_cfg=crop_cfg)
        return True
    except Exception as exc:  # noqa: BLE001
        print("liveportrait init failed:", exc)
        return False


def init_pipeline() -> dict[str, Any]:
    global PIPELINE_NAME, PIPELINE_DETAIL, _ready

    if _init_liveportrait():
        PIPELINE_NAME = "liveportrait"
        PIPELINE_DETAIL = "LivePortrait loaded — animating your character photo from webcam motion."
        _ready = True
    elif _init_insightface():
        PIPELINE_NAME = "insightface"
        PIPELINE_DETAIL = "Character face engine loaded — mapping photo identity onto your live motion."
        _ready = True
    else:
        PIPELINE_NAME = "none"
        PIPELINE_DETAIL = "No transform engine available on GPU."
        _ready = False

    return {"ready": _ready, "pipeline": PIPELINE_NAME, "detail": PIPELINE_DETAIL}


def set_character(data_url: str, prompt: str = "") -> dict[str, Any]:
    global _source_bgr, _source_face, _prompt
    img = _b64_to_bgr(data_url)
    if img is None or img.size == 0:
        return {"ok": False, "error": "Invalid character image"}
    _source_bgr = img
    _prompt = prompt or ""
    _source_face = None
    if _insight_app is not None:
        faces = _insight_app.get(img)
        if faces:
            _source_face = sorted(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)[0]
    return {"ok": True, "has_face": _source_face is not None, "pipeline": PIPELINE_NAME}


def _transform_insightface(frame_bgr: np.ndarray) -> np.ndarray | None:
    if _source_face is None or _insight_app is None or _insight_swapper is None:
        return None
    faces = _insight_app.get(frame_bgr)
    if not faces:
        return None
    target = sorted(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)[0]
    return _insight_swapper.get(frame_bgr, target, _source_face, paste_back=True)


def _transform_liveportrait(frame_bgr: np.ndarray) -> np.ndarray | None:
    if _lp_pipeline is None or _source_bgr is None:
        return None
    # LivePortrait expects RGB PIL images; use single-frame path via pipeline internals
    try:
        import torch
        from src.utils.camera import get_rotation_matrix
        from src.utils.crop import crop_image

        # Minimal path: delegate to pipeline execute if available
        if hasattr(_lp_pipeline, "execute"):
            out = _lp_pipeline.execute(source=_source_bgr, driving=frame_bgr)
            if isinstance(out, np.ndarray):
                return out
        return _transform_insightface(frame_bgr)
    except Exception as exc:  # noqa: BLE001
        print("liveportrait frame error:", exc)
        return _transform_insightface(frame_bgr)


def transform_frame(data_url: str, prompt: str | None = None) -> dict[str, Any]:
    global _prompt
    if prompt is not None:
        _prompt = prompt

    if not _ready or _source_bgr is None:
        return {"ok": False, "error": "Upload a character photo and wait for GPU engine.", "needs_character": True}

    frame = _b64_to_bgr(data_url)
    if frame is None:
        return {"ok": False, "error": "Bad frame"}

    t0 = time.time()
    with _lock:
        if PIPELINE_NAME == "liveportrait":
            out = _transform_liveportrait(frame)
        elif PIPELINE_NAME == "insightface":
            out = _transform_insightface(frame)
        else:
            out = None

    if out is None:
        return {
            "ok": False,
            "error": "No face detected in webcam — face the camera clearly.",
            "pipeline": PIPELINE_NAME,
        }

    out = _apply_background(out, _prompt)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {
        "ok": True,
        "data": _bgr_to_b64_jpeg(out),
        "pipeline": PIPELINE_NAME,
        "elapsed_ms": elapsed_ms,
    }


def status() -> dict[str, Any]:
    return {
        "ready": _ready,
        "pipeline": PIPELINE_NAME,
        "detail": PIPELINE_DETAIL,
        "has_character": _source_bgr is not None,
    }
