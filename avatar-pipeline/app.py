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
from PIL import Image

from lucy_backend import (
    create_decart_client_token,
    create_fal_realtime_token,
    fal_available,
    lucy_available,
)

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


@app.get("/api/capabilities")
async def capabilities(token: str = Depends(require_token)):
    return {
        "lucy": lucy_available(),
        "fal": fal_available(),
        "local_gpu": True,
        "default_pipeline": "lucy" if lucy_available() else "local",
    }


@app.post("/api/lucy/token")
async def lucy_token(token: str = Depends(require_token)):
    try:
        return await create_decart_client_token()
    except Exception as exc:
        logger.exception("Lucy token error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/fal/realtime-token")
async def fal_realtime_token(body: dict, token: str = Depends(require_token)):
    app_id = body.get("app", "decart/lucy-2-5/realtime")
    try:
        jwt = await create_fal_realtime_token(app_id)
        return Response(content=jwt, media_type="text/plain")
    except Exception as exc:
        logger.exception("FAL token error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc


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
# Inline Web UI
# ---------------------------------------------------------------------------
HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Avatar Stream</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0a0e14;color:#e2e8f0;min-height:100vh}
.bar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;
  background:#111827;border-bottom:1px solid #1e293b}
.bar h1{font-size:1rem;font-weight:600}
#stats{font-size:.85rem;color:#94a3b8}
.wrap{max-width:1200px;margin:0 auto;padding:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:800px){.grid{grid-template-columns:1fr}}
.panel{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px}
.panel h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px}
video,canvas,img.preview{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;border:1px solid #1e293b;object-fit:contain}
#cam{transform:scaleX(-1)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center}
button,.btn{padding:10px 18px;border:0;border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem}
.btn-go{background:#3b82f6;color:#fff}.btn-go:disabled{opacity:.4;cursor:not-allowed}
.btn-stop{background:#334155;color:#fff}.btn-stop:disabled{opacity:.4}
.btn-sec{background:#1e293b;color:#cbd5e1;border:1px solid #334155}
label.file{padding:10px 18px;background:#1e293b;border:1px solid #334155;border-radius:8px;
  cursor:pointer;font-size:.85rem;color:#94a3b8}
.sidebar{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:800px){.sidebar{grid-template-columns:1fr}}
textarea{width:100%;background:#0f172a;border:1px solid #1e293b;color:#e2e8f0;border-radius:8px;
  padding:10px;font:inherit;resize:vertical;margin-top:6px}
label.lbl{display:block;margin-top:10px;font-size:.8rem;color:#64748b}
input[type=range]{width:100%;margin-top:4px}
.login{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:32px;width:min(380px,92vw)}
.login-box h1{margin-bottom:8px;font-size:1.3rem}
.login-box p{color:#64748b;font-size:.9rem;margin-bottom:16px}
.login-box input{width:100%;padding:10px;background:#0f172a;border:1px solid #1e293b;
  border-radius:8px;color:#fff;margin-bottom:12px}
.err{color:#f87171;font-size:.85rem;margin-top:8px}
.banner{padding:10px 20px;background:#422006;color:#fde68a;font-size:.85rem;border-bottom:1px solid #92400e}
.hidden{display:none!important}
</style>
</head>
<body>
<div id="login-view" class="login">
  <div class="login-box">
    <h1>Avatar Stream</h1>
    <p>Full-body AI transformation · RTX PRO 6000</p>
    <p style="color:#94a3b8;font-size:.85rem;margin-bottom:12px">
      Webcam works at <strong>https://live.kelvinoz.com</strong>
    </p>
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password"/>
    <button class="btn-go" style="width:100%" onclick="doLogin()">Enter</button>
    <p id="login-err" class="err hidden"></p>
  </div>
</div>
<div id="app-view" class="hidden">
  <div class="bar"><h1>● Avatar Stream</h1><div id="stats">Loading GPU…</div></div>
  <div id="cam-banner" class="banner hidden"></div>
  <div class="wrap">
    <div class="panel" style="margin-bottom:16px">
      <h2>Pipeline</h2>
      <div class="actions" style="margin-top:0">
        <label class="file" style="cursor:pointer"><input type="radio" name="pipe" id="pipe-lucy" value="lucy" checked style="margin-right:6px"/> Lucy 2.5 · WebRTC · ~30fps</label>
        <label class="file" style="cursor:pointer"><input type="radio" name="pipe" id="pipe-local" value="local" style="margin-right:6px"/> Local GPU · StreamDiffusion</label>
      </div>
      <p id="pipe-hint" style="font-size:.75rem;color:#64748b;margin-top:8px">Lucy 2.5: Decart realtime video editing (prompt + reference). Requires DECART_API_KEY on server.</p>
    </div>
    <div class="grid">
      <div class="panel"><h2>Webcam</h2>
        <label class="lbl">Camera</label>
        <select id="cam-select" style="width:100%;padding:8px;background:#0f172a;border:1px solid #1e293b;color:#e2e8f0;border-radius:8px;margin-bottom:8px" onchange="previewCamera()">
          <option value="">Default camera</option>
        </select>
        <button class="btn-sec" style="width:100%;margin-bottom:8px" onclick="initCameras()">Detect cameras</button>
        <video id="cam" autoplay playsinline muted></video>
        <p id="cam-status" style="font-size:.75rem;color:#64748b;margin-top:6px">Click Detect cameras, allow access, pick your HD webcam</p>
      </div>
      <div class="panel"><h2>AI Avatar</h2>
        <video id="out-lucy" class="hidden" autoplay playsinline muted style="width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;border:1px solid #1e293b;object-fit:contain"></video>
        <canvas id="out"></canvas>
        <p id="out-status" style="margin-top:8px;font-size:.8rem;color:#64748b;text-align:center">Select pipeline and click Start</p>
      </div>
    </div>
    <div class="actions">
      <button id="btn-start" class="btn-go" onclick="startStream()">▶ Start</button>
      <button id="btn-stop" class="btn-stop" onclick="stopStream()" disabled>■ Stop</button>
      <label class="file">📁 Video file<input type="file" id="vid-file" accept="video/*" hidden onchange="useVideoFile(event)"/></label>
    </div>
    <div class="sidebar">
      <div class="panel">
        <h2>Reference Avatar Photo</h2>
        <img id="ref-preview" class="preview hidden" alt="reference"/>
        <div id="ref-empty" style="padding:40px;text-align:center;color:#64748b;border:1px dashed #334155;border-radius:8px">Upload target look</div>
        <div class="actions">
          <label class="file">Upload photo<input type="file" id="ref-file" accept="image/*" hidden onchange="uploadRef(event)"/></label>
          <button class="btn-sec" onclick="clearRef()">Remove</button>
        </div>
        <label class="lbl local-only">Transform strength <span id="str-val">0.55</span></label>
        <input class="local-only" type="range" id="strength" min="0.2" max="0.9" step="0.05" value="0.55" oninput="document.getElementById('str-val').textContent=this.value"/>
        <label class="lbl local-only">Reference likeness (color transfer) <span id="ref-val">0.55</span></label>
        <input class="local-only" type="range" id="ref-strength" min="0.2" max="1" step="0.05" value="0.55" oninput="document.getElementById('ref-val').textContent=this.value"/>
        <p id="ref-hint" style="font-size:.75rem;color:#64748b;margin-top:6px">Lucy: reference photo for character swap / try-on. Local GPU: color transfer.</p>
      </div>
      <div class="panel">
        <h2>Settings</h2>
        <label class="lbl">Prompt</label>
        <textarea id="prompt" rows="2">sharp portrait photo, detailed face, cinematic lighting, high quality</textarea>
        <label class="lbl local-only">Negative</label>
        <textarea class="local-only" id="neg" rows="2">blurry, low quality, distorted, deformed, ugly</textarea>
        <label class="lbl local-only">Steps <span id="steps-val">2</span> <span style="color:#64748b">(2=fastest)</span></label>
        <input class="local-only" type="range" id="steps" min="2" max="6" step="1" value="2" oninput="document.getElementById('steps-val').textContent=this.value"/>
        <button class="btn-sec" style="margin-top:12px;width:100%" onclick="saveSettings()">Save settings</button>
      </div>
    </div>
  </div>
</div>
<script type="module">
import { createDecartClient, models } from "https://esm.sh/@decartai/sdk@0.2.0";

let TOKEN=localStorage.getItem("avatar_token")||"";
let running=false, busy=false, rafId=null, stream=null, videoMode=false;
let lucyRealtime=null, refFileBlob=null, caps={lucy:false,local_gpu:true};
const CAP=384;
const LUCY_MODEL=models.realtime("lucy-2.5");
const HTTPS_URL="https://live.kelvinoz.com";
if(location.protocol==="http:"&&!location.hostname.match(/^(localhost|127\\.0\\.0\\.1)$/)){
  location.replace(HTTPS_URL+location.pathname+location.search);
}

function pipelineMode(){ return document.getElementById("pipe-lucy").checked?"lucy":"local"; }

function syncPipelineUi(){
  const lucy=pipelineMode()==="lucy";
  document.querySelectorAll(".local-only").forEach(el=>el.classList.toggle("hidden",lucy));
  document.getElementById("out").classList.toggle("hidden",lucy);
  document.getElementById("out-lucy").classList.toggle("hidden",!lucy);
  const hint=document.getElementById("pipe-hint");
  if(lucy){
    hint.textContent=caps.lucy
      ? "Lucy 2.5 WebRTC — prompt + reference, ~30fps (Decart cloud)"
      : "Lucy unavailable — add DECART_API_KEY on server. Using Local GPU instead.";
    if(!caps.lucy) document.getElementById("pipe-local").checked=true;
  }else{
    hint.textContent="Local GPU StreamDiffusion SD-Turbo (~8–12 fps, no cloud billing)";
  }
}

document.getElementById("pipe-lucy").addEventListener("change",syncPipelineUi);
document.getElementById("pipe-local").addEventListener("change",syncPipelineUi);

async function loadCaps(){
  if(!TOKEN)return;
  try{
    caps=await(await fetch("/api/capabilities",{headers:{Authorization:"Bearer "+TOKEN}})).json();
    if(caps.default_pipeline==="local"||!caps.lucy) document.getElementById("pipe-local").checked=true;
    else document.getElementById("pipe-lucy").checked=true;
    syncPipelineUi();
  }catch(e){}
}

async function doLogin(){
  const pw=document.getElementById("pw").value;
  const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})});
  const d=await r.json();
  if(!r.ok){document.getElementById("login-err").textContent=d.detail||"Failed";document.getElementById("login-err").classList.remove("hidden");return;}
  TOKEN=d.token; localStorage.setItem("avatar_token",TOKEN);
  showApp();
}
function showApp(){
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  if(!window.isSecureContext){
    document.getElementById("cam-banner").innerHTML=
      "📷 For webcam: open <a href='"+HTTPS_URL+"' style='color:#93c5fd'>"+HTTPS_URL+"</a> — or use <b>Video file</b> below.";
    document.getElementById("cam-banner").classList.remove("hidden");
  }
  loadCaps(); pollStats(); setInterval(pollStats,2000);
  initCameras().catch(()=>{});
}
if(TOKEN) fetch("/api/status",{headers:{Authorization:"Bearer "+TOKEN}}).then(r=>{if(r.ok)showApp();});

async function pollStats(){
  if(!TOKEN)return;
  if(pipelineMode()==="lucy"&&running){
    document.getElementById("stats").textContent="Live | lucy-2.5 | webrtc | ~30fps target";
    return;
  }
  try{
    const d=await(await fetch("/api/status",{headers:{Authorization:"Bearer "+TOKEN}})).json();
    document.getElementById("stats").textContent=
      `${d.ready?"Ready":"Loading"} | ${d.mode||"stream"} | ${d.acceleration||""} | ${d.fps} fps | ${d.latency_ms}ms`+
      (d.has_reference?" | ref ✓":"")+
      (d.last_error?" | ⚠ error":"");
  }catch(e){}
}

async function initCameras(){
  const sel=document.getElementById("cam-select");
  const st=document.getElementById("cam-status");
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API");
    const tmp=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    tmp.getTracks().forEach(t=>t.stop());
    const devs=await navigator.mediaDevices.enumerateDevices();
    const vids=devs.filter(d=>d.kind==="videoinput");
    sel.innerHTML="";
    vids.forEach((d,i)=>{
      const o=document.createElement("option");
      o.value=d.deviceId;
      o.textContent=d.label||("Camera "+(i+1));
      sel.appendChild(o);
    });
    const ext=vids.find(d=>/webcam|usb|hd|external|full/i.test(d.label));
    if(ext) sel.value=ext.deviceId;
    else if(vids.length>1) sel.selectedIndex=vids.length-1;
    st.textContent=vids.length+" camera(s) found — select yours, then Start";
    await previewCamera();
  }catch(e){ st.textContent="Camera error: "+e.message; }
}

async function previewCamera(){
  const v=document.getElementById("cam");
  const st=document.getElementById("cam-status");
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  try{
    stream=await getCam();
    v.srcObject=stream;
    await v.play().catch(()=>{});
    await waitVideoReady(v,5000);
    const b=frameBrightness();
    if(b<12) st.textContent="⚠ Camera open but image is black — try another camera in the list";
    else st.textContent="Camera OK (brightness "+Math.round(b)+") — click Start";
  }catch(e){ st.textContent="Camera error: "+e.message; }
}

async function getCam(forLucy=false){
  if(!navigator.mediaDevices?.getUserMedia){
    throw new Error("Camera blocked. Use "+HTTPS_URL+" and allow camera.");
  }
  const sel=document.getElementById("cam-select");
  const id=sel?.value;
  let video;
  if(forLucy){
    video=id
      ?{deviceId:{exact:id},frameRate:LUCY_MODEL.fps,width:LUCY_MODEL.width,height:LUCY_MODEL.height}
      :{frameRate:LUCY_MODEL.fps,width:LUCY_MODEL.width,height:LUCY_MODEL.height};
  }else{
    video=id
      ?{deviceId:{exact:id},width:{ideal:1280},height:{ideal:720}}
      :{width:{ideal:1280},height:{ideal:720}};
  }
  return navigator.mediaDevices.getUserMedia({video,audio:false});
}

async function waitVideoReady(v,ms=8000){
  if(v.readyState>=2&&v.videoWidth>0)return;
  await new Promise((res,rej)=>{
    const t=setTimeout(()=>rej(new Error("Camera timeout — check permissions or use Video file")),ms);
    v.onloadedmetadata=()=>{clearTimeout(t);v.play().then(res).catch(res);};
  });
}

function useVideoFile(e){
  const f=e.target.files[0]; if(!f)return;
  videoMode=true; const v=document.getElementById("cam");
  v.srcObject=null; v.src=URL.createObjectURL(f); v.loop=true; v.play();
  document.getElementById("cam-status").textContent="Video file mode — Lucy 2.5 needs live webcam";
}

async function uploadRef(e){
  const f=e.target.files[0]; if(!f)return;
  refFileBlob=f;
  if(pipelineMode()==="local"){
    const fd=new FormData(); fd.append("file",f);
    const r=await fetch("/api/reference",{method:"POST",headers:{Authorization:"Bearer "+TOKEN},body:fd});
    if(!r.ok){alert("Upload failed");return;}
  }
  const url=URL.createObjectURL(f);
  document.getElementById("ref-preview").src=url;
  document.getElementById("ref-preview").classList.remove("hidden");
  document.getElementById("ref-empty").classList.add("hidden");
  if(lucyRealtime){
    const prompt=document.getElementById("prompt").value||
      "Substitute the character in the video with the person in the reference image.";
    await lucyRealtime.set({prompt,image:f,enhance:true});
  }
}

async function clearRef(){
  refFileBlob=null;
  if(pipelineMode()==="local") await fetch("/api/reference",{method:"DELETE",headers:{Authorization:"Bearer "+TOKEN}});
  document.getElementById("ref-preview").classList.add("hidden");
  document.getElementById("ref-empty").classList.remove("hidden");
  if(lucyRealtime) await lucyRealtime.set({image:null});
}

async function saveSettings(){
  const prompt=document.getElementById("prompt").value;
  if(lucyRealtime){
    const payload={prompt,enhance:true};
    if(refFileBlob) payload.image=refFileBlob;
    await lucyRealtime.set(payload);
    outStatus.textContent="Lucy prompt updated";
    return;
  }
  await fetch("/api/settings",{method:"POST",headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({
      prompt,
      negative:document.getElementById("neg").value,
      steps:+document.getElementById("steps").value,
      strength:+document.getElementById("strength").value,
      reference_strength:+document.getElementById("ref-strength").value
    })});
}

const cap=document.createElement("canvas"), capCtx=cap.getContext("2d");
const outCanvas=document.getElementById("out"), outCtx=outCanvas.getContext("2d");
const outStatus=document.getElementById("out-status");
let frames=0;

function captureFrame(){
  const v=document.getElementById("cam");
  const vw=v.videoWidth||CAP, vh=v.videoHeight||CAP;
  cap.width=CAP; cap.height=CAP;
  capCtx.fillStyle="#000";
  capCtx.fillRect(0,0,CAP,CAP);
  const scale=Math.min(CAP/vw, CAP/vh);
  const dw=vw*scale, dh=vh*scale;
  capCtx.drawImage(v,(CAP-dw)/2,(CAP-dh)/2,dw,dh);
}

function frameBrightness(){
  captureFrame();
  const d=capCtx.getImageData(0,0,CAP,CAP).data;
  let s=0; for(let i=0;i<d.length;i+=4) s+=d[i]+d[i+1]+d[i+2];
  return s/(d.length/4)/3;
}

async function sendFrame(){
  if(!running||busy||pipelineMode()!=="local")return;
  const v=document.getElementById("cam");
  if(v.readyState<2||!v.videoWidth){ scheduleFrame(); return; }
  busy=true;
  if(frames===0) outStatus.textContent="Processing first frame…";
  captureFrame();
  const bright=frameBrightness();
  if(bright<12){
    outStatus.textContent="⚠ Camera is black — click Detect cameras, pick HD webcam, or use Video file";
    busy=false; scheduleFrame(); return;
  }
  cap.toBlob(async blob=>{
    try{
      const t0=performance.now();
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),120000);
      const r=await fetch("/process-frame",{
        method:"POST",
        headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"image/jpeg"},
        body:blob,
        signal:ctrl.signal
      });
      clearTimeout(timer);
      if(r.ok){
        const buf=await r.blob();
        if(buf.size<1000) throw new Error("Empty response from GPU");
        const b=await createImageBitmap(buf);
        outCanvas.width=b.width; outCanvas.height=b.height;
        outCtx.drawImage(b,0,0);
        frames++;
        const ms=(performance.now()-t0).toFixed(0);
        outStatus.textContent=`Live · ${ms}ms round-trip`;
      }else{
        const err=await r.json().catch(()=>({detail:r.statusText}));
        outStatus.textContent="Error: "+(err.detail||r.status);
      }
    }catch(e){
      outStatus.textContent=e.name==="AbortError"?"GPU timeout (>120s) — retrying…":"Network error — "+(e.message||"retrying…");
    }
    finally{busy=false; scheduleFrame();}
  },"image/jpeg",0.75);
}

function scheduleFrame(){
  if(!running||pipelineMode()!=="local")return;
  rafId=requestAnimationFrame(()=>{ if(!busy) sendFrame(); else scheduleFrame(); });
}

async function startLucy(){
  if(videoMode) throw new Error("Lucy 2.5 requires a live webcam (not video file)");
  if(!caps.lucy) throw new Error("Lucy not configured — set DECART_API_KEY on the GPU server");
  outStatus.textContent="Connecting Lucy 2.5…";
  const tokRes=await fetch("/api/lucy/token",{method:"POST",headers:{Authorization:"Bearer "+TOKEN}});
  if(!tokRes.ok){
    const err=await tokRes.json().catch(()=>({}));
    throw new Error(err.detail||"Lucy token failed");
  }
  const {apiKey}=await tokRes.json();
  const v=document.getElementById("cam");
  if(stream){stream.getTracks().forEach(t=>t.stop());}
  stream=await getCam(true);
  v.srcObject=stream;
  await waitVideoReady(v);
  const prompt=document.getElementById("prompt").value||
    "sharp portrait photo, detailed face, cinematic lighting, high quality";
  const initialState={prompt:{text:prompt,enhance:true}};
  if(refFileBlob) initialState.image=refFileBlob;
  const client=createDecartClient({apiKey});
  lucyRealtime=await client.realtime.connect(stream,{
    model:LUCY_MODEL,
    mirror:"auto",
    onRemoteStream:(remote)=>{
      const out=document.getElementById("out-lucy");
      out.srcObject=remote;
      out.play().catch(()=>{});
    },
    onError:(err)=>{ outStatus.textContent="Lucy error: "+(err.message||err); },
    onDisconnect:(reason)=>{ outStatus.textContent="Lucy disconnected: "+reason; },
    initialState,
  });
  running=true;
  outStatus.textContent="Lucy 2.5 live · WebRTC · edit with prompt + reference";
  document.getElementById("btn-stop").disabled=false;
}

async function startStream(){
  document.getElementById("btn-start").disabled=true;
  syncPipelineUi();
  try{
    if(pipelineMode()==="lucy"){ await startLucy(); return; }
    const v=document.getElementById("cam");
    if(!videoMode){
      stream=await getCam(false);
      v.srcObject=stream;
      await waitVideoReady(v);
    }else{
      await v.play().catch(()=>{});
    }
    if(!v.videoWidth) throw new Error("No camera frames — allow camera access or use Video file");
    await saveSettings();
    running=true; frames=0;
    document.getElementById("btn-stop").disabled=false;
    scheduleFrame();
  }catch(e){ alert(e.message); document.getElementById("btn-start").disabled=false; }
}

function stopStream(){
  running=false;
  if(rafId) cancelAnimationFrame(rafId);
  if(lucyRealtime){ lucyRealtime.disconnect(); lucyRealtime=null; }
  document.getElementById("out-lucy").srcObject=null;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  document.getElementById("btn-start").disabled=false;
  document.getElementById("btn-stop").disabled=true;
  outStatus.textContent="Stopped";
}

window.doLogin=doLogin;
window.initCameras=initCameras;
window.previewCamera=previewCamera;
window.useVideoFile=useVideoFile;
window.uploadRef=uploadRef;
window.clearRef=clearRef;
window.saveSettings=saveSettings;
window.startStream=startStream;
window.stopStream=stopStream;
</script>
</body></html>"""


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(HTML_PAGE)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=80, workers=1, log_level="info")
