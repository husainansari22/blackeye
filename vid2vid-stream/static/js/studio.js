const token = window.VID2VID_TOKEN;
const inputVideo = document.getElementById("input-video");
const outputCanvas = document.getElementById("output-canvas");
const ctx = outputCanvas.getContext("2d");
const statsEl = document.getElementById("stats");

let ws = null;
let pc = null;
let stream = null;
let running = false;
let frameLoop = null;

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function refreshStats() {
  try {
    const res = await fetch(`/api/status?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    statsEl.textContent = `GPU: ${data.device} | FPS: ${data.fps} | Latency: ${data.latency_ms}ms | Model: ${data.model_loaded ? "ready" : "loading"}`;
  } catch (_) {}
}

setInterval(refreshStats, 2000);
refreshStats();

function getSettingsPayload() {
  return {
    prompt: document.getElementById("prompt").value,
    negative_prompt: document.getElementById("negative-prompt").value,
    strength: parseFloat(document.getElementById("strength").value),
    steps: parseInt(document.getElementById("steps").value, 10),
    width: parseInt(document.getElementById("width").value, 10),
    height: parseInt(document.getElementById("height").value, 10),
  };
}

document.getElementById("strength").addEventListener("input", (e) => {
  document.getElementById("strength-val").textContent = e.target.value;
});
document.getElementById("steps").addEventListener("input", (e) => {
  document.getElementById("steps-val").textContent = e.target.value;
});

document.getElementById("apply-settings").addEventListener("click", async () => {
  await fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getSettingsPayload()),
  });
});

document.getElementById("copy-obs").addEventListener("click", async () => {
  const input = document.getElementById("obs-url");
  await navigator.clipboard.writeText(input.value);
});

function drawOutputFromBlob(blob) {
  createImageBitmap(blob).then((bitmap) => {
    outputCanvas.width = bitmap.width;
    outputCanvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
  });
}

async function startWebSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/stream?token=${encodeURIComponent(token)}`);
  ws.binaryType = "arraybuffer";

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.send(JSON.stringify({ type: "settings", data: getSettingsPayload() }));

  const capture = document.createElement("canvas");
  const captureCtx = capture.getContext("2d");

  frameLoop = setInterval(async () => {
    if (!running || ws.readyState !== WebSocket.OPEN) return;
    const w = parseInt(document.getElementById("width").value, 10);
    const h = parseInt(document.getElementById("height").value, 10);
    capture.width = w;
    capture.height = h;
    captureCtx.drawImage(inputVideo, 0, 0, w, h);
    capture.toBlob((blob) => {
      if (blob && ws.readyState === WebSocket.OPEN) {
        blob.arrayBuffer().then((buf) => ws.send(buf));
      }
    }, "image/jpeg", 0.75);
  }, 120);

  ws.onmessage = (event) => {
    if (typeof event.data !== "string") {
      drawOutputFromBlob(new Blob([event.data], { type: "image/jpeg" }));
    }
  };
}

async function startWebRTC() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  pc.ontrack = (event) => {
    const remote = document.createElement("video");
    remote.srcObject = event.streams[0];
    remote.play();
    const draw = () => {
      if (!running) return;
      outputCanvas.width = remote.videoWidth || 512;
      outputCanvas.height = remote.videoHeight || 512;
      ctx.drawImage(remote, 0, 0, outputCanvas.width, outputCanvas.height);
      requestAnimationFrame(draw);
    };
    remote.onloadedmetadata = draw;
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch("/api/webrtc/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sdp: offer.sdp,
      type: offer.type,
      token,
    }),
  });
  const answer = await res.json();
  if (!res.ok) throw new Error(answer.detail || "WebRTC failed");
  await pc.setRemoteDescription(answer);
}

async function startStream() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  inputVideo.srcObject = stream;
  running = true;
  document.getElementById("start-btn").disabled = true;
  document.getElementById("stop-btn").disabled = false;

  if (document.getElementById("use-webrtc").checked) {
    try {
      await startWebRTC();
      return;
    } catch (err) {
      console.warn("WebRTC failed, falling back to WebSocket", err);
    }
  }
  await startWebSocket();
}

function stopStream() {
  running = false;
  if (frameLoop) clearInterval(frameLoop);
  if (ws) { ws.close(); ws = null; }
  if (pc) { pc.close(); pc = null; }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;
}

document.getElementById("start-btn").addEventListener("click", () => {
  startStream().catch((err) => alert(err.message));
});
document.getElementById("stop-btn").addEventListener("click", stopStream);
