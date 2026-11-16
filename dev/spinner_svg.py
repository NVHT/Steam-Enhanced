"""Build every loading spinner style's picture (--se-spinner-image).

Usage:
  python3 spinner_svg.py <THEME_DIR>
      Rewrite --se-spinner-image in core/spinner.css (the default style) and in each
      options/startup/spinner-<style>.css, drawn around the mark core/spinner.css holds
      (--se-brand-mark), so the pictures and the CSS spinner can't drift apart.

A picture is for the places a pseudo-element can't reach (an <img> swapped by `content`, a
background). It draws what the CSS recipe in core/spinner.css draws for the same style, in the
same units (box 96, radius 48): ring widths as % of the radius, dots as % of the box.

A fading tail is an accent arc under a luminance mask of 45-degree wedges, each an opaque gray
gradient along its chord. Each wedge reaches 2 degrees back under the previous one and opaque
fills replace rather than blend, so the wedges meet without seams.
"""
import math
import re
import sys
import urllib.parse
from pathlib import Path

ACCENT = '#7cc4ff'
C = 48
STEP = 45
OVERLAP = 2
FAR = 70
MARK = 96 * .7
DEFAULT = 'refined'  # drawn into core/spinner.css; the others into their option files

# Keep in step with the tokens in core/spinner.css and options/startup/spinner-*.css.
STYLES = {
    'comet': dict(w=6, track=3, length=108, a1=.15, a2=.55, head=ACCENT, dot=4, dot_color='#e4f3ff',
                  turn='1s linear', mark='float'),
    'refined': dict(w=10, track=5, length=216, a1=.10, a2=.55, head='#bfe3ff', dot=2.5, dot_color='#bfe3ff',
                    turn='1.15s cubic-bezier(.45,.1,.55,.9)', mark=None),
    'elastic': dict(w=7.5, track=7.5, elastic=True, turn='2.4s linear', mark=None),
    'breathe': dict(w=10, track=5, length=216, a1=.10, a2=.55, head='#bfe3ff', dot=2.5, dot_color='#bfe3ff',
                    turn='1.15s cubic-bezier(.45,.1,.55,.9)', mark='breathe'),
    'classic': dict(w=7.5, track=7.5, length=225, a1=.08, a2=.40, head=ACCENT, dot=0, dot_color=ACCENT,
                    turn='1.2s linear', mark=None),
}


def point(deg, r):
    a = math.radians(deg)
    return C + r * math.cos(a), C + r * math.sin(a)


def gray(v):
    g = round(max(0.0, min(1.0, v)) * 255)
    return f'#{g:02x}{g:02x}{g:02x}'


def tail_opacity(s, f):
    """Opacity f of the way from the tail end (0) to the head (1), as the CSS conic stops."""
    stops = [(0, 0), (.3, s['a1']), (.67, s['a2']), (1, 1)]
    for (f0, v0), (f1, v1) in zip(stops, stops[1:]):
        if f <= f1:
            return v0 + (v1 - v0) * (f - f0) / (f1 - f0)
    return 1


def mark_motion(s):
    if s['mark'] == 'float':
        return '.m{animation:fl 3s ease-in-out infinite}@keyframes fl{50%{transform:translateY(-2.7px)}}'
    if s['mark'] == 'breathe':
        return ('.m{transform-origin:48px 48px;animation:br 2.4s ease-in-out infinite}'
                '@keyframes br{50%{transform:scale(.93)}}'
                '.h{transform-origin:48px 48px;animation:hl 2.4s ease-out infinite}'
                '@keyframes hl{0%{opacity:.35;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.24)}}')
    return ''


