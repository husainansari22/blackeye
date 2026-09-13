#!/usr/bin/env python3
"""AcctSuite app icon: white tile + purple bag + white A (Acctbazaar layout)."""
from __future__ import annotations
import io, math, struct
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PURPLE = (139, 92, 246, 255)
PURPLE_DEEP = (109, 40, 217, 255)
PURPLE_MID = (124, 58, 237, 255)
WHITE = (255, 255, 255, 255)

def draw_bag_icon(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=WHITE)

    def S(x, y=None):
        if y is None:
            return x * size / 64.0
        return x * size / 64.0, y * size / 64.0

    hw = max(3, int(size * 0.055))
    pts = []
    for t in range(0, 101):
        ang = math.pi * (1 - t / 100.0)
        x = 32.0 + 11.0 * math.cos(ang)
        y = 26.0 - 13.5 * abs(math.sin(ang))
        if y > 24.5:
            continue
        pts.append(S(x, y))
    if len(pts) > 2:
        d.line(pts, fill=PURPLE, width=hw, joint="curve")

    body = [
        S(12.5, 28), S(17, 23), S(47, 23), S(51.5, 28),
        S(53, 34), S(53, 55), S(48.5, 59), S(15.5, 59), S(11, 55), S(11, 34),
    ]
    d.polygon(body, fill=PURPLE)
    shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shade).polygon(
        [S(11, 45), S(53, 45), S(53, 55), S(48.5, 59), S(15.5, 59), S(11, 55)],
        fill=(91, 33, 182, 70),
    )
    im = Image.alpha_composite(im, shade)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([S(16.5), S(23.2), S(47.5), S(27.0)], radius=max(1, int(size * 0.02)), fill=PURPLE_MID)
    d.rounded_rectangle([S(27.5), S(24.0), S(36.5), S(26.3)], radius=max(1, int(size * 0.012)), fill=WHITE)
    d.ellipse([S(31.0), S(24.3), S(33.0), S(26.0)], fill=PURPLE_DEEP)

    def A(pts):
        return [S(x, y) for x, y in pts]

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(A([(32.0, 32.5), (41.2, 52.5), (37.0, 52.5), (34.8, 46.6), (29.2, 46.6), (27.0, 52.5), (22.8, 52.5)]), fill=255)
    md.polygon(A([(32.0, 37.2), (34.6, 43.8), (29.4, 43.8)]), fill=0)
    a_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pix, mp = a_layer.load(), mask.load()
    for y in range(size):
        for x in range(size):
            if mp[x, y] > 128:
                pix[x, y] = WHITE
    return Image.alpha_composite(im, a_layer)

def ico_from_pngs(entries, out_path: Path):
    count = len(entries)
    offset = 6 + 16 * count
    out = bytearray(struct.pack("<HHH", 0, 1, count))
    blobs = bytearray()
    for size, src in entries:
        buf = io.BytesIO()
        src.resize((size, size), Image.Resampling.LANCZOS).save(buf, format="PNG")
        data = buf.getvalue()
        w = 0 if size >= 256 else size
        out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    out_path.write_bytes(bytes(out) + bytes(blobs))

def main():
    master = draw_bag_icon(1024)
    sizes = {
        "favicon-16x16.png": 16, "favicon-32x32.png": 32, "favicon-48.png": 48, "favicon-48x48.png": 48,
        "favicon-96x96.png": 96, "apple-touch-icon.png": 180, "apple-touch-icon-180x180.png": 180,
        "apple-touch-icon-precomposed.png": 180, "img/brand/apple-touch-icon.png": 180,
        "img/brand/icon-48.png": 48, "img/brand/icon-64.png": 64, "img/brand/icon-96.png": 96,
        "img/brand/icon-192.png": 192, "img/brand/icon-512.png": 512, "img/brand/google-favicon.png": 96,
    }
    for rel, sz in sizes.items():
        master.resize((sz, sz), Image.Resampling.LANCZOS).save(ROOT / rel, "PNG", optimize=True)
        print("wrote", rel)
    ico_from_pngs([(16, master), (32, master), (48, master)], ROOT / "favicon.ico")
    (ROOT / "favicon.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="AcctSuite">
  <rect width="64" height="64" rx="14" fill="#FFFFFF"/>
  <path fill="none" stroke="#7C3AED" stroke-width="3.2" stroke-linecap="round" d="M22 25c0-8.5 4.8-14.5 10.5-14.5S43 16.5 43 25"/>
  <path fill="#8B5CF6" d="M13 27c0-2.6 2.1-4.7 4.7-4.7h26.6c2.6 0 4.7 2.1 4.7 4.7v3.2c1.2 1.4 2.2 3.8 2.2 6.6v17.2c0 5-4 9-9 9H19.8c-5 0-9-4-9-9V36.8c0-2.8 1-5.2 2.2-6.6V27z"/>
  <rect x="18" y="24.4" width="25" height="3.8" rx="1.6" fill="#7C3AED"/>
  <rect x="26" y="25.3" width="9" height="2.1" rx="1" fill="#FFFFFF"/>
  <circle cx="30.5" cy="26.35" r=".95" fill="#6D28D9"/>
  <path fill="#FFFFFF" d="M31.5 33.2 L38.8 50.2 H35.6 L33.9 45.6 H29.1 L27.4 50.2 H24.2 Z M30.05 42.9 H32.95 L31.5 38.7 Z"/>
</svg>
""")
    print("done")

if __name__ == "__main__":
    main()
