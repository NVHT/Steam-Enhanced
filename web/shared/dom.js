/*
 * Web runtime shared by every Store, Community and Support feature: published as web.dom, and
 * web/shared/site-loader.js passes it to each page's init as `dom`.
 *
 *  - One MutationObserver for the whole page. Features subscribe with observe(); each
 *    subscriber is run at most once per frame with the records that concern it. Changes inside
 *    the theme's own elements ([data-se-own]) never wake anyone.
 *  - Small DOM helpers that write only on change, so rescans never feed the observer.
 *  - scope(): a feature's listeners, timers, marks, moves, added nodes and undo steps, released
 *    by one destroy().
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const OWN = 'data-se-own';

  /* ---------- DOM helpers ---------- */

  /** Set an attribute only if it differs. */
  const mark = (node, name, value = '') => {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  };

  const unmark = (node, name) => {
    if (node?.hasAttribute(name)) node.removeAttribute(name);
  };

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const setVar = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  };

  /**
   * Move a sliding tab pill onto a tab. The width snaps to the new tab; the motion is a
   * transform (translate, plus scaleX from the old width), so the slide never runs through
   * layout. The CSS reads --x, --y, --w and --sx.
   */
  const pillBoxes = new WeakMap();
  const slidePill = (pill, { x, y = 0, w }) => {
    const from = pillBoxes.get(pill);
    pillBoxes.set(pill, { x, y, w });
    setVar(pill, '--w', `${w}px`);
    if (!from || !from.w || !w) {
      setVar(pill, '--x', `${x}px`);
      setVar(pill, '--y', `${y}px`);
      setVar(pill, '--sx', '1');
      return;
    }
    if (from.x === x && from.y === y && from.w === w) return;
    // Start from the old box with no transition, then let the transform ease to the new one
    pill.style.transition = 'none';
    setVar(pill, '--x', `${from.x}px`);
    setVar(pill, '--y', `${from.y}px`);
    setVar(pill, '--sx', String(from.w / w));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pill.style.removeProperty('transition');
      const now = pillBoxes.get(pill);
      setVar(pill, '--x', `${now.x}px`);
      setVar(pill, '--y', `${now.y}px`);
      setVar(pill, '--sx', '1');
    }));
  };

  const squash = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

  /**
   * Create a theme-owned element. props: class, text, any aria-* / data-* / role attribute, or a
   * DOM property (type, href, hidden...). Every element made here carries [data-se-own].
   */
  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    node.setAttribute(OWN, '');
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'role' || key.startsWith('aria-') || key.startsWith('data-')) node.setAttribute(key, value === true ? '' : value);
      else node[key] = value;
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  };

  const isOwn = (node) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(element?.closest(`[${OWN}]`));
  };

  /** Resolves once the document is parsed (scripts run as soon as they download). */
  const ready = () =>
    document.readyState === 'loading'
      ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
      : Promise.resolve();

  /** Copy text to the clipboard: the async API, else a selected textarea. Resolves true once copied. */
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {}
    field.remove();
    return copied;
  };

  /* ---------- Price chip ---------- */

  const PERCENT = /^-?\d+%$/;
  const PRICE_PARTS = ['data-se-price', 'data-se-price-pct', 'data-se-price-bundle', 'data-se-price-amounts', 'data-se-price-was', 'data-se-price-now'];
  const ownText = (node) =>
    [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent).join('').trim();

  /**
   * Tag a price widget for the shared chip (shared/ui.css). React widgets (hashed insides) get
   * their parts tagged by shape: the discount badge (its text is "-23%"; a bundle's extra
   * "-10%" nests inside it), then the amounts (was over now, or now alone). Classic
   * .discount_block widgets have stable classes and only need the root tag.
   */
  const tagPrice = (price) => {
    if (!price) return;
    mark(price, 'data-se-price');
    if (!price.matches('.StoreSalePriceWidgetContainer')) return;
    const children = [...price.children];
    const pct = children.find((child) => PERCENT.test(ownText(child)) || PERCENT.test(child.textContent.trim()));
    if (pct) {
      mark(pct, 'data-se-price-pct');
      for (const inner of pct.children) {
        if (PERCENT.test(inner.textContent.trim()) && ownText(pct)) mark(inner, 'data-se-price-bundle');
      }
    }
    const rest = children.filter((child) => child !== pct && child.textContent.trim() && !child.matches('[aria-hidden="true"]:empty'));
    const amounts = rest.find((child) => child.children.length >= 2);
    if (amounts) {
      mark(amounts, 'data-se-price-amounts');
      mark(amounts.firstElementChild, 'data-se-price-was');
      mark(amounts.lastElementChild, 'data-se-price-now');
    } else if (rest.length) {
      mark(rest[rest.length - 1], 'data-se-price-now');
    }
  };

  const PRICE_SELECTOR = PRICE_PARTS.map((name) => `[${name}]`).join(', ');

  /** Untag one price widget and its parts (other features' prices elsewhere stay tagged). */
  const untagPrice = (price) => {
    for (const node of [price, ...price.querySelectorAll(PRICE_SELECTOR)]) {
      for (const name of PRICE_PARTS) node.removeAttribute(name);
    }
  };

  const untagPrices = () => {
    for (const node of document.querySelectorAll(PRICE_SELECTOR)) {
      for (const name of PRICE_PARTS) node.removeAttribute(name);
    }
  };

  /* ---------- Game art ---------- */

  /** A game's library hero on Steam's CDN, in the order to try the hosts. */
  const heroURLs = (appid) => [
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
  ];

  const preload = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth > 1 ? resolve(url) : reject(new Error('empty')));
      img.onerror = reject;
      img.src = url;
    });

  /** The first of `urls` that loads as a real image (not Steam's 1×1 placeholder), else null. */
  const firstLoaded = async (urls) => {
    for (const url of urls) {
      try {
        return await preload(url);
      } catch {
        // the next one
      }
    }
    return null;
  };

  /* ---------- One observer for every feature ---------- */

  const subscribers = new Set();
  let observer = null;
  let frame = 0;

  const relevant = (sub, record) => {
    if (record.type === 'attributes') {
      return sub.attributes.includes(record.attributeName) && !isOwn(record.target) && (!sub.filter || sub.filter(record));
    }
    if (isOwn(record.target)) return false;
    const changed = [...record.addedNodes, ...record.removedNodes].some(
      (node) => !(node.nodeType === 1 && node.hasAttribute(OWN)),
    );
    return changed && (!sub.filter || sub.filter(record));
  };

  const flush = () => {
    frame = 0;
    for (const sub of subscribers) {
      if (!sub.records) continue;
      const records = sub.records;
      sub.records = null;
      try {
        sub.callback(records);
      } catch (error) {
        console.error('[Steam Enhanced]', error);
      }
    }
  };

  const onRecords = (records) => {
    for (const sub of subscribers) {
      for (const record of records) {
        if (!relevant(sub, record)) continue;
        (sub.records ??= []).push(record);
      }
    }
    if (!frame && [...subscribers].some((sub) => sub.records)) frame = requestAnimationFrame(flush);
  };

  /**
   * Run `callback(records)` at most once per frame after the page changes. Options:
   *   attributes  attribute names to watch besides child lists (only 'class' and 'style' exist)
   *   filter      (record) => boolean, to drop records the feature doesn't care about
   * Returns an unsubscribe function.
   */
  const observe = (callback, { attributes = [], filter = null } = {}) => {
    const sub = { callback, attributes, filter, records: null };
    subscribers.add(sub);
    if (!observer) {
      observer = new MutationObserver(onRecords);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }
    return () => {
      subscribers.delete(sub);
      if (subscribers.size) return;
      observer.disconnect();
      observer = null;
      cancelAnimationFrame(frame);
      frame = 0;
    };
  };

  /** Coalesce calls to `fn` into one per frame. */
  const perFrame = (fn) => {
    let id = 0;
    const run = () => {
      if (!id) id = requestAnimationFrame(() => {
        id = 0;
        fn();
      });
    };
    run.cancel = () => {
      cancelAnimationFrame(id);
      id = 0;
    };
    return run;
  };

  /* ---------- Feature scope ---------- */

  /** A feature's resources, released in reverse order by destroy(). */
  const SEARCH = 'data-se-search';
  const SEARCH_BOX = 'data-se-search-box';
  const SEARCH_GO = 'data-se-search-go';

  const scope = () => {
    const undo = [];
    const searched = new WeakSet();
    let alive = true;
    return {
      get alive() {
        return alive;
      },
      add(fn) {
        undo.push(fn);
        return fn;
      },
      listen(target, type, fn, options) {
        target.addEventListener(type, fn, options);
        undo.push(() => target.removeEventListener(type, fn, options));
      },
      observe(callback, options) {
        undo.push(observe(callback, options));
      },
      /** Set an attribute (only if it differs); destroy() removes it. */
      mark(node, name, value = '') {
        mark(node, name, value);
        undo.push(() => unmark(node, name));
      },
      /**
       * A search box in the shared look (web/shared/search-field.css): tags the input, the
       * ancestor its magnifier is drawn on (`box`, the input's parent unless given), and Steam's
       * submit control when there is one (`go`: it becomes the magnifier and still submits).
       * Safe to call on every pass; destroy() untags.
       */
      search(input, box = input?.parentElement, go = null) {
        if (!input) return;
        for (const [node, name] of [[input, SEARCH], [box, SEARCH_BOX], [go, SEARCH_GO]]) {
          if (!node) continue;
          mark(node, name);
          if (searched.has(node)) continue;
          searched.add(node);
          undo.push(() => unmark(node, name));
        }
      },
      /** Move a node (before `before`, else to the end of `target`); destroy() puts it back. */
      move(node, target, before = null) {
        const parent = node.parentNode;
        const next = node.nextSibling;
        target.insertBefore(node, before);
        undo.push(() => parent?.insertBefore(node, next?.parentNode === parent ? next : null));
      },
      /** A node the feature added; destroy() removes it. Returns the node. */
      owned(node) {
        undo.push(() => node.remove());
        return node;
      },
      timeout(fn, ms) {
        const id = setTimeout(fn, ms);
        undo.push(() => clearTimeout(id));
        return id;
      },
      destroy() {
        alive = false;
        while (undo.length) {
          try {
            undo.pop()();
          } catch (error) {
            console.error('[Steam Enhanced]', error);
          }
        }
      },
    };
  };

  web.dom = { OWN, mark, unmark, setText, setVar, slidePill, squash, el, isOwn, ready, copy, tagPrice, untagPrice, untagPrices, heroURLs, firstLoaded, observe, perFrame, scope };
})();
