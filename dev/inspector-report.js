/*
 * Element picker, part 1 of 2 (dev/inspector.js names what it does), loaded just before it by
 * core/core.js: the plain-text reports, an element's (report(el, note, point): its page, theme
 * files, ancestors, outline, markup, styles, matching rules and the paint stack at `point`) and
 * the whole page's (pageReport()), on window.__seInspectorReport.
 */
(() => {
  if (window.__seInspectorReport) return;

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

  /* ---------- Describing elements ---------- */

  const short = (value, max = 80) => (value.length > max ? `${value.slice(0, max)}…` : value);

  // The picker's own UI (inspector.js's <se-inspector> host; its shadow root stays hidden)
  const own = (node) => Boolean(node.closest?.('se-inspector'));

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
   * hints beside the <script>s Millennium injects) fetch nothing new, so they're counted on a
   * line of their own rather than listing every injected script twice. A file really injected
   * twice (two <script>s, two sheets) is flagged instead of silently repeated. Stylesheets come
   * as the @imports of the theme's one sheet per window (#se-sheets, [data-se-sheets]).
   */
  const LOADS = 'script[src], link[rel~="stylesheet"][href]';
  /*
   * Whether this window's timers, frames and idle callbacks run at all: each is asked once when
   * the picker loads, and the report says which have come back since (a window that stopped
   * revealing, client/loader.js, waits on all three).
   */
  const probe = { timeout: false, frame: false, idle: false };
  setTimeout(() => (probe.timeout = true), 0);
  requestAnimationFrame(() => (probe.frame = true));
  window.requestIdleCallback?.(() => (probe.idle = true), { timeout: 500 });
  const probeState = () =>
    Object.entries(probe).map(([kind, ran]) => `${kind} ${ran ? 'runs' : 'never ran'}`).join(', ');

  // The popup layer (client/shared/popup-layer*.js), which draws flyouts and menus over a browser page
  const layerState = () => {
    const SE = window.__se;
    const layer = SE?.layer;
    if (!layer) return 'Popup layer: (none in this window)';
    let found = 'not checked';
    try {
      found = layer.runtime() ? 'Steam runtime found' : `Steam runtime missing (${layer.missing() || '?'})`;
    } catch (err) {
      found = `runtime check failed (${err?.message || err})`;
    }
    let menu = '?';
    try {
      menu = layer.menuOpen() ? 'a Steam menu counts as open' : 'no Steam menu open';
    } catch {}
    const browser = SE.browserShown ? (SE.browserShown() ? 'browser page shown' : 'no browser page') : '';
    let last = '';
    try {
      last = `; last window ${layer.lastOpen?.() || '?'}; parked window ${layer.spareRect?.() || '?'}`;
    } catch {}
    return `Popup layer: ${found}; ${menu}; ${browser}${last}`;
  };

  /*
   * Steam's open popup windows (g_PopupManager), each with its title, its size and place on the
   * screen and whether it lies over this window's left edge (where the rail is): an unseen window
   * there takes the rail's clicks
   */
  const popupsState = () => {
    const SE = window.__se;
    const seen = new Set();
    const lines = [];
    const railRight = screenX + 80;
    for (const owner of SE?.owners?.() || [window]) {
      let popups;
      try {
        popups = owner.g_PopupManager?.m_mapPopups;
      } catch {
        continue;
      }
      if (!popups?.values || seen.has(popups)) continue;
      seen.add(popups);
      for (const popup of popups.values()) {
        try {
          const win = popup.window;
          if (!win || win === window || win.closed) continue;
          const x = win.screenX;
          const y = win.screenY;
          const w = win.outerWidth;
          const h = win.outerHeight;
          const overRail = x < railRight && x + w > screenX && y < screenY + outerHeight && y + h > screenY;
          const state = win.document.visibilityState === 'hidden' ? ', hidden' : '';
          lines.push(`  "${win.document.title || popup.m_strName || '?'}" ${w}×${h} at ${x},${y}${state}${overRail ? ', OVER THE RAIL' : ''}`);
        } catch {}
      }
    }
    return lines.length ? ['Popup windows:', ...lines].join('\n') : 'Popup windows: none';
  };

  // The rail's page icons (client/navigation/nav-rail.js) and the startup Library pass
  // (client/library/start-on-page.js), in the main window
  const railState = () => {
    const rail = window.__seRailNav?.why;
    const start = window.__seStartOnPage?.state;
    if (!rail && !start) return null;
    let text = 'Rail: ';
    try {
      text += rail ? rail() : '(none)';
    } catch (err) {
      text += `check failed (${err?.message || err})`;
    }
    return [text, start ? `Start on a page: ${start}` : '', popupsState()].filter(Boolean).join('\n');
  };

  // The loader's wait (client/loader.js): a window that never got [data-se-styled] names what held it
  const loaderState = () => {
    const client = window.__seClient;
    if (!client) return `Loader: (none in this window); ${probeState()}`;
    const styled = document.documentElement.hasAttribute('data-se-styled') ? 'revealed' : 'not revealed';
    const waiting = client.waiting?.size ? [...client.waiting].join(', ') : 'nothing';
    return `Loader: ${styled}; waiting on ${waiting}; last step ${client.step || 'loading files'}; ${probeState()}`;
  };

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
  const report = async (el, note = '', lastPoint = null) => {
    const rect = el.getBoundingClientRect();
    const inline = el.getAttribute('style');
    const before = styles(el, '::before');
    const after = styles(el, '::after');
    const head = [
      'Steam Enhanced element report',
      `Page: ${document.title || '(untitled)'} — ${location.href}`,
      `Root classes: html.${[...document.documentElement.classList].join('.') || '(none)'}`,
      loaderState(),
      layerState(),
      ...[railState()].filter(Boolean),
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
      loaderState(),
      layerState(),
      ...[railState()].filter(Boolean),
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

  window.__seInspectorReport = { report, pageReport };
})();
