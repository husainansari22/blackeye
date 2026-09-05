#!/usr/bin/env python3
"""Generate AcctSuite favicon / app icons (sky-blue rounded square + white A)."""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..")
BRAND = (139, 92, 246, 255)  # #8B5CF6
WHITE = (255, 255, 255, 255)


def png(w, h, rgba):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * w * 4 : (y + 1) * w * 4])
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def ico_from_png(png_bytes, size):
    header = struct.pack("<HHH", 0, 1, 1)
    w = 0 if size >= 256 else size
    entry = struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(png_bytes), 22)
    return header + entry + png_bytes


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def blend(dst, src):
    sa = src[3] / 255.0
    if sa <= 0:
        return dst
    out = []
    for i in range(3):
        out.append(int(src[i] * sa + dst[i] * (1 - sa)))
    out.append(255)
    return tuple(out)


def rounded_rect_cover(px, py, size, radius):
    # 0 outside, 1 inside, with ~1px AA
    x = px + 0.5
    y = py + 0.5
    r = radius
    # distance to rounded rect
    qx = abs(x - size / 2) - (size / 2 - r)
    qy = abs(y - size / 2) - (size / 2 - r)
    d = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
    if d <= -0.75:
        return 1.0
    if d >= 0.75:
        return 0.0
    return clamp(0.5 - d, 0, 1)


def point_in_poly(x, y, poly):
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def letter_a_polys(size):
    s = float(size)
    # Geometric A scaled to the canvas
    def p(x, y):
        return (x * s, y * s)
    # Outer A (wide)
    outer = [
        p(0.50, 0.20),
        p(0.78, 0.80),
        p(0.66, 0.80),
        p(0.60, 0.64),
        p(0.40, 0.64),
        p(0.34, 0.80),
        p(0.22, 0.80),
    ]
    # Inner triangle cutout
    hole = [
        p(0.50, 0.36),
        p(0.57, 0.54),
        p(0.43, 0.54),
    ]
    return outer, hole


def draw_icon(size, radius_ratio=0.22):
    buf = bytearray(size * size * 4)
    radius = size * radius_ratio
    outer, hole = letter_a_polys(size)
    for y in range(size):
        for x in range(size):
            cov = rounded_rect_cover(x, y, size, radius)
            cx, cy = x + 0.5, y + 0.5
            in_a = point_in_poly(cx, cy, outer) and not point_in_poly(cx, cy, hole)
            if cov <= 0:
                pix = (0, 0, 0, 0)
            elif in_a:
                pix = WHITE
            else:
                pix = BRAND
            if 0 < cov < 1:
                pix = (pix[0], pix[1], pix[2], int(pix[3] * cov))
            i = (y * size + x) * 4
            buf[i : i + 4] = bytes(pix)
    return png(size, size, buf)


def draw_og(w=1200, h=630):
    buf = bytearray(w * h * 4)
    # dark navy bg
    bg = (15, 23, 42, 255)
    for i in range(0, len(buf), 4):
        buf[i : i + 4] = bytes(bg)
    # brand glow circle
    icon = 220
    icon_png = None
    # draw rounded brand card
    ox, oy = 140, (h - icon) // 2
    radius = icon * 0.22
    outer, hole = letter_a_polys(icon)
    for y in range(icon):
        for x in range(icon):
            cov = rounded_rect_cover(x, y, icon, radius)
            if cov <= 0:
                continue
            cx, cy = x + 0.5, y + 0.5
            in_a = point_in_poly(cx, cy, outer) and not point_in_poly(cx, cy, hole)
            pix = WHITE if in_a else BRAND
            a = int(255 * cov)
            gx, gy = ox + x, oy + y
            if 0 <= gx < w and 0 <= gy < h:
                di = (gy * w + gx) * 4
                dst = tuple(buf[di : di + 4])
                src = (pix[0], pix[1], pix[2], a)
                out = blend(dst, src)
                buf[di : di + 4] = bytes(out)
    # wordmark
    text = "acctsuite"
    scale = 8
    glyphs = FONT
    tw = (len(text) * 6 - 1) * scale
    tx = ox + icon + 56
    ty = h // 2 - (7 * scale) // 2
    col = (255, 255, 255, 255)
    for gi, ch in enumerate(text):
        bits = glyphs.get(ch, glyphs[" "])
        for row, line in enumerate(bits):
            for colx, bit in enumerate(line):
                if bit != "#":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        px = tx + gi * 6 * scale + colx * scale + dx
                        py = ty + row * scale + dy
                        if 0 <= px < w and 0 <= py < h:
                            i = (py * w + px) * 4
                            buf[i : i + 4] = bytes(col)
    sub = "Digital accounts marketplace"
    scale2 = 3
    tw2 = (len(sub) * 6 - 1) * scale2
    tx2 = tx
    ty2 = ty + 7 * scale + 28
    scol = (139, 92, 246, 255)
    for gi, ch in enumerate(sub.lower()):
        bits = glyphs.get(ch, glyphs[" "])
        for row, line in enumerate(bits):
            for colx, bit in enumerate(line):
                if bit != "#":
                    continue
                for dy in range(scale2):
                    for dx in range(scale2):
                        px = tx2 + gi * 6 * scale2 + colx * scale2 + dx
                        py = ty2 + row * scale2 + dy
                        if 0 <= px < w and 0 <= py < h:
                            i = (py * w + px) * 4
                            buf[i : i + 4] = bytes(scol)
    return png(w, h, buf)


