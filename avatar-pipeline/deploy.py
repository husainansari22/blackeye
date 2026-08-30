#!/usr/bin/env python3
"""
deploy.py — Upload avatar-pipeline to GPU server, install StreamDiffusion, start server.

Usage:
    pip install paramiko
    python3 deploy.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Install paramiko: pip install paramiko")
    sys.exit(1)

HOST = "50.35.188.73"
PORT = 30394
USER = "ubuntu"
PASSWORD = "PwWtPLZog64f"
REMOTE_DIR = "/home/ubuntu/avatar-pipeline"

LOCAL_DIR = Path(__file__).resolve().parent
FILES = [
    "app.py",
    "stream_engine.py",
    "setup.sh",
    "setup-stream.sh",
    "start-server.sh",
    "patch_streamdiffusion.py",
    "nginx.conf",
]


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    return code, stdout.read().decode(), stderr.read().decode()


def main() -> None:
    print(f"Connecting to {USER}@{HOST}:{PORT} ...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

    run(client, f"mkdir -p {REMOTE_DIR}")

    sftp = client.open_sftp()
    for name in FILES:
        local = LOCAL_DIR / name
        remote = f"{REMOTE_DIR}/{name}"
        print(f"Uploading {name}")
        sftp.put(str(local), remote)
    sftp.close()

    run(client, f"chmod +x {REMOTE_DIR}/setup.sh {REMOTE_DIR}/setup-stream.sh {REMOTE_DIR}/start-server.sh")

    print("Running setup-stream.sh (TensorRT build may take several minutes)...")
    code, out, err = run(
        client,
        f"cd {REMOTE_DIR} && nohup bash setup-stream.sh > setup-stream.log 2>&1 & echo $!",
        timeout=30,
    )
    print("Setup PID:", out.strip())

    print("Waiting for setup + server start (up to 25 min)...")
    started = False
    for i in range(300):
        time.sleep(5)
        _, log_tail, _ = run(client, f"tail -3 {REMOTE_DIR}/setup-stream.log 2>/dev/null")
        if "Done. Run" in log_tail or "READY accel=" in log_tail:
            print("Setup finished:", log_tail.strip())
            run(client, f"cd {REMOTE_DIR} && bash start-server.sh")
            started = True
            break
        if "All accelerations failed" in log_tail:
            print("Setup failed:", log_tail)
            _, full, _ = run(client, f"tail -40 {REMOTE_DIR}/setup-stream.log")
            print(full)
            client.close()
            sys.exit(1)
        if i % 12 == 0 and i > 0:
            _, tail, _ = run(client, f"tail -5 {REMOTE_DIR}/setup-stream.log 2>/dev/null")
            print(f"  ... {i*5}s —", tail.strip()[:200])

    if not started:
        _, tail, _ = run(client, f"tail -30 {REMOTE_DIR}/setup-stream.log")
        print("Setup log tail:\n", tail)
        run(client, f"cd {REMOTE_DIR} && bash start-server.sh")
        started = True

    print("Waiting for health check...")
    for i in range(120):
        time.sleep(5)
        _, code, _ = run(
            client,
            "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health 2>/dev/null || echo fail",
        )
        if code.strip() == "200":
            _, health, _ = run(client, "curl -s http://127.0.0.1:8080/health")
            print("Health:", health.strip())
            _, accel, _ = run(client, f"cat {REMOTE_DIR}/.stream_accel 2>/dev/null")
            print("Acceleration:", accel.strip())
            break
        if i % 6 == 0:
            _, tail, _ = run(client, f"tail -3 {REMOTE_DIR}/server.log 2>/dev/null")
            print(f"  ... waiting ({i*5}s) —", tail.strip()[:150])
    else:
        _, tail, _ = run(client, f"tail -40 {REMOTE_DIR}/server.log")
        print("Server log:\n", tail)
        client.close()
        sys.exit(1)

    client.close()
    print("\nDeploy complete")
    print("Open: https://live.kelvinoz.com")
    print("Password: @535846.oZ")


if __name__ == "__main__":
    main()
