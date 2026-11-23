/*
 * The popup layer: native popup windows over the main window.
 *
 * A Store or Community page is a native browser view laid over the main window, so nothing in
 * the window's own DOM can draw above it, whatever its z-index. A context-menu popup window
 * (Steam's menu manager with bForcePopup) is a window of its own and draws above it. This is
 * the one place the theme makes those windows:
 *
 *   panel()             the theme's own popup (a card, a menu, a tip), drawn for real: in a
 *                       popup window over a browser page, in the page elsewhere
 *   hover()             a panel opened by hovering something: hover intent, one panel at a
 *                       time, released on leave (the friend card, Playing now, the title-bar tips)
 *   menu()              the theme's action menu (.se-menu): rows of actions, keyboard and
 *                       outside clicks handled (the dock's menus, Settings); controls that
 *                       stay open use the settings menu (client/shared/menu.js)
 *   take(owner)         a ready popup window for content of the caller's own (the chat
 *                       flyout), given back with finish(entry)
 *   open / place / close  the windows themselves: open one at a rect of the main window, move
 *                       and size it, take it down
 *
 * While a browser page shows, one window is kept open ahead of need, so a popup shows at once.
 *
 * Split by section, listed in this order in client/loader.js: this file (Steam's runtime, the
 * windows, their styles, the spare), popup-layer-panel.js (panel, react, hover) and
 * popup-layer-menu.js (menu, leaveCloser, closeWith, besideRail; it publishes SE.layer). The
 * parts share window.__seLayerParts until then.
 *
 * Popup windows are titled "... Menu", so client/loader.js gives them the theme's `all` files
 * (tokens, client/shared/popup-layer.css) without a cover.
 */
