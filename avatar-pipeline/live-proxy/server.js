const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const TARGET = process.env.GPU_BACKEND || "http://216.245.209.185:20000";
const app = express();

app.use(
  "/",
  createProxyMiddleware({
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
    },
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy -> ${TARGET} on :${port}`));
