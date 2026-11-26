/*
 * Toast preview: a theming aid. Ctrl+Shift+T (loaded on demand by core/core.js) in a client
 * window opens a panel that fires Steam's own test toasts, so client/toasts/ can be checked
 * without waiting for a friend, a download or an achievement. Ctrl+Shift+T again hides the
 * panel; Stop removes it.
 *
 * The toasts are real: Steam's notification store (window.NotificationStore, in Steam's shared
 * context) makes each one up from its test data and shows it in its own toast window, which the
 * theme then restyles as it would any toast, in the style and place the Toasts settings pick.
 * The list is Steam's (its notification targets' test entries, as its developer settings list
 * them), plus a few test calls those leave out; only Steam's `Test…` calls are offered, never a
 * target whose test does something real. Steam's own settings still apply: with its toasts
 * turned off (or off in game), nothing shows.
 *
 * Pair fires two achievements at once after a countdown (time to bring a game to the front, so
 * they land in its overlay), then reads each toast window's own report (__seToasts.why(),
 * client/toasts/main.js) for a while and shows what each did: its surface, whether it shares the
 * queue (an opener), the stage, its placement and why its toasts ended. Copy puts it all on the
 * clipboard.
 *
 * Record arms the toast recorder (client/loader.js, localStorage "se-toast-log"; it stays armed
 * across restarts until turned off): every toast window, in a game's overlay or on the desktop,
 * notes how far its loading and placing got, listed here under "Toast windows", newest first.
 */
