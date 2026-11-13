/*
 * The address bar above web pages in the Steam window (Store, Community, profiles), paired with
 * client/browser/url-bar.css. Redesigned as one long field holding everything:
 *
 *   ( [back][forward] | [lock] favicon  Page title      | [copy][reload][open] )
 *   (                 |               host/path          |                      )
 *   (______________________________ load line __________________________________)
 *
 * Steam's parts stay and keep working: its URL div is laid, invisible, over the field (a click
 * copies the address and shows Steam's "Copied!"; our buttons sit above it), and its reload
 * button is hidden and driven by ours. Back / forward / title / loading / open-in-browser come
 * from the main window's browser view (MainWindowBrowserManager) and SteamClient; a control
 * whose API isn't there is hidden, and without a page title the field reads host over path.
 *
 * Finding the bar: its CSS module (URLBar, URLBarText, URL, ReloadButton, LockIcon, StatusIcon)
 * isn't in the theme's class map and its hashes change with client updates, so they come from
 *   1. Steam's webpack bundles: the module that defines URLBarReplacement and URLBarText; or
 *   2. the DOM: the leaf <div> holding the address (text starting with a scheme), whose parent
 *      is the field and grandparent the bar; the bar's other icon child is reload.
 * Parts get [data-se-urlbar="bar | text | url | reload | lock | status"], re-tagged in the same
 * task Steam redraws them (before paint, so its own reload and icons never flash).
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const KEY = '__seUrlBar';
  window[KEY]?.destroy?.();

  const ATTR = 'data-se-urlbar';
  const LOADING = 'data-se-loading';
  const PARTS = {
    URLBar: 'bar',
    URLBarText: 'text',
    URL: 'url',
    ReloadButton: 'reload',
    LockIcon: 'lock',
    StatusIcon: 'status',
  };
  const PAIR = /([A-Za-z_$][\w$]*):"([\w-]{5,40})"/g;
  const ADDRESS = "//div[not(*)][starts-with(normalize-space(.), 'http') or starts-with(normalize-space(.), 'steam:')]";
  const URL_PARTS = /^([a-z][\w+.-]*:\/\/)?([^/?#]*)(.*)$/i;
  const DOM_SCAN_MS = 1000; // the XPath fallback walks the whole window: at most once a second

  /* ---------- Finding Steam's parts ---------- */

  /** { URLBar: 'hash', ... } from the bundle that defines the address bar's classes. */
  const fromBundles = () =>
    SE.findModule('se-urlbar-classes', src => {
      if (!src.includes('URLBarReplacement:"') || !src.includes('URLBarText:"')) return null;
      const found = {};
      for (const [, name, hash] of src.matchAll(PAIR)) found[name] = hash;
      return found.URLBar && found.URL ? found : null;
    });

  const firstClass = el => el?.classList?.[0] || null; // Steam's module class comes first
  const hasIcon = el => el.tagName === 'svg' || !!el.querySelector('svg, img');

  /** Same shape as fromBundles(), read off the live bar. */
  let domScannedAt = -Infinity;
  const fromDom = () => {
    const now = performance.now();
    if (now - domScannedAt < DOM_SCAN_MS) return null;
    domScannedAt = now;
    let url;
    try {
      url = document.evaluate(ADDRESS, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch (_) {
      return null;
    }
    const text = url?.parentElement;
    const bar = text?.parentElement;
    if (!firstClass(url) || !firstClass(text) || !firstClass(bar)) return null;
    if (bar.getBoundingClientRect().height > 64) return null; // a strip, not some text block on a page
    const found = { URL: firstClass(url), URLBarText: firstClass(text), URLBar: firstClass(bar) };
    const reload = [...bar.children].find(el => el !== text && hasIcon(el));
    if (firstClass(reload)) found.ReloadButton = firstClass(reload);
    const [status, lock] = [...text.children].filter(el => el !== url && hasIcon(el)).map(firstClass);
    if (status) found.StatusIcon = status;
    if (lock) found.LockIcon = lock;
    found.fromDom = true;
    return found;
  };

  let map = null;
  let collections = null; // [[part, live HTMLCollection], ...] for the current map
  const tagged = new Set();

  const tag = () => {
    if (!map) {
      map = fromBundles() || fromDom();
      if (!map) return;
      collections = Object.entries(PARTS)
        .filter(([name]) => map[name])
        .map(([name, part]) => [part, document.getElementsByClassName(map[name])]);
    }
    for (const [part, nodes] of collections) {
      for (const node of nodes) {
        SE.mark(node, ATTR, part);
        tagged.add(node);
      }
    }
    for (const node of tagged) if (!node.isConnected) tagged.delete(node);
    // A DOM-read map that matches nothing any more (client update, rebuilt bar) is read again.
    if (!tagged.size && map.fromDom) map = collections = null;
    mount();
  };

  /* ---------- The main window's browser view ---------- */

  const views = () => {
    const b = SE.global('MainWindowBrowserManager')?.m_browser;
    return b ? [b, b.m_browserView, b.m_browser].filter(Boolean) : [];
  };
  const method = name => views().find(t => typeof t[name] === 'function');
  const invoke = name => {
    const target = method(name);
    try {
      target?.[name]();
    } catch (_) {}
  };
  /** The first non-empty value among the view's candidate fields. */
  const field = (...names) => {
    for (const target of views()) {
      for (const name of names) {
        const value = target[name];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return undefined;
  };
  const pageTitle = () => {
    const value = field('m_strTitle', 'm_title', 'm_strPageTitle');
    return typeof value === 'string' ? value.trim() : null; // null: the view reports no title
  };
  const openExternal = () => SE.global('SteamClient')?.System?.OpenInSystemBrowser;

  /* ---------- Our parts ---------- */

  const BUTTONS = [
    ['back', 'Back', 'start'],
    ['forward', 'Forward', 'start'],
    ['copy', 'Copy link', 'end'],
    ['reload', 'Reload', 'end'],
    ['external', 'Open in browser', 'end'],
  ];

  const build = () => {
    const group = side => {
      const el = document.createElement('div');
      el.className = 'se-urlbar-group';
      el.dataset.side = side;
      return el;
    };
    const nav = group('start');
    const tools = group('end');

    const buttons = {};
    for (const [action, label, side] of BUTTONS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'se-urlbar-btn';
      el.dataset.action = action;
      el.title = label;
      el.setAttribute('aria-label', label);
      (side === 'start' ? nav : tools).append(el);
      buttons[action] = el;
    }

    const identity = document.createElement('div');
    identity.className = 'se-urlbar-identity';
    identity.setAttribute('aria-hidden', 'true');
    identity.innerHTML =
      '<span class="se-urlbar-secure"></span>' +
      '<span class="se-urlbar-favicon"><img alt="" referrerpolicy="no-referrer"></span>' +
      '<span class="se-urlbar-lines"><b class="se-urlbar-title"></b><small class="se-urlbar-address"></small></span>';
    const favicon = identity.querySelector('.se-urlbar-favicon');
    const img = favicon.firstElementChild;
    img.addEventListener('load', () => favicon.setAttribute('data-loaded', ''));
    img.addEventListener('error', () => favicon.removeAttribute('data-loaded'));

    const progress = document.createElement('div');
    progress.className = 'se-urlbar-progress';
    progress.setAttribute('aria-hidden', 'true');

    return {
      nav,
      tools,
      identity,
      progress,
      buttons,
      badge: identity.querySelector('.se-urlbar-secure'),
      favicon,
      img,
      title: identity.querySelector('.se-urlbar-title'),
      address: identity.querySelector('.se-urlbar-address'),
    };
  };

  let ui = null;
  let ticker = 0;

  const mount = () => {
    const bar = [...tagged].find(n => n.getAttribute(ATTR) === 'bar');
    const text = bar?.querySelector(`[${ATTR}="text"]`);
    const url = text?.querySelector(`[${ATTR}="url"]`);
    if (!url) return void unmount();
    const reload = bar.querySelector(`[${ATTR}="reload"]`);
    if (ui?.text === text && ui.url === url && ui.nav.isConnected && ui.tools.isConnected && ui.identity.isConnected) {
      ui.reload = reload;
      return;
    }
    unmount();
    ui = { ...build(), text, url, reload, last: '' };
    text.prepend(ui.nav);
    text.append(ui.identity, ui.tools, ui.progress);
    ui.nav.addEventListener('click', onButton);
    ui.tools.addEventListener('click', onButton);
    urlObserver.observe(url, { characterData: true, childList: true, subtree: true });
    // Title, history and loading have no events to listen to; poll while the bar exists.
    ticker = setInterval(() => document.visibilityState === 'visible' && refresh(), 300);
    refresh();
  };

  const unmount = () => {
    if (!ui) return;
    clearInterval(ticker);
    urlObserver.disconnect();
    for (const el of [ui.nav, ui.tools, ui.identity, ui.progress]) el.remove();
    SE.unmark(ui.text, LOADING);
    ui = null;
  };

  /* ---------- State ---------- */

  const toggle = (el, prop, value) => {
    if (el[prop] !== value) el[prop] = value;
  };

  const refresh = () => {
    if (!ui) return;
    const href = ui.url.textContent.trim();
    const web = /^https?:/i.test(href);
    const title = pageTitle() || '';
    setLoading(href);

    toggle(ui.buttons.back, 'hidden', !method('GoBack'));
    toggle(ui.buttons.forward, 'hidden', !method('GoForward'));
    toggle(ui.buttons.back, 'disabled', field('m_bCanGoBack', 'm_canGoBack') === false);
    toggle(ui.buttons.forward, 'disabled', field('m_bCanGoForward', 'm_canGoForward') === false);
    toggle(ui.buttons.reload, 'hidden', !ui.reload && !method('Reload'));
    toggle(ui.buttons.external, 'hidden', !web || typeof openExternal() !== 'function');

    const key = `${href}\u0001${title}`;
    if (key === ui.last) return;
    ui.last = key;

    const [, , host = '', rest = ''] = href.match(URL_PARTS) || [];
    const titled = title && title !== href;
    ui.title.textContent = titled ? title : host || href;
    ui.address.textContent = titled ? host + rest : rest === '/' ? '' : rest;
    ui.identity.toggleAttribute('data-single', !ui.address.textContent);
    ui.badge.dataset.state = /^https:/i.test(href) ? 'secure' : web ? 'insecure' : '';

    const icon = web && host ? `https://${host}/favicon.ico` : '';
    if (ui.img.getAttribute('src') !== icon) {
      ui.favicon.removeAttribute('data-loaded');
      if (icon) ui.img.src = icon;
      else ui.img.removeAttribute('src');
    }
  };
  const urlObserver = new MutationObserver(() => refresh());

  /*
   * The load line. The view's own loading flag when it has one. Otherwise a navigation (the
   * address changes) runs it until the new page's title comes in (capped, for pages that never
   * report one), and a reload, whose title doesn't change, runs it for a short beat.
   */
  const LOAD_CAP_MS = 8000;
  const LOAD_BEAT_MS = 700;
  let load = { href: null, kind: '', title: null, since: -Infinity };
  const startLoad = kind => {
    load = { ...load, kind, title: pageTitle(), since: performance.now() };
  };
  const setLoading = href => {
    const flag = field('m_bLoading', 'm_bIsLoading', 'm_bPageLoading');
    let loading = flag;
    if (typeof flag !== 'boolean') {
      if (load.href !== null && href !== load.href) startLoad('nav');
      load.href = href;
      const age = performance.now() - load.since;
      const awaitingTitle = load.kind === 'nav' && load.title !== null && pageTitle() === load.title;
      loading = age < LOAD_BEAT_MS || (awaitingTitle && age < LOAD_CAP_MS);
    }
    if (loading) SE.mark(ui.text, LOADING);
    else SE.unmark(ui.text, LOADING);
  };

  /* ---------- Actions ---------- */

  const onButton = event => {
    const btn = event.target.closest('.se-urlbar-btn');
    if (!btn || btn.disabled || !ui) return;
    event.preventDefault();
    event.stopPropagation();
    switch (btn.dataset.action) {
      case 'back':
        invoke('GoBack');
        break;
      case 'forward':
        invoke('GoForward');
        break;
      case 'reload':
        startLoad('reload');
        if (ui.reload) ui.reload.click();
        else invoke('Reload');
        break;
      case 'external':
        try {
          openExternal()(ui.url.textContent.trim());
        } catch (_) {}
        break;
      case 'copy': {
        // Steam's URL div copies and shows "Copied!" at the click point; hand it the click.
        const r = btn.getBoundingClientRect();
        click = { at: performance.now(), copy: true }; // keyboard activation has no pointerdown
        ui.url.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        }));
        break;
      }
    }
    setTimeout(refresh, 150);
  };

  /*
   * "Copied!" (Steam's FloatingConfirmation) plays a one-second fade and is then left in the
   * page at opacity 0. Steam re-mounts it, at the old spot, when the browser view comes back
   * (Library, then Store) or reloads, so it replayed without a copy.
   *
   * A copy is a click, and Steam shows the confirmation in that click's handler. So one may play
   * only when it appears (or moves / changes) right after a click, and isn't a repeat of the last
   * one played, unless that click was a copy (the same address twice from the same spot, where
   * Steam leaves its element untouched and the existing one is replayed). Anything else is marked
   * done at once (display: none in url-bar.css); played ones are marked done after their fade.
   */
  const DONE = 'data-se-done';
  const FADE_MS = 1100;
  const CLICK_MS = 700; // room for an async clipboard write
  const confirmations = new Map(); // element -> { key, timer, observer }
  const keyOf = el => `${el.style.top}|${el.style.left}|${el.textContent}`;
  let lastKey = '';
  let playedAt = -Infinity;
  let click = { at: -Infinity, copy: false };

  // Only the URL div (laid over the identity) and our Copy button copy.
  const isCopy = target => !!target?.closest?.(`[${ATTR}="url"], .se-urlbar-btn[data-action="copy"]`);
  const onPointer = event => {
    click = { at: performance.now(), copy: isCopy(event.target) };
  };

  const play = (el, entry) => {
    clearTimeout(entry.timer);
    playedAt = performance.now();
    SE.unmark(el, DONE); // back from display: none restarts its CSS animation
    entry.timer = setTimeout(() => SE.mark(el, DONE), FADE_MS);
  };

  const decide = (el, entry) => {
    clearTimeout(entry.timer);
    entry.key = keyOf(el);
    const fresh = performance.now() - click.at < CLICK_MS && (entry.key !== lastKey || click.copy);
    if (!fresh) return SE.mark(el, DONE);
    lastKey = entry.key;
    click.at = -Infinity; // one click, one confirmation
    play(el, entry);
  };

  const onCopyClick = event => {
    if (!isCopy(event.target)) return;
    const clickedAt = performance.now();
    setTimeout(() => {
      if (playedAt >= clickedAt) return;
      const el = [...confirmations.keys()].pop();
      if (el?.isConnected) play(el, confirmations.get(el));
    }, 80);
  };

  const track = el => {
    if (confirmations.has(el)) return;
    const entry = { key: '', timer: 0, observer: null };
    entry.observer = new MutationObserver(() => {
      if (!el.isConnected) forget(el);
      else if (keyOf(el) !== entry.key) decide(el, entry);
    });
    entry.observer.observe(el, { attributeFilter: ['style'], characterData: true, childList: true, subtree: true });
    confirmations.set(el, entry);
    decide(el, entry);
  };

  const forget = el => {
    const entry = confirmations.get(el);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.observer.disconnect();
    confirmations.delete(el);
  };

  /* ---------- Wiring ---------- */

  // One observer for both jobs: Steam's confirmations come and go as direct children of <body>,
  // and the bar's parts are re-tagged in a microtask after any redraw (before paint).
  let queued = false;
  const observer = new MutationObserver(records => {
    for (const { target, addedNodes, removedNodes } of records) {
      if (target !== document.body) continue;
      for (const node of addedNodes) if (node.classList?.contains('FloatingConfirmation')) track(node);
      for (const node of removedNodes) forget(node);
    }
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      tag();
    });
  });

  for (const el of document.getElementsByClassName('FloatingConfirmation')) track(el);
  observer.observe(document.body, { childList: true, subtree: true });
  addEventListener('pointerdown', onPointer, true);
  addEventListener('click', onCopyClick, true);
  tag();

  window[KEY] = {
    destroy() {
      observer.disconnect();
      removeEventListener('pointerdown', onPointer, true);
      removeEventListener('click', onCopyClick, true);
      unmount();
      for (const el of [...confirmations.keys()]) {
        forget(el);
        SE.unmark(el, DONE);
      }
      for (const node of tagged) SE.unmark(node, ATTR);
      tagged.clear();
      delete window[KEY];
    },
  };
});
