#!/usr/bin/env bash
# Enable HTTPS for webcam access (live.kelvinoz.com + self-signed IP fallback)
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ubuntu/avatar-pipeline}"
cd "$APP_DIR"

echo "[1] Install nginx + certbot..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -qq nginx certbot python3-certbot-nginx openssl

echo "[2] Move app to backend port 8080..."
sudo fuser -k 80/tcp 8080/tcp 443/tcp 2>/dev/null || true
sleep 2

# Stop old uvicorn on :80
sudo pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 1

echo "[3] Start uvicorn on 127.0.0.1:8080..."
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
nohup sudo env \
  PATH="${APP_DIR}/venv/bin:$PATH" \
  HF_HOME="$HF_HOME" APP_PASSWORD="$APP_PASSWORD" PYTHONPATH="$APP_DIR" \
  "${APP_DIR}/venv/bin/python" -m uvicorn app:app \
  --host 127.0.0.1 --port 8080 --workers 1 \
  > "${APP_DIR}/server.log" 2>&1 &

sleep 4
curl -sf http://127.0.0.1:8080/health || { echo "Backend failed"; tail -20 server.log; exit 1; }

echo "[4] Self-signed cert (instant HTTPS fallback)..."
sudo mkdir -p /etc/nginx/ssl /var/www/certbot
if [ ! -f /etc/nginx/ssl/avatar.crt ]; then
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/avatar.key \
    -out /etc/nginx/ssl/avatar.crt \
    -subj "/CN=live.kelvinoz.com" \
    -addext "subjectAltName=DNS:live.kelvinoz.com,DNS:kelvinoz.com,IP:50.35.188.73"
fi

echo "[5] Configure nginx..."
sudo cp "${APP_DIR}/nginx.conf" /etc/nginx/sites-available/avatar
sudo ln -sf /etc/nginx/sites-available/avatar /etc/nginx/sites-enabled/avatar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "[6] Try Let's Encrypt for live.kelvinoz.com..."
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot \
  -d live.kelvinoz.com \
  --non-interactive --agree-tos -m admin@kelvinoz.com \
  --preferred-challenges http 2>/dev/null && {
  sudo tee /etc/nginx/sites-available/avatar-le <<'NGX'
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name live.kelvinoz.com;
    ssl_certificate /etc/letsencrypt/live/live.kelvinoz.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/live.kelvinoz.com/privkey.pem;
    client_max_body_size 25M;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
    }
}
NGX
  sudo ln -sf /etc/nginx/sites-available/avatar-le /etc/nginx/sites-enabled/avatar-le
  sudo nginx -t && sudo systemctl reload nginx
  echo "Let's Encrypt OK for live.kelvinoz.com"
} || echo "Certbot skipped (port 80 may not be reachable externally yet)"

curl -sf http://127.0.0.1/health && echo " HTTP OK"
curl -sfk https://127.0.0.1/health && echo " HTTPS OK"

echo ""
echo "============================================"
echo "WEBCAM URL (HTTPS — accept certificate once):"
echo "  https://live.kelvinoz.com:20002"
echo "  OR https://50.35.188.73:20002"
echo ""
echo "In hPanel → GPU → Exposed services → ADD:"
echo "  Internal port: 443 | Scheme: HTTPS | TCP"
echo "  (keep port 80/20001 for HTTP fallback)"
echo "============================================"
