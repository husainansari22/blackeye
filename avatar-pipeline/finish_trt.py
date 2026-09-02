#!/usr/bin/env python3
"""Complete TRT setup: link UNet engine, build VAE engines, benchmark, write .stream_accel."""
from __future__ import annotations

import gc
import os
import shutil
import sys
import time
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
STREAM_ROOT = APP_DIR / "StreamDiffusion"
sys.path.insert(0, str(STREAM_ROOT))
sys.path.insert(0, str(APP_DIR))

os.environ.setdefault("FRAME_SIZE", "384")
os.environ.setdefault("STREAM_ENGINES", str(APP_DIR / "engines"))

import torch

torch.set_grad_enabled(False)

ENGINE_SUB = (
    "stabilityai/sd-turbo--lcm_lora-False--tiny_vae-True--max_batch-1--min_batch-1--mode-img2img"
)
ENGINE_DIR = APP_DIR / "engines" / ENGINE_SUB


def link_unet_engine() -> None:
    fp32 = ENGINE_DIR / "unet.engine.fp32"
    target = ENGINE_DIR / "unet.engine"
    if fp32.exists() and not target.exists():
        shutil.copy2(fp32, target)
        print(f"Linked UNet engine: {target} ({target.stat().st_size / 1e9:.2f} GB)")
    elif target.exists():
        print(f"UNet engine already present: {target}")
    else:
        raise FileNotFoundError(f"Missing UNet TRT engine: {fp32}")


def main() -> None:
    from patch_streamdiffusion import main as patch

    patch()

    link_unet_engine()

    from stream_engine import StreamAvatarEngine

    print("Loading StreamDiffusion with TensorRT (VAE engine build)...")
    engine = StreamAvatarEngine()
    engine.acceleration = "tensorrt"
    t0 = time.time()
    engine.load()
    print(f"Loaded in {time.time() - t0:.1f}s (accel={engine.acceleration})")

    import numpy as np

    img = np.random.randint(0, 255, (384, 384, 3), dtype=np.uint8)
    for i in range(10):
        t = time.time()
        engine.process_rgb(img)
        print(f"  warmup {i+1}: {(time.time()-t)*1000:.0f}ms")

    times = []
    for _ in range(60):
        t = time.time()
        engine.process_rgb(img)
        times.append(time.time() - t)
    avg = 1000 * sum(times) / len(times)
    mn = 1000 * min(times)
    fps = 1000 / avg
    print(f"TRT READY avg={avg:.0f}ms min={mn:.0f}ms = {fps:.1f} fps peak={1000/mn:.0f}fps")

    for name in ("unet.engine", "vae_encoder.engine", "vae_decoder.engine"):
        p = ENGINE_DIR / name
        print(f"  {name}: {'OK' if p.exists() else 'MISSING'} ({p.stat().st_size/1e6:.0f} MB)" if p.exists() else f"  {name}: MISSING")

    (APP_DIR / ".stream_accel").write_text("tensorrt")
    del engine
    gc.collect()
    torch.cuda.empty_cache()
    print("Done — restart server with STREAM_ACCEL=tensorrt")


if __name__ == "__main__":
    main()
