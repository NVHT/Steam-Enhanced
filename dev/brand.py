"""Draw the theme's mark once and write every copy of it.

Usage:
  python brand.py <THEME_DIR>

The mark: a ring in two even halves (full tone on the left, 32% on the right), three fanned
cards (32% faces, full outlines), the arm and wheels, and the spark at 12. One colour in two
tones, its parts kept apart by real cut-outs (never a background colour), so the same drawing
works as a CSS mask in currentColor. Writes:

  --se-brand-icon    client/navigation/nav-rail.css  the mask: rail, title bar, entrance
  BRAND              client/loader.js                the same mask, for the loading cover
  --se-brand-mark    core/spinner.css                the medallion inside a spinner (PNG)
  --se-brand-logo    client/dialogs/about-steam.css  the app tile, white and gold (PNG)
  assets/logo.png                                    the same tile, 128 px

PNGs are rendered by headless Microsoft Edge (transparent ground). Rerun dev/spinner_svg.py
afterwards: its pictures are drawn around --se-brand-mark.
"""
import base64
import math
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
WHITE, GOLD = '#ffffff', '#f0c060'
DUO = .32  # --se-icon-duo

# Drawn in a 512 space: centre 256, ring radius 150. The icon's view is 380 wide, so one unit
# of a 24-unit icon is 380 / 24 here.
VIEW = 380
VB = '66 66 380 380'
U = VIEW / 24
BODY = 'M 189.2 282.4 L 262.1 178.4 A 52 52 0 1 1 335.6 251.9 L 241.6 330.8 A 36 36 0 1 1 189.2 282.4 Z'
STAR = 'M50 0 C53 32 68 47 100 50 C68 53 53 68 50 100 C47 68 32 53 0 50 C32 47 47 32 50 0 Z'
SPARK = 76


def pt(r, deg):
    a = math.radians(deg - 90)
    return 256 + r * math.cos(a), 256 + r * math.sin(a)


