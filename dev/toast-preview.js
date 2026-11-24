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
    .panel { box-sizing: border-box; display: flex; flex-direction: column; width: 280px; max-height: 100%; border-radius: 10px; background: #16191e; color: #c6ccd4; box-shadow: 0 12px 40px rgba(0, 0, 0, .6); font: 12px/1.4 system-ui, sans-serif; overflow: hidden; }
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
  </style>
  <div class="panel" role="dialog" aria-label="Toast preview">
    <div class="head">
      <div class="title">Toasts <span><button class="small" data-burst>Burst</button> <button class="small" data-hide>Hide</button> <button class="small" data-stop>Stop</button></span></div>
      <div class="hint" data-hint></div>
    </div>
    <div class="list" data-list></div>
  </div>`;

  const list = root.querySelector('[data-list]');
  const hint = root.querySelector('[data-hint]');
  let current = [];
  const timers = new Set();

  function render() {
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

  const onClick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-hide')) toggle();
    else if (button.hasAttribute('data-stop')) destroy();
    else if (button.hasAttribute('data-burst')) burst();
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
    root.removeEventListener('click', onClick);
    host.remove();
    delete window.__seToastPreview;
  };

  root.addEventListener('click', onClick);
  render();
  document.body.append(host);

  window.__seToastPreview = { toggle, destroy };
})();
