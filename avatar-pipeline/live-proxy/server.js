const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const TARGET = process.env.GPU_BACKEND || "https://69.162.106.209:20001";
const app = express();

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
        if (req.headers["x-forwarded-proto"]) {
          proxyReq.setHeader("X-Forwarded-Proto", req.headers["x-forwarded-proto"]);
        }
      },
    },
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy -> ${TARGET} on :${port}`));
