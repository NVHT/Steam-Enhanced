"""
README art: writes assets/readme/, the README's section banners (dark and light, swapped by
<picture>) and its feature icons (the theme's own duotone icons, dark and light).

GitHub shows README images without the theme's CSS, so the icons are baked from
core/icons-*.css and the banners drawn with system fonts. A heading changed in README.md
changes here too: edit BANNERS, run, commit the files with the README.

  python3 readme-art.py
"""
import os
import re
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
THEME = os.path.dirname(HERE)
OUT = os.path.join(THEME, 'assets', 'readme')

# Section banners: file stem -> heading
BANNERS = {
    'client': 'The client',
    'web': 'Store, Community & Support',
    'install': 'Install',
    'works-with': 'Works with',
    'make-it-yours': 'Make it yours',
    'licenses': 'Licenses',
}

# Feature icons: file stem -> the theme icon drawn
ICONS = {
    'home': 'home-stage',
    'game': 'library',
    'collections': 'grid',
    'friends': 'friends',
    'downloads': 'install',
    'overlay': 'tv',
    'startup': 'power',
    'about': 'info',
    'toasts': 'bell',
}

# The theme's palette (core/tokens.css): --se-bg, --se-surface-2, --se-accent, --se-gold
ACCENT = '#7cc4ff'
GOLD = '#f0c060'
# Icon ink, as the theme draws icons (a text tone, no colour of their own): --se-text-dim on
# GitHub dark, GitHub's own text on light
INK = {'': '#b8c0c8', '-light': '#1f2328'}
SCHEMES = {
    '': {'from': '#262c35', 'to': '#171a20', 'edge': '#ffffff', 'edge_o': '.08', 'text': '#ffffff', 'line': ACCENT, 'spark': GOLD},
    '-light': {'from': '#eef3f8', 'to': '#ffffff', 'edge': '#d1d9e0', 'edge_o': '1', 'text': '#1f2328', 'line': '#0969da', 'spark': '#bf8700'},
}
FONT = "'Segoe UI', -apple-system, Helvetica, Arial, sans-serif"
W, H = 880, 56


def banner(title, c):
    text = title.replace('&', '&amp;')
    line_x = 64 + round(len(title) * 11.6)  # past the title at 20 px bold
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{text}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="{c['from']}"/><stop offset=".7" stop-color="{c['to']}"/></linearGradient>
    <linearGradient id="ln" x1="0" x2="1"><stop offset="0" stop-color="{c['line']}" stop-opacity=".55"/><stop offset="1" stop-color="{c['line']}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="10" fill="url(#bg)" stroke="{c['edge']}" stroke-opacity="{c['edge_o']}"/>
  <text x="22" y="35" font-family="{FONT}" font-size="18" fill="{c['spark']}">✦</text>
  <text x="48" y="35" font-family="{FONT}" font-size="20" font-weight="700" fill="{c['text']}">{text}</text>
  <rect x="{line_x}" y="27.5" width="{W - line_x - 24}" height="1" fill="url(#ln)"/>
</svg>
'''


def theme_icons():
    css = ''.join(open(os.path.join(THEME, 'core', f), encoding='utf-8').read() for f in ('icons-nav.css', 'icons-ui.css'))
    found = {}
    for name in ICONS.values():
        m = re.search(r'--se-icon-' + re.escape(name) + r':\s*url\("data:image/svg\+xml,([^"]+)"\)', css)
        if not m:
            raise SystemExit(f'no --se-icon-{name} in core/icons-*.css')
        found[name] = urllib.parse.unquote(m.group(1))
    return found


def recolour(svg, ink):
    # Masks draw in #000; the README needs the ink itself. A shape with no fill of its own
    # takes the root's, so the root gets the ink too.
    svg = svg.replace('#000', ink)
    root = '<svg width="32" height="32" ' + ('' if 'fill=' in svg.split('>')[0] else f'fill="{ink}" ')
    return re.sub(r'<svg ', root, svg, count=1)


def main():
    os.makedirs(OUT, exist_ok=True)
    written = []
    for stem, title in BANNERS.items():
        for suffix, scheme in SCHEMES.items():
            name = f'h-{stem}{suffix}.svg'
            open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n').write(banner(title, scheme))
            written.append(name)
    icons = theme_icons()
    for stem, name in ICONS.items():
        for suffix, ink in INK.items():
            file = f'icon-{stem}{suffix}.svg'
            open(os.path.join(OUT, file), 'w', encoding='utf-8', newline='\n').write(recolour(icons[name], ink) + '\n')
            written.append(file)
    keep = set(written)
    for old in os.listdir(OUT):
        if old not in keep:
            os.remove(os.path.join(OUT, old))
            print(f'removed {old}')
    print(f'{len(written)} files in assets/readme/')


if __name__ == '__main__':
    main()
