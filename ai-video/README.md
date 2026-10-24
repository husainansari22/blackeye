# VidChat

ChatGPT-style AI **photo & video** chat with bring-your-own GPU.

## Features

- **New chat** — sidebar pencil button + mobile top-bar pencil (like ChatGPT)
- **Chat history** — open chats; trash icon deletes a chat
- **Dark / Light** — toggle in the sidebar (persisted)
- **Photo or Video** — mode switch above the composer
- **Upload** — attach reference photos/videos, then describe what to make
- **GPU Servers** — paste rented GPU URL → Save → Deploy

## GPU API

| Mode | Default path |
|------|----------------|
| Video | `POST /v1/generate` |
| Photo | `POST /v1/image` |
| Health | `GET /health` |

Multipart supported when the user uploads references (`files` / `reference` + `prompt`).

See `worker/` for a FastAPI stub.
