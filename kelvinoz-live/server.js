"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { randomUUID } = require("crypto");

function loadRuntimeConfig() {
  const configPath = path.join(__dirname, "runtime-config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch {
    // ignore
  }
  return {};
}

const runtimeConfig = loadRuntimeConfig();
const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.ACCESS_CODE || runtimeConfig.accessCode || "@535846.oZ";
const SESSION_SECRET =
  process.env.SESSION_SECRET || runtimeConfig.sessionSecret || crypto.randomBytes(32).toString("hex");
const GPU_WORKER_URL = String(process.env.GPU_WORKER_URL || runtimeConfig.gpuWorkerUrl || "").replace(/\/$/, "");
const COOKIE_NAME = "kelvinoz_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const sessions = new Map();

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSession() {
  const id = randomUUID();
  const token = `${id}.${sign(id)}`;
  sessions.set(id, { createdAt: Date.now() });
  return token;
}

function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [id, sig] = token.split(".");
  if (!id || sig !== sign(id)) return null;
  if (!sessions.has(id)) sessions.set(id, { createdAt: Date.now() });
  const session = sessions.get(id);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return id;
}

function requireAuth(req, res, next) {
  const sid = readSession(req.cookies[COOKIE_NAME]);
  if (!sid) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return res.redirect("/login");
  }
  req.sessionId = sid;
  next();
}

function fetchJson(url, options = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, options, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { raw };
        }
        resolve({ status: resp.statusCode || 0, data });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("GPU request timeout"));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function gpuHealth() {
  if (!GPU_WORKER_URL) {
    return { online: false, detail: "Set GPU_WORKER_URL to your Hostinger GPU worker" };
  }
  try {
    const { status, data } = await fetchJson(`${GPU_WORKER_URL}/health`, { method: "GET" }, 6000);
    if (status >= 200 && status < 300 && data) {
      return {
        online: Boolean(data.model_ready || data.ok),
        detail: data.detail || data.pipeline || "GPU ready",
        pipeline: data.pipeline,
        hasCharacter: data.has_character,
      };
    }
    return { online: false, detail: `GPU health HTTP ${status}` };
  } catch (err) {
    return { online: false, detail: err.message || "GPU unreachable" };
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      cb(null, `character-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      return cb(new Error("Only PNG, JPG, or WebP images are allowed"));
    }
    cb(null, true);
  },
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use("/assets", express.static(path.join(__dirname, "public", "assets"), { maxAge: 0 }));

app.get("/login", (req, res) => {
  if (readSession(req.cookies[COOKIE_NAME])) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/api/login", (req, res) => {
  const code = String(req.body?.code || "");
  if (code !== ACCESS_CODE) {
    return res.status(401).json({ ok: false, error: "Invalid access code" });
  }
  const token = createSession();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  });
  return res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const sid = readSession(req.cookies[COOKIE_NAME]);
  if (sid) sessions.delete(sid);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/status", requireAuth, async (_req, res) => {
  const gpu = await gpuHealth();
  res.json({
    ok: true,
    mode: "hostinger-gpu",
    gpu: {
      online: gpu.online,
      detail: gpu.detail,
      pipeline: gpu.pipeline,
      configured: Boolean(GPU_WORKER_URL),
    },
    obsBrowserSource: "/obs",
    features: {
      characterPhoto: true,
      backgroundPrompt: true,
      liveCamera: true,
      obsLink: true,
      hostingerGpu: true,
    },
  });
});

app.post("/api/transform", requireAuth, async (req, res) => {
  if (!GPU_WORKER_URL) {
    return res.status(503).json({ ok: false, error: "GPU_WORKER_URL not configured" });
  }
  try {
    const body = JSON.stringify({
      frame_b64: req.body?.frame_b64 || null,
      character_b64: req.body?.character_b64 || null,
      prompt: req.body?.prompt || "",
    });
    const { status, data } = await fetchJson(
      `${GPU_WORKER_URL}/transform`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        body,
      },
      20000
    );
    if (status >= 200 && status < 300) return res.status(status).json(data);
    return res.status(status || 502).json(data?.error ? data : { ok: false, error: `GPU HTTP ${status}` });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message || "GPU transform failed" });
  }
});

app.post("/api/character", requireAuth, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.file) return res.status(400).json({ ok: false, error: "Photo required" });
    const publicPath = `/media/${path.basename(req.file.filename)}`;
    res.json({ ok: true, path: publicPath, filename: req.file.filename });
  });
});

app.get("/media/:name", requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

app.get("/obs", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "obs.html"));
});

app.get("/", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

http.createServer(app).listen(PORT, () => {
  console.log(`KelvinOz Live (Hostinger GPU) on :${PORT} worker=${GPU_WORKER_URL || "MISSING"}`);
});
