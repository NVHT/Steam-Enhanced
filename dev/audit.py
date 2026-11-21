"""Release audit: what the per-build checks don't catch, across the whole theme.

    python dev/audit.py            flags and notes; exit code 1 if anything is flagged

Flags (each one is a fix before the release):
  - orphans: a theme .js/.css no loader, script or skin.json names, so it never loads
  - missing: a file a loader lists (client/loader.js, a web loader, the site loader's common
    files, skin.json) that isn't there
  - unused tokens: a --se-* token in core/tokens.css nothing else reads; undefined tokens: a
    var(--se-*) with no fallback that nothing defines
  - dead exports: a key put on a split feature's window.__se*Parts that none of its files reads
  - console.log / console.debug / debugger left in theme code
  - scrollbar-width or scrollbar-color other than none/auto (it drops core/scrollbars.css for
    Chromium's native bar)
  - a vendor file without its license beside it, or without a row in the README's Licenses

Notes (look, then decide; names can be built at runtime, sizes can be fine):
  - theme classes (.se-*) a stylesheet styles that no script or other stylesheet names
  - files past the ~40 KB split size
  - skin.json's version not past the last release tag (a release needs the bump)

Skips .git, .claude, dev/ and __pycache__; comments are stripped before reading code.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEME_DIRS = ('client', 'core', 'web', 'compat', 'options')
SKIP_DIRS = {'.git', '.claude', 'dev', '__pycache__'}
SPLIT_SIZE = 40 * 1024

CSS_COMMENT = re.compile(r'/\*.*?\*/', re.S)
# Block and line comments; strings are kept (a // inside a URL string stays)
JS_COMMENT = re.compile(r'/\*.*?\*/|(?<![:\'"\\])//[^\n]*', re.S)
QUOTED_FILE = re.compile(r'[\'"`]([^\'"`\s$]+?\.(?:js|css))(?:[?#][^\'"`]*)?[\'"`]')


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def walk():
    """Every file of the theme, as root-relative paths."""
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            yield rel(os.path.join(base, name))


def norm(path):
    return os.path.normpath(path).replace(os.sep, '/')


# ---------- Loading: orphans and missing files ----------

def client_features(text):
    """client/loader.js FEATURES: (folder + file) for every listed file."""
    for folder, files in re.findall(r"\[\s*'\w+'\s*,\s*'([^']+/)'\s*,\s*\[([^\]]*)\]\s*\]", text):
        for name in re.findall(r"'([^']+)'", files):
            yield folder + name


def web_entries(path, text):
    """A web loader's (or the site loader's) css/js entries, resolved against its folder."""
    base = os.path.dirname(path)
    for name in re.findall(r"\b(?:css|js)\s*:\s*'([^']+)'", text):
        yield norm(os.path.join(base, name))


def skin_entries():
    """skin.json's patched scripts and option stylesheets."""
    found = []

    def visit(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ('src', 'TargetJs', 'TargetCss') and isinstance(value, str):
                    found.append(norm(value))
                else:
                    visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(json.loads(read(os.path.join(ROOT, 'skin.json'))))
    return found


def loading(files):
    code = [f for f in files if f.endswith('.js')]
    theme = {f for f in files if f.endswith(('.js', '.css')) and f.split('/')[0] in THEME_DIRS}
    listed = set()
    flags = []

    loader = 'client/loader.js'
    listed.update(client_features(read(os.path.join(ROOT, loader))))
    for f in files:
        if re.fullmatch(r'web/[^/]+/loader\.js|web/shared/site-loader\.js', f):
            listed.update(web_entries(f, read(os.path.join(ROOT, f))))
    listed.update(skin_entries())
    for f in sorted(listed):
        if not os.path.isfile(os.path.join(ROOT, f)):
            flags.append(f'missing: {f} is listed but not there')

    # Any other reference by name: relative to the file naming it, to the root, or as a path
    # ending (a URL built against another file, e.g. new URL('../web/...', loader))
    named = set(listed)
    endings = set()
    for f in code + ['skin.json']:
        text = read(os.path.join(ROOT, f))
        for name in QUOTED_FILE.findall(text):
            named.add(norm(os.path.join(os.path.dirname(f), name)))
            named.add(norm(name))
            tail = re.sub(r'^(\.\.?/)+', '', name)
            if '/' in tail:
                endings.add(tail)
    for f in sorted(theme - named):
        if not any(f == e or f.endswith('/' + e) for e in endings):
            flags.append(f'orphan: {f} is never loaded')
    return flags


# ---------- Tokens ----------

def unused_tokens(files):
    tokens_css = read(os.path.join(ROOT, 'core', 'tokens.css'))
    names = sorted(set(re.findall(r'^\s*(--se-[\w-]+)\s*:', tokens_css, re.M)))
    corpus = [re.sub(r'^\s*--se-[\w-]+\s*:', '', tokens_css, flags=re.M)]
    for f in files:
        if f != 'core/tokens.css' and f.endswith(('.css', '.js', '.json', '.html')):
            corpus.append(read(os.path.join(ROOT, f)))
    text = '\n'.join(corpus)
    flags = [f'unused token: {n} (core/tokens.css)' for n in names if not re.search(re.escape(n) + r'(?![\w-])', text)]
    # Read but defined nowhere (a token deleted while still in use): var() with no fallback
    # computes to nothing, so the declaration silently drops (a mask, a colour)
    defined, used = set(), {}
    for f in files:
        if f.endswith(('.css', '.js')):
            t = re.sub(r'/\*.*?\*/', '', read(os.path.join(ROOT, f)), flags=re.S)
            defined.update(re.findall(r'(--se-[\w-]+)\s*:', t))
            defined.update(re.findall(r'[\'"`](--se-[\w-]+)[\'"`]', t))  # set from a script
            for m in re.finditer(r'var\(\s*(--se-[\w-]*[\w])\s*\)', t):
                used.setdefault(m.group(1), f)
    flags += [f'undefined token: {n} ({f}) is read but defined nowhere' for n, f in sorted(used.items()) if n not in defined]
    return flags


# ---------- Split features' shared parts ----------

def balanced(text, start):
    """The text between the bracket at `start` and its match (strings skipped roughly)."""
    pairs = {'{': '}', '(': ')', '[': ']'}
    stack = []
    i = start
    quote = None
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == '\\':
                i += 1
            elif ch == quote:
                quote = None
        elif ch in '\'"`':
            quote = ch
        elif ch in pairs:
            stack.append(pairs[ch])
        elif stack and ch == stack[-1]:
            stack.pop()
            if not stack:
                return text[start + 1:i]
        i += 1
    return ''


def top_keys(body):
    """The keys of an object literal's body, top level only (shorthand, key: value, methods)."""
    keys = []
    depth = 0
    part = ''
    quote = None
    for ch in body + ',':
        if quote:
            part += ch
            if ch == quote:
                quote = None
            continue
        if ch in '\'"`':
            quote = ch
        if ch in '{([':
            depth += 1
        elif ch in '})]':
            depth -= 1
        if ch == ',' and depth == 0:
            m = re.match(r'\s*(?:async\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:[:(]|$)', part)
            if m and not part.strip().startswith('...'):
                keys.append(m.group(1))
            part = ''
        else:
            part += ch
    return keys


def dead_exports(files):
    flags = []
    sources = {f: JS_COMMENT.sub('', read(os.path.join(ROOT, f))) for f in files if f.endswith('.js')}
    spaces = sorted({s for text in sources.values() for s in re.findall(r'window\.(__se\w+Parts)\b', text)})
    for space in spaces:
        mine = {f: t for f, t in sources.items() if space in t}
        # Each file's own names for this namespace (`const ns = window.__seFooParts`): a file
        # can bind one namespace and only read another straight off window
        aliases = {f: set(re.findall(r'(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*window\.' + space + r'\b', t))
                   for f, t in mine.items()}
        # Read by a computed key (parts[key]): which keys are read can't be told, so skip it
        if any(re.search(r'\b' + re.escape(a) + r'\[', mine[f]) for f in mine for a in aliases[f]):
            continue
        exports = {}
        reads = set()
        for f, text in mine.items():
            # window.__seFooParts = { ... }: its first keys
            for m in re.finditer(r'window\.' + space + r'\s*=\s*\{', text):
                for k in top_keys(balanced(text, m.end() - 1)):
                    exports.setdefault(k, f)
            # Read straight off window: window.__seFooParts?.key
            reads.update(re.findall(r'window\.' + space + r'\??\.(\w+)', text))
            for a in aliases[f]:
                for m in re.finditer(r'Object\.assign\(\s*' + re.escape(a) + r'\s*,\s*\{', text):
                    for k in top_keys(balanced(text, m.end() - 1)):
                        exports.setdefault(k, f)
                for m in re.finditer(r'\b' + re.escape(a) + r'\.(\w+)\s*(?:\|\||\?\?|&&)?=(?!=)', text):
                    exports.setdefault(m.group(1), f)
                for m in re.finditer(r'\b' + re.escape(a) + r'\??\.(\w+)\b(?!\s*(?:\|\||\?\?|&&)?=(?!=))', text):
                    reads.add(m.group(1))
                for m in re.finditer(r'(?:const|let|var)\s*\{([^}]*)\}\s*=\s*' + re.escape(a) + r'\b', text):
                    reads.update(k.strip().split(':')[0].strip() for k in m.group(1).split(','))
        for k, f in sorted(exports.items()):
            if k not in reads:
                flags.append(f'dead export: {space}.{k} ({f}) is never read')
    return flags


# ---------- Leftovers and rules ----------

def leftovers(files):
    flags = []
    for f in files:
        if f.endswith('.js') and 'vendor/' not in f:
            text = JS_COMMENT.sub('', read(os.path.join(ROOT, f)))
            for m in re.finditer(r'\bconsole\.(?:log|debug)\s*\(|\bdebugger\b', text):
                line = text.count('\n', 0, m.start()) + 1
                flags.append(f'leftover: {f}:{line}: {m.group(0).rstrip("(").strip()}')
        elif f.endswith('.css'):
            text = CSS_COMMENT.sub(lambda m: '\n' * m.group(0).count('\n'), read(os.path.join(ROOT, f)))
            for m in re.finditer(r'(?<![\w-])(scrollbar-(?:width|color))\s*:\s*([^;}]+)', text):
                value = m.group(2).replace('!important', '').strip()
                if value not in ('none', 'auto'):
                    line = text.count('\n', 0, m.start()) + 1
                    flags.append(f'scrollbar: {f}:{line}: {m.group(1)}: {value} (drops core/scrollbars.css)')
    return flags


def vendor(files):
    flags = []
    readme = read(os.path.join(ROOT, 'README.md'))
    licenses = readme[readme.find('Licenses\n'):] if 'Licenses\n' in readme else readme
    for f in files:
        parts = f.split('/')
        if 'vendor' not in parts[:-1] or 'license' in parts[-1].lower():
            continue
        folder = os.path.dirname(f)
        stem = parts[-1].split('.')[0]
        beside = [n for n in os.listdir(os.path.join(ROOT, folder)) if 'license' in n.lower() and n.lower().startswith(stem.lower())]
        if not beside:
            flags.append(f'vendor: {f} has no license beside it ({stem}*LICENSE*)')
        if f not in licenses and not any(f'{folder}/{n}' in licenses for n in beside):
            flags.append(f'vendor: {f} has no row in the README\'s Licenses table')
    return flags


# ---------- Notes ----------

def unnamed_classes(files):
    notes = []
    scripts = '\n'.join(read(os.path.join(ROOT, f)) for f in files if f.endswith('.js'))
    sheets = {f: CSS_COMMENT.sub('', read(os.path.join(ROOT, f))) for f in files if f.endswith('.css')}
    # Prefixes built at runtime: `se-foo-${x}` or 'se-foo-' + x
    built = set(re.findall(r'(se-[\w-]*-)(?:\$\{|[\'"`]\s*\+)', scripts))
    # ... or from a prefix constant: const OURS = 'se-foo'; `${OURS}-bar`
    for f in files:
        if f.endswith('.js'):
            text = read(os.path.join(ROOT, f))
            for name, prefix in re.findall(r'(?:const|let)\s+(\w+)\s*=\s*[\'"](se-[\w-]+)[\'"]', text):
                if re.search(r'\$\{' + name + r'\}-', text):
                    built.add(prefix + '-')
    for f, text in sorted(sheets.items()):
        selectors = ' '.join(re.findall(r'([^{}]+)\{', text))
        for cls in sorted(set(re.findall(r'\.(se-[\w-]+)', selectors))):
            if re.search(re.escape(cls) + r'(?![\w-])', scripts) or any(cls.startswith(p) for p in built):
                continue
            # Named in another stylesheet's markup-free rule only counts if not this file
            if any(o != f and re.search(r'\.' + re.escape(cls) + r'(?![\w-])', t) for o, t in sheets.items()):
                continue
            notes.append(f'class: .{cls} ({f}) is styled but nothing names it')
    return notes


def big_files(files):
    notes = []
    for f in files:
        if f.endswith(('.js', '.css')) and 'vendor/' not in f and f != 'core/classmap.js':
            size = os.path.getsize(os.path.join(ROOT, f))
            if size > SPLIT_SIZE:
                notes.append(f'size: {f} is {size // 1024} KB (split at ~40 KB)')
    return notes


def version():
    """skin.json's version against the last release tag: a release needs it bumped past the tag."""
    skin = json.loads(read(os.path.join(ROOT, 'skin.json'))).get('version', '')
    try:
        tags = subprocess.run(['git', 'tag', '--list'], cwd=ROOT, capture_output=True, text=True,
                              check=True).stdout.split()
    except (OSError, subprocess.CalledProcessError):
        return []
    key = lambda v: tuple(int(n) for n in v.split('.'))
    releases = sorted((t for t in tags if re.fullmatch(r'\d+\.\d+\.\d+', t)), key=key)
    if releases and re.fullmatch(r'\d+\.\d+\.\d+', skin) and key(skin) <= key(releases[-1]):
        return [f'version: skin.json says {skin}, the last release is {releases[-1]} (bump it before releasing)']
    return []


def main():
    files = sorted(walk())
    flags = loading(files) + unused_tokens(files) + dead_exports(files) + leftovers(files) + vendor(files)
    notes = unnamed_classes(files) + big_files(files) + version()
    for line in flags:
        print(line)
    if notes:
        print('\nNotes (look, then decide):' if flags else 'Notes (look, then decide):')
        for line in notes:
            print(f'  {line}')
    print(f'\n{len(flags)} flagged, {len(notes)} notes' if flags else f'\nNo flags, {len(notes)} notes.')
    return 1 if flags else 0


if __name__ == '__main__':
    sys.exit(main())