def arc(r, a0, a1):
    x0, y0 = pt(r, a0)
    x1, y1 = pt(r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f'M{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}'


def star(cx, cy, s, fill):
    k = s / 100
    return f'<path d="{STAR}" fill="{fill}" transform="translate({cx - s / 2:.2f} {cy - s / 2:.2f}) scale({k})"/>'


def arm():
    """The arm ends on the ring's centre line, so its round end sits flush with the outer edge."""
    ax, ay, bx, by = 218, 304, 94, 252
    dx, dy, fx, fy = bx - ax, by - ay, ax - 256, ay - 256
    a, b, c = dx * dx + dy * dy, 2 * (fx * dx + fy * dy), fx * fx + fy * fy - 150 * 150
    t = (-b + (b * b - 4 * a * c) ** .5) / (2 * a)
    return f'M {ax} {ay} L {ax + dx * t:.1f} {ay + dy * t:.1f}'


ARM = arm()


def fan():
    """Three cards, shrunk about their middle until each sits whole inside the ring with a gap.
    The fan sits up and to the left of centre, so the cards show above the arm, not behind it."""
    cards = ((206, 238, -22, 104, 144), (256, 226, 0, 108, 148), (306, 238, 20, 108, 148))
    ox, oy = 248, 236
    limit = 150 - U - .6 * U - (1.15 * U) / 2
    cx = sum(c[0] for c in cards) / 3
    cy = sum(c[1] for c in cards) / 3

    def reach(k):
        far = 0
        for tx, ty, rot, w, h in cards:
            x0, y0 = ox + (tx - cx) * k, oy + (ty - cy) * k
            r = math.radians(rot)
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                ddx, ddy = sx * w * k / 2, sy * h * k / 2
                far = max(far, math.hypot(x0 + ddx * math.cos(r) - ddy * math.sin(r) - 256, y0 + ddx * math.sin(r) + ddy * math.cos(r) - 256))
        return far

    k = 1.0
    while reach(k) > limit:
        k -= .01
    return tuple((round(ox + (tx - cx) * k, 1), round(oy + (ty - cy) * k, 1), rot, round(w * k, 1), round(h * k, 1)) for tx, ty, rot, w, h in cards)


CARDS = fan()


def card_tr(c):
    tx, ty, rot, w, h = c
    return f'translate({tx} {ty}) rotate({rot}) translate({-w / 2} {-h / 2})'


def mark(c, spark=None, ring=True, weight=1.0):
    """The mark's parts in colour c (spark: its own colour, or None for none). ring=False draws
    the medallion's inside only (cards and arm), for a ring the caller draws itself."""
    ring_w = 2.0 * U * weight
    card_w = 1.15 * U * weight
    gap = U
    whole = '<rect x="66" y="66" width="380" height="380" fill="#fff"/>'
    defs = '<defs>'
    defs += (f'<mask id="h" maskUnits="userSpaceOnUse" x="66" y="66" width="380" height="380">{whole}'
             f'<circle cx="302" cy="212" r="35.5" fill="#000"/><circle cx="302" cy="212" r="{35.5 - U:.1f}" fill="#fff"/>'
             f'<circle cx="218" cy="304" r="{18.5 + U:.1f}" fill="#000"/>'
             f'<path d="{ARM}" stroke="#000" stroke-width="{35 + 2 * U * .8:.1f}" stroke-linecap="round"/><path d="{ARM}" stroke="#fff" stroke-width="35" stroke-linecap="round"/>'
             f'<circle cx="218" cy="304" r="18.5" fill="#fff"/></mask>')
    defs += (f'<mask id="p" maskUnits="userSpaceOnUse" x="66" y="66" width="380" height="380">{whole}'
             f'<path d="{BODY}" fill="#000" stroke="#000" stroke-width="{2 * gap:.1f}" stroke-linejoin="round"/>'
             f'<path d="{ARM}" stroke="#000" stroke-width="{35 + 2 * gap:.1f}" stroke-linecap="round"/></mask>')
    sx, sy = pt(150, 0)
    if spark:
        defs += f'<mask id="s" maskUnits="userSpaceOnUse" x="66" y="66" width="380" height="380">{whole}{star(sx, sy, SPARK + 2.4 * gap, "#000")}</mask>'
    for i in range(3):
        cut = ''.join(f'<rect width="{w}" height="{h}" rx="16" fill="#000" stroke="#000" stroke-width="{card_w + 1.2 * gap:.1f}" transform="{card_tr(cd)}"/>'
                      for cd in CARDS[i + 1:] for (_, _, _, w, h) in [cd])
        defs += f'<mask id="q{i}" maskUnits="userSpaceOnUse" x="66" y="66" width="380" height="380">{whole}{cut}</mask>'
    defs += '</defs>'

    out = defs + '<g mask="url(#p)">' + ('<g mask="url(#s)">' if spark else '<g>')
    if ring:
        out += f'<path d="{arc(150, 0, 180)}" fill="none" stroke="{c}" stroke-opacity="{DUO}" stroke-width="{ring_w:.1f}"/>'
        out += f'<path d="{arc(150, 180, 359.99)}" fill="none" stroke="{c}" stroke-width="{ring_w:.1f}"/>'
    for i, cd in enumerate(CARDS):
        out += (f'<g mask="url(#q{i})"><rect width="{cd[3]}" height="{cd[4]}" rx="16" fill="{c}" fill-opacity="{DUO}" '
                f'stroke="{c}" stroke-width="{card_w:.1f}" transform="{card_tr(cd)}"/></g>')
    out += '</g></g>'
    out += f'<g mask="url(#h)"><path d="{BODY}" fill="{c}"/><path d="{ARM}" stroke="{c}" stroke-width="35" stroke-linecap="round"/></g>'
    if spark:
        out += star(sx, sy, SPARK, spark)
    return out


def svg(view, body, size=None):
    wh = f' width="{size}" height="{size}"' if size else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"{wh}>{body}</svg>'


def icon_svg():
    """The mask: one colour; the spark is part of it. The drawing sits half a unit low (the
    spark on top would lift it)."""
    return svg(VB, f'<g transform="translate(0 {U / 2:.2f})">{mark("#000", "#000")}</g>')


def medallion_svg():
    """Inside a spinner's ring: a dark disc, the cards and arm on it, no ring or spark."""
    disc = '<circle cx="256" cy="256" r="160" fill="#1d2128"/><circle cx="256" cy="256" r="159.5" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="1"/>'
    # Without its ring the inside is drawn larger, to fill the disc; the arm runs off its edge
    inner = (f'<defs><clipPath id="d"><circle cx="256" cy="256" r="150"/></clipPath></defs>'
             f'<g clip-path="url(#d)"><g transform="translate(256 256) scale(1.16) translate(-256 -256)">{mark(WHITE, None, ring=False)}</g></g>')
    return svg('94 94 324 324', disc + inner)


def logo_svg():
    """The app tile, white with the gold spark."""
    tile = ('<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a313b"/><stop offset="1" stop-color="#15191f"/></linearGradient></defs>'
            '<rect x="66" y="66" width="380" height="380" rx="86" fill="url(#t)"/>'
            '<rect x="67" y="67" width="378" height="378" rx="85" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>')
    inner = f'<g transform="translate(256 256) scale(.86) translate(-256 -256) translate(0 {U / 2:.2f})">{mark(WHITE, GOLD)}</g>'
    return svg(VB, tile + inner)


def data_uri(s):
    return 'data:image/svg+xml,' + urllib.parse.quote(s, safe=' /=:,.-()')


def png(s, size):
    if not EDGE.exists():
        sys.exit(f'brand: no Edge at {EDGE}; the PNGs need it')
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / 'mark.html'
        shot = Path(tmp) / 'mark.png'
        page.write_text(f'<!doctype html><html><body style="margin:0;background:transparent">{svg_sized(s, size)}</body></html>', encoding='utf-8')
        subprocess.run([str(EDGE), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp}\\profile',
                        '--default-background-color=00000000', f'--window-size={size},{size}', f'--screenshot={shot}', page.as_uri()],
                       check=True, capture_output=True, timeout=60)
        # msedge.exe hands off to a browser process and returns before the shot is written
        for _ in range(300):
            if shot.exists() and shot.stat().st_size:
                time.sleep(.3)
                return shot.read_bytes()
            time.sleep(.1)
        sys.exit('brand: Edge wrote no screenshot')


