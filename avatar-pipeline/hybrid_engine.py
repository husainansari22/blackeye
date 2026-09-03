"""Hybrid engine: StreamDiffusion (no ref) + InsightFace face swap (with ref).

Reference mode uses inswapper — the same approach as FaceFusion / TikTok-style
face transforms: keep camera pose & body, apply reference face identity cleanly.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("avatar.hybrid")

FRAME_SIZE = int(os.environ.get("FRAME_SIZE", "512"))
SWAP_SIZE = int(os.environ.get("SWAP_SIZE", "768"))
STREAM_ROOT = Path(__file__).resolve().parent / "StreamDiffusion"
MODELS_DIR = Path(os.environ.get("INSIGHTFACE_ROOT", Path(__file__).resolve().parent / "models"))
ENGINE_DIR = os.environ.get("STREAM_ENGINES", str(Path(__file__).resolve().parent / "engines"))
ACCEL_FILE = Path(__file__).resolve().parent / ".stream_accel"
INSWAPPER_URL = (
    "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128_fp16.onnx"
)

if STREAM_ROOT.exists():
    sys.path.insert(0, str(STREAM_ROOT))


def _download_inswapper(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    import urllib.request

    logger.info("Downloading inswapper → %s", dest)
    urllib.request.urlretrieve(INSWAPPER_URL, dest)
    return dest


class HybridEngine:
    """No ref → StreamDiffusion. With ref → InsightFace inswapper (clean identity)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stream = None
        self._face_app = None
        self._swapper = None
        self._source_face: Any = None
        self._reference: Optional[Image.Image] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = "photorealistic portrait, sharp focus, natural skin"
        self.negative = "blurry, distorted, deformed, ugly, low quality"
        self.strength = 0.45
        self.reference_strength = 1.0
        self.steps = 2
        self.mode = "hybrid"
        self.acceleration = "streamdiffusion|inswapper"
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
        if accel == "tensorrt" and not any(Path(ENGINE_DIR).rglob("unet.engine")):
            accel = "none"
        logger.info("Loading StreamDiffusion SD-Turbo (%spx, %s)...", FRAME_SIZE, accel)
        stream = StreamDiffusionWrapper(
            model_id_or_path="stabilityai/sd-turbo",
            t_index_list=[45],
            frame_buffer_size=1,
            width=FRAME_SIZE,
            height=FRAME_SIZE,
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
        ACCEL_FILE.write_text(accel)
        logger.info("StreamDiffusion ready")

    def _load_faceswap(self) -> None:
        if self._face_app is not None:
            return
        import insightface
        from insightface.app import FaceAnalysis

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("INSIGHTFACE_HOME", str(MODELS_DIR))
        logger.info("Loading InsightFace buffalo_l + inswapper...")
        app = FaceAnalysis(name="buffalo_l", root=str(MODELS_DIR))
        app.prepare(ctx_id=0 if self._device == "cuda" else -1, det_size=(640, 640))
        path = _download_inswapper(MODELS_DIR / "inswapper_128_fp16.onnx")
        swapper = insightface.model_zoo.get_model(
            str(path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        self._face_app = app
        self._swapper = swapper
        logger.info("Face swap ready")

    def load(self) -> None:
        if self.ready:
            return
        try:
            self._load_stream()
        except Exception as exc:
            logger.warning("StreamDiffusion unavailable: %s", exc)
        try:
            self._load_faceswap()
        except Exception as exc:
            logger.warning("Face swap unavailable: %s", exc)
        self.ready = True

    def _pick_largest(self, faces: list) -> Any | None:
        if not faces:
            return None
        return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self._source_face = None
                self.mode = "streamdiffusion"
                return
            if self._face_app is None:
                self._load_faceswap()
            rgb = np.array(image.convert("RGB"))
            # InsightFace expects BGR
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            faces = self._face_app.get(bgr)
            face = self._pick_largest(faces)
            if face is None:
                raise ValueError("No face found in reference — use a clear front-facing photo")
            self._reference = image.convert("RGB")
            self._source_face = face
            self.mode = "inswapper+ref"
            logger.info("Reference face locked")

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

    def _swap_face(self, rgb: np.ndarray) -> np.ndarray:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        h, w = bgr.shape[:2]
        work = bgr
        scale = 1.0
        if max(h, w) > SWAP_SIZE:
            scale = SWAP_SIZE / max(h, w)
            work = cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        faces = self._face_app.get(work)
        target = self._pick_largest(faces)
        if target is None:
            return rgb
        out = self._swapper.get(work.copy(), target, self._source_face, paste_back=True)
        if scale != 1.0:
            out = cv2.resize(out, (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()
        if float(rgb.mean()) < 12:
            raise ValueError("Camera frame is black — pick another camera")

        t0 = time.perf_counter()
        with self._lock:
            has_ref = self._source_face is not None

        try:
            if has_ref:
                if self._swapper is None:
                    self._load_faceswap()
                out_rgb = self._swap_face(rgb)
                self.mode = "inswapper+ref"
                self.acceleration = "inswapper-fp16"
            else:
                if self._stream is None:
                    self._load_stream()
                pil = Image.fromarray(rgb).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
                with torch.inference_mode():
                    tensor = self._stream.preprocess_image(pil)
                    out = self._stream(image=tensor)
                    if isinstance(out, list):
                        out = out[0]
                out_rgb = np.array(out.convert("RGB"))
                self.mode = "streamdiffusion"
                self.acceleration = "streamdiffusion"
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
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()
