const token = window.VID2VID_TOKEN;
const inputVideo = document.getElementById("input-video");
const outputCanvas = document.getElementById("output-canvas");
const ctx = outputCanvas.getContext("2d");
const statsEl = document.getElementById("stats");
const statusDot = document.getElementById("status-dot");
const cameraBanner = document.getElementById("camera-banner");

let ws = null;
let stream = null;
let running = false;
let frameLoop = null;
let videoFileMode = false;

function isSecureCameraContext() {
  return window.isSecureContext || location.hostname === "localhost" || location.protocol === "https:";
}

function showBanner(msg, type = "warn") {
  cameraBanner.textContent = msg;
  cameraBanner.className = `banner ${type === "info" ? "info" : ""}`;
  cameraBanner.classList.remove("hidden");
}

async function refreshStats() {
  try {
    const res = await fetch(`/api/status?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.model_loaded) {
      statusDot.className = "ready";
      const mode = data.has_reference ? "reference" : "turbo";
      statsEl.textContent = `Ready | ${mode} | ${data.fps} fps | ${data.latency_ms}ms`;
    } else if (data.last_error) {
      statusDot.className = "error";
      statsEl.textContent = `Error: ${data.last_error.slice(0, 60)}`;
    } else {
      statusDot.className = "";
      statsEl.textContent = "Loading AI model…";
    }
  } catch (_) {
    statsEl.textContent = "Connecting…";
  }
}

setInterval(refreshStats, 2000);
refreshStats();

// Warm up model
fetch(`/api/warmup?token=${encodeURIComponent(token)}`).catch(() => {});

function getSettingsPayload() {
  return {
    prompt: document.getElementById("prompt").value,
    negative_prompt: document.getElementById("negative-prompt").value,
    strength: parseFloat(document.getElementById("strength").value),
    steps: parseInt(document.getElementById("steps").value, 10),
    width: 512,
    height: 512,
    reference_strength: parseFloat(document.getElementById("reference-strength").value),
  };
}

document.getElementById("strength").addEventListener("input", (e) => {
  document.getElementById("strength-val").textContent = e.target.value;
});
document.getElementById("steps").addEventListener("input", (e) => {
  document.getElementById("steps-val").textContent = e.target.value;
});
document.getElementById("reference-strength").addEventListener("input", (e) => {
  document.getElementById("ref-strength-val").textContent = e.target.value;
});

document.getElementById("apply-settings").addEventListener("click", async () => {
  await fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getSettingsPayload()),
  });
  alert("Settings saved.");
});

document.getElementById("copy-obs").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("obs-url").value);
});

function showReferencePreview(hasImage) {
  document.getElementById("reference-preview").classList.toggle("hidden", !hasImage);
  document.getElementById("reference-empty").classList.toggle("hidden", hasImage);
  document.getElementById("clear-reference").disabled = !hasImage;
}

async function loadReferencePreview() {
  const res = await fetch(`/api/reference-image?token=${encodeURIComponent(token)}`);
  if (!res.ok) { showReferencePreview(false); return; }
  const blob = await res.blob();
  document.getElementById("reference-preview").src = URL.createObjectURL(blob);
  showReferencePreview(true);
}

document.getElementById("upload-reference").addEventListener("click", () => {
  document.getElementById("reference-file").click();
});

document.getElementById("reference-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const btn = document.getElementById("upload-reference");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const res = await fetch(`/api/reference-image?token=${encodeURIComponent(token)}`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    await loadReferencePreview();
    await fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getSettingsPayload()),
    });
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload photo";
    e.target.value = "";
  }
});

document.getElementById("clear-reference").addEventListener("click", async () => {
  await fetch(`/api/reference-image?token=${encodeURIComponent(token)}`, { method: "DELETE" });
  document.getElementById("reference-preview").removeAttribute("src");
  showReferencePreview(false);
});

loadReferencePreview();

// Camera access
async function getCameraStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (!isSecureCameraContext()) {
      throw new Error(
        "Camera blocked on HTTP. Use https://50.35.188.73:20002 (accept certificate warning) OR click 'Or use video file' below."
      );
    }
    throw new Error("Camera not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
}

document.getElementById("video-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  videoFileMode = true;
  inputVideo.srcObject = null;
  inputVideo.src = URL.createObjectURL(file);
  inputVideo.loop = true;
  inputVideo.play();
  showBanner("Using video file as input. Click Start streaming.", "info");
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
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
    setTimeout(() => reject(new Error("WebSocket timeout")), 10000);
  });

  ws.send(JSON.stringify({ type: "settings", data: getSettingsPayload() }));

  const capture = document.createElement("canvas");
  const captureCtx = capture.getContext("2d");

  frameLoop = setInterval(() => {
    if (!running || ws.readyState !== WebSocket.OPEN) return;
    if (inputVideo.readyState < 2) return;
    capture.width = 512;
    capture.height = 512;
    captureCtx.drawImage(inputVideo, 0, 0, 512, 512);
    capture.toBlob((blob) => {
      if (blob && ws.readyState === WebSocket.OPEN) {
        blob.arrayBuffer().then((buf) => ws.send(buf));
      }
    }, "image/jpeg", 0.8);
  }, 200);

  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "error") alert("AI error: " + msg.message);
      } catch (_) {}
    } else {
      drawOutputFromBlob(new Blob([event.data], { type: "image/jpeg" }));
    }
  };
}

async function startStream() {
  const startBtn = document.getElementById("start-btn");
  startBtn.disabled = true;
  startBtn.textContent = "Starting…";

  try {
    if (!videoFileMode) {
      stream = await getCameraStream();
      inputVideo.srcObject = stream;
      cameraBanner.classList.add("hidden");
    }

    await inputVideo.play().catch(() => {});
    running = true;
    document.getElementById("stop-btn").disabled = false;
    startBtn.textContent = "▶ Start streaming";
    await startWebSocket();
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = "▶ Start streaming";
    showBanner(err.message);
    alert(err.message);
  }
}

function stopStream() {
  running = false;
  if (frameLoop) { clearInterval(frameLoop); frameLoop = null; }
  if (ws) { ws.close(); ws = null; }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;
}

document.getElementById("start-btn").addEventListener("click", startStream);
document.getElementById("stop-btn").addEventListener("click", stopStream);

// Show camera warning on HTTP
if (!isSecureCameraContext()) {
  showBanner(
    "Camera needs HTTPS. Open https://50.35.188.73:20002 and accept the certificate, OR use 'Or use video file' for testing.",
    "info"
  );
}
