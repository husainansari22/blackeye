#!/usr/bin/env bash
# setup.sh — Run on Ubuntu GPU server (RTX PRO 6000 / Blackwell)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[1/6] Free port 80..."
sudo fuser -k 80/tcp 2>/dev/null || true
sudo systemctl stop nginx 2>/dev/null || true
sudo systemctl stop vid2vid 2>/dev/null || true
sleep 1

echo "[2/6] System packages..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-dev python3-pip \
  build-essential libgl1 libglib2.0-0 git curl

echo "[3/6] Python virtualenv..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip wheel setuptools

echo "[4/6] PyTorch CUDA 12.8 (Blackwell sm_120)..."
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

echo "[5/6] Application dependencies..."
pip install \
  fastapi==0.115.6 \
  "uvicorn[standard]==0.34.0" \
  python-multipart==0.0.20 \
  opencv-python-headless==4.10.0.84 \
  Pillow==11.1.0 \
  numpy==1.26.4 \
  diffusers==0.32.2 \
  transformers==4.47.1 \
  accelerate==1.2.1 \
  safetensors==0.4.5 \
  peft==0.14.0 \
  huggingface-hub==0.36.2 \
  einops

export HF_HOME="${APP_DIR}/.cache/huggingface"
export TRANSFORMERS_CACHE="${HF_HOME}"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
mkdir -p "$HF_HOME"

echo "[6/6] Pre-download model weights..."
python3 - <<'PY'
import torch
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler, AutoPipelineForImage2Image

device = "cuda:0" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device.startswith("cuda") else torch.float32

pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5", torch_dtype=dtype, safety_checker=None,
)
pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
print("LCM-LoRA cached on", device)
PY

echo "Starting server on 0.0.0.0:80 ..."
# Must run as root to bind port 80; use venv Python so packages are found
exec sudo env \
  PATH="${APP_DIR}/venv/bin:${PATH}" \
  HF_HOME="${HF_HOME}" \
  TRANSFORMERS_CACHE="${HF_HOME}" \
  APP_PASSWORD="${APP_PASSWORD}" \
  PYTHONPATH="${APP_DIR}" \
  "${APP_DIR}/venv/bin/python" -m uvicorn app:app --host 0.0.0.0 --port 80 --workers 1
