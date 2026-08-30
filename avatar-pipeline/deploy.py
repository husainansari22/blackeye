#!/usr/bin/env python3
"""
deploy.py — Upload app.py + setup.sh to GPU server and run setup remotely.

Usage (from your local machine or this cloud agent):
    pip install paramiko
    python3 deploy.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Install paramiko: pip install paramiko")
    sys.exit(1)

# --- Server credentials (Hostinger GPU) ---
HOST = "50.35.188.73"
PORT = 30394
USER = "ubuntu"
PASSWORD = "PwWtPLZog64f"
REMOTE_DIR = "/home/ubuntu/avatar-pipeline"

LOCAL_DIR = Path(__file__).resolve().parent
FILES = ["app.py", "setup.sh"]


def main() -> None:
    print(f"Connecting to {USER}@{HOST}:{PORT} ...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

    # Create remote directory
    stdin, stdout, stderr = client.exec_command(f"mkdir -p {REMOTE_DIR}")
    stdout.channel.recv_exit_status()

    # Upload files
    sftp = client.open_sftp()
    for name in FILES:
        local = LOCAL_DIR / name
        remote = f"{REMOTE_DIR}/{name}"
        print(f"Uploading {name} -> {remote}")
        sftp.put(str(local), remote)
    sftp.close()

    # Run setup in background (starts long-running server on :80)
    print("Running setup.sh (install + start server in background)...")
    cmd = (
        f"chmod +x {REMOTE_DIR}/setup.sh && "
        f"cd {REMOTE_DIR} && "
        f"nohup bash setup.sh > {REMOTE_DIR}/deploy.log 2>&1 & echo $!"
    )
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    pid = stdout.read().decode().strip()
    print(f"Setup PID: {pid}")

    print("Waiting for server (up to 10 min for model download)...")
    for i in range(120):
        time.sleep(5)
        stdin, stdout, stderr = client.exec_command(
            f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1/health 2>/dev/null || echo fail"
        )
        code = stdout.read().decode().strip()
        if code == "200":
            stdin, stdout, stderr = client.exec_command(f"curl -s http://127.0.0.1/health")
            print("Health:", stdout.read().decode().strip())
            break
        if i % 6 == 0:
            stdin, stdout, stderr = client.exec_command(f"tail -5 {REMOTE_DIR}/deploy.log 2>/dev/null")
            print(f"  ... still starting ({i*5}s) —", stdout.read().decode().strip()[:120])
    else:
        stdin, stdout, stderr = client.exec_command(f"tail -40 {REMOTE_DIR}/deploy.log")
        print("Log tail:\n", stdout.read().decode())
        client.close()
        sys.exit(1)

    client.close()

    print("\n✓ Deploy complete")
    print("Open: https://50.35.188.73:20001")
    print("Password: @535846.oZ")


if __name__ == "__main__":
    main()
