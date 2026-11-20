"""
Prepare generated images for the landing page.

  python -I scripts/cockpit-keys.py assets-src/images

Expected names (any of .png / .jpg / .jpeg / .webp), see docs/image-prompts.md:
  cockpit-interior   windshield/windows = #00FF00, screens = #FF00FF
  cockpit-road       plain image
  payner-wallpaper   plain image
  car-hero           car on #00FF00 (cut out + cropped)
  og-image           plain image (+ a 1200x630 crop for social previews)
  icon-map, icon-stats, icon-pipeline, icon-shield, icon-team, icon-route   on #00FF00

Writes optimised .webp files into public/images (+ public/images/icons) and
prints the interior size and screen/cluster rectangles for src/cockpit/config.ts.
Aspect ratios are preserved.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images"
EXTS = (".png", ".jpg", ".jpeg", ".webp")


def find(src: Path, name: str):
    for ext in EXTS:
        p = src / f"{name}{ext}"
        if p.exists():
            return p
    return None


def fit_width(img: Image.Image, width: int) -> Image.Image:
    """Downscale to `width` (never upscale)."""
    if img.width <= width:
        return img
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


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
        # only touch magenta-ish pixels (red AND blue above green) — keeps orange lights orange
        spill = np.minimum(out[..., 0], out[..., 2]) > out[..., 1] + 20
        cap = np.maximum(out[..., 1] + 10, np.minimum(out[..., 0], out[..., 2]) * 0.5)
        out[..., 0] = np.where(spill, np.minimum(out[..., 0], cap), out[..., 0])
        out[..., 2] = np.where(spill, np.minimum(out[..., 2], cap), out[..., 2])
    return out.clip(0, 255).astype(np.uint8)


def keyed(img: Image.Image, targets=("green",)) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"))
    alpha = np.ones(rgb.shape[:2], np.float32)
    clean = rgb
    for t in targets:
        alpha = np.minimum(alpha, 1 - key_mask(rgb, t))
        clean = despill(clean, t)
    return Image.fromarray(np.dstack([clean, (alpha * 255).astype(np.uint8)]), "RGBA")


def crop_alpha(img: Image.Image, pad=0) -> Image.Image:
    bbox = img.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def components(mask: np.ndarray, min_area: int):
    """Bounding boxes of connected regions (flood fill on a downscaled mask)."""
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
    img = fit_width(Image.open(src).convert("RGB"), 1920)
    W, H = img.size
    rgb = np.asarray(img)
    magenta = key_mask(rgb, "magenta")
    keyed(img, ("green", "magenta")).save(OUT / "cockpit-interior.webp", quality=88, method=6)

    boxes = components(magenta, min_area=3000)[:2]
    boxes.sort(key=lambda b: abs((b[0] + b[2]) / 2 - W / 2))  # centre-most = main screen
    print(f"\nInterior: w: {W}, h: {H}")
    for name, (x0, y0, x1, y1, _) in zip(["screen", "cluster"], boxes):
        print(f"  {name}: {{ x: {x0}, y: {y0}, w: {x1 - x0}, h: {y1 - y0} }},")
    if len(boxes) < 2:
        print("  (fewer than 2 magenta screens found — check the image)")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    done = []

    if p := find(src, "cockpit-interior"):
        interior(p)
        done.append("cockpit-interior")
    for n, w in (("cockpit-road", 1920), ("payner-wallpaper", 1280), ("og-image", 1920)):
        if p := find(src, n):
            fit_width(Image.open(p).convert("RGB"), w).save(OUT / f"{n}.webp", quality=84, method=6)
            done.append(n)
    if p := find(src, "og-image"):
        img = Image.open(p).convert("RGB")
        target = 1200 / 630
        h = round(img.width / target)
        if h <= img.height:
            top = (img.height - h) // 2
            img = img.crop((0, top, img.width, top + h))
        img.resize((1200, 630), Image.LANCZOS).save(OUT / "og-image.jpg", quality=86)
    if p := find(src, "car-hero"):
        car = crop_alpha(keyed(Image.open(p)), pad=4)
        fit_width(car, min(1800, car.width)).save(OUT / "car-hero.webp", quality=90, method=6)
        done.append("car-hero")
    for k in ("map", "stats", "pipeline", "shield", "team", "route"):
        if p := find(src, f"icon-{k}"):
            ic = crop_alpha(keyed(Image.open(p)))
            side = max(ic.size)
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            canvas.paste(ic, ((side - ic.width) // 2, (side - ic.height) // 2))
            canvas.resize((256, 256), Image.LANCZOS).save(OUT / "icons" / f"{k}.webp", quality=90, method=6)
            done.append(f"icon-{k}")
    print("\nProcessed:", ", ".join(done) or "nothing (check file names)")


if __name__ == "__main__":
    main()
