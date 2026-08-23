#!/usr/bin/env bash
# Run on the Hostinger L40S after SSH login.
set -euo pipefail

APP_DIR="${APP_DIR:-/root/kelvinoz-gpu-worker}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Install CUDA PyTorch matching the L40S driver after verifying nvidia-smi.
# Example (adjust cu version after checking driver):
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

cat > /etc/systemd/system/kelvinoz-gpu.service <<'UNIT'
[Unit]
Description=KelvinOz GPU Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/kelvinoz-gpu-worker
Environment=PORT=8000
ExecStart=/root/kelvinoz-gpu-worker/.venv/bin/python /root/kelvinoz-gpu-worker/main.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now kelvinoz-gpu.service
systemctl status kelvinoz-gpu.service --no-pager

echo "Expose port 8000 in Hostinger GPU → Manage → Exposed services (HTTP)."
echo "Then set GPU_WORKER_URL on kelvinoz.com Node app to that public URL."
