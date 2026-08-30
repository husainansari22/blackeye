#!/usr/bin/env python3
"""Patch StreamDiffusion TensorRT imports for diffusers >= 0.30."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "StreamDiffusion"
REPLACEMENTS = {
    "from diffusers.models.unet_2d_condition import": "from diffusers.models.unets.unet_2d_condition import",
    "from diffusers.models.vae import": "from diffusers.models.autoencoders.vae import",
    "from diffusers.models.autoencoder_tiny import": "from diffusers.models.autoencoders.autoencoder_tiny import",
}

def patch_file(path: Path) -> bool:
    text = path.read_text()
    orig = text
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    if text != orig:
        path.write_text(text)
        return True
    return False

def main() -> None:
    count = 0
    for py in ROOT.rglob("*.py"):
        if patch_file(py):
            print("patched", py.relative_to(ROOT))
            count += 1
    print(f"done ({count} files)")

if __name__ == "__main__":
    main()
