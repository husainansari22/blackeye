(() => {
  const camera = document.getElementById("camera");
  const output = document.getElementById("output");
  const ctx = output.getContext("2d");
  const cameraEmpty = document.getElementById("camera-empty");
  const outputEmpty = document.getElementById("output-empty");
  const photoInput = document.getElementById("photo");
  const photoPreview = document.getElementById("photo-preview");
  const promptEl = document.getElementById("prompt");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const statusText = document.getElementById("status-text");
  const gpuPill = document.getElementById("gpu-pill");
  const obsUrl = document.getElementById("obs-url");
  const copyObs = document.getElementById("copy-obs");
  const logoutBtn = document.getElementById("logout");

  const bc = new BroadcastChannel("kelvinoz-live-frames");
  const sendCanvas = document.createElement("canvas");
  const sendCtx = sendCanvas.getContext("2d", { willReadFrequently: true });

  let stream = null;
  let characterB64 = null;
  let running = false;
  let busy = false;
  let gpuOnline = false;
  let gotFrame = false;
  let timer = null;

  obsUrl.value = `${location.origin}/obs`;

  function setStatus(text) {
    statusText.textContent = text;
  }

  function setOutputWaiting(text) {
    outputEmpty.textContent = text;
    outputEmpty.classList.remove("is-hidden");
    if (!gotFrame) output.classList.remove("is-on");
  }

  function setGpu(online, detail) {
    gpuOnline = online;
    gpuPill.textContent = online ? "GPU online" : "GPU offline";
    gpuPill.classList.toggle("pill-on", online);
    gpuPill.classList.toggle("pill-off", !online);
    if (detail && !running) setStatus(detail);
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.gpu?.online) setGpu(true, data.gpu.detail || "GPU ready");
      else setGpu(false, data.gpu?.detail || "GPU offline — set GPU_WORKER_URL");
    } catch {
      setGpu(false, "Could not reach status API");
    }
  }

  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    stream = null;
    camera.srcObject = null;
    camera.classList.remove("is-on");
    cameraEmpty.classList.remove("is-hidden");
  }

  async function ensureCamera() {
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
      });
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotReadableError" || /video source|Could not start/i.test(err?.message || "")) {
        throw new Error("Camera is busy. Close OBS webcam source, then retry.");
      }
      if (name === "NotAllowedError") {
        throw new Error("Camera permission blocked for kelvinoz.com.");
      }
      throw new Error(err?.message || "Could not open camera");
    }
    camera.srcObject = stream;
    await camera.play();
    await new Promise((r) => setTimeout(r, 250));
    const w = camera.videoWidth || 960;
    const h = camera.videoHeight || 540;
    output.width = w;
    output.height = h;
    sendCanvas.width = Math.min(w, 640);
    sendCanvas.height = Math.round(sendCanvas.width * (h / w));
    camera.classList.add("is-on");
    cameraEmpty.classList.add("is-hidden");
  }

  function drawOutputFrame(dataUrl) {
    const img = new Image();
    img.onload = () => {
      gotFrame = true;
      ctx.drawImage(img, 0, 0, output.width, output.height);
      output.classList.add("is-on");
      outputEmpty.classList.add("is-hidden");
      try {
        bc.postMessage({ type: "frame", dataUrl });
      } catch {
        // ignore
      }
    };
    img.src = dataUrl;
  }

  async function sendOneFrame() {
    if (!running || busy || !characterB64 || !gpuOnline) return;
    if (!camera.videoWidth) return;
    busy = true;
    try {
      sendCtx.drawImage(camera, 0, 0, sendCanvas.width, sendCanvas.height);
      const frame_b64 = sendCanvas.toDataURL("image/jpeg", 0.7);
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame_b64,
          character_b64: characterB64,
          prompt: promptEl.value || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.data) {
        drawOutputFrame(data.data);
        setStatus(`Live · ${data.pipeline || "gpu"} · ${data.elapsed_ms || "?"}ms`);
      } else {
        setOutputWaiting(data.error || "Waiting for face / GPU…");
        setStatus(data.error || "Transform failed");
      }
    } catch (err) {
      setOutputWaiting("GPU request failed");
      setStatus(err.message || "GPU request failed");
    } finally {
      busy = false;
    }
  }

  function startLoop() {
    stopLoop();
    timer = setInterval(sendOneFrame, 220);
    sendOneFrame();
  }

  function stopLoop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function fileToB64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    setStatus("Loading character photo…");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/character", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "Upload failed");
        return;
      }
      characterB64 = await fileToB64(file);
      photoPreview.src = characterB64;
      photoPreview.hidden = false;
      setStatus("Character ready — click Start live");
    } catch (err) {
      setStatus(err.message || "Upload failed");
    }
  });

  startBtn.addEventListener("click", async () => {
    try {
      if (!characterB64) {
        setStatus("Choose a character photo first.");
        setOutputWaiting("Upload a character photo first");
        return;
      }
      if (!gpuOnline) {
        setStatus("GPU is offline. Start Hostinger GPU worker + set GPU_WORKER_URL.");
        setOutputWaiting("GPU offline");
        return;
      }
      await ensureCamera();
      running = true;
      gotFrame = false;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      setOutputWaiting("Sending to GPU…");
      setStatus("Transforming on Hostinger GPU…");
      startLoop();
    } catch (err) {
      setStatus(err.message || "Camera failed");
      setOutputWaiting(err.message || "Camera failed");
    }
  });

  stopBtn.addEventListener("click", () => {
    running = false;
    stopLoop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    stopCamera();
    output.classList.remove("is-on");
    outputEmpty.textContent = "Waiting";
    outputEmpty.classList.remove("is-hidden");
    ctx.clearRect(0, 0, output.width, output.height);
    gotFrame = false;
    setStatus("Stopped.");
  });

  copyObs.addEventListener("click", async () => {
    await navigator.clipboard.writeText(obsUrl.value);
    setStatus("OBS Browser Source URL copied.");
  });

  logoutBtn.addEventListener("click", async () => {
    running = false;
    stopLoop();
    stopCamera();
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  });

  refreshStatus();
  setInterval(refreshStatus, 10000);
})();
