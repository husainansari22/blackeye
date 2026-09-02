#!/usr/bin/env bash
# setup-4090.sh — RTX 4090 Ada · Ubuntu 24.04 · StreamDiffusion + TensorRT
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[1/8] System packages..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-dev python3-pip \
  build-essential libgl1 libglib2.0-0 git curl nginx

echo "[2/8] Python venv..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip wheel setuptools

echo "[3/8] PyTorch CUDA 12.4 (RTX 4090 Ada)..."
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

echo "[4/8] App dependencies..."
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
  einops \
  insightface \
  onnxruntime-gpu==1.19.2 \
  mediapipe

export HF_HOME="${APP_DIR}/.cache/huggingface"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
mkdir -p "$HF_HOME"

echo "[5/8] StreamDiffusion..."
bash "$APP_DIR/setup-stream.sh" || {
  echo "WARN: StreamDiffusion/TRT setup failed — will run PyTorch-only"
  echo "none" > "$APP_DIR/.stream_accel"
}

echo "[6/8] Nginx..."
sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/avatar
sudo ln -sf /etc/nginx/sites-available/avatar /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo "[7/8] Start server..."
bash "$APP_DIR/start-server.sh"

echo "[8/8] Health check..."
sleep 5
curl -sf http://127.0.0.1:8080/health && echo " OK" || echo " WARN: backend not ready yet"
echo "Done. Public: https://69.162.106.209:20001"
