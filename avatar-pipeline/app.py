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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("avatar")

APP_PASSWORD = os.environ.get("APP_PASSWORD", "@535846.oZ")
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE.startswith("cuda") else torch.float32

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


# ---------------------------------------------------------------------------
# GPU Pipeline
# ---------------------------------------------------------------------------
class AvatarPipeline:
    """ControlNet OpenPose full-body tracking + IP-Adapter reference avatar."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipe = None
        self._openpose = None
        self._reference: Optional[Image.Image] = None
        self.ready = False
        self.last_ms = 0.0
        self.fps = 0.0
        self._times: list[float] = []
        self.prompt = "full body portrait, high quality, detailed avatar, cinematic lighting"
        self.negative = "blurry, low quality, distorted, deformed, ugly, watermark, text"
        self.steps = 4
        self.guidance = 7.0
        self.control_scale = 0.85
        self.ip_scale = 0.65

    def load(self) -> None:
        if self.ready:
            return
        from controlnet_aux import OpenposeDetector
        from diffusers import ControlNetModel, StableDiffusionControlNetPipeline, UniPCMultistepScheduler

        logger.info("Loading OpenPose detector...")
        self._openpose = OpenposeDetector.from_pretrained("lllyasviel/ControlNet")

        logger.info("Loading ControlNet OpenPose + SD1.5 on %s...", DEVICE)
        controlnet = ControlNetModel.from_pretrained(
            "lllyasviel/control_v11p_sd15_openpose", torch_dtype=DTYPE
        )
        pipe = StableDiffusionControlNetPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            controlnet=controlnet,
            torch_dtype=DTYPE,
            safety_checker=None,
        )
        pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
        try:
            pipe.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="models",
                weight_name="ip-adapter_sd15.bin",
            )
            pipe.set_ip_adapter_scale(0.0)
            logger.info("IP-Adapter loaded for reference photos")
        except Exception as exc:
            logger.warning("IP-Adapter unavailable: %s", exc)

        if DEVICE.startswith("cuda"):
            pipe.to(DEVICE)
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                pass

        self._pipe = pipe
        self.ready = True
        logger.info("Pipeline ready on %s", DEVICE)

    def set_reference(self, image: Optional[Image.Image]) -> None:
        with self._lock:
            self._reference = image.convert("RGB") if image else None
            if self._pipe and hasattr(self._pipe, "set_ip_adapter_scale"):
                self._pipe.set_ip_adapter_scale(self.ip_scale if self._reference else 0.0)

    def process_jpeg(self, jpeg_bytes: bytes) -> bytes:
        if not self.ready:
            self.load()

        t0 = time.perf_counter()
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Invalid JPEG")

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb).resize((512, 512), Image.Resampling.LANCZOS)

        with self._lock:
            prompt = self.prompt
            negative = self.negative
            steps = self.steps
            guidance = self.guidance
            cscale = self.control_scale
            ip_scale = self.ip_scale
            reference = self._reference

        pose = self._openpose(pil)
        if isinstance(pose, np.ndarray):
            pose = Image.fromarray(pose)

        kwargs = dict(
            prompt=prompt,
            negative_prompt=negative,
            control_image=pose,
            num_inference_steps=steps,
            guidance_scale=guidance,
            controlnet_conditioning_scale=cscale,
        )

        if reference is not None and hasattr(self._pipe, "set_ip_adapter_scale"):
            ref = reference.resize((512, 512), Image.Resampling.LANCZOS)
            self._pipe.set_ip_adapter_scale(ip_scale)
            kwargs["ip_adapter_image"] = ref

        with torch.inference_mode():
            result = self._pipe(**kwargs).images[0]

        out_bgr = cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", out_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            raise RuntimeError("JPEG encode failed")

        elapsed = time.perf_counter() - t0
        self.last_ms = elapsed * 1000
        self._times.append(elapsed)
        if len(self._times) > 30:
            self._times.pop(0)
        self.fps = 1.0 / (sum(self._times) / len(self._times)) if self._times else 0.0
        return buf.tobytes()


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
    return {
        "ready": pipeline.ready,
        "device": DEVICE,
        "fps": round(pipeline.fps, 2),
        "latency_ms": round(pipeline.last_ms, 1),
        "has_reference": pipeline._reference is not None,
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
    for key in ("prompt", "negative", "steps", "guidance", "control_scale", "ip_scale"):
        if key in body and body[key] is not None:
            setattr(pipeline, key if key != "negative" else "negative", body[key])
    if pipeline._reference and hasattr(pipeline._pipe, "set_ip_adapter_scale"):
        pipeline._pipe.set_ip_adapter_scale(float(pipeline.ip_scale))
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
    <div class="grid">
      <div class="panel"><h2>Webcam</h2><video id="cam" autoplay playsinline muted></video></div>
      <div class="panel"><h2>AI Avatar</h2><canvas id="out"></canvas></div>
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
        <label class="lbl">Style strength <span id="ip-val">0.65</span></label>
        <input type="range" id="ip-scale" min="0.1" max="1" step="0.05" value="0.65" oninput="document.getElementById('ip-val').textContent=this.value"/>
      </div>
      <div class="panel">
        <h2>Settings</h2>
        <label class="lbl">Prompt</label>
        <textarea id="prompt" rows="2">full body portrait, high quality, detailed avatar, cinematic lighting</textarea>
        <label class="lbl">Negative</label>
        <textarea id="neg" rows="2">blurry, low quality, distorted, deformed, ugly</textarea>
        <label class="lbl">Steps <span id="steps-val">4</span></label>
        <input type="range" id="steps" min="2" max="8" step="1" value="4" oninput="document.getElementById('steps-val').textContent=this.value"/>
        <button class="btn-sec" style="margin-top:12px;width:100%" onclick="saveSettings()">Save settings</button>
      </div>
    </div>
  </div>
</div>
<script>
let TOKEN=localStorage.getItem("avatar_token")||"";
let running=false, busy=false, loopId=null, stream=null, videoMode=false;
const FPS=30, INTERVAL=1000/FPS;
const HTTPS_URL="https://live.kelvinoz.com";
if(location.protocol==="http:"&&!location.hostname.match(/^(localhost|127\\.0\\.0\\.1)$/)){
  location.replace(HTTPS_URL+location.pathname+location.search);
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
  pollStats(); setInterval(pollStats,2000);
}
if(TOKEN) fetch("/api/status",{headers:{Authorization:"Bearer "+TOKEN}}).then(r=>{if(r.ok)showApp();});

async function pollStats(){
  if(!TOKEN)return;
  try{
    const d=await(await fetch("/api/status",{headers:{Authorization:"Bearer "+TOKEN}})).json();
    document.getElementById("stats").textContent=
      `${d.ready?"Ready":"Loading"} | ${d.device} | ${d.fps} fps | ${d.latency_ms}ms`+
      (d.has_reference?" | ref ✓":"");
  }catch(e){}
}

async function getCam(){
  if(!navigator.mediaDevices?.getUserMedia){
    throw new Error("Camera blocked. Open "+HTTPS_URL+" OR use Video file below.");
  }
  return navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});
}

function useVideoFile(e){
  const f=e.target.files[0]; if(!f)return;
  videoMode=true; const v=document.getElementById("cam");
  v.srcObject=null; v.src=URL.createObjectURL(f); v.loop=true; v.play();
}

async function uploadRef(e){
  const f=e.target.files[0]; if(!f)return;
  const fd=new FormData(); fd.append("file",f);
  const r=await fetch("/api/reference",{method:"POST",headers:{Authorization:"Bearer "+TOKEN},body:fd});
  if(!r.ok){alert("Upload failed");return;}
  const url=URL.createObjectURL(f);
  document.getElementById("ref-preview").src=url;
  document.getElementById("ref-preview").classList.remove("hidden");
  document.getElementById("ref-empty").classList.add("hidden");
}

async function clearRef(){
  await fetch("/api/reference",{method:"DELETE",headers:{Authorization:"Bearer "+TOKEN}});
  document.getElementById("ref-preview").classList.add("hidden");
  document.getElementById("ref-empty").classList.remove("hidden");
}

async function saveSettings(){
  await fetch("/api/settings",{method:"POST",headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({
      prompt:document.getElementById("prompt").value,
      negative:document.getElementById("neg").value,
      steps:+document.getElementById("steps").value,
      ip_scale:+document.getElementById("ip-scale").value
    })});
}

const cap=document.createElement("canvas"), capCtx=cap.getContext("2d");
const outCanvas=document.getElementById("out"), outCtx=outCanvas.getContext("2d");

async function sendFrame(){
  if(!running||busy)return;
  const v=document.getElementById("cam");
  if(v.readyState<2)return;
  busy=true;
  cap.width=512; cap.height=512;
  capCtx.drawImage(v,0,0,512,512);
  cap.toBlob(async blob=>{
    try{
      const r=await fetch("/process-frame",{
        method:"POST",
        headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"image/jpeg"},
        body:blob
      });
      if(r.ok){
        const buf=await r.blob();
        createImageBitmap(buf).then(b=>{
          outCanvas.width=b.width; outCanvas.height=b.height;
          outCtx.drawImage(b,0,0);
        });
      }
    }catch(e){console.error(e);}
    finally{busy=false;}
  },"image/jpeg",0.82);
}

async function startStream(){
  document.getElementById("btn-start").disabled=true;
  try{
    if(!videoMode){ stream=await getCam(); document.getElementById("cam").srcObject=stream; }
    await document.getElementById("cam").play().catch(()=>{});
    await saveSettings();
    running=true;
    document.getElementById("btn-stop").disabled=false;
    loopId=setInterval(sendFrame, INTERVAL);
  }catch(e){ alert(e.message); document.getElementById("btn-start").disabled=false; }
}

function stopStream(){
  running=false; clearInterval(loopId);
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  document.getElementById("btn-start").disabled=false;
  document.getElementById("btn-stop").disabled=true;
}
</script>
</body></html>"""


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(HTML_PAGE)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=80, workers=1, log_level="info")
