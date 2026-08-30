#!/usr/bin/env python3
"""Quick deploy — upload changed files and restart server (no TRT rebuild)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
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
    "realtime_engine.py",
    "lucy_backend.py",
    "start-server.sh",
]


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    return code, stdout.read().decode(), stderr.read().decode()


def main() -> None:
    print(f"Quick deploy → {USER}@{HOST}:{PORT}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

    # Kill stuck TRT builds that starve the GPU
    run(client, "pkill -f 'build_trt\\|finish_trt\\|polygraphy\\|watch-trt' 2>/dev/null || true")

    sftp = client.open_sftp()
    for name in FILES:
        local = LOCAL_DIR / name
        if not local.exists():
            print(f"Skip missing {name}")
            continue
        print(f"Upload {name}")
        sftp.put(str(local), f"{REMOTE_DIR}/{name}")
    sftp.close()

    run(client, f"chmod +x {REMOTE_DIR}/start-server.sh")
    run(
        client,
        f"cd {REMOTE_DIR} && source venv/bin/activate && pip install -q decart httpx 2>/dev/null || true",
    )
    run(client, f"echo none > {REMOTE_DIR}/.stream_accel")
    _, out, err = run(client, f"cd {REMOTE_DIR} && bash start-server.sh")
    print(out or err)

    print("Waiting for health...")
    for i in range(60):
        time.sleep(3)
        _, code, _ = run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health")
        if code.strip() == "200":
            _, health, _ = run(client, "curl -s http://127.0.0.1:8080/health")
            print("Health:", health.strip())
            break
        if i == 59:
            _, log, _ = run(client, f"tail -30 {REMOTE_DIR}/server.log")
            print("Server log:\n", log)
            client.close()
            sys.exit(1)

    # Benchmark one frame
    print("Testing /process-frame...")
    test_jpeg = (
        "python3 -c \""
        "import numpy as np,cv2; "
        "img=np.random.randint(80,200,(384,384,3),dtype=np.uint8); "
        "_,b=cv2.imencode('.jpg',img); "
        "open('/tmp/test.jpg','wb').write(b.tobytes())\""
    )
    run(client, test_jpeg)
    _, login, _ = run(
        client,
        "curl -s -X POST http://127.0.0.1:8080/api/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"password\":\"@535846.oZ\"}'",
    )
    import json

    token = json.loads(login).get("token", "")
    _, status, _ = run(
        client,
        f"curl -s http://127.0.0.1:8080/api/status -H 'Authorization: Bearer {token}'",
    )
    print("Status:", status.strip())
    _, frame_code, _ = run(
        client,
        f"curl -s -o /tmp/out.jpg -w '%{{http_code}}' -X POST http://127.0.0.1:8080/process-frame "
        f"-H 'Authorization: Bearer {token}' -H 'Content-Type: image/jpeg' --data-binary @/tmp/test.jpg",
    )
    _, size, _ = run(client, "stat -c%s /tmp/out.jpg 2>/dev/null || echo 0")
    print(f"Frame test: HTTP {frame_code.strip()}, size={size.strip()} bytes")

    client.close()
    print("\nDone — https://live.kelvinoz.com")


if __name__ == "__main__":
    main()
