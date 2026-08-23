"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
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
const DECART_API_KEY = process.env.DECART_API_KEY || runtimeConfig.decartApiKey || "";
const COOKIE_NAME = "kelvinoz_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const sessions = new Map();
let decartClientPromise = null;

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

async function getDecartClient() {
  if (!DECART_API_KEY) throw new Error("DECART_API_KEY not configured");
  if (!decartClientPromise) {
    decartClientPromise = import("@decartai/sdk").then(({ createDecartClient }) =>
      createDecartClient({ apiKey: DECART_API_KEY })
    );
  }
  return decartClientPromise;
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
  const lucyConfigured = Boolean(DECART_API_KEY);
  res.json({
    ok: true,
    mode: "free-local",
    freeLocal: {
      configured: true,
      detail: "Free on-device mode — MediaPipe in your browser (no Decart, no Hostinger GPU)",
    },
    lucy: {
      configured: lucyConfigured,
      model: "lucy-2.5",
      detail: lucyConfigured
        ? "Optional paid Lucy 2.5 available (Decart credits)"
        : "Lucy 2.5 is paid Decart API — free local mode does not need it",
    },
    obsBrowserSource: "/obs",
    features: {
      characterPhoto: true,
      backgroundPrompt: true,
      liveCamera: true,
      obsLink: true,
      freeLocal: true,
      lucy25: lucyConfigured,
    },
  });
});

app.post("/api/realtime-token", requireAuth, async (_req, res) => {
  if (!DECART_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: "DECART_API_KEY missing. Create a key at https://platform.decart.ai/api-keys",
    });
  }
  try {
    const client = await getDecartClient();
    // Unscoped token — origin locks can close the Lucy signaling socket
    // immediately and surface as "WebSocket is not open" in the browser.
    const token = await client.tokens.create({
      expiresIn: 900,
      allowedModels: ["lucy-2.5"],
    });
    return res.json({
      ok: true,
      apiKey: token.apiKey || token.api_key,
      expiresAt: token.expiresAt || token.expires_at,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
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
  console.log(`KelvinOz Live (Lucy 2.5) on :${PORT} key=${DECART_API_KEY ? "set" : "MISSING"}`);
});
