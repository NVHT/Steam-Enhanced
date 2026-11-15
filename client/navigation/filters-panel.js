/*
 * The Library Filters panel over a Store or Community page. Steam's own panel lives in the
 * library, under the page's browser view, where it can't be seen; so the Filters button there
 * opens Steam's filter component (the one inside its panel, given the same props: the library's
 * filter and its change handler) rendered by the theme in a popup-layer panel
 * (core/popup-layer.js), under the title-bar search like the library's. Filters set here apply
 * to the library as if set in Steam's own panel. client/navigation/nav-rail.css styles both.
 */
((SE) => {
  const { C } = SE;
  SE.filtersPanel?.destroy?.();

  const layer = SE.layer;
  const PANE = `.${C.AdvancedSearchContainer} .${C.AdvancedSearchPane}`;
  const SEARCH = '.se-title-search';
  const BUTTON = '.se-title-filters';

  let panel = null;
  let pane = null;
  let shown = null; // the filter the pane was rendered for
  let unmount = null;
  let watcher = null;
  let giveUp = 0;

  // Steam's filter component and its current props: the only child of its panel's pane.
  function steamFilters() {
    const node = document.querySelector(PANE);
    const child = SE.fiber(node)?.child;
    const props = child?.memoizedProps;
    return typeof child?.type === 'function' && props?.appFilter ? { Component: child.type, props, node } : null;
  }

  function unrender() {
    unmount?.();
    unmount = null;
    shown = null;
  }

  /*
   * Rendered with the props Steam gives it. The component follows its filter itself; it is
   * rendered again only when Steam hands it another (a search starting makes the panel's filter
   * the library's). The accessibility section's toggle lays out the pane as Steam's does.
   */
  function render() {
    const found = steamFilters();
    if (!found || !pane) return false;
    const { Component, props, node } = found;
    if (unmount && props.appFilter === shown) return true;
    const build = layer.react(Component, {
      ...props,
      fnOnChange() {
        props.fnOnChange?.();
        requestAnimationFrame(render);
      },
      fnOnShowAccessibilityChange(on) {
        props.fnOnShowAccessibilityChange?.(on);
        pane?.setAttribute('data-show-accessibility', String(on));
      },
    }, node);
    if (!build) return false;
    unrender();
    unmount = build(pane);
    shown = props.appFilter;
    // React drops a tree that failed to render: an empty pane is a failure.
    return pane.childElementCount > 0;
  }

  function close() {
    clearTimeout(giveUp);
    giveUp = 0;
    if (!panel) return;
    const current = panel;
    panel = null;
    pane = null;
    current.release();
    unrender();
    watcher?.disconnect();
    watcher = null;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    SE.mark(document.querySelector(BUTTON), 'aria-pressed', 'false');
  }

  /*
   * Opened under the title-bar search; false when it can't be. `fallback` runs if Steam's
   * component then fails to render (its window can be ready only after this returns).
   */
  function open(fallback) {
    const search = document.querySelector(SEARCH);
    if (!layer || !search || !steamFilters()) return false;
    panel = layer.panel({ sheets: ['client/navigation/nav-rail.css'], steam: true });
    if (!panel) return false;
    const box = search.getBoundingClientRect();
    const top = box.bottom + SE.px('--se-space-2');
    const watched = panel;
    // Built when the panel's window is ready, which can be after this returns.
    panel.show({ left: box.left, top }, (container) => {
      pane = container.ownerDocument.createElement('div');
      pane.className = `${C.AdvancedSearchPane} se-filters-panel`;
      pane.setAttribute('data-show-accessibility', 'false');
      SE.cssVar(pane, '--se-filters-w', `${box.width}px`);
      SE.cssVar(pane, '--se-filters-max-h', `${innerHeight - top - SE.px('--se-space-4')}px`);
      container.append(pane);
      if (!SE.run(render)) {
        queueMicrotask(() => {
          close();
          fallback?.();
        });
      }
      return unrender;
    });
    // A panel whose window never came (core/popup-layer.js gives up on it) falls back.
    giveUp = setTimeout(() => {
      giveUp = 0;
      if (panel === watched && (watched.released || !pane)) {
        close();
        fallback?.();
      }
    }, layer.giveUpMs);
    // Gone with the page under it or its window, a click elsewhere in the window, or Escape.
    watcher = SE.watch(() => (panel && !panel.released && SE.browserShown()) || close(), { throttle: 100 });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    SE.mark(document.querySelector(BUTTON), 'aria-pressed', 'true');
    return true;
  }

  function onPointerDown(event) {
    if (!event.target.closest?.(BUTTON)) close();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }

  SE.filtersPanel = {
    // Opens or closes it; false when it can't open here.
    toggle(fallback) {
      const wasOpen = Boolean(panel && !panel.released);
      close();
      return wasOpen || open(fallback);
    },
    get open() {
      return Boolean(panel && !panel.released);
    },
    destroy() {
      close();
      delete SE.filtersPanel;
    },
  };
})(window.__se);
