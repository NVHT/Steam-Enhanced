/*
 * Toasts: the queue the toast windows share, and which window is the stage.
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { mark, run, unmark } = SE;
  const { GUARD_MS, IN_GAME, SRC_ATTR, STALE_MAX_MS, SURFACE, enrichAchievement, letGo, prepare, ready, render, teardown } = ns;
  const { live } = ns;

  /* ---------- One stage for every toast window ---------- */

  /*
   * Steam opens a window per toast. They share one queue (the hub, kept in Steam's shared
   * context: the windows' opener) and one stage. The newest window that has reached the
   * bottom centre plays every toast, one at a time, with the rest waiting in its strip; the
   * other windows read their own Steam toast into the queue and draw nothing. When the stage's
   * window closes (Steam's timer), the next newest takes over where it left off.
   *
   * A toast plays in a slot: its own time, shortened when the queue wouldn't otherwise finish
   * before the last Steam toast closes (never below MIN_SLOT_MS).
   *
   * Steam's toast is dismissed by its own window once its Stage toast has played, except the
   * stage's own, which stays until the queue empties (dismissing it closes the stage).
   */
  const HUB_KEY = `__seToastHub:${SURFACE}`;
  const HUB_V = 3;
  const MIN_SLOT_MS = 2500;
  const MIN_LEFT_MS = 1500;      // a shortened toast still shows at least this much more
  const CLOSE_MS = 900;          // the tray's close animation, with margin
  const HANDOFF_MS = 60;         // the old stage steps down this long after the new one draws

  const alive = (w) => !!w && run(() => !w.closed) === true;

  const home = () => ns.shared();

  /*
   * Made from the shared context's own constructors, so the hub outlives whichever toast
   * window created it.
   */
  function hub() {
    const at = home();
    let h = run(() => at[HUB_KEY]);
    if (h?.v === HUB_V) return h;
    const O = run(() => at.Object && at.Array) ? at : window;
    h = new O.Object();
    Object.assign(h, {
      v: HUB_V,
      seq: 0,
      wins: new O.Array(),     // toast windows, oldest first
      stage: null,             // the window drawing the tray
      entries: new O.Array(),  // play order
      active: 0,               // entry id on the stage
      startedAt: 0,
      pausedAt: 0,
      slot: 0,
      playRev: 0,              // bumped whenever the active toast (re)starts
      open: false,
      closing: false,
      timerHeld: false,        // Steam's timer waits for the theme (learnt)
      steamCloses: new O.Array(), // windows Steam closed before the theme did (for why())
    });
    run(() => { at[HUB_KEY] = h; });
    return h;
  }

  const entryById = (id) => hub().entries.find(e => e.id === id) || null;
  const activeEntry = () => {
    const h = hub();
    return h.entries.find(e => e.id === h.active && !e.done) || null;
  };
  const openEntries = () => hub().entries.filter(e => !e.done);
  const isStage = () => hub().stage === window;
  const elapsed = (h) => Math.max(0, (h.pausedAt || Date.now()) - h.startedAt);

  function register() {
    const h = hub();
    if (!h.wins.includes(window)) h.wins.push(window);
  }

  // Every window (this one too) re-syncs on its next tick.
  function notify() {
    const h = hub();
    for (const w of new Set([...h.wins, window])) if (alive(w)) run(() => w.__seToasts?.wake?.());
  }

  let syncQueued = false;

  function wake() {
    if (syncQueued) return;
    syncQueued = true;
    live.syncTimer = setTimeout(sync, 0);
  }

  /*
   * The slot for the toast about to play: its time, or less so that everything still queued
   * fits before the last live Steam toast closes.
   */
  function slotFor(e, h, waiting) {
    if (!e.ms) return 0;
    if (h.timerHeld) return e.ms;
    const ends = h.entries.filter(x => !x.stale && alive(x.win)).map(x => x.deadline);
    const horizon = ends.length ? Math.max(...ends) : Infinity;
    if (!Number.isFinite(horizon)) return e.ms;
    const fair = (horizon - Date.now() - CLOSE_MS) / Math.max(1, waiting);
    return Math.round(Math.min(e.ms, Math.max(MIN_SLOT_MS, fair)));
  }

  /*
   * More toasts joined while one plays: shorten what's left of it to its fair share, so the
   * rest still fit (the countdown jumps ahead rather than toasts being lost).
   */
  function reslot(h) {
    const cur = h.entries.find(e => e.id === h.active && !e.done);
    if (!cur || !h.slot) return;
    const played = elapsed(h);
    const share = slotFor(cur, h, h.entries.filter(x => !x.done).length);
    const slot = Math.round(Math.max(MIN_SLOT_MS, played + MIN_LEFT_MS, Math.min(h.slot, played + share)));
    if (slot >= h.slot) return;
    h.slot = slot;
    h.playRev++;
  }

  // Puts `id` (else the first waiting) on the stage, or starts closing when nothing waits.
  function advance(h, id = 0) {
    const waiting = h.entries.filter(x => !x.done);
    const next = (id && waiting.find(x => x.id === id)) || waiting[0];
    if (!next) {
      h.active = 0;
      if (h.open) h.closing = true;
      return;
    }
    h.closing = false;
    h.active = next.id;
    h.startedAt = Date.now();
    h.pausedAt = 0;
    h.slot = slotFor(next, h, waiting.length);
    h.playRev++;
  }

  /* ---------- Queue ---------- */

  const byKey = new Map();           // this window's Steam notifications (object or id) → entry
  const pendingKeys = new Map();     // unreadable so far → first seen
  const skipped = new Set();         // gave up: left native

  function add(key, src, info) {
    const h = hub();
    const now = Date.now();
    // `seenIcon` is what Steam drew; `icon` may be filled in later (an achievement's own image).
    const e = {
      id: ++h.seq,
      key,
      src,
      win: window,
      born: now,
      deadline: !info.ms ? Infinity : now + info.ms,
      done: false,
      stale: false,
      released: false,
      rev: 1,
      ...info,
      seenIcon: info.icon,
    };
    byKey.set(key, e);
    if (src) mark(src, SRC_ATTR);

    // Priority toasts play next; the rest join the end.
    const at = e.pri && h.active ? h.entries.findIndex(x => x.id === h.active) + 1 : h.entries.length;
    h.entries.splice(at, 0, e);
    if (!h.active) advance(h);
    else reslot(h);
    enrichAchievement(e);
    notify();
    return e;
  }

  const history = []; // the last toasts finished, and why (for why())
  function finish(e, why = '') {
    if (!e || e.done) return;
    e.done = true;
    history.push({ title: e.title, kind: e.kind, ms: e.ms, slot: e.id === hub().active ? hub().slot : 0, why, after: Date.now() - e.born });
    if (history.length > 6) history.shift();
    const h = hub();
    if (e.id === h.active) advance(h);
    notify();
  }

  function play(id) {
    const h = hub();
    if (id === h.active || !entryById(id) || entryById(id).done) return;
    advance(h, id);
    notify();
  }

  // The close animation ended: the queue is empty.
  function closed() {
    const h = hub();
    if (!h.closing) return;
    h.closing = false;
    h.open = false;
    teardown();
    notify(); // windows now release their finished toasts, the stage's own included
  }

  /*
   * This window's part: dismiss Steam's toast for entries that have played (not the stage's
   * own while the tray is up), and forget entries nobody needs any more.
   */
  function release(h) {
    const up = h.open || h.closing;
    for (const e of h.entries) {
      if (e.win !== window || !e.done || e.released) continue;
      if (isStage() && up) continue; // dismissing it would close the stage
      e.released = true;
      unmark(e.src, SRC_ATTR);
      if (e.dismiss && e.src?.isConnected) {
        live.dismissedByUs = true;
        run(e.dismiss);
      }
    }
    for (let i = h.entries.length - 1; i >= 0; i--) {
      const e = h.entries[i];
      if (!e.done || !(e.released || !alive(e.win))) continue;
      h.entries.splice(i, 1);
    }
  }

  /*
   * The window that should be the stage: the newest one that's ready at the bottom centre.
   * Windows whose toast couldn't be read (left native) never get ready, so never take it.
   */
  function candidate(h) {
    for (let i = h.wins.length - 1; i >= 0; i--) {
      const w = h.wins[i];
      if (alive(w) && run(() => w.__seToasts?.ready?.())) return w;
    }
    return null;
  }

  let claiming = false;
  async function claim() {
    claiming = true;
    try {
      await ns.place(); // Steam may have moved the window back to its corner meanwhile
    } finally {
      claiming = false;
    }
    const h = hub();
    if (candidate(h) !== window) return;
    // Hover pauses don't carry over (the pointer is on the old window).
    if (h.pausedAt) {
      h.startedAt += Date.now() - h.pausedAt;
      h.pausedAt = 0;
    }
    h.stage = window;
    render(true);
    setTimeout(notify, HANDOFF_MS); // the old stage steps down once this one is drawn
  }

  function sync() {
    syncQueued = false;
    if (!document.body) return;
    const h = hub();
    for (let i = h.wins.length - 1; i >= 0; i--) if (!alive(h.wins[i])) h.wins.splice(i, 1);
    if (h.stage && !alive(h.stage)) h.stage = null;

    const want = candidate(h);
    if (want === window && h.stage !== window && !claiming) claim();
    if (h.stage === window) {
      tick(h);
      render();
    } else {
      teardown();
    }
    guard(h);
    release(h);

    // Get to the bottom centre once a toast from this window is queued, ready to take over.
    if (!ready() && !live.preparing && byKeyHasLive()) prepare();
    if (IN_GAME) noStageFallback(h);
  }

  /*
   * In game, if no window could be placed (so nothing can draw the stage) a few seconds after
   * this window's toast came, its toast is shown as a compact card instead: Steam's timers
   * restored, the Stage's hold on the window released, and the compact style (Steam's own toast,
   * restyled, centred along the edge) takes over. The overlay sometimes ignores every move for a
   * window, Steam's own included; a toast is never left unseen.
   */
  const NO_STAGE_MS = 3500;
  function noStageFallback(h) {
    if (h.stage || !live.prepared || live.mover !== -2) return;
    const own = [...byKey.values()].filter(e => !e.done);
    if (!own.length || Date.now() - Math.min(...own.map(e => e.born)) < NO_STAGE_MS) return;
    if (h.wins.some(w => w !== window && alive(w) && run(() => w.__seToasts?.ready?.()))) return;
    for (const e of own) {
      letGo(e.key, e.src, e.born);
      finish(e, 'no stage in game: compact card');
    }
    window.__seToasts?.destroy();
    run(ns.startCompact);
  }

  const byKeyHasLive = () => [...byKey.values()].some(e => !e.done);

  /*
   * The stage's housekeeping: a countdown that ended without its animationend (a window that
   * was hidden), and queued toasts whose Steam toast is long gone.
   */
  function tick(h) {
    const cur = activeEntry();
    if (cur && h.slot && !h.pausedAt && elapsed(h) > h.slot + 600) finish(cur, 'countdown (late)');
    const now = Date.now();
    for (const e of h.entries) {
      if (!e.done && e.stale && e.id !== h.active && now - e.born > STALE_MAX_MS) finish(e, 'dropped by Steam');
      // A toast window still open well past Steam's own time: Steam waits for the theme.
      if (!h.timerHeld && !e.stale && e.steamMs && alive(e.win) && now - e.born > e.steamMs + 1500) h.timerHeld = true;
    }
  }

  // This window's toasts that never finished (the stage is gone or stuck): end them.
  function guard(h) {
    if (h.pausedAt) return;
    const now = Date.now();
    for (const e of byKey.values()) {
      if (!e.done && now - e.born > (e.steamMs || STALE_MAX_MS) + GUARD_MS) finish(e, 'guard');
    }
  }

  Object.assign(ns, { activeEntry, add, alive, byKey, closed, elapsed, entryById, finish, history, hub, isStage, notify, openEntries, pendingKeys, play, register, skipped, slotFor, sync, wake });
})(window.__se);
