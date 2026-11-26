/*
 * Library Home layout alignments: deduplicate date headers, align shelf edges, and measure cover
 * action buttons.
 */
((SE) => {
  const { C } = SE;
  window.__seHomePolish?.destroy();

  const NEWS_SELECTOR = `.${C.UpdatesContainer}`;
  // The basic layout's dates; the row's cards each show theirs (client/home/whats-new.css)
  const DATE_SELECTOR = `.${C.BasicHomeUpdates_EventTime}`;
  const SHELF_SELECTOR = `.${C.Showcase}`;
  const COVERS_CONTAINER_SELECTOR = `.${C.ChildrenContainer}`;
  const COVER_BOX_SELECTOR = `.${C.LibraryItemBox}`;
  const ACTION_BTN_SELECTOR = `.${C.LibraryItemActionButton}`;
  const UNINSTALLED_ICON_SELECTOR = `.${C.UninstalledIcon}:not(.${C.ComingSoonIcon})`;
  const WIDE_CAPSULE_SELECTOR = `.${C.FeaturedCapsule}`;
  const LANDSCAPE_CLS = C.Landscape;

  // Covers on screen (IntersectionObserver), so a long grid isn't measured off-screen.
  const onScreen = new Set();
  const seenButtons = new WeakSet();
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) onScreen.add(entry.target);
            else onScreen.delete(entry.target);
          }
          schedule();
        })
      : null;

  const visibleButtons = () => {
    const all = document.querySelectorAll(`${ACTION_BTN_SELECTOR}, ${UNINSTALLED_ICON_SELECTOR}`);
    if (!io) return [...all];
    for (const btn of all) {
      if (seenButtons.has(btn)) continue;
      seenButtons.add(btn);
      io.observe(btn);
    }
    for (const btn of onScreen) {
      if (!btn.isConnected) {
        onScreen.delete(btn);
        io.unobserve(btn);
      }
    }
    return [...onScreen];
  };

  const deduplicateEventDates = () => {
    for (const news of document.querySelectorAll(NEWS_SELECTOR)) {
      let prevDateText = null;
      for (const dateEl of news.querySelectorAll(DATE_SELECTOR)) {
        const text = dateEl.textContent.trim();
        const isRepeat = text !== '' && text === prevDateText;
        if (isRepeat !== dateEl.hasAttribute('data-se-repeat')) {
          dateEl.toggleAttribute('data-se-repeat', isRepeat);
        }
        prevDateText = text;
      }
    }
  };

  const offsetLeftFromRoot = (el) => {
    let x = 0;
    for (let cur = el; cur; cur = cur.offsetParent) {
      x += cur.offsetLeft + (cur.clientLeft || 0);
    }
    return x;
  };

  /*
   * Reads only; the writes are applied by applyShelfShifts() after every read of the frame.
   * A shelf is measured once (by its cover box), and again after a window resize or its first
   * cover's image loading:
   * the pass also runs on every change while a big shelf scrolls (Home's Uncategorized, its covers
   * drawn and dropped), and measuring each time forced a layout in every pass.
   */
  const measuredShift = new WeakSet(); // shelves' cover boxes measured
  let shiftsStale = false;
  const measureShelfShifts = () => {
    const stale = shiftsStale;
    shiftsStale = false;
    const measurements = [];
    for (const shelf of document.querySelectorAll(SHELF_SELECTOR)) {
      // Under the Home stage Steam's Home isn't drawn, and in reorder mode a shelf shows only
      // its card (client/home/shelf-arrange.js): nothing to align.
      if (shelf.closest(`[data-se-hs], .${C.Reordering}`)) continue;
      const box = shelf.querySelector(COVER_BOX_SELECTOR);
      const firstCover = (box && box.querySelector('img')) || box || shelf.querySelector('img');
      if (!firstCover) continue;

      const coversContainer = shelf.querySelector(COVERS_CONTAINER_SELECTOR)?.contains(firstCover)
        ? shelf.querySelector(COVERS_CONTAINER_SELECTOR)
        : [...shelf.children].find(c => c.contains(firstCover));
      if (!coversContainer) continue;
      if (!stale && measuredShift.has(coversContainer)) continue;
      measuredShift.add(coversContainer);

      const appliedShift = parseFloat(coversContainer.style.getPropertyValue('--se-cover-shift')) || 0;
      const shelfPaddingLeft = parseFloat(getComputedStyle(shelf).paddingLeft) || 0;
      const strayGap = offsetLeftFromRoot(firstCover) - offsetLeftFromRoot(shelf) - shelfPaddingLeft;
      const targetShift = Math.round(appliedShift + strayGap);
      measurements.push([
        shelf,
        coversContainer,
        appliedShift,
        targetShift > 0 && targetShift <= 24 ? targetShift : 0,
      ]);
    }
    return measurements;
  };

  /*
   * The shift each shelf's cover box last needed, by the shelf (Steam's showcase id) and the box's
   * class: shelves of one kind can need different shifts (covers, collection tiles). A box Steam
   * draws again (Done in Arrange shelves, a shelf re-rendered) takes it as it appears, before
   * it's painted, so its covers don't jump sideways; the next measured pass checks it. Props and
   * class reads only: no layout.
   */
  const knownShift = new Map();
  const shelfIds = new WeakMap(); // a shelf element → its showcase id, read once
  const shiftKey = (shelf, box) => {
    if (!shelfIds.has(shelf)) shelfIds.set(shelf, SE.fromProps(shelf, 8, (p) => p.showcase?.nShowcaseId ?? null) ?? '');
    return `${shelfIds.get(shelf)}|${box.className}`;
  };
  const applyKnownShifts = () => {
    if (!knownShift.size) return;
    for (const shelf of document.querySelectorAll(SHELF_SELECTOR)) {
      for (const box of shelf.children) {
        if (box.hasAttribute('data-se-shifted')) continue;
        const shift = knownShift.get(shiftKey(shelf, box));
        if (!shift) continue;
        box.style.setProperty('--se-cover-shift', `${shift}px`);
        box.setAttribute('data-se-shifted', '');
      }
    }
  };

  const applyShelfShifts = (measurements) => {
    for (const [shelf, container, appliedShift, targetShift] of measurements) {
      knownShift.set(shiftKey(shelf, container), targetShift);
      if (targetShift !== appliedShift) {
        if (targetShift) container.style.setProperty('--se-cover-shift', `${targetShift}px`);
        else container.style.removeProperty('--se-cover-shift');
      }
      if (container.hasAttribute('data-se-shifted') !== !!targetShift) {
        container.toggleAttribute('data-se-shifted', !!targetShift);
      }
    }
  };

  // Listeners on Steam's elements: one signal removes them all in destroy().
  const listeners = new AbortController();
  const hoverBound = new WeakSet();
  const clickBound = new WeakSet();

  const findCoverContext = (btn) => {
    let el = btn.parentElement;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      const cover = el.querySelector(COVER_BOX_SELECTOR);
      if (cover) return { cover, item: el };
    }
    return null;
  };

  /*
   * Cover Play / Install / Update overlays: measured here (reads), placed by placeCoverButtons().
   * With the Status chips on (client/library/cover-state.css) a cover's button sits under its
   * chip and never grows across it: marked and bound, but not measured. Recent Games' wide card
   * too: its button goes under the chip like any cover's (its play time is the hover card's).
   */
  const measureCoverButtons = () => {
    const plan = [];
    const chips = SE.settings?.get('cover-chips') !== 'off';
    for (const btn of visibleButtons()) {
      if (!chips && btn.closest(WIDE_CAPSULE_SELECTOR)) continue;
      const isUninstalledIcon = btn.matches(UNINSTALLED_ICON_SELECTOR);
      const directCover = isUninstalledIcon && btn.closest(COVER_BOX_SELECTOR);
      const context = directCover ? { cover: directCover, item: directCover } : findCoverContext(btn);
      if (!context || (!chips && context.cover.classList.contains(LANDSCAPE_CLS))) continue;
      if (chips) {
        plan.push({ btn, isUninstalledIcon, context, coords: [0, 0, 0] });
        continue;
      }

      const offsetBox = btn.offsetParent;
      if (!offsetBox) continue;

      let offsetX = 0;
      let offsetY = 0;
      let cursor = offsetBox;
      let coords;

      while (cursor && cursor !== context.cover && context.cover.contains(cursor)) {
        offsetX += cursor.offsetLeft;
        offsetY += cursor.offsetTop;
        cursor = cursor.offsetParent;
      }

      if (cursor === context.cover || offsetBox === context.cover) {
        if (!context.cover.offsetWidth) continue;
        coords = [
          -offsetX,
          offsetY + offsetBox.offsetHeight - context.cover.offsetHeight,
          context.cover.offsetWidth,
        ];
      } else {
        if (context.item.matches(':hover')) continue;
        const coverRect = context.cover.getBoundingClientRect();
        const boxRect = offsetBox.getBoundingClientRect();
        if (!coverRect.width) continue;
        coords = [
          coverRect.left - boxRect.left,
          boxRect.bottom - coverRect.bottom,
          context.cover.offsetWidth || coverRect.width,
        ];
      }

      plan.push({ btn, isUninstalledIcon, context, coords });
    }
    return plan;
  };

  const placeCoverButtons = (plan) => {
    const CSS_VARS = ['--se-cl', '--se-cb', '--se-cw'];
    for (const { btn, isUninstalledIcon, context, coords } of plan) {
      const { item } = context;
      CSS_VARS.forEach((prop, idx) => {
        const px = `${Math.round(coords[idx])}px`;
        if (btn.style.getPropertyValue(prop) !== px) btn.style.setProperty(prop, px);
      });

      SE.mark(btn, 'data-se-cover-btn');
      if (isUninstalledIcon) {
        const svgClass = btn.querySelector('svg')?.getAttribute('class') || '';
        const actionType = svgClass.includes('Download') || !btn.querySelector('svg') ? 'install' : 'stream';
        if (btn.dataset.seAct !== actionType) btn.dataset.seAct = actionType;
      }

      for (let parent = btn.parentElement; parent && parent !== item; parent = parent.parentElement) {
        SE.mark(parent, 'data-se-btnbox');
      }

      // Bound once per item, whatever it showed first (an item can become uninstalled later).
      if (isUninstalledIcon && !clickBound.has(item)) {
        clickBound.add(item);
        item.addEventListener(
          'click',
          (event) => {
            const icon = item.querySelector('[data-se-cover-btn]');
            if (!icon || event.target === icon || icon.contains(event.target)) return;
            const rect = icon.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            ) {
              return;
            }
            event.stopPropagation();
            event.preventDefault();
            icon.click();
          },
          { capture: true, signal: listeners.signal }
        );
      }

      if (!hoverBound.has(item)) {
        hoverBound.add(item);
        const opts = { signal: listeners.signal };
        item.addEventListener('pointerenter', () => item.querySelector('[data-se-cover-btn]')?.setAttribute('data-se-hot', ''), opts);
        item.addEventListener('pointerleave', () => item.querySelector('[data-se-cover-btn]')?.removeAttribute('data-se-hot'), opts);
      }
    }
  };

  let frame = 0;
  let observer;
  let earlyObserver;

  // Every read of the frame first, then every write: one layout per pass instead of three.
  const update = () => {
    frame = 0;
    try {
      const shifts = measureShelfShifts();
      const plan = measureCoverButtons();
      deduplicateEventDates();
      applyShelfShifts(shifts);
      placeCoverButtons(plan);
    } catch {}
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  // A resize moves every shelf's edge: each is measured again
  const onResize = () => {
    shiftsStale = true;
    schedule();
  };

  /*
   * Structure changes only (Steam re-renders a date card rather than editing its text), plus
   * covers scrolling into view (the IntersectionObserver) and resizes.
   */
  const onImageLoad = (event) => {
    const img = event.target;
    if (img?.tagName !== 'IMG' || !img.closest(COVER_BOX_SELECTOR)) return;
    // A shelf's first cover loading late can move its edge: measured again (rare, unlike the
    // covers a big shelf loads as it scrolls)
    const shelf = img.closest(SHELF_SELECTOR);
    if (shelf?.querySelector(COVER_BOX_SELECTOR)?.querySelector('img') === img) shiftsStale = true;
    schedule();
  };

  const start = () => {
    observer = SE.watch(schedule, { throttle: 100, ignore: SE.inSide });
    earlyObserver = SE.watch(applyKnownShifts, { sync: true, ignore: SE.inSide });
    addEventListener('resize', onResize);
    // A cover image that loads late can change the cover's size without any DOM change.
    document.addEventListener('load', onImageLoad, true);
    schedule();
  };

  window.__seHomePolish = {
    destroy() {
      observer?.disconnect();
      earlyObserver?.disconnect();
      io?.disconnect();
      onScreen.clear();
      listeners.abort();
      removeEventListener('resize', onResize);
      document.removeEventListener('load', onImageLoad, true);
      if (frame) cancelAnimationFrame(frame);

      for (const el of document.querySelectorAll('[data-se-repeat]')) {
        el.removeAttribute('data-se-repeat');
      }
      for (const el of document.querySelectorAll('[data-se-shifted]')) {
        el.style.removeProperty('--se-cover-shift');
        el.removeAttribute('data-se-shifted');
      }
      for (const el of document.querySelectorAll('[data-se-btnbox]')) {
        el.removeAttribute('data-se-btnbox');
      }
      for (const el of document.querySelectorAll('[data-se-cover-btn]')) {
        el.removeAttribute('data-se-cover-btn');
        el.removeAttribute('data-se-hot');
        el.removeAttribute('data-se-act');
        for (const prop of ['--se-cl', '--se-cb', '--se-cw']) {
          el.style.removeProperty(prop);
        }
      }
      removeEventListener('DOMContentLoaded', start);
      delete window.__seHomePolish;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
