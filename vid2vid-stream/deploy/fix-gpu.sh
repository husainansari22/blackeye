#!/usr/bin/env bash
# Upgrade PyTorch for Blackwell GPU (sm_120) + deploy updates
set -euo pipefail
cd /opt/vid2vid-stream
source venv/bin/activate

echo "Upgrading PyTorch to cu128 for Blackwell GPU..."
pip install -q --upgrade pip
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu128

echo "Verify CUDA..."
python3 -c "
import torch
print('torch', torch.__version__)
x = torch.randn(2,2, device='cuda')
print('CUDA OK:', x.sum().item())
"

echo "Pre-download models..."
python3 -c "
from diffusers import AutoPipelineForImage2Image
import torch
pipe = AutoPipelineForImage2Image.from_pretrained(
    'stabilityai/sd-turbo', torch_dtype=torch.float16, variant='fp16')
print('SD-Turbo cached')
"

# SSL cert for HTTPS camera access
sudo mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/vid2vid.crt ]; then
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/vid2vid.key \
    -out /etc/nginx/ssl/vid2vid.crt \
    -subj "/CN=50.35.188.73"
fi

sudo cp deploy/nginx-vid2vid.conf /etc/nginx/sites-available/vid2vid
sudo ln -sf /etc/nginx/sites-available/vid2vid /etc/nginx/sites-enabled/vid2vid
sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/live.kelvinoz.com
sudo nginx -t && sudo systemctl reload nginx

sudo cp deploy/vid2vid.service /etc/systemd/system/vid2vid.service
sudo systemctl daemon-reload
sudo systemctl restart vid2vid
sleep 5
curl -s http://127.0.0.1/health
echo ""
echo "Done."
echo "  Camera + webcam: expose internal port 443 as HTTPS (e.g. public :20002) → https://50.35.188.73:20002"
echo "  Video file mode: http://50.35.188.73:20001 (existing expose on port 80)"
