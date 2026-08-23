/**
 * Free local live engine — browser only.
 * No Decart. No Hostinger GPU. Not Lucy 2.5.
 */
const camera = document.getElementById("camera");
const output = document.getElementById("output");
const cameraEmpty = document.getElementById("camera-empty");
const outputEmpty = document.getElementById("output-empty");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photo-preview");
const promptEl = document.getElementById("prompt");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusText = document.getElementById("status-text");
const lucyPill = document.getElementById("gpu-pill");
const obsUrl = document.getElementById("obs-url");
const copyObs = document.getElementById("copy-obs");
const logoutBtn = document.getElementById("logout");

const bc = new BroadcastChannel("kelvinoz-live-frames");

let localStream = null;
let characterImg = null;
let sceneImg = null;
let running = false;
let raf = 0;
let segmenter = null;
let faceLandmarker = null;
let lastFaceMs = 0;
let lastFaceBox = null;
let captureTimer = null;
let modelsReady = false;

const work = document.createElement("canvas");
const workCtx = work.getContext("2d", { willReadFrequently: true });
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
const faceCanvas = document.createElement("canvas");
const faceCtx = faceCanvas.getContext("2d");
const outStream = work.captureStream(24);

obsUrl.value = `${location.origin}/obs`;
output.srcObject = outStream;
output.muted = true;
output.playsInline = true;

function setStatus(text) {
  statusText.textContent = text;
}

function setOutputMsg(text) {
  outputEmpty.textContent = text;
  outputEmpty.classList.remove("is-hidden");
}

function hideOutputMsg() {
  outputEmpty.classList.add("is-hidden");
}

function setPill(ok, label) {
  lucyPill.textContent = label;
  lucyPill.classList.toggle("pill-on", ok);
  lucyPill.classList.toggle("pill-off", !ok);
}

function stopLocalTracks() {
  if (!localStream) return;
  localStream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      // ignore
    }
  });
  localStream = null;
  camera.srcObject = null;
  camera.classList.remove("is-on");
  cameraEmpty.classList.remove("is-hidden");
}

async function ensureCamera() {
  stopLocalTracks();
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
  } catch (err) {
    const name = err?.name || "";
    if (name === "NotReadableError" || /video source|Could not start/i.test(err?.message || "")) {
      throw new Error("Camera is busy. Close OBS webcam source, then retry Start live.");
    }
    if (name === "NotAllowedError") {
      throw new Error("Camera permission blocked for kelvinoz.com.");
    }
    throw new Error(err?.message || "Could not open camera");
  }
  camera.srcObject = localStream;
  await camera.play();
  camera.classList.add("is-on");
  cameraEmpty.classList.add("is-hidden");
  return localStream;
}

async function createVisionTasks(delegate) {
  const mod = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm");
  const vision = await mod.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );
  const seg = await mod.ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
      delegate,
    },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  const face = await mod.FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
  });
  return { seg, face };
}

async function loadModels() {
  setStatus("Loading free on-device models…");
  setOutputMsg("Loading free models…");
  try {
    ({ seg: segmenter, face: faceLandmarker } = await createVisionTasks("GPU"));
    modelsReady = true;
    setStatus("Models ready (GPU)");
  } catch (gpuErr) {
    setStatus(`GPU models failed (${gpuErr?.message || gpuErr}). Trying CPU…`);
    try {
      ({ seg: segmenter, face: faceLandmarker } = await createVisionTasks("CPU"));
      modelsReady = true;
      setStatus("Models ready (CPU)");
    } catch (cpuErr) {
      segmenter = null;
      faceLandmarker = null;
      modelsReady = false;
      setStatus(
        `Models unavailable — camera passthrough only. ${cpuErr?.message || cpuErr}`
      );
    }
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

function makeFallbackScene() {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 1280, 720);
  g.addColorStop(0, "#0b1020");
  g.addColorStop(1, "#241028");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  const img = new Image();
  img.src = c.toDataURL("image/jpeg", 0.9);
  return img.decode().then(() => img);
}

async function loadSceneFromPrompt(prompt) {
  const text = (prompt || "").trim();
  if (!text) return makeFallbackScene();
  setStatus("Fetching free scene image…");
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${text}, cinematic live stream background, no people, high detail`
    )}?width=1280&height=720&nologo=true&seed=${Date.now() % 100000}`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    setStatus("Scene fetch failed — using plain backdrop");
    return makeFallbackScene();
  }
}

function faceBounds(landmarks, w, h) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of landmarks) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const padX = (maxX - minX) * 0.15;
  const padY = (maxY - minY) * 0.2;
  return {
    x: (minX - padX) * w,
    y: (minY - padY) * h,
    w: (maxX - minX + padX * 2) * w,
    h: (maxY - minY + padY * 2) * h,
  };
}

function drawCharacterFace(ctx, bounds) {
  if (!characterImg) return;
  const { x, y, w, h } = bounds;
  faceCanvas.width = Math.max(2, Math.round(w));
  faceCanvas.height = Math.max(2, Math.round(h));
  faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

  const ir = characterImg.width / characterImg.height;
  const br = w / h;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > br) {
    dh = faceCanvas.height;
    dw = dh * ir;
    dx = (faceCanvas.width - dw) / 2;
    dy = 0;
  } else {
    dw = faceCanvas.width;
    dh = dw / ir;
    dx = 0;
    dy = (faceCanvas.height - dh) / 2;
  }
  faceCtx.drawImage(characterImg, dx, dy, dw, dh);
  faceCtx.globalCompositeOperation = "destination-in";
  const g = faceCtx.createRadialGradient(
    faceCanvas.width / 2,
    faceCanvas.height / 2,
    faceCanvas.width * 0.22,
    faceCanvas.width / 2,
    faceCanvas.height / 2,
    faceCanvas.width * 0.5
  );
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.75, "rgba(0,0,0,0.9)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  faceCtx.fillStyle = g;
  faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height);
  faceCtx.globalCompositeOperation = "source-over";
  ctx.drawImage(faceCanvas, x, y, w, h);
}

