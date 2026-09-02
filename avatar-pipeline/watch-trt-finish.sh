#!/usr/bin/env bash
# Wait for UNet fp32 TRT build, then finish VAE engines and restart server.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"
export FRAME_SIZE=384
export STREAM_ENGINES="${APP_DIR}/engines"
export STREAM_ACCEL=tensorrt
export PYTHONPATH="${APP_DIR}/StreamDiffusion:${APP_DIR}:${PYTHONPATH:-}"

BUILD_PID="${1:-36149}"
LOG="${APP_DIR}/finish-trt.log"

echo "Waiting for UNet TRT build pid=${BUILD_PID}..." | tee "$LOG"
while kill -0 "$BUILD_PID" 2>/dev/null; do
  ls -lh "${APP_DIR}/engines/stabilityai/sd-turbo--lcm_lora-False--tiny_vae-True--max_batch-1--min_batch-1--mode-img2img/unet.engine"* 2>/dev/null | tail -3 >> "$LOG" || true
  sleep 30
done
echo "UNet build finished at $(date)" | tee -a "$LOG"

python3 finish_trt.py 2>&1 | tee -a "$LOG"
bash start-server.sh 2>&1 | tee -a "$LOG"
curl -s http://127.0.0.1:8080/health | tee -a "$LOG"
echo "All done at $(date)" | tee -a "$LOG"
