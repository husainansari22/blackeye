"""
Minimal VidChat-compatible GPU worker stub.
Replace generate/stream bodies with your real model (StreamDiffusion, SVD, etc.).
"""
from __future__ import annotations

import io
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageEnhance

app = FastAPI(title="VidChat GPU Worker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "vidchat-worker"}


@app.post("/v1/generate")
async def generate(payload: dict[str, Any]) -> JSONResponse:
    # Stub: real deployments should run text-to-video here.
    # Honor clean export flags — never burn labels into output.
    _ = payload.get("prompt")
    clean = payload.get("clean_export", True)
    watermark = payload.get("watermark", False)
    add_label = payload.get("add_ai_label", False)
    if clean or not watermark:
        pass  # no overlay
    if add_label:
        # Explicitly ignored when clean_export is requested by the client
        pass
    return JSONResponse(
        {
            "ok": True,
            "url": None,
            "message": "Stub worker — wire your model and return a video url or mp4 bytes.",
            "clean_export": bool(clean),
        }
    )


@app.post("/v1/stream")
async def stream(
    frame: UploadFile = File(...),
    prompt: str = Form(""),
    watermark: str = Form("false"),
    add_ai_label: str = Form("false"),
) -> Response:
    raw = await frame.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # Tiny stylize so Live Studio has a visible remote response
    img = ImageEnhance.Color(img).enhance(1.25)
    img = ImageEnhance.Contrast(img).enhance(1.1)
    # Never draw "AI" badges onto frames
    _ = (prompt, watermark, add_ai_label)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return Response(content=buf.getvalue(), media_type="image/jpeg")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
