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
 * turned off (or off in game), nothing shows, unless Show all is on: then every toast kind in
 * Steam's list is set to show and marked critical (Steam's ProcessNotification skips a kind whose
 * `showToast` says no, and the Disable all / in game settings for any kind not `bCritical`), and
 * put back as it was when Show all goes off or the preview stops. Real toasts come through too
 * meanwhile, and critical ones play their sound whatever Steam's sound setting says.
 *
 * The panel's head switches the Toasts settings the next toast uses (Restyle, Style, Compact
 * position, In game), and "Fire after 8 s" delays every toast and Burst (time to bring a game to
 * the front). The list is grouped (Friends, Games, Downloads, System) and filtered by the field;
 * Burst fires the shown entries (up to six), or a mixed four with no filter. Hold keeps the
 * toasts on screen (their countdown paused as a hover pauses it, client/toasts/scan.js) until
 * pressed again.
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
  // A burst: several kinds at once, for the Stage's queue and strip (with no filter)
  const BURST = ['Friend Online', 'Achievement', 'Friend Message', 'Screenshot'];
  const BURST_MAX = 6;
  const BURST_GAP_MS = 400;
  // "Fire after": the countdown before a toast (or a burst) fires
  const DELAY_S = 8;
  // A toast window that opened since Hold was pressed takes it up this long after firing
  const HOLD_CATCH_MS = 1200;
  // The list's groups, by the test's name (Steam's words; the rest is System)
  const GROUPS = [
    ['Friends', /friend|chat|message|mention|invite|comment|voice|call|group|family/i],
    ['Games', /achievement|game|playtime|screenshot|record|clip|wishlist|item|trade|gift|sale/i],
    ['Downloads', /download|update|install/i],
  ];
  const groupOf = (name) => GROUPS.find(([, test]) => test.test(name))?.[0] || 'System';
  // The settings the head switches: [key, label, [value, label]...]; a row shows while its
  // setting's requires hold (Compact position: the Compact style)
  const CONTROLS = [
    ['toasts', 'Restyle', [['on', 'On'], ['off', 'Off']]],
    ['toast-style', 'Style', [['stage', 'Stage'], ['compact', 'Compact']]],
    ['toast-position', 'Position', [['centre', 'Centre'], ['corner', 'Corner']]],
    ['toasts-in-game', 'In game', [['on', 'On'], ['off', 'Off']]],
  ];
  // Pair: the countdown, how long the toast windows are watched, and how often they're read
  const PAIR_DELAY_S = 8;
  const PAIR_WATCH_MS = 15000;
  const PAIR_SAMPLE_MS = 500;

  /*
   * Steam's server toasts wait up to 20 s for data before showing and are dropped without it
   * (sp.js LoadServerToastRequiredData): Wishlist and Async Game need their game known to this
   * Steam (Steam's tests name Half-Life 2 and Dota 2), Gift Received a friend whose name and
   * avatar are loaded (its test picks one at random). These run Steam's test with one of yours.
   * Trade Offer's test takes no friend, so it stays Steam's.
   */
  const STEAMID64_BASE = 76561197960265728n;
  // Your most recently played library game
  const yourGame = () =>
    SE.run(() =>
      [...SE.appStore().allApps]
        .filter((app) => app?.app_type === 1)
        .sort((a, b) => (b.rt_last_time_played || 0) - (a.rt_last_time_played || 0))[0]?.appid) || 0;
  // A friend whose name and avatar are loaded, as Steam's check wants (64-bit SteamID string)
  const yourFriend = () => {
    const friends = SE.run(() => SE.global('g_FriendsUIApp', (app) => app.FriendStore).FriendStore.allFriends) || [];
    const friend = friends.find((f) => SE.run(() => f.display_name && f.persona.avatar_url_medium));
    const account = friend && SE.run(() => friend.persona.GetAccountID());
    return account ? String(STEAMID64_BASE + BigInt(account)) : undefined;
  };
  const OWN_DATA = {
    'Wishlist': ['TestWishlist', () => [yourGame()]],
    'Async Game': ['TestAsyncGame', () => [yourGame()]],
    'Gift Received': ['TestGift', () => [yourFriend()]],
  };
  // Entries that can't toast from a test here, said beside them
  const NOTES = {
    'Moderator Message': 'bell only',
    'Item Announcement': 'needs TF2 items',
    'Trade Offer': 'a random friend',
  };

  // Every entry: { name, run, note }. Steam's targets first, in its order, then the extras.
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
      const own = OWN_DATA[name];
      const run = own && typeof s[own[0]] === 'function' ? () => s[own[0]](...own[1]()) : test;
      list.push({ name, run, note: NOTES[name] || '' });
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
    /* The theme's thin dark scrollbar (core/scrollbars.css doesn't reach a shadow root) */
    ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-button { display: none; }
    ::-webkit-scrollbar-thumb { min-height: 40px; border: 3px solid transparent; border-radius: 999px; background: rgba(255, 255, 255, .18) padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .3) padding-box; }
    .panel { box-sizing: border-box; display: flex; flex-direction: column; width: 344px; max-height: 100%; border-radius: 10px; background: #16191e; color: #c6ccd4; box-shadow: 0 12px 40px rgba(0, 0, 0, .6); font: 12px/1.4 system-ui, sans-serif; overflow: hidden; }
    .head { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid #252a31; }
    .title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: #fff; }
    .hint { color: #6f7883; }
    button { font: inherit; color: inherit; }
    .list { overflow: auto; padding: 4px 8px 12px; }
    .entry { display: flex; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .entry:hover { background: #252a31; color: #fff; }
    .entry { justify-content: space-between; gap: 8px; }
    .note { flex: none; font-size: 11px; color: #6f7883; }
    .entry:focus-visible, .small:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 1px; }
    .small { padding: 3px 8px; border: 0; border-radius: 6px; background: #252a31; cursor: pointer; }
    /* The tools on a row of their own: beside the title, six buttons wrapped in a 344 px panel */
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .small:hover { background: #313741; color: #fff; }
    .empty { padding: 6px 8px; color: #6f7883; }
    .controls { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; }
    .controls [hidden] { display: none; }
    .seg { display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: #0f1115; justify-self: start; }
    .seg button { padding: 3px 10px; border: 0; border-radius: 5px; background: none; cursor: pointer; }
    .seg button[aria-pressed="true"] { background: #313741; color: #fff; }
    .seg button:focus-visible, .find:focus-visible, .check input:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 1px; }
    .check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .find { box-sizing: border-box; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: #252a31; color: #fff; font: inherit; }
    .find::placeholder { color: #6f7883; }
    .small[aria-pressed="true"] { background: #7cc4ff; color: #0f1115; }
    h3 { margin: 10px 4px 2px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #6f7883; }
    .report { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 12px; border-bottom: 1px solid #252a31; }
    .report[hidden] { display: none; }
    .report pre { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; font: 11px/1.45 ui-monospace, Consolas, monospace; color: #c6ccd4; }
  </style>
  <div class="panel" role="dialog" aria-label="Toast preview">
    <div class="head">
      <div class="title">Toasts <span><button class="small" data-hide>Hide</button> <button class="small" data-stop>Stop</button></span></div>
      <div class="actions"><button class="small" data-hold aria-pressed="false">Hold</button><button class="small" data-burst>Burst</button><button class="small" data-pair>Pair</button><button class="small" data-record></button></div>
      <div class="controls" data-controls></div>
      <label class="check"><input type="checkbox" data-delay> Fire after ${DELAY_S} s (time to bring a game to the front)</label>
      <label class="check"><input type="checkbox" data-show-all> Show all (past Steam's toast settings, real toasts too)</label>
      <input class="find" type="search" placeholder="Filter toasts" aria-label="Filter toasts" data-find>
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
  const controls = root.querySelector('[data-controls]');
  const find = root.querySelector('[data-find]');
  const delayBox = root.querySelector('[data-delay]');
  const showAllBox = root.querySelector('[data-show-all]');
  const holdButton = root.querySelector('[data-hold]');
  let current = [];
  const timers = new Set();
  const intervals = new Set();

  /* ---------- Record: the toast recorder (client/loader.js) ---------- */

  const LOG_FLAG = 'se-toast-log';
  // One key per toast window (client/loader.js): "se-toast-log:<opened at>:<title>"
  const LOG_PREFIX = 'se-toast-log:';
  const logKeys = () => SE.run(() => Object.keys(localStorage).filter((k) => k.startsWith(LOG_PREFIX))) || [];
  const recording = () => SE.run(() => localStorage.getItem(LOG_FLAG) === '1') === true;

  // Each recorded window: when it opened, its name's end, and every step with its time
  function renderLog() {
    recordButton.textContent = recording() ? 'Recording' : 'Record';
    const list = logKeys()
      .map((k) => SE.run(() => JSON.parse(localStorage.getItem(k))))
      .filter((entry) => entry && Array.isArray(entry.steps))
      .sort((a, b) => a.at - b.at);
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

  const esc = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  /* ---------- The head: the Toasts settings, as the next toast uses them ---------- */

  const settingOn = (key, value) => SE.settings?.get(key) === value;
  function renderControls() {
    const shown = {
      'toast-style': !settingOn('toasts', 'off'),
      'toast-position': !settingOn('toasts', 'off') && settingOn('toast-style', 'compact'),
      'toasts-in-game': !settingOn('toasts', 'off'),
    };
    controls.innerHTML = CONTROLS.map(([key, label, values]) => {
      const hidden = shown[key] === false ? ' hidden' : '';
      const now = SE.settings?.get(key);
      const buttons = values
        .map(([value, word]) => `<button data-set="${key}" data-value="${value}" aria-pressed="${now === value}">${word}</button>`)
        .join('');
      return `<span${hidden}>${label}</span><span class="seg" role="group" aria-label="${label}"${hidden}>${buttons}</span>`;
    }).join('');
  }

  // Entries the filter keeps, each with its index in `current`
  const shownEntries = () => {
    const q = find.value.trim().toLowerCase();
    return current.map((entry, i) => ({ ...entry, i })).filter((entry) => !q || entry.name.toLowerCase().includes(q));
  };

  function renderList() {
    if (!current.length) {
      list.innerHTML = '<div class="empty">Steam\'s notification store wasn\'t found from this window.</div>';
      return;
    }
    const groups = new Map([...GROUPS.map(([name]) => [name, []]), ['System', []]]);
    for (const entry of shownEntries()) groups.get(groupOf(entry.name)).push(entry);
    const parts = [];
    for (const [name, items] of groups) {
      if (!items.length) continue;
      parts.push(`<h3>${name}</h3>`, ...items.map((entry) => `<button class="entry" data-i="${entry.i}"><span>${esc(entry.name)}</span>${entry.note ? `<span class="note">${esc(entry.note)}</span>` : ''}</button>`));
    }
    list.innerHTML = parts.join('') || '<div class="empty">No toast matches.</div>';
  }

  function render() {
    renderLog();
    renderControls();
    current = entries();
    if (!countdown) {
      hint.textContent = showAllBox.checked
        ? "Show all: Steam's toast settings are bypassed until it's off."
        : "Steam's own toast settings apply (its toasts off, or off in game: nothing shows).";
    }
    renderList();
  }

  /* ---------- Show all: Steam's toast settings bypassed ---------- */

  // target -> its own showToast / bCritical as they were ({ has, value } each), to put back
  const bypassed = new Map();
  const ownProp = (obj, key) => ({ has: Object.prototype.hasOwnProperty.call(obj, key), value: obj[key] });
  const putBack = (obj, key, was) => {
    if (was.has) obj[key] = was.value;
    else delete obj[key];
  };
  function setShowAll(on) {
    if (!on) {
      for (const [target, was] of bypassed) {
        SE.run(() => {
          putBack(target, 'showToast', was.showToast);
          putBack(target, 'bCritical', was.bCritical);
        });
      }
      bypassed.clear();
      return;
    }
    const targets = SE.run(() => Object.values(store().GetNotificationTargets())) || [];
    for (const target of targets) {
      if (!target || typeof target !== 'object' || bypassed.has(target)) continue;
      SE.run(() => {
        bypassed.set(target, { showToast: ownProp(target, 'showToast'), bCritical: ownProp(target, 'bCritical') });
        target.showToast = true;
        target.bCritical = true;
      });
    }
  }

  /* ---------- Firing: now, or after the countdown ---------- */

  let countdown = null; // the running countdown's stop()
  function fire(label, fn) {
    countdown?.();
    countdown = null;
    const go = () => {
      SE.run(fn);
      if (holding) later(applyHold, HOLD_CATCH_MS);
    };
    if (!delayBox.checked) return go();
    let left = DELAY_S;
    const say = () => (hint.textContent = `${label} in ${left} s: bring the game to the front.`);
    say();
    const stop = every(1000, () => {
      left -= 1;
      if (left > 0) return say();
      stop();
      countdown = null;
      hint.textContent = `${label}: fired.`;
      go();
    });
    countdown = stop;
  }

  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  /* ---------- Hold: the toasts kept on screen ---------- */

  let holding = false;
  // Every toast window open now takes the hold (or lets go); the hub carries it to later ones
  const applyHold = () => {
    for (const win of toastWindows()) SE.run(() => win.__seToasts?.hold?.(holding));
  };
  function toggleHold() {
    holding = !holding;
    holdButton.setAttribute('aria-pressed', String(holding));
    holdButton.textContent = holding ? 'Holding' : 'Hold';
    applyHold();
  }

  // The shown entries (the filter's), or a mixed four with none, one after another
  function burst() {
    const picked = find.value.trim()
      ? shownEntries().slice(0, BURST_MAX)
      : BURST.map((name) => current.find((entry) => entry.name === name)).filter(Boolean);
    if (!picked.length) return;
    fire(`${picked.length} toasts`, () => picked.forEach((entry, i) => later(() => SE.run(entry.run), i * BURST_GAP_MS)));
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
    const ok = Boolean(await SE.copy?.(text));
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
    else if (button.hasAttribute('data-hold')) toggleHold();
    else if (button.dataset.set) {
      SE.settings?.set(button.dataset.set, button.dataset.value);
      renderControls();
    }
    else if (button.hasAttribute('data-clear')) {
      for (const k of logKeys()) SE.run(() => localStorage.removeItem(k));
      renderLog();
    }
    else if (button.dataset.i) {
      const entry = current[Number(button.dataset.i)];
      if (entry) fire(entry.name, entry.run);
    }
  };
  const onFind = () => renderList();
  const onShowAll = () => {
    setShowAll(showAllBox.checked);
    render();
  };
  // The Toasts settings changed elsewhere (Theme settings): the head follows
  const offSettings = SE.settings?.on?.(() => renderControls());

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
    setShowAll(false);
    if (holding) {
      holding = false;
      applyHold();
    }
    offSettings?.();
    root.removeEventListener('click', onClick);
    find.removeEventListener('input', onFind);
    showAllBox.removeEventListener('change', onShowAll);
    host.remove();
    delete window.__seToastPreview;
  };

  root.addEventListener('click', onClick);
  find.addEventListener('input', onFind);
  showAllBox.addEventListener('change', onShowAll);
  render();
  document.body.append(host);

  window.__seToastPreview = { toggle, destroy };
})();
