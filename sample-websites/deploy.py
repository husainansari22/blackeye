#!/usr/bin/env python3
"""Deploy sample websites to *.kelvinoz.com via Hostinger API.

NEVER targets acctventa.com — only kelvinoz.com subdomains listed below.
"""

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
PARENT_DOMAIN = "kelvinoz.com"
# Hard allow-list — never deploy outside these kelvinoz subdomains
SITES = [
    "aceroyal",
    "ogaagent",
    "deltamega",
    "kadabistro",
    "mandelamenu",
    "azurehaven",
]

ROOT = Path(__file__).resolve().parent


def api(token: str, method: str, path: str, **kwargs) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=180, **kwargs)


def make_archive(site: str, dest: Path) -> None:
    source = ROOT / site
    if not source.is_dir():
        raise FileNotFoundError(source)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(source).as_posix())


def tus_upload(token: str, domain: str, archive: Path, archive_name: str) -> None:
    resp = api(
        token,
        "POST",
        "/api/hosting/v1/files/upload-urls",
        json={"username": USERNAME, "domain": domain},
    )
    resp.raise_for_status()
    data = resp.json()
    url, auth, rest = data["url"], data["auth_key"], data["rest_auth_key"]
    size = archive.stat().st_size
    target = f"{url}/{archive_name}?override=true"
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


def deploy(token: str, domain: str, archive_name: str) -> None:
    path = f"/api/hosting/v1/accounts/{USERNAME}/websites/{domain}/deploy"
    resp = api(token, "POST", path, json={"archive_path": archive_name})
    resp.raise_for_status()
    print(f"  deploy response: {resp.json()}")


def ensure_not_acctventa(domain: str) -> None:
    if "acctventa" in domain.lower():
        raise RuntimeError(f"Refusing to touch {domain}")


def main() -> None:
    token = os.environ.get("HOSTINGER_API_TOKEN")
    if not token:
        print("Set HOSTINGER_API_TOKEN", file=sys.stderr)
        sys.exit(1)

    only = sys.argv[1:] or SITES
    for site in only:
        if site not in SITES:
            print(f"Skip unknown site (not in allow-list): {site}", file=sys.stderr)
            continue
        domain = f"{site}.{PARENT_DOMAIN}"
        ensure_not_acctventa(domain)
        archive_name = f"{site}_sample.zip"
        archive = Path("/tmp") / archive_name
        make_archive(site, archive)
        print(f"\n[{site}] archive {archive.stat().st_size} bytes → {domain}")
        tus_upload(token, domain, archive, archive_name)
        print(f"  upload complete")
        deploy(token, domain, archive_name)
        print(f"  live: https://{domain}/")
        time.sleep(1)

    print("\nDone. acctventa.com was not modified.")


if __name__ == "__main__":
    main()
