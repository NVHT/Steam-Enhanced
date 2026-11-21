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
 *   menu()              the theme's one popup menu (.se-menu): rows of actions, keyboard and
 *                       outside clicks handled (the dock's menus, Settings)
 *   take(owner)         a ready popup window for content of the caller's own (the chat
 *                       flyout), given back with finish(entry)
 *   open / place / close  the windows themselves: open one at a rect of the main window, move
 *                       and size it, take it down
 *
 * While a browser page shows, one window is kept open ahead of need, so a popup shows at once.
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
  }

  function release(entry) {
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
  const LAYER_SHEET = /client\/shared\/popup-layer\.css(?:[?#]|$)/;

  /*
   * What a window gets before any popup takes it: the theme's base (client/loader.js tags its
   * links with data-se-file). Each panel adds its own sheets when it draws (panel({ sheets,
   * steam })): theme files by path, and Steam's own stylesheets when it renders a Steam
   * component.
   */
  const BASE_SHEETS = new Set(['core/font.css', 'core/tokens.css', 'core/icons-nav.css', 'core/icons-ui.css', 'client/shared/popup-layer.css']);
  const sheetsFor = ({ sheets = [], steam = false } = {}) => (href, link) => {
    const file = link.dataset.seFile;
    if (file) return BASE_SHEETS.has(file) || sheets.includes(file);
    return steam;
  };
  const restyleOn = (links, entry) => {
    for (const link of links) link.addEventListener('load', () => entry.owner?.restyled(), { once: true });
  };

  // The main window's stylesheets (those `test(href, link)` accepts) the popup doesn't have yet.
  function copyStyles(doc, test = () => true) {
    const have = new Set([...doc.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href));
    const added = [];
    for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (have.has(sheet.href) || !(LAYER_SHEET.test(sheet.href) || test(sheet.href, sheet))) continue;
      const copy = sheet.cloneNode(true);
      copy.href = sheet.href;
      doc.head.appendChild(copy);
      have.add(sheet.href);
      added.push(copy);
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

  /* ---------- Panels: the theme's own popups, drawn for real ---------- */

  // How long a window may take to mount before a panel gives up on it.
  const MOUNT_TIMEOUT_MS = 600;

  /*
   * Where a panel goes, from its content's box: rect gives { left, top } (or { right, top } to
   * hang it off its right edge), in main-window pixels, or is a function of (width, height)
   * returning one (a tip centred on what it points at); kept inside the main window, so a panel
   * by the window's foot opens upward.
   */
  function spot(at, width, height) {
    const rect = typeof at === 'function' ? at(width, height) : at;
    const left = rect.right != null ? rect.right - width : rect.left;
    return {
      left: Math.round(Math.max(0, Math.min(left, innerWidth - width))),
      top: Math.round(Math.max(0, Math.min(rect.top, innerHeight - height))),
      width: Math.ceil(width),
      height: Math.ceil(height),
    };
  }

  /*
   * A panel's content, kept fitted: build(container) puts it in and can return a cleanup (a
   * React root to unmount); content that grows after (data or images arriving) is measured
   * again and the panel re-placed by fit(content).
   */
  function mount(container, build, fit) {
    const cleanup = build(container);
    const content = container.firstElementChild;
    if (!content) return { content: null, dispose: () => cleanup?.() };
    const Observer = container.ownerDocument.defaultView.ResizeObserver;
    const observer = new Observer(() => fit(content));
    observer.observe(content);
    return {
      content,
      dispose() {
        observer.disconnect();
        cleanup?.();
      },
    };
  }

  // A panel in the main window itself: where no browser view is in the way, no window needed.
  function pagePanel() {
    const host = document.createElement('div');
    host.className = 'se-layer-page';
    let released = false;
    let shown = null;
    let rect = null;

    // Content can carry its own placement: measured, and moved from there to its spot. The
    // current shift is known, so one read gives where it sits unshifted (no reset, no relayout).
    const shift = { x: 0, y: 0 };
    function fit(content) {
      const at = content.getBoundingClientRect();
      const to = spot(rect, at.width, at.height);
      shift.x += to.left - at.left;
      shift.y += to.top - at.top;
      SE.cssVar(host, '--se-page-x', `${shift.x}px`);
      SE.cssVar(host, '--se-page-y', `${shift.y}px`);
    }

    return {
      show(nextRect, build) {
        if (released) return;
        rect = nextRect;
        shown?.dispose();
        host.replaceChildren();
        shift.x = 0;
        shift.y = 0;
        SE.cssVar(host, '--se-page-x', '0px');
        SE.cssVar(host, '--se-page-y', '0px');
        if (!host.isConnected) document.body.append(host);
        shown = mount(host, build, fit);
        if (shown.content) fit(shown.content);
      },
      release() {
        released = true;
        shown?.dispose();
        host.remove();
      },
      get released() {
        return released;
      },
    };
  }

  // A panel in a popup window (the spare, when one is ready): above a browser page's view.
  function windowPanel(options) {
    const view = { win: null, pending: null, shown: null, released: false, check: 0 };

    // To the window's corner, wherever its own placement or Steam's container put it: one read
    // against the shift already applied, then the writes.
    const shift = { x: 0, y: 0 };
    function fit(content) {
      const win = view.win;
      if (view.released || !win?.wrap || gone(win)) return;
      const at = content.getBoundingClientRect();
      shift.x -= at.left;
      shift.y -= at.top;
      SE.cssVar(win.wrap, '--se-wrap-x', `${shift.x}px`);
      SE.cssVar(win.wrap, '--se-wrap-y', `${shift.y}px`);
      place(win, spot(view.pending.rect, at.width, at.height));
    }

    function draw() {
      const win = view.win;
      if (view.released || !win?.wrap || !view.pending) return;
      if (gone(win)) {
        release();
        return;
      }
      const wrap = win.wrap;
      restyleOn(copyStyles(win.doc, sheetsFor(options)), win);
      copyRootState(win.doc);
      SE.cssVar(wrap, '--se-wrap-w', `${innerWidth}px`);
      SE.cssVar(wrap, '--se-wrap-h', `${innerHeight}px`);
      view.shown?.dispose();
      wrap.replaceChildren();
      shift.x = 0;
      shift.y = 0;
      SE.cssVar(wrap, '--se-wrap-x', '0px');
      SE.cssVar(wrap, '--se-wrap-y', '0px');
      view.shown = mount(wrap, view.pending.build, fit);
      if (view.shown.content) fit(view.shown.content);
    }

    function release() {
      if (view.released) return;
      view.released = true;
      clearTimeout(view.check);
      view.shown?.dispose();
      const win = view.win;
      view.win = null;
      if (win) finish(win);
    }

    // Styles arriving change the content's size: measured again, not built again.
    const restyled = () => view.shown?.content && fit(view.shown.content);
    const owner = { mounted: draw, restyled, lost: release };
    view.win = take(owner);
    if (!view.win) return null;

    /*
     * A window Steam never draws (a spare it dropped before it mounted) would hold the panel
     * forever: one that hasn't mounted in time is swapped once for a new one.
     */
    let retried = false;
    const check = () => {
      if (view.released || view.win?.wrap) return;
      const dead = view.win;
      if (retried) {
        release();
        return;
      }
      retried = true;
      view.win = null;
      if (dead) {
        dead.owner = null;
        finish(dead);
      }
      view.win = take(owner);
      if (!view.win) {
        release();
        return;
      }
      view.check = setTimeout(check, MOUNT_TIMEOUT_MS);
    };
    view.check = setTimeout(check, MOUNT_TIMEOUT_MS);
    return {
      show(rect, build) {
        view.pending = { rect, build };
        draw();
      },
      release,
      get released() {
        return view.released;
      },
    };
  }

  // React, a root to render into and a synchronous commit (shared with the native tooltips).
  function renderer() {
    const native = window.__seNativeTooltips?.resolve();
    const flushSync = native?.DOM?.flushSync || findRuntime()?.flushSync;
    return native?.React && native.DOM?.createRoot && flushSync ? { ...native, flushSync } : null;
  }

  // React's tag for a context provider's fiber (React 18 and 19 alike).
  const CONTEXT_PROVIDER = 10;

  /*
   * The element wrapped in the context providers above `fiber`, nearest innermost: a Steam
   * component rendered away from its place still reads what it would there (the focus tree,
   * the library's stores), which some need to render at all.
   */
  function inContext(React, element, fiber) {
    let wrapped = element;
    for (let node = fiber; node; node = node.return) {
      if (node.tag === CONTEXT_PROVIDER && node.type && node.memoizedProps) {
        wrapped = React.createElement(node.type, { value: node.memoizedProps.value }, wrapped);
      }
    }
    return wrapped;
  }

  /*
   * A panel build that renders a Steam component into the container, committed at once so the
   * panel measures it; the root goes with the panel. `from`, a node in Steam's tree, lends the
   * component its contexts. Null without React.
   */
  function react(Component, props, from) {
    const draw = renderer();
    if (!draw || typeof Component !== 'function') return null;
    return (container) => {
      const root = draw.DOM.createRoot(container);
      const element = draw.React.createElement(Component, props);
      const fiber = from && SE.fiber(from);
      draw.flushSync(() => root.render(fiber ? inContext(draw.React, element, fiber) : element));
      return () => root.unmount();
    };
  }

  /*
   * A panel for the theme's own popup: in a popup window over a browser page, in the page
   * elsewhere. show(rect, build) empties it, lets build(container) put the content in (in the
   * container's own document; it may return a cleanup), and places it by spot(), again as the
   * content grows. options: { sheets: the theme files the content is styled by, steam: true
   * when it renders a Steam component (Steam's own stylesheets then go in too) }; a window gets
   * only those beside the base. Returns { show(), release(), released }, or null if a window was
   * needed and none could open.
   */
  const panel = (options) => (SE.browserShown() ? windowPanel(options) : pagePanel());

  /*
   * A hover panel, the one way the theme opens a card or tip on hover. The caller matches its
   * own targets (each reads its own events) and hands over the node and what to draw; this
   * waits out the hover intent, opens one panel, and lets it go when the pointer leaves.
   *   sheets, steam    the panel's options (see panel())
   *   delay            the intent delay token, --se-hover-delay by default
   *   place(node, data)  where the panel goes: a rect for show()
   *   draw(node, data)   the build for show(); fallback(node, data) if drawing it throws
   *   blocked()        called when no panel can open (a browser page without a window): the
   *                    caller lets Steam's own hover show
   * Returns { enter(node, data), left(event), leave(), node }.
   */
  function hover({ sheets, steam = false, delay, place: where, draw, fallback, blocked }) {
    let open = null;
    const intent = SE.hoverIntent(show, delay);

    function show(node, data) {
      if (!node.isConnected) return;
      open = panel({ sheets, steam });
      if (!open) {
        blocked?.();
        return;
      }
      const rect = where(node, data);
      try {
        open.show(rect, draw(node, data));
      } catch (error) {
        if (!fallback) throw error;
        open.show(rect, fallback(node, data));
      }
    }

    function leave() {
      intent.cancel();
      open?.release();
      open = null;
    }

    return {
      enter: (node, data) => intent.enter(node, data),
      left: (event) => intent.left(event),
      leave,
      get node() {
        return intent.node;
      },
    };
  }

  /*
   * The theme's one popup menu, in a panel (above a browser page too). One open at a time.
   *   items   rows [{ label, run, state, icon, art, hint, keys, time, unread, external, checked,
   *           danger }],
   *           with { heading, action }, { separator: true } and { note } between them. state
   *           goes on the row as data-state with an <i> before the label for the caller's mark
   *           (the dock's status dots); icon is a mask token's name (a duotone icon); art an
   *           image URL drawn as a tile at the row's start (the icon in the tile while it's
   *           missing or fails; '' for the icon's tile alone); hint a line under the label;
   *           keys a shortcut at the row's end; time a short time at the row's end; unread
   *           (true / false) an accent dot after it; external a mark that the row opens
   *           outside; checked (true / false) makes the row an on/off setting, with a switch at
   *           its end (role menuitemcheckbox) that run flips; current marks the row for the
   *           page you're on (aria-current, the accent); danger draws a destroying row in
   *           red. A heading's action ({ label, run }) is a small button at its end:
   *           run(handle), the menu staying open. A note is a line of plain text (an empty
   *           state).
   *   at      where: a spot for show() ({ left | right, top }, or a function of the menu's size)
   *   options { sheets: the theme files styling the marks; owner: the button that opened it,
   *           whose press never counts as an outside click (it toggles) and which carries
   *           aria-expanded while the menu is open }
   * Keys: in the page the rows take focus; a popup window never does, so the main window hears
   * Up / Down / Enter / Escape and moves a highlight ([data-se-active]) through the rows. A menu
   * opens with no row lit: only the pointer or the keys light one.
   * Returns { release(), update(items), released }, or null when no panel could open. update
   * draws new rows in place, without the opening animation.
   */
  let openMenu = null;

  /*
   * Closing a click popup when the pointer leaves it, as Steam's own rail menus do (the bell's,
   * the avatar's): leaving its button or the popup closes it after a moment, unless the pointer
   * has gone into the other one meanwhile. watch(el) adds an element (the popup, in whatever
   * document it is drawn); dispose() stops it all.
   */
  const LEAVE_MS = 300;
  function leaveCloser(owner, close) {
    let timer = 0;
    const watched = [];
    const stay = () => {
      clearTimeout(timer);
      timer = 0;
    };
    const leave = () => {
      stay();
      timer = setTimeout(close, LEAVE_MS);
    };
    const watch = (el) => {
      if (!el) return;
      el.addEventListener('mouseenter', stay);
      el.addEventListener('mouseleave', leave);
      watched.push(el);
    };
    watch(owner);
    return {
      watch,
      dispose() {
        stay();
        for (const el of watched.splice(0)) {
          el.removeEventListener('mouseenter', stay);
          el.removeEventListener('mouseleave', leave);
        }
      },
    };
  }

  /*
   * Closing with the menus' animation (se-menu-out on [data-se-closing], core/motion.css): marks
   * the element, waits out the animation it then has, and calls done. With none (reduced motion,
   * or nothing styled for it) done runs at once and this returns null; otherwise it returns a
   * cancel() that keeps the element open and never calls done. The wait runs on this window's
   * clock, not the element's: a popup window can be gone or asleep before it ends.
   */
  function closeWith(el, done) {
    const view = el?.ownerDocument?.defaultView;
    if (!view) {
      done();
      return null;
    }
    el.setAttribute('data-se-closing', '');
    const style = view.getComputedStyle(el);
    const ms = style.animationName === 'none' ? 0 : parseFloat(style.animationDuration) * 1000;
    if (!(ms > 0)) {
      el.removeAttribute('data-se-closing');
      done();
      return null;
    }
    let timer = setTimeout(() => {
      timer = 0;
      done();
    }, ms);
    return () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      el.removeAttribute('data-se-closing');
    };
  }

  function menu(items, at, { sheets = [], owner = null, closeOnLeave = false } = {}) {
    openMenu?.release();
    const open = panel({ sheets });
    if (!open) return null;
    let rows = [];
    let shown = null;
    let index = -1;
    let released = false;
    const leaving = closeOnLeave && owner ? leaveCloser(owner, () => handle.release()) : null;

    const highlight = (next) => {
      if (!rows.length) return;
      index = (next + rows.length) % rows.length;
      const row = rows[index];
      if (row.ownerDocument === document) row.focus({ preventScroll: true });
      else rows.forEach((other) => SE.attr(other, 'data-se-active', other === row ? '' : null));
    };

    const onKey = (event) => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (event.key === 'Escape') handle.release();
      // Nothing is lit until the keys are used: Down starts at the first row, Up at the last
      else if (step) highlight(index < 0 && step < 0 ? rows.length - 1 : index + step);
      // In the page the focused row hears Enter itself; in a popup window it's pressed here.
      else if ((event.key === 'Enter' || event.key === ' ') && rows[index]?.ownerDocument !== document) {
        rows[index]?.click();
      } else return;
      event.preventDefault();
    };

    const onPointer = (event) => {
      const target = event.target;
      if (shown?.contains(target) || owner?.contains(target)) return;
      handle.release();
    };

    const handle = {
      release() {
        if (released) return;
        released = true;
        if (openMenu === handle) openMenu = null;
        removeEventListener('keydown', onKey, true);
        removeEventListener('pointerdown', onPointer, true);
        leaving?.dispose();
        SE.attr(owner, 'aria-expanded', 'false');
        // In the page it fades out first; a popup window's goes at once (its spare is reused)
        if (shown?.ownerDocument === document) closeWith(shown, () => open.release());
        else open.release();
      },
      update(next) {
        if (handle.released) return;
        index = -1;
        open.show(at, build(next, true));
      },
      get released() {
        return released || open.released;
      },
    };

    const build = (entries, redraw = false) => (container) => {
      const doc = container.ownerDocument;
      const list = doc.createElement('div');
      list.className = 'se-menu';
      list.setAttribute('role', 'menu');
      if (redraw) list.setAttribute('data-se-redraw', '');
      const part = (tag, className, text) => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text != null) node.textContent = text;
        return node;
      };
      const maskIcon = (token) => {
        const icon = part('span', 'se-menu-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.style.setProperty('--se-menu-mask', `var(${token})`);
        return icon;
      };
      for (const item of entries) {
        if (item.heading) {
          const heading = part('div', 'se-menu-heading', item.heading);
          if (item.action) {
            const action = part('button', 'se-menu-heading-action', item.action.label);
            action.type = 'button';
            action.addEventListener('click', (event) => {
              event.stopPropagation();
              item.action.run(handle);
            });
            heading.append(action);
          }
          list.append(heading);
          continue;
        }
        if (item.note) {
          list.append(part('div', 'se-menu-note', item.note));
          continue;
        }
        if (item.separator) {
          const line = part('div', 'se-menu-sep');
          line.setAttribute('role', 'separator');
          list.append(line);
          continue;
        }
        const row = doc.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'menuitem');
        if (item.current) row.setAttribute('aria-current', 'page');
        // A row that destroys something (Delete): in red (popup-layer.css)
        if (item.danger) row.setAttribute('data-danger', '');
        if (item.state) {
          row.dataset.state = item.state;
          row.append(doc.createElement('i'));
        }
        if (item.art != null) {
          const tile = part('span', 'se-menu-art');
          tile.setAttribute('aria-hidden', 'true');
          if (item.icon) tile.append(maskIcon(item.icon));
          if (item.art) {
            const img = doc.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.decoding = 'async';
            img.addEventListener('error', () => img.remove(), { once: true });
            img.src = item.art;
            tile.append(img);
          }
          row.append(tile);
        } else if (item.icon) {
          row.append(maskIcon(item.icon));
        }
        const text = part('span', 'se-menu-text');
        text.append(part('span', 'se-menu-label', item.label));
        if (item.hint) {
          row.toggleAttribute('data-hint', true);
          text.append(part('span', 'se-menu-hint', item.hint));
        }
        row.append(text);
        if (item.keys) row.append(part('kbd', 'se-menu-keys', item.keys));
        if (item.time) row.append(part('span', 'se-menu-time', item.time));
        if (typeof item.unread === 'boolean') {
          row.toggleAttribute('data-unread', item.unread);
          row.append(part('span', 'se-menu-dot'));
        }
        if (item.external) {
          const mark = part('span', 'se-menu-external');
          mark.setAttribute('aria-hidden', 'true');
          row.append(mark);
        }
        if (typeof item.checked === 'boolean') {
          row.setAttribute('role', 'menuitemcheckbox');
          row.setAttribute('aria-checked', String(item.checked));
          const toggle = part('span', 'se-menu-switch');
          toggle.setAttribute('aria-hidden', 'true');
          row.append(toggle);
        }
        row.addEventListener('click', (event) => {
          event.stopPropagation();
          handle.release();
          item.run();
        });
        list.append(row);
      }
      container.append(list);
      shown = list;
      leaving?.watch(list);
      rows = [...list.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')];
    };

    open.show(at, build(items));

    openMenu = handle;
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onPointer, true);
    SE.attr(owner, 'aria-expanded', 'true');
    return handle;
  }

  /*
   * Where a rail button's popup goes: 12px off the button's side (the gap every menu keeps from
   * its button, --se-space-3; the Steam menu's under the Steam button too), side-aligned with it. A page
   * icon's (top) lines its top up with the button's; one at the rail's foot (`foot`) lines its
   * bottom up with the button's, so it grows up. Kept inside the window. Steam's own rail menus
   * (the bell's, the avatar's) open the same way (client/header/menu/placement.js).
   */
  const menuGap = () => SE.px('--se-space-3');
  function besideRail(button, { foot = false } = {}) {
    const rect = button.getBoundingClientRect();
    const edge = SE.px('--se-space-2');
    return (width, height) => ({
      left: rect.right + menuGap(),
      top: Math.max(edge, Math.min(foot ? rect.bottom - height : rect.top, innerHeight - height - edge)),
    });
  }

  const layer = {
    besideRail,
    runtime: findRuntime,
    missing: () => missing,
    place,
    copyStyles,
    menuOpen,
    panel,
    hover,
    menu,
    closeWith,
    leaveCloser,
    react,
    take,
    finish,
    // How long a panel can wait for its window before the layer gives up on it (one retry).
    giveUpMs: MOUNT_TIMEOUT_MS * 2,
    destroy() {
      openMenu?.release();
      removeEventListener('pointermove', trackOrigin, { capture: true });
      warmWatcher.disconnect();
      cool();
      delete SE.layer;
    },
  };
  SE.layer = layer;
})(window.__se);
