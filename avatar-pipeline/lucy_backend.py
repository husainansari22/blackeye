"""Decart Lucy key storage + client-token minting.

Permanent API keys (dct_...) stay on the server. The browser only receives
short-lived client tokens for WebRTC realtime sessions.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("avatar.lucy")

DECART_API_BASE = os.environ.get("DECART_API_BASE", "https://api.decart.ai").rstrip("/")
DEFAULT_MODEL = os.environ.get("LUCY_MODEL", "lucy-2.5")
LUCY_ORIGIN = os.environ.get("LUCY_ALLOWED_ORIGIN", "https://live.kelvinoz.com").strip()
SECRETS_PATH = Path(
    os.environ.get(
        "LUCY_SECRETS_PATH",
        str(Path(__file__).resolve().parent / ".lucy_secrets.json"),
    )
)
_lock = threading.Lock()


def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _cipher():
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        return None
    password = os.environ.get("APP_PASSWORD", "@535846.oZ")
    return Fernet(_derive_fernet_key(password))


def _encrypt(plain: str) -> str:
    c = _cipher()
    if c is None:
        return "b64:" + base64.urlsafe_b64encode(plain.encode("utf-8")).decode("ascii")
    return "fernet:" + c.encrypt(plain.encode("utf-8")).decode("ascii")


def _decrypt(blob: str) -> str:
    if blob.startswith("fernet:"):
        c = _cipher()
        if c is None:
            raise RuntimeError("cryptography package required to read saved Lucy key")
        return c.decrypt(blob[len("fernet:") :].encode("ascii")).decode("utf-8")
    if blob.startswith("b64:"):
        return base64.urlsafe_b64decode(blob[len("b64:") :].encode("ascii")).decode("utf-8")
    # Legacy plaintext
    return blob


def _read_store() -> dict[str, Any]:
    if not SECRETS_PATH.exists():
        return {}
    try:
        return json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("Failed reading Lucy secrets")
        return {}


def _write_store(data: dict[str, Any]) -> None:
    SECRETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SECRETS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, SECRETS_PATH)
    try:
        os.chmod(SECRETS_PATH, 0o600)
    except OSError:
        pass


def env_api_key() -> str:
    return os.environ.get("DECART_API_KEY", "").strip()


def get_api_key() -> str:
    """Prefer UI-saved key, fall back to DECART_API_KEY env."""
    with _lock:
        data = _read_store()
        enc = data.get("api_key_enc") or data.get("api_key")
        if enc:
            try:
                return _decrypt(enc).strip()
            except Exception:
                logger.exception("Failed decrypting Lucy key")
                return ""
    return env_api_key()


def get_model() -> str:
    with _lock:
        data = _read_store()
        model = (data.get("model") or "").strip()
    return model or DEFAULT_MODEL


def lucy_configured() -> bool:
    return bool(get_api_key())


def mask_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 10:
        return key[:2] + "…" + key[-2:]
    return key[:6] + "…" + key[-4:]


def key_status() -> dict[str, Any]:
    with _lock:
        data = _read_store()
        has_saved = bool(data.get("api_key_enc") or data.get("api_key"))
        updated_at = data.get("updated_at")
        model = (data.get("model") or DEFAULT_MODEL).strip()
    key = get_api_key()
    return {
        "configured": bool(key),
        "source": "saved" if has_saved else ("env" if env_api_key() else "none"),
        "masked": mask_key(key),
        "model": model or DEFAULT_MODEL,
        "updated_at": updated_at,
        "allowed_origin": LUCY_ORIGIN or None,
    }


def save_api_key(api_key: str, model: Optional[str] = None) -> dict[str, Any]:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("API key is required")
    if len(api_key) < 8:
        raise ValueError("API key looks too short")
    model = (model or get_model() or DEFAULT_MODEL).strip()
    with _lock:
        data = _read_store()
        data["api_key_enc"] = _encrypt(api_key)
        data.pop("api_key", None)
        data["model"] = model
        data["updated_at"] = int(time.time())
        _write_store(data)
    logger.info("Lucy API key saved (masked=%s model=%s)", mask_key(api_key), model)
    return key_status()


def clear_api_key() -> dict[str, Any]:
    with _lock:
        data = _read_store()
        data.pop("api_key_enc", None)
        data.pop("api_key", None)
        data["updated_at"] = int(time.time())
        _write_store(data)
    logger.info("Lucy API key cleared")
    return key_status()


def set_model(model: str) -> dict[str, Any]:
    model = (model or DEFAULT_MODEL).strip()
    with _lock:
        data = _read_store()
        data["model"] = model
        data["updated_at"] = int(time.time())
        _write_store(data)
    return key_status()


async def create_decart_client_token(
    *,
    model: Optional[str] = None,
    origin: Optional[str] = None,
    expires_in: int = 300,
) -> dict[str, Any]:
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("Lucy API key not configured — save your Decart key first")

    model = (model or get_model() or DEFAULT_MODEL).strip()
    origins: list[str] = []
    for o in (origin, LUCY_ORIGIN, "http://localhost:3000", "http://127.0.0.1:8080"):
        if o and o not in origins:
            origins.append(o.rstrip("/"))

    body: dict[str, Any] = {
        "expiresIn": max(60, min(int(expires_in), 3600)),
        "allowedModels": [model, "lucy-2.5", "lucy-2.1", "lucy-latest"],
        "allowedOrigins": origins[:20],
        "constraints": {"realtime": {"maxSessionDuration": 1800}},
    }

    # Prefer REST so we don't require the `decart` Python package on the GPU box.
    try:
        import httpx
    except ImportError as exc:
        raise RuntimeError("httpx is required — pip install httpx") from exc

    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.post(
            f"{DECART_API_BASE}/v1/client/tokens",
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            json=body,
        )
        if resp.status_code >= 400:
            detail = resp.text[:400]
            raise RuntimeError(f"Decart token mint failed ({resp.status_code}): {detail}")
        data = resp.json()

    return {
        "apiKey": data.get("apiKey") or data.get("api_key"),
        "expiresAt": data.get("expiresAt") or data.get("expires_at"),
        "model": model,
        "permissions": data.get("permissions"),
        "constraints": data.get("constraints"),
    }


# Back-compat aliases used by older code
def lucy_available() -> bool:
    return lucy_configured()


def fal_available() -> bool:
    return bool(os.environ.get("FAL_KEY", "").strip())


async def create_fal_realtime_token(app: str) -> str:
    fal_key = os.environ.get("FAL_KEY", "").strip()
    if not fal_key:
        raise RuntimeError("FAL_KEY not configured on server")
    import httpx

    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.post(
            "https://rest.fal.ai/tokens/realtime",
            headers={"Authorization": f"Key {fal_key}", "Content-Type": "application/json"},
            json={"allowed_apps": [app], "duration": 120},
        )
        resp.raise_for_status()
        return resp.json()["token"]
