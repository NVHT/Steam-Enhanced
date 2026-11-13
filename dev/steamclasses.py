"""Extract CSS module class maps (semantic key -> hashed class) from Steam bundles."""
import glob
import os
import re

PAIR_RE = re.compile(r'([A-Za-z_$][\w$]*)\s*:\s*"([^"\\]+)"')
HASH_RE = re.compile(r'^-?[_a-zA-Z][\w-]{16,26}$')
OBJECT_RUN_RE = re.compile(
    r'(?:[A-Za-z_$][\w$]*\s*:\s*"[^"\\\n]{1,80}"\s*,\s*)*'
    r'[A-Za-z_$][\w$]*\s*:\s*"[^"\\\n]{1,80}"'
)


def is_hash(value):
    """Return True if value matches Steam's webpack CSS module hash format."""
    return bool(
        HASH_RE.match(value)
        and re.search(r'[A-Z]', value)
        and re.search(r'[a-z]', value)
        and (re.search(r'[\d_-]', value) or (len(value) >= 20 and re.search(r'[A-Z]{2}', value)))
    )


def index(src_dir):
    """Scan steamui JS bundles in src_dir and return (modules, by_hash)."""
    modules = []
    by_hash = {}
    for path in sorted(glob.glob(os.path.join(src_dir, '*.js'))):
        with open(path, encoding='utf-8', errors='ignore') as fh:
            content = fh.read()
        for match in OBJECT_RUN_RE.finditer(content):
            mod = {k: v for k, v in PAIR_RE.findall(match.group(0)) if is_hash(v)}
            if not mod:
                continue
            mod_idx = len(modules)
            modules.append(mod)
            for key, hashed in mod.items():
                by_hash.setdefault(hashed, (mod_idx, key))
    return modules, by_hash


if __name__ == '__main__':
    import sys
    mods, lookup = index(sys.argv[1])
    print(f'{len(mods)} modules, {len(lookup)} classes')
