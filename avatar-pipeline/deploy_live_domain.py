#!/usr/bin/env python3
"""
Point live.kelvinoz.com at the RTX 4090 GPU backend.

live.kelvinoz.com DNS → Hostinger CDN (77.x) → Node live-proxy → GPU :20001
The proxy env GPU_BACKEND must be updated on Hostinger hosting (not the GPU VM).

If you use Hostinger hPanel → Websites → live.kelvinoz.com → Node.js / Environment:
  GPU_BACKEND=https://69.162.106.209:20001
Then redeploy / restart the app.

This script only verifies connectivity from here and prints the exact target.
"""

from __future__ import annotations

import sys

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
    sys.exit(1)

GPU_HOST = "69.162.106.209"
GPU_SSH_PORT = 31440
GPU_USER = "ubuntu"
GPU_PASS = "i1mdCHQpZ,0g"
GPU_PUBLIC = f"https://{GPU_HOST}:20001"
DOMAIN = "https://live.kelvinoz.com"


def run(client, cmd, timeout=60):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    o.channel.recv_exit_status()
    return o.read().decode(), e.read().decode()


def main() -> None:
    print(f"GPU backend should be: {GPU_PUBLIC}")
    print(f"Domain to fix:       {DOMAIN}")
    print()
    print("live.kelvinoz.com is NOT on the GPU server.")
    print("It is Hostinger web hosting (CDN) with a reverse proxy to the GPU.")
    print("Updating server.js in git is not enough — redeploy the proxy on Hostinger.")
    print()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(GPU_HOST, port=GPU_SSH_PORT, username=GPU_USER, password=GPU_PASS, timeout=30)

    health, _ = run(client, "curl -s http://127.0.0.1:8080/health")
    nginx, _ = run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/health")
    ui, _ = run(client, "curl -s http://127.0.0.1:8080/ | head -c 80")
    client.close()

    print("GPU server (4090) status:")
    print(f"  health: {health.strip()}")
    print(f"  nginx:80 → {nginx.strip()}")
    print(f"  UI: {ui.strip()}...")
    print()
    print("─── Fix live.kelvinoz.com (pick one) ───")
    print()
    print("OPTION A — Update Hostinger proxy (recommended, keeps :443 URL)")
    print("  1. hPanel → Websites → live.kelvinoz.com")
    print("  2. Node.js app / Environment variables")
    print(f"  3. Set GPU_BACKEND={GPU_PUBLIC}")
    print("  4. Redeploy or Restart")
    print()
    print("OPTION B — DNS straight to GPU")
    print(f"  1. DNS A record: live.kelvinoz.com → {GPU_HOST}")
    print("  2. hPanel GPU → kelvinoz → Exposed services → add domain live.kelvinoz.com")
    print(f"  3. Or use {GPU_PUBLIC} (no custom domain)")
    print()
    print("Until the proxy is updated, live.kelvinoz.com will 504 (old Blackwell IP).")


if __name__ == "__main__":
    main()