def build(s, mark_href):
    w = s['w'] / 100 * C          # arc band, user units
    r = C - w / 2                 # band centre radius
    t = s['track'] / 100 * C
    m = (96 - MARK) / 2
    css = [f".s{{transform-origin:48px 48px;animation:r {s['turn']} infinite}}@keyframes r{{to{{transform:rotate(360deg)}}}}"]
    defs, body = [], []

    body.append(f"<circle cx='48' cy='48' r='{r:g}' fill='none' stroke='#fff' stroke-opacity='.07' stroke-width='{t:g}'/>")

    if s.get('elastic'):
        circ = 2 * math.pi * r
        def dash(deg):
            l = deg / 360 * circ
            return f'stroke-dasharray:{l:.2f} {circ - l:.2f};stroke-dashoffset:{l:.2f}'
        css.append(
            ".k{transform-origin:48px 48px;animation:k 2.6s cubic-bezier(.4,0,.2,1) infinite}"
            "@keyframes k{0%{transform:rotate(0)}25%,50%{transform:rotate(180deg)}75%,100%{transform:rotate(360deg)}}"
            f".e{{animation:e 2.6s cubic-bezier(.4,0,.2,1) infinite;{dash(4)}}}"
            f"@keyframes e{{0%,50%,100%{{{dash(4)}}}25%,75%{{{dash(184)}}}}}"
        )
        body.append(f"<g class='s'><g class='k'><circle class='e' cx='48' cy='48' r='{r:g}' fill='none' stroke='{ACCENT}' "
                    f"stroke-width='{w:g}' stroke-linecap='round' transform='rotate(-90 48 48)'/></g></g>")
    else:
        length = s['length']
        start = -90 - length
        wedges = []
        n = math.ceil(length / STEP)
        for i in range(n):
            a0 = start + i * STEP
            a1 = min(a0 + STEP, -90)
            x1, y1 = point(a0, r)
            x2, y2 = point(a1, r)
            defs.append(
                f"<linearGradient id='g{i}' gradientUnits='userSpaceOnUse' x1='{x1:.2f}' y1='{y1:.2f}' x2='{x2:.2f}' y2='{y2:.2f}'>"
                f"<stop offset='0' stop-color='{gray(tail_opacity(s, (a0 - start) / length))}'/>"
                f"<stop offset='1' stop-color='{gray(tail_opacity(s, (a1 - start) / length))}'/></linearGradient>"
            )
            half = (a1 - a0) / 2
            pts = [(C, C), point(a0 - (OVERLAP if i else 0), FAR), point(a0 + half, FAR / math.cos(math.radians(half))), point(a1, FAR)]
            wedges.append(f"<path d='M{' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts)}Z' fill='url(#g{i})'/>")
        defs.append(f"<mask id='t' maskUnits='userSpaceOnUse' x='0' y='0' width='96' height='96' color-interpolation='sRGB'>"
                    f"<rect width='96' height='96' fill='#000'/>{''.join(wedges)}</mask>")
        sx, sy = point(start, r)
        hx, hy = point(-90, r)
        arc = f"M{sx:.2f} {sy:.2f}A{r:g} {r:g} 0 {1 if length > 180 else 0} 1 {hx:.2f} {hy:.2f}"
        head = ''
        if s['head'] != ACCENT:  # a lighter head: the last stretch of the arc in its colour, faded in
            hs = point(-90 - length * .33, r)
            defs.append(f"<linearGradient id='hd' gradientUnits='userSpaceOnUse' x1='{hs[0]:.2f}' y1='{hs[1]:.2f}' x2='{hx:.2f}' y2='{hy:.2f}'>"
                        f"<stop offset='0' stop-color='{s['head']}' stop-opacity='0'/><stop offset='1' stop-color='{s['head']}'/></linearGradient>")
            head = f"<path d='{arc}' fill='none' stroke='url(#hd)' stroke-width='{w:g}' mask='url(#t)'/>"
        dot = f"<circle cx='{hx:.2f}' cy='{hy:.2f}' r='{s['dot'] / 100 * 96:g}' fill='{s['dot_color']}'/>" if s['dot'] else ''
        body.append(f"<g class='s'><path d='{arc}' fill='none' stroke='{ACCENT}' stroke-width='{w:g}' mask='url(#t)'/>{head}{dot}</g>")

    if s['mark'] == 'breathe':
        body.append(f"<circle class='h' cx='48' cy='48' r='{MARK / 2:g}' fill='none' stroke='{ACCENT}' stroke-width='1.5'/>")
    css.append(mark_motion(s))
    css.append('@media (prefers-reduced-motion:reduce){.s,.k,.e{animation-duration:3s}.m,.h{animation:none}}')
    body.append(f"<image class='m' x='{m:g}' y='{m:g}' width='{MARK:g}' height='{MARK:g}' href='{mark_href}'/>")

    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><style>{''.join(css)}</style>"
            f"<defs>{''.join(defs)}</defs>{''.join(body)}</svg>")


def as_css_url(svg):
    # Percent-encode only what a CSS url("...") needs; '#' must be, or it starts a fragment.
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" '/=:;,.()-_!*@{}+") + '")'


def rewrite(path, svg):
    css = path.read_text(encoding='utf-8')
    image = re.search(r'(--se-spinner-image: )url\("[^"]*"\)', css)
    if not image:
        sys.exit(f'spinner_svg: no --se-spinner-image declaration in {path}')
    path.write_text(css[: image.start()] + image.group(1) + as_css_url(svg) + css[image.end():], encoding='utf-8')


def main(theme):
    root = Path(theme)
    core = root / 'core' / 'spinner.css'
    if not core.is_file():
        sys.exit(f'spinner_svg: {core} not found (is {theme} the theme folder?)')
    mark = re.search(r'--se-brand-mark: url\("(data:image/png;base64,[A-Za-z0-9+/=]+)"\)', core.read_text(encoding='utf-8'))
    if not mark:
        sys.exit(f'spinner_svg: no --se-brand-mark in {core}')
    for name, style in STYLES.items():
        target = core if name == DEFAULT else root / 'options' / 'startup' / f'spinner-{name}.css'
        rewrite(target, build(style, mark.group(1)))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
