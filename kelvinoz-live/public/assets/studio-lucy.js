import { createDecartClient, models, resolveFpsNumber } from "@decartai/sdk";

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

  const model = models.realtime("lucy-2.5");
  const bc = new BroadcastChannel("kelvinoz-live-frames");

  let localStream = null;
  let characterFile = null;
  let realtimeClient = null;
  let captureTimer = null;
  let waitTimer = null;
  let lucyReady = false;
  let gotRemote = false;

  obsUrl.value = `${location.origin}/obs`;

  function setStatus(text) {
    statusText.textContent = text;
  }

  function setOutputMsg(text) {
    outputEmpty.textContent = text;
    outputEmpty.classList.remove("is-hidden");
  }

  function setLucy(online, detail) {
    lucyReady = online;
    lucyPill.textContent = online ? "Lucy 2.5 ready" : "Lucy offline";
    lucyPill.classList.toggle("pill-on", online);
    lucyPill.classList.toggle("pill-off", !online);
    if (detail && !realtimeClient) setStatus(detail);
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.lucy?.configured) setLucy(true, data.lucy.detail || "Lucy 2.5 configured");
      else setLucy(false, data.lucy?.detail || "Add DECART_API_KEY");
    } catch {
      setLucy(false, "Status check failed");
    }
  }

  async function getClientToken() {
    const res = await fetch("/api/realtime-token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Token failed (${res.status})`);
    if (!data.apiKey) throw new Error("Token response missing apiKey");
    return data.apiKey;
  }

  function buildPrompt() {
    const scene = (promptEl.value || "").trim();
    const parts = [
      "Substitute the character in the video with the person in the reference image.",
      "Full-body character transformation matching pose and motion from the webcam.",
    ];
    if (scene) parts.push(`Change the background/scene to: ${scene}`);
    return parts.join(" ");
  }

  /** Compress reference photo so Lucy handshake stays fast/reliable. */
  async function prepareCharacterBlob(file) {
    const bmp = await createImageBitmap(file);
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Failed to prepare character photo");
    return new File([blob], "character.jpg", { type: "image/jpeg" });
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
          frameRate: { ideal: resolveFpsNumber(model.fps) },
          width: { ideal: model.width },
          height: { ideal: model.height },
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

  function attachRemote(remoteStream) {
    gotRemote = true;
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
    output.srcObject = remoteStream;
    output.muted = true;
    output.playsInline = true;
    const play = () => output.play().catch(() => {});
    play();
    output.onloadedmetadata = play;
    output.classList.add("is-on");
    outputEmpty.classList.add("is-hidden");
    startObsCapture();
    setStatus("Live · Lucy 2.5 generating");
  }

  function startObsCapture() {
    stopObsCapture();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    captureTimer = setInterval(() => {
      if (!output.videoWidth) return;
      canvas.width = output.videoWidth;
      canvas.height = output.videoHeight;
      ctx.drawImage(output, 0, 0);
      try {
        bc.postMessage({ type: "frame", dataUrl: canvas.toDataURL("image/jpeg", 0.7) });
      } catch {
        // ignore
      }
    }, 200);
  }

  function stopObsCapture() {
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
  }

  async function startLucy() {
    if (!characterFile) {
      setStatus("Choose a character photo first.");
      setOutputMsg("Upload a character photo first");
      return;
    }
    if (!lucyReady) {
      setStatus("Lucy offline — Decart key missing.");
      setOutputMsg("Lucy offline");
      return;
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    gotRemote = false;
    setOutputMsg("Connecting Lucy 2.5…");
    setStatus("Getting Lucy session…");

    try {
      const stream = await ensureCamera();
      const apiKey = await getClientToken();
      const character = await prepareCharacterBlob(characterFile);
      const promptText = buildPrompt();
      setStatus("Opening Lucy realtime…");

      const client = createDecartClient({ apiKey });

      realtimeClient = await client.realtime.connect(stream, {
        model,
        mirror: true,
        onRemoteStream: (remoteStream) => attachRemote(remoteStream),
        onConnectionChange: (state) => {
          if (gotRemote) return;
          if (state === "generating") setOutputMsg("Lucy generating…");
          else if (state === "connected") setOutputMsg("Connected — waiting for Lucy video…");
          else if (state === "reconnecting") setOutputMsg("Reconnecting…");
          setStatus(`Lucy: ${state}`);
        },
        onQueuePosition: (qp) => {
          const pos = qp?.position ?? qp;
          setStatus(`Lucy queue position: ${pos}`);
          setOutputMsg(`In Lucy queue (#${pos})…`);
        },
        initialState: {
          prompt: { text: promptText, enhance: true },
          image: character,
        },
      });

      realtimeClient.on("error", (error) => {
        const msg = error?.message || String(error);
        setStatus(msg);
        if (!gotRemote) setOutputMsg(msg);
      });

      realtimeClient.on("generationTick", () => {
        if (!gotRemote) setOutputMsg("Lucy generating frames…");
      });

      // Force generation start in case initial handshake image didn't apply.
      try {
        await realtimeClient.set({
          prompt: promptText,
          image: character,
          enhance: true,
        });
      } catch (err) {
        setStatus(err?.message || "Lucy set() failed");
      }

      if (!gotRemote) {
        setStatus("Live · waiting for Lucy video track");
        setOutputMsg("Waiting for Lucy video…");
        waitTimer = setTimeout(() => {
          if (gotRemote) return;
          setOutputMsg(
            "No Lucy video yet. Check Decart credits at platform.decart.ai/billing (most common), then hard refresh and retry."
          );
          setStatus("No remote video — likely zero Decart credits or blocked WebRTC UDP");
        }, 12000);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus(msg);
      setOutputMsg(msg);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      try {
        if (realtimeClient) await realtimeClient.disconnect();
      } catch {
        // ignore
      }
      realtimeClient = null;
      stopLocalTracks();
    }
  }

  async function stopLucy() {
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
    stopObsCapture();
    try {
      if (realtimeClient) await realtimeClient.disconnect();
    } catch {
      // ignore
    }
    realtimeClient = null;
    gotRemote = false;
    stopLocalTracks();
    output.srcObject = null;
    output.classList.remove("is-on");
    outputEmpty.textContent = "Waiting";
    outputEmpty.classList.remove("is-hidden");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("Stopped.");
  }

  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    characterFile = file;
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
    setStatus("Character photo ready — click Start live");
  });

  let promptTimer = null;
  promptEl.addEventListener("input", () => {
    if (!realtimeClient || !characterFile) return;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(async () => {
      try {
        const character = await prepareCharacterBlob(characterFile);
        await realtimeClient.set({
          prompt: buildPrompt(),
          image: character,
          enhance: true,
        });
      } catch (err) {
        setStatus(err.message || "Failed to update prompt");
      }
    }, 700);
  });

  startBtn.addEventListener("click", () => {
    startLucy();
  });

  stopBtn.addEventListener("click", () => {
    stopLucy();
  });

  copyObs.addEventListener("click", async () => {
    await navigator.clipboard.writeText(obsUrl.value);
    setStatus("OBS Browser Source URL copied.");
  });

  logoutBtn.addEventListener("click", async () => {
    await stopLucy();
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  });

  refreshStatus();
  setInterval(refreshStatus, 15000);
})();
