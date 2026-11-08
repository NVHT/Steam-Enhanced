"""Maintain Steam CSS module hash mappings across client updates.

Usage:
  python3 classmap.py build   <STEAM_SRC> <THEME_DIR>
      Rebuild shared/core.js class map and tools/classmap.json from active hashes.
  python3 classmap.py convert <THEME_DIR>
      Replace raw hash string literals in feature JS files with SE.C.<Key> lookups.
  python3 classmap.py rehash  <NEW_STEAM_SRC> <THEME_DIR>
      Match recorded classes against new Steam bundles by module similarity and
      update hashes in shared/core.js, CSS files, and tools/classmap.json.
"""
import collections
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import steamclasses as sc

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, 'classmap.json')
HASH = re.compile(r'(?<![\w$-])-?[_a-zA-Z][\w-]{16,25}(?![\w-])')
GENERIC = {
    'Container', 'Active', 'Name', 'Header', 'Icon', 'Label', 'Text', 'Title',
    'Hidden', 'Visible', 'Loading', 'Wrapper', 'Content', 'Selected', 'Disabled',
    'Rule', 'Body', 'Row', 'Button', 'Image', 'Item', 'fadein',
}
CORE_START = '  /* @classmap:start */'
CORE_END = '  /* @classmap:end */'

REGEX_BEFORE = set('(,=:[!&|?{};+-*%<>~^') | {
    'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do',
}


def save(state):
    with open(STATE, 'w', encoding='utf-8') as f:
        mods_json = ',\n'.join(json.dumps(m) for m in state['modules'])
        classes_json = ',\n'.join(
            f'{json.dumps(h)}: {json.dumps(v)}' for h, v in sorted(state['classes'].items())
        )
        f.write(f'{{"modules": [\n{mods_json}\n],\n"classes": {{\n{classes_json}\n}}}}\n')


def js_files(theme):
    core_path = Path(theme) / 'shared' / 'core.js'
    return sorted(str(p) for p in Path(theme).rglob('*.js') if p != core_path)


def css_files(theme):
    return sorted(str(p) for p in Path(theme).rglob('*.css'))


def module_label(keys, name, taken=()):
    """Select a disambiguating prefix from sibling keys in the same CSS module."""
    candidates = [k for k in keys if k != name and k not in GENERIC and len(k) >= 5] or keys[:1]
    for key in candidates:
        if f'{key}_{name}' not in taken:
            return key
    return candidates[0]


def write_core_map(theme, keymap):
    path = Path(theme) / 'shared' / 'core.js'
    src = path.read_text(encoding='utf-8')
    entries = [
        f"    {k}: '{h}',"
        for k, h in sorted(keymap.items(), key=lambda kv: kv[0].lower())
    ]
    block = '\n'.join([CORE_START, '  const C = {', *entries, '  };', CORE_END])
    start = src.index(CORE_START)
    end = src.index(CORE_END) + len(CORE_END)
    path.write_text(src[:start] + block + src[end:], encoding='utf-8')


