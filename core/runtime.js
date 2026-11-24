/*
 * The runtime every Steam window needs (window.__se): React fiber helpers, the shared
 * MutationObserver (SE.watch), views, layers, tokens and the rest. The class map it reads
 * (SE.C) is core/classmap.js. skin.json patches core/core.js and client/loader.js into each
 * window; the loader adds classmap.js, then this file, before any other script.
 *
 * Parts, listed in this order: this file (part 1 of 2), then core/runtime-art.js (games, their
 * art and achievement rarity tiers).
 */
(() => {
  if (window.__se) return;

  // The class map (core/classmap.js, loaded just before this file)
  const C = window.__seClassMap || {};

  const run = (fn, ...args) => {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  };

  // Cache the React expando suffix after the first hit to avoid Object.keys() on hot paths.
  let fiberKeyHint = '';
  let propsKeyHint = '';

  const fiberKey = (el) => {
    if (!el) return undefined;
    if (fiberKeyHint && el[fiberKeyHint] !== undefined) return fiberKeyHint;
    const key = Object.keys(el).find(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (key) fiberKeyHint = key;
    return key;
  };

  const fiber = (el) => {
    const key = fiberKey(el);
    return key ? el[key] : null;
  };

  const liveFiber = (target) => {
    const nodeFiber = target && (target.nodeType ? fiber(target) : target);
    if (!nodeFiber) return null;
    let rootFiber = nodeFiber;
    while (rootFiber.return) rootFiber = rootFiber.return;
    const root = rootFiber.stateNode;
    return root?.current && root.current !== rootFiber && nodeFiber.alternate
      ? nodeFiber.alternate
      : nodeFiber;
  };

  const props = (el) => {
    if (!el) return null;
    if (propsKeyHint && el[propsKeyHint] !== undefined) return el[propsKeyHint];
    const key = Object.keys(el).find(
      k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
    );
    if (key) propsKeyHint = key;
    return key ? el[key] : null;
  };

  // The first value `selector(props, fiber)` gives up el's fiber chain; `live` starts from the
  // current tree (liveFiber), for this render's props and hooks rather than the stale alternate's
  const fromProps = (el, maxDepth, selector, { live = false } = {}) => {
    for (let cur = live ? liveFiber(el) : fiber(el), depth = 0; cur && depth < maxDepth; cur = cur.return, depth++) {
      const memoized = cur.memoizedProps;
      if (!memoized || typeof memoized !== 'object') continue;
      const val = selector(memoized, cur);
      if (val !== undefined && val !== null) return val;
    }
    return undefined;
  };

  // The app (overview) a Library element was drawn for: a game row, a cover, a hover card.
  const isApp = (v) => v && typeof v === 'object' && typeof v.appid === 'number' && 'display_name' in v;
  const appOf = (el) =>
    fromProps(el, 16, (q) => {
      for (const k of ['app', 'overview', 'appOverview']) {
        if (isApp(q[k])) return q[k];
      }
      for (const v of Object.values(q)) {
        if (isApp(v)) return v;
      }
      return null;
    });

  const findDown = (el, predicate, limit = 600) => {
    const start = fiber(el);
    const stack = start ? [start.child] : [];
    let visited = 0;
    while (stack.length && visited++ < limit) {
      const cur = stack.pop();
      if (!cur) continue;
      const memoized = cur.memoizedProps;
      if (memoized && typeof memoized === 'object' && predicate(memoized)) return memoized;
      if (cur.sibling) stack.push(cur.sibling);
      if (cur.child) stack.push(cur.child);
    }
    return null;
  };

  const owners = () => {
    const wins = new Set([window]);
    for (const win of wins) {
      for (const rel of ['opener', 'parent']) {
        try {
          if (win[rel]) wins.add(win[rel]);
        } catch {}
      }
    }
    return wins;
  };

  /*
   * A SteamClient call from the first window that has it: a window's own SteamClient can lack
   * namespaces (User, whose StartRestart then fails silently) that Steam's shared context carries
   */
  const steamCall = (namespace, method, ...args) => {
    for (const owner of owners()) {
      const target = run(() => owner.SteamClient[namespace]);
      if (typeof target?.[method] === 'function') return run(() => target[method](...args));
    }
    return undefined;
  };

  // The game is running: in Steam's RunningApps, read from whichever window holds Steam's store
  const isRunning = (appid) =>
    Number(appid) > 0 &&
    [...owners()].some((owner) => run(() => owner.SteamUIStore?.RunningApps?.some((game) => Number(game.appid) === Number(appid))));

  const mainWindow = () => {
    for (const win of owners()) {
      try {
        const instance = win.SteamUIStore?.WindowStore?.MainWindowInstance;
        if (instance) return instance;
      } catch {}
    }
    return null;
  };

  /*
   * The game a library right-click menu was last opened on (client/library/game-menu.js notes
   * it). A dialog its rows open with several games (Install, Uninstall, Mark as Private) leads
   * with that one: Steam lists them in selection order. Asked across windows, since the menu
   * lives in the main window and the dialog can pop out.
   */
  let menuApp = 0;
  const noteMenuApp = (appid) => {
    menuApp = Number(appid) || 0;
  };
  const lastMenuApp = () => menuApp;
  // `list` reordered so the noted game (found by `idOf`) comes first; unchanged if it isn't there
  const leadApp = (list, idOf = (item) => item) => {
    let clicked = 0;
    for (const win of owners()) {
      clicked = run(() => win.__se?.lastMenuApp?.()) || 0;
      if (clicked) break;
    }
    const index = clicked ? list.findIndex((item) => Number(idOf(item)) === clicked) : -1;
    return index > 0 ? [list[index], ...list.slice(0, index), ...list.slice(index + 1)] : list;
  };

  const navigate = (route) => {
    const main = mainWindow();
    if (main && typeof main.Navigate === 'function') {
      try {
        main.Navigate(route);
        return true;
      } catch {}
    }
    return false;
  };

  const requireCache = new WeakMap();

  // webpack's require() for every bundle reachable from this window. A chunk array is only
  // probed once webpack has hooked its push, so no junk entries pile up before the runtime loads.
  const requires = () => {
    const list = [];
    for (const win of owners()) {
      let names;
      try {
        names = Object.getOwnPropertyNames(win).filter(k => k.startsWith('webpackChunk'));
      } catch {
        continue;
      }
      for (const globalName of names) {
        const chunks = win[globalName];
        if (!Array.isArray(chunks)) continue;
        let req = requireCache.get(chunks);
        if (!req && chunks.push !== Array.prototype.push) {
          chunks.push([['se-core-' + Math.random().toString(36).slice(2)], {}, (r) => { req = r; }]);
          if (req) requireCache.set(chunks, req);
        }
        if (req && !list.includes(req)) list.push(req);
      }
    }
    return list;
  };

  /*
   * Scans webpack module sources once per key. `test(src, id, req)` returns the wanted value
   * (or anything falsy to keep looking). Hits are kept for good; misses are remembered for
   * `retry` ms, so a hot path that asks every frame costs one scan per window, not one per call.
   */
  const moduleCache = new Map();
  const findModule = (key, test, { retry = 30000 } = {}) => {
    const cached = moduleCache.get(key);
    if (cached && (cached.hit || performance.now() < cached.until)) return cached.value;
    let value = null;
    let scanned = 0;
    outer: for (const req of requires()) {
      for (const id of Object.keys(req.m || {})) {
        scanned++;
        let src;
        try {
          src = Function.prototype.toString.call(req.m[id]);
        } catch {
          continue;
        }
        try {
          value = test(src, id, req) || null;
        } catch {
          value = null;
        }
        if (value) break outer;
      }
    }
    // Nothing to scan yet (webpack not hooked): don't remember that as a miss.
    if (scanned) moduleCache.set(key, { value, hit: !!value, until: performance.now() + retry });
    return value;
  };

  // The module a bundle binds to `alias` (`alias = req(123)` in `src`), loaded from that bundle.
  const importOf = (src, alias, req) => {
    const name = alias.replace(/[$]/g, '\\$&');
    const hit = new RegExp(`(?:^|[^\\w$])${name}\\s*=\\s*[\\w$]+\\(\\s*(\\d+)\\s*\\)`).exec(src);
    return hit ? run(() => req(hit[1])) : null;
  };

  // The first truthy `name` global across this window and its opener/parent chain.
  const global = (name, test) => {
    for (const win of owners()) {
      try {
        const value = win[name];
        if (value && (!test || test(value))) return value;
      } catch {}
    }
    return null;
  };

  // Sets a custom property only when it changes (no style invalidation for a no-op write).
  const cssVar = (el, name, value) => {
    if (!el) return;
    if (value == null || value === '') {
      if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
    } else if (el.style.getPropertyValue(name) !== String(value)) {
      el.style.setProperty(name, String(value));
    }
  };

  // A token's value from core/tokens.css, read off the root: px as a number, a duration in ms.
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const px = (name) => parseFloat(token(name)) || 0;

  /*
   * Where a tip (a w × h box) goes beside its anchor's rect: on `side` ('top', 'bottom', 'left',
   * 'right'), centred on the anchor, kept TIP_EDGE inside the window (`win`, this one by default).
   * opts.flip: a top or bottom tip without room on its side takes the other. Returns
   * { left, top, side }; the caller writes it (its own box, a popup-layer spot, Steam's tip).
   */
  const TIP_EDGE = 8;
  const tipSpot = (rect, w, h, side = 'bottom', { gap = px('--se-space-2'), flip = false, win = window } = {}) => {
    const vw = win.document.documentElement.clientWidth || win.innerWidth;
    const vh = win.innerHeight;
    if (flip && side === 'top' && rect.top - gap - h < TIP_EDGE) side = 'bottom';
    else if (flip && side === 'bottom' && rect.bottom + gap + h > vh - TIP_EDGE) side = 'top';
    const midX = rect.left + rect.width / 2 - w / 2;
    const midY = rect.top + rect.height / 2 - h / 2;
    const at = {
      top: [midX, rect.top - gap - h],
      bottom: [midX, rect.bottom + gap],
      left: [rect.left - gap - w, midY],
      right: [rect.right + gap, midY],
    }[side];
    const clamp = (v, size, room) => Math.round(Math.max(TIP_EDGE, Math.min(room - size - TIP_EDGE, v)));
    return { left: clamp(at[0], w, vw), top: clamp(at[1], h, vh), side };
  };
  const ms = (name) => {
    const value = token(name);
    const n = parseFloat(value) || 0;
    return /ms$/.test(value) ? n : n * 1000;
  };

  /*
   * Hover intent: a popup that opens after the pointer rests on its trigger, so a pointer
   * passing over a list opens nothing. delay: a duration token's name (read at each wait, so the
   * stylesheet needn't be in yet when a feature starts) or ms; --se-hover-delay by default. enter(node, ...args) starts
   * the wait for node; show(node, ...args) runs once it ends. left(event) is true when a
   * mouseout takes the pointer out of the current node.
   */
  const hoverIntent = (show, delay) => {
    let node = null;
    let timer = 0;
    const cancel = () => {
      clearTimeout(timer);
      timer = 0;
      node = null;
    };
    return {
      get node() {
        return node;
      },
      enter(next, ...args) {
        cancel();
        node = next;
        timer = setTimeout(() => {
          timer = 0;
          show(next, ...args);
        }, typeof delay === 'number' ? delay : ms(delay || '--se-hover-delay'));
      },
      cancel,
      left: (event) => Boolean(node && node.contains(event.target) && !node.contains(event.relatedTarget)),
    };
  };

  const railMode = () => !!document.body?.classList.contains('se-header-actions-ready');

  // The main window's view: its Library, or a Store/Community page in the native browser view.
  const libraryShown = () => {
    const path = run(() => mainWindow()?.LocationPathName);
    return path ? /^\/library\b/.test(path) : Boolean(document.querySelector(`.${C.GameListHomeAndSearch_Container}`));
  };

  const browserShown = () => {
    const path = run(() => mainWindow()?.LocationPathName) || '';
    if (/^\/(?:store|community|browser)(?:\/|$)/i.test(path)) return true;
    const local = document.querySelector(`.${C.LocalContentContainer}`);
    if (local?.hidden || local?.style.display === 'none') return true;
    if (path) return false;
    for (const owner of owners()) {
      const manager = run(() => owner.MainWindowBrowserManager);
      const url = run(() => manager?.m_URLRequested || manager?.m_URL) || '';
      if (/^https?:\/\//i.test(url) && !libraryShown()) return true;
    }
    return false;
  };

  const mark = (el, name, value = '') => {
    if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const unmark = (el, name) => {
    if (el && el.hasAttribute(name)) el.removeAttribute(name);
  };

  const attr = (el, name, value) => {
    if (!el) return;
    if (value == null || value === false) unmark(el, name);
    else mark(el, name, String(value));
  };

  // A theme element: tag, optional class, optional text.
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // Writes text only when it differs: a rewrite swaps the text node out from under the pointer.
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  /*
   * Inline SVG icons from a name -> markup map (24-unit viewBox):
   *   const { icon, setIcon } = SE.icons(ICONS, 'info');
   * icon(name, className?) makes one; setIcon(svg, name) swaps an icon in place. `fallback`
   * names the icon used for an unknown name.
   */
  const icons = (map, fallback) => {
    const markup = (name) => map[name] ?? (fallback ? map[fallback] : '') ?? '';
    return {
      icon(name, className) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        if (className) svg.setAttribute('class', className);
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
        return svg;
      },
      setIcon(svg, name) {
        if (svg.dataset.icon === name) return;
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
      },
    };
  };

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  // How long ago a Unix time (seconds) was: "just now", "5 min ago", "3 h ago", "yesterday",
  // "12 days ago", then weeks, months and years
  const ago = (t) => {
    if (!t) return '';
    const s = Date.now() / 1000 - t;
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 172800) return 'yesterday';
    const day = Math.round(s / 86400);
    if (day < 14) return `${day} days ago`;
    if (day < 60) return `${Math.round(day / 7)} wk ago`;
    if (day < 365) return `${Math.round(day / 30)} mo ago`;
    return `${Math.round(day / 365)} yr ago`;
  };

  // A Unix time's day: "Today", "Yesterday", then the date (with its year when not this one's);
  // `recent` says "3 days ago" within the week
  const dayLabel = (t, { recent = false } = {}) => {
    if (!t) return '';
    const d = new Date(t * 1000);
    const now = new Date();
    const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((midnight(now) - midnight(d)) / 864e5);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (recent && days < 7) return `${days} days ago`;
    const year = d.getFullYear() === now.getFullYear() ? undefined : 'numeric';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year });
  };

  // A size in binary units. Steam's dialogs: a decimal from KB, two from GB (localised); `short`:
  // one decimal under 100, none for bytes. '' for no size.
  const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = (value, { short = false } = {}) => {
    let n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '';
    let unit = 0;
    for (; n >= 1024 && unit < BYTE_UNITS.length - 1; unit++) n /= 1024;
    if (short) return `${!unit || n >= 100 ? Math.round(n) : n.toFixed(1)} ${BYTE_UNITS[unit]}`;
    const digits = unit >= 3 ? 2 : unit ? 1 : 0;
    return `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`;
  };

  // A size or count Steam reports: a number 0 or more, else null
  const amount = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // part of whole as a CSS width, kept within 0–100%
  const percent = (part, whole) => `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(3)}%`;

  // A name's initials, as Steam draws a group or friend without a picture: each word's first
  // letter or digit, so a symbol ("● Squad") never stands for a name
  const initials = (name) =>
    String(name || '')
      .trim()
      .split(/\s+/)
      .map((word) => [...word].find((ch) => /[\p{L}\p{N}]/u.test(ch)))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '#';

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);


  // Multiplexed document.body MutationObserver shared across feature modules.
  // Filters out no-op attribute/characterData writes to prevent observer feedback loops.
  const subscribers = [];
  const pendingSubs = new Set();
  let observer = null;
  let observerConfigKey = '';
  let scheduledFrame = 0;
  // How far past its time a throttle's timer counts as lost (enqueueSubscriber)
  const TIMER_LOST_MS = 1000;

  const hasRecordChanged = (record) => {
    if (record.type === 'attributes') {
      const target = record.target;
      const current = target.getAttributeNS
        ? target.getAttributeNS(record.attributeNamespace, record.attributeName)
        : null;
      return current !== record.oldValue;
    }
    if (record.type === 'characterData') return record.target.data !== record.oldValue;
    return true;
  };

  // Per-dispatch memo of ignore/scope verdicts, so 20 subscribers sharing SE.inside(SE.SIDE)
  // walk closest() once per record target instead of once each.
  let verdicts = null;
  const verdict = (key, node, test) => {
    if (!verdicts) verdicts = new Map(); // a nested dispatch (takeRecords in a sync sub) cleared it
    let byNode = verdicts.get(key);
    if (!byNode) verdicts.set(key, (byNode = new Map()));
    let result = byNode.get(node);
    if (result === undefined) byNode.set(node, (result = !!run(test, node)));
    return result;
  };

  const relevant = (sub, node) =>
    (!sub.scope || verdict(sub.scope, node, inside(sub.scope))) &&
    !(sub.ignore && verdict(sub.ignore, node, sub.ignore));

  // A scope root that mounts or unmounts is a change for that scope too: its parent, the
  // record's target, sits outside it.
  const touchesScope = (scope, record) => {
    for (const list of [record.addedNodes, record.removedNodes]) {
      for (const node of list) {
        if (node.nodeType === 1 && (node.matches(scope) || node.querySelector(scope))) return true;
      }
    }
    return false;
  };

  const matchesSubscriber = (sub, record) => {
    const typeMatches =
      record.type === 'childList' ||
      (record.type === 'attributes'
        ? sub.attributes.includes(record.attributeName)
        : sub.characterData);
    if (!typeMatches) return false;
    if (relevant(sub, record.target)) return true;
    return !!sub.scope && record.type === 'childList' && !(sub.ignore && verdict(sub.ignore, record.target, sub.ignore)) &&
      touchesScope(sub.scope, record);
  };

  const invokeSubscriber = (sub) => {
    sub.last = performance.now();
    try {
      sub.fn();
    } catch (err) {
      console.warn('[Steam Enhanced]', err);
    }
  };

  const flushFrame = () => {
    scheduledFrame = 0;
    const due = subscribers.filter(sub => pendingSubs.has(sub));
    pendingSubs.clear();
    for (const sub of due) invokeSubscriber(sub);
  };

  const enqueueSubscriber = (sub) => {
    if (sub.throttle) {
      const now = performance.now();
      // After Reload UI during a voice call, the main window drops timers set in its first
      // moments: one long overdue is taken as lost, or the subscriber would wait on it for good
      if (sub.timer && now < sub.due + TIMER_LOST_MS) return;
      clearTimeout(sub.timer);
      sub.timer = 0;
      const remaining = sub.last + sub.throttle - now;
      if (remaining > 0) {
        sub.due = now + remaining;
        sub.timer = setTimeout(() => {
          sub.timer = 0;
          enqueueSubscriber(sub);
        }, remaining);
        return;
      }
    }
    pendingSubs.add(sub);
    if (!scheduledFrame) scheduledFrame = requestAnimationFrame(flushFrame);
  };

  const dispatchRecords = (records, excludedSub) => {
    if (!records.length) return;
    const activeRecords = [];
    const mutatedAttrs = new Set();
    let hasChildList = false;
    let hasCharData = false;

    for (const record of records) {
      if (!hasRecordChanged(record)) continue;
      activeRecords.push(record);
      if (record.type === 'childList') hasChildList = true;
      else if (record.type === 'attributes') mutatedAttrs.add(record.attributeName);
      else hasCharData = true;
    }
    if (!activeRecords.length) return;

    verdicts = new Map();
    for (const sub of subscribers) {
      if (sub === excludedSub) continue;
      const filtered = !!(sub.ignore || sub.scope);
      if (
        !filtered &&
        !hasChildList &&
        !(hasCharData && sub.characterData) &&
        !sub.attributes.some(attrName => mutatedAttrs.has(attrName))
      ) {
        continue;
      }
      if (filtered && !activeRecords.some(record => matchesSubscriber(sub, record))) continue;

      if (sub.records) {
        try {
          sub.fn(activeRecords.filter(record => matchesSubscriber(sub, record)));
        } catch (err) {
          console.warn('[Steam Enhanced]', err);
        }
      } else if (sub.sync && !sub.throttle) {
        invokeSubscriber(sub);
      } else {
        enqueueSubscriber(sub);
      }
    }
    verdicts = null;
  };

  let waitingForBody = false;
  const syncObserver = () => {
    if (!document.body) {
      if (!waitingForBody) {
        waitingForBody = true;
        addEventListener('DOMContentLoaded', () => {
          waitingForBody = false;
          syncObserver();
        }, { once: true });
      }
      return;
    }
    if (!subscribers.length) {
      if (observer) {
        observer.disconnect();
        observer = null;
        observerConfigKey = '';
      }
      return;
    }
    const attrs = [...new Set(subscribers.flatMap(sub => sub.attributes))].sort();
    const watchText = subscribers.some(sub => sub.characterData);
    const key = attrs.join(',') + (watchText ? '|text' : '');
    if (observer && key === observerConfigKey) return;

    if (observer) dispatchRecords(observer.takeRecords());
    else observer = new MutationObserver(records => dispatchRecords(records));

    observerConfigKey = key;
    observer.disconnect();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      ...(watchText ? { characterData: true, characterDataOldValue: true } : {}),
      ...(attrs.length ? { attributes: true, attributeOldValue: true, attributeFilter: attrs } : {}),
    });
  };

  /*
   * Subscribes to body mutations. Non-sync subscribers are already coalesced into one rAF, so
   * callers don't need their own frame scheduling. Options:
   *   scope       only mutations inside this selector count (cheapest way to stay quiet)
   *   ignore      node => true to skip mutations under that node
   *   attributes  attribute names to watch (each widens the shared observer: keep it short)
   *   characterData, throttle (ms), sync (run inside the observer callback), records (get them)
   */
  const watch = (fn, opts = {}) => {
    const sub = {
      scope: typeof opts.scope === 'string' && opts.scope ? opts.scope : null,
      fn,
      attributes: opts.attributes || [],
      characterData: !!opts.characterData,
      sync: !!opts.sync,
      records: !!opts.records,
      throttle: Math.max(0, Number(opts.throttle) || 0),
      ignore: typeof opts.ignore === 'function' ? opts.ignore : null,
      last: -Infinity,
      timer: 0,
    };
    subscribers.push(sub);
    syncObserver();
    return {
      disconnect() {
        const idx = subscribers.indexOf(sub);
        if (idx < 0) return;
        subscribers.splice(idx, 1);
        pendingSubs.delete(sub);
        if (sub.timer) {
          clearTimeout(sub.timer);
          sub.timer = 0;
        }
        syncObserver();
      },
      takeRecords() {
        if (observer) dispatchRecords(observer.takeRecords(), sub);
        pendingSubs.delete(sub);
        if (sub.timer) {
          clearTimeout(sub.timer);
          sub.timer = 0;
        }
        return [];
      },
    };
  };

  // One predicate per selector, so verdicts are shared between subscribers using the same one.
  const insideCache = new Map();
  const inside = (selector) => {
    let test = insideCache.get(selector);
    if (!test) {
      test = (node) => {
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        return !!el?.closest?.(selector);
      };
      insideCache.set(selector, test);
    }
    return test;
  };

  // High-frequency chrome regions excluded by content-area observers.
  const SIDE = `.${C.TopBar}, .${C.GameListHomeAndSearch_Container}, .se-fdock, .se-fd-fly, .se-fd-menu`;

  // checkVisibility() answers "has a box" from style alone; getClientRects() forced a layout,
  // and polls ask this every tick
  const hasBox = (el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0);
  const visible = (target) => {
    const nodes = typeof target === 'string' ? document.querySelectorAll(target) : [target];
    return [...nodes].some(el => el?.isConnected && !el.closest('[hidden]') && hasBox(el));
  };

  const poll = (fn, delay, opts = {}) => {
    const doc = opts.document || document;
    const win = doc.defaultView;
    // While inactive, re-check `active` every 0.5-1.5 s (the old fixed 500 ms ran a layout read
    // twice a second per poll). Watchers call refresh() to wake it sooner.
    const idleInterval = Number(opts.idle) || Math.min(Math.max(delay, 500), 1500);
    let lastWake = 0;
    let timer = null;
    let stopped = false;
    let isActive = false;
    let dueAt = 0;
    const arm = (ms) => {
      dueAt = performance.now() + ms;
      timer = setTimeout(tick, ms);
    };

    const isDocumentVisible = () => !win?.closed && doc.visibilityState !== 'hidden';

    const tick = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (stopped || !isDocumentVisible()) {
        isActive = false;
        return;
      }
      isActive = !opts.active || !!run(opts.active);
      if (isActive) {
        try {
          fn();
        } catch (err) {
          console.warn('[Steam Enhanced]', err);
        }
      }
      if (!stopped && timer === null) arm(isActive ? delay : idleInterval);
    };

    const wake = () => {
      const now = performance.now();
      // A timer long past its time was lost (TIMER_LOST_MS): waking runs the poll again
      const lost = timer !== null && now > dueAt + TIMER_LOST_MS;
      if (stopped || !isDocumentVisible() || (timer !== null && isActive && !lost)) return;
      if (timer !== null && now - lastWake < 100) return; // resize fires per frame
      lastWake = now;
      tick();
    };

    const wakeEvents = ['resize', 'focus', 'pageshow'];
    doc.addEventListener('visibilitychange', wake);
    for (const type of wakeEvents) win?.addEventListener?.(type, wake);

    if (isDocumentVisible()) {
      isActive = !opts.active || !!run(opts.active);
      arm(isActive ? delay : idleInterval);
    }

    return {
      refresh: wake,
      disconnect() {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        doc.removeEventListener('visibilitychange', wake);
        for (const type of wakeEvents) win?.removeEventListener?.(type, wake);
      },
    };
  };

  /* ---------- Small shared helpers ---------- */

  // Listener tied to a dialog's cleanup list: adds it now, removes it when the list runs.
  const listenInto = (list) => (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    list.push(() => target.removeEventListener(type, fn, options));
  };

  // A labelled try: attempt(fn, fallback) runs fn and, if it throws, warns under `label` and
  // returns `fallback`. One per feature: const attempt = SE.attempt('Install');
  const attempt = (label) => (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn(`[Steam Enhanced] ${label}:`, err);
      return fallback;
    }
  };

  // Copies text to the clipboard of `win`: the async API, else a selected textarea (some Steam
  // windows refuse the API). Resolves true once copied.
  const copy = async (text, win = window) => {
    try {
      await win.navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const doc = win.document;
    const area = doc.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    (doc.body ?? doc.documentElement).append(area);
    area.select();
    let copied = false;
    try {
      copied = doc.execCommand('copy');
    } catch {}
    area.remove();
    return copied;
  };

  // The theme's version, from its own skin.json: fetched once per window. Resolves null if the
  // manifest can't be read.
  const coreSrc =
    document.currentScript?.src ||
    [...document.scripts].find(script => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  let versionRequest = null;
  const themeVersion = () =>
    (versionRequest ??= coreSrc
      ? fetch(new URL('../skin.json', coreSrc), { cache: 'no-store' })
          .then(response => response.json())
          .then(skin => (typeof skin?.version === 'string' && skin.version ? skin.version : null))
          .catch(() => null)
      : Promise.resolve(null));

  /*
   * Runs fn at most once per frame while `root`'s subtree changes. Changes on or inside nodes
   * `ignore(node)` claims (the theme's own) don't count. options: attributes (names to watch),
   * characterData. Returns { schedule, disconnect }; schedule() queues a run by hand.
   */
  const onChange = (root, fn, { attributes = null, characterData = false, ignore = null } = {}) => {
    // A subscriber on the window's one shared observer (watch), kept to mutations inside root;
    // the theme's own nodes (ignore) don't count, added or removed
    let frame = 0;
    const theirs = (node) => !ignore || !ignore(node);
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          fn();
        });
      }
    };
    const sub = watch((records) => {
      const changed = records.some(
        record =>
          theirs(record.target) &&
          (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(theirs))
      );
      if (changed) schedule();
    }, {
      records: true,
      attributes: attributes || [],
      characterData,
      ignore: (node) => !root.isConnected || !root.contains(node),
    });
    return {
      schedule,
      disconnect() {
        sub.disconnect();
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  };


  /*
   * One view per root. find() lists the roots on the page; create(root) builds a view (an object
   * with destroy()) or returns nothing to try that root again on the next scan. Scans run on
   * page changes (SE.watch with `options`), and a view whose root has left the page is
   * destroyed. Returns { views, scan, destroy }; views maps root -> view.
   */
  const mount = (label, find, create, options = {}) => {
    const tryIt = attempt(label);
    const views = new Map();
    // A view that subscribes while it's made can widen the shared observer, which hands over its
    // pending records at once and runs this scan again: a root being made is skipped
    const making = new Set();
    const scan = () => {
      for (const [root, view] of views) {
        if (root.isConnected) continue;
        views.delete(root);
        tryIt(() => view.destroy());
      }
      for (const root of tryIt(find, [])) {
        if (!root || views.has(root) || making.has(root)) continue;
        making.add(root);
        const view = tryIt(() => create(root), null);
        making.delete(root);
        if (view) views.set(root, view);
      }
    };
    const watcher = watch(scan, options);
    scan();
    return {
      views,
      scan,
      destroy() {
        watcher.disconnect();
        for (const view of views.values()) tryIt(() => view.destroy());
        views.clear();
      },
    };
  };

  window.__se = {
    C,
    run,
    fiber,
    liveFiber,
    props,
    fromProps,
    appOf,
    findDown,
    owners,
    steamCall,
    isRunning,
    mainWindow,
    navigate,
    requires,
    findModule,
    importOf,
    global,
    cssVar,
    token,
    px,
    tipSpot,
    ms,
    hoverIntent,
    railMode,
    libraryShown,
    browserShown,
    mark,
    unmark,
    attr,
    esc,
    ago,
    day: dayLabel,
    bytes,
    amount,
    percent,
    initials,
    el,
    setText,
    icons,
    leadApp,
    lastMenuApp,
    noteMenuApp,
    watch,
    visible,
    poll,
    inside,
    attempt,
    listenInto,
    copy,
    themeVersion,
    onChange,
    mount,
    SIDE,
    inSide: inside(SIDE),
  };
  dispatchEvent(new Event('se-core'));
})();