# 5x7 bitmap font (rows of 5 chars)
FONT = {
    " ": ["     "] * 7,
    "a": [
        "     ",
        " ### ",
        "#   #",
        "#####",
        "#   #",
        "#   #",
        "     ",
    ],
    "c": [
        "     ",
        " ### ",
        "#   #",
        "#    ",
        "#   #",
        " ### ",
        "     ",
    ],
    "t": [
        " ### ",
        "  #  ",
        "  #  ",
        "  #  ",
        "  #  ",
        "  ## ",
        "     ",
    ],
    "v": [
        "     ",
        "#   #",
        "#   #",
        "#   #",
        " # # ",
        "  #  ",
        "     ",
    ],
    "e": [
        "     ",
        " ### ",
        "#   #",
        "#### ",
        "#    ",
        " ####",
        "     ",
    ],
    "n": [
        "     ",
        "#    ",
        "#### ",
        "#   #",
        "#   #",
        "#   #",
        "     ",
    ],
    "d": [
        "    #",
        "    #",
        " ####",
        "#   #",
        "#   #",
        " ####",
        "     ",
    ],
    "i": [
        "  #  ",
        "     ",
        " ##  ",
        "  #  ",
        "  #  ",
        " ### ",
        "     ",
    ],
    "g": [
        "     ",
        " ### ",
        "#   #",
        "#   #",
        " ####",
        "    #",
        " ### ",
    ],
    "l": [
        " #   ",
        " #   ",
        " #   ",
        " #   ",
        " #   ",
        " ### ",
        "     ",
    ],
    "o": [
        "     ",
        " ### ",
        "#   #",
        "#   #",
        "#   #",
        " ### ",
        "     ",
    ],
    "u": [
        "     ",
        "#   #",
        "#   #",
        "#   #",
        "#   #",
        " ### ",
        "     ",
    ],
    "s": [
        "     ",
        " ####",
        "#    ",
        " ### ",
        "    #",
        "#### ",
        "     ",
    ],
    "m": [
        "     ",
        "#    ",
        "## # ",
        "# # #",
        "#   #",
        "#   #",
        "     ",
    ],
    "k": [
        "     ",
        "#   #",
        "#  # ",
        "###  ",
        "#  # ",
        "#   #",
        "     ",
    ],
    "p": [
        "     ",
        "#### ",
        "#   #",
        "#### ",
        "#    ",
        "#    ",
        "     ",
    ],
    "r": [
        "     ",
        "# ## ",
        "##  #",
        "#    ",
        "#    ",
        "#    ",
        "     ",
    ],
    "b": [
        " #   ",
        " #   ",
        " ### ",
        " #  #",
        " #  #",
        " ### ",
        "     ",
    ],
    "y": [
        "     ",
        "#   #",
        "#   #",
        " ####",
        "    #",
        " ### ",
        "     ",
    ],
    "&": [
        " ##  ",
        "#  # ",
        " ##  ",
        " # # ",
        "#  # ",
        " ## #",
        "     ",
    ],
    "-": [
        "     ",
        "     ",
        "     ",
        " ### ",
        "     ",
        "     ",
        "     ",
    ],
}


def write(path, data):
    path = os.path.normpath(os.path.join(OUT, path))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print("wrote", path, len(data))


def ico_from_pngs(entries):
    """entries: list of (size, png_bytes)"""
    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    out = bytearray(header)
    blobs = bytearray()
    for size, png_bytes in entries:
        w = 0 if size >= 256 else size
        out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(png_bytes), offset)
        blobs += png_bytes
        offset += len(png_bytes)
    return bytes(out) + bytes(blobs)


def main():
    png16 = draw_icon(16, radius_ratio=0.28)
    png32 = draw_icon(32, radius_ratio=0.26)
    png48 = draw_icon(48)
    png64 = draw_icon(64)
    png96 = draw_icon(96)
    png180 = draw_icon(180)
    png192 = draw_icon(192)
    png512 = draw_icon(512)
    write("favicon-48.png", png48)
    write("favicon-48x48.png", png48)
    write("favicon-96x96.png", png96)
    write("favicon-32x32.png", png32)
    write("img/brand/icon-48.png", png48)
    write("img/brand/icon-64.png", png64)
    write("img/brand/icon-96.png", png96)
    write("img/brand/icon-192.png", png192)
    write("img/brand/icon-512.png", png512)
    write("apple-touch-icon.png", png180)
    write("favicon.ico", ico_from_pngs([(16, png16), (32, png32), (48, png48)]))
    write("img/brand/og-cover.png", draw_og())
    write("img/brand/google-favicon.png", png96)


if __name__ == "__main__":
    main()
