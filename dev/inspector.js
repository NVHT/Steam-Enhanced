/*
 * Element picker, part 2 of 2 (its reports: dev/inspector-report.js): a theming aid.
 * Ctrl+Shift+E (loaded on demand by core/core.js) turns it on in the current Steam window or
 * web page; the element under the pointer is outlined.
 *
 *   Click or Space   capture the outlined element (Space works for hover-only menus)
 *   [ / ]            step out to the parent / back in toward the pointer
 *   F                freeze hovers: the page stops seeing the pointer, so a hover popup stays
 *                    open while the pointer moves onto it (F again to unfreeze)
 *   S                report by CSS selector (or the "By selector" button): for elements that
 *                    can't be pointed at (hidden, covered, gone when the pointer moves)
 *   P                report the whole page instead (or the "Whole page" button)
 *   D                catch the next dialog (or the "Catch next dialog" button)
 *   R                capture the shown report's element again, found anew by its CSS path (or
 *                    the report's "Again" button): after a dev reload, a page reload or a change
 *   Esc              close (or stop waiting for a dialog, or drop an armed compare)
 *
 * A capture copies a plain-text report to the clipboard and shows it in a panel: the page,
 * the theme files actually loaded (to spot a stale build), the ancestor chain with classes,
 * an outline of the element's whole subtree (repeated siblings counted), the element's
 * markup (long attributes trimmed), its inline style, key computed styles, the stylesheet
 * rules that match it (Steam's cross-origin sheets included: they are fetched and parsed,
 * since the page can't read them), and the paint stack under the pointer: every element that
 * paints there, front to back, with what it paints (background, border, radius, outline,
 * shadow, filter, opacity, blend, clip, mask) on itself and its ::before/::after, plus the
 * shadows of nearby elements that reach the point (a box's shadow paints outside its box, so
 * hit-testing alone never finds it). For colour that has no visible owner. Pasted back into
 * a chat, that is enough to target the element. It also lists the theme tokens (--se-*) its
 * rules and inline style read or set, with their values on it.
 *
 * The panel keeps the last 5 reports (tabs over the text; Copy copies the one shown), in
 * sessionStorage so they outlast a reload of the window or tab. Compare arms a diff: the next
 * capture's report opens with the computed styles that differ from the shown one's (A → B),
 * once; with R, the same element before and after a change.
 *
 * Catch next dialog: for dialogs too brief to point at (a wait dialog shown while a page
 * loads). It waits for the next dialog to appear (a <dialog>, a [role=dialog], Steam's
 * .newmodal or React ModalPosition, or anything whose class names a Modal or Dialog) and
 * reports it the moment it shows, then again a frame later if it is still up (the fuller of
 * the two). The wait survives a reload of the tab (sessionStorage; core/core.js loads the
 * picker at once while it's set), so arm it, then reload or do what opens the dialog.
 *
 * The UI lives in a closed shadow root so neither Steam's CSS nor the theme's can touch it,
 * and nothing runs until the shortcut is pressed (or a dialog catch is armed).
 */
