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
  const sendCtx = sendCanvas.getContext("2d");

  let stream = null;
  let characterB64 = null;
  let running = false;
  let ws = null;
  let gpuOnline = false;
  let sending = false;
  let lastSend = 0;
  const SEND_INTERVAL_MS = 180; // ~5-6 fps to GPU

  obsUrl.value = `${location.origin}/obs`;

  function setStatus(text) {
    statusText.textContent = text;
  }

  function setGpu(online, detail) {
    gpuOnline = online;
    gpuPill.textContent = online ? "GPU online" : "GPU offline";
    gpuPill.classList.toggle("pill-on", online);
    gpuPill.classList.toggle("pill-off", !online);
    if (detail) setStatus(detail);
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.gpu?.online) {
        setGpu(true, data.gpu.detail || "GPU ready");
      } else {
        setGpu(false, data.gpu?.detail || "GPU offline");
      }
    } catch {
      setGpu(false, "Could not reach status API");
    }
  }

  async function ensureCamera() {
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    camera.srcObject = stream;
    await camera.play();
    const w = camera.videoWidth || 1280;
    const h = camera.videoHeight || 720;
    output.width = w;
    output.height = h;
    sendCanvas.width = w;
    sendCanvas.height = h;
    camera.classList.add("is-on");
    cameraEmpty.classList.add("is-hidden");
  }

  function drawOutputFrame(dataUrl) {
    const img = new Image();
    img.onload = () => {
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

  function pumpFrames() {
    if (!running) return;
    const now = Date.now();
    if (
      ws &&
      ws.readyState === WebSocket.OPEN &&
      characterB64 &&
      gpuOnline &&
      !sending &&
      now - lastSend >= SEND_INTERVAL_MS &&
      camera.videoWidth > 0
    ) {
      sending = true;
      lastSend = now;
      sendCtx.drawImage(camera, 0, 0, sendCanvas.width, sendCanvas.height);
      const data = sendCanvas.toDataURL("image/jpeg", 0.72);
      ws.send(JSON.stringify({ type: "frame", data }));
      sending = false;
    }
    requestAnimationFrame(pumpFrames);
  }

  function pushConfig() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "config",
        prompt: promptEl.value,
        character_b64: characterB64,
        characterPath: characterB64 ? "loaded" : null,
      })
    );
  }

  function connectWs() {
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/live`);
    ws.onopen = () => {
      pushConfig();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "status") setStatus(msg.message || "GPU connected");
        if (msg.type === "config_ack") {
          if (msg.needs_character) setStatus("Upload a character photo first.");
          else if (msg.ok) setStatus("Character loaded on GPU. Transforming…");
        }
        if (msg.type === "frame" && msg.data) drawOutputFrame(msg.data);
        if (msg.type === "error") setStatus(msg.error || "GPU error");
      } catch {
        // ignore
      }
    };
    ws.onclose = () => {
      if (running) setStatus("GPU connection closed.");
    };
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
    setStatus("Uploading character photo…");
    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch("/api/character", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Upload failed");
      return;
    }
    characterB64 = await fileToB64(file);
    photoPreview.src = data.path;
    photoPreview.hidden = false;
    pushConfig();
    setStatus("Character photo ready — press Start camera.");
  });

  promptEl.addEventListener("change", () => pushConfig());
  promptEl.addEventListener("blur", () => pushConfig());

  startBtn.addEventListener("click", async () => {
    try {
      if (!characterB64) {
        setStatus("Choose a character photo first.");
        return;
      }
      await ensureCamera();
      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      outputEmpty.textContent = "Waiting for GPU…";
      outputEmpty.classList.remove("is-hidden");
      output.classList.remove("is-on");
      connectWs();
      pumpFrames();
      setStatus(gpuOnline ? "Sending webcam to GPU for character transform…" : "GPU offline — cannot transform.");
    } catch (err) {
      setStatus(err.message || "Camera permission denied");
    }
  });

  stopBtn.addEventListener("click", () => {
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (ws) ws.close();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    camera.srcObject = null;
    camera.classList.remove("is-on");
    output.classList.remove("is-on");
    cameraEmpty.classList.remove("is-hidden");
    outputEmpty.textContent = "Waiting";
    outputEmpty.classList.remove("is-hidden");
    ctx.clearRect(0, 0, output.width, output.height);
    setStatus("Stopped.");
  });

  copyObs.addEventListener("click", async () => {
    await navigator.clipboard.writeText(obsUrl.value);
    setStatus("OBS Browser Source URL copied.");
  });

  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  });

  refreshStatus();
  setInterval(refreshStatus, 15000);
})();
