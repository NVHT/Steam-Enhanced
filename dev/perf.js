/*
 * Profiler: a performance aid. Ctrl+Shift+P (core/core.js) arms it in every client window
 * (localStorage "se-perf") and opens its panel in the current one. While armed, client/loader.js
 * loads it before the runtime, so it times everything the theme starts; pressed in a window
 * that was already running, it only sees what registers from then on (polls and frames re-arm,
 * page watchers don't): restart Steam for the full picture.
 *
 * What it times, per registration site (file:line of the theme code that registered it):
 *   watch / mount / onChange / poll   the runtime's subscribers (window.__se, wrapped on publish)
 *   timeout / interval / frame / idle setTimeout, setInterval, requestAnimationFrame, requestIdleCallback
 *   observer                          MutationObserver, ResizeObserver, IntersectionObserver callbacks
 *   event:<type>                      addEventListener handlers
 * Each row has self time (nested theme calls subtracted), calls, the slowest call, and layout:
 * time spent inside layout reads (getBoundingClientRect, offset and client sizes, scroll
 * positions, computed style), which is where a forced reflow shows. Only theme code is wrapped;
 * Steam's own registrations pass straight through. Long animation frames (50 ms+, Steam's and
 * the theme's) are listed separately with Chromium's own script attribution.
 *
 * Panel: Reset clears the counts, Copy puts the report on the clipboard, Disarm stops it loading
 * in new windows (this one keeps it until Steam restarts). The panel lives in a closed shadow
 * root. Wrapping and stack reads add a little overhead of their own: compare rows, not totals.
 */
