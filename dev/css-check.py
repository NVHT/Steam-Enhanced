"""Token and override check for the theme's CSS (sizes, radii, motion; colours: dev/colors.py).

    python dev/css-check.py            flags only; exit code 1 if anything is flagged
    python dev/css-check.py --report   also lists !important and :not(#se-none) counts per file

Flags a raw value equal to a token, so it doesn't creep back:
  - font-size equal to a --se-fs-* step, border-radius equal to a --se-radius-* step
  - a transition duration equal to a --se-dur-* step, cubic-bezier equal to --se-ease
  - a var(--se-x, fallback) on a token core/tokens.css defines: tokens load everywhere, so the
    fallback is dead

The report is the !important budget: how many each file spends. Most beat Steam's own rules
and inline styles; the ones that only beat the theme's own rules are the ones to remove.
Skips core/tokens.css, core/font.css and core/images.css (self-contained), store/replay (its
own palette), vendor files and comments.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'core/tokens.css', 'core/font.css', 'core/images.css', 'store/replay/page.css'}
COMMENT = re.compile(r'/\*.*?\*/', re.S)
DECL = re.compile(r'(?<![\w-])((?!--)[a-z-]+)\s*:\s*([^;{}]+?)(\s*!important)?(?=\s*[;}])')
TIME = re.compile(r'(?<![\w.-])\d*\.?\d+m?s(?![\w-])')


def tokens():
    text = open(os.path.join(ROOT, 'core', 'tokens.css'), encoding='utf-8').read()
    return {name: value.strip() for name, value in re.findall(r'^\s*(--se-[\w-]+)\s*:\s*([^;]+);', text, re.M)}


def unique(defs, prefix):
    seen = {}
    for name, value in defs.items():
        if name.startswith(prefix):
            seen.setdefault(value, []).append(name)
    return {value: names[0] for value, names in seen.items() if len(names) == 1}


def css_files():
    for base, _, names in os.walk(ROOT):
        if '.git' in base or 'vendor' in base:
            continue
        for name in names:
            if name.endswith('.css'):
                path = os.path.join(base, name)
                rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
                if rel not in SKIP:
                    yield rel, path


def main():
    report = '--report' in sys.argv
    defs = tokens()
    sizes = unique(defs, '--se-fs-')
    radii = unique(defs, '--se-radius-')
    durations = unique(defs, '--se-dur')
    ease = defs.get('--se-ease', '').replace(' ', '')
    flagged = 0
    budget = []
    for rel, path in sorted(css_files()):
        raw = open(path, encoding='utf-8').read()
        text = COMMENT.sub(lambda m: '\n' * m.group(0).count('\n'), raw)
        budget.append((text.count('!important'), text.count('#se-none'), rel))
        for match in DECL.finditer(text):
            prop, value = match.group(1), match.group(2).strip()
            line = text.count('\n', 0, match.start()) + 1
            hint = None
            if prop == 'font-size' and value in sizes:
                hint = f'var({sizes[value]})'
            elif prop == 'border-radius' and value in radii:
                hint = f'var({radii[value]})'
            elif ease and any(c.replace(' ', '') == ease for c in re.findall(r'cubic-bezier\([^)]*\)', value)):
                hint = 'var(--se-ease)'
            elif prop in ('transition', 'transition-duration'):
                for item in re.sub(r'var\([^()]*\)', '', value).split(','):
                    first = TIME.search(item)
                    if first and first.group(0).lstrip('0') in durations:
                        hint = f'var({durations[first.group(0).lstrip("0")]})'
                        break
            for name in re.findall(r'var\((--se-[\w-]+),', value):
                if name in defs:
                    hint = f'var({name}) (dead fallback)'
            if hint:
                flagged += 1
                print(f'{rel}:{line}: {prop}: {value} -> {hint}')
    if report:
        print('\n!important  #se-none  file')
        for important, none, rel in sorted(budget, reverse=True):
            print(f'{important:10}  {none:8}  {rel}')
        print(f'{sum(b[0] for b in budget):10}  {sum(b[1] for b in budget):8}  total')
    print(f'\n{flagged} flagged' if flagged else 'No flags.')
    return 1 if flagged else 0


if __name__ == '__main__':
    sys.exit(main())
