(() => {
  const camera = document.getElementById("camera");
  const output = document.getElementById("output");
  const ctx = output.getContext("2d");
  const stageEmpty = document.getElementById("stage-empty");
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
  let stream = null;
  let characterImg = null;
  let characterPath = null;
  let running = false;
  let raf = 0;
  let ws = null;
  let gpuOnline = false;

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
      setGpu(Boolean(data.gpu?.online), data.gpu?.detail || (data.gpu?.online ? "GPU ready" : "GPU offline"));
      if (!data.gpu?.online) {
        setStatus(
          "Studio is ready. GPU worker is offline — deploy L40S and share SSH so live full-character AI can attach. Local camera preview still works."
        );
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
    output.width = camera.videoWidth || 1280;
    output.height = camera.videoHeight || 720;
  }

  function drawPreviewFrame() {
    if (!running) return;
    const w = output.width;
    const h = output.height;
    ctx.clearRect(0, 0, w, h);

    // Base camera
    ctx.drawImage(camera, 0, 0, w, h);

    // Soft scene wash driven by prompt keywords (local preview only)
    const prompt = (promptEl.value || "").toLowerCase();
    let wash = "rgba(20, 40, 35, 0.18)";
    if (prompt.includes("neon") || prompt.includes("night")) wash = "rgba(80, 20, 120, 0.28)";
    if (prompt.includes("beach") || prompt.includes("day")) wash = "rgba(255, 200, 120, 0.18)";
    if (prompt.includes("studio") || prompt.includes("white")) wash = "rgba(240, 240, 240, 0.2)";
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // Character reference overlay — full-frame presence (preview until GPU worker takes over)
    if (characterImg) {
      const targetH = h * 0.92;
      const scale = targetH / characterImg.height;
      const targetW = characterImg.width * scale;
      const x = (w - targetW) / 2;
      const y = h - targetH;
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.drawImage(characterImg, x, y, targetW, targetH);
      ctx.restore();
    }

    // Label so it's clear this is preview until GPU AI is attached
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(12, 12, gpuOnline ? 150 : 210, 28);
    ctx.fillStyle = "#c8f26d";
    ctx.font = "600 13px Manrope, sans-serif";
    ctx.fillText(gpuOnline ? "GPU LIVE" : "LOCAL PREVIEW", 22, 31);

    try {
      bc.postMessage({ type: "frame", dataUrl: output.toDataURL("image/jpeg", 0.7) });
    } catch {
      // ignore
    }

    raf = requestAnimationFrame(drawPreviewFrame);
  }

  function connectWs() {
    if (ws) try { ws.close(); } catch {}
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/live`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "config",
          prompt: promptEl.value,
          characterPath,
        })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "status") setStatus(msg.message || "Connected");
        if (msg.type === "error") setStatus(msg.error);
      } catch {
        // binary frames from GPU would be handled here later
      }
    };
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file);
    setStatus("Uploading character photo…");
    const res = await fetch("/api/character", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Upload failed");
      return;
    }
    characterPath = data.path;
    characterImg = new Image();
    characterImg.onload = () => {
      photoPreview.src = characterPath;
      photoPreview.hidden = false;
      setStatus("Character photo ready.");
    };
    characterImg.src = characterPath;
  });

  startBtn.addEventListener("click", async () => {
    try {
      await ensureCamera();
      stageEmpty.hidden = true;
      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      connectWs();
      drawPreviewFrame();
      setStatus(
        gpuOnline
          ? "Live with GPU worker."
          : "Live in local preview. Full AI character transform starts after L40S worker is connected."
      );
    } catch (err) {
      setStatus(err.message || "Camera permission denied");
    }
  });

  stopBtn.addEventListener("click", () => {
    running = false;
    cancelAnimationFrame(raf);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (ws) ws.close();
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
