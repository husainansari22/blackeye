#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/vid2vid-stream"
DOMAIN="live.kelvinoz.com"

echo "[1/7] System packages..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq \
  python3-venv python3-dev \
  nginx certbot python3-certbot-nginx \
  build-essential pkg-config \
  libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
  libswscale-dev libswresample-dev libavfilter-dev \
  libopus-dev libvpx-dev libsrtp2-dev \
  git curl

echo "[2/7] App directory..."
sudo mkdir -p "$APP_DIR" /var/www/certbot
sudo chown -R ubuntu:ubuntu "$APP_DIR"

echo "[3/7] Python venv + dependencies..."
python3 -m venv "$APP_DIR/venv"
source "$APP_DIR/venv/bin/activate"
pip install --upgrade pip wheel setuptools
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r "$APP_DIR/requirements.txt"

echo "[4/7] Pre-download model (optional warmup)..."
python3 - <<'PY'
from diffusers import AutoPipelineForImage2Image
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32
AutoPipelineForImage2Image.from_pretrained(
    "stabilityai/sd-turbo",
    torch_dtype=dtype,
    variant="fp16" if device == "cuda" else None,
)
print("Model cached.")
PY

echo "[5/7] systemd service..."
sudo cp "$APP_DIR/deploy/vid2vid.service" /etc/systemd/system/vid2vid.service
sudo systemctl daemon-reload
sudo systemctl enable vid2vid
sudo systemctl restart vid2vid

echo "[6/7] nginx + TLS..."
sudo cp "$APP_DIR/deploy/nginx-live.kelvinoz.com.http.conf" /etc/nginx/sites-available/live.kelvinoz.com
sudo ln -sf /etc/nginx/sites-available/live.kelvinoz.com /etc/nginx/sites-enabled/live.kelvinoz.com
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  sudo certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" \
    --non-interactive --agree-tos -m admin@kelvinoz.com
fi

sudo cp "$APP_DIR/deploy/nginx-live.kelvinoz.com.conf" /etc/nginx/sites-available/live.kelvinoz.com
sudo nginx -t
sudo systemctl reload nginx

echo "[7/7] Status..."
sleep 3
sudo systemctl status vid2vid --no-pager || true
curl -s http://127.0.0.1:8765/health || true
echo "\nDeploy complete: https://$DOMAIN"
