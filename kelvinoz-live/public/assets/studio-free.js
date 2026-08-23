/**
 * Free local live engine — runs entirely in the browser.
 * No Decart credits. No Hostinger GPU.
 * Not Lucy 2.5 (proprietary). This is open MediaPipe + free scene image.
 */
import {
  FaceLandmarker,
  ImageSegmenter,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm";

(() => {
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
  let lastSegMs = 0;
  let lastFaceBox = null;
  let captureTimer = null;

  const work = document.createElement("canvas");
  const workCtx = work.getContext("2d", { willReadFrequently: true });
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const faceCanvas = document.createElement("canvas");
  const faceCtx = faceCanvas.getContext("2d");
  const outStream = work.captureStream(30);

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
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
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

  async function loadModels() {
    setStatus("Loading free on-device models…");
    setOutputMsg("Loading free models…");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
    );
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
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

  async function loadSceneFromPrompt(prompt) {
    const text = (prompt || "").trim();
    if (!text) {
      // Soft dark gradient fallback — still free
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 1280, 720);
      g.addColorStop(0, "#0b1020");
      g.addColorStop(1, "#1a1030");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
      const img = new Image();
      img.src = c.toDataURL("image/jpeg", 0.9);
      await img.decode();
      return img;
    }
    setStatus("Fetching free scene image…");
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${text}, cinematic live stream background, no people, high detail`
    )}?width=1280&height=720&nologo=true&seed=${Date.now() % 100000}`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  }

  /** Rough face oval bounds from MediaPipe landmarks. */
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

    // Cover-fit character into oval box
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

    // Soft oval mask
    faceCtx.globalCompositeOperation = "destination-in";
    const g = faceCtx.createRadialGradient(
      faceCanvas.width / 2,
      faceCanvas.height / 2,
      faceCanvas.width * 0.25,
      faceCanvas.width / 2,
      faceCanvas.height / 2,
      faceCanvas.width * 0.5
    );
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.7, "rgba(0,0,0,0.85)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    faceCtx.fillStyle = g;
    faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height);
    faceCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(faceCanvas, x, y, w, h);
  }

  function compositeFrame(maskData, mw, mh) {
    const w = camera.videoWidth || 1280;
    const h = camera.videoHeight || 720;
    if (!w || !h) return;

    work.width = w;
    work.height = h;
    maskCanvas.width = w;
    maskCanvas.height = h;

    // 1) Scene background
    if (sceneImg) {
      workCtx.drawImage(sceneImg, 0, 0, w, h);
    } else {
      workCtx.fillStyle = "#111";
      workCtx.fillRect(0, 0, w, h);
    }

    // 2) Person cutout via selfie confidence mask
    maskCtx.clearRect(0, 0, w, h);
    maskCtx.drawImage(camera, 0, 0, w, h);
    const frame = maskCtx.getImageData(0, 0, w, h);
    const data = frame.data;

    if (maskData && mw && mh) {
      for (let y = 0; y < h; y++) {
        const my = Math.min(mh - 1, Math.floor((y / h) * mh));
        for (let x = 0; x < w; x++) {
          const mx = Math.min(mw - 1, Math.floor((x / w) * mw));
          const m = maskData[my * mw + mx];
          const i = (y * w + x) * 4;
          if (m < 0.4) data[i + 3] = 0;
          else data[i + 3] = Math.min(255, Math.round(m * 255));
        }
      }
      maskCtx.putImageData(frame, 0, 0);
      workCtx.drawImage(maskCanvas, 0, 0);
    } else {
      workCtx.drawImage(camera, 0, 0, w, h);
    }

    // 3) Character face overlay (reuse last box between detections)
    const now = performance.now();
    if (faceLandmarker && now - lastFaceMs > 40) {
      lastFaceMs = now;
      const faces = faceLandmarker.detectForVideo(camera, now);
      const lm = faces?.faceLandmarks?.[0];
      if (lm) lastFaceBox = faceBounds(lm, w, h);
    }
    if (characterImg && lastFaceBox) drawCharacterFace(workCtx, lastFaceBox);

    hideOutputMsg();
    output.classList.add("is-on");
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    if (camera.readyState >= 2 && segmenter && now - lastSegMs > 40) {
      lastSegMs = now;
      try {
        segmenter.segmentForVideo(camera, now, (result) => {
          if (!running) return;
          const mask = result.confidenceMasks?.[0];
          if (!mask) {
            compositeFrame(null, 0, 0);
            return;
          }
          const maskData = mask.getAsFloat32Array();
          compositeFrame(maskData, mask.width, mask.height);
          mask.close?.();
          result.confidenceMasks?.forEach((m) => m !== mask && m.close?.());
        });
      } catch (err) {
        setStatus(err?.message || "Segmenter error");
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function startObsCapture() {
    stopObsCapture();
    captureTimer = setInterval(() => {
      if (!work.width) return;
      try {
        bc.postMessage({ type: "frame", dataUrl: work.toDataURL("image/jpeg", 0.7) });
      } catch {
        // ignore
      }
    }, 200);
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
      if (!segmenter || !faceLandmarker) await loadModels();
      await ensureCamera();
      sceneImg = await loadSceneFromPrompt(promptEl.value);
      running = true;
      await output.play().catch(() => {});
      startObsCapture();
      setPill(true, "Free local ready");
      setStatus(
        characterImg
          ? "Live · free local (scene + character face) — not Lucy 2.5"
          : "Live · free local scene swap — add character photo for face overlay"
      );
      setOutputMsg("Live");
      hideOutputMsg();
      loop();
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus(msg);
      setOutputMsg(msg);
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
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      characterImg = await loadImageFromFile(file);
      photoPreview.src = URL.createObjectURL(file);
      photoPreview.hidden = false;
      setStatus("Character photo ready — click Start live (free local)");
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
        setStatus("Scene updated (free)");
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
  setStatus("Free local mode — no Decart, no Hostinger GPU. Start live anytime.");
})();
