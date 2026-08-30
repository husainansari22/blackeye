#!/usr/bin/env bash
# Install StreamDiffusion + TensorRT engines for 60+ fps SD-Turbo img2img
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[1/7] Clone StreamDiffusion..."
if [ ! -d StreamDiffusion ]; then
  git clone --depth 1 https://github.com/cumulo-autumn/StreamDiffusion.git
fi

echo "[2/7] System deps + swap (helps ONNX/TRT build on 16GB RAM)..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -qq cmake build-essential git
if [ ! -f /swapfile ]; then
  sudo fallocate -l 8G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=8192 status=none 2>/dev/null || true
  sudo chmod 600 /swapfile 2>/dev/null || true
  sudo mkswap /swapfile 2>/dev/null || true
  sudo swapon /swapfile 2>/dev/null || echo "WARN: swap unavailable (continuing without swap)"
fi

echo "[3/7] Activate venv..."
source venv/bin/activate
export HF_HOME="${APP_DIR}/.cache/huggingface"
export APP_DIR

echo "[4/7] Pin core ML stack (before StreamDiffusion editable install)..."
pip install --upgrade pip wheel setuptools
pip install \
  "numpy==1.26.4" \
  "huggingface_hub==0.36.2" \
  "diffusers==0.32.2" \
  "transformers==4.47.1" \
  "accelerate==1.2.1" \
  "safetensors==0.4.5" \
  "peft==0.14.0"

echo "[5/7] Install StreamDiffusion (editable, no deps) + runtime extras..."
pip install "numpy<2" peft==0.14.0 fire markdown2 pydantic colored
cd StreamDiffusion
pip install --no-deps -e .
cd "$APP_DIR"

pip install polygraphy onnx onnxruntime-gpu 2>/dev/null || pip install polygraphy onnx onnxruntime 2>/dev/null || true
pip install onnxscript onnx-graphsurgeon 2>/dev/null || true
pip install tensorrt 2>/dev/null || echo "WARN: pip tensorrt unavailable"
pip install xformers 2>/dev/null || echo "WARN: xformers unavailable"

echo "[6/7] Patch StreamDiffusion for diffusers 0.32..."
python3 patch_streamdiffusion.py

echo "[7/7] Build engines + benchmark..."
export FRAME_SIZE="${FRAME_SIZE:-384}"
export STREAM_ACCEL="${STREAM_ACCEL:-tensorrt}"
export STREAM_ENGINES="${APP_DIR}/engines"
export PYTHONPATH="${APP_DIR}/StreamDiffusion:${APP_DIR}:${PYTHONPATH:-}"

python3 <<'PY'
import gc
import os
import time

import numpy as np
import torch

size = int(os.environ.get("FRAME_SIZE", "384"))
app_dir = os.environ.get("APP_DIR", ".")

for attempt in ["xformers", "tensorrt", "none"]:
    try:
        from stream_engine import StreamAvatarEngine

        e = StreamAvatarEngine()
        e.acceleration = attempt
        print(f"Trying acceleration={attempt} @ {size}px...")
        t0 = time.time()
        e.load()
        print(f"  loaded in {time.time() - t0:.1f}s (actual accel={e.acceleration})")

        img = np.random.randint(0, 255, (size, size, 3), dtype=np.uint8)
        for i in range(12):
            t = time.time()
            e.process_rgb(img)
            print(f"  warmup {i+1}: {(time.time()-t)*1000:.0f}ms")

        times = []
        for _ in range(60):
            t = time.time()
            e.process_rgb(img)
            times.append(time.time() - t)

        avg = 1000 * sum(times) / len(times)
        mn = 1000 * min(times)
        fps = 1000 / avg
        print(f"READY accel={e.acceleration} avg={avg:.0f}ms min={mn:.0f}ms = {fps:.1f} fps peak={1000/mn:.0f}fps")
        open(os.path.join(app_dir, ".stream_accel"), "w").write(e.acceleration)

        del e
        gc.collect()
        torch.cuda.empty_cache()
        break
    except Exception as exc:
        print(f"accel={attempt} failed: {exc}")
        import traceback

        traceback.print_exc()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
else:
    raise SystemExit("All accelerations failed")
PY

echo "Done. Run ./start-server.sh to launch."
