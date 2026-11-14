/*
 * Store bar redesign (every store page).
 *
 * Steam's store bar is React with hashed, per-deploy class names, so this tags its parts by
 * meaning instead (role="navigation", aria-expanded menu buttons, the search form, the
 * wishlist and cart links) and shared/nav.css styles those tags. Adds a Ctrl+K hint and
 * shortcut to the search field, hover-to-open menus, and widens centred page columns.
 *
 * Work is split by cost:
 *   tagBar()         cheap DOM tagging, after React renders (shared observer)
 *   measurePanels()  layout reads for an open menu, only while one is open
 *   placeSuggestions() only while the search field has focus (also on scroll)
 *   widenColumns()   a pruned walk of the page, debounced, and again on resize
 */
export default (dom) => {
  const { mark, el, scope, perFrame } = dom;
  const life = scope();

  const ATTR = 'data-se-nav';
  const PANEL_ATTR = 'data-se-p';
  const PAGE_GUTTER = 28; // shared/layout.css --se-page-gutter
  const PAGE_MAX = 1760; // shared/layout.css --se-page-max

  const tag = (node, role) => mark(node, ATTR, role);

  /** Deepest element that contains every node in the list. */
  const commonAncestor = (nodes) => {
    if (!nodes.length) return null;
    let candidate = nodes[0].parentElement;
    while (candidate && !nodes.every((node) => candidate.contains(node))) candidate = candidate.parentElement;
    return candidate;
  };

  const rgbaOf = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts.length > 3 ? parts[3] : parts.length ? 1 : 0 };
  };
  const isLight = ({ r, g, b, a }) => a > 0.6 && 0.2126 * r + 0.7152 * g + 0.0722 * b > 200;
  const isBlue = ({ r, g, b, a }) => a > 0.6 && b > 170 && b - r > 80;
  const hasFill = (style) => rgbaOf(style.backgroundColor).a > 0.05 || style.backgroundImage !== 'none';
  const isFloating = (node) => /^(fixed|absolute)$/.test(getComputedStyle(node).position);

  /* Inline !important wins over Steam's responsive-mode rules; every node touched is undone. */
  const forced = new Map(); // node -> Set of property names
  const forceStyles = (node, styles) => {
    for (const [name, value] of Object.entries(styles)) {
      if (node.style.getPropertyValue(name) !== value || node.style.getPropertyPriority(name) !== 'important') {
        node.style.setProperty(name, value, 'important');
      }
      if (!forced.has(node)) forced.set(node, new Set());
      forced.get(node).add(name);
    }
  };
  life.add(() => {
    for (const [node, names] of forced) for (const name of names) node.style.removeProperty(name);
    forced.clear();
  });

  /* ---------- Menus: icon per section ---------- */

  /*
   * Which duotone icon each menu gets (shared/nav.css draws it as a ::before mask, so React's
   * own children are never touched). Matched on the English label, then on Steam's fixed
   * section order for other languages.
   */
  const MENU_ICONS = [
    ['browse', /^browse/i],
    ['recommendations', /^recommend/i],
    ['categories', /^categor/i],
    ['hardware', /^hardware/i],
    ['play', /^ways to play/i],
    ['special', /^special/i],
  ];
  const iconFor = (item, index) => {
    const label = item.textContent.trim();
    return MENU_ICONS.find(([, pattern]) => pattern.test(label))?.[0] ?? MENU_ICONS[index]?.[0] ?? 'browse';
  };

  /* ---------- Wishlist and Cart ---------- */

  /*
   * Steam's own links carry inline SVGs and nested label/count boxes that fight any restyle,
   * so they're hidden and our own icon buttons sit beside them, mirroring each link's href,
   * label and live count.
   */
  const countOf = (link) =>
    [...link.querySelectorAll('span')].map((node) => node.textContent.trim()).find((text) => /\d/.test(text)) ?? '';

  const mirrorButton = (bar, kind, selector) => {
    const source = bar.querySelector(selector);
    let own = bar.querySelector(`[data-se-own="${kind}"]`);
    if (!source) {
      own?.remove();
      return;
    }
    tag(source, `${kind}-src`);
    if (!own) {
      own = el('a', { class: 'se-nav-btn', 'data-se-own': kind }, [
        el('span', { class: 'se-nav-btn__icon' }),
        el('span', { class: 'se-nav-btn__count' }),
      ]);
    }
    if (own.previousElementSibling !== source) source.after(own);
    const label = source.textContent.replace(/[\d,.\s]+$/, '').trim() || kind;
    const count = countOf(source);
    if (own.href !== source.href) own.href = source.href;
    const aria = count ? `${label} (${count})` : label;
    mark(own, 'aria-label', aria);
    mark(own, 'title', label);
    const bubble = own.lastChild;
    dom.setText(bubble, count);
    bubble.hidden = !count;
  };

  /* ---------- Menu panels ---------- */

  /*
   * Panel parts carry hashed classes, so each is recognised by what it is (shared/nav.css
   * styles data-se-p):
   *   heading  section titles ([role=heading])
   *   art      link tiles built on artwork (top sellers, categories, hardware, calendar)
   *   stage    one product photo floating on a coloured card (Hardware)
   *   row      a capsule image beside text (recommended games, search results)
   *   mosaic   small Browse rows with a faint capsule mosaic behind their text
   *   icon     glyph + label buttons (Ways to Play, Special Sections)
   *   chip     small filled text links (tag links); button: larger ones (Advanced Search)
   *   link     plain text links; label: Steam's white label boxes; cta: blue buttons
   *   pct/was  discount percent and struck-out price; badge: icon holder inside "icon"
   *   rule     dividers
   * Each element is classified once, after it has a layout box.
   */
  const classified = new WeakSet();

  /** null = not decidable yet (images still loading); try again on a later pass. */
  const classifyLink = (link, rect) => {
    // Wait only for images still loading; a loaded image with no box is hidden (Hardware tiles
    // carry a zero-width icon) and is left out, or the link would never be classified.
    const all = [...link.querySelectorAll('img')];
    if (all.some((img) => !img.complete)) return null;
    const imgs = all.filter((img) => img.getBoundingClientRect().width > 0);
    const img = imgs[0];
    const artLayer = img || [...link.querySelectorAll('div')].find((node) => getComputedStyle(node).backgroundImage.includes('url('));
    if (img && imgs.length <= 2) {
      const box = img.getBoundingClientRect();
      if (box.width < rect.width * 0.55 && box.left - rect.left < 16 && box.height > rect.height * 0.6) return 'row';
      if (imgs.length === 1 && rect.height >= 70 && box.width < rect.width * 0.8) return 'stage';
    }
    if (artLayer && rect.height >= 70) return 'art';
    if (link.querySelector('svg') && rect.height >= 56) return 'icon';
    if (imgs.length > 2) return 'mosaic';
    if (hasFill(getComputedStyle(link))) return rect.height < 34 ? 'chip' : 'button';
    return 'link';
  };

  const tagPanelNode = (node) => {
    if (classified.has(node)) return;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // not laid out yet (panel opening): try again later
    let role = '';
    if (node.matches('[role="heading"]')) role = 'heading';
    else if (node.matches('hr')) role = 'rule';
    else if (node.matches('a')) {
      role = classifyLink(node, rect);
      if (role === null) return;
    } else {
      const style = getComputedStyle(node);
      const bg = rgbaOf(style.backgroundColor);
      const text = node.textContent.trim();
      if (/^-\d+%$/.test(text) && node.children.length === 0) role = 'pct';
      else if (style.textDecorationLine.includes('line-through')) role = 'was';
      else if (isLight(bg) && text && node.closest('a')) role = 'label';
      else if (isBlue(bg) && text && rect.height < 64) role = 'cta';
      else if (node.matches('span, div') && node.parentElement?.matches(`a[${PANEL_ATTR}="icon"]`) && node.querySelector('svg') && !text) role = 'badge';
    }
    classified.add(node);
    if (role) node.setAttribute(PANEL_ATTR, role);
  };

  /** Links first, so their children see the link's role (badge, label). */
  const tagPanelTree = (root) => {
    root.querySelectorAll('a, [role="heading"], hr').forEach(tagPanelNode);
    root.querySelectorAll('div, span').forEach((node) => {
      if (node.childElementCount <= 3) tagPanelNode(node);
    });
  };

  /*
   * Steam gives the menu body a fixed height (main.css: height 250px) sized for its own
   * full-width layout. At the capsule's width the content wraps taller, so any box in the
   * panel shorter than its content may grow. The box Steam animates open/closed (inline height
   * + transition) is left alone so its slide still finishes and unmounts.
   */
  const unclipPanel = (panel) => {
    for (const box of [panel, ...panel.querySelectorAll(':scope > div, :scope > div > div, :scope > div > div > div')]) {
      if (box.style.transition) continue;
      if (box.scrollHeight <= box.clientHeight + 1 && box.style.getPropertyPriority('height') !== 'important') continue;
      forceStyles(box, { height: 'auto', 'max-height': 'none', 'min-height': '0px' });
    }
  };

  /*
   * The dropdown surface spans exactly the capsule: its offset in the band, and a content
   * width that adds up to the capsule's width once the surface's own padding and border are
   * counted (whatever box-sizing Steam gives it).
   */
  const px = (value) => parseFloat(value) || 0;
  const measurePanels = () => {
    const bar = document.querySelector(`[${ATTR}="bar"]`);
    const band = bar?.parentElement;
    const panels = band ? [...band.querySelectorAll(`:scope > [${ATTR}="panel"]`)].filter((panel) => panel.childElementCount) : [];
    if (!panels.length) return;
    const barBox = bar.getBoundingClientRect();
    if (!barBox.width) return;
    dom.setVar(band, '--se-nav-bar-x', `${Math.round(barBox.left - band.getBoundingClientRect().left)}px`);
    for (const panel of panels) {
      for (const surface of panel.querySelectorAll(':scope > div')) {
        const style = getComputedStyle(surface);
        const chrome = style.boxSizing === 'border-box'
          ? 0
          : px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
        dom.setVar(surface, '--se-nav-panel-w', `${Math.round(barBox.width - chrome)}px`);
      }
      tagPanelTree(panel);
      unclipPanel(panel);
    }
  };

  /* ---------- Search suggestions ---------- */

  /*
   * In Steam's responsive mode the box is pinned to the top of the window at full width; it is
   * pinned under the search field instead, at the field's width. Found by Steam's positioner
   * class (main.css), else structurally: the floating ancestor of the "Advanced Search" link,
   * looked for only while the field has focus, the only time the box exists.
   */
  const SUGGESTIONS_POSITION = '.ybF-Nf0hQ3w-';
  const searchForm = () => document.querySelector(`[${ATTR}="search-form"]`);

  const findSuggestions = (form) => {
    const byClass = document.querySelector(SUGGESTIONS_POSITION);
    if (byClass) return byClass;
    for (const link of document.querySelectorAll('a[href*="/search/"]')) {
      if (link.closest(`[${ATTR}="panel"]`) || form.contains(link)) continue;
      for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
        if (isFloating(node) && node.getBoundingClientRect().height > 100) return node;
      }
    }
    return null;
  };

  const placeSuggestions = () => {
    const form = searchForm();
    if (!form?.matches(':focus-within')) return;
    const box = findSuggestions(form);
    if (!box) return;
    const rect = form.getBoundingClientRect();
    const place = {
      '--se-sug-y': `${Math.round(rect.bottom + 8)}px`,
      '--se-sug-x': `${Math.round(rect.left)}px`,
      '--se-sug-w': `${Math.round(rect.width)}px`,
    };
    // shared/nav.css pins Steam's positioner from these; a box found only by its shape gets
    // the same placement inline.
    for (const [name, value] of Object.entries(place)) dom.setVar(document.documentElement, name, value);
    if (!box.matches(SUGGESTIONS_POSITION)) {
      forceStyles(box, {
        position: 'fixed',
        top: place['--se-sug-y'],
        left: place['--se-sug-x'],
        width: place['--se-sug-w'],
        right: 'auto',
        bottom: 'auto',
        'z-index': '30',
      });
    }
    // Steam's inner positioner, if any, just follows the box.
    for (const inner of box.querySelectorAll(':scope > div')) {
      if (isFloating(inner)) forceStyles(inner, { position: 'static' });
    }
    // The painted surface: the first box (itself or a few levels down) with a background.
    const surface = [box, ...box.querySelectorAll(':scope > div, :scope > div > div, :scope > div > div > div')]
      .find((node) => hasFill(getComputedStyle(node)));
    if (!surface) return;
    tag(surface, 'sug-box');
    tagPanelTree(surface);
    tagTextPrices(box);
    tagRecentArt(box);
  };

  /*
   * Recently viewed: Steam lists the games as text links joined by ", " (main.js Hie/Uie). Each
   * app link gets its small capsule as --se-recent-art, once the image has loaded, so the CSS can
   * lay them out as a strip of art tiles ([data-se-recent-art]); the name moves to the tooltip.
   * A link with no app id, or whose art fails, stays a text tile ([data-se-recent-art="none"]).
   */
  const RECENT_LINK = '.YmtQkHMBLzw- a.KKRHY2AccFo-';
  const recentArt = new Map(); // appid -> 'loading' | 'none' | url
  const capsuleURL = (appid) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_231x87.jpg`;
  const applyRecentArt = (link, appid) => {
    const art = recentArt.get(appid);
    if (!art || art === 'loading') return;
    if (art === 'none') {
      mark(link, 'data-se-recent-art', 'none');
      return;
    }
    dom.setVar(link, '--se-recent-art', `url("${art}")`);
    mark(link, 'data-se-recent-art');
  };
  const tagRecentArt = (box) => {
    for (const link of box.querySelectorAll(RECENT_LINK)) {
      const appid = link.pathname.match(/^\/app\/(\d+)/)?.[1];
      const name = dom.squash(link.textContent);
      if (name && link.title !== name) link.title = name;
      if (!appid) {
        mark(link, 'data-se-recent-art', 'none');
        continue;
      }
      if (!recentArt.has(appid)) {
        recentArt.set(appid, 'loading');
        const url = capsuleURL(appid);
        const img = new Image();
        img.onload = () => {
          recentArt.set(appid, url);
          scheduleSuggestions();
        };
        img.onerror = () => {
          recentArt.set(appid, 'none');
          scheduleSuggestions();
        };
        img.src = url;
      }
      applyRecentArt(link, appid);
    }
  };

  /*
   * A free game in the suggestions has no price widget: Steam writes "Free" as bare text in the
   * price line (main.js, #Price_Free), which the chip rules can't reach. Such a line becomes the
   * chip itself ([data-se-price-text]). A line holding a widget, or only Steam's &nbsp;
   * placeholder, is left alone.
   */
  const SUGGESTION_PRICE = '.QHiQcR8jG10- .FY3FS-llgYw-';
  const tagTextPrices = (box) => {
    for (const line of box.querySelectorAll(SUGGESTION_PRICE)) {
      const text = !line.childElementCount && line.textContent.replace(/\s+/g, '');
      if (text) mark(line, 'data-se-price-text');
      else if (line.hasAttribute('data-se-price-text')) line.removeAttribute('data-se-price-text');
    }
  };

  /* ---------- Page width ---------- */

  /*
   * Steam's store pages sit in a centred 940/1200px column, and not every page uses
   * .page_content (React pages have hashed wrappers). Any in-flow block at least 900px wide
   * and centred in a much wider parent is widened to the page width (CSS: [data-se-wide]).
   * The walk skips subtrees too narrow to hold such a column, hidden ones, and the theme's
   * own parts, so it measures dozens of boxes, not the whole page. Reads first, then writes.
   */
  const widenColumns = () => {
    if (!document.body) return;
    const target = Math.min(window.innerWidth - 2 * PAGE_GUTTER, PAGE_MAX);
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.matches(`[${ATTR}="shell"], [${ATTR}="band"], [data-se-own], script, style, svg, img`)) return NodeFilter.FILTER_REJECT;
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.width < 900) return NodeFilter.FILTER_REJECT;
        if (node.hasAttribute('data-se-wide') || rect.width >= target - 2) return NodeFilter.FILTER_SKIP;
        if (!node.matches('div, section, main, header, form, footer')) return NodeFilter.FILTER_SKIP;
        const parent = node.parentElement?.getBoundingClientRect();
        if (!parent || parent.width < rect.width + 80) return NodeFilter.FILTER_SKIP;
        if (Math.abs(rect.left - parent.left - (parent.right - rect.right)) > 3) return NodeFilter.FILTER_SKIP;
        return isFloating(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) found.push(walker.currentNode);
    for (const node of found) node.setAttribute('data-se-wide', '');
  };
  let columnTimer = 0;
  const scheduleColumns = () => {
    clearTimeout(columnTimer);
    columnTimer = setTimeout(widenColumns, 120);
  };
  life.add(() => {
    clearTimeout(columnTimer);
    document.querySelectorAll('[data-se-wide]').forEach((node) => node.removeAttribute('data-se-wide'));
  });

  /* ---------- Bar ---------- */

  /*
   * Steam's sticky wrappers around the band (fixed height, clip, and on some pages, like the
   * wishlist, the store's own strip colour). The direct parent is always one; above it, every
   * ancestor that holds nothing but the nav is one too. Walked once per band.
   */
  let shellsFor = null;
  const tagShells = (band) => {
    if (shellsFor === band) return;
    shellsFor = band;
    let node = band.parentElement;
    if (!node) return;
    tag(node, 'shell');
    for (let parent = node.parentElement; parent && parent !== document.body && parent.id !== 'StoreTemplate'; parent = node.parentElement) {
      const navOnly = [...parent.children].every((child) => child === node || !child.getBoundingClientRect().height);
      if (!navOnly) break;
      tag(parent, 'shell');
      node = parent;
    }
  };

  const tagBar = () => {
    const form = document.querySelector('form[role="search"]');
    const bar = form?.closest('[role="navigation"]');
    const band = bar?.parentElement;
    if (!band) return;

    tag(bar, 'bar');
    tag(band, 'band');
    tagShells(band);
    // Steam's dropdown panel renders as the band's other child; CSS clears its full-width wash.
    for (const child of band.children) {
      if (child !== bar && !child.contains(bar)) tag(child, 'panel');
    }

    const items = [...bar.querySelectorAll('button[aria-expanded]')];
    items.forEach((item, index) => {
      tag(item, 'item');
      mark(item, 'data-se-icon', iconFor(item, index));
    });
    tag(commonAncestor(items), 'menu');

    const input = form.querySelector('input[name="term"]');
    tag(form.parentElement, 'search');
    tag(form, 'search-form');
    tag(input, 'search-input');
    tag(form.querySelector('button[type="submit"]'), 'search-submit');

    mirrorButton(bar, 'wishlist', 'a[href*="/wishlist"]:not([data-se-own])');
    mirrorButton(bar, 'cart', 'a[href*="/cart"]:not([data-se-own])');
  };

  const update = () => {
    tagBar();
    measurePanels();
    placeSuggestions();
    scheduleColumns();
  };
  const scheduleUpdate = perFrame(update);
  const schedulePanels = perFrame(measurePanels);
  const scheduleSuggestions = perFrame(placeSuggestions);
  life.add(() => {
    scheduleUpdate.cancel();
    schedulePanels.cancel();
    scheduleSuggestions.cancel();
  });

  life.observe(update);
  life.listen(window, 'resize', () => {
    scheduleUpdate();
    scheduleColumns();
  });
  // Scrolling only moves the pinned suggestion box, and only while it is open.
  life.listen(window, 'scroll', scheduleSuggestions, { passive: true });
  life.listen(document, 'focusin', scheduleSuggestions, true);

  /* ---------- Menus open on hover ---------- */

  /*
   * Steam's own click handler toggles a section's panel, and the panel renders beside the bar
   * inside the same band, so: hovering an item for HOVER_OPEN_MS clicks it open; leaving bar +
   * panel for HOVER_CLOSE_MS clicks the open item again to close it. Click and keyboard still
   * work. While the pointer is in the menu, panel parts that have just been laid out (an
   * opening slide changes no DOM) are classified.
   */
  const HOVER_OPEN_MS = 120;
  const HOVER_CLOSE_MS = 280;
  let openTimer = 0;
  let closeTimer = 0;
  life.add(() => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  });

  const openItem = () => document.querySelector(`[${ATTR}="item"][aria-expanded="true"]`);
  const band = () => document.querySelector(`[${ATTR}="band"]`);
  const insideMenu = (node) => node instanceof Node && Boolean(band()?.contains(node));

  const scheduleClose = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!band()?.matches(':hover')) openItem()?.click();
    }, HOVER_CLOSE_MS);
  };

  life.listen(document, 'pointerover', (event) => {
    const target = event.target;
    const item = target instanceof Element ? target.closest(`[${ATTR}="item"]`) : null;
    clearTimeout(openTimer);
    if (insideMenu(target)) {
      clearTimeout(closeTimer);
      schedulePanels();
    } else if (openItem()) scheduleClose();
    if (item && item.getAttribute('aria-expanded') !== 'true') {
      openTimer = setTimeout(() => {
        if (item.isConnected && item.matches(':hover') && item.getAttribute('aria-expanded') !== 'true') item.click();
      }, HOVER_OPEN_MS);
    }
  }, true);
  // Leaving the window entirely also closes.
  life.listen(document, 'pointerout', (event) => {
    if (!event.relatedTarget && openItem()) scheduleClose();
  }, true);

  update();

  return () => {
    life.destroy();
    for (const name of ['--se-sug-x', '--se-sug-y', '--se-sug-w']) document.documentElement.style.removeProperty(name);
    document.querySelectorAll(`[data-se-own="wishlist"], [data-se-own="cart"]`).forEach((node) => node.remove());
    document.querySelectorAll(`[${ATTR}="band"]`).forEach((node) => node.style.removeProperty('--se-nav-bar-x'));
    document.querySelectorAll(`[${ATTR}="panel"] > div`).forEach((node) => node.style.removeProperty('--se-nav-panel-w'));
    document.querySelectorAll('[data-se-recent-art]').forEach((node) => node.style.removeProperty('--se-recent-art'));
    for (const name of [ATTR, PANEL_ATTR, 'data-se-icon', 'data-se-price-text', 'data-se-recent-art']) {
      document.querySelectorAll(`[${name}]`).forEach((node) => node.removeAttribute(name));
    }
  };
};
