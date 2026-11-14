/*
 * Toasts: the view (dock, tray, stage, strip) and drawing a toast on it.
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { esc, mark, rarity, run, unmark } = SE;
  const { IN_GAME, PRUNE_MS, ZOOM, icon } = ns;
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

  // An <img> working through its copies; drawn as nothing until one loads (core/images.css).
  function artImg(urls, cls, onFail) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    if (!urls.length) return img;
    img.setAttribute('data-se-art-wait', '');
    let i = 0;
    img.onload = () => img.removeAttribute('data-se-art-wait');
    img.onerror = () => {
      if (++i < urls.length) img.src = urls[i];
      else {
        img.onerror = null;
        onFail?.(img);
      }
    };
    img.src = urls[0];
    return img;
  }

  /*
   * A friend's mini-profile background (the one Steam shows on their hover card), from the
   * community's mini-profile JSON. Fetched once per friend and shared across toast windows.
   */
  function miniProfile(accountId) {
    const host = run(() => window.opener) || window;
    const cache = run(() => (host.__seMiniProfiles ||= new Map())) || new Map();
    if (!cache.has(accountId)) {
      // Shared by every toast window for the session: keep the 50 most recent friends.
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(
        accountId,
        fetch(`https://steamcommunity.com/miniprofile/${accountId}/json`, { credentials: 'include' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
    return cache.get(accountId);
  }

  async function profileArt(accountId, art) {
    const bg = (await miniProfile(accountId))?.profile_background;
    if (!bg || !art.isConnected) return;
    const video = bg['video/webm'] || bg['video/mp4'];
    const still = bg.image || bg['image/jpeg'] || bg['image/png'];
    let el;
    if (video) {
      el = document.createElement('video');
      Object.assign(el, { src: video, muted: true, loop: true, autoplay: true, playsInline: true });
      el.setAttribute('aria-hidden', 'true');
    } else if (typeof still === 'string') {
      el = artImg([still], 'se-tst-hero');
    } else {
      return;
    }
    el.className = 'se-tst-hero';
    const show = () => {
      art.replaceChildren(el);
      delete art.dataset.ambient;
    };
    if (video) el.addEventListener('loadeddata', show, { once: true });
    else el.addEventListener('load', show, { once: true });
    if (video) run(() => el.play());
  }

  /*
   * The ground for toasts with no art: the splash's background (assets/splash.png, drawn by
   * dev/showcase/scenes/splash.html), the wireframe of the themed Library — rail, game list,
   * Home, Friends dock — redrawn to the stage's shape. It comes alive in the toast's color: the
   * selection moves down the list, the bottom cards light in turn, friends' status rings
   * breathe, the hero panel glows, and a light passes over it all.
   */
  const AMBIENT_SVG = (() => {
    const box = (x, y, s, r, cls = 'se-tst-wf-ln', extra = '') =>
      `<rect class="${cls}" x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}"${extra}/>`;
    const line = (x, y, w, h = 2) => `<rect class="se-tst-wf-line" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
    // A section header: chevron (open or closed), title and count
    const head = (x, y, w, closed) =>
      `<path class="se-tst-wf-ln" d="${closed ? `M${x} ${y - 2.5}l2.5 2.5-2.5 2.5` : `M${x - 1} ${y - 1}l2.5 2.5 2.5-2.5`}"/>` +
      line(x + 8, y - 0.5, w, 1.5) + line(x + 12 + w, y - 0.5, 5, 1.5);

    // Rail: Steam button, four pages (Library current), divider, four more
    const railY = [30, 42, 70, 82, 98, 110, 122, 134];
    const rail =
      '<circle class="se-tst-wf-ln" cx="17" cy="17" r="5"/><circle class="se-tst-wf-ln" cx="17" cy="17" r="2"/>' +
      railY.map(y => box(13, y, 8, 2.5)).join('') +
      '<rect class="se-tst-wf-tint" x="10" y="53" width="14" height="14" rx="4"/>' +
      '<rect class="se-tst-wf-bar" x="4.5" y="56" width="1.5" height="8" rx=".75"/>' +
      box(13, 56, 8, 2.5, 'se-tst-wf-ln se-tst-wf-on') +
      '<path class="se-tst-wf-ln" d="M12 92h10"/>';

    // Game list: a section of rows (icon and name), the selection walks down it
    const rows = [62, 44, 70, 38, 54, 48, 60]
      .map((w, i) => box(40, 26 + i * 11, 6, 1.5) + line(51, 28 + i * 11, w))
      .join('');
    const list =
      head(40, 15, 40) + rows +
      '<g class="se-tst-wf-sel"><rect class="se-tst-wf-tint" x="36" y="24" width="92" height="10" rx="3"/>' +
      '<rect class="se-tst-wf-bar" x="31" y="26" width="1.5" height="6" rx=".75"/></g>' +
      head(40, 106, 52, true) + head(40, 116, 46);

    // Friends dock: you, Playing now with a game and its players, then Online
    const av = (x, y, s, st, i) =>
      box(x, y, s, s * .23, 'se-tst-wf-fr', ` data-st="${st}"${i == null ? '' : ` style="--i:${i}"`}`);
    const game = (y, w) =>
      box(324, y, 10, 2.5) + `<circle class="se-tst-wf-fr" data-st="game" cx="334" cy="${y + 10}" r="2"/>` +
      line(339, y + 2, w) + line(339, y + 6.5, w * .6, 1.5);
    const friend = (x, y, st, w, i) => av(x, y, 8, st, i) + line(x + 12, y + 1.5, w) + line(x + 12, y + 5.5, w * .7, 1.5);
    const dock =
      box(324, 11, 11, 2.5, 'se-tst-wf-ln se-tst-wf-on') + line(339, 13.5, 26) + line(339, 18, 16, 1.5) +
      [372, 381, 390].map(x => box(x, 13, 6, 1.5)).join('') +
      '<path class="se-tst-wf-ln" d="M324 28h74"/>' + line(324, 33, 22, 1.5) +
      game(39, 32) + friend(330, 53, 'game', 22, 0) + friend(330, 64, 'game', 18, 1) +
      head(325, 80, 18) + friend(324, 87, 'on', 28, 2) + friend(324, 98, 'on', 22, 3) + friend(324, 109, 'off', 26, 4);

    return (
      '<svg class="se-tst-wf" viewBox="0 0 408 124" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">' +
      '<rect class="se-tst-wf-ln" x="4" y="6" width="400" height="150" rx="10"/>' +
      '<path class="se-tst-wf-ln" d="M30 6v150M134 6v150M318 6v150"/>' +
      rail + list +
      '<rect class="se-tst-wf-ln" x="142" y="12" width="168" height="78" rx="6"/>' +
      // A soft-edged gradient rather than a blur filter, which re-rasterised every frame.
      '<radialGradient id="se-tst-glow-ID"><stop class="se-tst-wf-glow-stop" offset="0" stop-opacity=".4"/>' +
      '<stop class="se-tst-wf-glow-stop" offset=".45" stop-opacity=".28"/><stop class="se-tst-wf-glow-stop" offset="1" stop-opacity="0"/></radialGradient>' +
      '<ellipse class="se-tst-wf-glow" cx="226" cy="50" rx="66" ry="44" fill="url(#se-tst-glow-ID)"/>' +
      [0, 1, 2].map(i => `<rect class="se-tst-wf-ln se-tst-wf-card" style="--i:${i}" x="${148 + i * 57}" y="96" width="51" height="40" rx="5"/>`).join('') +
      dock +
      '</svg><i class="se-tst-wf-light"></i>'
    );
  })();
  // Each ground gets its own gradient id: url(#…) resolves to the document's first match,
  // which would paint every layer in the first layer's colour.
  let ambientSeq = 0;
  const ambientHTML = () => AMBIENT_SVG.replaceAll('se-tst-glow-ID', `se-tst-glow-${++ambientSeq}`);

  const artURLs = (m) => {
    const hero = m.appid && m.artKind !== 'ambient' ? SE.heroURLs(m.appid, SE.appStore()) : [];
    if (m.artKind === 'image' && m.shot) return [m.shot, ...hero];
    if (m.artKind === 'app' || m.artKind === 'image') return hero;
    return [];
  };

  function sparkles(rank) {
    return `<span class="se-tst-fx" aria-hidden="true">${'<i class="se-tst-spark"></i>'.repeat(rank)}</span>`;
  }

  // Presence as an outline round the avatar, as in the friends list: blue online, green in game.
  const PRESENCE = Object.freeze({ online: 'online', playing: 'ingame' });

  function tileHTML(m, tier) {
    const img = m.icon ? `<img class="se-tst-tile-img" src="${esc(m.icon)}" alt="" draggable="false">` : icon(m.glyph);
    if (m.kind !== 'ach') return img;
    if (m.mastered) return icon('cup') + sparkles(5);
    return tier ? img + sparkles(tier.rank) + `<b class="se-tst-initial">${tier.name[0]}</b>` : img;
  }

  function rightHTML(m, tier) {
    if (m.kind === 'ach' && m.mastered) {
      return `<div class="se-tst-stat"><b>${m.mastered.total}<small> / ${m.mastered.total}</small></b><em class="se-tst-pill">100%</em></div>`;
    }
    if (m.kind === 'ach' && tier) {
      return `<div class="se-tst-stat"><b>${esc(rarity.fmtPct(m.pct))}%</b><em class="se-tst-pill">${tier.name}</em></div>`;
    }
    return m.buttons
      .map((b, i) => {
        const cls = i === 0 ? (m.play ? 'se-tst-btn-play' : 'se-tst-btn-acc') : 'se-tst-btn-glass';
        return `<button type="button" class="se-tst-btn ${cls}" data-se-tst-act="${i}"${m.stale ? ' disabled' : ''}>${esc(b.label)}</button>`;
      })
      .join('');
  }

  function detailHTML(m) {
    if (m.kind === 'ach' && m.mastered) {
      const chips = m.mastered.counts
        .map(c => `<i data-se-tier="${c.t.id}">${c.t.name[0]} ${c.n}</i>`)
        .join('');
      return `<div class="se-tst-chips">${chips}</div>`;
    }
    return `<div class="se-tst-ds">${esc(m.text)}</div>`;
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

  // (Re)draws an entry's content in place; its art and countdown are left running.
  function paint(e, v) {
    v.rev = e.rev;
    const tier = e.kind === 'ach' && !e.mastered ? rarity.tierOf(e.pct) : null;
    const tierId = e.mastered ? 'legendary' : tier?.id;
    SE.attr(v.layer, 'data-se-tier', tierId || null);
    SE.attr(v.thumb, 'data-se-tier', tierId || null);
    const label = e.kind === 'ach' && e.mastered ? 'Game mastered' : e.label;
    v.layer.querySelector('.se-tst-ct').innerHTML =
      `<div class="se-tst-tile"${PRESENCE[e.kind] ? ` data-presence="${PRESENCE[e.kind]}"` : ''}>${tileHTML(e, tier)}</div>` +
      `<div class="se-tst-tx"><div class="se-tst-ey">${esc(label)}</div>` +
      `<div class="se-tst-tt">${esc(e.title)}</div>${detailHTML(e)}</div>` +
      `<div class="se-tst-rt">${rightHTML(e, tier)}</div>`;
  }

  function makeView(e, instant) {
    const layer = document.createElement('div');
    layer.className = 'se-tst-layer';
    // Taking over mid-toast: already showing, no fade-in (cleared once drawn).
    if (instant) {
      layer.dataset.instant = '';
      setTimeout(() => delete layer.dataset.instant, 80);
    }
    layer.dataset.id = String(e.id);
    layer.dataset.accent = e.accent;

    const art = document.createElement('div');
    art.className = 'se-tst-art';
    const urls = artURLs(e);
    // No art: the theme's own ground (toasts.css), lit in the toast's color.
    const ambient = () => {
      art.replaceChildren();
      art.dataset.ambient = '';
      art.insertAdjacentHTML('beforeend', ambientHTML());
    };
    // No game art: the avatar as a glow (friends, achievements), else the ambient ground.
    const fallback = () => {
      if (e.icon && e.artKind !== 'ambient') art.replaceChildren(artImg([e.icon], 'se-tst-glow'));
      else ambient();
    };
    if (urls.length) art.appendChild(artImg(urls, 'se-tst-hero', fallback));
    else fallback();
    // A friend: their mini-profile background replaces the glow once it arrives.
    if (e.accountId && !urls.length) profileArt(e.accountId, art);

    layer.append(art);
    layer.insertAdjacentHTML(
      'beforeend',
      '<div class="se-tst-grade"></div><div class="se-tst-ct"></div>' +
        '<button type="button" class="se-tst-sweep" aria-label="Dismiss">' +
        '<svg class="se-tst-ring" viewBox="0 0 30 30" aria-hidden="true">' +
        '<circle class="se-tst-trk" cx="15" cy="15" r="13.5"/><circle class="se-tst-arc" cx="15" cy="15" r="13.5"/></svg>' +
        `<span class="se-tst-lead"></span><span class="se-tst-kdot"></span>${icon('close', 'se-tst-x')}</button>`
    );

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'se-tst-thumb';
    thumb.dataset.id = String(e.id);
    thumb.dataset.accent = e.accent;
    thumb.setAttribute('aria-label', `${e.label}: ${e.title}`);
    const thumbURLs = [...urls, ...(e.icon && e.artKind !== 'ambient' ? [e.icon] : [])];
    if (thumbURLs.length) thumb.appendChild(artImg(thumbURLs, 'se-tst-thumb-img'));

    const v = { layer, thumb, rev: 0, armed: 0, leaving: false };
    views.set(e.id, v);
    stage.appendChild(layer);
    paint(e, v);
    return v;
  }

  // Finished: out of the strip now, off the stage after its crossfade.
  function leave(id, v) {
    if (v.leaving) return;
    v.leaving = true;
    v.thumb.remove();
    unmark(v.layer, 'data-on');
    setTimeout(() => {
      v.layer.remove();
      if (views.get(id) === v) views.delete(id);
    }, PRUNE_MS);
  }

  /*
   * Starts the active toast's countdown: its slot as the duration, minus the time it has
   * already played (a stage that took over mid-toast picks up where the last one was).
   */
  function arm(v, h) {
    // The pointer is already on the tray (it just clicked): CSS holds the countdown, so does the hub.
    if (h.slot && !h.pausedAt && run(() => live.tray.matches(':hover'))) h.pausedAt = Date.now();
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
    if (!live.dock) return;
    live.dock.remove();
    live.dock = live.tray = stage = strip = pos = null;
    views.clear();
  }

  Object.assign(ns, { prepare, ready, render, teardown });
})(window.__se);
