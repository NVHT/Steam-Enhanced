"""The web pages' class map: every hashed class the theme names on the Store, Community and
Checkout, where Steam defines it, and what its rules look like, so a Steam web deploy that
rehashes them can be followed (the web counterpart of classmap.py for the client).

Usage:
  python3 storeclasses.py build   <STEAMTRACKING> <THEME_DIR>
      Index every web hash the theme uses (web/store/, web/community/, web/checkout/, web/shared/: CSS and the
      page scripts' maps) against a SteamTracking checkout; writes dev/storeclassmap.json.
  python3 storeclasses.py check   <STEAMTRACKING> <THEME_DIR>
      List the theme's hashes a newer SteamTracking no longer has, by Steam file.
  python3 storeclasses.py rehash  <NEW_STEAMTRACKING> <THEME_DIR>
      Match each vanished hash to the new class whose rules are most alike (same Steam file
      when its name is stable) and rewrite it in the theme and the map. Ambiguous ones are
      reported, not guessed.

STEAMTRACKING is a checkout of SteamDatabase/SteamTracking (its store.steampowered.com,
steamcommunity.com and c/ folders are what is read).
"""
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, 'storeclassmap.json')
# Steam's web CSS modules: 11 characters and a trailing '-' (rarely a leading one)
TOKEN = r'-?[_A-Za-z0-9][\w-]{9,11}-(?![\w-])'
HASH = re.compile(r'(?<![\w-])' + TOKEN)
# In the theme: a class in a selector (.x) or a string in a page script's map ('.x', `.x`)
THEME_HASH = re.compile(r'(?<=[.\'"`])' + TOKEN)
WEB_ROOTS = ('store.steampowered.com', 'steamcommunity.com', 'c')
THEME_ROOTS = ('web/store', 'web/community', 'web/checkout', 'web/shared')
# Build-hashed chunk names (c/store.steampowered.com/ssr/BOEXziHF.css) change every deploy
HASHED_FILE = re.compile(r'^[\w-]{8}\.css$')
COMMENT = re.compile(r'/\*.*?\*/', re.S)
RULE = re.compile(r'([^{}@]+)\{([^{}]*)\}')
DECL = re.compile(r'([a-z-]+)\s*:\s*([^;]+?)\s*(?:;|$)')
MATCH = 0.75  # a rule set at least this alike...
MARGIN = 0.1  # ...and this much more alike than the next candidate


def is_hash(value):
    return bool(re.search(r'[A-Z]', value) and re.search(r'[a-z0-9]', value) and value.endswith('-'))


def theme_files(theme):
    for root in THEME_ROOTS:
        for path in sorted(Path(theme, root).rglob('*')):
            if path.suffix in ('.css', '.js') and 'vendor' not in path.parts:
                yield path


def theme_hashes(theme):
    uses = defaultdict(set)
    for path in theme_files(theme):
        text = path.read_text(encoding='utf-8')
        if path.suffix == '.css':
            text = COMMENT.sub('', text)
        for match in THEME_HASH.finditer(text):
            value = match.group(0)
            if is_hash(value):
                uses[value].add(str(path.relative_to(theme)).replace(os.sep, '/'))
    return uses


def index(steamtracking):
    """hash -> {file, decls} for every web CSS module class in a SteamTracking checkout."""
    found = {}
    for root in WEB_ROOTS:
        for path in sorted(Path(steamtracking, root).rglob('*.css')):
            rel = str(path.relative_to(steamtracking)).replace(os.sep, '/')
            text = COMMENT.sub('', path.read_text(encoding='utf-8', errors='ignore'))
            decls = defaultdict(set)
            for selector, body in RULE.findall(text):
                names = {m.group(0) for m in HASH.finditer(selector) if is_hash(m.group(0))}
                if not names:
                    continue
                body_decls = {f'{p}:{v.strip()}' for p, v in DECL.findall(body)}
                for name in names:
                    decls[name] |= body_decls
            for name, values in decls.items():
                found.setdefault(name, {'file': rel, 'decls': sorted(values)})
    return found


def save(state):
    with open(STATE, 'w', encoding='utf-8') as f:
        entries = ',\n'.join(f'{json.dumps(h)}: {json.dumps(v)}' for h, v in sorted(state.items()))
        f.write('{\n' + entries + '\n}\n')


def load():
    with open(STATE, encoding='utf-8') as f:
        return json.load(f)


def build(steamtracking, theme):
    tracked = index(steamtracking)
    state = {}
    for name, files in sorted(theme_hashes(theme).items()):
        info = tracked.get(name)
        state[name] = {
            'file': info['file'] if info else None,
            'decls': info['decls'] if info else [],
            'uses': sorted(files),
        }
    save(state)
    untracked = [h for h, v in state.items() if not v['file']]
    print(f'{len(state)} web classes indexed, {len(untracked)} not in SteamTracking')
    for name in untracked:
        print(f'  untracked {name} ({", ".join(state[name]["uses"])})')


def check(steamtracking, theme):
    tracked = index(steamtracking)
    state = load()
    gone = defaultdict(list)
    for name, info in state.items():
        if info['file'] and name not in tracked:
            gone[info['file']].append(name)
    for file, names in sorted(gone.items()):
        print(f'{file}: {", ".join(sorted(names))}')
    print(f'{sum(len(v) for v in gone.values())} of {len(state)} classes gone')
    return gone


def similarity(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


def rehash(steamtracking, theme):
    tracked = index(steamtracking)
    state = load()
    used = set(state)
    renames = {}
    for name, info in sorted(state.items()):
        if not info['file'] or name in tracked:
            continue
        same_file = not HASHED_FILE.match(os.path.basename(info['file']))
        pool = [
            (similarity(info['decls'], new['decls']), candidate)
            for candidate, new in tracked.items()
            if candidate not in used and (not same_file or new['file'] == info['file'])
        ]
        pool.sort(reverse=True)
        best = pool[0] if pool else (0, None)
        runner = pool[1][0] if len(pool) > 1 else 0
        if best[0] >= MATCH and best[0] - runner >= MARGIN:
            renames[name] = best[1]
            used.add(best[1])
        else:
            print(f'  unmatched {name} ({info["file"]}): best {best[0]:.2f}, next {runner:.2f}')

    for path in theme_files(theme):
        text = path.read_text(encoding='utf-8')
        new = text
        for old, value in renames.items():
            new = re.sub(r'(?<![\w-])' + re.escape(old) + r'(?![\w-])', value, new)
        if new != text:
            path.write_text(new, encoding='utf-8')

    for old, value in renames.items():
        info = state.pop(old)
        state[value] = {**info, 'file': tracked[value]['file'], 'decls': tracked[value]['decls']}
    save(state)
    print(f'{len(renames)} classes rehashed')


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in ('build', 'check', 'rehash'):
        print(__doc__)
        sys.exit(2)
    {'build': build, 'check': check, 'rehash': rehash}[sys.argv[1]](sys.argv[2], sys.argv[3])
