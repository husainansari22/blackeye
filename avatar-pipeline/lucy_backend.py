"""Decart Lucy 2.5 client-token minting (server-side only — never expose dct_ keys)."""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("avatar.lucy")

DECART_API_KEY = os.environ.get("DECART_API_KEY", "").strip()
FAL_KEY = os.environ.get("FAL_KEY", "").strip()
LUCY_ORIGIN = os.environ.get("LUCY_ALLOWED_ORIGIN", "https://live.kelvinoz.com").strip()


def lucy_available() -> bool:
    return bool(DECART_API_KEY)


def fal_available() -> bool:
    return bool(FAL_KEY)


async def create_decart_client_token() -> dict[str, Any]:
    if not DECART_API_KEY:
        raise RuntimeError("DECART_API_KEY not configured on server")

    try:
        from decart import DecartClient
    except ImportError as exc:
        raise RuntimeError("decart package not installed — run: pip install decart") from exc

    async with DecartClient(api_key=DECART_API_KEY) as client:
        kwargs: dict[str, Any] = {
            "expires_in": 300,
            "allowed_models": ["lucy-2.5"],
        }
        if LUCY_ORIGIN:
            kwargs["allowed_origins"] = [LUCY_ORIGIN]
        token = await client.tokens.create(**kwargs)
        return {
            "apiKey": token.api_key,
            "expiresAt": token.expires_at,
            "model": "lucy-2.5",
        }


async def create_fal_realtime_token(app: str) -> str:
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY not configured on server")

    import httpx

    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.post(
            "https://rest.fal.ai/tokens/realtime",
            headers={
                "Authorization": f"Key {FAL_KEY}",
                "Content-Type": "application/json",
            },
            json={"allowed_apps": [app], "duration": 120},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["token"]
