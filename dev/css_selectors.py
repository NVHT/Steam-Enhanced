"""Selector parsing for dev/css-check.py: specificity (Selectors 4), Chromium's rule keys, and
writing out a multi-argument :is() key so Chromium can index the rule.

A rule whose last compound is only `:is(.a, .b)` can't be indexed: Chromium tests it on every
element in every style pass, as it does a `*` key. Written out (`X .a, X .b`), each branch keeps
the :is()'s weight through never-matching pads: `:not(#se-none)` an id, `:not(.se-none)` a class,
`:not(se-none)` a tag. Against a class, a tag argument keeps its own tag and outweighs by it.
"""
import re

PAD = (':not(#se-none)', ':not(.se-none)', ':not(se-none)')
def split_top(s, seps):
    """Split s at top level (outside (), [], quotes) on any char in seps; returns parts and the seps."""
    parts, cur, depth, q, found = [], '', 0, None, []
    for ch in s:
        if q:
            cur += ch
            if ch == q: q = None
            continue
        if ch in '"\'':
            q = ch; cur += ch; continue
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if depth == 0 and ch in seps:
            parts.append(cur); found.append(ch); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts, found

def selector_list(s):
    return [p.strip() for p in split_top(s, ',')[0]]

def compounds(sel):
    """The compounds of one complex selector, combinators dropped."""
    s = re.sub(r'\s*([>+~])\s*', r'\1', sel.strip())
    parts, _ = split_top(s, ' >+~')
    return [p for p in parts if p]

def match_paren(s, i):
    """s[i] == '('; index of its ')'."""
    d, q = 0, None
    for j in range(i, len(s)):
        ch = s[j]
        if q:
            if ch == q: q = None
            continue
        if ch in '"\'': q = ch; continue
        if ch == '(': d += 1
        elif ch == ')':
            d -= 1
            if d == 0: return j
    raise ValueError('unbalanced: ' + s)

def compound_spec(c):
    ids = cls = tags = 0
    i = 0
    if c[:1].isalpha() or c[:1] == '*':
        m = re.match(r'[\w-]+|\*', c)
        if m.group(0) != '*': tags += 1
        i = m.end()
    while i < len(c):
        ch = c[i]
        if ch == '#':
            m = re.match(r'#[\w-]+', c[i:]); ids += 1; i += m.end()
        elif ch == '.':
            m = re.match(r'\.[\w-]+', c[i:]); cls += 1; i += m.end()
        elif ch == '[':
            j = c.index(']', i); cls += 1; i = j + 1
        elif c.startswith('::', i):
            m = re.match(r'::[\w-]+', c[i:]); tags += 1; i += m.end()
            if i < len(c) and c[i] == '(':
                i = match_paren(c, i) + 1
        elif ch == ':':
            m = re.match(r':([\w-]+)', c[i:]); name = m.group(1); i += m.end()
            if i < len(c) and c[i] == '(':
                j = match_paren(c, i); inner = c[i + 1:j]; i = j + 1
                if name == 'where':
                    pass
                elif name in ('is', 'not', 'has', 'matches', '-webkit-any'):
                    b = max(spec(a) for a in selector_list(inner))
                    ids, cls, tags = ids + b[0], cls + b[1], tags + b[2]
                elif name in ('nth-child', 'nth-last-child'):
                    cls += 1
                    m2 = re.search(r'\bof\b', inner)
                    if m2:
                        b = max(spec(a) for a in selector_list(inner[m2.end():]))
                        ids, cls, tags = ids + b[0], cls + b[1], tags + b[2]
                else:
                    cls += 1
            else:
                cls += 1
        else:
            raise ValueError('unexpected %r in %s' % (ch, c))
    return (ids, cls, tags)

def spec(sel):
    t = (0, 0, 0)
    for c in compounds(sel):
        s = compound_spec(c)
        t = (t[0] + s[0], t[1] + s[1], t[2] + s[2])
    return t

def keyed(compound):
    """Whether Chromium can index a rule by this compound: an id, class, attribute or tag outside
    any functional pseudo-class."""
    c = compound
    if c[:1].isalpha(): return True
    i = 0
    while i < len(c):
        ch = c[i]
        if ch in '#.[': return True
        if ch == ':' and i + 1 < len(c) and c[i + 1] != ':':
            m = re.match(r':[\w-]+', c[i:]); i += m.end()
            if i < len(c) and c[i] == '(':
                i = match_paren(c, i) + 1
            continue
        i += 1
    return False

def last_compound(sel):
    """(start, compound): where the selector's last compound begins, and the compound."""
    depth, q, last = 0, None, 0
    for i, ch in enumerate(sel):
        if q:
            if ch == q: q = None
            continue
        if ch in '"\'': q = ch; continue
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        elif depth == 0 and ch in ' >+~': last = i + 1
    return last, sel[last:]


def write_out(sel):
    """The selector's `:is()` key written out as a list keeping its weight, or None when it has no
    such key, or writing it out would change what it matches or outweigh it by more than a tag
    (an argument with no key, an id against a class, a complex argument under a prefix: in
    `X :is(A B)` A may sit outside X, which `X A B` doesn't match)."""
    start, r = last_compound(sel)
    if not r or keyed(r) or not r.startswith(':is('):
        return None
    end = match_paren(r, 3)
    args = selector_list(r[4:end])
    if len(args) < 2:
        return None
    rest = r[end + 1:]
    prefix = sel[:start]
    if prefix.strip() and any(len(compounds(a)) > 1 for a in args):
        return None
    if not all(keyed(compounds(a)[-1]) for a in args):
        return None
    specs = [spec(a) for a in args]
    target = max(specs)
    out = []
    for a, s in zip(args, specs):
        diff = [t - x for t, x in zip(target, s)]
        if diff[0] < 0 or diff[1] < 0:
            return None
        diff[2] = max(0, diff[2])
        out.append(prefix + a + ''.join(PAD[k] * diff[k] for k in range(3)) + rest)
    return out


def rules(css):
    """(start, end, selector) of each style rule's selector list, comments blanked (offsets kept)."""
    masked = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), css, flags=re.S)
    for m in re.finditer(r'([^{}@;]+)\{', masked):
        sel = masked[m.start(1):m.end(1)]
        start = m.start(1) + len(sel) - len(sel.lstrip())
        end = m.start(1) + len(sel.rstrip())
        clean = masked[start:end]
        if not clean or re.match(r'^(property|container|media|supports|font-face|layer|keyframes)\b|^[\d.]+%|^(from|to)$', clean):
            continue
        if '/*' in css[start:end]:
            continue  # a comment inside the selector list: left to a hand
        yield start, end, clean
