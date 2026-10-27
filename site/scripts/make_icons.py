"""Write the Hailprint favicon set from one geometry (Nested Contours concept).

Run with `uv run python site/scripts/make_icons.py site/public <preview.png>`. The output is
`favicon.svg`, `favicon.ico`, and `apple-touch-icon.png` in `site/public/`, and a light and dark
preview sheet at `<preview.png>`.
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# The colours copy --sheet, --hail-2, --hail-4, and --hail-6 in site/src/styles/tokens.css.
SHEET = "#fdfcf9"
CANVAS = 64
TILE_RX = 14
ROTATE_DEG = -30
# (cx, cy, rx, ry, fill), outer to core: hail ramp steps 2, 4, 6.
LOOPS = [
    (30, 34, 24, 15, "#a9d2e3"),
    (34, 31, 15, 9, "#3f86b8"),
    (37, 29, 7, 4.5, "#33397a"),
]
SUPERSAMPLE = 8


def svg() -> str:
    shapes = "".join(
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" '
        f'transform="rotate({ROTATE_DEG} {cx} {cy})"/>'
        for cx, cy, rx, ry, fill in LOOPS
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">'
        f'<rect width="{CANVAS}" height="{CANVAS}" rx="{TILE_RX}" fill="{SHEET}"/>{shapes}</svg>\n'
    )


def ellipse_points(
    cx: float, cy: float, rx: float, ry: float, scale: float
) -> list[tuple[float, float]]:
    # Same matrix as SVG rotate() in y-down coordinates.
    t = math.radians(ROTATE_DEG)
    pts = []
    for i in range(360):
        a = math.radians(i)
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append(
            (
                (cx + x * math.cos(t) - y * math.sin(t)) * scale,
                (cy + x * math.sin(t) + y * math.cos(t)) * scale,
            )
        )
    return pts


def render(size: int, rounded: bool) -> Image.Image:
    big = size * SUPERSAMPLE
    scale = big / CANVAS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=TILE_RX * scale, fill=SHEET)
    else:
        draw.rectangle((0, 0, big, big), fill=SHEET)
    for cx, cy, rx, ry, fill in LOOPS:
        draw.polygon(ellipse_points(cx, cy, rx, ry, scale), fill=fill)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def preview(icons: list[Image.Image], path: Path) -> None:
    # Two chromes (light, dark); native size, then the small sizes at 6x nearest for inspection.
    zoom = [i.resize((i.width * 6, i.height * 6), Image.Resampling.NEAREST) for i in icons[:2]]
    tiles = icons + zoom
    pad = 16
    width = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    row_h = max(t.height for t in tiles) + pad * 2
    sheet = Image.new("RGB", (width, row_h * 2))
    for row, bg in enumerate(("#ffffff", "#202124")):
        ImageDraw.Draw(sheet).rectangle((0, row * row_h, width, (row + 1) * row_h), fill=bg)
        x = pad
        for t in tiles:
            sheet.paste(t, (x, row * row_h + pad), t)
            x += t.width + pad
    sheet.save(path)


def main() -> None:
    out, preview_path = Path(sys.argv[1]), Path(sys.argv[2])
    (out / "favicon.svg").write_text(svg(), encoding="utf-8", newline="\n")
    i16, i32 = render(16, rounded=True), render(32, rounded=True)
    i32.save(out / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)], append_images=[i16])
    # iOS masks the corners itself, so the touch icon is an opaque square.
    touch = render(180, rounded=False).convert("RGB")
    touch.save(out / "apple-touch-icon.png", optimize=True)

    ico = Image.open(out / "favicon.ico")
    assert sorted(ico.info["sizes"]) == [(16, 16), (32, 32)], ico.info["sizes"]
    assert Image.open(out / "apple-touch-icon.png").mode == "RGB"
    preview([i16, i32, touch.convert("RGBA")], preview_path)


if __name__ == "__main__":
    main()
