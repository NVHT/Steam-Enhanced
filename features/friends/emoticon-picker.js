/*
 * Emoticon picker: finds it and marks its parts for features/friends/emoticon-picker.css.
 *
 * The picker's CSS module classes can't be relied on (they did not match the client), so it is
 * found by what it holds: emoticon or sticker images and a search field, in a box of popup size.
 * Runs in every window, as Steam may open it in a popup of its own; it does nothing where no
 * picker is open. Marks:
 * - data-se-epicker: the picker; data-se-epicker-frame: wrappers hugging it (Steam's slate
 *   popup frame), so only one card shows;
 * - data-se-epicker-part="tabs" | "search" | "body": its children holding those, so the panel
 *   can be laid out anew (tabs, search, emoticons);
 * - data-se-epicker-strip and data-se-epicker-tab: the tab strip and its tabs (the strip's
 *   children drawn with an icon); data-se-active: the open tab, the one carrying a class more
 *   than its siblings, else the one under Steam's underline;
 * - data-se-epicker-item: an emoticon or sticker tile (the outermost wrapper holding only it);
 * - data-se-epicker-search: the search field;
 * - data-se-label: a section title (short uppercase text).
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedEmoticonPicker?.destroy();
  if (!document.body) return;

  const ART = 'img[src*="emoticon" i], img[src*="sticker" i]';
  const ROOT = 'data-se-epicker';
  const FRAME = 'data-se-epicker-frame';
  const PART = 'data-se-epicker-part';
  const STRIP = 'data-se-epicker-strip';
  const TAB = 'data-se-epicker-tab';
  const ITEM = 'data-se-epicker-item';
  const ACTIVE = 'data-se-active';
  const LABEL = 'data-se-label';
  const SEARCH = 'data-se-epicker-search';
  const ATTRS = [ROOT, FRAME, PART, STRIP, TAB, ITEM, ACTIVE, LABEL, SEARCH];
  /* Emoticons in chat lines and reactions, never in a picker */
  const MESSAGES = '.ChatMessageBlock, .msg, .chatHistory';
  const ROOT_CLIMB = 10;
  const FRAME_CLIMB = 3;
  const FRAME_SLACK = 16;
  const MAX_W = 720;
  const MAX_H = 760;
  const ART_LIMIT = 400;
  const LABEL_LIMIT = 300;
  const LABEL_MAX_LENGTH = 48;
  const checkedLabels = new WeakSet();
  /* Images known not to be in a picker (chat messages): skipped on later passes */
  const elsewhere = new WeakSet();

  const fits = r => r.width > 0 && r.width <= MAX_W && r.height <= MAX_H;
  const hasOwnText = el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());

  /*
   * From an emoticon image up to the box that also holds the search field, at popup size.
   * An image whose boxes outgrow a popup before reaching one (a chat message) is remembered.
   */
  const pickerOf = img => {
    if (img.closest(MESSAGES)) {
      elsewhere.add(img);
      return null;
    }
    for (let node = img.parentElement, i = 0; node && node !== document.body && i < ROOT_CLIMB; node = node.parentElement, i++) {
      const r = node.getBoundingClientRect();
      if (!r.width) return null;
      if (!fits(r)) {
        elsewhere.add(img);
        return null;
      }
      /* The composer's textarea means this is a chat, not the picker */
      if (node.querySelector('textarea')) {
        elsewhere.add(img);
        return null;
      }
      if (node.querySelector('input')) return node;
    }
    elsewhere.add(img);
    return null;
  };

  const markFrames = root => {
    const r = root.getBoundingClientRect();
    for (let node = root.parentElement, i = 0; node && node !== document.body && i < FRAME_CLIMB; node = node.parentElement, i++) {
      const p = node.getBoundingClientRect();
      const hugs =
        Math.abs(p.left - r.left) <= FRAME_SLACK &&
        Math.abs(p.right - r.right) <= FRAME_SLACK &&
        Math.abs(p.top - r.top) <= FRAME_SLACK &&
        Math.abs(p.bottom - r.bottom) <= FRAME_SLACK;
      if (!hugs) break;
      SE.mark(node, FRAME);
    }
  };

  /*
   * An emoticon's tile: the outermost wrapper that holds only the image, so the theme's hover
   * is the only one (Steam paints its own on one of those wrappers)
   */
  const TILE_CLIMB = 4;
  const tileOf = img => {
    let tile = img;
    for (let i = 0; i < TILE_CLIMB; i++) {
      const parent = tile.parentElement;
      if (!parent || parent.childElementCount !== 1 || parent.hasAttribute(ROOT)) break;
      tile = parent;
    }
    return tile;
  };

  /* The tabs: the element holding the most children drawn with an icon (and no artwork) */
  const findStrip = root => {
    const counts = new Map();
    for (const svg of root.querySelectorAll('svg')) {
      let tab = svg;
      while (tab.parentElement && tab.parentElement !== root && tab.parentElement.childElementCount === 1) tab = tab.parentElement;
      const strip = tab.parentElement;
      if (!strip || strip === root || tab.querySelector('img') || tab.closest(`[${ITEM}]`)) continue;
      counts.set(strip, (counts.get(strip) || 0) + 1);
    }
    let best = null;
    let most = 1;
    for (const [strip, count] of counts) {
      if (count > most) {
        best = strip;
        most = count;
      }
    }
    return best;
  };

  const underlinedTab = (strip, tabs) => {
    const line = [...strip.children].find(child => !tabs.includes(child));
    const r = line?.getBoundingClientRect();
    if (!r?.width) return null;
    const mid = r.left + r.width / 2;
    return tabs.find(tab => {
      const t = tab.getBoundingClientRect();
      return mid >= t.left && mid <= t.right;
    });
  };

  const openTab = (strip, tabs) => {
    const counts = tabs.map(tab => tab.classList.length);
    const fewest = Math.min(...counts);
    const marked = tabs.filter((_, i) => counts[i] > fewest);
    return marked.length === 1 ? marked[0] : underlinedTab(strip, tabs);
  };

  const sync = root => {
    SE.mark(root, ROOT);
    markFrames(root);

    const arts = [...root.querySelectorAll(ART)].slice(0, ART_LIMIT);
    for (const img of arts) SE.mark(tileOf(img), ITEM);

    const strip = findStrip(root);
    const tabs = strip ? [...strip.children].filter(child => child.querySelector('svg')) : [];
    for (const tab of tabs) SE.mark(tab, TAB);
    if (strip) SE.mark(strip, STRIP);
    const open = strip ? openTab(strip, tabs) : null;
    for (const tab of tabs) SE.attr(tab, ACTIVE, tab === open ? '' : null);

    const search = root.querySelector('input');
    if (search) SE.mark(search, SEARCH);
    for (const child of root.children) {
      const role =
        (strip && child.contains(strip) && 'tabs') ||
        (search && child.contains(search) && 'search') ||
        (arts[0] && child.contains(arts[0]) && 'body') ||
        null;
      SE.attr(child, PART, role);
    }

    const nodes = root.getElementsByTagName('*');
    for (let i = 0; i < nodes.length && i < LABEL_LIMIT; i++) {
      const el = nodes[i];
      if (checkedLabels.has(el) || !hasOwnText(el)) continue;
      checkedLabels.add(el);
      if (el.closest(`[${STRIP}], [${ITEM}]`) || el.textContent.length > LABEL_MAX_LENGTH) continue;
      if (getComputedStyle(el).textTransform === 'uppercase') SE.mark(el, LABEL);
    }
  };

  let frame = 0;

  const update = () => {
    frame = 0;
    const roots = new Set(document.querySelectorAll(`[${ROOT}]`));
    for (const img of document.querySelectorAll(ART)) {
      if (elsewhere.has(img) || img.closest(`[${ROOT}], .GamepadMode`)) continue;
      const root = pickerOf(img);
      if (root) roots.add(root);
    }
    for (const root of roots) {
      if (root.isConnected) sync(root);
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const watcher = SE.watch(schedule);
  schedule();

  window.__steamEnhancedEmoticonPicker = {
    destroy() {
      watcher.disconnect();
      if (frame) cancelAnimationFrame(frame);
      const selector = ATTRS.map(name => `[${name}]`).join(', ');
      for (const el of document.querySelectorAll(selector)) {
        for (const name of ATTRS) el.removeAttribute(name);
      }
      delete window.__steamEnhancedEmoticonPicker;
    },
  };
});
