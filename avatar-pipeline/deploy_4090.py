#!/usr/bin/env python3
"""Deploy avatar-pipeline to Hostinger RTX 4090 (kelvinoz) — new IP."""

from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
    sys.exit(1)

HOST = "216.245.209.185"
PORT = 30914
USER = "ubuntu"
PASSWORD = "FL8CRMXIkaNp"
REMOTE_DIR = "/home/ubuntu/avatar-pipeline"
LOCAL_DIR = Path(__file__).resolve().parent

UPLOAD = [
    "app.py",
    "web_ui.html",
    "body_engine.py",
    "faceswap_engine.py",
    "quality_engine.py",
    "stream_engine.py",
    "stream_ip_engine.py",
    "realtime_engine.py",
    "start-server.sh",
    "setup-4090.sh",
    "setup-stream.sh",
    "setup-stream-ip.sh",
    "patch_streamdiffusion.py",
    "nginx.conf",
    "nginx-simple.conf",
]


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    return code, stdout.read().decode(), stderr.read().decode()


def main() -> None:
    print(f"Deploy → {USER}@{HOST}:{PORT}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=60)

    run(client, f"mkdir -p {REMOTE_DIR}")
    sftp = client.open_sftp()
    for name in UPLOAD:
        local = LOCAL_DIR / name
        if not local.exists():
            print(f"skip missing {name}")
            continue
        print(f"upload {name}")
        sftp.put(str(local), f"{REMOTE_DIR}/{name}")
    sftp.close()

    run(client, f"chmod +x {REMOTE_DIR}/*.sh")
    print("Public: http://216.245.209.185:20000")
    client.close()


if __name__ == "__main__":
    main()
