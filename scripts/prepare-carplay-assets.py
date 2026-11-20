"""Convert the supplied artwork into lightweight assets used by the demo UI."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-src" / "images"
OUTPUT = ROOT / "public" / "images" / "ui"


def remove_violet(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB")).astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    violet = ((red > 20) & (green < 125) & (blue > 65)
              & (blue > red * 1.22) & (red > green * 1.22)
              & (blue - red > 9))
    alpha = Image.fromarray(np.where(violet, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    # Neutralize purple JPEG fringes at the edge of the artwork.
    fringe = (blue > red + 12) & (red > green + 5) & ~violet
    rgb[fringe, 2] = red[fringe]
    result = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
    result.putalpha(alpha)
    return result


def save(name: str, image: Image.Image, width: int, *, crop: bool = False, pad: float = .06) -> None:
    if crop:
        box = image.getchannel("A").point(lambda value: 255 if value > 120 else 0).getbbox()
        if box is None:
            raise ValueError(f"No artwork found in {name}")
        padding = round(max(box[2] - box[0], box[3] - box[1]) * pad) if pad else 0
        if pad:
            padding = max(4, padding)
        image = image.crop((max(0, box[0] - padding), max(0, box[1] - padding),
                            min(image.width, box[2] + padding), min(image.height, box[3] + padding)))
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    destination = OUTPUT / f"{Path(name).stem}.webp"
    image.save(destination, "WEBP", quality=86, method=6)
    print(f"{destination.relative_to(ROOT)} {image.width}x{image.height}")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in ("icon-home-ui.jpg", "icon-risk-ui.jpg", "icon-route-ui.jpg"):
        save(name, remove_violet(Image.open(SOURCE / name)), 160, crop=True)
    for name, width in (("carplay-frame-desktop.jpg", 1500), ("carplay-frame-mobile.jpg", 750)):
        # frames are cropped exactly to the bezel: the page lays the app out in its screen opening
        save(name, remove_violet(Image.open(SOURCE / name)), width, crop=True, pad=0)
    for name in ("icon-car-ui.png", "icon-compass-ui.png", "icon-layers-ui.png", "icon-truck-ui.png",
                 "pin-end.png", "pin-start.png", "risk-high.png", "risk-low.png", "risk-medium.png"):
        save(name, Image.open(SOURCE / name).convert("RGBA"), 160, crop=True)
    for name, width in (("demo-transition.jpg", 1600), ("map-fallback.jpg", 1600),
                        ("risk-header.jpg", 1100), ("panel-material.jpg", 640)):
        save(name, Image.open(SOURCE / name).convert("RGB"), width)
