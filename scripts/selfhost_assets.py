#!/usr/bin/env python3
"""Swap Tailwind Play CDN + Font Awesome CDN for self-hosted assets."""
from pathlib import Path
import re

ROOT = Path("/workspace")
TW_LINK = '<link rel="stylesheet" href="/css/tailwind.css?v=20260827perf1">'
FA_LINK = '<link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css?v=6.4.0">'
FONT_BLOCK = '''<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"></noscript>'''

files = list(ROOT.glob("*.html")) + list((ROOT / "admin").glob("**/*.html")) + list((ROOT / "owner").glob("**/*.{html,php}"))
# also owner/index.php
files += list((ROOT / "owner").glob("*.php"))
files = sorted(set(files))

for path in files:
    text = path.read_text(encoding="utf-8", errors="ignore")
    orig = text

    # Remove Play CDN script
    text = re.sub(
        r'\s*<script\s+src=["\']https://cdn\.tailwindcss\.com[^"\']*["\']\s*>\s*</script>\s*',
        "\n    " + TW_LINK + "\n    ",
        text,
        count=1,
    )
    # If still present (different quoting)
    text = text.replace('src="https://cdn.tailwindcss.com"', 'data-removed-tailwind-cdn="1"')
    if "data-removed-tailwind-cdn" in text:
        text = re.sub(r'<script[^>]*data-removed-tailwind-cdn[^>]*>\s*</script>\s*', TW_LINK + "\n", text)

    # Remove inline tailwind.config blocks (only used by Play CDN)
    text = re.sub(
        r"<script>\s*tailwind\.config\s*=\s*\{.*?\}\s*</script>",
        "",
        text,
        flags=re.S,
    )

    # Font Awesome CDN → local
    text = re.sub(
        r'<link[^>]+cdnjs\.cloudflare\.com/ajax/libs/font-awesome/[^>]+>',
        FA_LINK,
        text,
    )
    text = re.sub(
        r'<script[^>]+cdnjs\.cloudflare\.com/ajax/libs/font-awesome/[^>]+></script>',
        "",
        text,
    )

    # Non-blocking Google Fonts (replace existing sync stylesheet + preconnects)
    text = re.sub(
        r'(?:\s*<link[^>]+fonts\.googleapis\.com[^>]*>)+',
        "",
        text,
    )
    text = re.sub(
        r'(?:\s*<link[^>]+fonts\.gstatic\.com[^>]*>)+',
        "",
        text,
    )
    # Insert font block once after charset/viewport if Plus Jakarta was used or page had fonts
    if "Plus Jakarta" in orig or "fonts.googleapis" in orig:
        if FONT_BLOCK.split("\n")[0] not in text:
            # after first <title> or after viewport
            text = re.sub(
                r"(<title>[^<]*</title>)",
                r"\1\n    " + FONT_BLOCK,
                text,
                count=1,
            )

    # Ensure TW link exists if CDN was present in original
    if "cdn.tailwindcss.com" in orig and "/css/tailwind.css" not in text:
        text = text.replace("</head>", "    " + TW_LINK + "\n</head>", 1)

    # Ensure FA if original had FA
    if "font-awesome" in orig.lower() and "/vendor/fontawesome/css/all.min.css" not in text:
        text = text.replace("</head>", "    " + FA_LINK + "\n</head>", 1)

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print("updated", path.relative_to(ROOT))
    else:
        print("skip", path.relative_to(ROOT))
