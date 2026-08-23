import { createDecartClient, models } from "@decartai/sdk";

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
  let lucyReady = false;

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

  async function ensureCamera() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        frameRate: model.fps,
        width: { ideal: model.width },
        height: { ideal: model.height },
      },
    });
    camera.srcObject = localStream;
    await camera.play();
    camera.classList.add("is-on");
    cameraEmpty.classList.add("is-hidden");
    return localStream;
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
      setStatus("Lucy is offline — Decart key missing.");
      setOutputMsg("Lucy offline");
      return;
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    setOutputMsg("Connecting Lucy 2.5…");
    setStatus("Getting Lucy session…");

    try {
      const stream = await ensureCamera();
      const apiKey = await getClientToken();
      setStatus("Opening Lucy realtime…");

      const client = createDecartClient({ apiKey });
      const promptText = buildPrompt();

      realtimeClient = await client.realtime.connect(stream, {
        model,
        mirror: "auto",
        preferredVideoCodec: "vp8",
        onRemoteStream: (remoteStream) => {
          output.srcObject = remoteStream;
          output.muted = true;
          output.playsInline = true;
          output.play().catch(() => {});
          output.classList.add("is-on");
          outputEmpty.classList.add("is-hidden");
          startObsCapture();
          setStatus("Live · Lucy 2.5");
        },
        onConnectionChange: (state) => {
          if (state && state !== "connected") setStatus(`Lucy connection: ${state}`);
        },
        initialState: {
          prompt: { text: promptText, enhance: true },
          image: characterFile,
        },
      });

      setStatus("Live · Lucy 2.5 connected");
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
      throw err;
    }
  }

  async function stopLucy() {
    stopObsCapture();
    try {
      if (realtimeClient) await realtimeClient.disconnect();
    } catch {
      // ignore
    }
    realtimeClient = null;
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    camera.srcObject = null;
    output.srcObject = null;
    camera.classList.remove("is-on");
    output.classList.remove("is-on");
    cameraEmpty.classList.remove("is-hidden");
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
    if (realtimeClient) {
      realtimeClient
        .set({ prompt: buildPrompt(), image: file, enhance: true })
        .catch((err) => setStatus(err.message || "Failed to update character"));
    }
  });

  let promptTimer = null;
  promptEl.addEventListener("input", () => {
    if (!realtimeClient) return;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(() => {
      const opts = { prompt: buildPrompt(), enhance: true };
      if (characterFile) opts.image = characterFile;
      realtimeClient.set(opts).catch((err) => setStatus(err.message || "Failed to update prompt"));
    }, 600);
  });

  startBtn.addEventListener("click", async () => {
    try {
      await startLucy();
    } catch {
      // already surfaced
    }
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
