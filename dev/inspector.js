/*
 * Element picker: a theming aid. Ctrl+Shift+E (loaded on demand by core/core.js) turns it
 * on in the current Steam window or web page; the element under the pointer is outlined.
 *
 *   Click or Space   capture the outlined element (Space works for hover-only menus)
 *   [ / ]            step out to the parent / back in toward the pointer
 *   P                report the whole page instead (or the "Whole page" button)
 *   Esc              close
 *
 * A capture copies a plain-text report to the clipboard and shows it in a panel: the page,
 * the theme files actually loaded (to spot a stale build), the ancestor chain with classes,
 * an outline of the element's whole subtree (repeated siblings counted), the element's
 * markup (long attributes trimmed), key computed styles, the stylesheet rules that match
 * it, and the paint stack under the pointer (every element that paints there, front to back,
 * with its background, ::before/::after and layering; for colour that has no visible owner). Pasted back into a chat, that is enough to target the element.
 *
 * The UI lives in a closed shadow root so neither Steam's CSS nor the theme's can touch it,
 * and nothing runs until the shortcut is pressed.
 */
(() => {
  const KEY = '__seInspector';
  if (window[KEY]) {
    window[KEY].toggle();
    return;
  }

  const MAX_HTML = 6000;
  const MAX_OUTLINE = 500;
  const MAX_DEPTH = 16;
  // Whole-page report: the body's outline, deeper and longer.
  const PAGE_OUTLINE = 2500;
  const PAGE_DEPTH = 40;
  const MAX_RULES = 40;
  const MAX_ANCESTORS = 14;
  const STYLE_PROPS = [
    'display', 'position', 'inset', 'width', 'height', 'margin', 'padding', 'z-index', 'opacity',
    'background-color', 'background-image', 'color', 'border', 'border-radius', 'box-shadow',
    'font-family', 'font-size', 'font-weight', 'line-height', 'transform', 'translate', 'pointer-events',
  ];

  /* ---------- UI (closed shadow root) ---------- */

  const host = document.createElement('se-inspector');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font: 500 12px/1.45 "Segoe UI", system-ui, sans-serif; }
      .box { position: fixed; pointer-events: none; border: 2px solid #7cc4ff; border-radius: 3px;
             background: rgba(124, 196, 255, .12); transition: all .05s linear; }
      .tag { position: fixed; pointer-events: none; max-width: 70vw; padding: 3px 8px; border-radius: 6px;
             background: #0f1115; color: #e6e8eb; box-shadow: 0 0 0 1px rgba(124,196,255,.5);
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tag b { color: #7cc4ff; font-weight: 700; }
      .hint { position: fixed; left: 50%; bottom: 18px; translate: -50% 0; padding: 7px 14px; border-radius: 999px;
              background: rgba(15, 17, 21, .92); color: #b8c0c8; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
      .hint kbd { padding: 1px 6px; border-radius: 4px; background: #262c35; color: #e6e8eb; font-family: Consolas, monospace; }
      .hint button { height: 24px; margin-left: 6px; pointer-events: auto; }
      .panel { position: fixed; right: 16px; bottom: 16px; width: min(560px, calc(100vw - 32px)); max-height: 70vh;
               display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; pointer-events: auto;
               background: #171a20; color: #e6e8eb; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 24px 48px -16px #000; }
      .panel header { display: flex; align-items: center; gap: 8px; }
      .panel header span { flex: 1; font-weight: 700; }
      .panel textarea { flex: 1; min-height: 240px; resize: none; padding: 10px; border: 0; border-radius: 10px;
                        background: #0f1115; color: #b8c0c8; font: 11px/1.5 Consolas, monospace; white-space: pre; }
      button { height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: #262c35; color: #e6e8eb;
               cursor: pointer; }
      button:hover { background: #2c3440; }
      button.primary { background: #7cc4ff; color: #0f1115; font-weight: 700; }
      [hidden] { display: none !important; }
    </style>
    <div class="box" hidden></div>
    <div class="tag" hidden></div>
    <div class="hint" hidden>Pick an element: <kbd>Click</kbd> or <kbd>Space</kbd> capture · <kbd>[</kbd> <kbd>]</kbd> parent / child · <kbd>P</kbd> whole page · <kbd>Esc</kbd> close<button class="page primary">Whole page</button></div>
    <div class="panel" hidden>
      <header><span class="title">Element report</span><button class="copy primary">Copy</button><button class="page">Whole page</button><button class="again">Pick another</button><button class="close">Close</button></header>
      <textarea readonly spellcheck="false"></textarea>
    </div>`;
  const $ = (selector) => root.querySelector(selector);
  const ui = { box: $('.box'), tag: $('.tag'), hint: $('.hint'), panel: $('.panel'), text: $('textarea'), copy: $('.copy'), title: $('.panel .title') };

  /* ---------- Describing elements ---------- */

  const short = (value, max = 80) => (value.length > max ? `${value.slice(0, max)}…` : value);

  const label = (el) => {
    if (!(el instanceof Element)) return String(el);
    const id = el.id ? `#${el.id}` : '';
    const classes = [...el.classList].map((c) => `.${c}`).join('');
    return `${el.tagName.toLowerCase()}${id}${classes}`;
  };

  /** The element's own markup with long attribute values (art URLs, inline styles) shortened. */
  const markup = (el) => {
    const clone = el.cloneNode(true);
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        if (attr.value.length > 120) node.setAttribute(attr.name, short(attr.value, 120));
      }
    }
    const html = clone.outerHTML.replace(/\s{2,}/g, ' ');
    return html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}\n… (${html.length - MAX_HTML} more characters)` : html;
  };

  /*
   * The element's whole subtree as an indented outline (tag, id, classes, a snippet of its own
   * text), for redesigning pages whose markup runs past MAX_HTML. Runs of siblings with the
   * same tag, classes and visibility and no id (award cards, list rows, subtitle tracks) print
   * once with a count; an id marks a one-off container, so it is never folded into a run, nor is
   * a shown sibling folded under a hidden one. SVG internals and non-visual tags are skipped.
   * Capped at MAX_OUTLINE lines.
   */
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'se-inspector']);
  const signature = (node) =>
    node.id
      ? `#${node.id}`
      : `${node.tagName}|${typeof node.className === 'string' ? node.className : ''}|${getComputedStyle(node).display === 'none'}`;
  const ownText = (node) =>
    [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  /** Box size for the page outline: only blocks big enough to matter for layout. */
  const size = (node) => {
    const r = node.getBoundingClientRect();
    return r.width >= 40 && r.height >= 24 ? `  [${Math.round(r.width)}×${Math.round(r.height)}]` : '';
  };

  const structure = (el, { maxLines = MAX_OUTLINE, maxDepth = MAX_DEPTH, sizes = false } = {}) => {
    const lines = [];
    const walk = (node, depth) => {
      if (lines.length >= maxLines) return;
      const text = ownText(node);
      const hidden = node !== el && getComputedStyle(node).display === 'none';
      lines.push(`${'  '.repeat(depth)}${label(node)}${sizes && !hidden ? size(node) : ''}${hidden ? '  (hidden)' : ''}${text ? `  "${short(text, 60)}"` : ''}`);
      if (hidden || node.tagName === 'svg' || depth >= maxDepth) return;
      const children = [...node.children].filter((child) => !SKIP.has(child.tagName.toLowerCase()));
      for (let i = 0; i < children.length; ) {
        let run = 1;
        while (i + run < children.length && signature(children[i + run]) === signature(children[i])) run++;
        walk(children[i], depth + 1);
        if (run > 1) lines.push(`${'  '.repeat(depth + 1)}(+${run - 1} more like this)`);
        i += run;
      }
    };
    walk(el, 0);
    if (lines.length >= maxLines) lines.push(`… (outline capped at ${maxLines} lines)`);
    return lines.join('\n');
  };

  const ancestors = (el) => {
    const chain = [];
    for (let node = el.parentElement; node && chain.length < MAX_ANCESTORS; node = node.parentElement) chain.push(node);
    return chain.reverse().map((node, depth) => `${'  '.repeat(depth)}${label(node)}`).join('\n');
  };

  const styles = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    if (pseudo && (style.content === 'none' || style.content === 'normal')) return '';
    return STYLE_PROPS.map((prop) => `  ${prop}: ${short(style.getPropertyValue(prop), 140)}`).join('\n');
  };

  /** Rules that match the element, from every stylesheet the page can read (cross-origin ones can't be). */
  const matchedRules = (el) => {
    const found = [];
    let blocked = 0;
    const visit = (rules, source) => {
      for (const rule of rules) {
        if (found.length >= MAX_RULES) return;
        if (rule.cssRules && !rule.selectorText) {
          visit(rule.cssRules, source); // @media, @supports, @layer
          continue;
        }
        if (!rule.selectorText) continue;
        try {
          if (el.matches(rule.selectorText)) found.push(`/* ${source} */ ${short(rule.cssText, 400)}`);
        } catch {} // selectors this engine rejects
      }
    };
    for (const sheet of document.styleSheets) {
      const source = sheet.href ? sheet.href.split('/').pop().split('?')[0] : sheet.ownerNode?.dataset?.seFeature || 'inline <style>';
      try {
        visit(sheet.cssRules, source);
      } catch {
        blocked++;
      }
    }
    return { found, blocked };
  };

  /*
   * Which theme files this page actually loaded, with their ?v= build. Only nodes that load a
   * file count: <script src> and stylesheet <link>s. Other <link>s to theme scripts (preload
   * hints beside the <script>s Millennium injects) fetch nothing new and used to list every
   * injected script twice, so they're counted on a line of their own. A file really injected
   * twice (two <script>s, two sheets) is flagged instead of silently repeated.
   */
  const LOADS = 'script[src], link[rel~="stylesheet"][href]';
  const themeFiles = () => {
    const nodes = [...document.querySelectorAll('[data-se-feature], link[href*="Steam-Enhanced"], script[src*="Steam-Enhanced"]')];
    const counts = new Map();
    let hints = 0;
    for (const node of nodes) {
      const url = node.src || node.href;
      if (!url) continue;
      if (!node.matches(LOADS)) {
        hints++;
        continue;
      }
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
    const lines = [...counts].map(([url, count]) => {
      const u = new URL(url, location.href);
      const name = `  ${u.pathname.split('/').slice(-2).join('/')}${u.search}`;
      return count > 1 ? `${name}  (×${count}: injected more than once)` : name;
    });
    if (hints) lines.push(`  (+${hints} preload hint${hints === 1 ? '' : 's'}, not listed)`);
    return lines.join('\n') || '  (none found by tag; Millennium may inject them inline)';
  };

  /*
   * Every element under a point, front to back as the browser hit-tests them (layers behind
   * <body> included), each with what it paints: background colour and image, the same on
   * ::before/::after, position/z-index, size and theme marks. Transparent, imageless entries
   * are listed bare so the order stays readable.
   */
  const MAX_STACK = 40;
  const paint = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    if (pseudo && (style.content === 'none' || style.content === 'normal')) return '';
    const parts = [];
    if (!/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor)) parts.push(`bg ${style.backgroundColor}`);
    if (style.backgroundImage !== 'none') parts.push(`image ${short(style.backgroundImage, 120)}`);
    if (style.boxShadow !== 'none') parts.push(`shadow ${short(style.boxShadow, 80)}`);
    if (style.filter !== 'none') parts.push(`filter ${short(style.filter, 60)}`);
    return parts.join(', ');
  };

  const stack = (point) => {
    if (!point) return '  (no pointer position)';
    const hit = document.elementsFromPoint(point.x, point.y).filter((node) => !own(node));
    // Boxes over the point that hit-testing skips (pointer-events: none overlays), if they paint.
    const hitSet = new Set(hit);
    const unhit = [...document.querySelectorAll('body *')].filter((node) => {
      if (hitSet.has(node) || own(node)) return false;
      const r = node.getBoundingClientRect();
      return r.width && r.height && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom &&
        [null, '::before', '::after'].some((pseudo) => paint(node, pseudo)) ||
        (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(node.tagName) && r.width && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom);
    });
    const nodes = [...hit.slice(0, MAX_STACK), ...unhit.slice(0, MAX_STACK)];
    const unhitSet = new Set(unhit);
    return nodes.map((node) => {
      const style = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const marks = [...node.attributes].filter((attr) => attr.name.startsWith('data-se-')).map((attr) => attr.name);
      const layer = style.position === 'static' ? '' : ` ${style.position}${style.zIndex === 'auto' ? '' : ` z${style.zIndex}`}`;
      const media = /^(IMG|VIDEO|PICTURE|CANVAS|IFRAME)$/.test(node.tagName) ? ` src ${short(node.currentSrc || node.src || '', 100)}` : '';
      const skipped = unhitSet.has(node) ? `  (not hit-testable: pointer-events ${style.pointerEvents}, visibility ${style.visibility}, opacity ${style.opacity})` : '';
      const lines = [`  ${label(node)}  [${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}]${layer}${marks.length ? `  {${marks.join(' ')}}` : ''}${skipped}`];
      const own_ = paint(node) + media;
      if (own_) lines.push(`      ${own_}`);
      for (const pseudo of ['::before', '::after']) {
        const p = paint(node, pseudo);
        if (p) lines.push(`      ${pseudo}: ${p}`);
      }
      return lines.join('\n');
    }).join('\n');
  };

  const report = (el) => {
    const { found, blocked } = matchedRules(el);
    const rect = el.getBoundingClientRect();
    const before = styles(el, '::before');
    const after = styles(el, '::after');
    return [
      'Steam Enhanced element report',
      `Page: ${document.title || '(untitled)'} — ${location.href}`,
      `Root classes: html.${[...document.documentElement.classList].join('.') || '(none)'}`,
      'Theme files loaded:',
      themeFiles(),
      '',
      `Element: ${label(el)}  (${Math.round(rect.width)}×${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)})`,
      '',
      'Ancestors (outermost first):',
      ancestors(el),
      '',
      'Structure:',
      structure(el),
      '',
      'Markup:',
      markup(el),
      '',
      'Computed style:',
      styles(el),
      before && `\n::before\n${before}`,
      after && `\n::after\n${after}`,
      '',
      `Matching rules (${found.length}${found.length >= MAX_RULES ? '+' : ''}; ${blocked} cross-origin stylesheet(s) unreadable):`,
      found.join('\n') || '  (none readable)',
      '',
      `Paint stack at the pointer (${lastPoint ? `${Math.round(lastPoint.x)},${Math.round(lastPoint.y)}` : '?'}; front to back):`,
      stack(lastPoint),
    ]
      .filter((line) => line !== '')
      .join('\n')
      .replace(/\n(?=Element:|Ancestors|Structure:|Markup:|Computed style:|Matching rules|Paint stack)/g, '\n\n');
  };

  /*
   * Whole-page report, one click: everything needed to redesign the page without picking
   * parts of it. The page and its build, <html> and <body> classes, the window size, Steam's
   * stylesheets (to look up in SteamTracking), the theme files, and the whole body as an
   * outline with box sizes (hidden parts marked, not expanded).
   */
  const steamSheets = () => {
    const names = new Set();
    for (const sheet of document.styleSheets) {
      if (!sheet.href || /Steam-Enhanced/.test(sheet.href)) continue;
      names.add(new URL(sheet.href).pathname.split('/').pop());
    }
    return [...names].map((name) => `  ${name}`).join('\n') || '  (none)';
  };

  const pageReport = () => {
    const body = document.body ?? document.documentElement;
    const bodyStyle = getComputedStyle(body);
    return [
      'Steam Enhanced page report',
      `Page: ${document.title || '(untitled)'} — ${location.href}`,
      `Root classes: html.${[...document.documentElement.classList].join('.') || '(none)'}`,
      `Body: ${label(body)}  (background ${short(bodyStyle.backgroundColor, 40)}, ${short(bodyStyle.backgroundImage, 100)})`,
      `Window: ${innerWidth}×${innerHeight}, page ${document.documentElement.scrollWidth}×${document.documentElement.scrollHeight}, scale ${devicePixelRatio}`,
      'Theme files loaded:',
      themeFiles(),
      '',
      "Steam stylesheets:",
      steamSheets(),
      '',
      'Structure (whole page):',
      structure(body, { maxLines: PAGE_OUTLINE, maxDepth: PAGE_DEPTH, sizes: true }),
    ]
      .filter((line) => line !== '')
      .join('\n')
      .replace(/\n(?=Steam stylesheets:|Structure)/g, '\n\n');
  };

  /* ---------- Picking ---------- */

  let active = false;
  let pointer = null; // element under the pointer
  let current = null; // outlined element (pointer, or an ancestor via [ ])
  let lastPoint = null; // pointer position, for the paint stack
  const trail = []; // elements stepped out of, for ]

  const own = (el) => el === host || host.contains(el);

  const outline = (el) => {
    current = el;
    if (!el) {
      ui.box.hidden = ui.tag.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(ui.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    ui.tag.innerHTML = '';
    const name = document.createElement('b');
    name.textContent = el.tagName.toLowerCase();
    ui.tag.append(name, `${el.id ? `#${el.id}` : ''}${[...el.classList].map((c) => `.${c}`).join('')}  ${Math.round(r.width)}×${Math.round(r.height)}`);
    ui.tag.style.left = `${Math.max(4, r.left)}px`;
    ui.tag.style.top = `${r.top > 30 ? r.top - 26 : r.bottom + 4}px`;
    ui.box.hidden = ui.tag.hidden = false;
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for windows without clipboard permission.
      ui.text.select();
      try {
        return document.execCommand('copy');
      } catch (__) {
        return false;
      }
    }
  };

  const flash = (button, text) => {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => (button.textContent = original), 1400);
  };

  const show = async (title, text) => {
    stopPicking();
    ui.title.textContent = title;
    ui.text.value = text;
    ui.panel.hidden = false;
    flash(ui.copy, (await copy(text)) ? 'Copied' : 'Select and copy');
  };

  const capture = (el) => el && show('Element report', report(el));
  const capturePage = () => show('Page report', pageReport());

  const onMove = (event) => {
    lastPoint = { x: event.clientX, y: event.clientY };
    const el = event.composedPath().find((node) => node instanceof Element && !own(node)) || null;
    if (el === pointer) return;
    pointer = el;
    trail.length = 0;
    outline(el);
  };

  const block = (event) => {
    if (own(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onClick = (event) => {
    if (own(event.target)) return;
    block(event);
    capture(current);
  };

  const onKey = (event) => {
    if (!host.isConnected) return; // closed: Steam's own keys pass untouched
    if (event.key === 'Escape') {
      block(event);
      close();
    } else if (!active) {
      return;
    } else if (event.key === ' ') {
      block(event);
      capture(current);
    } else if (event.key === 'p' || event.key === 'P') {
      block(event);
      capturePage();
    } else if (event.key === '[' && current?.parentElement && current.parentElement !== document.documentElement) {
      block(event);
      trail.push(current);
      outline(current.parentElement);
    } else if (event.key === ']' && trail.length) {
      block(event);
      outline(trail.pop());
    }
  };

  const reposition = () => active && current && outline(current);

  // Capture phase on window, so the page's own handlers never see a picking click.
  const PICK_EVENTS = [['pointerdown', block], ['mousedown', block], ['pointerup', block], ['mouseup', block], ['click', onClick], ['contextmenu', block]];

  const startPicking = () => {
    active = true;
    ui.panel.hidden = true;
    ui.hint.hidden = false;
    addEventListener('pointermove', onMove, true);
    for (const [type, fn] of PICK_EVENTS) addEventListener(type, fn, true);
    addEventListener('scroll', reposition, true);
  };

  function stopPicking() {
    active = false;
    ui.hint.hidden = true;
    outline(null);
    removeEventListener('pointermove', onMove, true);
    for (const [type, fn] of PICK_EVENTS) removeEventListener(type, fn, true);
    removeEventListener('scroll', reposition, true);
  }

  function close() {
    stopPicking();
    ui.panel.hidden = true;
    host.remove();
  }

  ui.copy.addEventListener('click', async () => flash(ui.copy, (await copy(ui.text.value)) ? 'Copied' : 'Select and copy'));
  $('.again').addEventListener('click', startPicking);
  for (const button of root.querySelectorAll('.page')) button.addEventListener('click', capturePage);
  $('.close').addEventListener('click', close);
  addEventListener('keydown', onKey, true);

  const open = () => {
    if (!host.isConnected) (document.body || document.documentElement).append(host);
    startPicking();
  };

  window[KEY] = {
    toggle() {
      if (host.isConnected && (active || !ui.panel.hidden)) close();
      else open();
    },
    destroy() {
      close();
      removeEventListener('keydown', onKey, true);
      delete window[KEY];
    },
  };
  open();
})();
