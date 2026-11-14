/*
 * Library Home hero stage and bottom shelf tray.
 *
 * Renders recently played games in a full-bleed hero carousel with game logo,
 * store review summary, live player count, playtime/achievement counters,
 * Play/Install action button, and an 8-item thumbnail selector strip. Below the
 * stage, What's New, Favorites, and Collections are arranged side by side in a
 * three-column tray.
 *
 * Controlled via CSS custom properties in core/tokens.css:
 *   --se-home-stage (on | off)
 *   --se-home-stage-cycle (seconds)
 *   --se-home-stage-tray (percentage of viewport height)
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seHomeStageParts (values parts reassign live on its `live`): util.js
 * (shared helpers), tray.js, picks.js, stage.js (the stage and the layout pass), data.js,
 * news.js, and this one, main.js, which watches Home, runs one layout pass per frame and undoes
 * everything in destroy().
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    cancelNewsOpen, cancelPass, forgetStage, layout, narrow, placePick, reducedMotion,
    restartCycle, schedule, select, setOn, setPass, teardown,
  } = ns;
  const { live } = ns;

  window.__seHomeStage?.destroy();

  let watcher = null;
  let sizes = null;
  let watched = new Set();

  function watchSizes() {
    if (!sizes) return;
    const want = new Set(live.scope ? [live.scroller, ...live.scope.querySelectorAll('[data-se-hs-col]')].filter(Boolean) : []);
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
    if (live.pickEl) placePick();
  }

  const NEW_ROW =
    ':scope > :not([data-se-hs-sec]):not([data-se-hs-flat]):not(.se-hs-stage):not(.se-hs-tray), ' +
    '[data-se-hs-flat] > :not([data-se-hs-sec]):not([data-se-hs-flat])';

  function onMutate() {
    const home = document.querySelector('.LibraryHome')?.parentElement;
    if (home && (home !== live.scope || !live.stage?.isConnected || home.querySelector(NEW_ROW))) {
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
        return Boolean(el?.closest(`.se-hs-stage, .se-hs-pick, ${SE.SIDE}`));
      },
    });
    sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleSize) : null;
    addEventListener('resize', onResize);
    narrow.addEventListener?.('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener?.('change', onMotion);
    schedule();
  }

  window.__seHomeStage = {
    destroy() {
      cancelNewsOpen();
      watcher?.disconnect();
      sizes?.disconnect();
      removeEventListener('resize', onResize);
      narrow.removeEventListener?.('change', schedule);
      document.removeEventListener('visibilitychange', schedule);
      reducedMotion.removeEventListener?.('change', onMotion);
      cancelPass();
      clearTimeout(sizeTimer);
      teardown();
      setOn(false);
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
