/*
 * Toasts: where the toast window goes, wrapping Steam's moves and sizes.
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { mark, run, unmark } = SE;
  const { BOX, IN_GAME, SURFACE, isStage } = ns;
  const { live } = ns;

  /* ---------- Placement ---------- */

  /*
   * Steam sizes and places the toast window itself (its corner). The window is moved to the
   * bottom centre of the work area and sized to the tray plus its shadow. The standard
   * window API is tried first, then SteamClient.Window; whichever lands is remembered.
   * If Steam already gives the window the whole work area, the tray is placed by CSS alone.
   */
  /*
   * Ways to move the window, tried in turn until one lands (then remembered).
   * Steam's MoveTo applies the display scale itself (asked for x, it lands at x × 1.5 on a
   * 150% display), and that isn't documented: the first move is measured, and the ratio it
   * shows is divided out from then on. Resizing uses the standard API, which Steam allows.
   */
  const scWindow = () => window.SteamClient?.Window;
  const dpr = () => window.devicePixelRatio || 1;
  const sane = (r) => Number.isFinite(r) && r > 0.2 && r < 5;

  // The ratio is the same for every toast window, so it's kept in Steam's shared context
  // (this window's opener) once measured; later toasts land in one move.
  const shared = () => run(() => window.opener) || window;

  // v3: measured with the display's dpi and a strict x/y check (earlier values may be off).
  const MOVE_RATIO = `__seToastMoveRatio.v3:${SURFACE}`;
  const getRatio = () => run(() => shared()[MOVE_RATIO]) || null;
  const setRatio = (r) => run(() => { shared()[MOVE_RATIO] = r; });
  // Steam passes the display's scale with every move; the theme's own moves do the same.
  const DPI = () => window.devicePixelRatio || 1;

  // Steam moves the window a moment after MoveTo returns: wait until it really has moved
  // (Steam's own small corner adjustments don't count).
  const MOVED = 40;
  const movedFrom = (from) => Math.abs(window.screenX - from.x) > MOVED || Math.abs(window.screenY - from.y) > MOVED;
  async function settle(from, t, ms = 1200) {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      await sleep(50);
      if (landed(t) || movedFrom(from)) {
        await sleep(80); // let it finish
        return;
      }
    }
  }

  // A new toast window opens mid-screen and Steam then moves it to its corner: wait for that
  // to finish (position unchanged for a few checks), so Steam doesn't undo our move.
  async function steamPlaced(ms = 1500) {
    let last = { x: window.screenX, y: window.screenY };
    let still = 0;
    for (const end = Date.now() + ms; Date.now() < end && still < 4; ) {
      await sleep(60);
      const now = { x: window.screenX, y: window.screenY };
      still = now.x === last.x && now.y === last.y ? still + 1 : 0;
      last = now;
    }
  }

  const MOVERS = [
    // Through Steam's own moves (see holdSpot); skipped while MoveTo isn't wrapped.
    { name: "Steam's moves", steam: true, hold: true, move: (t) => spotMove(t) },
    {
      name: 'SteamClient MoveTo',
      steam: true,
      async move(t) {
        const W = scWindow();
        const known = getRatio();
        const from = { x: window.screenX, y: window.screenY };
        if (known) {
          W.MoveTo(Math.round(t.x / known.x), Math.round(t.y / known.y), DPI());
          return settle(from, t);
        }
        W.MoveTo(t.x, t.y, DPI());
        await settle(from, t);
        if (landed(t)) {
          setRatio({ x: 1, y: 1 });
          return undefined;
        }
        if (!movedFrom(from)) return undefined; // didn't move
        const r = { x: window.screenX / t.x, y: window.screenY / t.y };
        if (!sane(r.x) || !sane(r.y)) return undefined;
        const again = { x: window.screenX, y: window.screenY };
        W.MoveTo(Math.round(t.x / r.x), Math.round(t.y / r.y), DPI());
        await settle(again, t);
        if (landed(t)) setRatio(r);
        return undefined;
      },
    },
    {
      name: 'window.moveTo',
      move(t) {
        const from = { x: window.screenX, y: window.screenY };
        window.moveTo(t.x, t.y);
        return settle(from, t, 600);
      },
    },
  ];

  let placeWarned = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function applyMove(i, t) {
    await Promise.resolve(run(() => MOVERS[i].move(t))).catch(() => {});
  }

  /*
   * Steam sizes its toast window to its own toast and undoes a standard resize. Its ResizeTo
   * holds, but applies the display scale itself (asked for 544 it gives 816 at 150%): the first
   * resize is measured and that ratio divided out, as for MoveTo, and shared with later toasts.
   */
  const sized = (t) => Math.abs(window.innerWidth - t.w) <= 4 && Math.abs(window.innerHeight - t.h) <= 4;
  const SIZE_RATIO = `__seToastSizeRatio:${SURFACE}`;
  const getSizeRatio = () => run(() => shared()[SIZE_RATIO]) || null;
  const setSizeRatio = (r) => run(() => { shared()[SIZE_RATIO] = r; });
  async function resized(from, t, ms = 900) {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      await sleep(50);
      if (sized(t) || Math.abs(window.innerWidth - from.w) > 4 || Math.abs(window.innerHeight - from.h) > 4) {
        await sleep(60);
        return;
      }
    }
  }
  const SIZERS = [
    {
      name: 'SteamClient ResizeTo',
      steam: true,
      async size(t) {
        const W = scWindow();
        const known = getSizeRatio();
        const from = { w: window.innerWidth, h: window.innerHeight };
        if (known) {
          W.ResizeTo(Math.round(t.w / known.x), Math.round(t.h / known.y), false);
          return resized(from, t);
        }
        W.ResizeTo(t.w, t.h, false);
        await resized(from, t);
        if (sized(t)) {
          setSizeRatio({ x: 1, y: 1 });
          return undefined;
        }
        const r = { x: window.innerWidth / t.w, y: window.innerHeight / t.h };
        if (!sane(r.x) || !sane(r.y) || (Math.abs(r.x - 1) < 0.02 && Math.abs(r.y - 1) < 0.02)) return undefined;
        const again = { w: window.innerWidth, h: window.innerHeight };
        W.ResizeTo(Math.round(t.w / r.x), Math.round(t.h / r.y), false);
        await resized(again, t);
        if (sized(t)) setSizeRatio(r);
        return undefined;
      },
    },
    {
      name: 'window.resizeTo',
      size(t) {
        const from = { w: window.innerWidth, h: window.innerHeight };
        window.resizeTo(t.w, t.h);
        return resized(from, t, 600);
      },
    },
  ];

  const sizeAttempts = [];
  async function ensureSize(t) {
    if (sized(t)) return true;
    const order = live.sizer >= 0 ? [live.sizer] : SIZERS.map((_, i) => i);
    for (const i of order) {
      if (SIZERS[i].steam && typeof scWindow()?.ResizeTo !== 'function') continue;
      await Promise.resolve(run(() => SIZERS[i].size(t))).catch(() => {});
      sizeAttempts.push({ sizer: SIZERS[i].name, w: window.innerWidth, h: window.innerHeight });
      if (sized(t)) {
        live.sizer = i;
        return true;
      }
    }
    return false;
  }

  /*
   * The screen to place on. A new overlay toast window reads a 1×1 screen until the overlay
   * sizes it, often after Steam's slide-in moves (the only moves the overlay takes) are over;
   * the game's overlay window (SP Overlay, same overlay) is sized from the start, so its screen
   * stands in. In game the whole screen is usable (no taskbar).
   */
  const OVERLAY_ID = /_uid(\d+)$/.exec(window.name || '')?.[1] || '';
  function overlayScreen() {
    for (const win of SE.owners()) {
      const list = run(() => win.SteamUIStore?.WindowStore?.OverlayWindows);
      if (!Array.isArray(list)) continue;
      const mine = list.filter(inst => !OVERLAY_ID || String(run(() => inst.params.browserInfo.m_unPID)) === OVERLAY_ID);
      for (const inst of [...mine, ...list]) {
        const s = run(() => inst.BrowserWindow.screen);
        if (s?.width > 200) return s;
      }
    }
    return null;
  }
  const placeScreen = () => (window.screen.width > 200 ? window.screen : (IN_GAME && overlayScreen()) || window.screen);
  const placeable = () => placeScreen().width > 200;

  function wanted() {
    const s = placeScreen();
    const w = BOX.trayW + BOX.padX * 2;
    const h = BOX.padTop + BOX.trayH + BOX.padBottom;
    const left = s.availLeft ?? 0;
    const top = s.availTop ?? 0;
    // Every toast window goes to the same spot; only the stage draws anything there.
    const bottom = top + s.availHeight - BOX.lift + BOX.padBottom;
    return { x: Math.round(left + (s.availWidth - w) / 2), y: Math.round(bottom - h), w, h };
  }

  const fullArea = () => window.innerWidth >= screen.availWidth - 8 && window.innerHeight >= screen.availHeight / 2;
  const landed = (t) => Math.abs(window.screenX - t.x) <= 4 && Math.abs(window.screenY - t.y) <= 4;

  /*
   * Where the tray sits in the window: its own small window → just above the bottom pad;
   * a work-area window → `lift` up. If the window stays smaller than the tray (it couldn't be
   * moved or sized), the tray scales down to fit rather than being cut off.
   */
  function fit() {
    if (!live.dock) return;
    const full = fullArea();
    const bottom = full ? BOX.lift : live.mover >= 0 ? BOX.padBottom : 4;
    const scale = Math.min(1, (window.innerWidth - 8) / BOX.trayW, (window.innerHeight - bottom - 4) / BOX.trayH);
    live.dock.style.setProperty('--se-tst-bottom', `${bottom}px`);
    live.dock.style.setProperty('--se-tst-scale', String(Math.max(0.5, Math.round(scale * 1000) / 1000)));
  }

  async function place() {
    try {
      await moveWindow();
    } finally {
      fit();
    }
  }

  async function moveWindow() {
    if (live.mover === -2) return;
    if (IN_GAME && live.spotHold) return placeInGame();
    // A new overlay window reads a 1×1 screen until the overlay sizes it.
    for (const end = Date.now() + 2000; Date.now() < end && !(screen.width > 200 && window.outerWidth > 1); ) await sleep(50);
    if (fullArea()) return;
    if (!live.steamRect) {
      await steamPlaced();
      live.steamRect = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    }
    live.target = wanted();
    if (landed(live.target)) {
      if (live.mover < 0) live.mover = 0;
      await ensureSize(live.target);
      return;
    }
    const order = live.mover >= 0 ? [live.mover] : MOVERS.map((_, i) => i);
    for (const i of order) {
      if (MOVERS[i].hold && !live.spotHold) continue;
      if (MOVERS[i].steam && typeof scWindow()?.MoveTo !== 'function') continue;
      await applyMove(i, live.target);
      live.attempts.push({ mover: MOVERS[i].name, x: window.screenX, y: window.screenY, ratio: getRatio() });
      if (landed(live.target)) {
        live.mover = i;
        // Then the size; a resize can shift the window, so it's put back if it did.
        if (await ensureSize(live.target) && !landed(live.target)) await applyMove(i, live.target);
        return;
      }
    }
    if (live.mover >= 0) return;
    live.mover = -2;
    // Couldn't land it: put the window back as Steam had it (size and spot), so it stays on
    // screen in Steam's corner and the tray scales down to fit.
    const sr = getSizeRatio();
    if (sr && typeof scWindow()?.ResizeTo === 'function') {
      run(() => scWindow().ResizeTo(Math.round(live.steamRect.w / sr.x), Math.round(live.steamRect.h / sr.y), false));
    } else {
      run(() => window.resizeTo(live.steamRect.w, live.steamRect.h));
    }
    const r = getRatio();
    if (r && typeof scWindow()?.MoveTo === 'function') {
      run(() => scWindow().MoveTo(Math.round(live.steamRect.x / r.x), Math.round(live.steamRect.y / r.y), DPI()));
    } else {
      run(() => window.moveTo(live.steamRect.x, live.steamRect.y));
    }
    if (!placeWarned) {
      placeWarned = true;
      console.warn('[Steam Enhanced] Toasts: could not move the toast window; showing it where Steam put it.', { want: live.target, attempts: live.attempts });
    }
  }

  /*
   * In game only Steam's own moves count (see holdSpot), so nothing is moved from here: wait for
   * Steam's redirected moves to land the window on the spot, then size it (resizing is taken any
   * time). If they never do (Steam's moves were over before the spot was known, or the overlay
   * ignored them), the window can't host the stage; see noStageFallback().
   */
  async function placeInGame() {
    if (!placeable()) for (const end = Date.now() + 2000; Date.now() < end && !placeable(); ) await sleep(50);
    live.target ||= placeable() ? wanted() : null;
    if (live.target) for (const end = Date.now() + 2500; Date.now() < end && !landed(live.target); ) await sleep(50);
    live.attempts.push({ mover: MOVERS[0].name, x: window.screenX, y: window.screenY, ratio: getRatio() });
    if (!live.target || !landed(live.target)) {
      live.mover = -2;
      return;
    }
    live.mover = 0;
    await ensureSize(live.target);
  }

  /*
   * Placing through Steam's own moves. Steam moves its toast windows with this window's MoveTo,
   * every frame while one slides in (about 300 ms) and when the stack changes. In game the
   * overlay only takes a move made inside one of those calls; a separate one is ignored. So
   * MoveTo is wrapped and every Steam move is sent to the stage's spot instead, from Steam's very
   * first move: the spot only needs the screen's size. Steam's units are taken as the window's
   * (1:1 on the desktop and in game) until a move lands elsewhere, which corrects the ratio.
   */

  let spotCalibrating = false;

  function ratioFrom(sx, sy) {
    const rx = sx ? window.screenX / sx : NaN;
    const ry = sy ? window.screenY / sy : NaN;
    if (sane(rx) && sane(ry)) return Math.abs(rx - ry) / ry < 0.02 ? { x: rx, y: ry } : null;
    if (sane(ry) && Math.abs(sx) < 50) return { x: ry, y: ry };
    return null;
  }

  // Wait until the window has moved and then held still (x and y can land in separate steps).
  async function stillAfter(from) {
    for (const end = Date.now() + 600; Date.now() < end; ) {
      await sleep(30);
      if (window.screenX !== from.x || window.screenY !== from.y) break;
    }
    let last = { x: window.screenX, y: window.screenY };
    for (let still = 0, end = Date.now() + 400; still < 3 && Date.now() < end; ) {
      await sleep(30);
      still = window.screenX === last.x && window.screenY === last.y ? still + 1 : 0;
      last = { x: window.screenX, y: window.screenY };
    }
  }

  const toSpot = (r, dpi) => run(() => live.spotHold.native.call(live.spotHold.W, Math.round(live.target.x / r.x), Math.round(live.target.y / r.y), dpi));

  const UNIT = Object.freeze({ x: 1, y: 1 });
  const screenSized = () => screen.width > 200 && window.outerWidth > 1; // overlay windows start 1×1

  // After a redirected move: keep the ratio it shows (1 if it landed on the spot as sent).
  async function checkSpot(sent) {
    spotCalibrating = true;
    try {
      await stillAfter({ x: window.screenX, y: window.screenY });
      if (!live.spotHold || !screenSized()) return;
      const r = landed(live.target) ? UNIT : ratioFrom(sent.x, sent.y);
      if (r) setRatio(r);
    } finally {
      spotCalibrating = false;
    }
  }

  function holdSpot() {
    const W = scWindow();
    if (!W || typeof W.MoveTo !== 'function') return;
    const native = W.MoveTo;
    const wrapped = function MoveTo(x, y, dpi, ...rest) {
      live.spotHold.lastDpi = dpi;
      if (live.mover === -2) return native.call(this, x, y, dpi, ...rest);
      if (!live.target && placeable()) live.target = wanted();
      if (!live.target) return native.call(this, x, y, dpi, ...rest);
      const known = getRatio();
      const r = known || UNIT;
      const sent = { x: Math.round(live.target.x / r.x), y: Math.round(live.target.y / r.y) };
      const out = native.call(this, sent.x, sent.y, dpi, ...rest);
      if (!known && !spotCalibrating) checkSpot(sent);
      return out;
    };
    live.spotHold = { W, native, wrapped, lastDpi: undefined };
    run(() => { W.MoveTo = wrapped; });
    if (W.MoveTo !== wrapped) run(() => Object.defineProperty(W, 'MoveTo', { value: wrapped, configurable: true, writable: true }));
    if (W.MoveTo !== wrapped) live.spotHold = null;
  }

  /*
   * The first mover (desktop): Steam's redirected moves have usually placed the window already;
   * otherwise one move to the spot, which the desktop takes (in game only Steam's own count).
   */
  async function spotMove(t) {
    if (!live.spotHold || landed(t)) return;
    for (const end = Date.now() + 600; Date.now() < end && spotCalibrating; ) await sleep(50);
    const from = { x: window.screenX, y: window.screenY };
    toSpot(getRatio() || UNIT, live.spotHold.lastDpi ?? DPI());
    if (!landed(t)) await stillAfter(from);
  }

  /*
   * Steam re-stacks its toast windows whenever one comes or goes, moving the stage back to its
   * corner. Checked every frame while the tray is up (two screenX/Y reads, no layout): the moment the window is off its spot the
   * tray is hidden, the window is moved back, and the tray shows again. If Steam keeps winning
   * (more than FIGHTS_MAX moves in 10 s), the tray shows where Steam put it rather than vanish.
   */
  const FIGHTS_MAX = 10;

  let fixing = false;
  let fights = [];
  const guarding = () => isStage() && !!live.tray?.hasAttribute('data-show') && live.mover >= 0 && !!live.target;
  function guardPlace() {
    if (!fixing && (!landed(live.target) || (live.sizer >= 0 && !sized(live.target)))) {
      const now = Date.now();
      fights = fights.filter(t => now - t < 10000);
      if (fights.length < FIGHTS_MAX) {
        fights.push(now);
        fixing = true;
        mark(live.dock, 'data-placing');
        Promise.resolve(landed(live.target) || applyMove(live.mover, live.target))
          .then(() => ensureSize(live.target))
          .finally(() => {
            fixing = false;
            fit();
            unmark(live.dock, 'data-placing');
          });
      }
    }
  }
  // A frame loop that runs only while guarding() holds; watchPlace() starts it again.
  const guardLoop = () => {
    let frame = 0;
    const tick = () => {
      frame = 0;
      if (!guarding()) return;
      guardPlace();
      frame = requestAnimationFrame(tick);
    };
    return {
      refresh: () => { if (!frame) tick(); },
      disconnect: () => { cancelAnimationFrame(frame); frame = 0; },
    };
  };
  const watchPlace = () => {
    live.placeGuard ||= guardLoop();
    live.placeGuard.refresh();
  };

  function restack() {
    if (!live.tray?.hasAttribute('data-show') || live.mover < 0 || live.replaceTimer) return;
    live.replaceTimer = setTimeout(() => {
      live.replaceTimer = 0;
      live.target = wanted();
      Promise.resolve(landed(live.target) || applyMove(live.mover, live.target))
        .then(() => ensureSize(live.target))
        .then(fit);
      fit();
    }, 60);
  }

  function onWindowResize() {
    fit();
    restack();
  }

  Object.assign(ns, { MOVERS, SIZERS, fit, getRatio, getSizeRatio, holdSpot, onWindowResize, place, sane, shared, sizeAttempts, stillAfter, watchPlace });
})(window.__se);
