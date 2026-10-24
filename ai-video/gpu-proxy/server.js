const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

const TARGET = process.env.GPU_BACKEND || "http://162.43.170.108:30002";
const BASIC = process.env.GPU_BASIC_AUTH || ""; // user:pass optional server-side

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Clean-Export", "X-Style-Prompt"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, proxy: true, target: TARGET });
});

app.use(
  "/",
  createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    ws: true,
    proxyTimeout: 3600000,
    timeout: 3600000,
    on: {
      proxyReq(proxyReq, req) {
        if (BASIC && !req.headers.authorization) {
          const token = Buffer.from(BASIC).toString("base64");
          proxyReq.setHeader("Authorization", "Basic " + token);
        }
        proxyReq.setHeader("X-Forwarded-Proto", "https");
      },
    },
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`VidChat GPU proxy -> ${TARGET} on :${port}`));
