# KelvinOz Live

Private live studio for **kelvinoz.com** — **your** app on **your** Hostinger GPU.

## What this is

Original KelvinOz software (not Decart Lucy code):

- Access-code gate
- Webcam Source / Live Output
- Character photo + scene prompt
- Frames sent to your GPU worker (`/transform`)
- OBS Browser Source at `/obs`

## Honest quality note

This is **not** Lucy 2.5. Lucy’s model is proprietary. On Hostinger GPU we run open pipelines (InsightFace / LivePortrait when installed). Same product shape — different model.

## Website env

```bash
ACCESS_CODE=@535846.oZ
SESSION_SECRET=change-me
GPU_WORKER_URL=https://your-gpu-worker-public-url
PORT=3000
NODE_ENV=production
```

Or `runtime-config.json`:

```json
{
  "accessCode": "@535846.oZ",
  "gpuWorkerUrl": "https://your-gpu-worker-public-url"
}
```

## GPU worker (Hostinger)

1. Start a Hostinger GPU instance
2. Copy `kelvinoz-live/gpu-worker/` onto the machine
3. Run `bash setup.sh` (or start uvicorn on port 8000)
4. Expose port 8000 (Hostinger Exposed Services or a tunnel)
5. Set that public URL as `GPU_WORKER_URL` on the website and restart Node

## Local website

```bash
cd kelvinoz-live
npm install
ACCESS_CODE='@535846.oZ' GPU_WORKER_URL='http://127.0.0.1:8000' npm start
```
