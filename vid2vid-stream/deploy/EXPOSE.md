# Expose Vid2Vid on Hostinger GPU

Hostinger GPU instances block all inbound HTTP traffic until you register an **Exposed Service** in hPanel.

## One-time hPanel step (required)

1. Open **hPanel → Dev tools → GPU → Manage** your instance
2. Go to **Exposed services → Add service**
3. Configure:
   - **Service name:** `vid2vid`
   - **Internal port:** `80`
   - **Scheme:** HTTP
   - **Protocol:** TCP
4. Click **Save**

After 1–2 minutes, `http://50.35.188.73/` should return the app (not `502`).

## DNS (already configured)

- `live.kelvinoz.com` → A record → `50.35.188.73`
- Main site `kelvinoz.com` is unchanged (still on shared hosting)

## Enable HTTPS

Once port 80 is reachable from the internet, SSH in and run:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d live.kelvinoz.com --non-interactive --agree-tos -m admin@kelvinoz.com
sudo cp /opt/vid2vid-stream/deploy/nginx-live.kelvinoz.com.conf /etc/nginx/sites-available/live.kelvinoz.com
sudo nginx -t && sudo systemctl reload nginx
```

## Access

| URL | Purpose |
|-----|---------|
| https://live.kelvinoz.com/ | Studio (password login) |
| https://live.kelvinoz.com/obs?token=... | OBS Browser Source |

**Password:** `@535846.oZ`

## Service management

```bash
sudo systemctl status vid2vid
sudo journalctl -u vid2vid -f
curl http://127.0.0.1/health
```
