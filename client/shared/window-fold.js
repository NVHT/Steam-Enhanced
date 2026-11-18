/*
 * Window fold: a column that folds itself away on small windows. Used by the Friends dock (folds
 * to its 60 px rail under 1400 px of window, client/friends/dock/ui.js) and the game list
 * (hides under 1000 px, client/navigation/title-bar.js).
 *
 * Below the breakpoint the column folds whatever its saved choice. Opening it there by hand
 * holds it open (and closing it again lets it fold) until the window crosses the breakpoint,
 * which drops the hold: back above it, the saved choice applies again, untouched. So the
 * saved choice is only ever what was picked on a big window.
 *
 * A minimized or hidden window's tiny size never counts (the Home stage's rule,
 * client/home/stage/stage.js): the last usable size stands until the window is usable again.
 *
 *   const fold = SE.windowFold(1400, onChange);
 *   fold.small     the window is under the breakpoint
 *   fold.held      opened by hand while small
 *   fold.toggle()  flip the hold (only means something while small)
 *   fold.destroy()
 * onChange runs when small changes (the hold is already dropped by then).
 */
((SE) => {
  if (!SE || SE.windowFold) return;

  const usable = () => document.visibilityState !== 'hidden' && innerWidth >= 480 && innerHeight >= 360;

  /**
   * @param {number} maxWidth  the breakpoint: small at this window width and under
   * @param {() => void} onChange
   */
  SE.windowFold = (maxWidth, onChange) => {
    const query = matchMedia(`(max-width: ${maxWidth}px)`);
    let small = query.matches && usable();
    let held = false;

    const check = () => {
      if (!usable()) return;
      const next = query.matches;
      if (next === small) return;
      small = next;
      held = false;
      onChange();
    };

    query.addEventListener('change', check);
    document.addEventListener('visibilitychange', check);

    return {
      get small() {
        return small;
      },
      get held() {
        return held;
      },
      toggle() {
        held = !held;
      },
      destroy() {
        query.removeEventListener('change', check);
        document.removeEventListener('visibilitychange', check);
      },
    };
  };
})(window.__se);
