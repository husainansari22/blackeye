(function () {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const menuBtn = document.getElementById("menu-btn");
  const cam = document.getElementById("cam");
  const camPh = document.getElementById("cam-ph");
  const aiOut = document.getElementById("ai-out");
  const aiCanvas = document.getElementById("ai-canvas");
  const aiPh = document.getElementById("ai-ph");
  const liveIndicator = document.getElementById("live-indicator");
  const stylePrompt = document.getElementById("style-prompt");
  const btnCam = document.getElementById("btn-cam");
  const btnLive = document.getElementById("btn-live");
  const btnStop = document.getElementById("btn-stop");
  const btnSnap = document.getElementById("btn-snap");

  let stream = null;
  let live = false;
  let timer = null;
  let localPreview = false;

  VidChatGpuPanel.inject();

  menuBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
  });
  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
  });

  stylePrompt.addEventListener("input", () => {
    stylePrompt.style.height = "auto";
    stylePrompt.style.height = Math.min(stylePrompt.scrollHeight, 120) + "px";
  });

  async function enableCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false,
      });
      cam.srcObject = stream;
      camPh.style.display = "none";
      btnSnap.disabled = false;
      VidChatGpuPanel.toast("Camera ready");
    } catch (e) {
      VidChatGpuPanel.toast("Camera blocked: " + (e.message || "permission"));
    }
  }

  function setLiveUi(on) {
    live = on;
    liveIndicator.classList.toggle("on", on);
    liveIndicator.textContent = on ? "LIVE" : "Idle";
    btnStop.disabled = !on;
    btnLive.disabled = on;
  }

  function startLocalPreview() {
    localPreview = true;
    aiCanvas.style.display = "block";
    aiOut.style.display = "none";
    aiPh.style.display = "none";
    const ctx = aiCanvas.getContext("2d");
    const off = document.createElement("canvas");
    function tick() {
      if (!live || !localPreview) return;
      const w = cam.videoWidth || 360;
      const h = cam.videoHeight || 640;
      aiCanvas.width = w;
      aiCanvas.height = h;
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (cam.videoWidth) octx.drawImage(cam, 0, 0, w, h);
      else {
        octx.fillStyle = "#111";
        octx.fillRect(0, 0, w, h);
      }
      const frame = octx.getImageData(0, 0, w, h);
      const d = frame.data;
      // mild stylize only — no text overlays / AI labels burned in
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        d[i] = Math.min(255, r * 0.9 + 20);
        d[i + 1] = Math.min(255, g * 1.05);
        d[i + 2] = Math.min(255, b * 1.15 + 10);
      }
      ctx.putImageData(frame, 0, 0);
      requestAnimationFrame(tick);
    }
    tick();
  }

  async function pushFrame() {
    const server = VidChatStore.getActiveServer();
    if (!server || !live) return;
    if (!cam.videoWidth) return;

    const c = document.createElement("canvas");
    c.width = cam.videoWidth;
    c.height = cam.videoHeight;
    c.getContext("2d").drawImage(cam, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.72));
    if (!blob) return;

    const path = server.streamPath.startsWith("/")
      ? server.streamPath
      : "/" + server.streamPath;
    const headers = {};
    if (server.token) headers.Authorization = "Bearer " + server.token;
    if (VidChatStore.getCleanExport()) headers["X-Clean-Export"] = "1";
    headers["X-Style-Prompt"] = stylePrompt.value.trim() || "";

    try {
      const form = new FormData();
      form.append("frame", blob, "frame.jpg");
      form.append("prompt", stylePrompt.value.trim() || "");
      form.append("watermark", "false");
      form.append("add_ai_label", "false");

      const res = await fetch(server.url + path, {
        method: "POST",
        headers,
        body: form,
        mode: "cors",
      });
      if (!res.ok) throw new Error("stream " + res.status);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("image/")) {
        const outBlob = await res.blob();
        aiOut.src = URL.createObjectURL(outBlob);
        aiOut.style.display = "block";
        aiCanvas.style.display = "none";
        aiPh.style.display = "none";
        localPreview = false;
      } else if (ct.includes("application/json")) {
        const data = await res.json();
        const url = data.url || data.image_url || data.frame;
        if (url) {
          aiOut.src = url;
          aiOut.style.display = "block";
          aiCanvas.style.display = "none";
          aiPh.style.display = "none";
          localPreview = false;
        }
      }
    } catch {
      // keep local stylize preview if remote stream fails
      if (!localPreview) startLocalPreview();
    }
  }

  async function goLive() {
    if (!stream) await enableCamera();
    if (!stream) return;

    const server = VidChatStore.getActiveServer();
    setLiveUi(true);
    if (!server) {
      VidChatGpuPanel.toast("No GPU deployed — local preview only");
      aiPh.textContent = "Local preview (deploy GPU for remote AI)";
      startLocalPreview();
      return;
    }

    aiPh.textContent = "Streaming to " + server.name + "…";
    await pushFrame();
    timer = setInterval(pushFrame, 450);
    // If first frames fail, fall back to local preview without labels
    setTimeout(() => {
      if (live && aiOut.style.display === "none" && aiCanvas.style.display === "none") {
        startLocalPreview();
        VidChatGpuPanel.toast("GPU stream unreachable — local preview");
      }
    }, 2500);
  }

  function stopLive() {
    setLiveUi(false);
    localPreview = false;
    clearInterval(timer);
    timer = null;
    aiPh.style.display = "";
    aiPh.textContent = "Deploy a GPU server, then Go Live";
  }

  btnCam.onclick = enableCamera;
  btnLive.onclick = goLive;
  btnStop.onclick = stopLive;
  btnSnap.onclick = () => {
    const source =
      aiOut.style.display !== "none" && aiOut.src
        ? aiOut
        : aiCanvas.style.display !== "none"
          ? aiCanvas
          : cam;
    const c = document.createElement("canvas");
    const w = source.videoWidth || source.naturalWidth || source.width || 720;
    const h = source.videoHeight || source.naturalHeight || source.height || 1280;
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(source, 0, 0, w, h);
    // Clean export: never stamp text/watermarks on download
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "vidchat-frame.png";
    a.click();
  };

  VidChatGpuPanel.refresh();
})();
