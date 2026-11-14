/*
 * Toasts, in two styles. Runs in Steam's toast windows (one per toast): on the desktop
 * (`notificationtoasts_<n>_desktop`) and in game, where the overlay opens its own
 * (`notificationtoasts_uid<appid>-<n>`, drawn into the game).
 *
 * Two styles, `--se-toasts-style`, the same on the desktop and in game:
 *
 * Stage (the default): a miniature Library Home stage at the bottom centre of the screen.
 *
 * Compact: Steam's own toast, restyled in place as a compact Stage card (accent, eyebrow, glyph,
 * countdown) and stacked at the centre of the screen's edge.
 *
 * Placement: SharedJSContext stacks the toast windows in a corner and moves each one, every frame
 * it changes, with that window's SteamClient.Window.MoveTo(x, y, dpi), in its own units. That
 * call is wrapped, so Steam's own moves put the window where the theme wants it (in game the
 * overlay takes no other move) and Steam's re-stacking can't pull it back.
 *
 * The Stage. Steam keeps rendering its own toasts. Each one is read from its React props (kind,
 * app, ids) and its rendered output (text, images, buttons) into a queue the toast windows share.
 * One window draws the stage and plays the queue one toast at a time: the game's hero art
 * under the Home stage grade, a sweep countdown, and a strip for the ones waiting. Clicks go
 * to Steam's own toast and buttons, so what they do, and the language they're in, stay Steam's.
 *
 * Fail-safe: a Steam toast is hidden only once it's queued; a toast this script can't read
 * stays as Steam drew it. `--se-toasts: off` (core/tokens.css) turns it all off.
 * Debug, in a toast window's console: `__seToasts.why()` shows the shared queue, which window
 * is the stage and the placement; `__seToasts.probe()` shows the React components and props
 * above the window's text.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedToastsParts (values parts reassign live on its `live`):
 * - context.js    which window this is (this one: outside a toast window nothing goes on)
 * - config.js     attributes, sizes, toast kinds and their glyphs, the settings
 * - steam.js      reading Steam's toasts: React props, text, buttons, achievements
 * - stage.js      the view: dock, tray, stage and strip, and drawing a toast on it
 * - hub.js        the queue the toast windows share, and which window is the stage
 * - placement.js  where the toast window goes, wrapping Steam's moves and sizes
 * - scan.js       clicks and hovers on the dock, scanning for new toasts, the watchers
 * - compact.js    the compact style
 * - main.js       start, the debug helpers, and the API (destroy())
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  window.__seToasts?.destroy();
  const root = document.documentElement;

  // Steam's window name and title can differ (`…-10009_uid38064` / `…-10009`): both are checked.
  const names = [window.name || '', document.title || ''];
  if (!names.some(n => /^notificationtoasts_/.test(n))) return;

  const ns = (window.__steamEnhancedToastsParts = { live: {} });
  const { live } = ns;
  live.dismissedByUs = false;
  live.placeGuard = null;
  live.early = null;
  live.watcher = null;
  live.poller = null;
  live.preparing = false;
  live.prepared = false;
  live.mover = -1; // index into MOVERS that worked, -1 = untried, -2 = none work
  live.dock = null;
  live.tray = null;
  live.target = null;
  live.attempts = []; // what each mover did, for why()
  live.sizer = -1;
  live.steamRect = null; // where and how big Steam made the window
  live.lastScan = null; // for __seToasts.why()
  live.compactWatcher = null;
  live.spotHold = null; // { W, native, wrapped, lastDpi }
  live.replaceTimer = 0;
  live.syncTimer = 0;

  const IN_GAME = !names.some(n => /^notificationtoasts_.*_desktop$/.test(n));
  /*
   * Surface: the desktop, or one game's overlay (its window name ends in the overlay's id). Toast
   * windows share a queue, a stage and the learnt move/size ratios only within a surface: a
   * desktop stage can't be seen in game.
   */
  const SURFACE = IN_GAME
    ? `game:${/_uid(\d+)$/.exec(window.name || '')?.[1] || /uid(\d+)/.exec(document.title || '')?.[1] || '0'}`
    : 'desktop';

  Object.assign(ns, { IN_GAME, SURFACE, root });
});
