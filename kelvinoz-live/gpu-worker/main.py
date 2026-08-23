"""
KelvinOz GPU worker — real character transform on Hostinger GPU.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline import init_pipeline, set_character, status, transform_frame

app = FastAPI(title="KelvinOz GPU Worker", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_READY = False
MODEL_DETAIL = "Starting…"


class TransformRequest(BaseModel):
    prompt: str = Field(default="")
    character_b64: str | None = None
    frame_b64: str | None = None


@app.on_event("startup")
async def startup() -> None:
    global MODEL_READY, MODEL_DETAIL
    try:
        import torch

        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            info = init_pipeline()
            MODEL_READY = bool(info.get("ready"))
            MODEL_DETAIL = info.get("detail") or f"CUDA on {name}"
        else:
            MODEL_DETAIL = "CUDA not available."
    except Exception as exc:  # noqa: BLE001
        MODEL_DETAIL = f"Startup error: {exc}"


@app.get("/health")
async def health() -> dict[str, Any]:
    st = status()
    return {
        "ok": True,
        "detail": MODEL_DETAIL,
        "model_ready": MODEL_READY and st.get("ready"),
        "pipeline": st.get("pipeline"),
        "has_character": st.get("has_character"),
    }


@app.post("/transform")
async def transform(body: TransformRequest) -> dict[str, Any]:
    if body.character_b64:
        set_character(body.character_b64, body.prompt)
    if not body.frame_b64:
        return {"ok": False, "error": "frame_b64 required"}
    return transform_frame(body.frame_b64, body.prompt)


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    await ws.accept()
    st = status()
    await ws.send_json(
        {
            "type": "status",
            "message": MODEL_DETAIL,
            "gpuOnline": MODEL_READY,
            "pipeline": st.get("pipeline"),
        }
    )
    prompt = ""
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("text")
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if payload.get("type") == "ping":
                await ws.send_json({"type": "pong"})
            elif payload.get("type") == "config":
                prompt = payload.get("prompt") or ""
                char = payload.get("character_b64")
                if char:
                    res = set_character(char, prompt)
                    await ws.send_json({"type": "config_ack", **res, "pipeline": status().get("pipeline")})
                else:
                    await ws.send_json({"type": "config_ack", "ok": True, "needs_character": True})
            elif payload.get("type") == "frame" and payload.get("data"):
                result = await asyncio.to_thread(transform_frame, payload["data"], prompt)
                if result.get("ok") and result.get("data"):
                    await ws.send_json(
                        {
                            "type": "frame",
                            "data": result["data"],
                            "pipeline": result.get("pipeline"),
                            "elapsed_ms": result.get("elapsed_ms"),
                        }
                    )
                else:
                    await ws.send_json({"type": "error", "error": result.get("error", "Transform failed")})
    except WebSocketDisconnect:
        return


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
