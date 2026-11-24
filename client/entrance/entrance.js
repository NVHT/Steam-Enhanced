/*
 * Splash entrance (the Window entrance setting, Splash), main window only; paired with entrance.css.
 *
 * client/loader.js holds the main window under a cover until the Library has finished
 * building, and marks <html data-se-entrance> with the setting. With "splash", this mounts the
 * splash over that cover as soon as the theme's scripts run, and the loader calls finish()
 * the moment the Library is ready (instead of lifting its cover):
 *
 *   loading  the last played game's art in the box where Home's stage sits on the
 *            wireframe Library (SE.wireframe, alive and busy), its art blurred round it, "Welcome back", its
 *            logo and name, one Library bar creeping toward 90%
 *   ready    the bar fills, runs into gold and shines, the spinner gives way to a tick, "Ready"
 *   leave    everything but the art fades off the built Library, while the art moves into the
 *            real stage's art box (.se-hs-stage .se-hs-art), drawn with the stage's own art
 *            classes so it lands looking the same; then it fades and the splash removes itself
 *
 * Only the Library: the startup window before it has already
 * shown Network and sign-in. The game is the one Home's stage will feature first (its Games
 * setting: recent, favorites, a collection, added; client/home/stage/stage-settings.js), or the
 * last played with Home off; its art's loaded copies are kept in localStorage, so it draws at
 * once, and checked against Steam's stores once they arrive (the splash comes after sign-in).
 * With none played yet it says "Welcome" over the wireframe alone. The move is skipped (the art
 * fades with the rest) under reduced motion, when Home's stage isn't on show or shows another
 * game. If the loader never calls finish(), SAFETY_MS does.
 */
