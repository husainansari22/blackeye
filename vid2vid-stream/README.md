# Kelvin Vid2Vid Live Stream

Real-time video-to-video AI transformation with WebRTC/WebSocket streaming and OBS Browser Source integration.

## URLs

- **Studio:** https://live.kelvinoz.com/
- **OBS output:** https://live.kelvinoz.com/obs?token=...
- **Password:** configured via `VID2VID_PASSWORD` env var

## Features

- Webcam capture in browser → GPU server frame processing (SD-Turbo img2img)
- WebSocket frame pipeline (default) + WebRTC mode
- OBS Browser Source via MJPEG stream or canvas page
- Password-protected access with JWT tokens

## Local dev

```bash
cd vid2vid-stream
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export VID2VID_PASSWORD='your-password'
uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
```

## Deploy (Hostinger GPU VPS)

```bash
# Copy project to /opt/vid2vid-stream on the VPS, then:
bash deploy/install.sh
```

DNS: `live.kelvinoz.com` A record → VPS IP (main kelvinoz.com site unchanged).
