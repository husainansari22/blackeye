#!/usr/bin/env bash
# Install StreamDiffusion + TensorRT for 60+ fps SD-Turbo img2img
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[1/5] Clone StreamDiffusion..."
if [ ! -d StreamDiffusion ]; then
  git clone --depth 1 https://github.com/cumulo-autumn/StreamDiffusion.git
fi

echo "[2/5] Activate venv..."
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"

echo "[3/5] Install StreamDiffusion + TensorRT deps..."
pip install --upgrade pip wheel setuptools
pip install "numpy<2" peft==0.14.0 fire markdown2 pydantic
pip install "git+https://github.com/cumulo-autumn/StreamDiffusion.git@main#egg=streamdiffusion[tensorrt]" || \
  pip install streamdiffusion[tensorrt]

echo "[4/5] Install TensorRT extension (may take several minutes)..."
python -m streamdiffusion.tools.install-tensorrt || echo "WARN: TensorRT install had issues — will try xformers fallback"

echo "[5/5] Warmup + build TRT engines (512px SD-Turbo)..."
export FRAME_SIZE="${FRAME_SIZE:-512}"
export STREAM_ACCEL="${STREAM_ACCEL:-tensorrt}"
export STREAM_ENGINES="${APP_DIR}/engines"
export PYTHONPATH="${APP_DIR}/StreamDiffusion:${APP_DIR}:${PYTHONPATH:-}"

python3 <<'PY'
import os, time, numpy as np
from PIL import Image
from stream_engine import StreamAvatarEngine

e = StreamAvatarEngine()
e.acceleration = os.environ.get("STREAM_ACCEL", "tensorrt")
print("Building engines with acceleration:", e.acceleration)
t0 = time.time()
e.load()
img = Image.fromarray(np.random.randint(0, 255, (512, 512, 3), dtype=np.uint8))
for i in range(15):
    t = time.time()
    out = e.process_rgb(np.array(img))
    print(f"  warmup {i+1}: {(time.time()-t)*1000:.0f}ms")
times = []
for i in range(30):
    t = time.time()
    e.process_rgb(np.array(img))
    times.append(time.time() - t)
fps = 1.0 / (sum(times) / len(times))
print(f"READY avg {1000*sum(times)/len(times):.0f}ms = {fps:.1f} fps (build took {time.time()-t0:.0f}s)")
PY

echo "Done. Engines in ${APP_DIR}/engines"
