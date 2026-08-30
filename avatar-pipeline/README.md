# Avatar Stream — Full-Body Real-Time Transformation

Real-time full-body pose tracking (ControlNet OpenPose) + reference avatar styling (IP-Adapter) on NVIDIA RTX PRO 6000.

## Public URL

**https://50.35.188.73:20001** → internal port **80**

Password: `@535846.oZ`

## Files

| File | Purpose |
|------|---------|
| `app.py` | FastAPI server + inline dashboard + `/process-frame` |
| `setup.sh` | Install deps, download models, bind `0.0.0.0:80` |
| `deploy.py` | SSH upload + remote setup via Paramiko |

## Quick deploy (local machine)

```bash
pip install paramiko
python3 deploy.py
```

## Manual deploy (SSH)

```bash
scp -P 30394 app.py setup.sh ubuntu@50.35.188.73:~/avatar-pipeline/
ssh -p 30394 ubuntu@50.35.188.73
cd ~/avatar-pipeline && chmod +x setup.sh && ./setup.sh
```

## Usage

1. Open https://50.35.188.73:20001
2. Login with password
3. Upload **Reference Avatar Photo** (target look)
4. Click **Start** (allow camera) or use **Video file**
5. Browser sends frames at **30 FPS** to `/process-frame`; GPU returns transformed JPEG

## Stack

- FastAPI + Uvicorn on `0.0.0.0:80`
- PyTorch 2.11+cu128 (Blackwell sm_120)
- ControlNet OpenPose (`lllyasviel/control_v11p_sd15_openpose`)
- IP-Adapter SD1.5 for reference image conditioning
