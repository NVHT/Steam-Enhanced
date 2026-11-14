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

  function placePopup(pop, anchor) {
    const doc = anchor.ownerDocument;
    // Re-appending an existing child is still a body mutation (and a full update pass).
    if (pop.parentNode !== doc.body) doc.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const t = pop.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    pop.style.left = `${Math.max(8, Math.min(vw - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
    pop.style.top = `${top}px`;
    pop.dataset.on = '';
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

  Object.assign(ns, {
    cancelPass, day, drop, formatTime, own, ownClasses, parseCount, placePopup, schedule, setPass,
    sharedParent, srcOf, steamClient, when,
  });
})(window.__se);
