/*
 * Game Details page: helpers every part shares (owned nodes, formatters, popup placement,
 * Steam client lookup) and the frame pass that runs every step (index.js).
 */
((SE) => {
  const ns = (window.__seGamePageParts = { live: {} });

  /*
   * Class names of everything this module inserts. destroy() finds the nodes by class, so
   * nothing here holds a node after Steam unmounts it (a Set of nodes kept whole detached
   * sections and their fibers alive).
   */
  const ownClasses = new Set(['se-ach-fx', 'se-ach-clone']);

  const srcOf = (img) => img.currentSrc || img.getAttribute('src') || '';
  const own = (tag, className) => {
    const el = document.createElement(tag);
    el.className = className;
    ownClasses.add(className.split(' ')[0]);
    return el;
  };
  const drop = (el) => el?.remove();

  function parseCount(text) {
    const m = String(text || '').match(/(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/);
    return m ? [parseInt(m[1].replace(/\D/g, ''), 10), Math.max(1, parseInt(m[2].replace(/\D/g, ''), 10))] : null;
  }

  // Formatters are costly to build; one of each, created on first use.
  const formatters = new Map();
  const formatTime = (rt, opts) => {
    const key = JSON.stringify(opts);
    try {
      if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(undefined, opts));
      return formatters.get(key).format(new Date(rt * 1000));
    } catch {
      return '';
    }
  };
  const DAY = { year: 'numeric', month: 'short', day: 'numeric' };
  const when = (rt) => formatTime(rt, { ...DAY, hour: 'numeric', minute: 'numeric' });
  const day = (rt) => formatTime(rt, DAY);

  function sharedParent(a, b, stop) {
    while (a.parentElement && a.parentElement !== stop && !a.parentElement.contains(b)) {
      a = a.parentElement;
    }
    const p = a.parentElement;
    return p && p !== stop ? p : null;
  }

  /*
   * Both boxes come from an IntersectionObserver, which reports them after the next layout:
   * reading them here forced a layout of the whole page on every hover (~70 ms at 4K). The
   * popup shows at once, out of view, and moves into place when the boxes arrive; a hide in
   * between (data-on removed) leaves it hidden.
   */
  function placePopup(pop, anchor) {
    const doc = anchor.ownerDocument;
    const win = doc.defaultView || window;
    // Re-appending an existing child is still a body mutation (and a full update pass).
    if (pop.parentNode !== doc.body) doc.body.appendChild(pop);
    // Already showing (the pointer moved to the next anchor): it stays put until placed
    if (!pop.hasAttribute('data-on')) {
      pop.style.left = '-9999px';
      pop.style.top = '0px';
      pop.dataset.on = '';
    }
    pop.__seIO?.disconnect();
    const boxes = new Map();
    const io = new win.IntersectionObserver((entries) => {
      for (const entry of entries) boxes.set(entry.target, entry.boundingClientRect);
      if (!boxes.has(pop) || !boxes.has(anchor)) return;
      io.disconnect();
      if (pop.__seIO !== io) return;
      pop.__seIO = null;
      const t = boxes.get(pop);
      // Above its anchor, below when there's no room (core/runtime.js SE.tipSpot)
      const { left, top } = SE.tipSpot(boxes.get(anchor), t.width, t.height, 'top', { flip: true, win });
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    });
    pop.__seIO = io;
    io.observe(pop);
    io.observe(anchor);
  }

  const steamClient = () =>
    SE.global('SteamClient', (sc) => typeof sc?.Apps?.GetMyAchievementsForApp === 'function');

  /*
   * One pass of every step per frame. Parts ask for one with schedule(); index.js sets what a
   * pass runs (setPass) and cancels a pending one when it runs a pass itself (cancelPass).
   */
  let frame = 0;
  let pass = () => {};
  const setPass = (fn) => {
    pass = fn;
  };
  function cancelPass() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      pass();
    });
  }

  // Whether an image is at least `min` px wide, by its own pixels (naturalWidth needs no layout;
  // its drawn width forced one per new image on every page pass). One not loaded yet: `unknown`.
  const isWide = (img, min, unknown = false) => (img.complete && img.naturalWidth ? img.naturalWidth >= min : unknown);

  Object.assign(ns, {
    isWide,
    cancelPass, day, drop, formatTime, own, ownClasses, parseCount, placePopup, schedule, setPass,
    sharedParent, srcOf, steamClient, when,
  });
})(window.__se);
