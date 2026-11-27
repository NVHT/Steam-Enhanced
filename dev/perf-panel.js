/*
 * Profiler, continued (dev/perf.js, which loads this on the panel's first open): its panel, in a
 * closed shadow root untouched by any page CSS. It reads and drives perf.js's counts through
 * window.__sePerfParts (report, reset, the probe, the snapshot, the view's sort and filter) and
 * adds `toggle` there. Its listeners and timers are the native ones perf.js kept, or added while
 * perf.js is quiet, so none of it counts as the theme's.
 */
(() => {
  const parts = window.__sePerfParts;
  if (!parts || parts.toggle) return;
  const { view, plainSetInterval, plainClearInterval, plainFrame, plainCancelFrame, addListener, removeListener } = parts;

  let host = null;
  let output = null;
  let controls = null;
  let ticker = 0;
  let redraw = 0;

  const render = () => {
    if (output) output.textContent = parts.report(true);
  };
  // Typing in the filter redraws once a frame
  const renderSoon = () => {
    if (!redraw) {
      redraw = plainFrame.call(window, () => {
        redraw = 0;
        render();
      });
    }
  };

  const syncControls = () => {
    if (!controls) return;
    if (!parts.hasSnapshot() && view.sort === 'change') view.sort = 'self';
    for (const button of controls.sorts) button.setAttribute('aria-pressed', String(button.dataset.sort === view.sort));
    controls.change.hidden = !parts.hasSnapshot();
    controls.live.setAttribute('aria-pressed', String(view.live));
    controls.snapshot.textContent = parts.hasSnapshot() ? 'Clear snapshot' : 'Snapshot';
  };

  const syncTicker = () => {
    const run = view.live && !!host?.isConnected && document.visibilityState === 'visible';
    if (run && !ticker) {
      render();
      // Live view: the counts change with no event to redraw on, so it polls, once a second, only
      // while the panel is shown and the page visible (native timer: not counted as the theme's)
      ticker = plainSetInterval.call(window, render, 1000);
    } else if (!run && ticker) {
      plainClearInterval.call(window, ticker);
      ticker = 0;
    }
  };

  const build = () => {
    host = document.createElement('se-perf');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        /* The theme's thin dark scrollbar (core/scrollbars.css doesn't reach a shadow root) */
        ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
        ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
        ::-webkit-scrollbar-button { display: none; }
        ::-webkit-scrollbar-thumb { min-height: 40px; border: 3px solid transparent; border-radius: 999px; background: rgba(255, 255, 255, .18) padding-box; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .3) padding-box; }
        :host { all: initial; position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; }
        .panel { width: min(880px, calc(100vw - 24px)); max-height: 70vh; display: flex; flex-direction: column;
          background: #10131a; color: #e6e8eb; border: 1px solid #2b3240; border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, .5); font: 12px/1.45 Consolas, monospace; }
        .bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #2b3240; }
        .bar b { flex: 1; font-weight: 600; }
        button { font: inherit; color: inherit; background: #1d2330; border: 1px solid #2b3240; border-radius: 4px;
          padding: 4px 10px; cursor: pointer; }
        button:hover { background: #283042; }
        button[hidden] { display: none; }
        button[aria-pressed="true"] { background: #2f3a52; border-color: #4a5a7a; }
        .seg { display: inline-flex; }
        .seg button { border-radius: 0; margin-left: -1px; }
        .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
        .seg button:last-child, .seg button:has(+ [hidden]) { border-radius: 0 4px 4px 0; }
        input { flex: 1; min-width: 120px; font: inherit; color: inherit; background: #0b0e13; border: 1px solid #2b3240;
          border-radius: 4px; padding: 4px 8px; }
        input:focus-visible, button:focus-visible { outline: 2px solid #6d8fd8; outline-offset: 1px; }
        pre { margin: 0; padding: 8px 12px; overflow: auto; white-space: pre; }
      </style>
      <div class="panel">
        <div class="head">
          <div class="bar"><b>Profiler</b>
            <button data-act="reset">Reset</button><button data-act="probe">Probe CSS</button>
            <button data-act="snapshot">Snapshot</button><button data-act="live" aria-pressed="false">Live</button>
            <button data-act="copy">Copy</button><button data-act="disarm">Disarm</button><button data-act="close">Close</button>
          </div>
          <div class="bar">Sort
            <span class="seg"><button data-sort="self" aria-pressed="true">self</button><button data-sort="calls">calls</button><button data-sort="max">slowest</button><button data-sort="layout">layout</button><button data-sort="change" hidden>since snapshot</button></span>
            <input type="search" placeholder="Filter by site or kind (dock, event:click…)" spellcheck="false">
          </div>
        </div>
        <pre></pre>
      </div>`;
    output = shadow.querySelector('pre');
    controls = {
      sorts: [...shadow.querySelectorAll('[data-sort]')],
      change: shadow.querySelector('[data-sort="change"]'),
      live: shadow.querySelector('[data-act="live"]'),
      snapshot: shadow.querySelector('[data-act="snapshot"]'),
    };
    const filter = shadow.querySelector('input');
    filter.addEventListener('input', () => {
      view.filter = filter.value;
      renderSoon();
    });
    // Typed letters stay in the field (Steam's type-to-search); shortcuts (the profiler's own) pass
    filter.addEventListener('keydown', (event) => {
      if (!event.ctrlKey && !event.altKey && !event.metaKey) event.stopPropagation();
    });
    shadow.querySelector('.head').addEventListener('click', async (event) => {
      const button = event.target.closest?.('button');
      if (!button) return;
      const act = button.dataset.act;
      if (button.dataset.sort) view.sort = button.dataset.sort;
      else if (act === 'reset') parts.reset();
      else if (act === 'probe') parts.runProbe();
      else if (act === 'snapshot') {
        if (parts.hasSnapshot()) parts.clearSnapshot();
        else parts.takeSnapshot();
      } else if (act === 'live') {
        view.live = !view.live;
        syncTicker();
      } else if (act === 'copy') {
        const text = parts.report();
        const done = await navigator.clipboard?.writeText(text).then(() => true, () => false);
        if (!done) window.__se?.copy?.(text);
        button.textContent = 'Copied';
      } else if (act === 'disarm') {
        try {
          localStorage.removeItem(parts.ARM_KEY);
        } catch { /* storage refused: the site stays armed until it's cleared */ }
        button.textContent = 'Disarmed';
      } else if (act === 'close') {
        toggle();
        return;
      }
      syncControls();
      render();
    });
  };

  const toggle = () => {
    if (host?.isConnected) {
      host.remove();
      removeListener.call(document, 'visibilitychange', syncTicker);
      syncTicker();
      plainCancelFrame.call(window, redraw);
      redraw = 0;
      return;
    }
    if (!host) parts.quietly(build);
    document.documentElement.append(host);
    // Native: toggled from the theme's hotkey, the wrapped one would count it as the theme's
    addListener.call(document, 'visibilitychange', syncTicker);
    syncControls();
    render();
    syncTicker();
  };

  parts.toggle = toggle;
})();
