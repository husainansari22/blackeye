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
  let kickTimer = null;
  let lucyReady = false;
  let gotRemote = false;
  let lastState = "";

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
    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
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
          frameRate: { ideal: resolveFpsNumber(model.fps), max: 30 },
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
    const videoTracks = remoteStream?.getVideoTracks?.() || [];
    if (!videoTracks.length) {
      setStatus("Lucy stream arrived with no video track yet");
      return;
    }

    gotRemote = true;
    clearWaiters();

    // Prefer unmuted live tracks; LiveKit sometimes delivers muted then unmute.
    videoTracks.forEach((track) => {
      track.addEventListener("unmute", () => {
        output.play().catch(() => {});
      });
    });

    output.srcObject = remoteStream;
    output.muted = true;
    output.playsInline = true;
    output.autoplay = true;
    const play = () => output.play().catch(() => {});
    play();
    output.onloadedmetadata = play;
    output.classList.add("is-on");
    outputEmpty.classList.add("is-hidden");
    startObsCapture();
    setStatus("Live · Lucy 2.5 generating");
  }

  function clearWaiters() {
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
    if (kickTimer) {
      clearTimeout(kickTimer);
      kickTimer = null;
    }
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

  async function uploadCharacterRef(client, file) {
    const prepared = await prepareCharacterBlob(file);
    setStatus(`Uploading character (${Math.round(prepared.size / 1024)} KB)…`);
    const ref = await client.files.upload(prepared, { ttlSeconds: 3600 });
    if (!ref?.id) throw new Error("Character upload returned no file id");
    return ref.id;
  }

  async function kickGeneration(imageRef) {
    if (!realtimeClient || gotRemote) return;
    const promptText = buildPrompt();
    setStatus("Starting Lucy generation…");
    setOutputMsg("Starting Lucy generation…");
    try {
      await realtimeClient.set({
        prompt: promptText,
        image: imageRef,
        enhance: false,
      });
    } catch (err) {
      setStatus(err?.message || "Lucy set() failed");
      if (!gotRemote) setOutputMsg(err?.message || "Lucy set() failed");
    }
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
    lastState = "";
    clearWaiters();
    setOutputMsg("Connecting Lucy 2.5…");
    setStatus("Getting Lucy session…");

    let imageRef = null;

    try {
      const stream = await ensureCamera();
      const apiKey = await getClientToken();
      const client = createDecartClient({ apiKey });

      setStatus("Checking network for Lucy WebRTC…");
      try {
        const preflight = await client.realtime.checkConnectivity();
        if (preflight?.quality === "critical") {
          const reason = preflight.reasons?.[0] || "WebRTC blocked on this network";
          throw new Error(`Network cannot reach Lucy (WebRTC). ${reason}`);
        }
        if (preflight?.metrics?.transport === "relay") {
          setStatus("Lucy via TURN relay (slower)…");
        }
      } catch (err) {
        // checkConnectivity may throw in odd browsers; only hard-fail critical messages we threw.
        if (/WebRTC|Network cannot reach/i.test(err?.message || "")) throw err;
      }

      imageRef = await uploadCharacterRef(client, characterFile);
      const promptText = buildPrompt();
      setStatus("Opening Lucy realtime…");
      setOutputMsg("Opening Lucy realtime…");

      realtimeClient = await client.realtime.connect(stream, {
        model,
        mirror: true,
        preferredVideoCodec: "vp8",
        onRemoteStream: (remoteStream) => attachRemote(remoteStream),
        onConnectionChange: (state) => {
          lastState = state || "";
          if (gotRemote) return;
          if (state === "generating") {
            setOutputMsg("Lucy generating video…");
            setStatus("Lucy generating…");
          } else if (state === "connected") {
            // Connected ≠ video. Stay honest in the output panel.
            setOutputMsg("Connected — waiting for Lucy video…");
            setStatus("Connected — waiting for Lucy video");
          } else if (state === "reconnecting") {
            setOutputMsg("Reconnecting to Lucy…");
            setStatus("Reconnecting…");
          } else if (state === "connecting") {
            setOutputMsg("Connecting Lucy 2.5…");
          } else if (state) {
            setStatus(`Lucy: ${state}`);
          }
        },
        onConnectionQuality: (report) => {
          if (gotRemote || !report) return;
          if (report.quality === "critical" || report.quality === "poor") {
            setStatus(`Lucy link ${report.quality}${report.limitingFactor ? ` (${report.limitingFactor})` : ""}`);
          }
        },
        onQueuePosition: (qp) => {
          const pos = qp?.position ?? qp;
          setStatus(`Lucy queue #${pos}`);
          setOutputMsg(`In Lucy queue (#${pos})…`);
        },
        initialState: {
          prompt: { text: promptText, enhance: false },
          image: imageRef,
        },
      });

      realtimeClient.on("error", (error) => {
        const msg = error?.message || String(error);
        const code = error?.code ? ` [${error.code}]` : "";
        setStatus(`${msg}${code}`);
        if (!gotRemote) setOutputMsg(`${msg}${code}`);
      });

      realtimeClient.on("generationTick", () => {
        if (!gotRemote) {
          setOutputMsg("Lucy generating frames…");
          setStatus("Lucy generating frames…");
        }
      });

      realtimeClient.on("generationEnded", (info) => {
        if (gotRemote) return;
        const reason = info?.reason || info?.message || "generation ended";
        setStatus(`Lucy stopped: ${reason}`);
        setOutputMsg(`Lucy stopped before video: ${reason}`);
      });

      realtimeClient.on("diagnostic", (event) => {
        if (gotRemote) return;
        const name = event?.name || event?.type || "";
        if (/error|fail|timeout|ice|turn/i.test(name)) {
          setStatus(`Lucy diagnostic: ${name}`);
        }
      });

      // Kick generation again shortly after connect — initialState alone can stall.
      kickTimer = setTimeout(() => {
        kickGeneration(imageRef);
      }, 1500);

      waitTimer = setTimeout(async () => {
        if (gotRemote) return;
        // One more kick before giving up.
        await kickGeneration(imageRef);
        setTimeout(() => {
          if (gotRemote) return;
          const stateHint = lastState ? ` (state: ${lastState})` : "";
          setOutputMsg(
            `No Lucy video yet${stateHint}. Top-up Decart credits at platform.decart.ai/billing, hard-refresh, close OBS webcam capture, retry.`
          );
          setStatus("No Lucy video — credits or WebRTC media path");
        }, 8000);
      }, 10000);
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus(msg);
      setOutputMsg(msg);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      clearWaiters();
      try {
        if (realtimeClient) realtimeClient.disconnect();
      } catch {
        // ignore
      }
      realtimeClient = null;
      stopLocalTracks();
    }
  }

  async function stopLucy() {
    clearWaiters();
    stopObsCapture();
    try {
      if (realtimeClient) realtimeClient.disconnect();
    } catch {
      // ignore
    }
    realtimeClient = null;
    gotRemote = false;
    lastState = "";
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
        await realtimeClient.set({
          prompt: buildPrompt(),
          enhance: false,
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
