#!/usr/bin/env bash
# Install StreamDiffusion + IP-Adapter for realtime + reference identity
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"

echo "[1/4] Clone StreamDiffusion..."
if [ ! -d StreamDiffusion ]; then
  git clone --depth 1 https://github.com/cumulo-autumn/StreamDiffusion.git
fi

echo "[2/4] Clone IP-Adapter..."
if [ ! -d IP-Adapter ]; then
  git clone --depth 1 https://github.com/tencent-ailab/IP-Adapter.git
fi

echo "[3/4] Install StreamDiffusion editable..."
pip install -q "numpy<2" peft fire markdown2 pydantic colored
cd StreamDiffusion
pip install --no-deps -e .
cd "$APP_DIR"
python3 patch_streamdiffusion.py 2>/dev/null || true

echo "[4/4] Prefetch models..."
python3 <<'PY'
from huggingface_hub import snapshot_download
for repo in [
    "stabilityai/sd-turbo",
    "runwayml/stable-diffusion-v1-5",
    "latent-consistency/lcm-lora-sdv1-5",
    "h94/IP-Adapter",
]:
    print("download", repo)
    snapshot_download(repo)
print("ok")
PY

echo "Done. Run: bash start-server.sh"
