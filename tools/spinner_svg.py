"""Build the sweep spinner SVG used by features/spinner/spinner.css (--se-spinner-image).

Usage:
  python3 spinner_svg.py <THEME_DIR>
      Rewrite --se-spinner-image in features/spinner/spinner.css in place, with the theme's
      mark (branding/mark.png) on the tile.

The tail is one arc stroked in the accent color and faded by a luminance mask. The mask is
built from 45-degree wedges, each an opaque gray gradient running along its arc chord. Each
wedge reaches 2 degrees back under the previous one, and opaque fills replace rather than
blend, so the wedges meet without the seams the old 40 overlapping segments left.
"""
import base64
import math
import re
import sys
from pathlib import Path

ACCENT = '#7cc4ff'
HEAD = '#dff0ff'
TILE = '#1f242b'
C = 48           # center
R = 40           # ring radius
W = 6            # ring width
TAIL = 270       # degrees of tail behind the head
STEP = 45        # wedge size
OVERLAP = 2      # degrees each wedge reaches under the previous one
FAR = 70         # wedge corner radius, well past the ring
SPIN = '1.2s'
MARK = 54        # mark size on the 60-unit tile (the mark brings its own rim)


def point(deg, r):
    a = math.radians(deg)
    return C + r * math.cos(a), C + r * math.sin(a)


def fade(t):
    """Tail opacity along its length (0 = tail end, 1 = head)."""
    return max(0.0, min(1.0, t)) ** 1.6


def gray(v):
    g = round(v * 255)
    return f'#{g:02x}{g:02x}{g:02x}'


def build(logo_href):
    start = -90 - TAIL  # the head sits at the top (-90 deg in SVG's y-down frame)
    defs, wedges = [], []
    for i in range(TAIL // STEP):
        a0 = start + i * STEP
        a1 = a0 + STEP
        x1, y1 = point(a0, R)
        x2, y2 = point(a1, R)
        gid = f'g{i}'
        defs.append(
            f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
            f'x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}">'
            f'<stop offset="0" stop-color="{gray(fade(i * STEP / TAIL))}"/>'
            f'<stop offset="1" stop-color="{gray(fade((i + 1) * STEP / TAIL))}"/></linearGradient>'
        )
        pts = [(C, C), point(a0 - (OVERLAP if i else 0), FAR), point((a0 + a1) / 2, FAR / math.cos(math.radians(STEP / 2))), point(a1, FAR)]
        wedges.append(f'<path d="M{" L".join(f"{x:.2f} {y:.2f}" for x, y in pts)}Z" fill="url(#{gid})"/>')

    sx, sy = point(start, R)
    hx, hy = point(-90, R)
    tail = f'M{sx:.2f} {sy:.2f}A{R} {R} 0 1 1 {hx:.2f} {hy:.2f}'

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
        f'<style>@keyframes r{{to{{transform:rotate(360deg)}}}}.s{{transform-origin:{C}px {C}px;animation:r {SPIN} linear infinite}}'
        '@media (prefers-reduced-motion:reduce){.s{animation-duration:3s}}</style>'
        f'<defs>{"".join(defs)}<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="96" '
        f'color-interpolation="sRGB"><rect width="96" height="96" fill="#000"/>{"".join(wedges)}</mask></defs>'
        f'<circle cx="{C}" cy="{C}" r="{R}" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="{W}"/>'
        f'<g class="s"><path d="{tail}" fill="none" stroke="{ACCENT}" stroke-width="{W}" mask="url(#m)"/>'
        f'<circle cx="{hx:.2f}" cy="{hy:.2f}" r="7" fill="{ACCENT}" fill-opacity=".25"/>'
        f'<circle cx="{hx:.2f}" cy="{hy:.2f}" r="4.2" fill="{HEAD}"/></g>'
        f'<circle cx="{C}" cy="{C}" r="30" fill="{TILE}"/>'
        f'<image x="{C - MARK / 2:g}" y="{C - MARK / 2:g}" width="{MARK}" height="{MARK}" href="{logo_href}"/></svg>'
    )


def main(theme):
    css_path = Path(theme) / 'features' / 'spinner' / 'spinner.css'
    css = css_path.read_text(encoding='utf-8')
    token = re.search(r'(--se-spinner-image: url\("data:image/svg\+xml;base64,)([A-Za-z0-9+/=]+)("\))', css)
    mark = (Path(theme) / 'branding' / 'mark.png').read_bytes()
    logo = 'data:image/png;base64,' + base64.b64encode(mark).decode('ascii')
    encoded = base64.b64encode(build(logo).encode('utf-8')).decode('ascii')
    css_path.write_text(css[: token.start(2)] + encoded + css[token.end(2):], encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
