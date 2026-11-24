/*
 * Continues popup-layer.js (see its header): panels, the theme's own popups drawn for real
 * (panel, react), and hover panels.
 */
((SE) => {
  const ns = window.__seLayerParts;
  if (!ns || SE.layer) return;
  const { findRuntime, place, copyStyles, copyRootState, sheetsFor, restyleOn, gone, take, finish } = ns;

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
   *   off()            true while the caller's setting turns the cards off: nothing opens
   * Returns { enter(node, data), left(event), leave(), node }.
   */
  function hover({ sheets, steam = false, delay, place: where, draw, fallback, blocked, off }) {
    let open = null;
    const intent = SE.hoverIntent(show, delay);

    function show(node, data) {
      if (!node.isConnected) return;
      // A panel still showing (hover moved straight to another node) goes before its successor
      open?.release();
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
      enter: (node, data) => {
        if (!off?.()) intent.enter(node, data);
      },
      left: (event) => intent.left(event),
      leave,
      get node() {
        return intent.node;
      },
    };
  }

  Object.assign(ns, { panel, react, hover, MOUNT_TIMEOUT_MS });
})(window.__se);
