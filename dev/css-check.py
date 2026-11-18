"""Token and override check for the theme's CSS (sizes, radii, motion; colours: dev/colors.py).

    python dev/css-check.py            flags only; exit code 1 if anything is flagged
    python dev/css-check.py --report   also lists !important and :not(#se-none) counts per file

Flags a raw value equal to a token, so it doesn't creep back:
  - a font-size, or a font shorthand's size, in px up to 30: every text size is a --se-fs-*
    step (larger display sizes are free); border-radius equal to a --se-radius-* step
  - a transition duration equal to a --se-dur-* step, cubic-bezier equal to --se-ease
  - a var(--se-x, fallback) on a token core/tokens.css defines: tokens load everywhere, so the
    fallback is dead

Everywhere else (client, compat, core), margin, padding or gap in px from 2 to 48 that isn't a
--se-space-* token (bigger values clear an avatar, icon or column and stay px; px inside calc(),
clamp() and the like is arithmetic and stays too).

On the web pages (everything under web/), which share one component set
(core/tokens.css "Web components"), it also flags what made them drift apart:
  - margin, padding or gap in px off the 4px scale, or on it but not a --se-space-* token
  - a pill corner (--se-radius-pill): every web corner is rounded (--se-radius-control)
  - a font shorthand a --se-type-* style already is
  - a raw z-index the stacking layers name (1, 2, 3, -1)
  - the hairline edge or an elevation written out (--se-edge, --se-elevation-*)
  - a focus ring other than --se-focus-outline

The report is the !important budget: how many each file spends. Most beat Steam's own rules
and inline styles; the ones that only beat the theme's own rules are the ones to remove.
Skips core/tokens.css, core/font.css and core/images.css (self-contained), web/store/replay (its
own palette), vendor files and comments.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'core/tokens.css', 'core/font.css', 'core/images.css', 'web/store/replay/page.css'}
COMMENT = re.compile(r'/\*.*?\*/', re.S)
DECL = re.compile(r'(?<![\w-])((?!--)[a-z-]+)\s*:\s*([^;{}]+?)(\s*!important)?(?=\s*[;}])')
FONT_SIZE = re.compile(r'(?<![\w.-])\d*\.?\d+px(?=\s)')  # a font shorthand's size (before any /)
TIME = re.compile(r'(?<![\w.-])\d*\.?\d+m?s(?![\w-])')


def tokens():
    text = open(os.path.join(ROOT, 'core', 'tokens.css'), encoding='utf-8').read()
    return {name: value.strip() for name, value in re.findall(r'^\s*(--se-[\w-]+)\s*:\s*([^;]+);', text, re.M)}


def unique(defs, prefix):
    seen = {}
    for name, value in defs.items():
        # Aliases (--se-radius-control: var(--se-radius-md)) name a role, not a value
        if name.startswith(prefix) and not value.startswith('var('):
            seen.setdefault(value, []).append(name)
    return {value: names[0] for value, names in seen.items() if len(names) == 1}


def text_step(prop, value, sizes):
    """The --se-fs-* step a raw px text size (30px or less) should be, or None."""
    size = FONT_SIZE.search(value.split('/')[0] + ' ') if prop == 'font' else re.fullmatch(r'\d*\.?\d+px', value)
    if not size or float(size.group(0)[:-2]) > 30:
        return None
    px = float(size.group(0)[:-2])
    steps = {float(v[:-2]): name for v, name in sizes.items() if re.fullmatch(r'\d*\.?\d+px', v)}
    nearest = min(steps, key=lambda s: (abs(s - px), -s))  # ties round up
    return f'var({steps[nearest]})' + ('' if nearest == px else f' (nearest step, {nearest:g}px)')


SPACE_STEPS = {2: 'half', 4: '1', 8: '2', 12: '3', 16: '4', 24: '5', 32: '6', 48: '7'}


def space_step(prop, value):
    """The --se-space-* token a top-level px spacing value (2 to 48) should be, or None."""
    if not SPACING.match(prop):
        return None
    depth = 0
    for i, ch in enumerate(value):
        depth += ch == '('
        depth -= ch == ')'
        if depth:
            continue
        m = re.match(r'(?<![\w.-])-?(\d*\.?\d+)px\b', value[i:]) if (i == 0 or not re.match(r'[\w.-]', value[i - 1])) else None
        if m and 1 < float(m.group(1)) <= 48:
            px = float(m.group(1))
            step = min(SPACE_STEPS, key=lambda s: (abs(s - px), s))  # ties round down
            return f'var(--se-space-{SPACE_STEPS[step]})' + ('' if step == px else f' (nearest step, {step}px)')
    return None


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


WEB = ('web/',)
SPACING = re.compile(r'^(margin|padding)(-[a-z-]+)?$|^(row-|column-)?gap$')
PX = re.compile(r'(?<![\w.-])(\d+)px\b')
Z_LAYERS = {'1': '--se-z-raised', '2': '--se-z-raised-2', '3': '--se-z-raised-3', '-1': '--se-z-under'}
EDGE = 'inset 0 0 0 1px var(--se-hairline)'


def web_hint(prop, value, types, selector_focus):
    """What a web page should use instead of `value`, or None."""
    if SPACING.match(prop):
        for n in PX.findall(value):
            if int(n) > 1:
                return f'{n}px: a --se-space-* step (4px scale)'
    if 'var(--se-radius-pill)' in value:
        return 'var(--se-radius-control) (web corners are rounded)'
    if prop == 'font' and value in types:
        return f'var({types[value]})'
    if prop == 'z-index' and value in Z_LAYERS:
        return f'var({Z_LAYERS[value]})'
    if prop == 'box-shadow' and value.startswith(EDGE):
        return 'var(--se-edge) / var(--se-elevation-*)'
    if selector_focus and prop == 'outline' and value not in ('0', 'none') and 'focus-outline' not in value:
        return 'var(--se-focus-outline)'
    return None


def main():
    report = '--report' in sys.argv
    defs = tokens()
    sizes = unique(defs, '--se-fs-')
    radii = unique(defs, '--se-radius-')
    durations = unique(defs, '--se-dur')
    ease = defs.get('--se-ease', '').replace(' ', '')
    types = {value: name for name, value in defs.items() if name.startswith('--se-type-')}
    flagged = 0
    budget = []
    for rel, path in sorted(css_files()):
        raw = open(path, encoding='utf-8').read()
        text = COMMENT.sub(lambda m: '\n' * m.group(0).count('\n'), raw)
        budget.append((text.count('!important'), text.count('#se-none'), rel))
        web = rel.startswith(WEB)
        for match in DECL.finditer(text):
            prop, value = match.group(1), match.group(2).strip()
            line = text.count('\n', 0, match.start()) + 1
            hint = None
            if web:
                selector = text[text.rfind('}', 0, match.start()) + 1:text.rfind('{', 0, match.start())]
                hint = web_hint(prop, value, types, ':focus' in selector)
            else:
                hint = space_step(prop, value)
            if hint:
                pass
            elif prop in ('font-size', 'font') and (step := text_step(prop, value, sizes)):
                hint = step
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
