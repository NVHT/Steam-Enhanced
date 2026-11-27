/*
 * The runtime, part 2 of 3 (core/runtime.js names the parts), listed right after it: theme
 * elements and text (el, setText, the inline icons, esc) and the labels for dates, sizes,
 * amounts and initials, added to window.__se before any feature runs (runtime-art.js uses esc).
 */
(() => {
  const SE = window.__se;
  if (!SE || SE.esc) return;

  // A theme element: tag, optional class, optional text.
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // Writes text only when it differs: a rewrite swaps the text node out from under the pointer.
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  /*
   * Inline SVG icons from a name -> markup map (24-unit viewBox):
   *   const { icon, setIcon } = SE.icons(ICONS, 'info');
   * icon(name, className?) makes one; setIcon(svg, name) swaps an icon in place. `fallback`
   * names the icon used for an unknown name.
   */
  const icons = (map, fallback) => {
    const markup = (name) => map[name] ?? (fallback ? map[fallback] : '') ?? '';
    return {
      icon(name, className) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        if (className) svg.setAttribute('class', className);
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
        return svg;
      },
      setIcon(svg, name) {
        if (svg.dataset.icon === name) return;
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
      },
    };
  };

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  // How long ago a Unix time (seconds) was: "just now", "5 min ago", "3 h ago", "yesterday",
  // "12 days ago", then weeks, months and years
  const ago = (t) => {
    if (!t) return '';
    const s = Date.now() / 1000 - t;
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 172800) return 'yesterday';
    const day = Math.round(s / 86400);
    if (day < 14) return `${day} days ago`;
    if (day < 60) return `${Math.round(day / 7)} wk ago`;
    if (day < 365) return `${Math.round(day / 30)} mo ago`;
    return `${Math.round(day / 365)} yr ago`;
  };

  // A Unix time's day: "Today", "Yesterday", then the date (with its year when not this one's);
  // `recent` says "3 days ago" within the week
  const dayLabel = (t, { recent = false } = {}) => {
    if (!t) return '';
    const d = new Date(t * 1000);
    const now = new Date();
    const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((midnight(now) - midnight(d)) / 864e5);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (recent && days < 7) return `${days} days ago`;
    const year = d.getFullYear() === now.getFullYear() ? undefined : 'numeric';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year });
  };

  // A size in binary units. Steam's dialogs: a decimal from KB, two from GB (localised); `short`:
  // one decimal under 100, none for bytes. '' for no size.
  const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = (value, { short = false } = {}) => {
    let n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '';
    let unit = 0;
    for (; n >= 1024 && unit < BYTE_UNITS.length - 1; unit++) n /= 1024;
    if (short) return `${!unit || n >= 100 ? Math.round(n) : n.toFixed(1)} ${BYTE_UNITS[unit]}`;
    const digits = unit >= 3 ? 2 : unit ? 1 : 0;
    return `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`;
  };

  // A size or count Steam reports: a number 0 or more, else null
  const amount = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // part of whole as a CSS width, kept within 0–100%
  const percent = (part, whole) => `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(3)}%`;

  // A name's initials, as Steam draws a group or friend without a picture: each word's first
  // letter or digit, so a symbol ("● Squad") never stands for a name
  const initials = (name) =>
    String(name || '')
      .trim()
      .split(/\s+/)
      .map((word) => [...word].find((ch) => /[\p{L}\p{N}]/u.test(ch)))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '#';

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);

  Object.assign(SE, { el, setText, icons, ago, day: dayLabel, bytes, amount, percent, initials, esc });
})();