def build(src, theme):
    mods, by = sc.index(src)
    used, css_used = set(), set()

    for f in js_files(theme) + [os.path.join(theme, 'shared', 'core.js')]:
        if not os.path.exists(f):
            continue
        for h in HASH.findall(Path(f).read_text(encoding='utf-8')):
            if sc.is_hash(h) and h in by:
                used.add(h)

    if os.path.exists(STATE):
        saved = json.loads(Path(STATE).read_text(encoding='utf-8')).get('classes', {})
        for h, info in saved.items():
            if h in by and info.get('core', True):
                used.add(h)

    for f in css_files(theme):
        for h in HASH.findall(Path(f).read_text(encoding='utf-8')):
            if sc.is_hash(h) and h in by and h not in used:
                css_used.add(h)

    core_path = os.path.join(theme, 'shared', 'core.js')
    prior = {}
    if os.path.exists(core_path):
        prior = {
            h: k
            for k, h in re.findall(
                r"^\s+([\w$]+): '([^']+)',",
                Path(core_path).read_text(encoding='utf-8'),
                re.M,
            )
        }

    names = collections.defaultdict(set)
    for h in used:
        names[by[h][1]].add(h)

    key_of = {h: prior[h] for h in used if h in prior}
    taken = set(key_of.values())

    for name, hashes in names.items():
        for h in sorted(hashes):
            if h in key_of:
                continue
            mod_keys = sorted(mods[by[h][0]].keys())
            key = (
                name
                if len(hashes) == 1 and name not in taken
                else f'{module_label(mod_keys, name, taken)}_{name}'
            )
            base, suffix = key, 2
            while key in taken:
                key = f'{base}{suffix}'
                suffix += 1
            key_of[h] = key
            taken.add(key)

    modules, mod_id = [], {}

    def get_mod_id(h):
        idx = by[h][0]
        if idx not in mod_id:
            mod_id[idx] = len(modules)
            modules.append(sorted(mods[idx].keys()))
        return mod_id[idx]

    state = {'modules': modules, 'classes': {}}
    for h in sorted(used):
        state['classes'][h] = {'key': key_of[h], 'name': by[h][1], 'module': get_mod_id(h), 'core': True}
    for h in sorted(css_used):
        state['classes'][h] = {'key': None, 'name': by[h][1], 'module': get_mod_id(h), 'core': False}

    save(state)
    write_core_map(theme, {v['key']: h for h, v in state['classes'].items() if v['core']})
    print(f'{len(used)} core classes mapped, {len(css_used)} stylesheet-only classes indexed')
    return key_of


def skip_regex(src, pos):
    """Advance past a regex literal starting at src[pos] and return the next index."""
    idx, in_class = pos + 1, False
    while True:
        if src[idx] == '\\':
            idx += 2
            continue
        if src[idx] == '[':
            in_class = True
        elif src[idx] == ']':
            in_class = False
        elif src[idx] == '/' and not in_class:
            break
        idx += 1
    idx += 1
    while idx < len(src) and src[idx].isalpha():
        idx += 1
    return idx


def template_end(src, start):
    """Return the index of the closing backtick for the template literal at src[start]."""
    idx, depth, prev = start + 1, 0, '('
    while True:
        ch = src[idx]
        if not depth:
            if ch == '\\':
                idx += 2
                continue
            if src.startswith('${', idx):
                depth = 1
                prev = '('
                idx += 2
                continue
            if ch == '`':
                return idx
            idx += 1
            continue
        if ch in ' \t\r\n':
            idx += 1
            continue
        if ch in '\'"':
            idx += 1
            while src[idx] != ch:
                idx += 2 if src[idx] == '\\' else 1
            idx += 1
            prev = 'x'
            continue
        if ch == '`':
            idx = template_end(src, idx) + 1
            prev = 'x'
            continue
        if ch == '/' and prev in REGEX_BEFORE:
            idx = skip_regex(src, idx)
            prev = 'x'
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if not depth:
                idx += 1
                continue
        ident = re.match(r'[A-Za-z_$][\w$]*', src[idx:idx + 64])
        if ident:
            prev = ident.group(0)
            idx += len(prev)
            continue
        prev = ch
        idx += 1


def tokens(src):
    """Yield ('str' | 'tpl', start, end) spans for JS string and template literals."""
    idx, length, last = 0, len(src), '('
    while idx < length:
        ch = src[idx]
        if ch in ' \t\r\n':
            idx += 1
            continue
        if src.startswith('//', idx):
            nl = src.find('\n', idx)
            idx = length if nl < 0 else nl
            continue
        if src.startswith('/*', idx):
            idx = src.index('*/', idx) + 2
            continue
        if ch in '\'"':
            end = idx + 1
            while src[end] != ch:
                end += 2 if src[end] == '\\' else 1
            yield ('str', idx, end + 1)
            idx = end + 1
            last = 'x'
            continue
        if ch == '`':
            end = template_end(src, idx)
            yield ('tpl', idx, end + 1)
            idx = end + 1
            last = 'x'
            continue
        if ch == '/' and last in REGEX_BEFORE:
            idx = skip_regex(src, idx)
            last = 'x'
            continue
        ident = re.match(r'[A-Za-z_$][\w$]*', src[idx:])
        if ident:
            last = ident.group(0)
            idx += len(last)
            continue
        num = re.match(r'\d[\w.]*', src[idx:])
        if num:
            last = 'x'
            idx += len(num.group(0))
            continue
        last = ch
        idx += 1


