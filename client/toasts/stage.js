/*
 * Toasts: the view (dock, tray, stage, strip) and playing toasts on it (each drawn by card.js).
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { mark, run, unmark } = SE;
  const { IN_GAME, PRUNE_MS, ZOOM } = ns;
  const { live } = ns;

  /* ---------- View ---------- */

  let stage = null;
  let strip = null;
  let pos = null;

  function build() {
    live.dock = document.createElement('div');
    live.dock.id = 'se-tst';
    live.dock.style.setProperty('--se-tst-zoom', String(Math.round(ZOOM * 10000) / 10000));
    live.dock.setAttribute('role', 'region');
    live.dock.setAttribute('aria-label', 'Notifications');
    live.dock.setAttribute('aria-live', 'polite');
    live.dock.innerHTML =
      '<div class="se-tst-tray"><div class="se-tst-stage"></div>' +
      '<div class="se-tst-strip"><span class="se-tst-pos"></span></div></div>';
    live.tray = live.dock.firstElementChild;
    stage = live.tray.querySelector('.se-tst-stage');
    strip = live.tray.querySelector('.se-tst-strip');
    pos = strip.querySelector('.se-tst-pos');
    live.dock.addEventListener('click', ns.onDockClick);
    live.dock.addEventListener('animationend', ns.onDockAnimationEnd);
    live.dock.addEventListener('pointerover', ns.onTrayHover);
    live.dock.addEventListener('pointerout', ns.onTrayHover);
    document.body.appendChild(live.dock);
  }

  /* ---------- Placement readiness ---------- */

  // Ready to be the stage: at the bottom centre, with a toast of its own still up.
  // In game only a placed window can be the stage: an unplaced one is never on screen (Steam
  // holds it back while the stage keeps its toasts up), and the stage plays its toasts anyway.
  const ready = () =>
    live.prepared && !!document.body && (!IN_GAME || live.mover >= 0) && [...ns.byKey.values()].some(e => !e.released);

  async function prepare() {
    live.preparing = true;
    try {
      await ns.place();
    } finally {
      live.preparing = false;
      // Even if the window couldn't be moved it can play the stage where Steam put it.
      live.prepared = true;
      ns.notify();
    }
  }

  /* ---------- Drawing the stage (only in the stage window) ---------- */

  const views = new Map(); // entry id → { layer, thumb, rev, armed, leaving }
  const timers = new Set(); // pending later() calls, cleared by teardown

  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  // (Re)draws an entry's content in place; its art and countdown are left running.
  function paint(e, v) {
    v.rev = e.rev;
    SE.attr(v.thumb, 'data-se-tier', SE.toastCard.paint(e, v.layer));
  }

  function makeView(e, instant) {
    const { layer, urls } = SE.toastCard.layer(e);
    // Taking over mid-toast: already showing, no fade-in (cleared once drawn).
    if (instant) {
      layer.dataset.instant = '';
      later(() => delete layer.dataset.instant, 80);
    }

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'se-tst-thumb';
    thumb.dataset.id = String(e.id);
    thumb.dataset.accent = e.accent;
    thumb.setAttribute('aria-label', `${e.label}: ${e.title}`);
    const thumbURLs = [...urls, ...(e.icon && e.artKind !== 'ambient' ? [e.icon] : [])];
    if (thumbURLs.length) thumb.appendChild(SE.art.img(thumbURLs, 'se-tst-thumb-img'));

    SE.attr(thumb, 'data-se-tier', layer.getAttribute('data-se-tier'));
    const v = { layer, thumb, rev: e.rev, armed: 0, leaving: false };
    views.set(e.id, v);
    stage.appendChild(layer);
    return v;
  }

  // Finished: out of the strip now, off the stage after its crossfade.
  function leave(id, v) {
    if (v.leaving) return;
    v.leaving = true;
    v.thumb.remove();
    unmark(v.layer, 'data-on');
    later(() => {
      v.layer.remove();
      SE.toastCard.stopVideos(v.layer);
      if (views.get(id) === v) views.delete(id);
    }, PRUNE_MS);
  }

  /*
   * Starts the active toast's countdown: its slot as the duration, minus the time it has
   * already played (a stage that took over mid-toast picks up where the last one was).
   */
  function arm(v, h) {
    // The pointer is already on the tray (it just clicked): CSS holds the countdown, so does the hub.
    if (h.slot && !h.pausedAt && SE.settings?.get('toast-hover') !== 'off' && run(() => live.tray.matches(':hover'))) {
      h.pausedAt = Date.now();
    }
    const left = -ns.elapsed(h);
    for (const el of [v.layer, v.thumb]) {
      el.style.setProperty('--se-tst-d', `${h.slot || 1}ms`);
      el.style.setProperty('--se-tst-delay', `${left}ms`);
      SE.attr(el, 'data-sticky', h.slot ? null : '');
      unmark(el, 'data-on');
    }
    void v.layer.offsetWidth; // restart the animations
    mark(v.layer, 'data-on');
    mark(v.thumb, 'data-on');
    v.armed = h.playRev;
  }

  function render(instant = false) {
    const h = ns.hub();
    const list = h.entries;
    const waiting = list.filter(e => !e.done);
    if (!waiting.length && !h.closing && !h.open) return teardown();
    if (!live.dock) build();

    for (const e of list) {
      let v = views.get(e.id);
      if (!v && !e.done) {
        v = makeView(e, instant);
        // In play order: before the next waiting entry's thumb.
        const after = waiting.slice(waiting.indexOf(e) + 1).map(x => views.get(x.id)).find(x => x && !x.leaving);
        strip.insertBefore(v.thumb, after?.thumb || pos);
      }
      if (!v || v.leaving) continue;
      if (e.done) leave(e.id, v);
      else if (v.rev !== e.rev) paint(e, v);
    }
    for (const [id, v] of views) if (!list.some(e => e.id === id)) leave(id, v);

    const cur = ns.activeEntry();
    for (const [id, v] of views) {
      if (v.leaving) continue;
      if (cur && id === cur.id) {
        if (v.armed !== h.playRev) arm(v, h);
      } else if (v.armed) {
        v.armed = 0;
        unmark(v.layer, 'data-on');
        unmark(v.thumb, 'data-on');
      }
    }

    // The tray: rises in when it opens, or simply appears when this window takes over.
    const wasOut = live.tray.hasAttribute('data-out');
    SE.attr(live.tray, 'data-out', h.closing || null);
    if (!live.tray.hasAttribute('data-show') || (wasOut && !h.closing)) {
      SE.attr(live.tray, 'data-instant', instant && h.open ? '' : null);
      unmark(live.tray, 'data-show');
      void live.tray.offsetWidth;
      mark(live.tray, 'data-show');
      h.open = true;
      ns.fit();
    }

    ns.watchPlace();
    const curView = cur && views.get(cur.id);
    SE.attr(live.tray, 'data-se-tier', curView?.layer.getAttribute('data-se-tier') || null);
    SE.attr(live.tray, 'data-accent', cur?.accent || null);
    const i = waiting.indexOf(cur);
    SE.attr(live.tray, 'data-queue', waiting.length > 1 && !h.closing ? '' : null);
    const where = i >= 0 && waiting.length > 1 ? `${i + 1} of ${waiting.length}` : '';
    if (pos.textContent !== where) pos.textContent = where;
    return undefined;
  }

  // This window stops drawing the stage (another took over, or the queue is empty).
  function teardown() {
    live.placeGuard?.disconnect();
    live.placeGuard = null;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (!live.dock) return;
    live.dock.remove();
    for (const v of views.values()) SE.toastCard.stopVideos(v.layer);
    live.dock = live.tray = stage = strip = pos = null;
    views.clear();
  }

  Object.assign(ns, { prepare, ready, render, teardown });
})(window.__se);
