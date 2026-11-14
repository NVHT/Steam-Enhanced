/*
 * Toasts: start, the debug helpers, and the API (destroy()).
 *
 * Part of client/toasts/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedToastsParts;
  if (!ns) return;
  const { mark, run, unmark } = SE;
  const { ADOPT_TIMEOUT_MS, COMPACT, COMPACT_ATTR, EYEBROW, FIBER_DEPTH, KINDS, MOVERS, ON_ATTR, SIZERS, SRC_ATTR, WAIT_ATTR, alive, busy, byKey, elapsed, enabled, getRatio, getSizeRatio, held, history, holdSpot, holdTimer, hub, inDock, keyOf, noteOf, onEarlyMutation, onPageHide, onWindowResize, pendingKeys, ready, register, root, sizeAttempts, skipped, startCompact, step, teardown, templateOf, uninstallCentre, wake } = ns;
  const { live } = ns;

  function start() {
    if (!enabled()) return;
    if (COMPACT) return startCompact();
    register();
    holdSpot();
    // A toast that can't be read is shown as Steam drew it, once reading it has been given up.
    setTimeout(() => unmark(root, WAIT_ATTR), ADOPT_TIMEOUT_MS + 500);
    live.early = SE.watch(onEarlyMutation, { records: true, ignore: inDock });
    for (const el of document.body.querySelectorAll('*')) holdTimer(keyOf(el));
    // The dock's own drawing is ignored: render() writes to it, and must not wake scan() again.
    live.watcher = SE.watch(step, { throttle: 60, characterData: true, ignore: inDock });
    // Steam can fill a toast in without a DOM mutation the observer sees (images, late props),
    // and the stage needs its housekeeping while toasts are queued.
    live.poller = SE.poll(step, 400, { active: busy });
    addEventListener('resize', onWindowResize);
    addEventListener('pagehide', onPageHide);
    step();
  }

  /*
   * A new toast window shows nothing until its toast is read (or reading is given up), so
   * Steam's own toast never flashes in its corner first.
   */
  if (enabled() && !COMPACT) mark(root, WAIT_ATTR);

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });

  // Where the window is, where it should be, and what Steam offers to move it (for why()).
  function placement() {
    const own = [...byKey.values()];
    const src = own.find(e => !e.done)?.src || own[0]?.src;
    const popup = src && run(() => SE.fromProps(src, FIBER_DEPTH, p => ('registerPopup' in p && p.popup ? p.popup : undefined)));
    const members = o => {
      const out = new Set();
      for (let x = o, i = 0; x && x !== Object.prototype && i < 4; x = Object.getPrototypeOf(x), i++) {
        for (const k of Object.getOwnPropertyNames(x)) out.add(k);
      }
      return [...out].slice(0, 150);
    };
    return {
      mover: MOVERS[live.mover]?.name || live.mover,
      target: live.target,
      attempts: live.attempts,
      sizer: SIZERS[live.sizer]?.name || live.sizer,
      sizeAttempts,
      sizeRatio: getSizeRatio(),
      steamRect: live.steamRect,
      ratio: getRatio(),
      got: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight, dpr: window.devicePixelRatio },
      avail: { l: screen.availLeft, t: screen.availTop, w: screen.availWidth, h: screen.availHeight },
      steamClientWindow: Object.keys(window.SteamClient?.Window || {}),
      dock: live.dock && { bottom: live.dock.style.getPropertyValue('--se-tst-bottom'), scale: live.dock.style.getPropertyValue('--se-tst-scale') },
      popup: !popup ? null : popup === window ? 'this window' : { type: typeof popup, members: run(() => members(popup)), holdsThisWindow: run(() => Object.values(popup).includes(window)) },
    };
  }

  // What React has above the window's text: component names and prop names, level by level.
  function probe() {
    const hosts = [...document.body.querySelectorAll('*')]
      .filter(el => !inDock(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim()))
      .slice(0, 4);
    return hosts.map(el => {
      const chain = [];
      for (let f = SE.fiber(el), i = 0; f && i < FIBER_DEPTH + 6; f = f.return, i++) {
        const t = f.type;
        const name = typeof t === 'string' ? t : t?.displayName || t?.name || '?';
        const p = f.memoizedProps && typeof f.memoizedProps === 'object' ? Object.keys(f.memoizedProps).filter(k => k !== 'children') : [];
        chain.push(`${name}(${p.join(',')})`);
      }
      return { text: el.textContent.trim().slice(0, 40), fiber: !!SE.fiber(el), chain };
    });
  }

  // What every toast window is doing, from this one's point of view.
  function stageInfo() {
    const h = hub();
    const name = w => (w === window ? 'this window' : run(() => w.name) || '?');
    return {
      stage: h.stage ? name(h.stage) : null,
      windows: h.wins.map(w => ({ name: name(w), alive: alive(w), ready: !!run(() => w.__seToasts?.ready?.()) })),
      timerHeld: h.timerHeld,
      steamCloses: [...h.steamCloses],
      heldHere: [...byKey.values()].map(e => ({ title: e.title, steamMs: e.steamMs, held: held(e.key) })),
      active: h.active,
      slot: h.slot,
      elapsed: h.active ? elapsed(h) : 0,
      open: h.open,
      closing: h.closing,
      queue: h.entries.map(e => ({ id: e.id, title: e.title, done: e.done, stale: e.stale, released: e.released, from: name(e.win), deadlineIn: Number.isFinite(e.deadline) ? e.deadline - Date.now() : null })),
    };
  }

  window.__seToasts = {
    version: '1.102.7',
    kinds: Object.keys(KINDS),
    probe,
    wake,
    ready,
    history: () => history.slice(),
    // Why nothing (or something) is on the stage: the last scan, the shared queue and placement.
    why: () => ({ history: history.slice(), enabled: enabled(), lastScan: live.lastScan, stage: stageInfo(), skipped: skipped.size, pending: pendingKeys.size, placement: placement() }),
    dump() {
      return [...byKey.values()].map(m => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        text: m.text,
        appid: m.appid,
        pct: m.pct,
        buttons: m.buttons.map(b => b.label),
        stale: m.stale,
        done: m.done,
        canDismiss: !!m.dismiss,
        dataClass: run(() => noteOf(m.key, m.src)?.data?.getClassName?.()),
        noteKeys: run(() => Object.keys(noteOf(m.key, m.src) || {})),
        dataKeys: run(() => Object.keys(noteOf(m.key, m.src)?.data || {})),
        templateKeys: run(() => Object.keys(templateOf(m.src) || {}).filter(k => k !== 'children')),
        accountId: m.accountId,
      }));
    },
    destroy() {
      live.watcher?.disconnect();
      live.poller?.disconnect();
      live.compactWatcher?.disconnect();
      uninstallCentre();
      if (live.spotHold && live.spotHold.W.MoveTo === live.spotHold.wrapped) run(() => { live.spotHold.W.MoveTo = live.spotHold.native; });
      root.removeAttribute(COMPACT_ATTR);
      for (const el of document.querySelectorAll(`.${EYEBROW}`)) el.remove();
      live.early?.disconnect();
      clearTimeout(live.replaceTimer);
      clearTimeout(live.syncTimer);
      removeEventListener('resize', onWindowResize);
      removeEventListener('pagehide', onPageHide);
      const h = hub();
      const i = h.wins.indexOf(window);
      if (i >= 0) h.wins.splice(i, 1);
      if (h.stage === window) h.stage = null;
      for (const el of document.querySelectorAll(`[${SRC_ATTR}]`)) unmark(el, SRC_ATTR);
      unmark(root, ON_ATTR);
      unmark(root, WAIT_ATTR);
      teardown();
      delete window.__seToasts;
    },
  };

  Object.assign(ns, { probe });
});
