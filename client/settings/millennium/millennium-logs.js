/*
 * Millennium Settings › Logs: the sources as tabs across the top (each with its error and warning
 * counts), a toolbar (search, All / Errors / Warnings, text size, copy), and the open log as a
 * table: Time, Level, Message, Where. The first source opens straight away.
 *
 * Reads Millennium's own log viewer (RenderLogViewer, kept mounted and hidden) for its logData
 * and draws its own view, so picking a source never retitles the page. Messages are decoded as
 * UTF-8 (Millennium's atob() left multi-byte characters such as "—" as "â€”") and stripped of
 * ANSI colour codes.
 *
 * Part of client/settings/millennium/: registers on window.__seMillParts; millennium-pages.js runs
 * it from its rAF pass (step, layout).
 */
((SE) => {
  const { attr: setAttr, run, esc } = SE;
  const parts = (window.__seMillParts = window.__seMillParts || {});
  const icon = (name) => parts.icon?.(name) || '';

  const LEVEL = { 0: 'info', 1: 'warning', 2: 'error' };
  const LEVEL_TEXT = { info: 'Info', warning: 'Warn', error: 'Error' };
  const MAX_ROWS = 2000; // the newest lines a view draws; the footer says when it cuts
  const FONT = { min: 11, max: 16, base: 13 };

  let source = '';
  let level = 'all';
  let query = '';
  let font = FONT.base;
  let copiedUntil = 0;

  const decoder = new TextDecoder('utf-8');
  const ANSI = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
  const decoded = new WeakMap(); // a source's logs array → its decoded lines

  function decode(b64) {
    try {
      const bin = atob(b64 || '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return decoder.decode(bytes).replace(ANSI, '').replace(/\r?\n$/, '');
    } catch {
      return '';
    }
  }

  function linesOf(log) {
    const list = log?.logs || [];
    let out = decoded.get(list);
    if (!out) {
      out = list.map((l) => {
        const file = l.file ? String(l.file).split(/[\\/]/).pop() : '';
        return {
          level: LEVEL[l.level] || 'info',
          time: l.timestamp || '',
          message: decode(l.message),
          where: [l.source, file && (l.line ? `${file}:${l.line}` : file)].filter(Boolean).join(' · '),
        };
      });
      decoded.set(list, out);
    }
    return out;
  }

  // Millennium's viewer component: its state holds every source (logData).
  function viewerOf(body) {
    const start = [...body.children].find((c) => !c.hasAttribute('data-se-own')) || body;
    for (let f = SE.fiber(start), n = 0; f && n < 30; f = f.return, n++) {
      const st = f.stateNode?.state;
      if (st && typeof st === 'object' && 'logData' in st && 'selectedLog' in st) return f.stateNode;
    }
    return null;
  }

  // A source's error and warning counts, from Millennium's levels (no decoding needed).
  const counts = (log) => ({
    error: (log?.logs || []).reduce((a, l) => a + (l.level === 2), 0),
    warning: (log?.logs || []).reduce((a, l) => a + (l.level === 1), 0),
  });

  function rootOf(body) {
    let root = body.querySelector(':scope > .se-logv');
    if (root) return root;
    root = parts.make(
      'div',
      'se-logv',
      '<div class="se-logv-tabs" role="tablist" aria-label="Sources"></div>' +
        '<div class="se-logv-tools">' +
        '<label class="se-mfilter"><span class="se-search-icon" aria-hidden="true"></span><input type="search" placeholder="Search this log" aria-label="Search this log"></label>' +
        '<span class="se-seg" role="group" aria-label="Level">' +
        ['all', 'error', 'warning'].map((k) => `<button type="button" data-level="${k}">${k === 'all' ? 'All' : k === 'error' ? 'Errors' : 'Warnings'} <b></b></button>`).join('') +
        '</span>' +
        '<span class="se-logv-icons">' +
        `<button type="button" class="se-mbtn" data-size="icon" data-tone="ghost" data-act="smaller" aria-label="Smaller text" title="Smaller text">${icon('minus')}</button>` +
        `<button type="button" class="se-mbtn" data-size="icon" data-tone="ghost" data-act="bigger" aria-label="Bigger text" title="Bigger text">${icon('plus')}</button>` +
        `<button type="button" class="se-mbtn" data-size="icon" data-tone="ghost" data-act="copy" aria-label="Copy these lines" title="Copy these lines">${icon('copy')}</button>` +
        '</span></div>' +
        '<section class="se-logv-panel"><div class="se-logv-body" role="table" aria-label="Log"></div><footer class="se-logv-foot"></footer></section>'
    );

    root.querySelector('.se-logv-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-src]');
      if (!b || b.dataset.src === source) return;
      source = b.dataset.src;
      level = 'all';
      draw(body);
    });
    // A wheel over the tabs scrolls them sideways when there are more than fit.
    root.querySelector('.se-logv-tabs').addEventListener(
      'wheel',
      (e) => {
        const tabs = e.currentTarget;
        if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        tabs.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false }
    );
    root.querySelector('.se-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      level = b.dataset.level;
      draw(body);
    });
    const input = root.querySelector('input');
    input.addEventListener('input', () => {
      query = input.value;
      draw(body);
    });
    root.querySelector('.se-logv-icons').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'smaller' || act === 'bigger') {
        font = Math.min(FONT.max, Math.max(FONT.min, font + (act === 'bigger' ? 1 : -1)));
        draw(body);
      } else if (act === 'copy') {
        const text = (root.__shown || []).map((l) => `${l.time ? `${l.time} ` : ''}${l.message}${l.where ? ` (${l.where})` : ''}`).join('\n');
        Promise.resolve(run(() => SE.copy(text))).then(() => {
          copiedUntil = Date.now() + 2000;
          draw(body);
          setTimeout(() => draw(body), 2050);
        });
      }
    });
    body.prepend(root);
    return root;
  }

  function draw(body) {
    const v = viewerOf(body);
    const data = v?.state?.logData;
    const root = body.querySelector(':scope > .se-logv');
    if (!root || !Array.isArray(data)) return;

    if (!data.some((l) => l.name === source)) source = data[0]?.name || '';
    const log = data.find((l) => l.name === source);
    const all = linesOf(log);
    const c = counts(log);

    // Tabs
    const tabs = root.querySelector('.se-logv-tabs');
    const tabsHtml = data
      .map((l) => {
        const n = counts(l);
        const on = l.name === source;
        return (
          `<button type="button" role="tab" data-src="${esc(l.name)}" aria-selected="${on}"${on ? ' data-on' : ''}>${esc(l.name)}` +
          (n.error ? `<b data-k="error" aria-label="${n.error} errors">${n.error}</b>` : '') +
          (n.warning ? `<b data-k="warning" aria-label="${n.warning} warnings">${n.warning}</b>` : '') +
          '</button>'
        );
      })
      .join('');
    if (tabs.dataset.sig !== tabsHtml) {
      tabs.dataset.sig = tabsHtml;
      tabs.innerHTML = tabsHtml;
      // Keep the open tab in view (scrollIntoView would also scroll the page).
      const on = tabs.querySelector('[data-on]');
      if (on && (on.offsetLeft < tabs.scrollLeft || on.offsetLeft + on.offsetWidth > tabs.scrollLeft + tabs.clientWidth)) {
        tabs.scrollLeft = on.offsetLeft - 8;
      }
    }

    // Level filter
    for (const b of root.querySelectorAll('.se-seg [data-level]')) {
      const sel = b.dataset.level === level;
      setAttr(b, 'data-on', sel ? '' : null);
      setAttr(b, 'aria-pressed', sel ? 'true' : 'false');
      const n = String(b.dataset.level === 'all' ? all.length : c[b.dataset.level]);
      if (b.lastChild.textContent !== n) b.lastChild.textContent = n;
    }
    const input = root.querySelector('input');
    if (input.value !== query && document.activeElement !== input) input.value = query;

    const copied = Date.now() < copiedUntil;
    const copyBtn = root.querySelector('[data-act="copy"]');
    const copyIcon = copied ? 'done' : 'copy';
    if (copyBtn.dataset.icon !== copyIcon) {
      copyBtn.dataset.icon = copyIcon;
      copyBtn.innerHTML = icon(copyIcon);
      copyBtn.title = copied ? 'Copied' : 'Copy these lines';
    }

    // The lines
    const q = query.trim().toLowerCase();
    const kept = all.filter(
      (l) => (level === 'all' || l.level === level) && (!q || l.message.toLowerCase().includes(q) || l.where.toLowerCase().includes(q))
    );
    const shown = kept.length > MAX_ROWS ? kept.slice(-MAX_ROWS) : kept;
    root.__shown = shown;
    const bodyEl = root.querySelector('.se-logv-body');
    SE.cssVar(bodyEl, '--se-logv-font', `${font}px`);
    const sig = `${source}\u0000${level}\u0000${q}\u0000${all.length}`;
    if (bodyEl.dataset.sig !== sig) {
      bodyEl.dataset.sig = sig;
      bodyEl.innerHTML =
        '<div class="se-logv-row" data-head role="row"><span role="columnheader">Time</span><span role="columnheader">Level</span><span role="columnheader">Message</span><span role="columnheader">Where</span></div>' +
        (shown.length
          ? shown
              .map(
                (l) =>
                  `<div class="se-logv-row" data-lv="${l.level}" role="row"><span role="cell" class="se-logv-time">${esc(l.time)}</span>` +
                  `<span role="cell"><i class="se-logv-lv" data-lv="${l.level}">${LEVEL_TEXT[l.level]}</i></span>` +
                  `<span role="cell" class="se-logv-msg">${esc(l.message)}</span><span role="cell" class="se-logv-where">${esc(l.where)}</span></div>`
              )
              .join('')
          : `<div class="se-logv-empty">${all.length ? 'No lines match.' : 'This source has no lines yet.'}</div>`);
      bodyEl.scrollTop = bodyEl.scrollHeight; // a log opens at its newest lines
    }

    const foot = root.querySelector('.se-logv-foot');
    const words =
      kept.length === all.length
        ? `${all.length.toLocaleString()} ${all.length === 1 ? 'line' : 'lines'}`
        : `${kept.length.toLocaleString()} of ${all.length.toLocaleString()} lines`;
    const footText = kept.length > MAX_ROWS ? `${words} · showing the newest ${MAX_ROWS.toLocaleString()}` : words;
    if (foot.textContent !== footText) foot.textContent = footText;
  }

  function step(content) {
    const body = content.querySelector('.DialogBody');
    if (!body) return;
    const v = viewerOf(body);
    if (!Array.isArray(v?.state?.logData) || !v.state.logData.length) {
      // Loading, or nothing logged yet: Millennium's own spinner and empty card show.
      body.querySelector(':scope > .se-logv')?.remove();
      setAttr(body, 'data-se-logv', null);
      return;
    }
    setAttr(body, 'data-se-logv', '');
    const root = rootOf(body);
    if (body.firstElementChild !== root) body.prepend(root);
    // Millennium's header shows a source's name once one is picked there; ours never picks one.
    const header = content.querySelector('.DialogHeader');
    if (header && !header.querySelector('*') && header.textContent !== 'Logs') header.textContent = 'Logs';
    draw(body);
  }

  // The table reaches the window's foot, above its line count.
  function layout(content) {
    const panel = content.querySelector('.se-logv-panel');
    if (panel) parts.fillHeight?.(panel, content, '--se-logv-h', 240);
  }

  parts.logs = {
    step,
    layout,
    reset() {
      level = 'all';
      query = '';
    },
    own: '.se-logv',
    marks: ['data-se-logv'],
    vars: ['--se-logv-h'],
  };
})(window.__se);
