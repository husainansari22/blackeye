# VidChat GPU worker contract

Point the website at any rented GPU that speaks this HTTP API (CORS enabled).

## Endpoints

### `GET /health`
Returns `200` JSON `{ "ok": true }`.

### `POST /v1/generate`
JSON body:

```json
{
  "prompt": "string",
  "duration": 4,
  "aspect_ratio": "9:16",
  "watermark": false,
  "add_ai_label": false,
  "clean_export": true
}
```

Return either:
- `video/mp4` bytes, or
- JSON `{ "url": "https://.../out.mp4" }`

When `clean_export` / `watermark: false` / `add_ai_label: false`, do **not** burn watermarks or “AI generated” text into the frames.

### `POST /v1/stream`
`multipart/form-data` with `frame` (JPEG) and optional `prompt`.

Return an image (`image/jpeg`) or JSON `{ "url": "..." }`.

### `POST /v1/animate`
`multipart/form-data`:
- `source_image` — JPEG/PNG character image
- `reference_video` — MP4/MOV motion reference
- `mode` — `animate` | `replace`
- `resolution` — `480p` | `720p` | `1080p`
- `seed` — integer (`-1` = random)
- `prompt` — optional guidance
- `watermark` / `add_ai_label` / `clean_export`

Return `video/mp4` or JSON `{ "url": "..." }`.

## CORS

Allow the Pages origin (or `*`) so phones can call your worker from the browser.

```python
# FastAPI example
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

## Note on social platforms

This stack avoids **app-side** watermarks and labels. Platforms like TikTok may still classify or label synthetic media under their own rules — that cannot and should not be bypassed by this tool.