(() => {
  const KEY = '__seInspector';
  if (window[KEY]) {
    window[KEY].toggle();
    return;
  }
  // The report builder: dev/inspector-report.js, loaded just before this file
  const { report, pageReport, pathOf, snapshot, diff } = window.__seInspectorReport || {};
  if (!report) return;

  /* ---------- UI (closed shadow root) ---------- */

  const host = document.createElement('se-inspector');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      /* The theme's thin dark scrollbar (core/scrollbars.css doesn't reach a shadow root) */
      ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
      ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
      ::-webkit-scrollbar-button { display: none; }
      ::-webkit-scrollbar-thumb { min-height: 40px; border: 3px solid transparent; border-radius: 999px; background: rgba(255, 255, 255, .18) padding-box; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .3) padding-box; }
      :host { all: initial; }
      * { box-sizing: border-box; font: 500 12px/1.45 "Segoe UI", system-ui, sans-serif; }
      .box { position: fixed; pointer-events: none; border: 2px solid #7cc4ff; border-radius: 3px;
             background: rgba(124, 196, 255, .12); transition: all .05s linear; }
      .tag { position: fixed; pointer-events: none; max-width: 70vw; padding: 3px 8px; border-radius: 6px;
             background: #0f1115; color: #e6e8eb; box-shadow: 0 0 0 1px rgba(124,196,255,.5);
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tag b { color: #7cc4ff; font-weight: 700; }
      .hint { position: fixed; left: 50%; bottom: 18px; translate: -50% 0; padding: 7px 14px; border-radius: 999px;
              background: rgba(15, 17, 21, .92); color: #b8c0c8; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
      .hint kbd { padding: 1px 6px; border-radius: 4px; background: #262c35; color: #e6e8eb; font-family: Consolas, monospace; }
      .hint button { height: 24px; margin-left: 6px; pointer-events: auto; }
      .panel { position: fixed; right: 16px; bottom: 16px; width: min(560px, calc(100vw - 32px)); max-height: 70vh;
               display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; pointer-events: auto;
               background: #171a20; color: #e6e8eb; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 24px 48px -16px #000; }
      .panel header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .panel header span { flex: 1 1 120px; font-weight: 700; }
      .tabs { display: flex; flex-wrap: wrap; gap: 4px; }
      .tabs button { height: 22px; padding: 0 8px; font: 500 11px/1 Consolas, monospace; color: #b8c0c8; }
      .tabs button.on { background: rgba(124, 196, 255, .2); color: #7cc4ff; }
      .note { padding: 6px 10px; border-radius: 8px; background: rgba(255, 184, 107, .12); color: #ffb86b; }
      button:disabled { opacity: .4; cursor: default; }
      .hint .cmp { color: #7cc4ff; font-weight: 700; }
      .panel textarea { flex: 1; min-height: 240px; resize: none; padding: 10px; border: 0; border-radius: 10px;
                        background: #0f1115; color: #b8c0c8; font: 11px/1.5 Consolas, monospace; white-space: pre; }
      button { height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: #262c35; color: #e6e8eb;
               cursor: pointer; }
      button:hover { background: #2c3440; }
      button.primary { background: #7cc4ff; color: #0f1115; font-weight: 700; }
      .hint.frozen { box-shadow: 0 0 0 2px #7cc4ff; }
      .hint.frozen .freeze-state { color: #7cc4ff; font-weight: 700; }
      .ask { position: fixed; left: 50%; bottom: 58px; translate: -50% 0; display: flex; gap: 6px; padding: 8px;
             border-radius: 999px; pointer-events: auto; background: rgba(15, 17, 21, .96); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
      .ask input { width: min(520px, 60vw); height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: #262c35;
                   color: #e6e8eb; font: 12px Consolas, monospace; outline: 0; }
      .ask input:focus { box-shadow: 0 0 0 1px #7cc4ff; }
      [hidden] { display: none !important; }
    </style>
    <div class="box" hidden></div>
    <div class="tag" hidden></div>
    <div class="hint" hidden>Pick an element: <kbd>Click</kbd> or <kbd>Space</kbd> capture · <kbd>[</kbd> <kbd>]</kbd> parent / child · <kbd>F</kbd> <span class="freeze-state">freeze hovers</span> · <kbd>S</kbd> by selector · <kbd>P</kbd> whole page · <kbd>D</kbd> next dialog · <kbd>R</kbd> again · <kbd>Esc</kbd> close<span class="cmp" hidden></span><button class="page primary">Whole page</button><button class="ask-open">By selector</button><button class="catch">Catch next dialog</button></div>
    <form class="ask" hidden><input name="selector" placeholder="CSS selector, e.g. #workshop_item_hover .hover_box" autocomplete="off" spellcheck="false"><button class="primary" type="submit">Report</button><button class="ask-cancel" type="button">Cancel</button></form>
    <div class="hint wait" hidden>Waiting for the next dialog: reload the page or do what opens it · <kbd>Esc</kbd> stop</div>
    <div class="panel" hidden>
      <header><span class="title">Element report</span><button class="copy primary">Copy</button><button class="recapture" title="Capture this report's element again, found anew by its path (R)">Again</button><button class="compare" title="Diff the next capture against this report">Compare</button><button class="page">Whole page</button><button class="catch">Catch next dialog</button><button class="pick">Pick another</button><button class="close">Close</button></header>
      <div class="tabs" hidden></div>
      <div class="note" hidden></div>
      <textarea readonly spellcheck="false"></textarea>
    </div>`;
  const $ = (selector) => root.querySelector(selector);
  const ui = {
    box: $('.box'), tag: $('.tag'), hint: $('.hint'), wait: $('.wait'), panel: $('.panel'), text: $('textarea'),
    copy: $('.copy'), title: $('.panel .title'), ask: $('.ask'), askInput: $('.ask input'),
    tabs: $('.tabs'), note: $('.note'), recapture: $('.recapture'), compare: $('.compare'), cmp: $('.cmp'),
  };

  /* ---------- Picking ---------- */

  let active = false;
  let pointer = null; // element under the pointer
  let current = null; // outlined element (pointer, or an ancestor via [ ])
  let lastPoint = null; // pointer position, for the paint stack
  const trail = []; // elements stepped out of, for ]

  const own = (el) => el === host || host.contains(el);

  /*
   * Freeze: while on, the page never sees the pointer move, enter or leave anything, so a hover
   * popup opened before freezing stays open as the pointer moves onto it. Caught on window in
   * the capture phase, before the page's handlers (non-bubbling enter/leave events still pass
   * through window on their way down). CSS :hover still follows the pointer: only script-driven
   * hovers freeze.
   */
  let frozen = false;
  const HOVER_EVENTS = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave'];
  const shield = (event) => {
    if (!frozen || own(event.target)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const setFrozen = (on) => {
    frozen = on;
    ui.hint.classList.toggle('frozen', on);
    $('.freeze-state').textContent = on ? 'frozen (F to unfreeze)' : 'freeze hovers';
  };

  /* By selector: the first match is reported (the count of matches noted), wherever it is */
  const askSelector = () => {
    ui.ask.hidden = false;
    ui.askInput.focus();
    ui.askInput.select();
  };
  const closeAsk = () => {
    ui.ask.hidden = true;
  };
  const captureSelector = async (selector) => {
    let matches;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      notice(`Not a valid CSS selector: ${selector}`);
      return;
    }
    const el = [...matches].find((node) => !own(node));
    if (!el) {
      notice(`No element matches: ${selector}`);
      return;
    }
    closeAsk();
    const r = el.getBoundingClientRect();
    const note = `  — by selector ${selector}${matches.length > 1 ? ` (first of ${matches.length})` : ''}${r.width && r.height ? '' : '; it has no size now (hidden or empty)'}`;
    // Found again by the selector typed, not a built path: it names what was meant
    take(el, { title: 'Selector report', note, path: selector });
  };

  const outline = (el) => {
    current = el;
    if (!el) {
      ui.box.hidden = ui.tag.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(ui.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    ui.tag.innerHTML = '';
    const name = document.createElement('b');
    name.textContent = el.tagName.toLowerCase();
    ui.tag.append(name, `${el.id ? `#${el.id}` : ''}${[...el.classList].map((c) => `.${c}`).join('')}  ${Math.round(r.width)}×${Math.round(r.height)}`);
    ui.tag.style.left = `${Math.max(4, r.left)}px`;
    ui.tag.style.top = `${r.top > 30 ? r.top - 26 : r.bottom + 4}px`;
    ui.box.hidden = ui.tag.hidden = false;
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for windows without clipboard permission.
      ui.text.select();
      try {
        return document.execCommand('copy');
      } catch (__) {
        return false;
      }
    }
  };

  const flash = (button, text) => {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => (button.textContent = original), 1400);
  };

  /*
   * History: the last MAX_HISTORY reports, each { title, text, at, path, snap, page }: path finds
   * its element again (R, Again), snap is its computed styles for a compare. Kept in
   * sessionStorage, so a reload of the window or tab keeps them (and an armed compare).
   */
  const HISTORY_KEY = 'se-inspector-history';
  const MAX_HISTORY = 5;
  const loadHistory = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || 'null');
      return Array.isArray(saved?.entries) ? saved : null;
    } catch {
      return null; // storage blocked or unreadable: start empty
    }
  };
  const saved = loadHistory();
  const history = saved ? saved.entries.slice(-MAX_HISTORY) : [];
  let shownAt = history.length - 1;
  let compareWith = (saved && history.find((entry) => entry.at === saved.compareAt && entry.snap)) || null;
  const saveHistory = () => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ entries: history, compareAt: compareWith?.at ?? null }));
    } catch { /* storage blocked or full: the history lasts for this page only */ }
  };

  const clock = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const nameOf = (entry) => `${entry.title.split(' ')[0]} ${clock(entry.at)}`;

  // The shown report, its tabs (newest first) and which header buttons apply to it
  const render = () => {
    const entry = history[shownAt];
    ui.title.textContent = entry ? entry.title : 'Element report';
    ui.text.value = entry ? entry.text : '';
    ui.note.hidden = true;
    ui.tabs.replaceChildren(...history.map((item, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = i === shownAt ? 'on' : '';
      tab.dataset.index = String(i);
      tab.textContent = nameOf(item);
      tab.title = item.path || item.title;
      return tab;
    }).reverse());
    ui.tabs.hidden = history.length < 2;
    ui.recapture.disabled = !entry || !(entry.path || entry.page);
    ui.compare.disabled = !entry?.snap || !snapshot;
  };

  const display = async () => {
    stopPicking();
    render();
    ui.panel.hidden = false;
    flash(ui.copy, (await copy(ui.text.value)) ? 'Copied' : 'Select and copy');
  };

  // A message in the panel over the shown report, kept out of the history
  const notice = (message) => {
    stopPicking();
    render();
    ui.note.textContent = message;
    ui.note.hidden = false;
    ui.panel.hidden = false;
  };

  /** A new report into the history, shown and copied; an armed compare opens it with the diff. */
  const record = (title, text, { path = null, snap = null, page = false } = {}) => {
    const at = Date.now();
    let body = text;
    if (compareWith && snap && diff) {
      body = `${diff(compareWith.snap, snap, nameOf(compareWith), nameOf({ title, at }))}\n\n${text}`;
      compareWith = null;
    }
    history.push({ title, text: body, at, path, snap, page });
    if (history.length > MAX_HISTORY) history.shift();
    shownAt = history.length - 1;
    saveHistory();
    return display();
  };

  const failed = (error) => `Report failed: ${error?.stack || error}`;

  /** Reports an element: at `point` (the pointer), else at its centre (its corner when it has no size). */
  const take = async (el, { title = 'Element report', note = '', path = pathOf?.(el) ?? null, point = null } = {}) => {
    if (!point) {
      const r = el.getBoundingClientRect();
      point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    lastPoint = point;
    const snap = snapshot?.(el) ?? null;
    const pending = report(el, note, point); // reads the page now, while a frozen popup is still open
    stopPicking();
    record(title, await pending.catch(failed), { path, snap });
  };

  const capture = (el) => el && take(el, { point: lastPoint });
  const capturePage = () => record('Page report', pageReport(), { page: true });

  // R / Again: the shown report's element, found anew by its path (a page report runs again)
  const recapture = () => {
    const entry = history[shownAt];
    if (!entry) return notice('Nothing captured yet in this window.');
    if (entry.page) return capturePage();
    if (!entry.path) return notice('This report has no path to find its element by.');
    let el = null;
    try {
      el = [...document.querySelectorAll(entry.path)].find((node) => !own(node)) || null;
    } catch { /* a path that no longer parses: reported below as matching nothing */ }
    if (!el) return notice(`Nothing matches ${entry.path} now.`);
    return take(el, { title: entry.title, note: `  — again, by ${entry.path}`, path: entry.path });
  };

  // Compare: the next capture is diffed against the shown report; picking starts at once
  const armCompare = () => {
    const entry = history[shownAt];
    if (!entry?.snap) return;
    compareWith = entry;
    saveHistory();
    startPicking();
  };

  /* ---------- Catching the next dialog ---------- */

  const CATCH_KEY = 'se-inspector-catch';
  const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"], .newmodal, .ModalPosition, .waiting_dialog_container, [class*="Modal"], [class*="Dialog"]';
  let catcher = null;

  const armed = () => {
    try {
      return sessionStorage.getItem(CATCH_KEY) === '1';
    } catch {
      return false;
    }
  };

  const setArmed = (on) => {
    try {
      if (on) sessionStorage.setItem(CATCH_KEY, '1');
      else sessionStorage.removeItem(CATCH_KEY);
    } catch {} // storage blocked: the wait lasts for this page only
  };

  /** The outermost dialog-like box around a match, below <body>. */
  const outermost = (el) => {
    let top = el;
    for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (node.matches(DIALOG)) top = node;
    }
    return top;
  };

  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 20 && getComputedStyle(el).visibility !== 'hidden';
  };

  /** A dialog that a changed node opens, is part of, or holds. */
  const dialogOf = (node) => {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el || own(el)) return null;
    const hit = el.closest(DIALOG) || el.querySelector(DIALOG);
    return hit ? outermost(hit) : null;
  };

  const stopCatching = () => {
    catcher?.disconnect();
    catcher = null;
    setArmed(false);
    ui.wait.hidden = true;
  };

  const caught = (dialog) => {
    stopCatching();
    const at = () => {
      const r = dialog.getBoundingClientRect();
      lastPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      return { pending: report(dialog, '', lastPoint), snap: snapshot?.(dialog) ?? null, path: pathOf?.(dialog) ?? null };
    };
    // Now, while it surely shows; a frame later its content may have filled in, if it's still up.
    const first = at();
    requestAnimationFrame(async () => {
      const taken = dialog.isConnected && shown(dialog) ? at() : first;
      record('Dialog report', await taken.pending.catch(failed), taken);
    });
  };

  function startCatching() {
    stopPicking();
    ui.panel.hidden = true;
    if (!host.isConnected) (document.body || document.documentElement).append(host);
    setArmed(true);
    ui.wait.hidden = false;
    catcher?.disconnect();
    catcher = new MutationObserver((records) => {
      for (const record of records) {
        const nodes = record.type === 'attributes' ? [record.target] : record.addedNodes;
        for (const node of nodes) {
          const dialog = dialogOf(node);
          if (dialog && shown(dialog)) {
            caught(dialog);
            return;
          }
        }
      }
    });
    catcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'style', 'class'] });
  }

  const onMove = (event) => {
    shield(event);
    lastPoint = { x: event.clientX, y: event.clientY };
    const el = event.composedPath().find((node) => node instanceof Element && !own(node)) || null;
    if (el === pointer) return;
    pointer = el;
    trail.length = 0;
    outline(el);
  };

  const block = (event) => {
    if (own(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onClick = (event) => {
    if (own(event.target)) return;
    block(event);
    capture(current);
  };

  const onKey = (event) => {
    if (!host.isConnected) return; // closed: Steam's own keys pass untouched
    if (!ui.ask.hidden && event.composedPath().includes(ui.askInput)) {
      if (event.key === 'Escape') {
        block(event);
        closeAsk();
      }
      return; // typing a selector: the picker's keys don't apply
    }
    if (event.key === 'Escape') {
      block(event);
      close();
    } else if (!active) {
      return;
    } else if (event.key === ' ') {
      block(event);
      capture(current);
    } else if (event.key === 'f' || event.key === 'F') {
      block(event);
      setFrozen(!frozen);
    } else if (event.key === 's' || event.key === 'S') {
      block(event);
      askSelector();
    } else if (event.key === 'p' || event.key === 'P') {
      block(event);
      capturePage();
    } else if (event.key === 'd' || event.key === 'D') {
      block(event);
      startCatching();
    } else if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      block(event);
      recapture();
    } else if (event.key === '[' && current?.parentElement && current.parentElement !== document.documentElement) {
      block(event);
      trail.push(current);
      outline(current.parentElement);
    } else if (event.key === ']' && trail.length) {
      block(event);
      outline(trail.pop());
    }
  };

  const reposition = () => active && current && outline(current);

  // Capture phase on window, so the page's own handlers never see a picking click.
  const PICK_EVENTS = [['pointerdown', block], ['mousedown', block], ['pointerup', block], ['mouseup', block], ['click', onClick], ['contextmenu', block]];

  const startPicking = () => {
    active = true;
    ui.panel.hidden = true;
    ui.hint.hidden = false;
    ui.cmp.hidden = !compareWith;
    ui.cmp.textContent = compareWith ? ` · next capture compared with ${nameOf(compareWith)}` : '';
    addEventListener('pointermove', onMove, true);
    for (const [type, fn] of PICK_EVENTS) addEventListener(type, fn, true);
    for (const type of HOVER_EVENTS) addEventListener(type, shield, true);
    addEventListener('scroll', reposition, true);
  };

  function stopPicking() {
    active = false;
    ui.hint.hidden = true;
    outline(null);
    removeEventListener('pointermove', onMove, true);
    for (const [type, fn] of PICK_EVENTS) removeEventListener(type, fn, true);
    for (const type of HOVER_EVENTS) removeEventListener(type, shield, true);
    removeEventListener('scroll', reposition, true);
    setFrozen(false);
  }

  function close() {
    stopPicking();
    stopCatching();
    closeAsk();
    ui.panel.hidden = true;
    host.remove();
    if (compareWith) {
      compareWith = null; // closing drops an armed compare
      saveHistory();
    }
  }

  ui.copy.addEventListener('click', async () => flash(ui.copy, (await copy(ui.text.value)) ? 'Copied' : 'Select and copy'));
  $('.pick').addEventListener('click', startPicking);
  ui.recapture.addEventListener('click', recapture);
  ui.compare.addEventListener('click', armCompare);
  ui.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('button');
    if (!tab) return;
    shownAt = Number(tab.dataset.index);
    render();
  });
  for (const button of root.querySelectorAll('.page')) button.addEventListener('click', capturePage);
  for (const button of root.querySelectorAll('.catch')) button.addEventListener('click', startCatching);
  $('.close').addEventListener('click', close);
  $('.ask-open').addEventListener('click', askSelector);
  $('.ask-cancel').addEventListener('click', closeAsk);
  ui.ask.addEventListener('submit', (event) => {
    event.preventDefault();
    const selector = ui.askInput.value.trim();
    if (selector) captureSelector(selector);
  });
  addEventListener('keydown', onKey, true);

  const open = () => {
    if (!host.isConnected) (document.body || document.documentElement).append(host);
    startPicking();
  };

  window[KEY] = {
    toggle() {
      if (host.isConnected && (active || catcher || !ui.panel.hidden)) close();
      else open();
    },
    destroy() {
      close();
      removeEventListener('keydown', onKey, true);
      delete window[KEY];
    },
  };
  // Armed before a reload: wait for the dialog from the page's first moment
  if (armed()) startCatching();
  else open();
})();
