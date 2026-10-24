# VidChat

ChatGPT-style AI video generation with **bring-your-own GPU**.

## Two versions

| Version | File | Use |
|--------|------|-----|
| **Chat** | `index.html` | Prompt → generate video via your GPU `/v1/generate` |
| **Live Studio** | `studio.html` | Camera → realtime frames to `/v1/stream` |

## GPU Servers (manual import)

1. Open **GPU Servers** in the sidebar (or gear).
2. Paste your rented GPU base URL (RunPod, Vast, Hyperstack, etc.).
3. **Save** then **Deploy** (or **Save & Deploy**).
4. Generation uses only the deployed server.

Settings are stored in your browser (`localStorage`).

## Clean export

VidChat requests `watermark: false` and `add_ai_label: false` and does not burn labels into downloads. Social apps may still apply their own policies — this app does not implement detector evasion.

## Worker stub

See `worker/` for a FastAPI contract you can run on the rented box.

```bash
pip install fastapi uvicorn python-multipart pillow
python worker/server.py
```
