/*
 * Element picker: a theming aid. Ctrl+Shift+E (loaded on demand by core/core.js) turns it
 * on in the current Steam window or web page; the element under the pointer is outlined.
 *
 *   Click or Space   capture the outlined element (Space works for hover-only menus)
 *   [ / ]            step out to the parent / back in toward the pointer
 *   F                freeze hovers: the page stops seeing the pointer, so a hover popup stays
 *                    open while the pointer moves onto it (F again to unfreeze)
 *   S                report by CSS selector (or the "By selector" button): for elements that
 *                    can't be pointed at (hidden, covered, gone when the pointer moves)
 *   P                report the whole page instead (or the "Whole page" button)
 *   D                catch the next dialog (or the "Catch next dialog" button)
 *   Esc              close (or stop waiting for a dialog)
 *
 * A capture copies a plain-text report to the clipboard and shows it in a panel: the page,
 * the theme files actually loaded (to spot a stale build), the ancestor chain with classes,
 * an outline of the element's whole subtree (repeated siblings counted), the element's
 * markup (long attributes trimmed), its inline style, key computed styles, the stylesheet
 * rules that match it (Steam's cross-origin sheets included: they are fetched and parsed,
 * since the page can't read them), and the paint stack under the pointer: every element that
 * paints there, front to back, with what it paints (background, border, radius, outline,
 * shadow, filter, opacity, blend, clip, mask) on itself and its ::before/::after, plus the
 * shadows of nearby elements that reach the point (a box's shadow paints outside its box, so
 * hit-testing alone never finds it). For colour that has no visible owner. Pasted back into
 * a chat, that is enough to target the element.
 *
 * Catch next dialog: for dialogs too brief to point at (a wait dialog shown while a page
 * loads). It waits for the next dialog to appear (a <dialog>, a [role=dialog], Steam's
 * .newmodal or React ModalPosition, or anything whose class names a Modal or Dialog) and
 * reports it the moment it shows, then again a frame later if it is still up (the fuller of
 * the two). The wait survives a reload of the tab (sessionStorage; core/core.js loads the
 * picker at once while it's set), so arm it, then reload or do what opens the dialog.
 *
 * The UI lives in a closed shadow root so neither Steam's CSS nor the theme's can touch it,
 * and nothing runs until the shortcut is pressed (or a dialog catch is armed).
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
  const MAX_RULES = 80;
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
      .hint.frozen { box-shadow: 0 0 0 2px #7cc4ff; }
      .hint.frozen .freeze-state { color: #7cc4ff; font-weight: 700; }
      .ask { position: fixed; left: 50%; bottom: 58px; translate: -50% 0; display: flex; gap: 6px; padding: 8px;
             border-radius: 999px; pointer-events: auto; background: rgba(15, 17, 21, .96); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
      .ask input { width: min(520px, 60vw); height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: #262c35;
                   color: #e6e8eb; font: 12px Consolas, monospace; outline: 0; }
      .ask input:focus { box-shadow: 0 0 0 1px #7cc4ff; }
      [hidden] { display: none !important; }
    </style>
    <div class="box" hidden></div>
    <div class="tag" hidden></div>
    <div class="hint" hidden>Pick an element: <kbd>Click</kbd> or <kbd>Space</kbd> capture · <kbd>[</kbd> <kbd>]</kbd> parent / child · <kbd>F</kbd> <span class="freeze-state">freeze hovers</span> · <kbd>S</kbd> by selector · <kbd>P</kbd> whole page · <kbd>D</kbd> next dialog · <kbd>Esc</kbd> close<button class="page primary">Whole page</button><button class="ask-open">By selector</button><button class="catch">Catch next dialog</button></div>
    <form class="ask" hidden><input name="selector" placeholder="CSS selector, e.g. #workshop_item_hover .hover_box" autocomplete="off" spellcheck="false"><button class="primary" type="submit">Report</button><button class="ask-cancel" type="button">Cancel</button></form>
    <div class="hint wait" hidden>Waiting for the next dialog: reload the page or do what opens it · <kbd>Esc</kbd> stop</div>
    <div class="panel" hidden>
      <header><span class="title">Element report</span><button class="copy primary">Copy</button><button class="page">Whole page</button><button class="catch">Catch next dialog</button><button class="again">Pick another</button><button class="close">Close</button></header>
      <textarea readonly spellcheck="false"></textarea>
    </div>`;
  const $ = (selector) => root.querySelector(selector);
  const ui = {
    box: $('.box'), tag: $('.tag'), hint: $('.hint'), wait: $('.wait'), panel: $('.panel'), text: $('textarea'),
    copy: $('.copy'), title: $('.panel .title'), ask: $('.ask'), askInput: $('.ask input'),
  };

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

  /*
   * A stylesheet's rules. The page can't read cross-origin sheets (Steam's own, served from its
   * CDN), so those are fetched and parsed into a detached sheet, once per page; a sheet that
   * can't be fetched either counts as unreadable.
   */
  const fetched = new Map();
  const rulesOf = (sheet) => {
    try {
      return Promise.resolve(sheet.cssRules);
    } catch {
      if (!sheet.href) return Promise.resolve(null);
    }
    if (!fetched.has(sheet.href)) {
      fetched.set(sheet.href, fetch(sheet.href, { credentials: 'omit' })
        .then((response) => (response.ok ? response.text() : null))
        .then((text) => {
          if (text == null) return null;
          const detached = new CSSStyleSheet();
          detached.replaceSync(text); // @import is ignored here: allSheets() lists a readable sheet's imports
          return detached.cssRules;
        })
        .catch(() => null));
    }
    return fetched.get(sheet.href);
  };

  /*
   * Every stylesheet in cascade order, imported ones included: the theme's files are @imported
   * by one <style> per window (#se-sheets, [data-se-sheets]), and an import's rules come before
   * the importing sheet's own. A sheet the page can't read keeps its imports hidden.
   */
  const importsOf = (sheet) => {
    try {
      return [...sheet.cssRules].filter((rule) => rule instanceof CSSImportRule && rule.styleSheet).map((rule) => rule.styleSheet);
    } catch {
      return [];
    }
  };
  const allSheets = () => {
    const out = [];
    const add = (sheet) => {
      for (const imported of importsOf(sheet)) add(imported);
      out.push(sheet);
    };
    for (const sheet of document.styleSheets) add(sheet);
    return out;
  };

  /** Rules that match the element, in cascade order, from every stylesheet (Steam's included). */
  const matchedRules = async (el) => {
    const found = [];
    let blocked = 0;
    const visit = (rules, source, context) => {
      for (const rule of rules) {
        if (found.length >= MAX_RULES) return;
        if (rule.cssRules && !rule.selectorText) {
          // @media and @container that don't apply now are skipped; @supports, @layer kept
          const condition = rule.media?.mediaText ?? rule.conditionText;
          if (rule instanceof CSSMediaRule && !matchMedia(condition).matches) continue;
          visit(rule.cssRules, source, condition ? `${context}@${rule.constructor.name.replace(/^CSS|Rule$/g, '').toLowerCase()} ${condition} ` : context);
          continue;
        }
        if (!rule.selectorText) continue;
        try {
          if (el.matches(rule.selectorText)) found.push(`/* ${source}${context ? ` ${context.trim()}` : ''} */ ${short(rule.cssText, 500)}`);
        } catch {} // selectors this engine rejects
      }
    };
    const sheets = allSheets();
    const lists = await Promise.all(sheets.map(rulesOf));
    sheets.forEach((sheet, i) => {
      const source = sheet.href ? sheet.href.split('/').pop().split('?')[0] : sheet.ownerNode?.dataset?.seFeature || 'inline <style>';
      if (lists[i]) visit(lists[i], source, '');
      else blocked++;
    });
    return { found, blocked };
  };

  /*
   * Which theme files this page actually loaded, with their ?v= build. Only nodes that load a
   * file count: <script src> and stylesheet <link>s. Other <link>s to theme scripts (preload
   * hints beside the <script>s Millennium injects) fetch nothing new and used to list every
   * injected script twice, so they're counted on a line of their own. A file really injected
   * twice (two <script>s, two sheets) is flagged instead of silently repeated. Stylesheets come
   * as the @imports of the theme's one sheet per window (#se-sheets, [data-se-sheets]).
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
    for (const style of document.querySelectorAll('style#se-sheets, style[data-se-sheets]')) {
      for (const sheet of style.sheet ? importsOf(style.sheet) : []) {
        if (sheet.href) counts.set(sheet.href, (counts.get(sheet.href) ?? 0) + 1);
      }
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
  const clear = (color) => /^(transparent|rgba\(.*,\s*0\))$/.test(color);
  const paint = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    if (pseudo && (style.content === 'none' || style.content === 'normal')) return '';
    const parts = [];
    if (!clear(style.backgroundColor)) parts.push(`bg ${style.backgroundColor}`);
    if (style.backgroundImage !== 'none') parts.push(`image ${short(style.backgroundImage, 120)}`);
    const borders = ['top', 'right', 'bottom', 'left']
      .filter((side) => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 && !clear(style.getPropertyValue(`border-${side}-color`)));
    if (borders.length) parts.push(`border ${borders.length === 4 ? '' : `(${borders.join(' ')}) `}${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`);
    if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) parts.push(`outline ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} offset ${style.outlineOffset}`);
    if (style.boxShadow !== 'none') parts.push(`shadow ${short(style.boxShadow, 160)}`);
    if (style.filter !== 'none') parts.push(`filter ${short(style.filter, 80)}`);
    if (style.backdropFilter && style.backdropFilter !== 'none') parts.push(`backdrop ${short(style.backdropFilter, 60)}`);
    if (parts.length && style.borderRadius !== '0px') parts.push(`radius ${style.borderRadius}`);
    if (parseFloat(style.opacity) < 1) parts.push(`opacity ${style.opacity}`);
    if (style.mixBlendMode !== 'normal') parts.push(`blend ${style.mixBlendMode}`);
    if (style.clipPath !== 'none') parts.push(`clip ${short(style.clipPath, 60)}`);
    const mask = style.maskImage || style.webkitMaskImage;
    if (mask && mask !== 'none') parts.push(`mask ${short(mask, 60)}`);
    return parts.join(', ');
  };

  /*
   * How far an element's outer shadows reach past its box, per side: box-shadow (not inset)
   * and filter: drop-shadow(). Each shadow is offset x, offset y, blur, spread; it reaches
   * offset + blur + spread on the side it leans toward.
   */
  const splitTop = (value) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
      else if (value[i] === ',' && depth === 0) {
        out.push(value.slice(start, i));
        start = i + 1;
      }
    }
    out.push(value.slice(start));
    return out.map((part) => part.trim()).filter(Boolean);
  };
  const lengths = (shadow) => (shadow.replace(/\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
  const reach = (style) => {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    const add = ([x = 0, y = 0, blur = 0, spread = 0]) => {
      const grow = blur + spread;
      out.left = Math.max(out.left, grow - x);
      out.right = Math.max(out.right, grow + x);
      out.top = Math.max(out.top, grow - y);
      out.bottom = Math.max(out.bottom, grow + y);
    };
    if (style.boxShadow !== 'none') {
      for (const shadow of splitTop(style.boxShadow)) if (!/\binset\b/.test(shadow)) add(lengths(shadow));
    }
    for (const [, inner] of style.filter.matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g)) add(lengths(inner));
    return out;
  };

  /** Elements whose shadow paints at the point while their box doesn't cover it. */
  const shadowsAt = (point) => {
    const found = [];
    for (const node of document.querySelectorAll('body *')) {
      if (own(node)) continue;
      const style = getComputedStyle(node);
      if (style.boxShadow === 'none' && !style.filter.includes('drop-shadow')) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const inside = point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      if (inside) continue;
      const g = reach(style);
      if (point.x >= r.left - g.left && point.x <= r.right + g.right && point.y >= r.top - g.top && point.y <= r.bottom + g.bottom) {
        found.push(`  ${label(node)}  [${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}]\n      ${paint(node)}`);
      }
      if (found.length >= MAX_STACK) break;
    }
    return found.join('\n') || '  (none)';
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
    }).join('\n') + `\n\nShadows reaching this point from outside their own box:\n${shadowsAt(point)}`;
  };

  /*
   * Everything read from the live page is read first, in one go, before the report waits on
   * Steam's stylesheets: by the time they arrive a hover popup may have closed.
   */
  const report = async (el, note = '') => {
    const rect = el.getBoundingClientRect();
    const inline = el.getAttribute('style');
    const before = styles(el, '::before');
    const after = styles(el, '::after');
    const head = [
      'Steam Enhanced element report',
      `Page: ${document.title || '(untitled)'} — ${location.href}`,
      `Root classes: html.${[...document.documentElement.classList].join('.') || '(none)'}`,
      'Theme files loaded:',
      themeFiles(),
      '',
      `Element: ${label(el)}  (${Math.round(rect.width)}×${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)})${note}`,
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
      inline ? `Inline style: ${short(inline, 600)}` : 'Inline style: (none)',
      '',
      'Computed style:',
      styles(el),
      before && `\n::before\n${before}`,
      after && `\n::after\n${after}`,
    ];
    const tail = [
      `Paint stack at the pointer (${lastPoint ? `${Math.round(lastPoint.x)},${Math.round(lastPoint.y)}` : '?'}; front to back):`,
      stack(lastPoint),
    ];
    const { found, blocked } = await matchedRules(el);
    return [
      ...head,
      '',
      `Matching rules (${found.length}${found.length >= MAX_RULES ? '+' : ''}; ${blocked} stylesheet(s) unreadable even fetched):`,
      found.join('\n') || '  (none)',
      '',
      ...tail,
    ]
      .filter((line) => line !== '')
      .join('\n')
      .replace(/\n(?=Element:|Ancestors|Structure:|Markup:|Inline style|Computed style:|Matching rules|Paint stack|Shadows reaching)/g, '\n\n');
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

  /*
   * Freeze: while on, the page never sees the pointer move, enter or leave anything, so a hover
   * popup opened before freezing stays open as the pointer moves onto it. Caught on window in
   * the capture phase, before the page's handlers (non-bubbling enter/leave events still pass
   * through window on their way down). CSS :hover still follows the pointer: only script-driven
   * hovers freeze.
   */
  let frozen = false;
  const HOVER_EVENTS = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave'];
  const shield = (event) => {
    if (!frozen || own(event.target)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const setFrozen = (on) => {
    frozen = on;
    ui.hint.classList.toggle('frozen', on);
    $('.freeze-state').textContent = on ? 'frozen (F to unfreeze)' : 'freeze hovers';
  };

  /* By selector: the first match is reported (the count of matches noted), wherever it is */
  const askSelector = () => {
    ui.ask.hidden = false;
    ui.askInput.focus();
    ui.askInput.select();
  };
  const closeAsk = () => {
    ui.ask.hidden = true;
  };
  const captureSelector = async (selector) => {
    let matches;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      show('Selector report', `Not a valid CSS selector: ${selector}`);
      return;
    }
    const el = [...matches].find((node) => !own(node));
    if (!el) {
      show('Selector report', `No element matches: ${selector}`);
      return;
    }
    closeAsk();
    const r = el.getBoundingClientRect();
    // The paint stack is read at the element's centre (or its top-left corner when it has no size)
    lastPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const note = `  — by selector ${selector}${matches.length > 1 ? ` (first of ${matches.length})` : ''}${r.width && r.height ? '' : '; it has no size now (hidden or empty)'}`;
    const pending = report(el, note); // reads the page now, while a frozen popup is still open
    stopPicking();
    show('Selector report', await pending);
  };

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

  const capture = async (el) => {
    if (!el) return;
    const pending = report(el); // reads the page now, while a frozen popup is still open
    stopPicking();
    show('Element report', await pending);
  };
  const capturePage = () => show('Page report', pageReport());

  /* ---------- Catching the next dialog ---------- */

  const CATCH_KEY = 'se-inspector-catch';
  const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"], .newmodal, .ModalPosition, .waiting_dialog_container, [class*="Modal"], [class*="Dialog"]';
  let catcher = null;

  const armed = () => {
    try {
      return sessionStorage.getItem(CATCH_KEY) === '1';
    } catch {
      return false;
    }
  };

  const setArmed = (on) => {
    try {
      if (on) sessionStorage.setItem(CATCH_KEY, '1');
      else sessionStorage.removeItem(CATCH_KEY);
    } catch {} // storage blocked: the wait lasts for this page only
  };

  /** The outermost dialog-like box around a match, below <body>. */
  const outermost = (el) => {
    let top = el;
    for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (node.matches(DIALOG)) top = node;
    }
    return top;
  };

  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 20 && getComputedStyle(el).visibility !== 'hidden';
  };

  /** A dialog that a changed node opens, is part of, or holds. */
  const dialogOf = (node) => {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el || own(el)) return null;
    const hit = el.closest(DIALOG) || el.querySelector(DIALOG);
    return hit ? outermost(hit) : null;
  };

  const stopCatching = () => {
    catcher?.disconnect();
    catcher = null;
    setArmed(false);
    ui.wait.hidden = true;
  };

  const caught = (dialog) => {
    stopCatching();
    const at = () => {
      const r = dialog.getBoundingClientRect();
      lastPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      return report(dialog);
    };
    // Now, while it surely shows; a frame later its content may have filled in, if it's still up.
    const first = at();
    requestAnimationFrame(async () => show('Dialog report', await (dialog.isConnected && shown(dialog) ? at() : first)));
  };

  function startCatching() {
    stopPicking();
    ui.panel.hidden = true;
    if (!host.isConnected) (document.body || document.documentElement).append(host);
    setArmed(true);
    ui.wait.hidden = false;
    catcher?.disconnect();
    catcher = new MutationObserver((records) => {
      for (const record of records) {
        const nodes = record.type === 'attributes' ? [record.target] : record.addedNodes;
        for (const node of nodes) {
          const dialog = dialogOf(node);
          if (dialog && shown(dialog)) {
            caught(dialog);
            return;
          }
        }
      }
    });
    catcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'style', 'class'] });
  }

  const onMove = (event) => {
    shield(event);
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
    if (!ui.ask.hidden && event.composedPath().includes(ui.askInput)) {
      if (event.key === 'Escape') {
        block(event);
        closeAsk();
      }
      return; // typing a selector: the picker's keys don't apply
    }
    if (event.key === 'Escape') {
      block(event);
      close();
    } else if (!active) {
      return;
    } else if (event.key === ' ') {
      block(event);
      capture(current);
    } else if (event.key === 'f' || event.key === 'F') {
      block(event);
      setFrozen(!frozen);
    } else if (event.key === 's' || event.key === 'S') {
      block(event);
      askSelector();
    } else if (event.key === 'p' || event.key === 'P') {
      block(event);
      capturePage();
    } else if (event.key === 'd' || event.key === 'D') {
      block(event);
      startCatching();
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
    for (const type of HOVER_EVENTS) addEventListener(type, shield, true);
    addEventListener('scroll', reposition, true);
  };

  function stopPicking() {
    active = false;
    ui.hint.hidden = true;
    outline(null);
    removeEventListener('pointermove', onMove, true);
    for (const [type, fn] of PICK_EVENTS) removeEventListener(type, fn, true);
    for (const type of HOVER_EVENTS) removeEventListener(type, shield, true);
    removeEventListener('scroll', reposition, true);
    setFrozen(false);
  }

  function close() {
    stopPicking();
    stopCatching();
    closeAsk();
    ui.panel.hidden = true;
    host.remove();
  }

  ui.copy.addEventListener('click', async () => flash(ui.copy, (await copy(ui.text.value)) ? 'Copied' : 'Select and copy'));
  $('.again').addEventListener('click', startPicking);
  for (const button of root.querySelectorAll('.page')) button.addEventListener('click', capturePage);
  for (const button of root.querySelectorAll('.catch')) button.addEventListener('click', startCatching);
  $('.close').addEventListener('click', close);
  $('.ask-open').addEventListener('click', askSelector);
  $('.ask-cancel').addEventListener('click', closeAsk);
  ui.ask.addEventListener('submit', (event) => {
    event.preventDefault();
    const selector = ui.askInput.value.trim();
    if (selector) captureSelector(selector);
  });
  addEventListener('keydown', onKey, true);

  const open = () => {
    if (!host.isConnected) (document.body || document.documentElement).append(host);
    startPicking();
  };

  window[KEY] = {
    toggle() {
      if (host.isConnected && (active || catcher || !ui.panel.hidden)) close();
      else open();
    },
    destroy() {
      close();
      removeEventListener('keydown', onKey, true);
      delete window[KEY];
    },
  };
  // Armed before a reload: wait for the dialog from the page's first moment
  if (armed()) startCatching();
  else open();
})();
