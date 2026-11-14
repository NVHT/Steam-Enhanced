"""Raw-colour check for the theme's CSS.

    python dev/colors.py            flags only; exit code 1 if anything is flagged
    python dev/colors.py --report   also lists raw colours per file

Flags what should be a token, so it doesn't creep back:
  - a raw colour equal to a scale token (the white and black scales, hairline, divider, white,
    the accent tints): write var(--se-...) instead
  - the accent at an opacity, rgba(124, 196, 255, a): write
    color-mix(in srgb, var(--se-accent) <a*100>%, transparent), which follows the accent
  - a var(--se-x, <colour>) fallback equal to the token's own value: tokens load everywhere
    (client loader, web loaders), so the fallback is dead

White and black inside gradients (art fades), translucent white text over art (.3 and up)
and one-off colours are only reported, never flagged.
Skips core/tokens.css, vendor files, comments and SVG data URIs.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKENS = os.path.join(ROOT, 'core', 'tokens.css')
COLOR = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)')
FALLBACK = re.compile(r'var\((--se-[\w-]+),\s*(#[0-9a-fA-F]{3,8}|rgba?\([^()]*\))\s*\)')
COMMENT = re.compile(r'/\*.*?\*/', re.S)

# Tokens whose value, written raw, is always a mistake (generic scale steps).
SCALE = [
    '--se-white-02', '--se-white-03', '--se-white-04', '--se-hairline', '--se-white-07',
    '--se-divider', '--se-white-10', '--se-white-12', '--se-white-14', '--se-white-18',
    '--se-white-25', '--se-white',
    '--se-black-15', '--se-black-20', '--se-black-30', '--se-black-40', '--se-black-50',
    '--se-black-60', '--se-black-70', '--se-black-80', '--se-black-90',
    '--se-accent-tint', '--se-accent-line', '--se-accent-strong',
]


def _num(text):
    value = float(text)
    out = '%g' % value
    return out[1:] if out.startswith('0.') else out


def norm(color):
    """One spelling per colour: #rrggbb, or rgba(r,g,b,a) with a in short form."""
    color = color.strip().lower()
    if color.startswith('#'):
        hexes = color[1:]
        if len(hexes) in (3, 4):
            hexes = ''.join(ch * 2 for ch in hexes)
        if len(hexes) == 8 and hexes.endswith('ff'):
            hexes = hexes[:6]
        return '#' + hexes
    match = re.fullmatch(r'rgba?\(\s*([^)]*)\)', color)
    if not match:
        return color
    parts = [p for p in re.split(r'[\s,/]+', match.group(1)) if p]
    try:
        parts = [_num(p) for p in parts]
    except ValueError:
        return color
    if len(parts) == 4 and parts[3] == '1':
        parts = parts[:3]
    if len(parts) == 3:
        return '#%02x%02x%02x' % tuple(int(float(p)) for p in parts)
    return 'rgba(%s)' % ','.join(parts)


def load_tokens():
    """{token: normalised colour}, following var() aliases inside tokens.css."""
    text = COMMENT.sub('', open(TOKENS, encoding='utf-8').read())
    raw = dict(re.findall(r'(--se-[\w-]+)\s*:\s*([^;]+);', text))

    def resolve(name, depth=0):
        value = raw.get(name, '').strip()
        alias = re.fullmatch(r'var\((--se-[\w-]+)\)', value)
        if alias and depth < 8:
            return resolve(alias.group(1), depth + 1)
        return value

    return {name: norm(resolve(name)) for name in raw if COLOR.fullmatch(resolve(name) or '')}


def css_files():
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ('.git', 'vendor', 'node_modules')]
        for name in files:
            path = os.path.join(folder, name)
            if name.endswith('.css') and path != TOKENS:
                yield path


def main():
    report = '--report' in sys.argv
    tokens = load_tokens()
    scale = {tokens[name]: name for name in SCALE if name in tokens}
    flags = []
    raw_per_file = {}

    for path in css_files():
        rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
        text = open(path, encoding='utf-8').read()
        # Blank out comments, keeping line numbers.
        text = COMMENT.sub(lambda m: re.sub(r'[^\n]', ' ', m.group(0)), text)
        raw_count = 0
        for number, line in enumerate(text.split('\n'), 1):
            if 'data:image' in line:
                continue
            for match in FALLBACK.finditer(line):
                name, color = match.groups()
                if tokens.get(name) == norm(color):
                    flags.append((rel, number, f'dead fallback: {match.group(0)} -> var({name})'))
            in_gradient = 'gradient' in line  # art fades: white and black stops stay as written
            for match in COLOR.finditer(line):
                if line[max(0, match.start() - 4):match.start()] == 'var(':
                    continue
                value = norm(match.group(0))
                if FALLBACK.search(line) and any(m.start() <= match.start() < m.end() for m in FALLBACK.finditer(line)):
                    continue  # counted above
                art = in_gradient and (value == '#ffffff' or value.startswith(('rgba(255,255,255,', 'rgba(0,0,0,')))
                if value in scale and not art:
                    flags.append((rel, number, f'{match.group(0)} -> var({scale[value]})'))
                elif value.startswith('rgba(124,196,255,'):
                    pct = '%g' % (float(value[len('rgba(124,196,255,'):-1]) * 100)
                    flags.append((rel, number, f'{match.group(0)} -> color-mix(in srgb, var(--se-accent) {pct}%, transparent)'))
                else:
                    raw_count += 1
        if raw_count:
            raw_per_file[rel] = raw_count

    for rel, number, message in flags:
        print(f'{rel}:{number}: {message}')
    if report:
        print(f'\nRaw colours left (art, one-offs): {sum(raw_per_file.values())} in {len(raw_per_file)} files')
        for rel, count in sorted(raw_per_file.items(), key=lambda item: -item[1]):
            print(f'  {count:4}  {rel}')
    print(f'\n{len(flags)} flagged' if flags else '\nNo flags.')
    return 1 if flags else 0


if __name__ == '__main__':
    sys.exit(main())
