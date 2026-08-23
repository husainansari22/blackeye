# KelvinOz Live

Private live character transformation studio for **kelvinoz.com**.

## Features

- Access-code gate (`ACCESS_CODE`)
- Character photo upload (full-look target, not face-only UI)
- Background / scene text prompt
- Live camera studio
- OBS Browser Source URL (`/obs`)
- GPU worker package for Hostinger L40S (`gpu-worker/`)

## Environment

```bash
ACCESS_CODE=@535846.oZ
SESSION_SECRET=change-me
GPU_WORKER_URL=https://your-l40s-exposed-service-url
PORT=3000
NODE_ENV=production
```

## Hostinger GPU (L40S)

Hostinger GPU is **not** available in the public API. Deploy in hPanel:

1. Dev tools → GPU → Deploy **L40S**
2. Instance size: **largest RAM/storage** (avoid Nano / 1 GB)
3. OS: Ubuntu 24.04
4. Manage → Overview → copy **SSH IP + password** (or add SSH key before deploy)
5. SSH in, copy `gpu-worker/`, run `bash setup.sh`
6. Manage → Exposed services → expose port **8000** (HTTP)
7. Set `GPU_WORKER_URL` on the website Node app to that URL

## Local run

```bash
cd kelvinoz-live
npm install
ACCESS_CODE='@535846.oZ' npm start
```
