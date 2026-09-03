"""Real-time face swap via InsightFace inswapper — 25-30+ fps on RTX 4090."""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("avatar.faceswap")

FRAME_SIZE = int(os.environ.get("FRAME_SIZE", "512"))
SWAP_SIZE = int(os.environ.get("SWAP_SIZE", "512"))
MODELS_DIR = Path(os.environ.get("INSIGHTFACE_ROOT", Path(__file__).resolve().parent / "models"))
INSWAPPER_URL = (
    "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128_fp16.onnx"
)


def _download_inswapper(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    import urllib.request

    logger.info("Downloading inswapper model → %s", dest)
    urllib.request.urlretrieve(INSWAPPER_URL, dest)
    return dest


class FaceSwapEngine:
    """Webcam target + reference photo source → clean face swap at 25-30+ fps."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._face_app = None
        self._swapper = None
        self._source_face: Any = None
        self._reference: Optional[Image.Image] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self.last_error: Optional[str] = None
        self._times: list[float] = []
        self.prompt = "face swap"
        self.negative = ""
        self.steps = 1
        self.strength = 1.0
        self.guidance = 0.0
        self.reference_strength = 1.0
        self.mode = "faceswap"
        self.acceleration = "inswapper-fp16"
        self.enhance = os.environ.get("FACE_ENHANCE", "0") == "1"

    def _load(self) -> None:
        if self._face_app is not None:
            return

        import insightface
        from insightface.app import FaceAnalysis

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("INSIGHTFACE_HOME", str(MODELS_DIR))

        logger.info("Loading InsightFace buffalo_l + inswapper (%spx)...", SWAP_SIZE)
        app = FaceAnalysis(name="buffalo_l", root=str(MODELS_DIR))
        app.prepare(ctx_id=0, det_size=(480, 480))

        swapper_path = _download_inswapper(MODELS_DIR / "inswapper_128_fp16.onnx")
        swapper = insightface.model_zoo.get_model(str(swapper_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])

        self._face_app = app
        self._swapper = swapper
        logger.info("Face swap engine ready")

    def load(self) -> None:
        if self.ready:
            return
        self._load()
        self.ready = True

    def _pick_largest(self, faces: list) -> Any | None:
        if not faces:
            return None
        return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    def _extract_source_face(self, rgb: np.ndarray) -> Any:
        # InsightFace expects BGR
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        faces = self._face_app.get(bgr)
        face = self._pick_largest(faces)
        if face is None:
            raise ValueError("No face found in reference photo — use a clear front-facing portrait")
        return face

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            if image is None:
                self._reference = None
                self._source_face = None
                self.mode = "faceswap"
                return
            if self._face_app is None:
                self._load()
            rgb = np.array(image.convert("RGB"))
            self._reference = image.convert("RGB")
            self._source_face = self._extract_source_face(rgb)
            self.mode = "faceswap+ref"
            logger.info("Reference face locked from uploaded photo")

    def _swap(self, frame_bgr: np.ndarray) -> np.ndarray:
        if self._source_face is None:
            raise ValueError("Upload a reference photo first")

        h, w = frame_bgr.shape[:2]
        work = frame_bgr
        scale = 1.0
        max_side = max(h, w)
        if max_side > SWAP_SIZE:
            scale = SWAP_SIZE / max_side
            work = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        faces = self._face_app.get(work)
        target = self._pick_largest(faces)
        if target is None:
            if scale != 1.0:
                work = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                faces = self._face_app.get(cv2.resize(frame_bgr, (640, 640)))
            return frame_bgr

        result = work.copy()
        result = self._swapper.get(result, target, self._source_face, paste_back=True)

        if scale != 1.0:
            result = cv2.resize(result, (w, h), interpolation=cv2.INTER_LINEAR)

        return result

    def process_rgb(self, rgb: np.ndarray) -> np.ndarray:
        if not self.ready:
            self.load()

        if float(rgb.mean()) < 15:
            raise ValueError("Camera frame is black — select a working camera")

        t0 = time.perf_counter()
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

        with self._lock:
            if self._source_face is None:
                raise ValueError("Upload a reference photo, then tap Apply Prompt")

        try:
            out_bgr = self._swap(bgr)
            self.last_error = None
        except Exception as exc:
            self.last_error = str(exc)
            raise

        out_rgb = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB)
        elapsed = time.perf_counter() - t0
        self.last_ms = elapsed * 1000
        self._times.append(elapsed)
        if len(self._times) > 120:
            self._times.pop(0)
        self.fps = 1.0 / (sum(self._times) / len(self._times)) if self._times else 0.0
        self.mode = "faceswap+ref"
        self.acceleration = "inswapper-fp16"
        return out_rgb

    def process_jpeg(self, jpeg_bytes: bytes) -> bytes:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Invalid JPEG")
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        out_rgb = self.process_rgb(rgb)
        out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 94])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()

    def update_prompt(self, prompt: str, negative: str = "") -> None:
        self.prompt = prompt
