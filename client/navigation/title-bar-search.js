/*
 * Navigation, part 1 of 4: the title bar's library search (its field, the view toggles' slot and
 * Filters). Parts share window.__seNavParts; client/navigation/nav-rail.js, listed last, runs
 * them (start / update / cleanup / destroy):
 * - title-bar-search.js  the search field, Filters and the view toggles' place
 * - title-bar.js         the game list's header (lockup, toggle, back to top), the list's edges,
 *                        the search's place, the avatar's status ring
 * - title-bar-tips.js    Steam's tips under title-bar controls, the game-type menu's counts
 * - nav-rail.js          routing, the rail's section menus, the update loop and the start
 */
((SE) => {
  const ns = (window.__seNavParts = {});
  const { C, railMode } = SE;

  const SEARCH_INPUT = `.${C.GameListHomeAndSearch_Container} .${C.ContainerHide_Container} input`;
  const FILTERS = `.${C.GameListHomeAndSearch_Container} .${C.AdvancedSearchButton}`;
  const FILTER_PANEL = `.${C.AdvancedSearchContainer} .${C.AdvancedSearchPane}`;
  const GAME_ROW = `.${C.GameListHomeAndSearch_Container} .Container:is(.Installed, .Uninstalled)`;

  const visibleFilterPanel = () => {
    const pane = document.querySelector(FILTER_PANEL);
    const box = pane?.closest(`.${C.AdvancedSearchPaneContainer}`);
    return box?.classList.contains('Visible') ? pane : null;
  };

  const dismissFilters = (pane) => {
    for (let fiber = SE.fiber(pane), depth = 0; fiber && depth < 20; fiber = fiber.return, depth++) {
      const instance = fiber.stateNode;
      if (typeof instance?.CloseAdvancedSearch === 'function') {
        instance.CloseAdvancedSearch();
        return;
      }
    }
    const box = pane.closest(`.${C.AdvancedSearchPaneContainer}`);
    box?.querySelector('.AdvancedSearchDismissalOverlay')?.click();
  };

  let searchBar;
  let searchInput;
  let filtersBtn;
  let viewsSlot;
  let viewsResizeObserver;
  let viewsWatchedNode = null;
  let viewsWidth = -1;
  let viewsX = null;

  /*
   * Runs `callback` once the library's list is mounted, navigating there first if needed.
   * One wait at a time: a later call replaces the pending callback (callbacks read live state
   * when they run), so fast typing neither re-navigates nor applies a stale value.
   */
  let mountWait = null;

  /*
   * Library search acts on the library, so on a Store or Community page it brings the library
   * forward first: its list stays mounted under the page, where results can't be seen. (Filters
   * there opens over the page instead, and comes here only when it can't.)
   */
  function whenLibraryMounted(callback) {
    if (SE.browserShown()) ns.navigateToLibraryRoute('/library/home');
    if (document.querySelector(SEARCH_INPUT)) {
      callback();
      return;
    }
    if (mountWait) {
      mountWait.callback = callback;
      return;
    }
    ns.navigateToLibraryRoute('/library/home');
    mountWait = { callback, attempts: 0, timer: 0 };
    const pollMount = () => {
      const wait = mountWait;
      if (!wait) return;
      if (document.querySelector(SEARCH_INPUT)) {
        mountWait = null;
        wait.callback();
      } else if (++wait.attempts < 60) {
        wait.timer = setTimeout(pollMount, 50);
      } else {
        mountWait = null;
      }
    };
    mountWait.timer = setTimeout(pollMount, 50);
  }

  function cancelMountWait() {
    if (mountWait) clearTimeout(mountWait.timer);
    mountWait = null;
  }

  // Title-bar library search and filter button
  const setNativeSearchValue = (value) => {
    const native = document.querySelector(SEARCH_INPUT);
    if (!native || native.value === value) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(native), 'value')?.set;
    if (setter) setter.call(native, value);
    else native.value = value;
    native.dispatchEvent(new Event('input', { bubbles: true }));
  };

  let lastPointerDownAt = 0;
  let filterWasOpenOnDown = null;

  const onPointerDown = (event) => {
    lastPointerDownAt = performance.now();
    filterWasOpenOnDown = filtersBtn?.contains(event.target) ? !!visibleFilterPanel() : null;
  };

  function buildSearchBar() {
    searchBar = document.createElement('div');
    searchBar.className = 'se-title-search';
    searchBar.setAttribute('role', 'search');
    // The views slot holds the view toggles' place: the native toggles are fixed over it.
    searchBar.innerHTML =
      '<span class="se-search-icon" aria-hidden="true"></span>' +
      '<input type="text" spellcheck="false" placeholder="Search your library" aria-label="Search your library">' +
      '<span class="se-title-views" aria-hidden="true"></span>' +
      // Filters: an icon tile like the view toggles beside it (duotone sliders, "Filters" its tip)
      '<button type="button" class="se-title-filters se-sidebar-tip" aria-label="Filters" aria-pressed="false">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M4 7h8.6M17.4 7H20M4 17h2.6M11.4 17H20"/>' +
          '<circle cx="15" cy="7" r="2.4" fill="currentColor" fill-opacity=".32"/>' +
          '<circle cx="9" cy="17" r="2.4" fill="currentColor" fill-opacity=".32"/>' +
        '</svg>' +
      '</button>';

    searchInput = searchBar.querySelector('input');
    filtersBtn = searchBar.querySelector('.se-title-filters');
    viewsSlot = searchBar.querySelector('.se-title-views');
    let lastTypedAt = 0;

    const retainSearchFocus = () => {
      if (document.activeElement === searchInput || !searchInput.isConnected) return;
      const caretPos = searchInput.value.length;
      searchInput.focus({ preventScroll: true });
      try {
        searchInput.setSelectionRange(caretPos, caretPos);
      } catch {}
    };

    searchInput.addEventListener('input', () => {
      const value = searchInput.value;
      lastTypedAt = performance.now();
      searchBar.classList.toggle('se-has-text', !!value);
      if (window.__seDownloads?.library) {
        cancelMountWait();
        window.__seDownloads.searchGames(value);
        return;
      }
      whenLibraryMounted(() => {
        setNativeSearchValue(searchInput.value);
        retainSearchFocus();
        requestAnimationFrame(retainSearchFocus);
        setTimeout(retainSearchFocus, 120);
      });
    });

    searchInput.addEventListener('blur', () => {
      if (performance.now() - lastTypedAt > 800 || performance.now() - lastPointerDownAt < 400) return;
      requestAnimationFrame(retainSearchFocus);
    });

    searchInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        searchInput.value = '';
        searchBar.classList.remove('se-has-text');
        const downloads = window.__seDownloads;
        if (downloads?.library) downloads.searchGames('');
        else setNativeSearchValue('');
        searchInput.blur();
      } else if (event.key === 'Enter') {
        const downloads = window.__seDownloads;
        if (downloads?.library) {
          if (downloads.openFirstGame()) searchInput.blur();
          return;
        }
        const firstRow = document.querySelector(GAME_ROW);
        if (firstRow) {
          firstRow.click();
          searchInput.blur();
        }
      }
    });

    for (const type of ['keyup', 'keypress']) {
      searchInput.addEventListener(type, (event) => event.stopPropagation());
    }

    filtersBtn.addEventListener('click', (event) => {
      const wasOpen = event.detail === 0 ? null : filterWasOpenOnDown;
      filterWasOpenOnDown = null;
      const library = () =>
        whenLibraryMounted(() => {
          const nativeBtn = document.querySelector(FILTERS);
          if (!nativeBtn) return;
          const pane = visibleFilterPanel();
          if (wasOpen || pane) {
            if (pane) dismissFilters(pane);
            return;
          }
          nativeBtn.click();
        });
      // Over a Store or Community page, Steam's panel is drawn above it (filters-panel.js).
      if (SE.browserShown() && SE.filtersPanel?.toggle(library)) return;
      library();
    });
  }

  function ensureSearchBar() {
    const topBar = document.querySelector(`.${C.TopBar}`);
    if (!topBar) return;
    if (!searchBar) buildSearchBar();
    if (searchBar.parentElement !== topBar) topBar.appendChild(searchBar);

    const downloads = window.__seDownloads;
    filtersBtn.hidden = Boolean(downloads?.library);
    const native = downloads?.library?.querySelector('input') || document.querySelector(SEARCH_INPUT);
    if (native && document.activeElement !== searchInput && native.value !== searchInput.value) {
      searchInput.value = native.value;
      searchBar.classList.toggle('se-has-text', !!native.value);
    }
    SE.mark(filtersBtn, 'aria-pressed', String(Boolean(visibleFilterPanel() || SE.filtersPanel?.open)));
  }

  function onGlobalKeyDown(event) {
    if (!railMode() || !searchBar) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }

  /*
   * The view toggles (Recent, Ready to play, then Steam's Linux toggle and plugin toggles) sit
   * fixed inside the title-bar search, just before Filters. The field
   * reserves the group's measured width in its views slot; the group then takes the slot's
   * place (--se-title-views-x on <body>). Each value is written only when it changes.
   */
  // `measure`: the title bar's geometry may have moved (client/navigation/title-bar.js); else
  // the last reads stand unless the group itself changed
  function syncSearchViews(group, measure = true) {
    if (!searchBar) return;
    if (!measure && group === viewsWatchedNode) return;
    if (group !== viewsWatchedNode && window.ResizeObserver) {
      viewsResizeObserver ??= new ResizeObserver(() => ns.titleBar.markGeometry());
      if (viewsWatchedNode) viewsResizeObserver.unobserve(viewsWatchedNode);
      if (group) viewsResizeObserver.observe(group);
      viewsWatchedNode = group;
    }
    const width = group ? Math.ceil(group.getBoundingClientRect().width) : 0;
    if (width !== viewsWidth) {
      viewsWidth = width;
      searchBar.classList.toggle('se-has-views', width > 0);
      SE.cssVar(searchBar, '--se-title-views-w', width > 0 ? `${width}px` : null);
    }
    const x = width > 0 && searchBar.isConnected
      ? `${Math.round(viewsSlot.getBoundingClientRect().left)}px`
      : null;
    if (x === viewsX) return;
    viewsX = x;
    SE.cssVar(document.body, '--se-title-views-x', x);
  }

  function cleanup() {
    syncSearchViews(null);
    searchBar?.remove();
  }

  ns.search = {
    ensure: ensureSearchBar,
    syncViews: syncSearchViews,
    cleanup,
    start() {
      addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onGlobalKeyDown, true);
    },
    destroy() {
      cancelMountWait();
      viewsResizeObserver?.disconnect();
      removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onGlobalKeyDown, true);
      cleanup();
    },
  };
})(window.__se);