def svg_sized(s, size):
    return s.replace('<svg ', f'<svg width="{size}" height="{size}" style="display:block" ', 1)


def replace_once(path, pattern, value):
    text = path.read_text(encoding='utf-8')
    new, n = re.subn(pattern, lambda m: m.group(1) + value + m.group(2), text, count=1)
    if n != 1:
        sys.exit(f'brand: no match for {pattern!r} in {path}')
    path.write_text(new, encoding='utf-8')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = Path(sys.argv[1])
    icon = data_uri(icon_svg())
    replace_once(root / 'client/navigation/nav-rail.css', r'(--se-brand-icon: url\(")data:image/svg\+xml,[^"]*("\))', icon)
    replace_once(root / 'client/loader.js', r"(const BRAND = 'url\(\")data:image/svg\+xml,[^\"]*(\"\)')", icon)
    mark_png = base64.b64encode(png(medallion_svg(), 128)).decode()
    replace_once(root / 'core/spinner.css', r'(--se-brand-mark: url\(")data:image/png;base64,[A-Za-z0-9+/=]*("\))', 'data:image/png;base64,' + mark_png)
    logo = png(logo_svg(), 128)
    replace_once(root / 'client/dialogs/about-steam.css', r'(--se-brand-logo: url\(")data:image/png;base64,[A-Za-z0-9+/=]*("\))', 'data:image/png;base64,' + base64.b64encode(logo).decode())
    (root / 'assets/logo.png').write_bytes(logo)
    print(f'brand: icon {len(icon)} chars, mark {len(mark_png)} b64, logo {len(logo)} bytes')


if __name__ == '__main__':
    main()