((SE) => {
  if (SE.layer) return;
  const { run } = SE;

  let runtime = null;
  let missing = '';
  // Every layer window's handle, closed ones too: Steam can keep pointing its active menu at
  // a layer window after it closes, and a layer window never counts as an open menu.
  const handles = new WeakSet();

  // React, this window's context-menu manager and ReactDOM's createPortal/flushSync.
  function findRuntime() {
    if (runtime) return runtime;
    const found = {};
    const complete = () =>
      found.React && found.manager && found.createPortal && found.flushSync ? { ...found } : null;
    const inspect = (exp) => {
      const values = [exp];
      try {
        values.push(...Object.values(exp || {}));
      } catch {}
      for (const value of values) {
        if (typeof value?.createPortal === 'function') found.createPortal ||= value.createPortal;
        if (typeof value?.flushSync === 'function') found.flushSync ||= value.flushSync;
        if (!found.React && typeof value?.createElement === 'function' && typeof value?.useState === 'function') {
          found.React = value;
        }
        if (!found.manager) {
          const candidate = run(() => value?.m_mapManagers?.get(window));
          if (typeof candidate?.CreateContextMenuInstance === 'function') found.manager = candidate;
        }
      }
    };

    for (const req of SE.requires()) {
      for (const module of Object.values(req.c || {})) inspect(module?.exports);
    }
    runtime =
      complete() ||
      SE.findModule('popup-layer:runtime', (source, id, req) => {
        if (
          (!found.manager && source.includes('GetContextMenuManagerFromWindow') && source.includes('m_mapManagers')) ||
          (!found.React && source.includes('createElement') && source.includes('useState') && source.includes('Fragment'))
        ) {
          run(() => inspect(req(id)));
        }
        if ((!found.createPortal || !found.flushSync) && source.includes('.createPortal')) {
          for (const call of source.matchAll(/([\w$]+)\.createPortal\b/g)) {
            inspect(SE.importOf(source, call[1], req));
            if (found.createPortal && found.flushSync) break;
          }
          if (!found.createPortal || !found.flushSync) run(() => inspect(req(id)));
        }
        return complete();
      });

    missing = runtime
      ? ''
      : [
          !found.React && 'React',
          !found.manager && 'context-menu manager',
          !found.createPortal && 'ReactDOM portal',
          !found.flushSync && 'ReactDOM synchronous commit',
        ]
          .filter(Boolean)
          .join(', ');
    return runtime;
  }

  /* ---------- Popup windows ---------- */

  // A window waiting for a popup: 1 px, transparent, at the main window's corner.
  const PARKED = { left: 0, top: 0, width: 1, height: 1 };
  // Steam's EWindowBringToFront: raise a window without taking focus (sp.js)
  const BRING_TO_FRONT_NO_FOCUS = 2;

  /*
   * Where the main window's page starts on screen. A pointer event carries it exactly
   * (screenX - clientX); before the first one, the window's own edge stands in. Kept from a
   * passive capture listener, removed by destroy().
   */
  const pageOrigin = { x: NaN, y: NaN };
  const trackOrigin = (event) => {
    pageOrigin.x = event.screenX - event.clientX;
    pageOrigin.y = event.screenY - event.clientY;
  };
  addEventListener('pointermove', trackOrigin, { capture: true, passive: true });
  const originX = () => (Number.isFinite(pageOrigin.x) ? pageOrigin.x : screenX);
  const originY = () => (Number.isFinite(pageOrigin.y) ? pageOrigin.y : screenY);

  /*
   * PositionWindowRelative places a window by Steam's idea of the main window's corner and by
   * the window's outer edge, while what lines up is the page's corner and the popup's content
   * (a popup window can carry an unseen strip above its content). The difference is measured,
   * taken off every placement, and kept, so the next launch starts right:
   *   - once, from the first window: its content's corner from its outer and inner sizes;
   *   - exactly, whenever the pointer is over a popup: screen - client is the content corner.
   */
  const OFFSET_KEY = 'se-layer-offset-v2'; // v1 was learned against a placement that ignored it
  const OFFSET_LIMIT = 120;
  const SETTLE_MS = 150;
  const offset = { x: 0, y: 0, measured: false };
  try {
    localStorage.removeItem('se-layer-offset'); // v1, never read again
    const saved = JSON.parse(localStorage.getItem(OFFSET_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) Object.assign(offset, saved, { measured: true });
  } catch {}

  // Moves the offset by the error between where a window's content is and where it belongs.
  function correct(entry, contentX, contentY) {
    if (entry.closed || entry.rect === PARKED) return;
    const dx = contentX - (originX() + entry.rect.left);
    const dy = contentY - (originY() + entry.rect.top);
    // Past a frame's size it is a window kept on screen, not an offset.
    if (Math.abs(dx) > OFFSET_LIMIT || Math.abs(dy) > OFFSET_LIMIT) return;
    offset.measured = true;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const clamp = (value) => Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, value));
    offset.x = clamp(offset.x + dx);
    offset.y = clamp(offset.y + dy);
    try {
      localStorage.setItem(OFFSET_KEY, JSON.stringify({ x: offset.x, y: offset.y }));
    } catch {}
    // Through place(): its size signal makes Steam re-place the window from the anchor too.
    place(entry, entry.rect);
  }

  function measure(entry) {
    const win = entry.doc?.defaultView;
    if (!win || offset.measured) return;
    // Two frames: the move lands on the next one.
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        if (offset.measured) return;
        // Side borders split evenly; the rest of the height sits above the content.
        const side = Math.max(0, (win.outerWidth - win.innerWidth) / 2);
        const above = Math.max(0, win.outerHeight - win.innerHeight - side);
        correct(entry, win.screenX + side, win.screenY + above);
      })
    );
  }

  // The pointer over a popup gives its content's corner exactly.
  function trackPointer(entry) {
    entry.doc.addEventListener(
      'pointermove',
      (event) => {
        // A move is still landing: the window's corner isn't where it will be.
        if (entry.details || performance.now() - (entry.movedAt || 0) < SETTLE_MS) return;
        correct(entry, event.screenX - event.clientX, event.screenY - event.clientY);
      },
      { passive: true }
    );
  }

  // Steam places a popup by its anchor; the theme places it exactly, in main-window pixels.
  function position(entry) {
    if (entry.closed) return;
    const nativeWindow = entry.doc?.defaultView?.SteamClient?.Window;
    if (typeof nativeWindow?.PositionWindowRelative !== 'function') return;
    entry.details ||= Promise.resolve().then(() => window.SteamClient.Window.GetWindowRestoreDetails());
    entry.details
      .then((details) => {
        entry.details = null;
        if (entry.closed) return;
        const { left, top, width, height } = entry.rect;
        nativeWindow.PositionWindowRelative(details, left - offset.x, top - offset.y, width, height);
        entry.movedAt = performance.now();
        measure(entry);
      })
      .catch(() => {
        entry.details = null;
      });
  }

  // Steam re-places its menus on its own (resize, focus): routed through position() instead.
  function pinPositioner(entry) {
    if (entry.restorePositioner) return;
    for (let fiber = SE.fiber(entry.node); fiber; fiber = fiber.return) {
      const instance = fiber.stateNode;
      if (typeof instance?.PositionMenu !== 'function' || typeof instance?.PositionPopupWindow !== 'function') {
        continue;
      }
      const own = Object.getOwnPropertyDescriptor(instance, 'PositionPopupWindow');
      if (own && !own.configurable) return;
      const pinned = () => position(entry);
      Object.defineProperty(instance, 'PositionPopupWindow', { configurable: true, writable: true, value: pinned });
      entry.restorePositioner = () => {
        if (instance.PositionPopupWindow !== pinned) return;
        if (own) Object.defineProperty(instance, 'PositionPopupWindow', own);
        else delete instance.PositionPopupWindow;
      };
      return;
    }
  }

  function place(entry, rect) {
    if (entry.closed) return;
    entry.rect = rect;
    if (!entry.node) return;
    entry.placed = true;
    pinPositioner(entry);
    const root = entry.doc.documentElement;
    SE.cssVar(root, '--se-layer-width', `${rect.width}px`);
    SE.cssVar(root, '--se-layer-height', `${rect.height}px`);
    // Steam sizes the menu element inline from its first layout; inline styles need !important.
    const menuElement = entry.handle?.m_element;
    if (menuElement?.style) {
      menuElement.style.setProperty('width', `${rect.width}px`, 'important');
      menuElement.style.setProperty('height', `${rect.height}px`, 'important');
    }
    // A change inside the popup is what makes Steam re-measure (and re-place) its window.
    entry.sizeSignal.replaceChildren(entry.doc.createTextNode(''));
    entry.movedAt = performance.now();
    position(entry);
    placed.add(entry);
    raise(entry);
  }

  /*
   * Over a browser page the page can stack over a layer window, always-on-top or not: one opened
   * ahead (warm()) keeps the stacking it had then, and the browser view takes focus back ~200 ms
   * after a click in the main window opens a popup. So a window is raised as it's placed and
   * again whenever the main window loses focus, without taking focus itself (Steam's own
   * no-focus menus: k_EWindowBringToFrontWithoutForcingOS, 2).
   */
  const placed = new Set();
  function raise(entry) {
    run(() => entry.doc.defaultView.SteamClient.Window.BringToFront(BRING_TO_FRONT_NO_FOCUS));
  }
  const raisePlaced = () => {
    for (const entry of placed) if (!entry.closed && entry.rect !== PARKED) raise(entry);
  };
  addEventListener('blur', raisePlaced);

  function release(entry) {
    placed.delete(entry);
    run(() => entry.restorePositioner?.());
    entry.restorePositioner = null;
    run(() => entry.doc?.defaultView?.removeEventListener('beforeunload', entry.onHide));
    entry.anchor.remove();
  }

  function close(entry) {
    if (!entry?.anchor || entry.closed) return; // never opened, or already down
    entry.closed = true;
    release(entry);
    run(() => entry.handle?.Hide());
    run(() => entry.manager.ReleaseHiddenMenu?.(entry.handle));
  }

  // A Steam menu is showing: a layer window opened now would close it. One whose window has
  // gone is not, whatever its flag still says.
  function menuOpen() {
    const active = runtime?.manager.ActiveMenu;
    if (!active?.visible || handles.has(active)) return false;
    const element = active.m_element;
    if (!element) return true;
    return element.isConnected && !element.ownerDocument?.defaultView?.closed;
  }

  /*
   * options:
   *   rect       { left, top, width, height } in main-window pixels
   *   className  the popup element's, beside se-layer-popup
   *   title      the window's, ending in "Menu"
   *   onMount    (node, entry) once the window's document is up
   *   onClose    (entry) when Steam or the window closes it (not on close())
   *   entry      an object of the caller's to fill in
   * Returns the entry, or null if Steam's popup machinery is missing or a menu is open.
   */
  function open(options) {
    const rt = findRuntime();
    if (!rt || menuOpen()) return null;

    const entry = Object.assign(options.entry || {}, {
      rect: options.rect,
      manager: rt.manager,
      handle: null,
      doc: null,
      node: null,
      closed: false,
      placed: false,
      restorePositioner: null,
      details: null,
    });

    entry.anchor = document.createElement('span');
    entry.anchor.className = 'se-layer-anchor';
    entry.anchor.setAttribute('aria-hidden', 'true');
    // Steam can place the window from its anchor itself: the anchor carries the correction too.
    entry.anchor.getBoundingClientRect = () =>
      new DOMRect(entry.rect.left - offset.x, entry.rect.top - offset.y, 0, 0);
    document.body.appendChild(entry.anchor);

    entry.onHide = () => {
      if (entry.closed) return;
      entry.closed = true;
      release(entry);
      queueMicrotask(() => run(() => entry.manager.ReleaseHiddenMenu?.(entry.handle)));
      options.onClose?.(entry);
    };

    const mount = (node) => {
      if (!node || entry.closed || entry.node) return;
      entry.node = node;
      entry.doc = node.ownerDocument;
      entry.doc.documentElement.classList.add('se-layer-document');
      entry.sizeSignal = entry.doc.createElement('span');
      entry.sizeSignal.hidden = true;
      node.append(entry.sizeSignal);
      entry.doc.defaultView.addEventListener('beforeunload', entry.onHide);
      options.onMount?.(node, entry);
      if (!entry.placed) place(entry, entry.rect);
    };

    try {
      entry.handle = rt.manager.CreateContextMenuInstance(
        rt.React.createElement('div', { ref: mount }),
        entry.anchor,
        undefined,
        undefined,
        {
          bForcePopup: true,
          // Above the main window even after a click in it raises that window over this one.
          bAlwaysOnTop: true,
          bStandalone: true,
          bDisableMouseOverlay: true,
          bOverlapHorizontal: true,
          bOverlapVertical: true,
          bFitToWindow: false,
          bShiftToFitWindow: false,
          bGrowToElementWidth: false,
          bSkipFocusWhenReady: true,
          bNoFocusWhenShown: true,
          strClassName: ['se-layer-popup', options.className].filter(Boolean).join(' '),
          // "... Menu": client/loader.js gives menu windows the theme's `all` files, uncovered
          title: options.title || 'Steam Enhanced Popup Layer Menu',
        }
      );
      const { handle } = entry;
      if (
        typeof handle?.Show !== 'function' ||
        typeof handle?.Hide !== 'function' ||
        typeof handle?.SetOnHideCallback !== 'function'
      ) {
        throw new Error('No native context-popup handle');
      }
      // A layer window never takes focus, and losing focus is no reason for it to close.
      handle.TakeFocus = () => {};
      const cancel = handle.OnCancel;
      if (typeof cancel === 'function') {
        handle.OnCancel = function (...args) {
          return entry.closed ? cancel.apply(this, args) : undefined;
        };
      }
      handle.SetOnHideCallback(entry.onHide);
      handles.add(handle);
      handle.Show();
      return entry;
    } catch {
      close(entry);
      return null;
    }
  }

  /* ---------- Window content: styles and page state ---------- */

  // The layer's own sheet always goes in: the window can be up before its loader has run.
  const LAYER_SHEET = 'client/shared/popup-layer.css';

  /*
   * What a window gets before any popup takes it: the theme's base. Each panel adds its own
   * sheets when it draws (panel({ sheets, steam })): theme files by path, and Steam's own
   * stylesheets when it renders a Steam component.
   */
  const BASE_SHEETS = new Set(['core/font.css', 'core/tokens.css', 'core/icons-nav.css', 'core/icons-ui.css', LAYER_SHEET]);
  const sheetsFor = ({ sheets = [], steam = false } = {}) => (file) => (file ? BASE_SHEETS.has(file) || sheets.includes(file) : steam);
  const restyleOn = (links, entry) => {
    for (const link of links) link.addEventListener('load', () => entry.owner?.restyled(), { once: true });
  };

  /*
   * The main window's stylesheets (those `test(file)` accepts; file is null for Steam's own) the
   * popup doesn't have yet, each as a <link> of its own: Steam's links, then theme files from the
   * loader's list (client/loader.js imports them through one <style>, after Steam's), so the
   * theme wins ties there as it does here.
   */
  function copyStyles(doc, test = () => true) {
    const have = new Set([
      ...[...doc.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
      ...(doc.defaultView?.__seClient?.sheets?.values() || []), // its own loader's
    ]);
    const wanted = [
      ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({ file: null, href: link.href })),
      ...[...(window.__seClient?.sheets || [])].map(([file, href]) => ({ file, href })),
    ];
    const added = [];
    for (const { file, href } of wanted) {
      if (have.has(href) || !(file === LAYER_SHEET || test(file))) continue;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      doc.head.appendChild(link);
      have.add(href);
      added.push(link);
    }
    return added;
  }

  // The main window's root and body state that theme selectors are written against. A reused
  // window drops what it copied last time and the main window no longer has.
  const copiedState = new WeakMap();

  function copyRootState(doc) {
    const before = copiedState.get(doc) || new Map();
    const after = new Map();
    for (const [from, to] of [
      [document.documentElement, doc.documentElement],
      [document.body, doc.body],
    ]) {
      const classes = new Set(from.classList);
      const attrs = new Map(
        [...from.attributes].filter((attr) => attr.name.startsWith('data-se-')).map((attr) => [attr.name, attr.value])
      );
      const last = before.get(to);
      for (const name of last?.classes || []) if (!classes.has(name)) to.classList.remove(name);
      for (const name of last?.attrs.keys() || []) if (!attrs.has(name)) to.removeAttribute(name);
      for (const name of classes) to.classList.add(name);
      for (const [name, value] of attrs) to.setAttribute(name, value);
      after.set(to, { classes, attrs });
    }
    copiedState.set(doc, after);
  }

  /* ---------- Windows: opened ahead, used once ---------- */

  /*
   * Opening a window is the slow part of a popup (a new document, the theme's loader, every
   * stylesheet laid out), so one window is opened ahead while a browser page shows (warm()),
   * parked (1 px, transparent, at the main window's corner) until a popup takes it.
   *
   * Each window serves one popup and closes with it: a window shrunk back to its parking spot
   * and moved out again stays down, though Steam still counts it as showing. The next spare
   * opens once no window is in use, as Steam can close a menu window when another opens.
   *
   * Only one is kept, never refilled in a loop: a pool refilling itself against Steam closing
   * its windows would open windows without end. A spare Steam closes while unused stops
   * warming until the next browser page (cool()); popups then open windows on demand.
   */
  let spare = null;
  let warming = true;
  let inUse = 0;

  function openWindow() {
    return open({
      rect: PARKED,
      onMount(node, entry) {
        // The base only; a panel brings its own sheets. Content measured before its styles
        // load is the wrong size: measured again as each loads.
        restyleOn(copyStyles(node.ownerDocument, sheetsFor()), entry);
        trackPointer(entry);
        entry.wrap = node.ownerDocument.createElement('div');
        entry.wrap.className = 'se-layer-wrap';
        node.append(entry.wrap);
        entry.owner?.mounted();
      },
      onClose(entry) {
        if (spare === entry) {
          spare = null;
          warming = false;
        }
        entry.owner?.lost();
      },
    });
  }

  function warm() {
    if (spare || !warming || inUse) return;
    inUse++; // nothing reenters while this one opens
    const entry = openWindow();
    inUse--;
    if (entry && !entry.closed) spare = entry;
  }

  function cool() {
    warming = true;
    const entry = spare;
    spare = null;
    close(entry);
  }

  // Steam can take a menu window down without telling its hide callback.
  const gone = (entry) => entry.closed || !entry.doc?.defaultView || entry.doc.defaultView.closed;

  // The ready window for `owner`, or a new one when there is none (or it died unseen).
  function take(owner) {
    // A parked spare must still be showing; a window still mounting has no doc yet.
    if (spare?.doc && (gone(spare) || spare.handle?.visible === false)) {
      close(spare);
      spare = null;
    }
    // Counted in use before a new window opens: Steam can close another window while this
    // one shows, and the spare that would open then must wait.
    inUse++;
    const entry = spare || openWindow();
    if (entry === spare) spare = null;
    if (!entry) {
      inUse--;
      return null;
    }
    entry.owner = owner;
    return entry;
  }

  // A popup is done with its window: it closes, and a fresh spare opens once none is in use.
  function finish(entry) {
    if (!entry || entry.finished) return;
    entry.finished = true;
    entry.owner = null;
    inUse = Math.max(0, inUse - 1);
    close(entry);
    warm();
  }

  // Warm while a browser page shows (the only place windows are needed), cool when it goes.
  let warmed = false;
  const warmWatcher = SE.watch(
    () => {
      const browser = SE.browserShown();
      if (browser === warmed) return;
      warmed = browser;
      if (browser) warm();
      else cool();
    },
    { throttle: 250 }
  );

  window.__seLayerParts = {
    findRuntime,
    missing: () => missing,
    place,
    copyStyles,
    copyRootState,
    sheetsFor,
    restyleOn,
    menuOpen,
    gone,
    take,
    finish,
    // The base's own teardown; the menu part's destroy() adds the rest.
    destroy() {
      removeEventListener('pointermove', trackOrigin, { capture: true });
      removeEventListener('blur', raisePlaced);
      warmWatcher.disconnect();
      cool();
    },
  };
})(window.__se);