(() => {
  const KEY = '__sePerf';
  if (window[KEY]) {
    window[KEY].toggle();
    return;
  }

  const ARM_KEY = 'se-perf';
  const SELF = document.currentScript?.src || '';
  const BASE = SELF ? new URL('../', SELF).href.replace(/[?#].*$/, '') : '';
  const SELF_PATH = 'dev/perf.js';
  const late = !!(window.__se || window.__seWeb);
  const now = () => performance.now();
  // The panel's own timer, taken before the wrapping below
  const plainSetInterval = window.setInterval;
  const plainSetTimeout = window.setTimeout;
  // Set while the profiler builds its own panel, whose listeners aren't the theme's
  let quiet = 0;

  /* ---------- Where a registration came from ---------- */

  const FRAME_RE = /\(?((?:https?|file):\/\/[^\s)]+?):(\d+):\d+\)?\s*$/;
  // The first theme frame below this file: "client/library/game-list.js:140", or null for Steam's code
  const caller = (skipRuntime) => {
    if (!BASE || quiet) return null;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 12;
    const stack = new Error().stack || '';
    Error.stackTraceLimit = limit;
    for (const line of stack.split('\n').slice(1)) {
      const match = FRAME_RE.exec(line);
      if (!match) continue;
      const url = match[1].replace(/[?#].*$/, '');
      if (!url.startsWith(BASE)) return null;
      const path = url.slice(BASE.length);
      if (path === SELF_PATH || (skipRuntime && path === 'core/runtime.js')) continue;
      return `${path}:${match[2]}`;
    }
    return null;
  };

  /* ---------- Counting ---------- */

  let rows = new Map();
  let slowReads = new Map(); // file:line of a layout read -> { calls, total, max }
  let started = now();
  const active = []; // frames of nested timed calls: { row, start, child }

  const rowOf = (kind, site) => {
    const label = `${kind}  ${site}`;
    let row = rows.get(label);
    if (!row) rows.set(label, (row = { label, calls: 0, self: 0, max: 0, layout: 0 }));
    return row;
  };

  const timed = (kind, site, fn) => {
    if (typeof fn !== 'function' || !site) return fn;
    return function perfTimed(...args) {
      const frame = { row: rowOf(kind, site), start: now(), child: 0 };
      active.push(frame);
      try {
        return fn.apply(this, args);
      } finally {
        active.pop();
        const total = now() - frame.start;
        const self = total - frame.child;
        frame.row.calls++;
        frame.row.self += self;
        if (self > frame.row.max) frame.row.max = self;
        const parent = active[active.length - 1];
        if (parent) parent.child += total;
      }
    };
  };

  /* ---------- Global registrations ---------- */

  const wrapCallbackAt = (owner, name, kind) => {
    const original = owner[name];
    if (typeof original !== 'function') return;
    owner[name] = function perfSchedule(fn, ...rest) {
      return original.call(this, typeof fn === 'function' ? timed(kind, caller(false), fn) : fn, ...rest);
    };
  };
  wrapCallbackAt(window, 'setTimeout', 'timeout');
  wrapCallbackAt(window, 'setInterval', 'interval');
  wrapCallbackAt(window, 'requestAnimationFrame', 'frame');
  wrapCallbackAt(window, 'requestIdleCallback', 'idle');

  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const Original = window[name];
    if (typeof Original !== 'function') continue;
    window[name] = class extends Original {
      constructor(fn, ...rest) {
        super(timed('observer', caller(false), fn), ...rest);
      }
    };
  }

  // Listeners: the same handler always maps to the same wrapper, so removeEventListener finds it
  const wrappedHandlers = new WeakMap();
  const proto = EventTarget.prototype;
  const addListener = proto.addEventListener;
  const removeListener = proto.removeEventListener;
  proto.addEventListener = function perfAdd(type, fn, options) {
    if (typeof fn === 'function') {
      let wrapper = wrappedHandlers.get(fn);
      if (wrapper === undefined) {
        const site = caller(false);
        wrapper = site ? timed(`event:${type}`, site, fn) : null;
        wrappedHandlers.set(fn, wrapper);
      }
      if (wrapper) return addListener.call(this, type, wrapper, options);
    }
    return addListener.call(this, type, fn, options);
  };
  proto.removeEventListener = function perfRemove(type, fn, options) {
    const wrapper = typeof fn === 'function' ? wrappedHandlers.get(fn) : null;
    removeListener.call(this, type, fn, options);
    if (wrapper) removeListener.call(this, type, wrapper, options);
  };

  /* ---------- Layout reads, charged to the theme call making them ---------- */

  /*
   * A pending style pass is flushed on its own first (a computed custom property needs style,
   * not layout), so a slow read shows what was style and what was layout.
   */
  const plainGetProperty = CSSStyleDeclaration.prototype.getPropertyValue;
  const plainComputed = window.getComputedStyle;
  const flushStyle = () => plainGetProperty.call(plainComputed.call(window, document.documentElement), '--se-perf-style');
  // getPropertyValue reads style only on a computed declaration: an inline one (el.style) is free
  const computed = new WeakSet();
  window.getComputedStyle = function perfComputed(...args) {
    const style = plainComputed.apply(this, args);
    computed.add(style);
    return style;
  };
  const chargeLayout = (read) =>
    function perfLayout(...args) {
      if (!active.length || (this instanceof CSSStyleDeclaration && !computed.has(this))) return read.apply(this, args);
      const before = now();
      flushStyle();
      const start = now();
      try {
        return read.apply(this, args);
      } finally {
        const style = start - before;
        const spent = now() - start;
        active[active.length - 1].row.layout += style + spent;
        // A read that took a layout or a style pass (over 1 ms) is charged to its own line too
        if (style + spent > 1) {
          const site = caller(false) || 'unknown';
          let slow = slowReads.get(site);
          if (!slow) slowReads.set(site, (slow = { site, calls: 0, total: 0, style: 0, max: 0 }));
          slow.calls++;
          slow.total += style + spent;
          slow.style += style;
          slow.max = Math.max(slow.max, style + spent);
        }
      }
    };
  for (const [owner, names] of [
    [Element.prototype, ['getBoundingClientRect', 'getClientRects', 'checkVisibility']],
    [CSSStyleDeclaration.prototype, ['getPropertyValue']],
  ]) {
    for (const name of names) if (typeof owner[name] === 'function') owner[name] = chargeLayout(owner[name]);
  }
  for (const [owner, names] of [
    [HTMLElement.prototype, ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'innerText']],
    [HTMLImageElement.prototype, ['width', 'height']],
    [Element.prototype, ['clientWidth', 'clientHeight', 'scrollTop', 'scrollLeft', 'scrollWidth', 'scrollHeight']],
  ]) {
    for (const name of names) {
      const desc = Object.getOwnPropertyDescriptor(owner, name);
      if (!desc?.get) continue;
      Object.defineProperty(owner, name, { ...desc, get: chargeLayout(desc.get) });
    }
  }

  /*
   * ---------- Changes on <html> and <body> ----------
   * A class, attribute or inline variable changed there restyles the whole document. Every
   * change is counted (a MutationObserver: Steam's too, and dataset writes), and the theme line
   * making it where it went through setAttribute, classList or style.setProperty.
   */
  let rootChanges = new Map(); // "body class" → { count, sites: Map(site → count) }
  const rootChange = (key) => {
    let row = rootChanges.get(key);
    if (!row) rootChanges.set(key, (row = { count: 0, sites: new Map() }));
    return row;
  };
  const tagOf = (el) => (el === document.documentElement ? 'html' : el === document.body ? 'body' : null);
  const noteWriter = (el, name) => {
    const tag = el && tagOf(el);
    if (!tag) return;
    const site = caller(true);
    if (!site) return;
    const sites = rootChange(`${tag} ${name}`).sites;
    sites.set(site, (sites.get(site) || 0) + 1);
  };
  const rootObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        if (document.body && !rootObserver.__body) {
          rootObserver.__body = true;
          rootObserver.observe(document.body, { attributes: true, attributeOldValue: true });
        }
        continue;
      }
      const el = record.target;
      if (el.getAttribute(record.attributeName) === record.oldValue) continue;
      rootChange(`${tagOf(el)} ${record.attributeName}`).count++;
    }
  });
  rootObserver.observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true });
  if (document.body) {
    rootObserver.__body = true;
    rootObserver.observe(document.body, { attributes: true, attributeOldValue: true });
  }
  for (const name of ['setAttribute', 'removeAttribute', 'toggleAttribute']) {
    const plain = Element.prototype[name];
    Element.prototype[name] = function perfRootAttr(attr, ...rest) {
      if (this === document.documentElement || this === document.body) noteWriter(this, String(attr).toLowerCase());
      return plain.call(this, attr, ...rest);
    };
  }
  for (const name of ['add', 'remove', 'toggle', 'replace']) {
    const plain = DOMTokenList.prototype[name];
    DOMTokenList.prototype[name] = function perfRootClass(...args) {
      if (this === document.documentElement.classList) noteWriter(document.documentElement, 'class');
      else if (document.body && this === document.body.classList) noteWriter(document.body, 'class');
      return plain.apply(this, args);
    };
  }
  for (const name of ['setProperty', 'removeProperty']) {
    const plain = CSSStyleDeclaration.prototype[name];
    CSSStyleDeclaration.prototype[name] = function perfRootStyle(...args) {
      if (this === document.documentElement.style) noteWriter(document.documentElement, 'style');
      else if (document.body && this === document.body.style) noteWriter(document.body, 'style');
      return plain.apply(this, args);
    };
  }

  /* ---------- The runtime's subscribers (window.__se) ---------- */

  const wrapRuntime = (SE) => {
    if (!SE || SE.__perf) return SE;
    const { watch, poll, mount, onChange } = SE;
    if (watch) SE.watch = (fn, opts) => watch(timed('watch', caller(true), fn), opts);
    if (poll) {
      SE.poll = (fn, delay, opts = {}) => {
        const site = caller(true);
        const options = opts.active ? { ...opts, active: timed('poll active', site, opts.active) } : opts;
        return poll(timed('poll', site, fn), delay, options);
      };
    }
    if (mount) {
      SE.mount = (label, find, create, options) => {
        const site = caller(true);
        return mount(label, timed('mount find', site, find), timed('mount create', site, create), options);
      };
    }
    if (onChange) SE.onChange = (root, fn, opts) => onChange(root, timed('onChange', caller(true), fn), opts);
    SE.__perf = true;
    return SE;
  };
  if (window.__se) wrapRuntime(window.__se);
  else {
    let published;
    Object.defineProperty(window, '__se', {
      configurable: true,
      get: () => published,
      set: (value) => {
        published = wrapRuntime(value);
      },
    });
  }

  /*
   * ---------- A split feature's parts ----------
   * Each part publishes its functions on the feature's namespace (window.__se<Feature>Parts)
   * with Object.assign; those are timed one by one ("part  file:line name"), so a pass that
   * runs many steps shows which step costs. Namespaces are caught as they are created; a name
   * missing here is only not split out.
   */
  const PARTS = [
    '__seGamePageParts', '__seHomeStageParts', '__seFriendsDockParts', '__seNavParts', '__seSteamMenuParts',
    '__seDownloadsParts', '__seSettingsParts', '__seToastsParts', '__seOverlayParts', '__seSystemReportParts',
    '__seMillParts', '__seLayerParts',
  ];
  const partTargets = new WeakSet();
  for (const name of PARTS) {
    if (window[name]) {
      partTargets.add(window[name]);
      continue;
    }
    let value;
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => value,
      set: (next) => {
        value = next;
        if (next && typeof next === 'object') partTargets.add(next);
      },
    });
  }
  const assign = Object.assign;
  Object.assign = function perfAssign(target, ...sources) {
    if (!partTargets.has(target)) return assign.call(this, target, ...sources);
    const site = caller(false);
    const timedSources = sources.map((source) => {
      if (!site || !source || typeof source !== 'object') return source;
      const copy = {};
      for (const [key, value] of Object.entries(source)) {
        // A function's own properties (a debounced fn's cancel) ride along
        copy[key] = typeof value === 'function' ? assign(timed(`part ${key}`, site, value), value) : value;
      }
      return copy;
    });
    return assign.call(this, target, ...timedSources);
  };

  /* ---------- Long animation frames (Steam's and the theme's) ---------- */

  const frames = { count: 0, total: 0, blocking: 0, worst: 0, scripts: new Map() };
  const shortSource = (url) => {
    const clean = (url || '').replace(/[?#].*$/, '');
    if (BASE && clean.startsWith(BASE)) return clean.slice(BASE.length);
    return clean ? `Steam ${clean.split('/').pop()}` : 'Steam (no source)';
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        frames.count++;
        frames.total += entry.duration;
        frames.blocking += entry.blockingDuration || 0;
        frames.worst = Math.max(frames.worst, entry.duration);
        for (const script of entry.scripts || []) {
          const label = `${shortSource(script.sourceURL)} ${script.sourceFunctionName || script.invoker || ''}`.trim();
          let row = frames.scripts.get(label);
          if (!row) frames.scripts.set(label, (row = { label, calls: 0, total: 0, layout: 0 }));
          row.calls++;
          row.total += script.duration;
          row.layout += script.forcedStyleAndLayoutDuration || 0;
        }
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    frames.unsupported = true;
  }

  /* ---------- Report ---------- */

  const ms = (value) => value.toFixed(1).padStart(8);
  const report = () => {
    const seconds = Math.max(0.001, (now() - started) / 1000);
    const list = [...rows.values()].filter((row) => row.calls).sort((a, b) => b.self - a.self);
    const self = list.reduce((sum, row) => sum + row.self, 0);
    const layout = list.reduce((sum, row) => sum + row.layout, 0);
    const lines = [
      `Steam Enhanced profiler: ${document.title || location.href}`,
      `Recorded ${seconds.toFixed(0)} s${late ? ' (started late: page watchers already running are not split out; restart Steam with it armed)' : ''}`,
      `Theme JS ${(self / seconds).toFixed(1)} ms/s, of which layout reads ${(layout / seconds).toFixed(1)} ms/s`,
      frames.unsupported
        ? 'Long frames: not supported in this Chromium'
        : `Long frames (50 ms+): ${frames.count}, ${(frames.total / seconds).toFixed(1)} ms/s, blocking ${(frames.blocking / seconds).toFixed(1)} ms/s, worst ${frames.worst.toFixed(0)} ms`,
      '',
      '  self ms    ms/s   calls   max ms  layout  site',
      ...list.slice(0, 40).map((row) =>
        `${ms(row.self)}${ms(row.self / seconds)}${String(row.calls).padStart(8)}${ms(row.max)}${ms(row.layout)}  ${row.label}`),
    ];
    const scripts = [...frames.scripts.values()].sort((a, b) => b.total - a.total).slice(0, 12);
    if (scripts.length) {
      lines.push('', 'In long frames (Chromium attribution):', '  total ms   calls  layout  script');
      for (const row of scripts) lines.push(`${ms(row.total)}${String(row.calls).padStart(8)}${ms(row.layout)}  ${row.label}`);
    }
    const slow = [...slowReads.values()].sort((a, b) => b.total - a.total).slice(0, 15);
    if (slow.length) {
      lines.push('', 'Layout reads over 1 ms, by line (style: of the total, the style pass):', '  total ms   calls   max ms  style ms  read at');
      for (const row of slow) lines.push(`${ms(row.total)}${String(row.calls).padStart(8)}${ms(row.max)}${ms(row.style).padStart(10)}  ${row.site}`);
    }
    const changes = [...rootChanges.entries()].filter(([, row]) => row.count).sort((a, b) => b[1].count - a[1].count);
    if (changes.length) {
      lines.push('', 'Changes on <html> / <body> (each restyles the document):', '   count  changed      theme writes there');
      for (const [key, row] of changes) {
        const sites = [...row.sites].sort((a, b) => b[1] - a[1]).map(([site, n]) => `${site} ×${n}`).join(', ');
        lines.push(`${String(row.count).padStart(8)}  ${key.padEnd(30)} ${sites || '(not the theme, or a dataset write)'}`);
      }
    }
    if (probe) lines.push('', ...probe.lines());
    return lines.join('\n');
  };

  /*
   * ---------- CSS probe ----------
   * What one full style pass and one full layout of this window cost: with the theme's sheets
   * (client/loader.js imports them through one <style id="se-sheets">), with none, and without
   * each folder in turn (what it adds), then the DRILL costliest folders file by file, then the
   * costliest file halved down to its costliest rule. Style: every element re-matched (an
   * attribute on <html> a do-nothing `html[...] *` rule depends on; a changed root variable
   * overstated the tokens), then a read; layout: <html>'s padding nudged by 1 px, then a read. Each
   * figure is the best of SAMPLES runs. A set's cost is the median of PAIRS on/off pairs taken
   * back to back, the order alternating (one base taken at the start drifted with the page;
   * whichever side ran first read slower); one sheet's share is often under the noise (±2 ms).
   * The page flickers while it runs.
   */
  const SAMPLES = 2;
  const PAIRS = 7;
  const DRILL = 2; // folders then measured file by file
  const BISECT_MIN = 2; // ms a file or half must add to be halved further
  const groupOf = (file) => file.split('/').slice(0, file.startsWith('client/') || file.startsWith('compat/') ? 2 : 1).join('/');
  const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
  let probe = null;
  const flush = () => void document.body.offsetHeight;
  const sample = (runs = SAMPLES) => {
    const root = document.documentElement;
    let style = Infinity;
    let layout = Infinity;
    for (let i = 0; i < runs; i++) {
      flush();
      let t = now();
      root.toggleAttribute('data-se-perf-style');
      flush();
      style = Math.min(style, now() - t);
      t = now();
      // Toggled from what it is, so every run moves it (by parity, every other sample didn't)
      root.style.paddingRight = root.style.paddingRight ? '' : '1px';
      flush();
      layout = Math.min(layout, now() - t);
    }
    root.removeAttribute('data-se-perf-style');
    root.style.paddingRight = '';
    flush();
    return { style, layout };
  };
  const pause = () => new Promise((resolve) => plainSetTimeout.call(window, resolve, 0));
  // Adds an element that loads a sheet (or imports) and waits until it's in
  const loaded = (el) =>
    new Promise((resolve) => {
      el.addEventListener('load', resolve, { once: true });
      el.addEventListener('error', resolve, { once: true });
      document.head.appendChild(el);
    });
  const importsOf = (hrefs) => {
    const el = document.createElement('style');
    el.textContent = hrefs.map((href) => `@import url("${href}");`).join('\n');
    return el;
  };
  const fmt = (m) => `style ${m.style.toFixed(1)} ms, layout ${m.layout.toFixed(1)} ms`;

  const runProbe = async () => {
    if (probe?.running) return;
    const theme = document.getElementById('se-sheets');
    const files = [...(window.__seClient?.sheets || [])];
    if (!theme?.sheet || !files.length) return;
    const groups = new Map();
    for (const [file, href] of files) {
      const name = groupOf(file);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(href);
    }
    const result = { running: true, done: 0, total: groups.size, base: null, rows: [], other: [] };
    result.lines = () => {
      if (!result.base) return ['CSS probe: measuring…'];
      const out = [`CSS probe (best of ${SAMPLES}, median of ${PAIRS} pairs per folder): theme's ${files.length} sheets: ${fmt(result.base)}`];
      for (const [label, m] of result.other) out.push(`  ${label}: ${typeof m === 'string' ? m : fmt(m)}`);
      if (result.running) out.push(`  folder ${result.done} of ${result.total}…`);
      if (result.bisect) {
        out.push(`  halving ${result.bisect.file} (ms the costlier half adds / the other half):`);
        for (const step of result.bisect.steps) out.push(`    ${String(step.rules).padStart(4)} rules: ${ms(step.ms)} / ${ms(step.other)}`);
        if (result.bisect.rule) out.push(`    rule: ${result.bisect.rule}`);
      }
      const top = [...result.rows].sort((a, b) => b.style + b.layout - (a.style + a.layout)).slice(0, 30);
      if (top.length) {
        out.push('  adds style ms  layout ms  sheets  folder');
        for (const row of top) out.push(`${ms(row.style).padStart(14)}${ms(row.layout).padStart(11)}${String(row.count).padStart(8)}  ${row.file}`);
      }
      return out;
    };
    probe = result;
    render();
    // What the style test toggles: every element re-matched, nothing on screen changed (orphans
    // only applies to print), no variable touched
    const restyle = document.createElement('style');
    restyle.textContent = 'html[data-se-perf-style] *{orphans:2}';
    document.head.appendChild(restyle);
    await pause();
    result.base = sample();
    theme.sheet.disabled = true;
    result.other.push(['none', sample()]);
    theme.sheet.disabled = false;
    flush();
    render();
    await pause();
    // What a set of the theme's files adds: a second import sheet lacking them, swapped with the
    // theme's own
    // keep: rules of the left-out files put back (a constructed sheet), for the bisection below
    const measureWithout = async (hrefs, keep = null) => {
      const without = importsOf(files.map(([, href]) => href).filter((href) => !hrefs.includes(href)));
      await loaded(without);
      if (keep) document.adoptedStyleSheets = [...document.adoptedStyleSheets, keep];
      const setOff = (off) => {
        theme.sheet.disabled = off;
        without.sheet.disabled = !off;
        if (keep) keep.disabled = !off;
        flush();
      };
      const style = [];
      const layout = [];
      for (let i = 0; i < PAIRS; i++) {
        const offFirst = i % 2 === 1;
        setOff(offFirst);
        const first = sample();
        setOff(!offFirst);
        const second = sample();
        const [on, off] = offFirst ? [second, first] : [first, second];
        style.push(on.style - off.style);
        layout.push(on.layout - off.layout);
      }
      theme.sheet.disabled = false;
      without.remove();
      if (keep) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== keep);
      flush();
      return { style: median(style), layout: median(layout) };
    };
    for (const [name, hrefs] of groups) {
      result.rows.push({ file: name, count: hrefs.length, ...(await measureWithout(hrefs)) });
      result.done++;
      render();
      await pause();
    }
    // Then the DRILL costliest folders file by file
    const costliest = [...result.rows].filter((row) => row.count > 1).sort((x, y) => y.style + y.layout - (x.style + x.layout)).slice(0, DRILL);
    result.total += costliest.reduce((sum, row) => sum + row.count, 0);
    for (const row of costliest) {
      for (const [file, href] of files) {
        if (groupOf(file) !== row.file) continue;
        result.rows.push({ file, count: 1, ...(await measureWithout([href])) });
        result.done++;
        render();
        await pause();
      }
    }
    // Then the costliest single file, halved down to its costliest rule: what a set of its rules
    // adds is the file left out with the other rules put back
    const worst = result.rows.filter((row) => row.count === 1).sort((x, y) => y.style + y.layout - (x.style + x.layout))[0];
    const href = worst && files.find(([file]) => file === worst.file)?.[1];
    if (href && worst.style + worst.layout >= BISECT_MIN) {
      try {
        const parsed = new CSSStyleSheet({ baseURL: href });
        parsed.replaceSync(await fetch(href).then((r) => r.text()));
        const rules = [...parsed.cssRules].map((rule) => rule.cssText);
        const keep = new CSSStyleSheet({ baseURL: href });
        const costOf = async (set) => {
          keep.replaceSync(rules.filter((_, i) => !set.includes(i)).join('\n'));
          const m = await measureWithout([href], keep);
          return m.style + m.layout;
        };
        result.bisect = { file: worst.file, steps: [] };
        let set = rules.map((_, i) => i);
        while (set.length > 1) {
          const half = set.slice(0, set.length >> 1);
          const rest = set.slice(set.length >> 1);
          const [a, b] = [await costOf(half), await costOf(rest)];
          set = a >= b ? half : rest;
          result.bisect.steps.push({ rules: set.length, ms: Math.max(a, b), other: Math.min(a, b) });
          render();
          await pause();
          if (Math.max(a, b) < BISECT_MIN) break;
        }
        result.bisect.rule = rules[set[0]].slice(0, 160);
      } catch (error) {
        result.bisect = { file: worst.file, steps: [], rule: `failed: ${error?.message || error}` };
      }
      render();
    }
    restyle.remove();
    result.running = false;
    render();
  };

  const reset = () => {
    rows = new Map();
    slowReads = new Map();
    rootChanges = new Map();
    frames.count = frames.total = frames.blocking = frames.worst = 0;
    frames.scripts.clear();
    started = now();
  };

  /* ---------- Panel (closed shadow root, untouched by any page CSS) ---------- */

  let host = null;
  let output = null;
  let ticker = 0;

  const render = () => {
    if (output) output.textContent = report();
  };

  const build = () => {
    host = document.createElement('se-perf');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; }
        .panel { width: min(880px, calc(100vw - 24px)); max-height: 70vh; display: flex; flex-direction: column;
          background: #10131a; color: #e6e8eb; border: 1px solid #2b3240; border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, .5); font: 12px/1.45 Consolas, monospace; }
        .bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #2b3240; }
        .bar b { flex: 1; font-weight: 600; }
        button { font: inherit; color: inherit; background: #1d2330; border: 1px solid #2b3240; border-radius: 4px;
          padding: 4px 10px; cursor: pointer; }
        button:hover { background: #283042; }
        pre { margin: 0; padding: 8px 12px; overflow: auto; white-space: pre; }
      </style>
      <div class="panel">
        <div class="bar"><b>Profiler</b>
          <button data-act="reset">Reset</button><button data-act="probe">Probe CSS</button><button data-act="copy">Copy</button>
          <button data-act="disarm">Disarm</button><button data-act="close">Close</button>
        </div>
        <pre></pre>
      </div>`;
    output = shadow.querySelector('pre');
    shadow.querySelector('.bar').addEventListener('click', async (event) => {
      const act = event.target.closest?.('button')?.dataset.act;
      if (act === 'reset') reset();
      else if (act === 'probe') runProbe();
      else if (act === 'copy') {
        const text = report();
        const done = await navigator.clipboard?.writeText(text).then(() => true, () => false);
        if (!done) window.__se?.copy?.(text);
        event.target.textContent = 'Copied';
      } else if (act === 'disarm') {
        try {
          localStorage.removeItem(ARM_KEY);
        } catch {}
        event.target.textContent = 'Disarmed';
      } else if (act === 'close') toggle();
      render();
    });
  };

  const toggle = () => {
    if (host?.isConnected) {
      host.remove();
      clearInterval(ticker);
      return;
    }
    quiet++;
    try {
      if (!host) build();
    } finally {
      quiet--;
    }
    document.documentElement.append(host);
    render();
    ticker = plainSetInterval.call(window, render, 1000);
  };

  window[KEY] = { toggle, report, reset, probe: runProbe };
  // Loaded by the hotkey (not by the loader at start): show the panel straight away
  if (late) toggle();
})();
