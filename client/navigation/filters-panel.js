/*
 * The Library Filters panel over a Store or Community page. Steam's own panel lives in the
 * library, under the page's browser view, where it can't be seen; so the Filters button there
 * opens Steam's filter component (the one inside its panel, given the same props: the library's
 * filter and its change handler) rendered by the theme in a popup-layer panel
 * (client/shared/popup-layer.js), under the title-bar search like the library's. Filters set here apply
 * to the library as if set in Steam's own panel. Both panels get a Clear button in their header.
 * client/navigation/filters-panel.css styles both.
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

  /* ---------- Clear: every filter off, from the header (both panels) ---------- */

  // How many options are on: every group's chosen ones (the search text isn't one).
  const activeCount = (filter) =>
    SE.run(() => filter.m_filterSpec.filterGroups.reduce((n, group) => n + (group.rgOptions?.length || 0), 0)) || 0;

  // A Clear button's pane and the props it was last synced with (the handler reads them).
  const clears = new WeakMap();

  // Steam's own reset (its gamepad panel's Reset): the filter's, then its change handler.
  function onClear(event) {
    const entry = clears.get(event.currentTarget);
    if (!entry) return;
    SE.run(() => entry.props.appFilter.Reset());
    entry.props.fnOnChange?.();
    requestAnimationFrame(() => syncClear(entry.pane, entry.props));
  }

  /*
   * Clear at the end of Steam's header (text only: React leaves a child of ours there), with how
   * many options are on; hidden when none. Writes only what changed: the library's is synced
   * from a watcher on the pane, which its own writes would wake again.
   */
  function syncClear(paneEl, props) {
    const header = paneEl?.querySelector('.DialogHeader');
    if (!header || !props?.appFilter) return;
    let button = header.querySelector('.se-filters-clear');
    if (!button) {
      const doc = header.ownerDocument;
      button = doc.createElement('button');
      button.type = 'button';
      button.className = 'se-filters-clear';
      button.append(doc.createTextNode('Clear'), Object.assign(doc.createElement('span'), { className: 'se-filters-clear-count' }));
      button.addEventListener('click', onClear);
      header.append(button);
    }
    clears.set(button, { pane: paneEl, props });
    const count = activeCount(props.appFilter);
    const text = String(count);
    const label = `Clear ${count} ${count === 1 ? 'filter' : 'filters'}`;
    const countEl = button.lastElementChild;
    if (countEl.textContent !== text) countEl.textContent = text;
    if (button.hidden !== !count) button.hidden = !count;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  }

  /*
   * The library's own panel: synced when its markup changes (a section opening, a dropdown's
   * choice) and after a press or key inside it (a tick changes only a class, which the watcher
   * doesn't follow), once per frame.
   */
  let libraryFrame = 0;
  function syncLibrary() {
    libraryFrame = 0;
    const found = steamFilters();
    if (found) syncClear(found.node, found.props);
  }
  const scheduleLibrary = () => {
    libraryFrame ||= requestAnimationFrame(syncLibrary);
  };
  const onLibraryInput = (event) => {
    if (event.target.closest?.(PANE)) scheduleLibrary();
  };
  const libraryWatcher = SE.watch(scheduleLibrary, { scope: PANE, throttle: 100 });
  document.addEventListener('pointerup', onLibraryInput, true);
  document.addEventListener('keyup', onLibraryInput, true);
  scheduleLibrary();

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
    if (unmount && props.appFilter === shown) {
      syncClear(pane, props);
      return true;
    }
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
    syncClear(pane, props);
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
    panel = layer.panel({
      sheets: ['client/dialogs/dialogs.css', 'client/navigation/filters-panel.css'],
      steam: true,
    });
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
    // A panel whose window never came (client/shared/popup-layer.js gives up on it) falls back.
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
      libraryWatcher.disconnect();
      cancelAnimationFrame(libraryFrame);
      document.removeEventListener('pointerup', onLibraryInput, true);
      document.removeEventListener('keyup', onLibraryInput, true);
      document.querySelector(`${PANE} .se-filters-clear`)?.remove();
      delete SE.filtersPanel;
    },
  };
})(window.__se);
