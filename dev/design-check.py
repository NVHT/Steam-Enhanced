"""Design check: the design system's rules (CLAUDE.md section 6) across the whole theme.

    python dev/design-check.py     flags and notes; exit code 1 if anything is flagged

Flags (each one breaks a rule):
  - contrast: a rule setting both a text colour and a solid background below WCAG AA
    (4.5:1, 3:1 from 24 px; disabled controls are exempt)
  - focus: a :focus / :focus-visible rule taking the outline away with no other focus style
    for that control anywhere in the theme (background, shadow, border, colour, opacity,
    transform, filter, a custom property; on it or a part of it)
  - motion: a transition or keyframes moving a layout property (width, height, top, margin...)
    with no comment in or right before the rule saying why
  - font: a typeface named in a feature file, fallbacks too (only --se-font and
    --se-font-mono; core/font.css and the font options name faces)
  - icon colour: an inline SVG in a script with a baked fill or stroke (icons are
    currentColor)
  - blur: a raw blur() in backdrop-filter (always a --se-blur-* token: settings flip them)

Notes (look, then decide):
  - contrast: text tokens under AA on a surface token (fine if that pair never meets)
  - hit target: a theme button or link sized under 32 px (one whose ::before or ::after reaches
    past it with a negative inset counts as grown and is not listed)
  - duplicates: the same @keyframes in more than one place, a spinning keyframes outside
    core/spinner.css and core/motion.css
  - blur: a raw blur() in filter (art blur; glass goes through --se-blur-*)

Reads core/tokens.css for token values. Skips .git, .claude, dev/, vendor files and
core/tokens.css itself.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', '.claude', 'dev', '__pycache__', 'vendor'}
FACE_FILES = {'core/font.css', 'core/tokens.css'}

LAYOUT = re.compile(
    r'^(?:(?:min-|max-)?(?:width|height)|top|right|bottom|left|inset(?:-[a-z-]+)?|margin(?:-[a-z-]+)?'
    r'|padding(?:-[a-z-]+)?|flex(?:-basis)?|grid-template-(?:columns|rows)|gap|row-gap|column-gap'
    r'|font-size|line-height|border(?:-[a-z]+)?-width)$')
# What can show focus besides the outline (a custom property re-points one of these)
VISIBLE_FOCUS = re.compile(r'^(?:background(?:-color)?|box-shadow|border(?:-[a-z-]+)?|color|text-decoration(?:-[a-z-]+)?'
                           r'|outline(?:-[a-z]+)?|opacity|transform|scale|filter|--[\w-]+)$')
DISABLED = re.compile(r':disabled|\[disabled\]|aria-disabled|\.(?:btn_)?[Dd]isabled\b')
GENERIC_FACES ={'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy'}
TEXT_TOKENS = ['text', 'text-strong', 'text-dim', 'text-muted', 'text-faint', 'label-color', 'offline', 'danger',
               'danger-text', 'gold-text', 'accent', 'link']
SURFACE_TOKENS = ['bg', 'sidebar', 'surface', 'surface-2', 'hover', 'selected', 'field']


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def walk(ext):
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            if name.endswith(ext):
                yield rel(os.path.join(base, name))


def blank_comments(text):
    """Comments as spaces (newlines kept), so positions still match the raw text."""
    return re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), text, flags=re.S)


def rules(raw):
    """(selector, declarations [(prop, value)], start, end, line) for every innermost rule."""
    text = blank_comments(raw)
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', text):
        selector = ' '.join(m.group(1).split())
        decls = [(p.strip().lower(), v.strip()) for p, v in re.findall(r'(?<![\w-])([a-z-]+)\s*:\s*([^;]+)', m.group(2))]
        yield selector, decls, m.start(1), m.end(), text.count('\n', 0, m.start(1) + len(m.group(1)) - len(m.group(1).lstrip())) + 1


def block(text, brace):
    """The text inside the brace at `brace` and its match."""
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if not depth:
                return text[brace + 1:i]
    return ''


def selectors(selector):
    """A selector list split on its top-level commas (not those inside :is() or :not())."""
    parts, depth, part = [], 0, ''
    for ch in selector:
        depth += ch == '('
        depth -= ch == ')'
        if ch == ',' and not depth:
            parts.append(part.strip())
            part = ''
        else:
            part += ch
    parts.append(part.strip())
    return [p for p in parts if p]


def commented(raw, start, end):
    """A comment inside the rule, or ending right before it (only blank space between)."""
    if '/*' in raw[start:end]:
        return True
    before = raw[:start].rstrip()
    return before.endswith('*/')


# ---------- Colours ----------

def token_values():
    text = blank_comments(read(os.path.join(ROOT, 'core', 'tokens.css')))
    values = {}
    for name, value in re.findall(r'(--se-[\w-]+)\s*:\s*([^;]+);', text):
        values.setdefault(name, value.strip())
    return values


def parse_color(value, tokens, depth=0):
    """An opaque colour as (r, g, b), or None (translucent, a gradient, unknown)."""
    value = value.replace('!important', '').strip()
    if depth > 10:
        return None
    m = re.fullmatch(r'var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)', value)
    if m:
        if m.group(1) in tokens:
            return parse_color(tokens[m.group(1)], tokens, depth + 1)
        return parse_color(m.group(2), tokens, depth + 1) if m.group(2) else None
    m = re.fullmatch(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})', value)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)', value)
    if m:
        if m.group(4) is not None and float(m.group(4)) < 1:
            return None
        return tuple(int(m.group(i)) for i in (1, 2, 3))
    m = re.fullmatch(r'color-mix\(\s*in srgb\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)', value)
    if m:
        a = parse_color(m.group(1), tokens, depth + 1)
        b = parse_color(m.group(3), tokens, depth + 1)
        if not a or not b:
            return None
        pa = float(m.group(2)) / 100 if m.group(2) else (1 - float(m.group(4)) / 100 if m.group(4) else .5)
        return tuple(round(x * pa + y * (1 - pa)) for x, y in zip(a, b))
    if value.lower() in ('#fff', 'white'):
        return (255, 255, 255)
    return None


def contrast(a, b):
    def lum(c):
        ch = [x / 255 for x in c]
        ch = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in ch]
        return .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2]
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + .05) / (lb + .05)


def px(value, tokens, depth=0):
    """A length in px (plain or through tokens), or None."""
    value = value.replace('!important', '').strip()
    m = re.fullmatch(r'var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)', value)
    if m and depth < 10:
        if m.group(1) in tokens:
            return px(tokens[m.group(1)], tokens, depth + 1)
        return px(m.group(2), tokens, depth + 1) if m.group(2) else None
    m = re.fullmatch(r'([\d.]+)px', value)
    return float(m.group(1)) if m else None


def contrast_checks(sheets, tokens):
    flags, notes = [], []
    for f, raw in sheets.items():
        for selector, decls, start, end, line in rules(raw):
            d = dict(decls)
            fg = parse_color(d['color'], tokens) if 'color' in d else None
            bgv = d.get('background-color') or d.get('background')
            bg = parse_color(bgv, tokens) if bgv else None
            # WCAG exempts disabled controls
            if not fg or not bg or DISABLED.search(selector):
                continue
            size = px(d.get('font-size', ''), tokens) or 0
            need = 3.0 if size >= 24 else 4.5
            ratio = contrast(fg, bg)
            if ratio < need:
                flags.append(f'contrast: {f}:{line}: {selector}: {d["color"]} on {bgv} is {ratio:.2f}:1 (AA {need}:1)')
    for t in TEXT_TOKENS:
        fg = parse_color(f'var(--se-{t})', tokens)
        if not fg:
            continue
        low = []
        for s in SURFACE_TOKENS:
            bg = parse_color(f'var(--se-{s})', tokens)
            if bg and contrast(fg, bg) < 4.5:
                low.append(f'{s} {contrast(fg, bg):.2f}')
        if low:
            notes.append(f'contrast: --se-{t} under AA on ' + ', '.join(low))
    return flags, notes


# ---------- Focus ----------

def last_class(selector):
    """The last class before a :focus pseudo-class in one selector."""
    head = re.split(r':focus', selector)[0]
    classes = re.findall(r'\.([\w-]+)', head)
    return classes[-1] if classes else None


def focus_checks(sheets):
    shown = set()  # classes with a visible focus style somewhere
    removed = []
    for f, raw in sheets.items():
        for selector, decls, start, end, line in rules(raw):
            if ':focus' not in selector:
                continue
            visible = any(VISIBLE_FOCUS.match(p) and not (p.startswith('outline') and re.match(r'(?:none|0)\b', v))
                          for p, v in decls)
            takes_away = any(p in ('outline', 'outline-style', 'outline-width') and re.match(r'(?:none|0)\b', v)
                             for p, v in decls)
            for one in selectors(selector):
                if ':focus' not in one:
                    continue
                cls = last_class(one)
                if visible and cls:
                    shown.add(cls)
                if takes_away and not visible:
                    removed.append((f, line, one.strip(), cls))
    return [f'focus: {f}:{line}: {sel} takes the outline away with no other focus style'
            for f, line, sel, cls in removed if not cls or cls not in shown]


# ---------- Motion ----------

def motion_checks(sheets):
    flags = []
    for f, raw in sheets.items():
        text = blank_comments(raw)
        # Keyframes moving layout
        for m in re.finditer(r'@keyframes\s+([\w-]+)\s*\{', text):
            body = block(text, m.end() - 1)
            props = {p.lower() for p in re.findall(r'(?<![\w-])([a-z-]+)\s*:', body)}
            moving = sorted(p for p in props if LAYOUT.match(p))
            if moving and not commented(raw, m.start(), m.end() + len(body)):
                line = text.count('\n', 0, m.start()) + 1
                flags.append(f'motion: {f}:{line}: @keyframes {m.group(1)} moves {", ".join(moving)} with no comment why')
        for selector, decls, start, end, line in rules(raw):
            for p, v in decls:
                if p == 'transition-property':
                    names = [x.strip() for x in v.split(',')]
                elif p == 'transition':
                    names = [x.strip().split()[0] for x in re.sub(r'\([^()]*\)', '', v).split(',') if x.strip()]
                else:
                    continue
                moving = [n for n in names if LAYOUT.match(n)]
                if moving and not commented(raw, start, end):
                    flags.append(f'motion: {f}:{line}: {selector}: transition on {", ".join(moving)} with no comment why')
    return flags


# ---------- Type, icons, blur ----------

def font_checks(sheets):
    flags = []
    for f, raw in sheets.items():
        if f in FACE_FILES or re.match(r'options/appearance/font-', f):
            continue
        for selector, decls, start, end, line in rules(raw):
            # A @font-face defines a face (a plugin window that loads the theme's own)
            if selector.startswith('@font-face'):
                continue
            for p, v in decls:
                v = v.replace('!important', '')
                if p == 'font-family':
                    faces = [x.strip() for x in re.sub(r'var\([^()]*\)', '', v).split(',') if x.strip()]
                    named = [x for x in faces if x.strip('\'"').lower() not in GENERIC_FACES]
                elif p == 'font':
                    named = re.findall(r'[\'"][^\'"]+[\'"]', v)
                else:
                    continue
                if named:
                    flags.append(f'font: {f}:{line}: {selector}: names {", ".join(named)} '
                                 '(var(--se-font), or var(--se-font-mono) for code and paths)')
    return flags


def icon_checks(scripts):
    flags = []
    for f, text in scripts.items():
        for svg in re.finditer(r'<svg\b.*?</svg>', text, re.S):
            for m in re.finditer(r'\b(fill|stroke)=(?:\\?["\'])(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))', svg.group(0)):
                line = text.count('\n', 0, svg.start() + m.start()) + 1
                flags.append(f'icon colour: {f}:{line}: {m.group(1)}="{m.group(2)}" (icons are currentColor)')
    return flags


def blur_checks(sheets):
    flags, notes = [], []
    for f, raw in sheets.items():
        for selector, decls, start, end, line in rules(raw):
            for p, v in decls:
                if 'blur(' not in v:
                    continue
                if p in ('backdrop-filter', '-webkit-backdrop-filter'):
                    flags.append(f'blur: {f}:{line}: {selector}: {p}: {v} (a --se-blur-* token)')
                elif p == 'filter':
                    notes.append(f'blur: {f}:{line}: {selector}: filter: {v}')
    return flags, notes


# ---------- Hit targets and duplicates ----------

def interactive_classes(scripts):
    found = set()
    for text in scripts.values():
        for m in re.finditer(r'<(?:button|a)\b[^>]*?\bclass=\\?["\']([^"\'$]+)', text):
            found.update(c for c in m.group(1).split() if c.startswith('se-'))
        for m in re.finditer(r'role=\\?["\']button[^>]*?\bclass=\\?["\']([^"\'$]+)|\bclass=\\?["\']([^"\'$]+)["\'][^>]*?role=\\?["\']button', text):
            found.update(c for c in (m.group(1) or m.group(2)).split() if c.startswith('se-'))
        for m in re.finditer(r'createElement\(\s*["\'](?:button|a)["\']\s*\)[\s\S]{0,200}?\.className\s*=\s*["\']([^"\'$]+)', text):
            found.update(c for c in m.group(1).split() if c.startswith('se-'))
    return found


def hit_notes(sheets, scripts, tokens):
    classes = interactive_classes(scripts)
    sizes = {}  # class -> [(height, file, line)]
    grown = set()  # classes whose ::before / ::after reaches past them (a negative inset)
    for f, raw in sheets.items():
        for selector, decls, start, end, line in rules(raw):
            for one in selectors(selector):
                last = re.split(r'\s+|>|\+|~', one.strip())[-1]
                if '::' in last:
                    # A minus left once custom property names are gone: -5px, calc(-1 * ...), 100% - ...
                    if any(p == 'inset' and '-' in re.sub(r'--[\w-]+', '', v) for p, v in decls):
                        grown.update(re.findall(r'\.([\w-]+)', last.split('::')[0]))
                    continue
                for cls in re.findall(r'\.([\w-]+)', last):
                    if cls not in classes:
                        continue
                    for p, v in decls:
                        if p in ('height', 'min-height', 'block-size', 'min-block-size'):
                            size = px(v, tokens)
                            if size is not None:
                                sizes.setdefault(cls, []).append((size, f, line))
    notes = []
    for cls, found in sorted(sizes.items()):
        if cls not in grown and max(s for s, _, _ in found) < 32:
            size, f, line = min(found)
            notes.append(f'hit target: .{cls} ({f}:{line}) is {size:g} px tall (32 px minimum)')
    return notes


def duplicate_notes(sheets):
    bodies = {}
    notes = []
    for f, raw in sheets.items():
        # Settings files are alternatives to the default (only one loads): not duplicates
        if f.startswith('options/'):
            continue
        text = blank_comments(raw)
        for m in re.finditer(r'@keyframes\s+([\w-]+)\s*\{', text):
            body = ' '.join(block(text, m.end() - 1).split())
            if not body:
                continue
            bodies.setdefault(body, []).append(f'{m.group(1)} ({f})')
            if re.search(r'rotate\(\s*(?:360deg|1turn)\s*\)', body) and f not in ('core/spinner.css', 'core/motion.css'):
                notes.append(f'duplicate: @keyframes {m.group(1)} ({f}) spins (core/spinner.css, or se-turn in core/motion.css)')
    for body, where in bodies.items():
        if len(where) > 1:
            notes.append('duplicate: the same @keyframes as ' + ', '.join(where))
    return notes


def main():
    tokens = token_values()
    sheets = {f: read(os.path.join(ROOT, f)) for f in sorted(walk('.css')) if f != 'core/tokens.css'}
    scripts = {f: read(os.path.join(ROOT, f)) for f in sorted(walk('.js'))}
    c_flags, c_notes = contrast_checks(sheets, tokens)
    b_flags, b_notes = blur_checks(sheets)
    flags = c_flags + focus_checks(sheets) + motion_checks(sheets) + font_checks(sheets) + icon_checks(scripts) + b_flags
    notes = c_notes + hit_notes(sheets, scripts, tokens) + duplicate_notes(sheets) + b_notes
    for line in flags:
        print(line)
    if notes:
        print(('\n' if flags else '') + 'Notes (look, then decide):')
        for line in notes:
            print(f'  {line}')
    print(f'\n{len(flags)} flagged, {len(notes)} notes' if flags else f'\nNo flags, {len(notes)} notes.')
    return 1 if flags else 0


if __name__ == '__main__':
    sys.exit(main())
