/**
 * live.kelvinoz.com proxy
 * - Lucy key save + client-token mint always local (works if GPU is down)
 * - Login/status: prefer GPU when reachable, else local
 * - UI served from web_ui.html when present
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const TARGET = process.env.GPU_BACKEND || "http://127.0.0.1:8080";
const APP_PASSWORD = process.env.APP_PASSWORD || "@535846.oZ";
const SECRETS_PATH = process.env.LUCY_SECRETS_PATH || path.join(__dirname, ".lucy_secrets.json");
const DECART_API_BASE = (process.env.DECART_API_BASE || "https://api.decart.ai").replace(/\/$/, "");
const LUCY_ORIGIN = (process.env.LUCY_ALLOWED_ORIGIN || "https://live.kelvinoz.com").replace(/\/$/, "");
const DEFAULT_MODEL = process.env.LUCY_MODEL || "lucy-2.5";
const UI_PATH = process.env.UI_PATH || (fs.existsSync(path.join(__dirname, "web_ui.html")) ? path.join(__dirname, "web_ui.html") : path.join(__dirname, "..", "web_ui.html"));

const app = express();
const sessions = new Set();

function readStore() {
  try {
    if (!fs.existsSync(SECRETS_PATH)) return {};
    return JSON.parse(fs.readFileSync(SECRETS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function deriveKey() {
  return crypto.createHash("sha256").update(APP_PASSWORD).digest();
}

function encrypt(plain) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "aes:" + Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decrypt(blob) {
  if (!blob) return "";
  if (blob.startsWith("aes:")) {
    const buf = Buffer.from(blob.slice(4), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
  if (blob.startsWith("b64:")) return Buffer.from(blob.slice(4), "base64url").toString("utf8");
  return blob;
}

function getApiKey() {
  const store = readStore();
  const enc = store.api_key_enc || store.api_key;
  if (enc) {
    try {
      const k = decrypt(enc).trim();
      if (k) return k;
    } catch {}
  }
  return (process.env.DECART_API_KEY || "").trim();
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 10) return key.slice(0, 2) + "…" + key.slice(-2);
  return key.slice(0, 6) + "…" + key.slice(-4);
}

function keyStatus() {
  const store = readStore();
  const hasSaved = !!(store.api_key_enc || store.api_key);
  const key = getApiKey();
  return {
    configured: !!key,
    source: hasSaved ? "saved" : process.env.DECART_API_KEY ? "env" : "none",
    masked: maskKey(key),
    model: (store.model || DEFAULT_MODEL).trim(),
    updated_at: store.updated_at || null,
    allowed_origin: LUCY_ORIGIN || null,
  };
}

function bearer(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.query.token || "").trim();
}

function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ detail: "Unauthorized" });
  }
  next();
}

async function gpuHealthy() {
  try {
    const r = await fetch(TARGET.replace(/\/$/, "") + "/health", {
      signal: AbortSignal.timeout(2500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

app.use(express.json({ limit: "2mb" }));

app.get("/vendor/decart-sdk.js", (_req, res) => {
  const file = path.join(__dirname, "vendor", "decart-sdk.js");
  if (!fs.existsSync(file)) return res.status(404).send("SDK missing");
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(file);
});

app.get("/vendor/frame-metadata-worker.js", (_req, res) => {
  const file = path.join(__dirname, "vendor", "frame-metadata-worker.js");
  if (!fs.existsSync(file)) return res.status(404).send("Worker missing");
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(file);
});

app.get("/health", async (_req, res) => {
  const gpu = await gpuHealthy();
  res.json({ status: "ok", proxy: true, gpu, lucy: keyStatus().configured, target: TARGET });
});

app.post("/api/login", async (req, res) => {
  const password = (req.body && req.body.password) || "";

  // Prefer GPU login when online so Local GPU mode shares the same session token.
  if (await gpuHealthy()) {
    try {
      const r = await fetch(TARGET.replace(/\/$/, "") + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.token) {
        sessions.add(data.token);
        return res.status(r.status).json(data);
      }
      // Fall through to local if GPU rejects for unexpected reasons and password matches.
      if (r.status === 401) return res.status(401).json(data);
    } catch {}
  }

  if (password !== APP_PASSWORD) return res.status(401).json({ detail: "Wrong password" });
  const token = crypto.randomBytes(24).toString("base64url");
  sessions.add(token);
  res.json({ token, mode: "proxy-local" });
});

app.get("/api/lucy/key", requireAuth, (_req, res) => {
  res.json(keyStatus());
});

app.put("/api/lucy/key", requireAuth, async (req, res) => {
  const apiKey = ((req.body && (req.body.api_key || req.body.apiKey)) || "").trim();
  const model = ((req.body && req.body.model) || DEFAULT_MODEL).trim();
  if (!apiKey || apiKey.length < 8) return res.status(400).json({ detail: "API key is required" });
  const store = readStore();
  store.api_key_enc = encrypt(apiKey);
  delete store.api_key;
  store.model = model || DEFAULT_MODEL;
  store.updated_at = Math.floor(Date.now() / 1000);
  writeStore(store);

  // Best-effort sync to GPU backend so both sides share the key.
  if (await gpuHealthy()) {
    try {
      await fetch(TARGET.replace(/\/$/, "") + "/api/lucy/key", {
        method: "PUT",
        headers: {
          Authorization: req.headers.authorization || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ api_key: apiKey, model }),
      });
    } catch {}
  }
  res.json(keyStatus());
});

app.delete("/api/lucy/key", requireAuth, async (req, res) => {
  const store = readStore();
  delete store.api_key_enc;
  delete store.api_key;
  store.updated_at = Math.floor(Date.now() / 1000);
  writeStore(store);
  if (await gpuHealthy()) {
    try {
      await fetch(TARGET.replace(/\/$/, "") + "/api/lucy/key", {
        method: "DELETE",
        headers: { Authorization: req.headers.authorization || "" },
      });
    } catch {}
  }
  res.json(keyStatus());
});

app.post("/api/lucy/token", requireAuth, async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(400).json({ detail: "Lucy API key not configured — save your Decart key first" });
  }
  const model = ((req.body && req.body.model) || keyStatus().model || DEFAULT_MODEL).trim();
  const origin = ((req.body && req.body.origin) || req.headers.origin || LUCY_ORIGIN || "").replace(/\/$/, "");
  const origins = [...new Set([origin, LUCY_ORIGIN, "http://localhost:3000"].filter(Boolean))].slice(0, 20);
  try {
    const resp = await fetch(`${DECART_API_BASE}/v1/client/tokens`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresIn: 300,
        allowedModels: [model, "lucy-2.5", "lucy-2.1", "lucy-latest"],
        allowedOrigins: origins,
        constraints: { realtime: { maxSessionDuration: 1800 } },
      }),
    });
    const text = await resp.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      return res.status(400).json({
        detail: `Decart token mint failed (${resp.status}): ${text.slice(0, 400)}`,
      });
    }
    res.json({
      apiKey: data.apiKey || data.api_key,
      expiresAt: data.expiresAt || data.expires_at,
      model,
      permissions: data.permissions,
      constraints: data.constraints,
    });
  } catch (e) {
    res.status(500).json({ detail: String(e.message || e) });
  }
});

app.get("/api/status", requireAuth, async (req, res) => {
  const lucy = keyStatus();
  let gpu = null;
  if (await gpuHealthy()) {
    try {
      const r = await fetch(TARGET.replace(/\/$/, "") + "/api/status", {
        headers: { Authorization: req.headers.authorization || "" },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) gpu = await r.json();
    } catch {}
  }
  if (gpu) {
    gpu.lucy = lucy;
    return res.json(gpu);
  }
  res.json({
    ready: true,
    device: "lucy-proxy",
    fps: 0,
    latency_ms: 0,
    has_reference: false,
    mode: lucy.configured ? "lucy-ready" : "lucy-key-missing",
    frame_size: 720,
    acceleration: "decart-webrtc",
    last_error: null,
    lucy,
  });
});

app.get("/", (req, res, next) => {
  if (fs.existsSync(UI_PATH)) {
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(path.resolve(UI_PATH));
  }
  next();
});

const proxy = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  secure: false,
  proxyTimeout: 3600000,
  timeout: 3600000,
  on: {
    proxyReq(proxyReq, req) {
      if (req.headers["x-forwarded-proto"]) {
        proxyReq.setHeader("X-Forwarded-Proto", req.headers["x-forwarded-proto"]);
      }
    },
    error(err, _req, res) {
      if (res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            detail:
              "GPU backend unreachable. Lucy Cloud mode still works if your API key is saved on this site.",
            error: String(err.message || err),
            target: TARGET,
          })
        );
      }
    },
  },
});

app.use("/", proxy);

const port = process.env.PORT || 3000;
const server = app.listen(port, () =>
  console.log(`Proxy -> ${TARGET} on :${port} (Lucy key mint local)`)
);
server.on("upgrade", proxy.upgrade);
