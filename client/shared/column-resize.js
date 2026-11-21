/*
 * Column resize: the drag handle on a column's edge, for the columns whose width is a setting
 * ("Game list width" and "Friends dock width": Fixed | Adjustable, skin.json Conditions).
 *
 * The handle writes the width to a user variable on <html> (--se-list-w-user, --se-fd-w-user)
 * and to localStorage, as a share of the window: the variable is a clamp() of that share in vw
 * between the column's least and most, so the column follows the window as it's resized with no
 * script running (a width saved in px by older versions is turned into a share when first read).
 * The column reads that variable only when its setting is Adjustable
 * (options/library/game-list-adjustable.css, options/friends/dock-adjustable.css), which also
 * shows the handle: Fixed ignores a stored width with no script involved.
 *
 * Drag the edge, or focus it and use the arrow keys (Shift for bigger steps). Double-click
 * goes back to the default width. Drawn as a seam along the edge and a grip bar with three
 * dots, plus a width chip while held or focused (client/shared/column-resize.css); the held
 * handle carries [data-dragging].
 */
((SE) => {
  if (!SE || SE.columnResize) return;

  const STEP = 16;
  const STEP_BIG = 64;

  // The saved share of the window's width; an older px width (over 1) becomes one ({ legacy })
  const readStored = (key) => {
    try {
      const value = Number(localStorage.getItem(key));
      if (!Number.isFinite(value) || value <= 0) return null;
      return value > 1 ? { share: value / innerWidth, legacy: true } : { share: value, legacy: false };
    } catch {
      return null;
    }
  };

  const writeStored = (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    } catch {}
  };

  /**
   * @param {{
   *   col: string,            data-col on the handle, the hook the setting's file shows it by
   *   side: 'left' | 'right', the column edge it sits on; dragging away from the column grows it
   *   cssVar: string,         the user width variable, set on <html>
   *   storageKey: string,
   *   label: string,
   *   min: number,            its least width, px
   *   max: { px, share },     its most: px, or that share of the window if less
   *   measure: () => number,  the column's width as drawn
   * }} spec
   * @returns {{ handle: HTMLElement, destroy(): void }}
   */
  SE.columnResize = (spec) => {
    const root = document.documentElement;
    const handle = document.createElement('div');
    handle.className = 'se-col-resize';
    handle.dataset.col = spec.col;
    handle.dataset.side = spec.side;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', spec.label);
    // Seam along the edge, the grip bar with its three dots, and the width chip shown while held
    handle.innerHTML =
      '<span class="se-col-seam"></span>' +
      '<span class="se-col-grip"><i></i><i></i><i></i></span>' +
      '<span class="se-col-chip" aria-hidden="true"></span>';
    const chip = handle.lastElementChild;

    // The width set, as a share of the window's width (null: the column's default)
    let share = null;
    let frame = 0;
    let drag = null;

    const maxNow = () => Math.min(spec.max.px, innerWidth * spec.max.share);
    // A width in px held to the column's least and most
    const hold = (px) => Math.min(Math.max(px, spec.min), Math.max(spec.min, maxNow()));
    // The width it draws at now (the CSS clamp below, worked out)
    const widthNow = () => (share == null ? spec.measure() : hold(share * innerWidth));
    // A width in px, held, as a share of the window
    const toShare = (px) => hold(px) / innerWidth;
    const SHARE_DIGITS = 5;

    const showWidth = (px) => {
      chip.textContent = `${Math.round(px)} px`;
    };

    const apply = (value) => {
      share = value;
      if (drag || handle.matches(':focus-visible')) showWidth(widthNow());
      const vw = value == null ? null : (value * 100).toFixed(3);
      SE.cssVar(
        root,
        spec.cssVar,
        vw == null ? null : `clamp(${spec.min}px, ${vw}vw, min(${spec.max.px}px, ${spec.max.share * 100}vw))`
      );
      handle.setAttribute('aria-valuemin', String(spec.min));
      handle.setAttribute('aria-valuemax', String(Math.round(maxNow())));
      if (value == null) handle.removeAttribute('aria-valuenow');
      else handle.setAttribute('aria-valuenow', String(Math.round(widthNow())));
    };

    const applySoon = (value) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(value);
      });
    };

    const commit = () =>
      writeStored(spec.storageKey, share == null ? null : Number(share.toFixed(SHARE_DIGITS)));

    const grow = (dx) => (spec.side === 'right' ? dx : -dx);

    const onPointerDown = (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { x: event.clientX, from: widthNow() };
      showWidth(drag.from);
      handle.setPointerCapture(event.pointerId);
      handle.setAttribute('data-dragging', '');
      root.setAttribute('data-se-col-resizing', '');
    };

    const onPointerMove = (event) => {
      if (drag) applySoon(toShare(drag.from + grow(event.clientX - drag.x)));
    };

    const onPointerEnd = () => {
      if (!drag) return;
      drag = null;
      handle.removeAttribute('data-dragging');
      root.removeAttribute('data-se-col-resizing');
      commit();
    };

    const onDoubleClick = () => {
      apply(null);
      commit();
    };

    const onKeyDown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dx = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? STEP_BIG : STEP);
      apply(toShare(widthNow() + grow(dx)));
      commit();
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerEnd);
    handle.addEventListener('pointercancel', onPointerEnd);
    handle.addEventListener('lostpointercapture', onPointerEnd);
    handle.addEventListener('dblclick', onDoubleClick);
    handle.addEventListener('keydown', onKeyDown);
    handle.addEventListener('focus', () => showWidth(widthNow()));

    const stored = readStored(spec.storageKey);
    apply(stored?.share ?? null);
    // An older px width is saved back as its share
    if (stored?.legacy) commit();

    return {
      handle,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        drag = null;
        root.removeAttribute('data-se-col-resizing');
        SE.cssVar(root, spec.cssVar, null);
        handle.remove();
      },
    };
  };
})(window.__se);