(() => {
  window.__seEntrance?.destroy();
  const SE = window.__se;
  const root = document.documentElement;
  // The loader's choice for this load (the setting, and "Show splash")
  if (!SE || root.hasAttribute('data-se-styled') || root.dataset.seEntrance !== 'splash') return;

  const CREEP_MS = 3200;
  const FILL_MS = 320;
  const READY_HOLD_MS = 900; // long enough for the tick and the bar's shine
  const MOVE_MS = 650;
  const FADE_MS = 400;
  const SAFETY_MS = 6000;
  // How long the app store may stay empty before this counts as a first run ("Welcome")
  const FIRST_RUN_MS = 1500;
  // The art box's corner in design px (entrance.css draws the same)
  const RADIUS = 20;
  const EASE = 'cubic-bezier(.4, 0, .2, 1)';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const el = document.createElement('div');
  el.id = 'se-entrance';
  el.dataset.phase = 'loading';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="se-ent-ground"><div class="se-ent-ambient"></div>' +
    `${SE.wireframe?.({ alive: true, busy: true }) || ''}<div class="se-ent-shadow"></div></div>` + // client/shared/wireframe.js
    // The stage's own art classes (client/home/stage/stage-hero.css), so it hands off unchanged
    '<div class="se-ent-art"><div class="se-hs-art"><div class="se-hs-layer" data-on></div><div class="se-hs-grade"></div></div></div>' +
    '<div class="se-ent-block"><div class="se-ent-game"><span class="se-ent-eyebrow"></span>' +
    '<span class="se-ent-logo"></span><span class="se-ent-name"></span></div>' +
    '<div class="se-ent-progress"><div class="se-ent-bar"><span></span></div>' +
    // The step as in the startup window: the theme's spinner while it runs, a tick once done
    '<div class="se-ent-meta"><span class="se-ent-status"><i class="se-ent-spin se-spin-arc"></i><b class="se-ent-tick"></b>' +
    '<span class="se-ent-step">Loading your library</span></span>' +
    '<span class="se-ent-count"></span></div></div></div>';
  // Outside <body>: the loader watches the body's DOM to tell when the Library is built
  root.append(el);

  const art = el.querySelector('.se-ent-art');
  const layer = el.querySelector('.se-hs-layer');
  const status = el.querySelector('.se-ent-step');
  const libBar = el.querySelector('.se-ent-bar > span');
  const creep = libBar.animate([{ transform: 'scaleX(.04)' }, { transform: 'scaleX(.9)' }], {
    duration: CREEP_MS,
    easing: 'cubic-bezier(.2, .6, .3, 1)',
    fill: 'forwards',
  });

  /*
   * The splash's steps run on frames watching the clock, not timers: after Reload UI during a
   * voice call the main window drops its timers for its first seconds, which stranded it at
   * "Loading". A hidden window has no frames; shown, every step that came due runs.
   */
  const timers = new Set();
  const later = (fn, ms) => {
    const due = performance.now() + ms;
    const job = { frame: 0 };
    const tick = () => {
      if (performance.now() < due) {
        job.frame = requestAnimationFrame(tick);
        return;
      }
      timers.delete(job);
      fn();
    };
    job.frame = requestAnimationFrame(tick);
    timers.add(job);
  };

  /* ---------- The art box: the wireframe's stage ---------- */

  let box = null;
  const wfStage = el.querySelector('.se-wf-stage');
  // One read, then the writes it decides: the art, its shadow and the game's block follow it
  const place = () => {
    const r = wfStage?.getBoundingClientRect();
    if (!r?.width) return;
    box = { left: r.left, top: r.top, width: r.width, height: r.height };
    for (const [name, value] of [['x', r.left], ['y', r.top], ['w', r.width], ['h', r.height], ['foot', innerHeight - r.bottom]]) {
      el.style.setProperty(`--ent-${name}`, `${Math.round(value * 100) / 100}px`);
    }
  };
  let placeFrame = 0;
  const onResize = () => {
    if (!placeFrame) placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      place();
    });
  };
  place();
  addEventListener('resize', onResize);

  /* ---------- The game: the last one played (or the "Splash art" setting's), read live ---------- */

  // last (Home's game: the stage's first, or the last played with Home off) | random (one of the
  // most recently played, picked once) | none (no game's art)
  const ART = SE.settings?.get('splash-art') || 'last';
  const RANDOM_FROM = 8;

  let shown = 0; // its appid
  let hasArt = false;

  /*
   * The game shown last time and the copies of its art that loaded, so the art draws at once
   * instead of after Steam's app list arrives and its copies are tried in turn. The live list
   * still decides: a different game there replaces it.
   */
  const HINT_KEY = 'se-splash-game';
  /*
   * What picks the game: Home's stage, by its Games setting (and collection), or with Home off
   * the last played. The remembered game is used only while this still matches, so a changed
   * setting never flashes the old pick.
   */
  const followsStage = SE.settings?.get('home') !== 'steam';
  const choice = followsStage ? `${SE.settings?.get('stage-source') || 'recent'}|${SE.settings?.get('stage-collection') || ''}` : 'played';
  const readHint = () => {
    try {
      const hint = JSON.parse(localStorage.getItem(HINT_KEY));
      return hint?.appid && hint.hero && hint.choice === choice ? hint : null;
    } catch {
      return null;
    }
  };
  const saveHint = () => {
    const hero = layer.querySelector('.se-hs-hero');
    if (!shown || !hasArt || !hero) return;
    const logo = el.querySelector('.se-ent-logo-img');
    try {
      localStorage.setItem(HINT_KEY, JSON.stringify({
        appid: shown,
        choice,
        name: el.querySelector('.se-ent-name').textContent,
        hero: hero.currentSrc,
        logo: logo && !logo.hasAttribute('data-se-art-wait') ? logo.currentSrc : '',
      }));
    } catch {}
  };

  // The games played, most recent first
  const played = (store) =>
    SE.run(() =>
      store.allApps
        .filter((a) => a?.rt_last_time_played > 0 && SE.isLibraryGame(a))
        .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
    ) || [];

  // A source that needs Steam's collections waits this long for them (inside FIRST_RUN_MS, so a
  // returning player never reads "Welcome" first), then takes what the stage has
  const COLLECTIONS_MS = 1200;
  const started = performance.now();

  /*
   * The game Home's stage will open on: its featured list's first (stageApps, which falls back to
   * the recently played as the stage does). undefined while that can't be told yet: the stage's
   * scripts not run, or a favorites or collection source before Steam's collections load.
   */
  const stageGame = () => {
    const stage = window.__seHomeStageParts;
    if (!stage?.stageApps || !stage.collectionApps) return undefined;
    const source = SE.settings?.get('stage-source');
    const id = source === 'favorites' ? 'favorite' : source === 'collection' ? SE.settings?.get('stage-collection') : '';
    if (id && stage.collectionApps(id) === null && performance.now() - started < COLLECTIONS_MS) return undefined;
    return SE.run(() => stage.stageApps()[0]) || null;
  };

  let picked; // the random pick, kept across the app list's checks
  const pickGame = (store) => {
    const recent = played(store);
    if (ART !== 'random') return followsStage ? stageGame() : recent[0] || null;
    if (picked === undefined && recent.length) {
      const pool = recent.slice(0, RANDOM_FROM);
      picked = pool[Math.floor(Math.random() * pool.length)];
    }
    return picked || null;
  };

  // { appid, name, hero: [urls], logo: [urls] }; a second call (the live game differs) replaces the first
  function paintGame(game) {
    shown = game.appid;
    hasArt = false;
    layer.textContent = '';
    const hero = SE.art.img(game.hero, 'se-hs-hero');
    // The blurred fill (the stage's and the splash's ambient) paints whichever copy loaded
    hero.addEventListener('load', () => {
      const url = `url(${JSON.stringify(hero.currentSrc)})`;
      layer.style.setProperty('--se-hs-art', url);
      el.style.setProperty('--ent-art', url);
      hasArt = true;
      el.dataset.art = '';
    }, { once: true });
    layer.append(hero);

    // The name shows only while there's no logo (entrance.css)
    const logo = el.querySelector('.se-ent-logo');
    logo.textContent = '';
    delete el.dataset.logo;
    if (game.logo.length) {
      const img = SE.art.img(game.logo, 'se-ent-logo-img', () => img.remove());
      img.addEventListener('load', () => {
        el.dataset.logo = '';
      }, { once: true });
      logo.append(img);
    }
    el.querySelector('.se-ent-name').textContent = game.name || '';
    el.querySelector('.se-ent-eyebrow').textContent = 'Welcome back';
    el.dataset.game = 'back';
  }

  // The remembered game is last run's: only the "Last played" choice draws it ahead of the list
  const hint = ART === 'last' ? readHint() : null;
  if (hint) paintGame({ appid: hint.appid, name: hint.name, hero: [hint.hero], logo: hint.logo ? [hint.logo] : [] });

  const firstRun = () => {
    if (el.dataset.game) return;
    el.querySelector('.se-ent-eyebrow').textContent = 'Welcome';
    el.dataset.game = 'new';
  };

  // Steam has no event for its app list arriving, so this asks until it's there
  let waiting = null;
  const tryGame = () => {
    const store = SE.appStore();
    if (!SE.run(() => store.allApps.length)) return;
    // The library's size beside the bar: the games it lists, as the game list counts them
    const games = SE.run(() => store.allApps.filter((a) => a && (a.app_type === 1 || a.app_type === 1073741824)).length);
    if (games) el.querySelector('.se-ent-count').textContent = `${games.toLocaleString()} ${games === 1 ? 'game' : 'games'}`;
    const game = pickGame(store);
    if (game === undefined) return; // not told yet: asked again
    // The remembered game stands unless the list names another, or its art no longer loads
    const stale = !shown || game?.appid !== shown || layer.querySelector('.se-hs-hero')?.hidden;
    if (game && ART === 'none') {
      // A returning player, with no game's art: the greeting alone over the wireframe
      el.querySelector('.se-ent-eyebrow').textContent = 'Welcome back';
      el.dataset.game = 'back';
    } else if (game && stale) {
      paintGame({
        appid: game.appid,
        name: game.display_name,
        hero: SE.heroURLs(game.appid, store),
        logo: SE.logoURLs(game.appid, store),
      });
    } else if (!game) {
      firstRun();
    }
    waiting?.disconnect();
    waiting = null;
  };
  tryGame();
  if (!el.dataset.game) waiting = SE.poll(tryGame, 150);
  later(firstRun, FIRST_RUN_MS);

  /* ---------- Finish: Ready, then the art into Home's stage ---------- */

  let moving = null;

  // The art from its box into the stage's art box: laid out there at once, drawn back over its
  // box by a transform and a clip (the two boxes' shapes differ), then let go
  function moveArt() {
    const stage = document.querySelector('.se-hs-stage');
    const target = stage?.querySelector('.se-hs-art');
    const live = window.__seHomeStageParts?.live; // client/home/stage/stage.js
    const onShow = live?.apps?.[live.selected]?.appid;
    if (!box || !hasArt || reduced.matches || !target || !shown || onShow !== shown || !SE.visible(stage)) return false;
    const to = target.getBoundingClientRect();
    const stageH = stage.getBoundingClientRect().height;
    if (!to.width || !to.height) return false;

    const scale = box.width / to.width;
    const height = Math.max(to.height, box.height / scale);
    const radius = (RADIUS * Math.min(innerWidth / 1920, innerHeight / 1080)) / scale;
    Object.assign(art.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${height}px` });
    art.style.setProperty('--se-hs-h', `${stageH}px`);
    el.dataset.move = '';
    moving = art.animate([
      {
        transform: `translate(${box.left - to.left}px, ${box.top - to.top}px) scale(${scale})`,
        clipPath: `inset(0 0 ${height - box.height / scale}px 0 round ${radius}px)`,
      },
      { transform: 'none', clipPath: `inset(0 0 ${height - to.height}px 0 round 0px)` },
    ], { duration: MOVE_MS, easing: EASE, fill: 'forwards' });
    return true;
  }

  const destroy = () => {
    for (const job of timers) cancelAnimationFrame(job.frame);
    timers.clear();
    waiting?.disconnect();
    waiting = null;
    cancelAnimationFrame(placeFrame);
    removeEventListener('resize', onResize);
    creep.cancel();
    moving?.cancel();
    el.remove();
    if (window.__seEntrance === api) delete window.__seEntrance;
  };

  const leave = () => {
    waiting?.disconnect();
    waiting = null;
    removeEventListener('resize', onResize);
    if (ART === 'last') saveHint(); // a random pick isn't last run's game
    // A failed hand-off (Home's stage not as expected) fades the art with the rest, never strands
    // the splash
    const moved = SE.run(moveArt) === true;
    // Moved, the art waits in the stage's place, then fades over the real one; else it all fades
    el.dataset.phase = 'leave';
    if (moved) {
      later(() => {
        el.dataset.phase = 'done';
      }, MOVE_MS);
    }
    later(destroy, (moved ? MOVE_MS : 0) + FADE_MS + 50);
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const from = getComputedStyle(libBar).transform; // wherever the creep had got to
    creep.cancel();
    libBar.animate([{ transform: from === 'none' ? 'scaleX(.04)' : from }, { transform: 'none' }], {
      duration: FILL_MS,
      easing: EASE,
      fill: 'forwards',
    });
    later(() => {
      status.textContent = 'Ready';
      el.dataset.phase = 'ready';
    }, FILL_MS);
    later(leave, FILL_MS + READY_HOLD_MS);
  };

  later(finish, SAFETY_MS);
  // Last resort: gone after the longest run it could have (Ready, the move, the fade), whatever
  // stopped it. If even these never run, entrance.css's se-ent-strand hides it
  later(destroy, SAFETY_MS + FILL_MS + READY_HOLD_MS + MOVE_MS + FADE_MS + 1000);
  const api = { finish, destroy };
  window.__seEntrance = api;
})();
