/*
 * The hero stage (games, art, logo, counters, Play / Install, the strip and its cycle) and the
 * layout pass that places the stage and the board (stage/board.js) on Home, measures them and
 * tears them down.
 * The stage's style is the cinematic corner: the game's block in the lower left over the art,
 * the strip of games in the lower right. What it shows follows stage-settings.js.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    applyStageLook, artImg, boxOf, clearMarks, client, closeMenu, closePick, compact,
    cycleSeconds, dropAllOwn, hours, ICON_INSTALL, ICON_PLAY, mark, NARROW_AT,
    reducedMotion, schedule, scrollerOf, setHTML, stageSettings, when,
  } = ns;
  const { live } = ns;

  const { isInstalled, navigate, run } = SE;

  live.scope = null;
  live.scroller = null;
  live.stage = null;
  live.apps = [];
  live.selected = 0;
  let appsSig = '';
  let hovering = false;
  let cycleTimer = 0;
  let cycleDue = false;
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
      '<div class="se-hs-strip" role="group" aria-label="Featured games"></div>' +
      '<button type="button" class="se-hs-gear" data-act="settings" aria-label="Home stage settings" aria-haspopup="dialog" aria-expanded="false"></button>';
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
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    if (act === 'settings') {
      ns.openStageMenu(actEl);
      return;
    }
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
    // The thumbnails share the strip's width (stage-hero.css): more games, smaller thumbnails
    SE.cssVar(strip, '--se-hs-n', String(Math.max(1, live.apps.length)));

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
      pic.appendChild(artImg(ns.wideURLs(app), 'se-hs-thumbimg')); // the wide capsule: art with the game's name

      b.appendChild(pic);
      strip.appendChild(b);
    });
    applyStageLook();
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
    const show = stageSettings().details;
    const title = live.stage.querySelector('.se-hs-title');
    const logo = logoFor(app);
    const useLogo = show.logo && logo.ok;
    title.querySelectorAll('.se-hs-logo').forEach((img) => {
      if (img !== logo.img || !useLogo) img.remove();
    });
    if (useLogo && logo.img.parentElement !== title) title.prepend(logo.img);
    SE.mark(title, 'data-logo', useLogo ? 'yes' : 'no');
    title.querySelector('.se-hs-name').textContent = app.display_name || '';

    const ach = ns.achievementsOf(app.appid);
    // A stat: its label over its value (the developer line's small caps), a bar under it if given
    const stat = (label, value, { bar = '', extra = '' } = {}) =>
      `<span class="se-hs-stat"${extra}><em>${label}</em><b>${value}</b>${bar}</span>`;
    const info = ns.infoOf(app.appid);
    const now = ns.playersOf(app.appid);
    const recent = app.minutes_playtime_last_two_weeks || 0;
    const parts = [];
    if (show.hours) {
      parts.push(stat(
        recent ? `Played · ${SE.esc(hours(recent))} h lately` : 'Played',
        `${SE.esc(hours(app.minutes_playtime_forever))}<small> h</small>`
      ));
    }
    if (show.last && app.rt_last_time_played) parts.push(stat('Last played', SE.esc(when(app.rt_last_time_played))));
    if (ach && show.ach) {
      const pct = Math.round((ach.got / ach.total) * 100);
      parts.push(stat('Achievements', `${ach.got}<small> / ${ach.total}</small>`, {
        bar: `<span class="se-hs-achbar" aria-hidden="true"><span style="width:${pct}%"></span></span>`,
        extra: pct === 100 ? ' data-perfect' : '',
      }));
    }
    const meta = live.stage.querySelector('.se-hs-meta');
    setHTML(meta, parts.join(''));

    const chips = [];
    if (info?.pct != null && show.reviews) {
      const tone = info.pct >= 70 ? 'good' : info.pct >= 40 ? 'mixed' : 'bad';
      chips.push(`<span class="se-hs-chip" data-reviews="${tone}"><b>${info.pct}%</b>${SE.esc(info.score || 'positive')}</span>`);
    }
    if (now != null && now > 0 && show.live) {
      chips.push(`<span class="se-hs-chip" data-live><i></i><b>${SE.esc(compact(now))}</b>playing now</span>`);
    }
    setHTML(live.stage.querySelector('.se-hs-chips'), chips.join(''));

    const desc = live.stage.querySelector('.se-hs-desc');
    const text = (show.desc && info?.text) || '';
    if (desc.textContent !== text) desc.textContent = text;
    desc.hidden = !text;

    const by = live.stage.querySelector('.se-hs-by');
    const byText = show.by ? [info?.dev, info?.year || ''].filter(Boolean).join(' · ') : '';
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
    if (!layer || !app || layer.firstChild) return;
    const img = artImg(ns.heroURLs(app), 'se-hs-hero');
    // The blurred fill behind the art (stage-hero.css) paints whichever URL actually loaded
    img.addEventListener('load', () => SE.cssVar(layer, '--se-hs-art', `url(${JSON.stringify(img.currentSrc)})`));
    layer.appendChild(img);
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
      if (on && cycleSeconds() > 0 && !reducedMotion.matches && live.apps.length > 1 && stageSettings().nav !== 'none') {
        const bar = document.createElement('span');
        bar.className = 'se-hs-prog';
        // Under the thumbnail as its own track; inside the dot when the strip is dots
        (stageSettings().nav === 'dots' ? t.querySelector('.se-hs-pic') : t).appendChild(bar);
      }
    });
    paintGame();
    // Screenshots or the trailer behind the game now on show (stage-art.js)
    ns.paintArtMedia?.();
  }

  // Cards the strip shows (set by stage-hero.css container queries), capped to the games.
  function stripCount() {
    const strip = live.stage?.querySelector('.se-hs-strip');
    const cols = strip ? parseInt(getComputedStyle(strip).getPropertyValue('--se-hs-cols'), 10) : NaN;
    return Math.min(live.apps.length, cols > 0 ? cols : live.apps.length);
  }

  // Keep the shown game on a visible card after the strip narrows.
  function fitStrip() {
    if (live.apps.length && stageSettings().nav !== 'none' && live.selected >= stripCount()) select(0);
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
      const shown = stageSettings().nav === 'none' ? live.apps.length : stripCount();
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
  // The stage's ancestors at the last lock: the same chain, still marked, needs no new pass
  let lockedChain = [];

  function lockScroll() {
    const chain = [];
    for (let p = live.scope.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      chain.push(p);
    }
    if (
      chain.length === lockedChain.length &&
      chain.every((el, i) => el === lockedChain[i]) &&
      locked.every((el) => el.hasAttribute('data-se-hs-scroll-lock'))
    ) {
      return;
    }
    // Reads (computed overflow, scroll offsets), then writes
    const want = chain.filter(
      (p) => p.hasAttribute('data-se-hs-scroll-lock') || /(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY)
    );
    want.push(document.body, document.documentElement);
    const fresh = want.filter((el) => !el.hasAttribute('data-se-hs-scroll-lock'));
    const scrolled = fresh.filter((el) => el.scrollTop);
    for (const el of locked) {
      if (!want.includes(el)) SE.unmark(el, 'data-se-hs-scroll-lock');
    }
    for (const el of scrolled) el.scrollTop = 0;
    for (const el of fresh) SE.mark(el, 'data-se-hs-scroll-lock');
    locked = want;
    lockedChain = chain;
  }

  function unlockScroller() {
    for (const el of locked) SE.unmark(el, 'data-se-hs-scroll-lock');
    locked = [];
    lockedChain = [];
  }

  function teardown(leaving) {
    closePick();
    closeMenu();
    unlockScroller();
    clearMarks();
    dropAllOwn(leaving);
    ns.dropBoard(leaving);
    ns.stopArtMedia?.();
    if (!leaving) appsSig = '';
    live.stage?.remove();
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
  // The board's bottom margin (--se-space-5), under the glass
  const BOARD_MARGIN = 24;
  // The most of the room under the header the board takes (the stage keeps at least the rest)
  const BOARD_SHARE = 0.32;

  // Reads only: the room under the header, and the board's width.
  function measureStage() {
    const view = live.scroller?.clientHeight || innerHeight;
    const top =
      live.scope.getBoundingClientRect().top -
      (live.scroller?.getBoundingClientRect?.().top || 0) +
      (live.scroller?.scrollTop || 0);
    return {
      measured: Math.max(420, Math.round(view - Math.max(0, top)) - HEADROOM),
      boardW: ns.boardWidth(),
    };
  }

  // Writes only, from measureStage()'s numbers: the board's height, the stage gets the rest.
  function applyStageDimensions({ measured, boardW }, showBoard) {
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
    /*
     * The board as tall as its capsules need (board.js's boardIdeal, from its width), but never
     * more than BOARD_SHARE of the room, so it shrinks with a shorter window instead of leaving
     * the stage to take all of it; never under its least row, and the stage the rest, never
     * under 340 px. A taller window doesn't grow it past what its capsules need: the stage
     * takes that.
     */
    const want = Math.min(ns.boardIdeal(boardW), Math.round(vh * BOARD_SHARE));
    const boardBox = showBoard ? Math.max(0, Math.min(Math.max(want, ns.boardLeast()), vh - 340 - BOARD_MARGIN)) : 0;
    ns.sizeBoard(boardBox);
    const boardH = boardBox ? boardBox + BOARD_MARGIN : 0;

    SE.cssVar(live.stage, '--se-hs-vh', `${vh}px`);
    SE.cssVar(live.stage, '--se-hs-h', `${Math.max(340, vh - boardH)}px`);
    if (live.scope.hasAttribute('data-se-hs-event')) unlockScroller();
    else lockScroll();
  }

  function layout() {
    if (live.scope && !usable()) return;
    // Back on Home: resume the art's push-in now rather than at the next cycle tick.
    if (live.stage?.hasAttribute('data-se-hs-idle') && document.visibilityState === 'visible') {
      SE.attr(live.stage, 'data-se-hs-idle', null);
    }
    const lib = document.querySelector('.LibraryHome');
    const home = lib?.parentElement;
    if (!home) {
      if (live.scope) teardown(true);
      return;
    }
    // Home: Steam (the Home stage menu's switch, home-mode.js): Steam's own Home, with the way back at its top
    if (ns.homeMode() === 'steam') {
      if (live.scope) teardown();
      setOn(false);
      ns.paintBackButton(home);
      return;
    }
    ns.paintBackButton(null);
    live.apps = ns.stageApps();
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
    if (live.stage.parentElement !== live.scope) live.scope.prepend(live.stage);

    // The board; with every panel removed it goes and the stage fills the window, until the Home
    // stage menu's Panels add one back
    const showBoard = ns.boardLayout().panels.length > 0;
    const board = ns.boardEl();
    if (!showBoard) board.remove();
    else if (board.previousElementSibling !== live.stage) live.stage.after(board);

    clearMarks(new Set([live.scope]));
    mark(live.scope, 'data-se-hs');
    // A news post open over Home (Library route state event_to_show): Steam's Home shows it
    const eventOpen = Boolean(SE.run(() => SE.mainWindow().m_history.location.state.event_to_show));
    if (eventOpen) mark(live.scope, 'data-se-hs-event');
    else SE.unmark(live.scope, 'data-se-hs-event');
    isNarrow = live.scope.clientWidth <= NARROW_AT;
    if (isNarrow) mark(live.scope, 'data-se-hs-narrow');
    else SE.unmark(live.scope, 'data-se-hs-narrow');

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
    applyStageLook();

    if (cycleDue) {
      cycleDue = false;
      if (!cycleTimer) restartCycle();
    }
    setOn(true);

    // Reads, then the writes they decide: sizes first, then the page of panels and their fit.
    const dims = measureStage();
    applyStageDimensions(dims, showBoard);
    const fits = showBoard ? ns.paintBoard(dims.boardW) : [];
    const boxes = fits.map((f) => boxOf(f.grid));
    fits.forEach((f, i) => f.fit(f.entry, boxes[i]));
    fitStrip();
  }

  /** destroy(): let go of the stage element. */
  function forgetStage() {
    live.stage = null;
  }

  Object.assign(ns, {
    forgetStage, layout, paintGame, restartCycle, select, setOn, teardown,
  });
})(window.__se);
