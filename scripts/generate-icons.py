#!/usr/bin/env python3
"""Original Zen Page Shot toolbar icons — page silhouette + capture lens."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
BG = (26, 25, 22, 255)
CREAM = (243, 239, 230, 255)
AMBER = (232, 122, 64, 255)
AMBER_CORE = (255, 214, 170, 255)


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=max(1, int(radius)), fill=fill)


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = max(1, round(size * 0.06))
    rounded_rect(draw, (pad, pad, size - 1 - pad, size - 1 - pad), size * 0.24, BG)

    # Tall page — slightly inset, suggesting more than a viewport.
    page_left = size * 0.29
    page_top = size * 0.18
    page_right = size * 0.71
    page_bottom = size * 0.78
    rounded_rect(
        draw,
        (page_left, page_top, page_right, page_bottom),
        size * 0.08,
        CREAM,
    )

    # Continuation under the page: a shorter slab so 16px still reads as "long".
    if size >= 32:
        slab_top = size * 0.72
        slab_bottom = size * 0.84
        inset = size * 0.06
        rounded_rect(
            draw,
            (page_left + inset, slab_top, page_right - inset, slab_bottom),
            size * 0.04,
            (214, 208, 196, 255),
        )

    # Lens punched through the page.
    cx, cy = size * 0.5, size * 0.44
    outer = size * (0.13 if size >= 32 else 0.16)
    inner = outer * 0.42
    draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), fill=BG)
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=AMBER)
    if size >= 48:
        glint = inner * 0.45
        draw.ellipse(
            (cx - glint * 0.4, cy - inner * 0.55, cx + glint * 1.1, cy - inner * 0.05),
            fill=AMBER_CORE,
        )

    return img


def main():
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        icon = make_icon(size)
        dest = OUT / f"icon{size}.png"
        icon.save(dest, "PNG")
        print(f"wrote {dest}")


if __name__ == "__main__":
    main()
