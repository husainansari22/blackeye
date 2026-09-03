#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source venv/bin/activate

PY_SITE="$APP_DIR/venv/lib/python3.12/site-packages"
export LD_LIBRARY_PATH="$PY_SITE/nvidia/cudnn/lib:$PY_SITE/nvidia/cublas/lib:$PY_SITE/nvidia/cuda_runtime/lib:${LD_LIBRARY_PATH:-}"

export HF_HOME="${APP_DIR}/.cache/huggingface"
export APP_PASSWORD="${APP_PASSWORD:-@535846.oZ}"
export USE_HYBRID=1
export USE_STREAM_IP=0
export USE_BODY=0
export USE_FACESWAP=0
export USE_QUALITY=0
export USE_STREAM=0
export PROC_SIZE="${PROC_SIZE:-512}"
export FRAME_SIZE="${FRAME_SIZE:-512}"
export STREAM_ACCEL="${STREAM_ACCEL:-none}"
export STREAM_ENGINES="${APP_DIR}/engines"
export INSIGHTFACE_ROOT="${APP_DIR}/models"
export PYTHONPATH="${APP_DIR}/StreamDiffusion:${APP_DIR}:${PYTHONPATH:-}"
pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 2
nohup python -m uvicorn app:app --host 127.0.0.1 --port 8080 --workers 1 >> server.log 2>&1 &
echo "Started pid=$! USE_HYBRID=$USE_HYBRID PROC_SIZE=$PROC_SIZE FRAME_SIZE=$FRAME_SIZE"