function paintPersonWithMask(maskData, mw, mh, w, h) {
  maskCanvas.width = mw;
  maskCanvas.height = mh;
  maskCtx.drawImage(camera, 0, 0, mw, mh);
  const frame = maskCtx.getImageData(0, 0, mw, mh);
  const data = frame.data;
  for (let i = 0; i < maskData.length; i++) {
    const m = maskData[i];
    data[i * 4 + 3] = m < 0.45 ? 0 : Math.min(255, (m * 255) | 0);
  }
  maskCtx.putImageData(frame, 0, 0);
  workCtx.drawImage(maskCanvas, 0, 0, w, h);
}

function paintFrame(maskData, mw, mh) {
  const w = camera.videoWidth || 960;
  const h = camera.videoHeight || 540;
  if (!w || !h || camera.readyState < 2) return;

  work.width = w;
  work.height = h;

  if (sceneImg && maskData) {
    workCtx.drawImage(sceneImg, 0, 0, w, h);
    paintPersonWithMask(maskData, mw, mh, w, h);
  } else if (sceneImg && !maskData) {
    // No segmenter: show scene dimmed under full camera (still useful preview)
    workCtx.drawImage(sceneImg, 0, 0, w, h);
    workCtx.globalAlpha = 0.35;
    workCtx.drawImage(camera, 0, 0, w, h);
    workCtx.globalAlpha = 1;
  } else {
    workCtx.drawImage(camera, 0, 0, w, h);
  }

  const now = performance.now();
  if (faceLandmarker && now - lastFaceMs > 50) {
    lastFaceMs = now;
    try {
      const faces = faceLandmarker.detectForVideo(camera, now);
      const lm = faces?.faceLandmarks?.[0];
      if (lm) lastFaceBox = faceBounds(lm, w, h);
    } catch {
      // ignore transient face errors
    }
  }
  if (characterImg && lastFaceBox) drawCharacterFace(workCtx, lastFaceBox);

  hideOutputMsg();
  output.classList.add("is-on");
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (camera.readyState >= 2) {
    if (segmenter) {
      try {
        segmenter.segmentForVideo(camera, now, (result) => {
          if (!running) return;
          const mask = result.confidenceMasks?.[0];
          if (!mask) {
            paintFrame(null, 0, 0);
            return;
          }
          const maskData = mask.getAsFloat32Array();
          paintFrame(maskData, mask.width, mask.height);
          try {
            mask.close?.();
          } catch {
            // ignore
          }
        });
      } catch (err) {
        setStatus(err?.message || "Segmenter error");
        paintFrame(null, 0, 0);
      }
    } else {
      paintFrame(null, 0, 0);
    }
  }
  raf = requestAnimationFrame(loop);
}

function startObsCapture() {
  stopObsCapture();
  captureTimer = setInterval(() => {
    if (!work.width) return;
    try {
      bc.postMessage({ type: "frame", dataUrl: work.toDataURL("image/jpeg", 0.65) });
    } catch {
      // ignore
    }
  }, 250);
}

function stopObsCapture() {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = null;
}

async function startLive() {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setOutputMsg("Starting free local live…");
  setStatus("Starting free local live…");

  try {
    if (!modelsReady && !segmenter) await loadModels();
    await ensureCamera();
    sceneImg = await loadSceneFromPrompt(promptEl.value);
    running = true;
    await output.play().catch(() => {});
    startObsCapture();
    setPill(true, modelsReady ? "Free local live" : "Passthrough live");
    setStatus(
      modelsReady
        ? "Live · free local (browser) — close OBS webcam if camera fails"
        : "Live · camera passthrough (models failed to load)"
    );
    loop();
  } catch (err) {
    const msg = err?.message || String(err);
    setStatus(msg);
    setOutputMsg(msg);
    setPill(false, "Free local error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    stopLocalTracks();
  }
}

function stopLive() {
  running = false;
  cancelAnimationFrame(raf);
  stopObsCapture();
  stopLocalTracks();
  output.classList.remove("is-on");
  outputEmpty.textContent = "Waiting";
  outputEmpty.classList.remove("is-hidden");
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Stopped.");
  setPill(true, "Free local ready");
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  try {
    characterImg = await loadImageFromFile(file);
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
    setStatus("Character photo ready — click Start live");
  } catch (err) {
    setStatus(err.message || "Bad photo");
  }
});

let promptTimer = null;
promptEl.addEventListener("input", () => {
  if (!running) return;
  clearTimeout(promptTimer);
  promptTimer = setTimeout(async () => {
    try {
      sceneImg = await loadSceneFromPrompt(promptEl.value);
      setStatus("Scene updated");
    } catch (err) {
      setStatus(err.message || "Scene update failed");
    }
  }, 900);
});

startBtn.addEventListener("click", () => startLive());
stopBtn.addEventListener("click", () => stopLive());

copyObs.addEventListener("click", async () => {
  await navigator.clipboard.writeText(obsUrl.value);
  setStatus("OBS Browser Source URL copied.");
});

logoutBtn.addEventListener("click", async () => {
  stopLive();
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
});

setPill(true, "Free local ready");
setStatus("Free local · hard refresh, then Start live. Close OBS webcam first.");
