"""
Prepare generated images for the landing page.

  python -I scripts/cockpit-keys.py <folder-with-generated-pngs>

Expected file names in the folder (see docs/image-prompts.md):
  cockpit-interior.png   windshield/windows = #00FF00, screens = #FF00FF
  cockpit-road.png       plain image (no keying)
  payner-wallpaper.png   plain image
  icon-map.png, icon-stats.png, icon-pipeline.png,
  icon-shield.png, icon-team.png, icon-route.png   on #00FF00

Writes optimised .webp files into public/images (+ public/images/icons)
and prints the screen/cluster rectangles to paste into src/cockpit/config.ts.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images"
W, H = 1536, 1024


def key_mask(rgb: np.ndarray, target: str) -> np.ndarray:
    """Soft alpha (0..1) of how strongly a pixel is the key colour."""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    if target == "green":
        dominance = g - np.maximum(r, b)
    else:  # magenta
        dominance = np.minimum(r, b) - g
    return np.clip((dominance - 60) / 80, 0, 1)


def despill(rgb: np.ndarray, target: str) -> np.ndarray:
    out = rgb.astype(np.float32)
    if target == "green":
        out[..., 1] = np.minimum(out[..., 1], np.maximum(out[..., 0], out[..., 2]))
    else:
        cap = out[..., 1] + 10
        out[..., 0] = np.minimum(out[..., 0], np.maximum(cap, out[..., 0] * 0.6))
        out[..., 2] = np.minimum(out[..., 2], np.maximum(cap, out[..., 2] * 0.6))
    return out.clip(0, 255).astype(np.uint8)


def components(mask: np.ndarray, min_area: int):
    """Bounding boxes of connected regions (simple flood fill on a downscaled mask)."""
    scale = 4
    small = mask[::scale, ::scale] > 0.5
    seen = np.zeros_like(small)
    boxes = []
    hh, ww = small.shape
    for y0 in range(hh):
        for x0 in range(ww):
            if not small[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            xs, ys = [], []
            while stack:
                y, x = stack.pop()
                xs.append(x)
                ys.append(y)
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < hh and 0 <= nx < ww and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(xs) * scale * scale >= min_area:
                boxes.append((min(xs) * scale, min(ys) * scale, (max(xs) + 1) * scale, (max(ys) + 1) * scale, len(xs)))
    return sorted(boxes, key=lambda b: -b[4])


def interior(src: Path):
    img = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    rgb = np.asarray(img)
    green = key_mask(rgb, "green")
    magenta = key_mask(rgb, "magenta")
    alpha = 1 - np.maximum(green, magenta)
    clean = despill(despill(rgb, "green"), "magenta")
    rgba = np.dstack([clean, (alpha * 255).astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(OUT / "cockpit-interior.webp", quality=88, method=6)

    boxes = components(magenta, min_area=3000)[:2]
    boxes.sort(key=lambda b: abs((b[0] + b[2]) / 2 - W / 2))  # centre-most = main screen
    names = ["screen", "cluster"]
    print("\nPaste into src/cockpit/config.ts:")
    for name, (x0, y0, x1, y1, _) in zip(names, boxes):
        print(f"  {name}: {{ x: {x0}, y: {y0}, w: {x1 - x0}, h: {y1 - y0}, r: 14 }},")
    if len(boxes) < 2:
        print("  (fewer than 2 magenta screens found — check the image)")


def plain(src: Path, name: str, size=(W, H)):
    Image.open(src).convert("RGB").resize(size, Image.LANCZOS).save(OUT / f"{name}.webp", quality=84, method=6)


def icon(src: Path, name: str):
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img)
    alpha = 1 - key_mask(rgb, "green")
    rgba = Image.fromarray(np.dstack([despill(rgb, "green"), (alpha * 255).astype(np.uint8)]), "RGBA")
    bbox = rgba.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    side = max(rgba.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    canvas.resize((256, 256), Image.LANCZOS).save(OUT / "icons" / f"{name}.webp", quality=90, method=6)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    done = []
    if (src / "cockpit-interior.png").exists():
        interior(src / "cockpit-interior.png")
        done.append("cockpit-interior")
    for n in ("cockpit-road", "payner-wallpaper"):
        if (src / f"{n}.png").exists():
            plain(src / f"{n}.png", n)
            done.append(n)
    for k in ("map", "stats", "pipeline", "shield", "team", "route"):
        p = src / f"icon-{k}.png"
        if p.exists():
            icon(p, k)
            done.append(f"icon-{k}")
    print("\nProcessed:", ", ".join(done) or "nothing (check file names)")


if __name__ == "__main__":
    main()
