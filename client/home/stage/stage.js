/*
 * The hero stage (games, art, logo, counters, Play / Install, the strip and its cycle) and the
 * layout pass that places the stage and the tray on Home, measures them and tears them down.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedHomeStageParts;
  if (!ns) return;
  const {
    artImg, boxOf, clearMarks, client, closePick, compact, cycleSeconds, dropAllOwn, dropOwn,
    enabled, fitColl, fitFav, hours, ICON_INSTALL, ICON_PLAY, isFavorites, kindOf, mark, narrow,
    NEWS, own, paintColl, paintFav, reducedMotion, schedule, scrollerOf, setHTML, SHELF,
    SHELF_HEADER, shelfId, trayShare, when,
  } = ns;
  const { live } = ns;

  const { isInstalled, navigate, run } = SE;

  live.scope = null;
  live.scroller = null;
  live.stage = null;
  let tray = null;
  // The Favorites column: the theme's own grid cell, so Steam's row (its size, position or
  // render state) can never leave the column blank. Steam's shelf stays mounted, out of sight.
  let favHost = null;
  live.apps = [];
  live.selected = 0;
  let appsSig = '';
  let hovering = false;
  let cycleTimer = 0;
  let cycleDue = false;
  const marked = new Set();
  const logos = new Map();

  function buildStage() {
    const el = document.createElement('div');
    el.className = 'se-hs-stage';
    el.innerHTML =
      '<div class="se-hs-art" aria-hidden="true"><div class="se-hs-grade"></div></div>' +
      '<div class="se-hs-body">' +
      '<button type="button" class="se-hs-title" data-act="page" title="Open game page"><span class="se-hs-name"></span></button>' +
      '<div class="se-hs-side">' +
      '<div class="se-hs-top"><span class="se-hs-by" hidden></span><span class="se-hs-chips"></span></div>' +
      '<p class="se-hs-desc" hidden></p>' +
      '<div class="se-hs-row">' +
      '<div class="se-hs-actions"><button type="button" class="se-hs-play" data-act="play"></button></div>' +
      '<div class="se-hs-meta"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="se-hs-strip" role="group" aria-label="Recent games"></div>';
    el.addEventListener('click', onClick);
    el.addEventListener('pointerenter', () => {
      hovering = true;
    });
    el.addEventListener('pointerleave', () => {
      hovering = false;
    });
    return el;
  }

  function onClick(e) {
    const thumb = e.target.closest('.se-hs-thumb');
    if (thumb) {
      select(Number(thumb.dataset.i));
      restartCycle();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const app = live.apps[live.selected];
    if (!act || !app) return;
    const sc = client();
    if (act === 'play') {
      if (isInstalled(app)) run(() => sc.Apps.RunGame(String(app.appid), '', -1, 100));
      else run(() => sc.URL.ExecuteSteamURL(`steam://install/${app.appid}`));
    } else if (act === 'page') {
      navigate(`/library/app/${app.appid}`);
    }
  }

  function buildGames() {
    const art = live.stage.querySelector('.se-hs-art');
    const grade = art.querySelector('.se-hs-grade');
    art.querySelectorAll('.se-hs-layer').forEach((l) => l.remove());
    const strip = live.stage.querySelector('.se-hs-strip');
    strip.textContent = '';

    live.apps.forEach((app, i) => {
      const layer = document.createElement('div');
      layer.className = 'se-hs-layer';
      art.insertBefore(layer, grade); // its art loads when it's next up (ensureLayerArt)

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'se-hs-thumb';
      b.dataset.i = String(i);
      b.setAttribute('aria-label', app.display_name || '');

      const pic = document.createElement('span');
      pic.className = 'se-hs-pic';
      pic.appendChild(artImg(ns.heroURLs(app), 'se-hs-thumbimg'));

      const label = document.createElement('span');
      label.className = 'se-hs-thumblabel';
      const name = document.createElement('span');
      name.className = 'se-hs-thumbname';
      name.textContent = app.display_name || '';
      const date = document.createElement('span');
      date.className = 'se-hs-thumbdate';
      date.textContent = when(app.rt_last_time_played);

      label.append(name, date);
      pic.appendChild(label);
      b.appendChild(pic);
      strip.appendChild(b);
    });
    strip.hidden = live.apps.length < 2;
  }

  function logoFor(app) {
    let entry = logos.get(app.appid);
    if (!entry) {
      entry = { ok: true };
      entry.img = artImg(ns.logoURLs(app), 'se-hs-logo', () => {
        entry.ok = false;
        if (live.apps[live.selected]?.appid === app.appid) paintGame();
      });
      logos.set(app.appid, entry);
    }
    return entry;
  }

  function paintGame() {
    const app = live.apps[live.selected];
    if (!live.stage || !app) return;
    const title = live.stage.querySelector('.se-hs-title');
    const logo = logoFor(app);
    title.querySelectorAll('.se-hs-logo').forEach((img) => {
      if (img !== logo.img) img.remove();
    });
    if (logo.ok && logo.img.parentElement !== title) title.prepend(logo.img);
    SE.mark(title, 'data-logo', logo.ok ? 'yes' : 'no');
    title.querySelector('.se-hs-name').textContent = app.display_name || '';

    const ach = ns.achievementsOf(app.appid);
    const stat = (value, label, extra = '') => `<span class="se-hs-stat"${extra}><b>${value}</b><em>${label}</em></span>`;
    const info = ns.infoOf(app.appid);
    const now = ns.playersOf(app.appid);
    const recent = app.minutes_playtime_last_two_weeks || 0;
    const parts = [
      stat(
        `${SE.esc(hours(app.minutes_playtime_forever))}<small> h</small>`,
        recent ? `played · ${SE.esc(hours(recent))} h in 2 weeks` : 'played'
      ),
    ];
    if (ach) {
      const pct = Math.round((ach.got / ach.total) * 100);
      parts.push(
        `<span class="se-hs-stat" data-ach${pct === 100 ? ' data-perfect' : ''}><b>${ach.got}<small> / ${ach.total}</small></b>` +
          `<em>achievements<span class="se-hs-achbar" aria-hidden="true"><span style="width:${pct}%"></span></span></em></span>`
      );
    }
    const meta = live.stage.querySelector('.se-hs-meta');
    setHTML(meta, parts.join(''));

    const chips = [];
    if (info?.pct != null) {
      const tone = info.pct >= 70 ? 'good' : info.pct >= 40 ? 'mixed' : 'bad';
      chips.push(`<span class="se-hs-chip" data-reviews="${tone}">${info.pct}% · ${SE.esc(info.score || 'positive')}</span>`);
    }
    if (now != null && now > 0) {
      chips.push(`<span class="se-hs-chip" data-live><i></i>${SE.esc(compact(now))} playing now</span>`);
    }
    setHTML(live.stage.querySelector('.se-hs-chips'), chips.join(''));

    const desc = live.stage.querySelector('.se-hs-desc');
    const text = info?.text || '';
    if (desc.textContent !== text) desc.textContent = text;
    desc.hidden = !text;

    const by = live.stage.querySelector('.se-hs-by');
    const byText = [info?.dev, info?.year || ''].filter(Boolean).join(' · ');
    if (by.textContent !== byText) by.textContent = byText;
    by.hidden = !byText;

    const play = live.stage.querySelector('.se-hs-play');
    const installed = isInstalled(app);
    setHTML(play, installed ? `${ICON_PLAY}<span>Play</span>` : `${ICON_INSTALL}<span>Install</span>`);
    SE.mark(play, 'data-kind', installed ? 'play' : 'install');
  }

  /*
   * Only the art on show and the next in the cycle are loaded: eight full-size heroes decoded
   * at once cost a lot of memory for layers nobody sees.
   */
  function ensureLayerArt(layer, app) {
    if (layer && app && !layer.firstChild) layer.appendChild(artImg(ns.heroURLs(app), 'se-hs-hero'));
  }

  function select(i) {
    if (!live.stage || !live.apps.length) return;
    live.selected = Math.max(0, Math.min(live.apps.length - 1, i || 0));
    const layers = live.stage.querySelectorAll('.se-hs-layer');
    const next = (live.selected + 1) % live.apps.length;
    ensureLayerArt(layers[live.selected], live.apps[live.selected]);
    ensureLayerArt(layers[next], live.apps[next]);
    layers.forEach((l, n) => l.toggleAttribute('data-on', n === live.selected));
    live.stage.querySelectorAll('.se-hs-thumb').forEach((t, n) => {
      const on = n === live.selected;
      t.toggleAttribute('data-on', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.querySelector('.se-hs-prog')?.remove();
      if (on && cycleSeconds() > 0 && !reducedMotion.matches && live.apps.length > 1) {
        const bar = document.createElement('span');
        bar.className = 'se-hs-prog';
        t.querySelector('.se-hs-pic').appendChild(bar);
      }
    });
    paintGame();
  }

  // Cards the strip shows (set by home-stage.css container queries), capped to the games.
  function stripCount() {
    const strip = live.stage?.querySelector('.se-hs-strip');
    const cols = strip ? parseInt(getComputedStyle(strip).getPropertyValue('--se-hs-cols'), 10) : NaN;
    return Math.min(live.apps.length, cols > 0 ? cols : live.apps.length);
  }

  // Keep the shown game on a visible card after the strip narrows.
  function fitStrip() {
    if (live.apps.length && live.selected >= stripCount()) select(0);
  }

  function restartCycle() {
    clearInterval(cycleTimer);
    cycleTimer = 0;
    SE.attr(live.stage, 'data-se-hs-idle', null);
    const seconds = cycleSeconds();
    if (!seconds || reducedMotion.matches) return;
    live.stage?.style.setProperty('--se-hs-cycle', `${seconds}s`);
    cycleTimer = setInterval(() => {
      if (!live.stage?.isConnected) return;
      // Out of sight (another page over Home, or the window hidden): the art's push-in pauses too.
      const idle = document.visibilityState !== 'visible' || !SE.visible(live.stage);
      SE.attr(live.stage, 'data-se-hs-idle', idle ? '' : null);
      const shown = stripCount();
      if (idle || hovering || shown < 2) return;
      select((live.selected + 1) % shown);
    }, seconds * 1000);
  }

  let appliedVh = 0;
  let pendingVh = 0;
  let pendingAt = 0;
  let settleTimer = 0;
  const SETTLE_MS = 180;
  const HEADROOM = 8;
  let locked = [];

  function lockScroll() {
    const want = [];
    for (let p = live.scope.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.hasAttribute('data-se-hs-scroll-lock') || /(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY)) {
        want.push(p);
      }
    }
    want.push(document.body, document.documentElement);
    for (const el of locked) {
      if (!want.includes(el)) SE.unmark(el, 'data-se-hs-scroll-lock');
    }
    for (const el of want) {
      if (!el.hasAttribute('data-se-hs-scroll-lock')) {
        if (el.scrollTop) el.scrollTop = 0;
        SE.mark(el, 'data-se-hs-scroll-lock');
      }
    }
    locked = want;
  }

  function unlockScroller() {
    for (const el of locked) SE.unmark(el, 'data-se-hs-scroll-lock');
    locked = [];
  }

  function teardown(leaving) {
    closePick();
    unlockScroller();
    clearMarks();
    dropAllOwn(leaving);
    document.querySelectorAll('[data-se-hs-carousel]').forEach((el) => el.removeAttribute('data-se-hs-carousel'));
    ns.resetNews(leaving);
    if (!leaving) appsSig = '';
    live.stage?.remove();
    tray?.remove();
    favHost?.remove();
    clearInterval(cycleTimer);
    cycleTimer = 0;
    cycleDue = true;
    hovering = false;
    live.scope = null;
    live.scroller = null;
    appliedVh = 0;
    pendingVh = 0;
    clearTimeout(settleTimer);
  }

  function setOn(on) {
    if (on) SE.mark(document.documentElement, 'data-se-hs-on');
    else SE.unmark(document.documentElement, 'data-se-hs-on');
  }

  const usable = () =>
    document.visibilityState !== 'hidden' &&
    innerWidth >= 480 &&
    innerHeight >= 360 &&
    (!live.scroller || live.scroller === document.scrollingElement || live.scroller.clientHeight >= 300);

  let isNarrow = false;

  function collectHomeRows(lib) {
    const shelves = [...lib.querySelectorAll(SHELF)];
    let list = lib;
    if (shelves.length) {
      list = shelves[0].parentElement;
      while (list && list !== lib && !shelves.every((s) => list.contains(s))) {
        list = list.parentElement;
      }
      if (!list || !lib.contains(list)) list = lib;
    }
    const flat = new Set();
    for (let el = list; el && el !== live.scope; el = el.parentElement) flat.add(el);
    const news = live.scope.querySelector(NEWS);
    if (news) {
      for (let el = news.parentElement; el && el !== live.scope; el = el.parentElement) flat.add(el);
    }

    const rows = [];
    for (const parent of [live.scope, ...flat]) {
      for (const child of parent.children) {
        if (flat.has(child) || child === live.stage || child === tray) continue;
        rows.push(child);
      }
    }
    return { flat, rows };
  }

  // Reads only: the room under the header, and the tallest tray panel's least height.
  function measureStage(trayRows, kinds) {
    const view = live.scroller?.clientHeight || innerHeight;
    const top =
      live.scope.getBoundingClientRect().top -
      (live.scroller?.getBoundingClientRect?.().top || 0) +
      (live.scroller?.scrollTop || 0);
    const ownHeight = (r) => {
      const cs = getComputedStyle(r);
      const panel = r.querySelector(':scope > .se-hs-own');
      const parts = panel ? [...panel.children] : [...r.children];
      const least = (c) =>
        c.classList.contains('se-hs-clist-box')
          ? 150
          : c.classList.contains('se-hs-grid')
            ? Math.round(2 * ((c.clientWidth - 20) / 3 / (460 / 215)) + 10)
            : c.offsetHeight;
      const inner = parts.reduce((h, c) => h + least(c), 0) + (panel ? 8 : 14);
      return inner + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    };
    return {
      measured: Math.max(420, Math.round(view - Math.max(0, top)) - HEADROOM),
      content: trayRows.length ? Math.max(...trayRows.filter((r) => kinds.get(r) !== 'news').map(ownHeight), 0) : 0,
    };
  }

  // Writes only, from measureStage()'s numbers.
  function applyStageDimensions({ measured, content }, trayRows) {
    const now = performance.now();

    if (!appliedVh || measured === appliedVh) {
      appliedVh = measured;
      pendingVh = 0;
    } else if (measured !== pendingVh) {
      pendingVh = measured;
      pendingAt = now;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, SETTLE_MS + 20);
    } else if (now - pendingAt >= SETTLE_MS) {
      appliedVh = measured;
      pendingVh = 0;
    }

    const vh = appliedVh;
    const want = Math.round((vh * trayShare()) / 100);
    const trayBox = trayRows.length && !isNarrow ? Math.min(Math.max(want, content, 220), vh - 340 - 22) : 0;
    const px = trayBox ? `${trayBox}px` : '';
    if (tray.style.height !== px) tray.style.height = px;
    const trayH = trayBox ? trayBox + 22 : 0;

    SE.cssVar(live.stage, '--se-hs-vh', `${vh}px`);
    SE.cssVar(live.stage, '--se-hs-h', `${Math.max(340, isNarrow ? Math.round(vh * 0.7) : vh - trayH)}px`);

    const lock = !isNarrow && trayRows.length > 0 && vh - trayH >= 340;
    if (lock) {
      mark(live.scope, 'data-se-hs-lock');
      lockScroll();
    } else {
      SE.unmark(live.scope, 'data-se-hs-lock');
      unlockScroller();
    }
  }

  function layout() {
    if (live.scope && !usable()) return;
    // Back on Home: resume the art's push-in now rather than at the next cycle tick.
    if (live.stage?.hasAttribute('data-se-hs-idle') && document.visibilityState === 'visible') {
      SE.attr(live.stage, 'data-se-hs-idle', null);
    }
    ns.resetCardEvents();
    const lib = document.querySelector('.LibraryHome');
    const home = lib?.parentElement;
    if (!home) {
      if (live.scope) teardown(true);
      return;
    }
    if (!enabled()) {
      if (live.scope) teardown();
      setOn(false);
      return;
    }
    live.apps = ns.recentApps();
    if (!live.apps.length) {
      if (live.scope) teardown();
      setOn(false);
      return;
    }
    if (live.scope !== home) {
      if (live.scope) teardown(true);
      live.scope = home;
      live.scroller = scrollerOf(home);
    }
    if (!live.stage) live.stage = buildStage();
    if (!tray) {
      tray = document.createElement('div');
      tray.className = 'se-hs-tray';
      tray.setAttribute('aria-hidden', 'true');
    }
    if (live.stage.parentElement !== live.scope) live.scope.prepend(live.stage);
    if (tray.parentElement !== live.scope) live.scope.appendChild(tray);

    if (!favHost) {
      favHost = document.createElement('div');
      favHost.className = 'se-hs-favhost';
    }

    const { flat, rows } = collectHomeRows(lib);
    clearMarks(new Set([live.scope, favHost, ...flat, ...rows]));
    mark(live.scope, 'data-se-hs');
    for (const el of flat) mark(el, 'data-se-hs-flat');

    const kinds = new Map(rows.map((r) => [r, kindOf(r)]));
    const firstOf = (k) => rows.find((r) => kinds.get(r) === k);
    if (!firstOf('fav')) {
      const s = firstOf('shelf');
      if (s) kinds.set(s, 'fav');
    }

    // Favorites first: whether it draws decides how many columns the tray has.
    const favSource = firstOf('fav') || null;
    const favShelf = favSource && (favSource.matches(SHELF) ? favSource : favSource.querySelector(SHELF));
    const favId = (favShelf && shelfId(favShelf)) || (favShelf && isFavorites(favShelf) ? 'favorite' : null);
    const favTitle =
      favId === 'favorite'
        ? 'Favorites'
        : (favShelf?.querySelector(SHELF_HEADER)?.textContent || '').replace(/[·•].*$/, '').trim();
    const favEntry = paintFav(favHost, favId, favTitle);
    if (favEntry) {
      if (favHost.parentElement !== live.scope) live.scope.appendChild(favHost);
      kinds.set(favHost, 'fav');
    } else {
      favHost.remove();
    }

    const trayRows = [firstOf('news'), favEntry ? favHost : null, firstOf('coll')].filter(Boolean);
    for (const r of [...rows, ...(favEntry ? [favHost] : [])]) {
      let k = kinds.get(r);
      if (r === favSource && favEntry) k = 'favsrc';
      else if ((k === 'news' || k === 'fav' || k === 'coll') && !trayRows.includes(r)) {
        k = k === 'news' ? 'other' : 'shelf';
      }
      mark(r, 'data-se-hs-sec', k);
      const col = trayRows.indexOf(r);
      if (col >= 0) mark(r, 'data-se-hs-col', String(col + 1));
      else SE.unmark(r, 'data-se-hs-col');
      if (col >= 0 && col === trayRows.length - 1) mark(r, 'data-se-hs-last');
      else SE.unmark(r, 'data-se-hs-last');
    }

    mark(live.scope, 'data-se-hs-n', String(trayRows.length));
    isNarrow = narrow.matches;
    if (isNarrow) mark(live.scope, 'data-se-hs-narrow');
    else SE.unmark(live.scope, 'data-se-hs-narrow');
    tray.hidden = !trayRows.length;

    ns.paintNews(trayRows.find((r) => kinds.get(r) === 'news') || null);
    for (const row of [...own.keys()]) {
      if (!trayRows.includes(row)) dropOwn(row);
    }

    const collRow = trayRows.find((r) => kinds.get(r) === 'coll');
    const collEntry = collRow ? paintColl(collRow) : null;

    const sig = live.apps.map((a) => a.appid).join(',');
    if (sig !== appsSig) {
      const keepId = live.apps[live.selected]?.appid;
      appsSig = sig;
      buildGames();
      const again = live.apps.findIndex((a) => a.appid === keepId);
      select(again >= 0 && live.selected !== 0 ? again : 0);
      restartCycle();
    } else {
      paintGame();
    }

    if (cycleDue) {
      cycleDue = false;
      if (!cycleTimer) restartCycle();
    }
    setOn(true);

    // Every measurement of the pass at once (one layout), then the writes that depend on them.
    const favBox = favEntry && boxOf(favEntry.el.querySelector('.se-hs-grid'));
    const collBox = collEntry && boxOf(collEntry.el.querySelector('.se-hs-cgrid'));
    const headsMore = live.newsHeads?.isConnected ? live.newsHeads.scrollHeight > live.newsHeads.clientHeight + 2 : null;
    const dims = measureStage(trayRows, kinds);

    if (favEntry) fitFav(favEntry, favBox);
    if (collEntry) fitColl(collEntry, collBox);
    if (headsMore !== null) SE.mark(live.newsHeads, 'data-more', headsMore ? 'yes' : 'no');
    applyStageDimensions(dims, trayRows);
    fitStrip();
  }

  /** destroy(): let go of the stage and tray elements. */
  function forgetStage() {
    live.stage = null;
    tray = null;
  }

  Object.assign(ns, {
    forgetStage, layout, marked, paintGame, restartCycle, select, setOn, teardown,
  });
});
