/*
 * Column resize: the drag handle on a column's edge, for the columns whose width is a setting
 * ("Game list width" and "Friends dock width": Fixed | Adjustable, skin.json Conditions).
 *
 * The handle writes the width to a user variable on <html> (--se-list-w-user, --se-fd-w-user)
 * and to localStorage. The column reads that variable only when its setting is Adjustable
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

  const readStored = (key) => {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value > 0 ? value : null;
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
   *   min: number,
   *   max: () => number,      read at use, so it follows the window's size
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

    let width = null;
    let frame = 0;
    let drag = null;

    const clamp = (value) => Math.round(Math.min(Math.max(value, spec.min), Math.max(spec.min, spec.max())));

    const showWidth = (value) => {
      chip.textContent = `${Math.round(value)} px`;
    };

    const apply = (value) => {
      width = value;
      if (drag || handle.matches(':focus-visible')) showWidth(value ?? spec.measure());
      SE.cssVar(root, spec.cssVar, value == null ? null : `${value}px`);
      handle.setAttribute('aria-valuemin', String(spec.min));
      handle.setAttribute('aria-valuemax', String(Math.round(spec.max())));
      if (value == null) handle.removeAttribute('aria-valuenow');
      else handle.setAttribute('aria-valuenow', String(value));
    };

    const applySoon = (value) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(value);
      });
    };

    const commit = () => writeStored(spec.storageKey, width);

    const grow = (dx) => (spec.side === 'right' ? dx : -dx);

    const onPointerDown = (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { x: event.clientX, from: width ?? spec.measure() };
      showWidth(drag.from);
      handle.setPointerCapture(event.pointerId);
      handle.setAttribute('data-dragging', '');
      root.setAttribute('data-se-col-resizing', '');
    };

    const onPointerMove = (event) => {
      if (drag) applySoon(clamp(drag.from + grow(event.clientX - drag.x)));
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
      apply(clamp((width ?? spec.measure()) + grow(dx)));
      commit();
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerEnd);
    handle.addEventListener('pointercancel', onPointerEnd);
    handle.addEventListener('lostpointercapture', onPointerEnd);
    handle.addEventListener('dblclick', onDoubleClick);
    handle.addEventListener('keydown', onKeyDown);
    handle.addEventListener('focus', () => showWidth(width ?? spec.measure()));

    const stored = readStored(spec.storageKey);
    apply(stored == null ? null : clamp(stored));

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
