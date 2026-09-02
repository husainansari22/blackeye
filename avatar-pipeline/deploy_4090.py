#!/usr/bin/env python3
"""Deploy avatar-pipeline to Hostinger RTX 4090 (kelvinoz)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
    sys.exit(1)

HOST = "69.162.106.209"
PORT = 31440
USER = "ubuntu"
PASSWORD = "i1mdCHQpZ,0g"
REMOTE_DIR = "/home/ubuntu/avatar-pipeline"
LOCAL_DIR = Path(__file__).resolve().parent

UPLOAD = [
    "app.py",
    "web_ui.html",
    "faceswap_engine.py",
  "quality_engine.py",
  "stream_engine.py",
    "realtime_engine.py",
    "start-server.sh",
    "setup-4090.sh",
    "setup-stream.sh",
    "patch_streamdiffusion.py",
    "nginx.conf",
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

    run(client, f"chmod +x {REMOTE_DIR}/setup-4090.sh {REMOTE_DIR}/setup-stream.sh {REMOTE_DIR}/start-server.sh")

    print("Running setup-4090.sh (may take 20–40 min for TensorRT)...")
    _, pid_out, _ = run(
        client,
        f"cd {REMOTE_DIR} && nohup bash setup-4090.sh > setup.log 2>&1 & echo $!",
        timeout=30,
    )
    print("setup pid:", pid_out.strip())

    for i in range(480):
        time.sleep(10)
        _, tail, _ = run(client, f"tail -5 {REMOTE_DIR}/setup.log 2>/dev/null")
        if "Done. Public:" in tail or "setup.log" in tail and " OK" in tail:
            _, full, _ = run(client, f"tail -20 {REMOTE_DIR}/setup.log")
            print(full)
            break
        if "All accelerations failed" in tail:
            print("StreamDiffusion failed, starting server anyway...")
            run(client, f"cd {REMOTE_DIR} && bash start-server.sh")
            break
        if i % 6 == 0 and tail.strip():
            print(f"  ... {i * 10}s — {tail.strip()[:120]}")
    else:
        _, tail, _ = run(client, f"tail -30 {REMOTE_DIR}/setup.log")
        print("setup tail:\n", tail)
        run(client, f"cd {REMOTE_DIR} && bash start-server.sh")

    print("Health...")
    for _ in range(30):
        time.sleep(5)
        _, code, _ = run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health")
        if code.strip() == "200":
            _, h, _ = run(client, "curl -s http://127.0.0.1:8080/health")
            print("health:", h.strip())
            break

    client.close()
    print("\nLive at: https://69.162.106.209:20001")
    print("Update live.kelvinoz.com proxy to 69.162.106.209:20001 if needed.")


if __name__ == "__main__":
    main()
