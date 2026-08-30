#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
export USE_REALTIME=0
export USE_STREAM=1
export STREAM_ACCEL=none
export FRAME_SIZE="${FRAME_SIZE:-384}"
export PYTHONPATH="${APP_DIR}:${PYTHONPATH:-}"
pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 2
nohup python -m uvicorn app:app --host 127.0.0.1 --port 8080 --workers 1 >> server.log 2>&1 &
echo "Started pid=$! USE_STREAM=$USE_STREAM STREAM_ACCEL=$STREAM_ACCEL FRAME_SIZE=$FRAME_SIZE"
