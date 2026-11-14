/*
 * Toasts: the compact style.
 *
 * Part of client/toasts/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedToastsParts;
  if (!ns) return;
  const { esc, run } = SE;
  const { IN_GAME, describe, icon, keyOf, root, sane, shared, stillAfter, token } = ns;
  const { live } = ns;

  /*
   * Compact style: Steam's toast stays Steam's (its spot, size, timer and clicks). Once
   * it can be read, <html> gets its kind's accent and the toast an eyebrow with the kind's glyph;
   * toasts.css does the rest, with a countdown that runs on Steam's own --toast-duration.
   * Unreadable toasts are left exactly as Steam drew them.
   */
  const COMPACT_ATTR = 'data-se-tst-compact';
  const EYEBROW = 'se-tst-cmp-ey';

  function dressCompact() {
    if (!document.body) return;
    for (const el of document.body.querySelectorAll('*')) {
      const key = keyOf(el);
      if (key === null) continue;
      const info = run(() => describe(key, el));
      if (!info?.title) return; // not filled in yet: the next mutation tries again
      root.setAttribute(COMPACT_ATTR, info.accent);
      const content = el.querySelector('.Content');
      if (content && !content.querySelector(`:scope > .${EYEBROW}`)) {
        content.insertAdjacentHTML(
          'afterbegin',
          `<div class="${EYEBROW}">${icon(info.glyph, 'se-tst-cmp-gl')}<span>${esc(info.label)}</span></div>`,
        );
      }
      return; // one toast per window: the first hit is its root
    }
  }

  /*
   * Bottom centre for compact toasts (`--se-toasts-position: center`, the default). Steam has no
   * centre position: SharedJSContext stacks the toast windows in a corner (TopLeft, TopRight,
   * BottomLeft, BottomRight; in game the game picks it, with insets capped at a quarter of the
   * screen) and moves each one every frame it changes with this window's
   * SteamClient.Window.MoveTo(x, y, dpi). That call is wrapped here: Steam's y is kept (its
   * stacking and slide stay Steam's) and x is replaced with the centre.
   *
   * MoveTo works in Steam's units, not the window's: the scale between them is measured from
   * Steam's first move (where it asked for vs. where the window landed) and shared per surface,
   * so later toasts land centred at once. If MoveTo can't be wrapped, toasts stay in Steam's corner.
   */
  // v2: scales stored by 1.100–1.101 could have been read mid-move; they're ignored.
  const SCALE_KEY = `__seToastCentreScale.v2:${IN_GAME ? 'game' : 'desktop'}`;
  let centre = null; // { W, native, wrapped }

  function installCentre() {
    const W = window.SteamClient?.Window;
    if (!W || typeof W.MoveTo !== 'function') return;
    const native = W.MoveTo;
    const known = () => run(() => shared()[SCALE_KEY]) || null;
    const centreX = () => {
      const s = window.screen;
      return IN_GAME ? (s.width - window.outerWidth) / 2 : (s.availLeft ?? 0) + (s.availWidth - window.outerWidth) / 2;
    };
    const moveCentred = (k, y, dpi, rest) => native.call(W, Math.round(centreX() * k.x), y, dpi, ...rest);

    const offCentre = () => Math.abs(window.screenX - centreX()) > 12;
    // Hidden (Steam has finished with it) or not sized yet (a new overlay window reads 1×1):
    // nothing about its position can be learnt then.
    const measurable = () => window.outerWidth > 40 && window.screen.width > 200;

    // The scale from one move: Steam's units over where the window is. x and y must agree
    // (Steam scales both alike); a left-edge toast (x ≈ 0) uses y alone.
    function scaleFrom(sx, sy) {
      const kx = window.screenX ? sx / window.screenX : NaN;
      const ky = window.screenY ? sy / window.screenY : NaN;
      if (sane(kx) && sane(ky)) return Math.abs(kx - ky) / ky < 0.02 ? { x: kx, y: ky } : null;
      if (sane(ky) && Math.abs(sx) < 50) return { x: ky, y: ky };
      return null;
    }

    function save(k, dpi) {
      run(() => { shared()[SCALE_KEY] = { ...k, dpi }; });
    }

    let calibrating = false;
    async function calibrate(x, y, from, dpi) {
      calibrating = true;
      try {
        await stillAfter(from);
        if (!measurable()) return;
        // Steam keeps moving the window while it slides in: the window has settled where its
        // latest move put it, so that's the move to measure against, not the first.
        const sx = centre?.lastX ?? x;
        const sy = centre?.lastY ?? y;
        const k = scaleFrom(sx, sy);
        if (!k) return;
        save(k, dpi);
        if (centre) {
          const sent = Math.round(centreX() * k.x);
          moveCentred(k, centre.lastY ?? y, centre.lastDpi ?? dpi, centre.lastRest ?? []);
          verify(k, sent, centre.lastY ?? y, dpi);
        }
      } finally {
        calibrating = false;
      }
      return undefined;
    }

    /*
     * After a centred move: if the window still isn't centred, the stored scale is wrong (it
     * was read mid-move, or the display changed). The move just made gives a new one; if that
     * doesn't hold either, it's dropped and the next Steam move measures afresh.
     */
    async function verify(k, sent, y, dpi) {
      await stillAfter({ x: window.screenX, y: window.screenY });
      if (!measurable() || !offCentre() || !centre) return;
      const fixed = scaleFrom(sent, centre.lastY ?? y);
      if (fixed && Math.abs(fixed.x - k.x) > 0.02) {
        save(fixed, dpi);
        moveCentred(fixed, centre.lastY ?? y, centre.lastDpi ?? dpi, centre.lastRest ?? []);
      } else {
        run(() => { delete shared()[SCALE_KEY]; });
      }
    }

    const wrapped = function MoveTo(x, y, dpi, ...rest) {
      Object.assign(centre, { lastX: x, lastY: y, lastDpi: dpi, lastRest: rest });
      const k = known();
      if (k) {
        const sent = Math.round(centreX() * k.x);
        const out = moveCentred(k, y, dpi, rest);
        verify(k, sent, y, dpi);
        return out;
      }
      const from = { x: window.screenX, y: window.screenY };
      const out = native.call(this, x, y, dpi, ...rest);
      // Steam calls every frame while a toast slides in: one measurement at a time.
      if (!calibrating) calibrate(x, y, from, dpi);
      return out;
    };

    run(() => { W.MoveTo = wrapped; });
    if (W.MoveTo !== wrapped) run(() => Object.defineProperty(W, 'MoveTo', { value: wrapped, configurable: true, writable: true }));
    if (W.MoveTo !== wrapped) return;
    centre = { W, native, wrapped };

    // Steam may have placed this window before the theme loaded: centre it now if the scale is known.
    const k = known();
    if (k && Number.isFinite(k.dpi)) run(() => native.call(W, Math.round(centreX() * k.x), Math.round(window.screenY * k.y), k.dpi));
  }

  function uninstallCentre() {
    if (!centre) return;
    run(() => { if (centre.W.MoveTo === centre.wrapped) centre.W.MoveTo = centre.native; });
    centre = null;
  }

  function startCompact() {
    if (token('--se-toasts-position') !== 'corner') installCentre();
    // React may redraw the toast (a grouped message): the eyebrow is put back when it does.
    live.compactWatcher = SE.watch(dressCompact, { throttle: 60, characterData: true, ignore: SE.inside(`.${EYEBROW}`) });
    dressCompact();
  }

  Object.assign(ns, { COMPACT_ATTR, EYEBROW, startCompact, uninstallCentre });
});
