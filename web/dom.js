/*
 * Web runtime shared by every Store, Community and Support feature (web/site-loader.js passes
 * it to each one as `dom`).
 *
 *  - One MutationObserver for the whole page. Features subscribe with observe(); each
 *    subscriber is run at most once per frame with the records that concern it. Changes inside
 *    the theme's own elements ([data-se-own]) never wake anyone.
 *  - Small DOM helpers that write only on change, so rescans never feed the observer.
 *  - scope(): a feature's listeners, timers, marks, moves, added nodes and undo steps, released
 *    by one destroy().
 */

export const OWN = 'data-se-own';

/* ---------- DOM helpers ---------- */

/** Set an attribute only if it differs. */
export const mark = (node, name, value = '') => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};

export const unmark = (node, name) => {
  if (node?.hasAttribute(name)) node.removeAttribute(name);
};

export const setText = (node, text) => {
  if (node.textContent !== text) node.textContent = text;
};

export const setVar = (node, name, value) => {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
};

export const squash = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * Create a theme-owned element. props: class, text, any aria-* / data-* / role attribute, or a
 * DOM property (type, href, hidden...). Every element made here carries [data-se-own].
 */
export const el = (tag, props = {}, children = []) => {
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

export const isOwn = (node) => {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(element?.closest(`[${OWN}]`));
};

/** Resolves once the document is parsed (scripts run as soon as they download). */
export const ready = () =>
  document.readyState === 'loading'
    ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();

/**
 * Import a theme module next to a feature (`base` is its import.meta.url), with the same
 * ?v=<theme version>, so the web view never mixes builds.
 */
export const importNear = (base, file) => {
  const url = new URL(file, base);
  url.search = new URL(base).search;
  return import(url.href);
};

/** Copy text to the clipboard: the async API, else a selected textarea. Resolves true once copied. */
export const copy = async (text) => {
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
export const tagPrice = (price) => {
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

export const untagPrices = () => {
  for (const node of document.querySelectorAll(PRICE_PARTS.map((name) => `[${name}]`).join(', '))) {
    for (const name of PRICE_PARTS) node.removeAttribute(name);
  }
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
export const observe = (callback, { attributes = [], filter = null } = {}) => {
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
export const perFrame = (fn) => {
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
export const scope = () => {
  const undo = [];
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
