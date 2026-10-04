#!/usr/bin/env python3
"""Render Karaokej app icons (PNG + ICO) using theme colors."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PNG = ROOT / "icon.png"
ICO = ROOT / "icon.ico"

BG = "#12121a"
BORDER = "#2a2a38"
GOLD = "#ffe08a"
GOLD_DEEP = "#e2b84a"
SIZES = (256, 128, 64, 48, 32, 16)

FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/mnt/c/Windows/Fonts/trebucbd.ttf",
    "/mnt/c/Windows/Fonts/segoeuib.ttf",
)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(2, size // 32)
    radius = size // 5
    draw.rounded_rectangle(
        (pad, pad, size - pad - 1, size - pad - 1),
        radius=radius,
        fill=BG,
        outline=BORDER,
        width=max(1, size // 128),
    )

    label = '"OK"'
    font_size = max(12, int(size * 0.36))
    font = load_font(font_size)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] + size // 40

    # Soft shadow
    shadow = max(1, size // 64)
    draw.text((x + shadow, y + shadow), label, font=font, fill="#00000088")
    # Gradient-ish: deep gold base + lighter pass
    draw.text((x, y + max(1, size // 128)), label, font=font, fill=GOLD_DEEP)
    draw.text((x, y), label, font=font, fill=GOLD)
    return img


def main() -> None:
    base = render(512)
    base.save(PNG, format="PNG")
    frames = [base.resize((s, s), Image.Resampling.LANCZOS) for s in SIZES]
    frames[0].save(
        ICO,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=frames[1:],
    )
    print(f"Wrote {PNG.name} and {ICO.name}")


if __name__ == "__main__":
    main()
