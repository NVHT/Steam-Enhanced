/*
 * Library Home, drawn by the theme: the hero stage and the board of panels under it.
 *
 * Renders the featured games in a full-bleed hero carousel with game logo,
 * store review summary, live player count, playtime/achievement counters,
 * Play/Install action button, and a strip of thumbnails or dots. Below the
 * stage, the board's panels (Favorites, Collections, Recently added, Friend activity) on
 * pages, as tall as nine capsules need. Steam's own Home stays mounted, never drawn.
 *
 * Controlled by the stage's own settings (stage-settings.js, kept in localStorage): the Home
 * stage menu, which also switches to Steam's own Home (home-mode.js) and adds or removes the
 * board's panels (none: the stage fills the window).
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seHomeStageParts (values parts reassign live on its `live`): util.js
 * (shared helpers), tray.js (panel shell, Favorites, Collections), picks.js, stage-settings.js
 * (the stage's settings and the Steam Enhanced | Steam switch), panels-library.js and panels-community.js (more panels), board.js (the board, its
 * pages, adding and removing panels and each panel's ⋯ menu), home-mode.js (which Home shows),
 * stage.js (the stage and the layout pass), data.js, and this one, main.js, which watches Home, runs one layout pass per frame and undoes
 * everything in destroy().
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    cancelPass, forgetStage, layout, placePick, reducedMotion,
    restartCycle, schedule, select, setOn, setPass, teardown,
  } = ns;
  const { live } = ns;

  window.__seHomeStage?.destroy();

  let watcher = null;
  let sizes = null;
  let watched = new Set();

  function watchSizes() {
    if (!sizes) return;
    const want = new Set(live.scope ? [live.scroller, live.scope].filter(Boolean) : []);
    for (const el of watched) {
      if (!want.has(el)) sizes.unobserve(el);
    }
    for (const el of want) {
      if (!watched.has(el)) sizes.observe(el);
    }
    watched = want;
  }

  let laidAt = -Infinity;
  let sizeTimer = 0;

  function update() {
    cancelPass();
    laidAt = performance.now();
    try {
      layout();
    } catch (e) {
      setOn(false);
      console.warn('[Steam Enhanced] home stage', e);
    }
    watcher?.takeRecords();
    watchSizes();
  }


  // Throttle ResizeObserver callbacks during window/splitter drags to 120ms.
  function scheduleSize() {
    const wait = laidAt + 120 - performance.now();
    if (wait <= 0) {
      schedule();
      return;
    }
    if (!sizeTimer) {
      sizeTimer = setTimeout(() => {
        sizeTimer = 0;
        schedule();
      }, wait);
    }
  }

  function onResize() {
    scheduleSize();
    placePick();
  }

  function onMutate() {
    const home = document.querySelector('.LibraryHome')?.parentElement;
    if (home && (home !== live.scope || !live.stage?.isConnected)) {
      update();
    } else {
      schedule();
    }
  }

  function onMotion() {
    if (live.stage) {
      select(live.selected);
      restartCycle();
    }
  }

  function start() {
    watcher = SE.watch(onMutate, {
      sync: true,
      ignore: (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return Boolean(el?.closest(`.se-hs-stage, .se-hs-board, .se-placed, .se-hs-back, ${SE.SIDE}`));
      },
    });
    sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleSize) : null;
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener?.('change', onMotion);
    ns.startParallax();
    schedule();
  }

  window.__seHomeStage = {
    destroy() {
      watcher?.disconnect();
      sizes?.disconnect();
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', schedule);
      reducedMotion.removeEventListener?.('change', onMotion);
      cancelPass();
      clearTimeout(sizeTimer);
      teardown();
      ns.stopParallax(); // after teardown(): its stopArtMedia() queues a centring frame
      setOn(false);
      ns.paintBackButton(null);
      forgetStage();
      removeEventListener('DOMContentLoaded', start);
      delete window.__seHomeStage;
    },
  };

  setPass(update);

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
})(window.__se);
