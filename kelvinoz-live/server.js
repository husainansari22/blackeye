"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const { randomUUID } = require("crypto");

function loadRuntimeConfig() {
  const configPath = path.join(__dirname, "runtime-config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch {
    // ignore invalid config
  }
  return {};
}

const runtimeConfig = loadRuntimeConfig();
const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.ACCESS_CODE || runtimeConfig.accessCode || "@535846.oZ";
const SESSION_SECRET =
  process.env.SESSION_SECRET || runtimeConfig.sessionSecret || crypto.randomBytes(32).toString("hex");
const GPU_WORKER_URL = (
  process.env.GPU_WORKER_URL ||
  runtimeConfig.gpuWorkerUrl ||
  ""
).replace(/\/$/, "");
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
  const session = sessions.get(id);
  if (!session) {
    // Accept signed cookie even after process restart (private single-user site)
    sessions.set(id, { createdAt: Date.now() });
    return id;
  }
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
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));

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
  let gpu = { online: false, detail: "GPU worker not configured" };
  if (GPU_WORKER_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const r = await fetch(`${GPU_WORKER_URL}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        gpu = { online: true, detail: body.detail || "GPU worker online", ...body };
      } else {
        gpu = { online: false, detail: `GPU worker HTTP ${r.status}` };
      }
    } catch (err) {
      gpu = { online: false, detail: err.name === "AbortError" ? "GPU worker timeout" : String(err.message || err) };
    }
  }
  res.json({
    ok: true,
    gpu,
    obsBrowserSource: "/obs",
    features: {
      characterPhoto: true,
      backgroundPrompt: true,
      liveCamera: true,
      obsLink: true,
    },
  });
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

app.post("/api/transform", requireAuth, async (req, res) => {
  if (!GPU_WORKER_URL) {
    return res.status(503).json({
      ok: false,
      error: "GPU worker offline. Deploy L40S and set GPU_WORKER_URL.",
    });
  }
  try {
    const r = await fetch(`${GPU_WORKER_URL}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(502).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/obs", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "obs.html"));
});

app.get("/", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/live" });

wss.on("connection", (client, req) => {
  const cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter((p) => p[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))])
  );
  if (!readSession(cookies[COOKIE_NAME])) {
    client.close(4401, "Unauthorized");
    return;
  }

  let upstream;
  if (GPU_WORKER_URL) {
    try {
      const wsUrl = GPU_WORKER_URL.replace(/^http/, "ws") + "/ws/live";
      const WebSocket = require("ws");
      upstream = new WebSocket(wsUrl);
      upstream.on("message", (data) => {
        if (client.readyState === 1) client.send(data);
      });
      upstream.on("close", () => {
        if (client.readyState === 1) client.close();
      });
      upstream.on("error", () => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: "error", error: "GPU websocket error" }));
        }
      });
    } catch (err) {
      client.send(JSON.stringify({ type: "error", error: String(err.message || err) }));
    }
  } else {
    client.send(
      JSON.stringify({
        type: "status",
        gpuOnline: false,
        message: "GPU worker not connected. Local preview mode only.",
      })
    );
  }

  client.on("message", (data) => {
    if (upstream && upstream.readyState === 1) {
      upstream.send(data);
      return;
    }
    try {
      const msg = JSON.parse(String(data));
      if (msg.type === "ping") {
        client.send(JSON.stringify({ type: "pong", t: Date.now() }));
      } else if (msg.type === "config") {
        client.send(JSON.stringify({ type: "config_ack", ok: true, needs_character: !msg.character_b64 }));
      }
    } catch {
      // ignore
    }
  });

  client.on("close", () => {
    if (upstream && upstream.readyState <= 1) upstream.close();
  });
});

server.listen(PORT, () => {
  console.log(`KelvinOz Live listening on :${PORT}`);
});
