#!/usr/bin/env python3
"""Generate NVX brand assets from the transparent master logo.

Input : assets/brand/nvx-logo-master.png (1024x1024 RGBA, transparent, cleaned from the
        user-supplied artwork: stray alpha pixels removed, edges anti-aliased, square-cropped)
Output: public/brand/logo-{32,64,96}.{png,webp}, logo-512.png  (header mark @1x/2x/3x)
        src/app/favicon.ico (16/32/48), src/app/icon.png (32), src/app/apple-icon.png (180, black bg)
        public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png (web manifest)
        src/app/opengraph-image.png (1200x630, black bg)
        assets/brand/nvx-mascot-body.png + public/brand/mascot-body-{64,96,256,512}.{webp,png}
        (the logo with both eyes painted out; the animated mascot draws the eyes in SVG on top,
        see src/components/brand/mascot.tsx, which uses the same EYES geometry)
Usage : python3 scripts/gen-brand-assets.py   (needs Pillow; Inter is used for the OG title if found)
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets/brand/nvx-logo-master.png"
# Eye capsules measured on the 1024px master: centre x/y, semi-major, semi-minor, angle (deg from +x).
EYES = [(575.6, 406.3, 149, 66, 65.2), (802.1, 341.3, 150, 58, 64.3)]
PINK = (251, 15, 171)  # #fb0fab, median of saturated logo pixels
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf",
    "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def fit(img: Image.Image, size: int, pad: float = 0.0, bg=None) -> Image.Image:
    inner = max(1, round(size * (1 - 2 * pad)))
    logo = img.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    off = (size - inner) // 2
    canvas.alpha_composite(logo, (off, off))
    return canvas


def save_q(img: Image.Image, path: Path):
    """256-colour palette PNG (keeps alpha) for the large assets: ~8x smaller, visually identical at size."""
    img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)


def font(px: int, weight: str = "Bold"):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            ft = ImageFont.truetype(f, px)
            try:
                ft.set_variation_by_name(weight)
            except Exception:
                pass
            return ft
    return ImageFont.load_default(px)


def glow(size, center, radius, color, alpha):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = center
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.6))


def _box(a, r):
    r = int(max(1, r))
    for ax in (0, 1):
        pad = [(r + 1, r) if i == ax else (0, 0) for i in range(2)]
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=ax)
        n = c.shape[ax]
        a = (np.take(c, range(2 * r + 1, n), axis=ax) - np.take(c, range(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


def _blur(a, sigma):
    r = max(1, int(round(sigma * 0.9)))
    return _box(_box(_box(a, r), r), r)


def paint_out_eyes(master: Image.Image) -> Image.Image:
    """Remove both eyes (and their socket rim) by diffusing the surrounding body colour inwards."""
    size = master.size[0]
    mask = np.zeros((size, size), dtype=np.uint8)
    for cx, cy, a, b, ang in EYES:
        pad = 20
        layer = Image.new("L", (size, size), 0)
        ImageDraw.Draw(layer).ellipse((cx - b - pad, cy - a - pad, cx + b + pad, cy + a + pad), fill=255)
        mask = np.maximum(mask, np.array(layer.rotate(90 - ang, center=(cx, cy))))
    arr = np.array(master)
    rgb, alpha = arr[..., :3].astype(float), arr[..., 3]
    known = (mask < 128) & (alpha > 200)
    k = known.astype(float)
    out, filled = rgb.copy(), known.copy()
    for rad in (4, 8, 14, 22, 34, 50, 75, 110):  # coarse-to-fine push: fill from the nearest known ring
        num = np.stack([_blur(rgb[..., c] * k, rad) for c in range(3)], -1)
        den = _blur(k, rad)
        ok = (den > 0.02) & ~filled
        out[ok] = num[ok] / den[ok][:, None]
        filled |= ok
    m = np.array(Image.fromarray(mask).filter(ImageFilter.GaussianBlur(3))) / 255.0
    res = rgb * (1 - m[..., None]) + out * m[..., None]
    return Image.fromarray(np.dstack([res.clip(0, 255).astype(np.uint8), alpha]), "RGBA")


def main():
    master = Image.open(MASTER).convert("RGBA")
    brand = ROOT / "public/brand"
    brand.mkdir(parents=True, exist_ok=True)

    for s in (32, 64, 96):
        im = fit(master, s)
        im.save(brand / f"logo-{s}.png", optimize=True)
        im.save(brand / f"logo-{s}.webp", quality=90, method=6)
    save_q(fit(master, 512), brand / "logo-512.png")

    app = ROOT / "src/app"
    fit(master, 48).save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    fit(master, 32).save(app / "icon.png", optimize=True)
    black = (0, 0, 0, 255)
    fit(master, 180, pad=0.1, bg=black).convert("RGB").save(app / "apple-icon.png", optimize=True)

    pub = ROOT / "public"
    save_q(fit(master, 192, pad=0.04), pub / "icon-192.png")
    save_q(fit(master, 512, pad=0.04), pub / "icon-512.png")
    save_q(fit(master, 512, pad=0.2, bg=black).convert("RGB"), pub / "icon-maskable-512.png")

    # Open Graph card: black canvas, soft pink glow behind the logo, title + tagline.
    W, H = 1200, 630
    og = Image.new("RGBA", (W, H), black)
    og.alpha_composite(glow((W, H), (300, 315), 210, PINK, 70))
    og.alpha_composite(master.resize((340, 340), Image.LANCZOS), (130, 145))
    d = ImageDraw.Draw(og)
    x, max_w = 540, W - 540 - 64
    y = 180
    for text, size, weight, fill, gap in (
        ("NVX", 56, "SemiBold", (161, 161, 166), 8),
        ("Stack Builder", 88, "Bold", (245, 245, 247), 34),
    ):
        ft = font(size, weight)
        d.text((x, y), text, font=ft, fill=fill)
        y = d.textbbox((x, y), text, font=ft)[3] + gap
    d.rounded_rectangle((x, y, x + 96, y + 6), radius=3, fill=PINK)
    y += 36
    for line in ("Runnable Stack Templates for Node.js", "and Python, with an AI agent · TH / EN"):
        size = 30
        while d.textlength(line, font=font(size, "Regular")) > max_w:
            size -= 1
        d.text((x, y), line, font=font(size, "Regular"), fill=(161, 161, 166))
        y += 44
    save_q(og.convert("RGB"), app / "opengraph-image.png")
    body = paint_out_eyes(master)
    body.save(ROOT / "assets/brand/nvx-mascot-body.png", optimize=True)
    for sz in (64, 96, 256, 512):
        im = fit(body, sz)
        im.save(brand / f"mascot-body-{sz}.webp", quality=88, method=6)
        (save_q if sz >= 256 else (lambda i, p: i.save(p, optimize=True)))(im, brand / f"mascot-body-{sz}.png")
    print("brand assets written")


if __name__ == "__main__":
    main()
