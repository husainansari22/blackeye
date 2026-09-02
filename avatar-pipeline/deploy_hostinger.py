#!/usr/bin/env python3
"""Deploy live-proxy to live.kelvinoz.com via Hostinger API."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path

try:
    import requests
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "requests"])
    import requests

API_BASE = "https://developers.hostinger.com"
USERNAME = "u343769360"
DOMAIN = "live.kelvinoz.com"
GPU_BACKEND = os.environ.get("GPU_BACKEND", "http://69.162.106.209:20001")
ARCHIVE_NAME = "live-proxy.zip"
ROOT = Path(__file__).resolve().parent
PROXY_DIR = ROOT / "live-proxy"


def api(token: str, method: str, path: str, **kwargs) -> requests.Response:
    url = f"{API_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.request(method, url, headers=headers, timeout=120, **kwargs)


def make_archive(dest: Path) -> None:
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in ("server.js", "package.json"):
            zf.write(PROXY_DIR / name, name)


def tus_upload(token: str, archive: Path) -> None:
    resp = api(token, "POST", "/api/hosting/v1/files/upload-urls", json={"username": USERNAME, "domain": DOMAIN})
    resp.raise_for_status()
    data = resp.json()
    url, auth, rest = data["url"], data["auth_key"], data["rest_auth_key"]
    size = archive.stat().st_size
    target = f"{url}/{ARCHIVE_NAME}?override=true"
    headers = {
        "X-Auth": auth,
        "X-Auth-Rest": rest,
        "Tus-Resumable": "1.0.0",
    }
    create = requests.post(
        target,
        headers={**headers, "Upload-Length": str(size), "Upload-Offset": "0"},
        timeout=120,
    )
    create.raise_for_status()
    patch = requests.patch(
        target,
        headers={
            **headers,
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": "0",
        },
        data=archive.read_bytes(),
        timeout=120,
    )
    patch.raise_for_status()


def set_env(token: str) -> None:
    body = {"env_vars": [{"key": "GPU_BACKEND", "value": GPU_BACKEND}]}
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds/settings/env"
    resp = api(token, "PUT", path, json=body)
    resp.raise_for_status()


def start_build(token: str) -> str:
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds"
    body = {
        "node_version": 18,
        "app_type": "express",
        "root_directory": None,
        "output_directory": None,
        "build_script": "build",
        "entry_file": "server.js",
        "package_manager": "npm",
        "source_type": "archive",
        "source_options": {"archive_path": ARCHIVE_NAME},
    }
    resp = api(token, "POST", path, json=body)
    resp.raise_for_status()
    return resp.json()["uuid"]


def wait_build(token: str, build_uuid: str, timeout: int = 180) -> str:
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds"
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = api(token, "GET", path)
        resp.raise_for_status()
        for item in resp.json()["data"]:
            if item["uuid"] == build_uuid:
                state = item["state"]
                if state in ("completed", "failed"):
                    return state
        time.sleep(5)
    raise TimeoutError("build did not finish in time")


def main() -> None:
    token = os.environ.get("HOSTINGER_API_TOKEN")
    if not token:
        print("Set HOSTINGER_API_TOKEN", file=sys.stderr)
        sys.exit(1)

    archive = Path("/tmp") / ARCHIVE_NAME
    make_archive(archive)
    print(f"Created {archive} ({archive.stat().st_size} bytes)")

    print("Uploading archive...")
    tus_upload(token, archive)

    print(f"Setting GPU_BACKEND={GPU_BACKEND}")
    set_env(token)

    print("Starting Node.js build...")
    build_uuid = start_build(token)
    print(f"Build {build_uuid} started")

    state = wait_build(token, build_uuid)
    print(f"Build state: {state}")
    if state != "completed":
        sys.exit(1)

    health = requests.get(f"https://{DOMAIN}/health", timeout=30)
    print(f"https://{DOMAIN}/health → {health.status_code} {health.text.strip()}")


if __name__ == "__main__":
    main()
