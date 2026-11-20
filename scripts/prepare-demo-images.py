"""Prepare the supplied demo JPGs for the map UI.

Requires Pillow and NumPy. The purple studio backdrop is keyed by colour;
the original files in assets-src/images are never modified.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-src" / "images"
OUTPUT = ROOT / "public" / "images"


def cutout(name: str, width: int) -> None:
    image = Image.open(SOURCE / f"demo-{name}.jpg").convert("RGB")
    rgb = np.asarray(image).astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    # The supplied backdrop is vivid violet. Keep neutral paint, glass and
    # highlights; remove violet visible around and through the vehicle.
    violet = (
        (red > 40) & (blue > 130) & (green < 115)
        & (red > green * 1.6) & (blue > green * 1.8)
        & (blue > red * 1.18) & ((blue - red) > 35)
    )
    alpha = Image.fromarray(np.where(violet, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    # JPEG antialiasing leaves violet mixed into glass and edge pixels. Remove
    # that colour cast while keeping their original brightness and detail.
    spill = (blue > red + 12) & (red > green + 5)
    luminance = (red * 0.3 + green * 0.59 + blue * 0.11).astype(np.int16)
    rgb[spill] = luminance[spill, None]
    rgba = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
    rgba.putalpha(alpha)

    bounds = alpha.point(lambda value: 255 if value > 128 else 0).getbbox()
    if bounds is None:
        raise RuntimeError(f"No vehicle found in demo-{name}.jpg")
    margin = 35
    left, top, right, bottom = bounds
    rgba = rgba.crop((max(0, left - margin), max(0, top - margin), min(image.width, right + margin), min(image.height, bottom + margin)))
    height = round(rgba.height * width / rgba.width)
    rgba = rgba.resize((width, height), Image.Resampling.LANCZOS)
    path = OUTPUT / f"demo-{name}.webp"
    rgba.save(path, "WEBP", quality=90, method=6)
    print(f"{path.relative_to(ROOT)}: {rgba.width}×{rgba.height}")


def road_texture() -> None:
    image = Image.open(SOURCE / "demo-road-texture.jpg").convert("RGB")
    width = 1400
    image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    path = OUTPUT / "demo-road-texture.webp"
    image.save(path, "WEBP", quality=82, method=6)
    print(f"{path.relative_to(ROOT)}: {image.width}×{image.height}")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cutout("car", 640)
    cutout("truck", 640)
    road_texture()
