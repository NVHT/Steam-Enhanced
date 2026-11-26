/*
 * A shelf expanding or collapsing (its Collapser). Steam grows the grid's box with a height
 * transition (CSSGrid Container.Animate): every shelf below lays out again on each frame, and
 * the new rows, drawn at once, lie over the next shelf until the box catches up. Here the box
 * takes its new size at once (client/library/library-home.css takes the transition off) and the
 * move is drawn on the compositor: the shelves below slide from where they were, and the grid's
 * clip opens with them, so its new rows show only as room is made (they fade down into place,
 * library-home.css). One layout read before Steam's change and one after; nothing per frame.
 * Reduced motion: the shelf just changes.
 */
((SE) => {
  window.__seShelfExpand?.destroy();
  const { C } = SE;

  const COLLAPSER = `.${C.Collapser}`;
  const OUTER = `.${C.ShowcaseOuter}`;
  const GRID_BOX = `.${C.Animate_Container}`;
  // Room the clip leaves around the grid: hover rings, shadows and the hover cards sideways
  const ROOM = '-48px';
  const SIDES = '-100vw';
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  let running = [];
  let frame = 0;

  const reduced = () => systemReduced.matches || SE.settings?.get('motion') === 'reduced';

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const animation of running) animation.cancel();
    running = [];
  };

  const timing = () => {
    const style = getComputedStyle(document.documentElement);
    const duration = parseFloat(style.getPropertyValue('--se-dur-long')) * 1000 || 400;
    return { duration, easing: style.getPropertyValue('--se-ease').trim() || 'ease-out' };
  };

  const play = (outer, box, delta) => {
    const options = timing();
    // The shelves below start where they were and slide to where Steam put them
    for (let next = outer.nextElementSibling; next; next = next.nextElementSibling) {
      running.push(next.animate([{ transform: `translateY(${-delta}px)` }, { transform: 'none' }], options));
    }
    // Opening: the grid shows only what the slide has made room for
    if (delta > 0) {
      running.push(box.animate([
        { clipPath: `inset(${ROOM} ${SIDES} ${delta}px ${SIDES})` },
        { clipPath: `inset(${ROOM} ${SIDES} ${ROOM} ${SIDES})` },
      ], options));
    }
  };

  // Capture: read the box before Steam's own click handler changes it
  const onClick = (event) => {
    const button = event.target instanceof Element && event.target.closest(COLLAPSER);
    const outer = button?.closest(OUTER);
    const box = outer?.querySelector(GRID_BOX);
    if (!box || reduced()) return;
    stop();
    const before = box.offsetHeight;
    // Steam redraws within the click; the frame after reads its new size, before it's painted
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!box.isConnected) return;
      const delta = box.offsetHeight - before;
      if (delta) play(outer, box, delta);
    });
  };

  document.addEventListener('click', onClick, true);

  window.__seShelfExpand = {
    destroy() {
      document.removeEventListener('click', onClick, true);
      stop();
      delete window.__seShelfExpand;
    },
  };
})(window.__se);