def convert(theme):
    classes = json.loads(Path(STATE).read_text(encoding='utf-8'))['classes']
    keymap = {h: v['key'] for h, v in classes.items() if v.get('core', True)}
    total = 0

    for f in js_files(theme):
        src = Path(f).read_text(encoding='utf-8')
        out, last, count = [], 0, 0
        for kind, start, end in tokens(src):
            lit = src[start:end]
            if not any(h in keymap for h in HASH.findall(lit)):
                continue
            body, quote = lit[1:-1], lit[0]
            if kind == 'str' and body in keymap:
                replacement = f'C.{keymap[body]}'
            elif kind == 'str':
                if '`' in body or '${' in body:
                    continue
                body = body.replace("\\'", "'") if quote == "'" else body.replace('\\"', '"')
                replacement = '`' + HASH.sub(
                    lambda m: '${C.' + keymap[m.group(0)] + '}' if m.group(0) in keymap else m.group(0),
                    body,
                ) + '`'
            else:
                replacement = HASH.sub(
                    lambda m: '${C.' + keymap[m.group(0)] + '}' if m.group(0) in keymap else m.group(0),
                    lit,
                )
            out.append(src[last:start])
            out.append(replacement)
            last = end
            count += 1
        out.append(src[last:])
        if count:
            Path(f).write_text(''.join(out), encoding='utf-8')
            print(f'{os.path.basename(f)}: {count} literals')
            total += count
    print(f'{total} total literals converted')


def rehash(new_src, theme):
    full = json.loads(Path(STATE).read_text(encoding='utf-8'))
    state, old_mods = full['classes'], full['modules']
    mods, by = sc.index(new_src)

    by_name = collections.defaultdict(list)
    for idx, mod in enumerate(mods):
        for key in mod:
            by_name[key].append(idx)

    moves, lost = {}, []
    for old_hash, info in state.items():
        if old_hash in by and by[old_hash][1] == info['name']:
            continue
        expected_keys = set(old_mods[info['module']])
        best_idx, best_score = None, 0.0
        for idx in by_name.get(info['name'], []):
            candidate_keys = set(mods[idx])
            score = len(expected_keys & candidate_keys) / max(1, len(expected_keys | candidate_keys))
            if score > best_score:
                best_idx, best_score = idx, score
        if best_idx is None or best_score < 0.5:
            lost.append((info['key'], old_hash))
            continue
        moves[old_hash] = mods[best_idx][info['name']]

    targets = [os.path.join(theme, 'shared', 'core.js')] + sorted(css_files(theme)) + js_files(theme)
    for f in targets:
        src = Path(f).read_text(encoding='utf-8')
        updated = HASH.sub(lambda m: moves.get(m.group(0), m.group(0)), src)
        if updated != src:
            Path(f).write_text(updated, encoding='utf-8')
            print('updated', os.path.relpath(f, theme))

    missing_str = ', '.join(k or h for k, h in lost) or '-'
    print(f'{len(moves)} classes updated; {len(lost)} unresolved: {missing_str}')
    if moves:
        full['classes'] = {moves.get(h, h): v for h, v in state.items()}
        save(full)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'build':
        build(sys.argv[2], sys.argv[3])
    elif cmd == 'convert':
        convert(sys.argv[2])
    elif cmd == 'rehash':
        rehash(sys.argv[2], sys.argv[3])