(() => {
  if (window.__seToastPreview) {
    window.__seToastPreview.toggle();
    return;
  }
  const SE = window.__se;
  if (!SE || !document.body) return;

  const fnSource = (fn) => {
    try {
      return Function.prototype.toString.call(fn);
    } catch {
      return '';
    }
  };

  // Steam's notification store: the first window of this JS context that has it
  const store = () => {
    for (const win of SE.owners()) {
      const found = SE.run(() => win.NotificationStore);
      if (typeof found?.GetNotificationTargets === 'function') return found;
    }
    return null;
  };

  // Test calls Steam's targets don't list: [label, method, args]
  const EXTRAS = [
    ['Download Complete', 'TestDownloadComplete', [570]],
    ['Group Chat Mention', 'TestGroupChatMention', [null, 'Are you joining tonight?']],
    ['Family Sharing', 'TestFamilySharing', []],
    ['Recording Started', 'TestGameRecordingStart', []],
    ['Recording Stopped', 'TestGameRecordingStop', []],
    ['Instant Clip', 'TestGameRecordingInstantClip', []],
    ['Low Battery', 'TestLowBatteryNotification', [10]],
  ];
  // A burst: several kinds at once, for the Stage's queue and strip
  const BURST = ['Friend Online', 'Achievement', 'Friend Message', 'Screenshot'];
  const BURST_GAP_MS = 400;
  // Pair: the countdown, how long the toast windows are watched, and how often they're read
  const PAIR_DELAY_S = 8;
  const PAIR_WATCH_MS = 15000;
  const PAIR_SAMPLE_MS = 500;

  // Every entry: { name, run }. Steam's targets first, in its order, then the extras.
  function entries() {
    const s = store();
    if (!s) return [];
    const list = [];
    const seen = new Set();
    const targets = SE.run(() => s.GetNotificationTargets()) || {};
    for (const target of Object.values(targets)) {
      const { strTest: name, fnTest: test } = target || {};
      // Only Steam's made-up toasts: a test that calls anything else may act for real
      if (!name || typeof test !== 'function' || !/\.Test\w+\(/.test(fnSource(test)) || seen.has(name)) continue;
      seen.add(name);
      list.push({ name, run: test });
    }
    for (const [name, method, args] of EXTRAS) {
      if (seen.has(name) || typeof s[method] !== 'function') continue;
      seen.add(name);
      list.push({ name, run: () => s[method](...args) });
    }
    return list;
  }

  // The panel, in a closed shadow root so neither Steam's nor the theme's styles reach it
  const host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; top: 48px; right: 16px; bottom: 16px; z-index: 2147483600;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .panel { box-sizing: border-box; display: flex; flex-direction: column; width: 344px; max-height: 100%; border-radius: 10px; background: #16191e; color: #c6ccd4; box-shadow: 0 12px 40px rgba(0, 0, 0, .6); font: 12px/1.4 system-ui, sans-serif; overflow: hidden; }
    .head { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid #252a31; }
    .title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: #fff; }
    .hint { color: #6f7883; }
    button { font: inherit; color: inherit; }
    .list { overflow: auto; padding: 4px 8px 12px; }
    .entry { display: flex; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .entry:hover { background: #252a31; color: #fff; }
    .entry:focus-visible, .small:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 1px; }
    .small { padding: 3px 8px; border: 0; border-radius: 6px; background: #252a31; cursor: pointer; }
    .small:hover { background: #313741; color: #fff; }
    .empty { padding: 6px 8px; color: #6f7883; }
    .report { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 12px; border-bottom: 1px solid #252a31; }
    .report[hidden] { display: none; }
    .report pre { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; font: 11px/1.45 ui-monospace, Consolas, monospace; color: #c6ccd4; }
  </style>
  <div class="panel" role="dialog" aria-label="Toast preview">
    <div class="head">
      <div class="title">Toasts <span><button class="small" data-burst>Burst</button> <button class="small" data-pair>Pair</button> <button class="small" data-record></button> <button class="small" data-hide>Hide</button> <button class="small" data-stop>Stop</button></span></div>
      <div class="hint" data-hint></div>
    </div>
    <div class="report" data-log hidden>
      <div class="title">Toast windows <span><button class="small" data-copy-log>Copy</button> <button class="small" data-clear>Clear</button></span></div>
      <pre data-log-lines></pre>
    </div>
    <div class="report" data-report hidden>
      <div class="title">Two achievements <button class="small" data-copy>Copy</button></div>
      <pre data-lines></pre>
    </div>
    <div class="list" data-list></div>
  </div>`;

  const list = root.querySelector('[data-list]');
  const hint = root.querySelector('[data-hint]');
  const report = root.querySelector('[data-report]');
  const log = root.querySelector('[data-log]');
  const logLines = root.querySelector('[data-log-lines]');
  const recordButton = root.querySelector('[data-record]');
  const lines = root.querySelector('[data-lines]');
  let current = [];
  const timers = new Set();
  const intervals = new Set();

  /* ---------- Record: the toast recorder (client/loader.js) ---------- */

  const LOG_FLAG = 'se-toast-log';
  const LOG_DATA = 'se-toast-log-data';
  const recording = () => SE.run(() => localStorage.getItem(LOG_FLAG) === '1') === true;

  // Each recorded window: when it opened, its name's end, and every step with its time
  function renderLog() {
    recordButton.textContent = recording() ? 'Recording' : 'Record';
    const list = SE.run(() => JSON.parse(localStorage.getItem(LOG_DATA) || '[]')) || [];
    log.hidden = !recording() && !list.length;
    if (!list.length) {
      logLines.textContent = 'None yet: the next toasts, in game or on the desktop, show here.';
      return;
    }
    const time = (at) => new Date(at).toLocaleTimeString();
    logLines.textContent = list
      .slice()
      .reverse()
      .map((entry) => [`${time(entry.at)} …${String(entry.name).slice(-16)}`, ...entry.steps.map(([ms, text]) => `  ${ms} ms  ${text}`)].join('\n'))
      .join('\n');
  }

  function toggleRecord() {
    SE.run(() => (recording() ? localStorage.removeItem(LOG_FLAG) : localStorage.setItem(LOG_FLAG, '1')));
    renderLog();
  }

  function render() {
    renderLog();
    current = entries();
    const style = SE.settings?.get('toasts') === 'off' ? 'Restyle toasts is off' : `Style: ${SE.settings?.get('toast-style') === 'compact' ? 'Compact' : 'Stage'}`;
    hint.textContent = `${style}. Steam's own toast settings apply.`;
    if (!current.length) {
      list.innerHTML = '<div class="empty">Steam\'s notification store wasn\'t found from this window.</div>';
      return;
    }
    const esc = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    list.innerHTML = current.map(({ name }, i) => `<button class="entry" data-i="${i}">${esc(name)}</button>`).join('');
  }

  function burst() {
    BURST.map((name) => current.find((entry) => entry.name === name)).filter(Boolean).forEach((entry, i) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        SE.run(entry.run);
      }, i * BURST_GAP_MS);
      timers.add(timer);
    });
  }

  /* ---------- Pair: two achievements at once ---------- */

  // Steam's toast windows (notificationtoasts_…), from its popup manager in each owner window
  const toastWindows = () => {
    const found = new Set();
    for (const owner of SE.owners()) {
      for (const entry of SE.run(() => [...owner.g_PopupManager.m_mapPopups.values()]) || []) {
        const win = SE.run(() => entry.window);
        if (win && /^notificationtoasts_/.test(SE.run(() => win.name) || '')) found.add(win);
      }
    }
    return found;
  };

  // One toast window's state, without the long lists that don't tell windows apart
  const sample = (win) =>
    SE.run(() => {
      const why = win.__seToasts?.why?.();
      const { popup, steamClientWindow, ...placement } = why?.placement || {};
      return {
        name: win.name,
        // The title says which (Steam's: notificationtoasts_<id>_desktop); the name gains _uid<n>
        surface: /_desktop$/.test(win.document?.title || '') ? 'desktop' : 'game',
        opener: !!win.opener,
        theme: !!why,
        ...(why && { enabled: why.enabled, history: why.history, lastScan: why.lastScan, stage: why.stage, skipped: why.skipped, pending: why.pending, placement }),
      };
    });

  let pairState = null; // { seen: name → its last sample, closed: names gone, done }

  const every = (ms, fn) => {
    const id = setInterval(fn, ms);
    intervals.add(id);
    return () => {
      clearInterval(id);
      intervals.delete(id);
    };
  };

  // A line per window: where it was, whether it shared the queue, what the stage and placement did
  function showPair() {
    const windows = [...pairState.seen.values()];
    const line = (w) => {
      const stage = w.stage?.stage === 'this window' ? 'stage' : w.stage?.stage ? 'waiting' : 'no stage';
      const ends = (w.history || []).map((h) => h.why).join(', ') || 'none';
      const gone = pairState.closed.has(w.name) ? ' · closed' : '';
      return [
        `…${w.name.slice(-16)} (${w.surface})`,
        `  theme ${w.theme ? 'yes' : 'no'} · opener ${w.opener ? 'yes' : 'no'} · ${stage} · mover ${w.placement?.mover ?? '?'} · queue ${w.stage?.queue?.length ?? 0} · seen ${w.lastScan?.toasts ?? 0}${gone}`,
        `  ended: ${ends}`,
      ].join('\n');
    };
    lines.textContent = windows.length ? [`${windows.length} toast window(s)`, ...windows.map(line)].join('\n') : 'No toast window appeared.';
    report.hidden = false;
  }

  function pair() {
    const achievement = current.find((entry) => entry.name === 'Achievement');
    if (!achievement || pairState) return;
    pairState = { seen: new Map(), closed: new Set(), done: false };
    report.hidden = true;
    let left = PAIR_DELAY_S;
    const say = () => (hint.textContent = `Two achievements in ${left} s: bring the game to the front.`);
    say();
    const stopCountdown = every(1000, () => {
      left -= 1;
      if (left > 0) return say();
      stopCountdown();
      SE.run(achievement.run);
      SE.run(achievement.run);
      hint.textContent = 'Fired. Watching the toast windows…';
      // Polling: Steam's toast windows have no change event a dev aid can hook; only while watching
      const stopWatch = every(PAIR_SAMPLE_MS, () => {
        const open = toastWindows();
        for (const win of open) {
          const state = sample(win);
          if (state) pairState.seen.set(state.name, state);
        }
        const names = new Set([...open].map((win) => SE.run(() => win.name)));
        for (const name of pairState.seen.keys()) if (!names.has(name)) pairState.closed.add(name);
      });
      const timer = setTimeout(() => {
        timers.delete(timer);
        stopWatch();
        showPair();
        hint.textContent = 'Done. Copy for the full report.';
        pairState.done = true;
      }, PAIR_WATCH_MS);
      timers.add(timer);
    });
  }

  async function copyPair(button) {
    if (!pairState) return;
    copyText(button, JSON.stringify({ windows: [...pairState.seen.values()], closed: [...pairState.closed] }, null, 1));
  }

  // The text on the clipboard; the button says how it went
  async function copyText(button, text) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {}
    button.textContent = ok ? 'Copied' : 'Copy failed';
    const timer = setTimeout(() => {
      timers.delete(timer);
      button.textContent = 'Copy';
    }, 1400);
    timers.add(timer);
  }

  const onClick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-hide')) toggle();
    else if (button.hasAttribute('data-stop')) destroy();
    else if (button.hasAttribute('data-burst')) burst();
    else if (button.hasAttribute('data-pair')) {
      if (pairState?.done) pairState = null;
      pair();
    } else if (button.hasAttribute('data-copy')) copyPair(button);
    else if (button.hasAttribute('data-copy-log')) copyText(button, logLines.textContent);
    else if (button.hasAttribute('data-record')) toggleRecord();
    else if (button.hasAttribute('data-clear')) {
      SE.run(() => localStorage.removeItem(LOG_DATA));
      renderLog();
    }
    else if (button.dataset.i) SE.run(current[Number(button.dataset.i)]?.run);
  };

  let shown = true;
  const toggle = () => {
    shown = !shown;
    host.style.display = shown ? '' : 'none';
    if (shown) render();
  };
  const destroy = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const id of intervals) clearInterval(id);
    intervals.clear();
    root.removeEventListener('click', onClick);
    host.remove();
    delete window.__seToastPreview;
  };

  root.addEventListener('click', onClick);
  render();
  document.body.append(host);

  window.__seToastPreview = { toggle, destroy };
})();
