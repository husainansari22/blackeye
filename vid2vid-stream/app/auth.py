"""Authentication and token utilities."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

APP_PASSWORD = os.environ.get("VID2VID_PASSWORD", "@535846.oZ")
JWT_SECRET = os.environ.get(
    "VID2VID_JWT_SECRET",
    hashlib.sha256(f"vid2vid-{APP_PASSWORD}-kelvinoz".encode()).hexdigest(),
)
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = int(os.environ.get("VID2VID_TOKEN_HOURS", "72"))


def verify_password(password: str) -> bool:
    return hmac.compare_digest(password, APP_PASSWORD)


def create_access_token(subject: str = "stream") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> bool:
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return True
    except JWTError:
        return False


def obs_url(base: str, token: str) -> str:
    return f"{base.rstrip('/')}/obs?token={token}"


def request_base_url(request) -> str:
    """Build public base URL from Host / proxy headers."""
    host = request.headers.get("host")
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    if host:
        return f"{scheme}://{host}".rstrip("/")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host:
        return f"{scheme}://{forwarded_host}".rstrip("/")
    return str(request.base_url).rstrip("/")
