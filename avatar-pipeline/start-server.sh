#!/usr/bin/env bash
# Start avatar-pipeline with StreamDiffusion on port 8080 (nginx proxies 80/443)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"
export TRANSFORMERS_CACHE="${HF_HOME}"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
export USE_STREAM=1
export FRAME_SIZE="${FRAME_SIZE:-384}"
export STREAM_ENGINES="${APP_DIR}/engines"
export STREAM_ACCEL="${STREAM_ACCEL:-tensorrt}"
export PYTHONPATH="${APP_DIR}/StreamDiffusion:${APP_DIR}:${PYTHONPATH:-}"

pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 1

nohup python -m uvicorn app:app --host 127.0.0.1 --port 8080 --workers 1 >> server.log 2>&1 &
echo "Started uvicorn pid=$! (log: ${APP_DIR}/server.log)"
