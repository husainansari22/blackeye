#!/usr/bin/env python3
"""Resume TensorRT engine build from cached UNet ONNX (skip re-export)."""
from __future__ import annotations

import gc
import os
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
STREAM_ROOT = APP_DIR / "StreamDiffusion"
sys.path.insert(0, str(STREAM_ROOT))
sys.path.insert(0, str(APP_DIR))

os.environ.setdefault("FRAME_SIZE", "384")
os.environ.setdefault("STREAM_ENGINES", str(APP_DIR / "engines"))

import torch

torch.set_grad_enabled(False)


def main() -> None:
    from patch_streamdiffusion import main as patch

    patch()

    builder_py = STREAM_ROOT / "src/streamdiffusion/acceleration/tensorrt/builder.py"
    text = builder_py.read_text()
    if "onnx_opset: int = 17" in text:
        builder_py.write_text(text.replace("onnx_opset: int = 17", "onnx_opset: int = 18"))

    from stream_engine import StreamAvatarEngine

    print("Building TensorRT engines (resume from ONNX if present)...")
    engine = StreamAvatarEngine()
    engine.acceleration = "tensorrt"
    engine.load()
    print(f"TensorRT ready (accel={engine.acceleration})")

    import numpy as np
    import time

    img = np.random.randint(0, 255, (384, 384, 3), dtype=np.uint8)
    for i in range(5):
        t = time.time()
        engine.process_rgb(img)
        print(f"warmup {i+1}: {(time.time()-t)*1000:.0f}ms")

    times = []
    for _ in range(30):
        t = time.time()
        engine.process_rgb(img)
        times.append(time.time() - t)
    avg = 1000 * sum(times) / len(times)
    print(f"TRT benchmark: avg={avg:.0f}ms = {1000/avg:.1f} fps")
    (APP_DIR / ".stream_accel").write_text(engine.acceleration)

    del engine
    gc.collect()
    torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
