#!/usr/bin/env python3
"""Deploy VidChat static site to vidchat.kelvinoz.com via Hostinger API.

Requires: HOSTINGER_API_TOKEN
Never commits the token. Only targets vidchat.kelvinoz.com.
"""

from __future__ import annotations

import os
import sys
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
DOMAIN = "vidchat.kelvinoz.com"
ARCHIVE_NAME = "vidchat_site.zip"
ROOT = Path(__file__).resolve().parent


def api(token: str, method: str, path: str, **kwargs) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=180, **kwargs)


def make_archive(dest: Path) -> None:
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if path.name == "deploy_hostinger.py":
                continue
            if any(p.startswith(".") for p in rel.split("/")):
                continue
            if rel.startswith("worker/") and path.suffix == ".py":
                continue
            zf.write(path, rel)


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
        timeout=180,
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
        timeout=180,
    )
    patch.raise_for_status()


def deploy(token: str) -> None:
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}/deploy"
    resp = api(token, "POST", path, json={"archive_path": ARCHIVE_NAME})
    resp.raise_for_status()
    print(resp.json())


def main() -> None:
    token = os.environ.get("HOSTINGER_API_TOKEN")
    if not token:
        print("Set HOSTINGER_API_TOKEN", file=sys.stderr)
        sys.exit(1)
    if "acctventa" in DOMAIN.lower():
        raise RuntimeError("Refusing unexpected domain")

    archive = Path("/tmp") / ARCHIVE_NAME
    make_archive(archive)
    print(f"Archive {archive.stat().st_size} bytes → {DOMAIN}")
    tus_upload(token, archive)
    print("Upload complete")
    deploy(token)
    print(f"Live: https://{DOMAIN}/")


if __name__ == "__main__":
    main()
