/* Library Home layout alignments: deduplicate date headers, align shelf edges, and measure cover action buttons. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedHomePolish?.destroy();

  const NEWS_SELECTOR = `.${C.UpdatesContainer}`;
  const DATE_SELECTOR = `.${C.NewUpdates_EventTime}, .${C.BasicHomeUpdates_EventTime}`;
  const SHELF_SELECTOR = `.${C.Showcase}`;
  const COVERS_CONTAINER_SELECTOR = `.${C.ChildrenContainer}`;
  const COVER_BOX_SELECTOR = `.${C.LibraryItemBox}`;
  const ACTION_BTN_SELECTOR = `.${C.LibraryItemActionButton}`;
  const UNINSTALLED_ICON_SELECTOR = `.${C.UninstalledIcon}:not(.${C.ComingSoonIcon})`;
  const WIDE_CAPSULE_SELECTOR = `.${C.FeaturedCapsule}`;
  const LANDSCAPE_CLS = C.Landscape;

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

  const offsetLeftFromRoot = el => {
    let x = 0;
    for (let cur = el; cur; cur = cur.offsetParent) {
      x += cur.offsetLeft + (cur.clientLeft || 0);
    }
    return x;
  };

  // Batch geometry reads across all shelves before applying style mutations to avoid layout thrashing.
  const alignShelfCoverEdges = () => {
    const measurements = [];
    for (const shelf of document.querySelectorAll(SHELF_SELECTOR)) {
      const box = shelf.querySelector(COVER_BOX_SELECTOR);
      const firstCover = (box && box.querySelector('img')) || box || shelf.querySelector('img');
      if (!firstCover) continue;

      const coversContainer = shelf.querySelector(COVERS_CONTAINER_SELECTOR)?.contains(firstCover)
        ? shelf.querySelector(COVERS_CONTAINER_SELECTOR)
        : [...shelf.children].find(c => c.contains(firstCover));
      if (!coversContainer) continue;

      const appliedShift = parseFloat(coversContainer.style.getPropertyValue('--se-cover-shift')) || 0;
      const shelfPaddingLeft = parseFloat(getComputedStyle(shelf).paddingLeft) || 0;
      const strayGap = offsetLeftFromRoot(firstCover) - offsetLeftFromRoot(shelf) - shelfPaddingLeft;
      const targetShift = Math.round(appliedShift + strayGap);
      measurements.push([
        coversContainer,
        appliedShift,
        targetShift > 0 && targetShift <= 24 ? targetShift : 0,
      ]);
    }

    for (const [container, appliedShift, targetShift] of measurements) {
      if (targetShift !== appliedShift) {
        if (targetShift) container.style.setProperty('--se-cover-shift', `${targetShift}px`);
        else container.style.removeProperty('--se-cover-shift');
      }
      if (container.hasAttribute('data-se-shifted') !== !!targetShift) {
        container.toggleAttribute('data-se-shifted', !!targetShift);
      }
    }
  };

  const boundItems = new WeakSet();

  const findCoverContext = btn => {
    let el = btn.parentElement;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      const cover = el.querySelector(COVER_BOX_SELECTOR);
      if (cover) return { cover, item: el };
    }
    return null;
  };

  // Two-pass read/write measurement for cover Play / Install / Update action overlays.
  const measureCoverActionButtons = () => {
    const plan = [];
    for (const btn of document.querySelectorAll(`${ACTION_BTN_SELECTOR}, ${UNINSTALLED_ICON_SELECTOR}`)) {
      if (btn.closest(WIDE_CAPSULE_SELECTOR)) continue;
      const isUninstalledIcon = btn.matches(UNINSTALLED_ICON_SELECTOR);
      const directCover = isUninstalledIcon && btn.closest(COVER_BOX_SELECTOR);
      const context = directCover ? { cover: directCover, item: directCover } : findCoverContext(btn);
      if (!context || context.cover.classList.contains(LANDSCAPE_CLS)) continue;

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

    const CSS_VARS = ['--se-cl', '--se-cb', '--se-cw'];
    for (const { btn, isUninstalledIcon, context, coords } of plan) {
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

      for (let parent = btn.parentElement; parent && parent !== context.item; parent = parent.parentElement) {
        SE.mark(parent, 'data-se-btnbox');
      }

      if (isUninstalledIcon && !boundItems.has(context.item)) {
        context.item.addEventListener(
          'click',
          event => {
            const icon = context.item.querySelector('[data-se-cover-btn]');
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
          true
        );
      }

      if (!boundItems.has(context.item)) {
        boundItems.add(context.item);
        context.item.addEventListener('pointerenter', () =>
          context.item.querySelector('[data-se-cover-btn]')?.setAttribute('data-se-hot', '')
        );
        context.item.addEventListener('pointerleave', () =>
          context.item.querySelector('[data-se-cover-btn]')?.removeAttribute('data-se-hot')
        );
      }
    }
  };

  let frame = 0;
  let observer;
  let timer;

  const update = () => {
    frame = 0;
    try {
      deduplicateEventDates();
      alignShelfCoverEdges();
      measureCoverActionButtons();
    } catch (_) {}
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const start = () => {
    observer = SE.watch(schedule, {
      characterData: true,
      throttle: 100,
      ignore: SE.inside(SE.SIDE),
    });
    addEventListener('resize', schedule);
    timer = SE.poll(schedule, 2000, {
      active: () => SE.visible(`.LibraryHome, .${C.LibraryItemBox}`),
    });
    schedule();
  };

  window.__steamEnhancedHomePolish = {
    destroy() {
      observer?.disconnect();
      timer?.disconnect();
      removeEventListener('resize', schedule);
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
      delete window.__steamEnhancedHomePolish;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
