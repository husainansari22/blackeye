"""FastAPI server: WebSocket + WebRTC streaming, OBS output, password auth."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import cv2
import numpy as np
from PIL import Image
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaRelay
from av import VideoFrame
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.websockets import WebSocketState

from app.auth import create_access_token, obs_url, request_base_url, verify_password, verify_token
from app.pipeline import PipelineSettings, pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

PUBLIC_BASE_URL = os.environ.get("VID2VID_BASE_URL", "http://50.35.188.73:20001")

latest_output_jpeg: bytes | None = None
latest_output_lock = asyncio.Lock()
active_sessions: set[str] = set()
relay = MediaRelay()
pcs: set[RTCPeerConnection] = set()


class LoginRequest(BaseModel):
    password: str


class SettingsUpdate(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = None
    strength: float | None = Field(default=None, ge=0.05, le=0.95)
    guidance_scale: float | None = Field(default=None, ge=0.0, le=20.0)
    steps: int | None = Field(default=None, ge=1, le=8)
    width: int | None = Field(default=None, ge=256, le=1024)
    height: int | None = Field(default=None, ge=256, le=1024)
    reference_strength: float | None = Field(default=None, ge=0.0, le=1.0)


class OfferRequest(BaseModel):
    sdp: str
    type: str
    token: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def _load():
        try:
            await pipeline.ensure_loaded()
            if pipeline.stats.has_reference:
                await pipeline.ensure_ip_loaded()
            logger.info("Models ready on %s", pipeline.stats.device)
        except Exception as exc:
            pipeline.stats.last_error = str(exc)
            logger.exception("Model load failed at startup")

    asyncio.create_task(_load())
    yield
    coros = [pc.close() for pc in pcs]
    if coros:
        await asyncio.gather(*coros, return_exceptions=True)
    pcs.clear()


app = FastAPI(title="Kelvin Vid2Vid Stream", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
templates = Jinja2Templates(directory=TEMPLATES_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def require_token(token: str | None = Query(default=None)) -> str:
    if not token or not verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return token


async def set_latest_output(frame_bgr: np.ndarray, quality: int = 85) -> None:
    global latest_output_jpeg
    ok, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return
    async with latest_output_lock:
        latest_output_jpeg = buf.tobytes()


async def decode_jpeg(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Invalid JPEG frame")
    return frame


@app.get("/", response_class=HTMLResponse)
async def index(request: Request, token: str | None = None):
    if not token or not verify_token(token):
        return templates.TemplateResponse("login.html", {"request": request})
    base = request_base_url(request)
    return templates.TemplateResponse(
        "studio.html",
        {
            "request": request,
            "token": token,
            "obs_url": obs_url(base, token),
        },
    )


@app.get("/obs", response_class=HTMLResponse)
async def obs_page(request: Request, token: str = Depends(require_token)):
    return templates.TemplateResponse(
        "obs.html",
        {"request": request, "token": token},
    )


@app.post("/api/login")
async def login(body: LoginRequest, request: Request):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token()
    base = request_base_url(request)
    return {
        "token": token,
        "obs_url": obs_url(base, token),
        "redirect": f"/?token={token}",
    }


@app.get("/api/status")
async def status(token: str = Depends(require_token)):
    return {
        "model_loaded": pipeline.stats.model_loaded,
        "device": pipeline.stats.device,
        "fps": round(pipeline.stats.fps, 2),
        "latency_ms": round(pipeline.stats.latency_ms, 1),
        "active_sessions": len(active_sessions),
        "settings": pipeline.settings.__dict__,
        "last_error": pipeline.stats.last_error,
        "has_reference": pipeline.stats.has_reference,
        "mode": pipeline.stats.mode,
    }


@app.post("/api/settings")
async def update_settings(body: SettingsUpdate, token: str = Depends(require_token)):
    updated = pipeline.update_settings(**body.model_dump(exclude_none=True))
    return updated.__dict__


@app.post("/api/reference-image")
async def upload_reference_image(
    token: str = Depends(require_token),
    file: UploadFile = File(...),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WebP image")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")

    arr = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not read image file")

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb)
    pipeline.set_reference_image(image)
    asyncio.create_task(pipeline.ensure_ip_loaded())

    return {
        "ok": True,
        "has_reference": True,
        "mode": "reference",
        "message": "Reference photo saved. Start streaming to transform toward this look.",
    }


@app.get("/api/reference-image")
async def get_reference_image(token: str = Depends(require_token)):
    preview = pipeline.get_reference_preview()
    if not preview:
        raise HTTPException(status_code=404, detail="No reference photo uploaded")
    return Response(content=preview, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.delete("/api/reference-image")
async def clear_reference_image(token: str = Depends(require_token)):
    pipeline.set_reference_image(None)
    return {"ok": True, "has_reference": False, "mode": "turbo"}


@app.get("/api/output.jpg")
async def output_jpeg(token: str = Depends(require_token)):
    async with latest_output_lock:
        data = latest_output_jpeg
    if not data:
        raise HTTPException(status_code=404, detail="No output frame yet")
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/obs/mjpeg")
async def obs_mjpeg(token: str = Depends(require_token)):
    boundary = "frame"

    async def generate():
        while True:
            async with latest_output_lock:
                data = latest_output_jpeg
            if data:
                yield (
                    f"--{boundary}\r\n"
                    f"Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(data)}\r\n\r\n"
                ).encode() + data + b"\r\n"
            await asyncio.sleep(0.033)

    return StreamingResponse(
        generate(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
        headers={"Cache-Control": "no-store"},
    )


@app.websocket("/ws/stream")
async def websocket_stream(ws: WebSocket, token: str = Query(...)):
    if not verify_token(token):
        await ws.close(code=4401)
        return

    await ws.accept()
    session_id = f"ws-{id(ws)}"
    active_sessions.add(session_id)
    logger.info("WebSocket session started: %s", session_id)

    try:
        while ws.client_state == WebSocketState.CONNECTED:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                frame = await decode_jpeg(message["bytes"])
            elif "text" in message and message["text"]:
                payload = json.loads(message["text"])
                if payload.get("type") == "settings":
                    pipeline.update_settings(**payload.get("data", {}))
                    await ws.send_json({"type": "settings_ack", "data": pipeline.settings.__dict__})
                    continue
                if payload.get("type") == "ping":
                    await ws.send_json({"type": "pong"})
                    continue
                if payload.get("type") == "frame":
                    raw = base64.b64decode(payload["data"])
                    frame = await decode_jpeg(raw)
                else:
                    continue
            else:
                continue

            processed = await pipeline.process_frame(frame)
            await set_latest_output(processed)
            ok, buf = cv2.imencode(".jpg", processed, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok:
                await ws.send_bytes(buf.tobytes())
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WebSocket error")
        if ws.client_state == WebSocketState.CONNECTED:
            await ws.send_json({"type": "error", "message": str(exc)})
    finally:
        active_sessions.discard(session_id)
        logger.info("WebSocket session ended: %s", session_id)


class ProcessedVideoTrack(VideoStreamTrack):
    kind = "video"

    def __init__(self, track: VideoStreamTrack):
        super().__init__()
        self.track = track
        self._timestamp = 0

    async def recv(self) -> VideoFrame:
        frame = await self.track.recv()
        img = frame.to_ndarray(format="bgr24")
        processed = await pipeline.process_frame(img)
        await set_latest_output(processed)
        new_frame = VideoFrame.from_ndarray(processed, format="bgr24")
        self._timestamp += 1
        new_frame.pts = self._timestamp
        new_frame.time_base = frame.time_base
        return new_frame


@app.post("/api/webrtc/offer")
async def webrtc_offer(body: OfferRequest):
    if not verify_token(body.token):
        raise HTTPException(status_code=401, detail="Invalid token")

    offer = RTCSessionDescription(sdp=body.sdp, type=body.type)
    pc = RTCPeerConnection()
    pcs.add(pc)
    session_id = f"rtc-{id(pc)}"
    active_sessions.add(session_id)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()
            pcs.discard(pc)
            active_sessions.discard(session_id)

    @pc.on("track")
    def on_track(track):
        if track.kind == "video":
            local = ProcessedVideoTrack(relay.subscribe(track))
            pc.addTrack(local)

        @track.on("ended")
        async def on_ended():
            active_sessions.discard(session_id)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return JSONResponse({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})


@app.get("/api/warmup")
async def warmup(token: str = Depends(require_token)):
    """Pre-load AI models before streaming."""
    try:
        if pipeline.stats.has_reference:
            await pipeline.ensure_ip_loaded()
        else:
            await pipeline.ensure_loaded()
        return {"ok": True, "model_loaded": pipeline.stats.model_loaded, "mode": pipeline.stats.mode}
    except Exception as exc:
        pipeline.stats.last_error = str(exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": pipeline.stats.model_loaded}
