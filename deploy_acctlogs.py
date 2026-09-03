#!/usr/bin/env python3
"""Deploy Acctlogs static sample to acctlogs.kelvinoz.com via Hostinger API."""

from __future__ import annotations

import os
import sys
import time
import zipfile
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "requests"])
    import requests

API_BASE = "https://developers.hostinger.com"
USERNAME = "u343769360"
DOMAIN = "acctlogs.kelvinoz.com"
ARCHIVE_NAME = "acctlogs_sample.zip"
ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "acctlogs.html"


def api(token: str, method: str, path: str, **kwargs) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=120, **kwargs)


def make_archive(dest: Path) -> None:
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(SOURCE, "index.html")


def tus_upload(token: str, archive: Path) -> None:
    resp = api(
        token,
        "POST",
        "/api/hosting/v1/files/upload-urls",
        json={"username": USERNAME, "domain": DOMAIN},
    )
    resp.raise_for_status()
    data = resp.json()
    url, auth, rest = data["url"], data["auth_key"], data["rest_auth_key"]
    size = archive.stat().st_size
    target = f"{url}/{ARCHIVE_NAME}?override=true"
    headers = {"X-Auth": auth, "X-Auth-Rest": rest, "Tus-Resumable": "1.0.0"}
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


def deploy(token: str) -> None:
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}/deploy"
    body = {"archive_path": ARCHIVE_NAME}
    resp = api(token, "POST", path, json=body)
    resp.raise_for_status()
    print(resp.json())


def main() -> None:
    token = os.environ.get("HOSTINGER_API_TOKEN")
    if not token:
        print("Set HOSTINGER_API_TOKEN", file=sys.stderr)
        sys.exit(1)
    if not SOURCE.exists():
        print(f"Missing {SOURCE}", file=sys.stderr)
        sys.exit(1)

    archive = Path("/tmp") / ARCHIVE_NAME
    make_archive(archive)
    print(f"Created archive ({archive.stat().st_size} bytes)")
    print(f"Uploading to {DOMAIN}...")
    tus_upload(token, archive)
    print("Upload complete. Deploying...")
    deploy(token)
    print(f"Deployed. Live URL: https://{DOMAIN}/")
    time.sleep(3)


if __name__ == "__main__":
    main()
