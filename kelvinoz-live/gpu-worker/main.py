"""
KelvinOz GPU worker — runs on Hostinger L40S.
Exposes /health, /transform, and /ws/live for the kelvinoz.com studio.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="KelvinOz GPU Worker", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = os.environ.get("CUDA_VISIBLE_DEVICES", "0")
MODEL_READY = False
MODEL_DETAIL = "Models not loaded yet — install torch/CUDA stack on the L40S, then restart worker."


class TransformRequest(BaseModel):
    prompt: str = Field(default="", description="Background / scene description")
    character_b64: str | None = None
    frame_b64: str | None = None


@app.on_event("startup")
async def startup() -> None:
    global MODEL_READY, MODEL_DETAIL
    try:
        import torch  # noqa: F401

        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            MODEL_READY = True
            MODEL_DETAIL = f"CUDA ready on {name}. Character pipeline hook is live; load weights next."
        else:
            MODEL_DETAIL = "PyTorch installed but CUDA not available."
    except Exception as exc:  # noqa: BLE001
        MODEL_DETAIL = f"Waiting for GPU stack: {exc}"


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "detail": MODEL_DETAIL,
        "model_ready": MODEL_READY,
        "device": DEVICE,
    }


@app.post("/transform")
async def transform(body: TransformRequest) -> dict[str, Any]:
    """
    Placeholder for full-character realtime transform.
    On L40S this will run the diffusion/control pipeline with:
    - reference character photo
    - live webcam frame / pose
    - background prompt
    """
    if not body.frame_b64:
        return {"ok": False, "error": "frame_b64 required"}
    return {
        "ok": True,
        "preview": True,
        "prompt": body.prompt,
        "message": MODEL_DETAIL,
        "frame_b64": body.frame_b64,
    }


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json({"type": "status", "message": MODEL_DETAIL, "gpuOnline": MODEL_READY})
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("text") or message.get("bytes")
            if raw is None:
                continue
            if isinstance(raw, (bytes, bytearray)):
                # Echo binary frames until the heavy model path is wired
                await ws.send_bytes(raw)
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "ping":
                await ws.send_json({"type": "pong"})
            elif payload.get("type") == "config":
                await ws.send_json(
                    {
                        "type": "config_ack",
                        "ok": True,
                        "prompt": payload.get("prompt", ""),
                        "characterPath": payload.get("characterPath"),
                        "model_ready": MODEL_READY,
                    }
                )
            elif payload.get("type") == "frame" and payload.get("data"):
                # Round-trip for now; replace with model inference output
                await ws.send_json({"type": "frame", "data": payload["data"], "preview": True})
    except WebSocketDisconnect:
        return


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
