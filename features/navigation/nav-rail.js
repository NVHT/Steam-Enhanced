/* Navigation rail routing, extra rail shortcuts, title-bar library search, and game-list toggle. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C, railMode, mainWindow, navigate: goLibrary } = SE;
  window.__steamEnhancedRailNav?.destroy?.();

  const SEARCH_INPUT = `.${C.GameListHomeAndSearch_Container} .${C.ContainerHide_Container} input`;
  const FILTERS = `.${C.GameListHomeAndSearch_Container} .${C.AdvancedSearchButton}`;
  const FILTER_PANEL = `.${C.AdvancedSearchContainer} .${C.AdvancedSearchPane}`;
  const SELECTED = C.Selected;
  const GAME_ROW = `.${C.GameListHomeAndSearch_Container} .Container:is(.Installed, .Uninstalled)`;
  /* Virtualized rows and collection headers: their hover/selection churn never matters here */
  const LIST_ROWS = SE.inside(`.${C.AppIconDownloading_Container}, .${C.HoverOverlay_Container}`);

  const visibleFilterPanel = () => {
    const pane = document.querySelector(FILTER_PANEL);
    const box = pane?.closest(`.${C.AdvancedSearchPaneContainer}`);
    return box?.classList.contains('Visible') ? pane : null;
  };

  const dismissFilters = pane => {
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

  let observer;
  let timer;
  let frame = 0;
  let searchBar;
  let searchInput;
  let filtersBtn;
  let listResizeObserver;
  let listWatchedNode;
  let lastPollSignature = '';

  const patchedMenus = new Map();
  const navNodes = new Map();
  const extraNodes = new Map();

  const NAV_ITEMS = {
    store: {
      click: null,
      extras: [
        {
          key: 'wishlist',
          label: 'Wishlist',
          url: 'https://store.steampowered.com/wishlist/',
          match: /store\.steampowered\.com\/wishlist/,
        },
      ],
    },
    library: {
      click: { route: '/library/home' },
      extras: [
        {
          key: 'collections',
          label: 'Collections',
          route: '/library/collections',
          routeMatch: /^\/library\/collection/,
        },
      ],
    },
    community: {
      click: { url: 'https://steamcommunity.com/discussions/' },
      extras: [
        {
          key: 'market',
          label: 'Market',
          url: 'https://steamcommunity.com/market/',
          match: /steamcommunity\.com\/market/,
        },
      ],
    },
    profile: {
      click: null,
      extras: [
        {
          key: 'activity',
          label: 'Activity',
          url: 'https://steamcommunity.com/my/home/',
          match: /steamcommunity\.com\/(?:id|profiles|my)\/[^/]+\/home|steamcommunity\.com\/my\/home/,
        },
        {
          key: 'inventory',
          label: 'Inventory',
          url: 'https://steamcommunity.com/my/inventory/',
          match: /steamcommunity\.com\/(?:id|profiles)\/[^/]+\/inventory|steamcommunity\.com\/my\/inventory/,
        },
      ],
    },
  };

  function currentRoutePath() {
    try {
      return mainWindow()?.LocationPathName || '';
    } catch (_) {
      return '';
    }
  }

  const browserManager = () => SE.global('MainWindowBrowserManager');

  function currentBrowserURL() {
    const manager = browserManager();
    try {
      return manager?.m_URLRequested || manager?.m_URL || '';
    } catch (_) {
      return '';
    }
  }

  function openExternalURL(url) {
    const manager = browserManager();
    try {
      if (manager && typeof manager.ShowURL === 'function') {
        manager.ShowURL(url);
        return;
      }
    } catch (_) {}
    try {
      window.SteamClient.URL.ExecuteSteamURL(`steam://openurl/${url}`);
    } catch (_) {}
  }

  function navigateToLibraryRoute(route) {
    if (goLibrary(route)) return true;
    try {
      window.SteamClient?.URL?.ExecuteSteamURL('steam://nav/library');
    } catch (_) {}
    return false;
  }

  function activateTarget(target) {
    if (target.route) navigateToLibraryRoute(target.route);
    else if (target.url) openExternalURL(target.url);
  }

  /*
   * Runs `callback` once the library's list is mounted, navigating there first if needed.
   * One wait at a time: a later call replaces the pending callback (callbacks read live state
   * when they run), so fast typing neither re-navigates nor applies a stale value.
   */
  let mountWait = null;

  function whenLibraryMounted(callback) {
    if (document.querySelector(SEARCH_INPUT)) {
      callback();
      return;
    }
    if (mountWait) {
      mountWait.callback = callback;
      return;
    }
    navigateToLibraryRoute('/library/home');
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

  function findRetainedPopupMenu(fiber) {
    for (let hook = fiber?.memoizedState; hook; hook = hook.next) {
      const value = hook.memoizedState?.current;
      if (value?.Show && value?.Hide && 'ReactElement' in value) return value;
    }
    return undefined;
  }

  function suppressSuperNavDropdown(node) {
    for (let fiber = SE.fiber(node), depth = 0; fiber && depth < 15; fiber = fiber.return, depth++) {
      if (!fiber.memoizedProps?.bSuperNavBehavior) continue;
      const menu = findRetainedPopupMenu(fiber) || fiber.memoizedProps?.refPopupMenu?.current;
      if (!menu || patchedMenus.has(menu)) return;

      const own = Object.getOwnPropertyDescriptor(menu, 'Show');
      const original = menu.Show;
      const show = function (...args) {
        if (railMode()) return undefined;
        return original.apply(this, args);
      };
      menu.Show = show;
      patchedMenus.set(menu, { own, show });
      return;
    }
  }

  function onNavClick(event) {
    if (!railMode()) return;
    const key = event.currentTarget.getAttribute('data-se-icon');
    const target = NAV_ITEMS[key]?.click;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    activateTarget(target);
  }

  function buildExtraRailButton(extra) {
    const wrap = document.createElement('div');
    wrap.className = 'se-rail-extra';
    wrap.setAttribute('data-se-extra', extra.key);

    const button = document.createElement('div');
    button.className = `${C.Button} se-native-header-button se-menu-icon`;
    button.setAttribute('data-se-icon', extra.key);
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.setAttribute('aria-label', extra.label);
    button.appendChild(document.createElement('span'));
    button.addEventListener('click', () => activateTarget(extra));
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateTarget(extra);
      }
    });
    wrap.appendChild(button);
    return wrap;
  }

  function bindNavItems() {
    for (const [key, config] of Object.entries(NAV_ITEMS)) {
      const node = document.querySelector(`.${C.SuperNavBar} .se-menu-icon[data-se-icon="${key}"]`);
      const prev = navNodes.get(key);
      if (node !== prev) {
        prev?.removeEventListener('click', onNavClick, true);
        if (node) {
          node.addEventListener('click', onNavClick, true);
          navNodes.set(key, node);
        } else {
          navNodes.delete(key);
        }
      }
      if (!node) {
        for (const extra of config.extras) extraNodes.get(extra.key)?.remove();
        continue;
      }
      suppressSuperNavDropdown(node);
      let anchor = node.closest(`.${C.SuperNavMenu}`);
      if (!anchor?.parentElement) continue;
      for (const extra of config.extras) {
        let wrap = extraNodes.get(extra.key);
        if (!wrap) {
          wrap = buildExtraRailButton(extra);
          extraNodes.set(extra.key, wrap);
        }
        if (wrap.previousElementSibling !== anchor) anchor.after(wrap);
        anchor = wrap;
      }
    }
  }

  // Title-bar library search and filter button
  const setNativeSearchValue = value => {
    const native = document.querySelector(SEARCH_INPUT);
    if (!native || native.value === value) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(native), 'value')?.set;
    if (setter) setter.call(native, value);
    else native.value = value;
    native.dispatchEvent(new Event('input', { bubbles: true }));
  };

  let lastPointerDownAt = 0;
  let filterWasOpenOnDown = null;

  const onPointerDown = event => {
    lastPointerDownAt = performance.now();
    filterWasOpenOnDown = filtersBtn?.contains(event.target) ? !!visibleFilterPanel() : null;
  };
  addEventListener('pointerdown', onPointerDown, true);

  function buildSearchBar() {
    searchBar = document.createElement('div');
    searchBar.className = 'se-title-search';
    searchBar.setAttribute('role', 'search');
    searchBar.innerHTML =
      '<svg class="se-title-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
      '<input type="text" spellcheck="false" placeholder="Search your library" aria-label="Search your library">' +
      '<button type="button" class="se-title-filters" aria-pressed="false">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>' +
        'Filters' +
      '</button>';

    searchInput = searchBar.querySelector('input');
    filtersBtn = searchBar.querySelector('.se-title-filters');
    let lastTypedAt = 0;

    const retainSearchFocus = () => {
      if (document.activeElement === searchInput || !searchInput.isConnected) return;
      const caretPos = searchInput.value.length;
      searchInput.focus({ preventScroll: true });
      try {
        searchInput.setSelectionRange(caretPos, caretPos);
      } catch (_) {}
    };

    searchInput.addEventListener('input', () => {
      const value = searchInput.value;
      lastTypedAt = performance.now();
      searchBar.classList.toggle('se-has-text', !!value);
      if (window.__steamEnhancedDownloads?.library) {
        cancelMountWait();
        window.__steamEnhancedDownloads.searchGames(value);
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

    searchInput.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        searchInput.value = '';
        searchBar.classList.remove('se-has-text');
        const downloads = window.__steamEnhancedDownloads;
        if (downloads?.library) downloads.searchGames('');
        else setNativeSearchValue('');
        searchInput.blur();
      } else if (event.key === 'Enter') {
        const downloads = window.__steamEnhancedDownloads;
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
      searchInput.addEventListener(type, event => event.stopPropagation());
    }

    filtersBtn.addEventListener('click', event => {
      const wasOpen = event.detail === 0 ? null : filterWasOpenOnDown;
      filterWasOpenOnDown = null;
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
    });
  }

  function ensureSearchBar() {
    const topBar = document.querySelector(`.${C.TopBar}`);
    if (!topBar) return;
    if (!searchBar) buildSearchBar();
    if (searchBar.parentElement !== topBar) topBar.appendChild(searchBar);

    const downloads = window.__steamEnhancedDownloads;
    filtersBtn.hidden = Boolean(downloads?.library);
    const native = downloads?.library?.querySelector('input') || document.querySelector(SEARCH_INPUT);
    if (native && document.activeElement !== searchInput && native.value !== searchInput.value) {
      searchInput.value = native.value;
      searchBar.classList.toggle('se-has-text', !!native.value);
    }
    SE.mark(filtersBtn, 'aria-pressed', String(!!visibleFilterPanel()));
  }

  function onGlobalKeyDown(event) {
    if (!railMode() || !searchBar) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }

  // Game list header metrics and collapse toggle
  const LIST_SELECTOR = `.${C.GameListHomeAndSearch_Container}`;
  const HIDE_KEY = 'se-list-hidden';
  const VIEW_COUNT_KEY = 'se-view-count';
  /* The game-type menu's last total, mirrored to storage for the next start */
  let lastViewCount = null;

  let listToggleBtn;
  // Scroll-to-top tile beside Recent / Ready to play; shown once the game list is scrolled.
  const TOP_THRESHOLD = 120;
  let topBtn;
  let topScroller = null;
  /* Until measured: the rail's width, plus the fixed list width (--se-list-w) */
  let listLeft = 60;
  let listRight = 410;

  /* Read once; updates go to memory and storage together */
  let listHidden = (() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch (_) {
      return false;
    }
  })();

  const isListHidden = () => listHidden;

  const setListHidden = hidden => {
    listHidden = hidden;
    try {
      localStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
    } catch (_) {}
  };

  // The list's width is fixed in CSS (--se-list-w, shared/tokens.css); only its edges are tracked.
  const setTopVisible = on => topBtn?.toggleAttribute('data-se-on', !!on);

  // Scroll doesn't bubble, so this listens in the capture phase and takes whichever
  // tall scroller inside the list fired: no hashed class to chase for the virtual list.
  const onListScroll = event => {
    const el = event.target;
    if (!(el instanceof Element) || el.clientHeight < 200 || !el.closest(LIST_SELECTOR)) return;
    topScroller = el;
    setTopVisible(el.scrollTop > TOP_THRESHOLD);
  };

  const applyListEdgeVars = () => {
    for (const el of [listToggleBtn, topBtn, document.querySelector('.se-sidebar-icons')]) {
      SE.cssVar(el, '--se-list-left', `${listLeft}px`);
      SE.cssVar(el, '--se-list-right', `${listRight}px`);
    }
  };

  let countCache = { at: 0, count: null };

  function totalLibraryGameCount() {
    if (Date.now() - countCache.at < 5000) return countCache.count;
    const apps = SE.global('appStore', store => Array.isArray(store.allApps))?.allApps;
    const collections = SE.global('collectionStore');
    const isHidden = id => !!SE.run(() => collections.BIsHidden(id));
    const count = apps
      ? apps.filter(
          app =>
            (app.app_type === 1 || app.app_type === 1073741824) &&
            app.visible_in_game_list !== false &&
            !isHidden(app.appid)
        ).length
      : null;
    countCache = { at: Date.now(), count };
    return count;
  }

  const resolveSelfPersona = () =>
    SE.global('g_FriendsUIApp')?.FriendStore?.self?.persona || SE.global('friendStore')?.self?.persona || null;

  function syncAccountStatus() {
    const account = document.querySelector(`.${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`);
    if (!account) return;
    const persona = resolveSelfPersona();
    let status = '';
    if (persona) {
      status = persona.is_ingame
        ? 'ingame'
        : persona.is_online
          ? persona.is_awayOrSnooze
            ? 'away'
            : 'online'
          : 'offline';
    } else if (account.classList.contains('ingame')) {
      status = 'ingame';
    } else if (account.classList.contains('online')) {
      status = 'online';
    }
    SE.attr(account, 'data-se-status', status || null);
  }

  function syncGameList() {
    const hidden = isListHidden();
    document.body.classList.toggle('se-list-hidden', hidden);

    const downloadsList = window.__steamEnhancedDownloads?.library;
    const list = downloadsList || document.querySelector(LIST_SELECTOR);
    if (list !== listWatchedNode && window.ResizeObserver) {
      listResizeObserver ??= new ResizeObserver(schedule);
      if (listWatchedNode) listResizeObserver.unobserve(listWatchedNode);
      if (list) listResizeObserver.observe(list);
      listWatchedNode = list;
    }

    const rect = list && !hidden ? list.getBoundingClientRect() : null;
    const isVisible = !!rect && rect.width > 0 && rect.height > 0;
    if (isVisible) {
      listLeft = Math.round(rect.left);
      listRight = Math.round(rect.right);
    }

    SE.cssVar(document.body, '--se-list-left', null);
    SE.cssVar(document.body, '--se-list-right', null);
    if (isVisible !== document.body.hasAttribute('data-se-list')) {
      document.body.toggleAttribute('data-se-list', isVisible);
    }

    const picker = list?.querySelector(`.${C.MenuHeader}`);
    if (picker) {
      const rawDigits =
        picker.querySelector(`.${C.AppCount}`)?.textContent.replace(/[^\d]/g, '') || '';
      let count = rawDigits ? Number(rawDigits) : null;
      const viewLabel = (
        picker.querySelector(`.${C.ViewName}`)?.textContent ||
        picker.textContent ||
        ''
      )
        .trim()
        .toLowerCase();

      if (count === null && lastViewCount === null) {
        try {
          const cached = localStorage.getItem(VIEW_COUNT_KEY);
          if (cached) lastViewCount = Number(cached);
        } catch (_) {}
      }
      if (count === null) count = lastViewCount;
      if (count === null && /^(all )?games$/.test(viewLabel)) {
        count = totalLibraryGameCount();
      }
      SE.attr(picker, 'data-se-count', count === null ? null : count.toLocaleString('en'));
    }

    const onLibraryRoute = /^\/library/.test(currentRoutePath()) || !!list;
    if (!listToggleBtn) {
      listToggleBtn = document.createElement('button');
      listToggleBtn.type = 'button';
      listToggleBtn.className = 'se-list-toggle se-sidebar-tip';
      listToggleBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/></svg>';
      listToggleBtn.addEventListener('click', () => {
        setListHidden(!isListHidden());
        schedule();
      });
    }

    const topBar = document.querySelector(`.${C.TopBar}`);
    if (topBar && onLibraryRoute) {
      if (listToggleBtn.parentElement !== topBar) topBar.appendChild(listToggleBtn);
    } else {
      listToggleBtn.remove();
    }

    if (!topBtn) {
      topBtn = document.createElement('button');
      topBtn.type = 'button';
      topBtn.className = 'se-list-top se-sidebar-tip';
      topBtn.setAttribute('aria-label', 'Scroll to top');
      topBtn.addEventListener('click', () => {
        const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        topScroller?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      });
    }

    if (topBar && onLibraryRoute && isVisible) {
      if (topBtn.parentElement !== topBar) topBar.appendChild(topBtn);
      if (!topScroller?.isConnected) topScroller = null;
      setTopVisible(topScroller && topScroller.scrollTop > TOP_THRESHOLD);
    } else {
      topBtn.remove();
      setTopVisible(false);
    }

    SE.mark(listToggleBtn, 'aria-label', hidden ? 'Show game list' : 'Hide game list');
    SE.mark(listToggleBtn, 'aria-pressed', String(hidden));
    applyListEdgeVars();
  }

  // Reposition native tooltips beneath title-bar controls
  const TOOLTIP_SELECTOR = `.${C.ToolTipCustom}, .${C.TextToolTip}`;
  let hoveredElement = null;
  let tipObserver;

  const titleBarBottom = () =>
    document.querySelector(`.${C.TopBar}`)?.getBoundingClientRect().bottom || 48;

  function onMouseOver(event) {
    hoveredElement = event.target instanceof Element ? event.target : null;
  }

  const resolveTitleBarControl = el => {
    if (!el?.isConnected) return null;
    const rect = el.getBoundingClientRect();
    return rect.top < titleBarBottom() - 2 &&
      rect.bottom > 0 &&
      rect.height <= 64 &&
      rect.width <= 480
      ? el
      : null;
  };

  function positionTitleBarTooltip(tip) {
    if (!railMode()) return;
    const hovered = resolveTitleBarControl(hoveredElement);
    if (!hovered) return;

    const anchor =
      hovered.closest(
        `.${C.CheckboxWithImage}, .${C.MenuHeader}, .se-list-toggle, .se-list-top, .se-title-search, [role=button], button`
      ) || hovered;

    let container = null;
    for (let node = tip; node && node !== document.body; node = node.parentElement) {
      if (node.contains(anchor)) break;
      const pos = getComputedStyle(node).position;
      if ((pos === 'absolute' || pos === 'fixed') && node.getBoundingClientRect().width > 0) {
        container = node;
        break;
      }
    }
    if (!container) {
      container = tip;
      container.style.setProperty('position', 'fixed', 'important');
      container.style.setProperty('z-index', 'var(--se-z-popover, 1000)', 'important');
    }

    const anchorRect = anchor.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    if (!boxRect.width || boxRect.width > 480 || boxRect.height > 320 || anchorRect.height > 64) {
      return;
    }

    const desired = {
      left: Math.round(
        Math.max(
          8,
          Math.min(
            innerWidth - boxRect.width - 8,
            anchorRect.left + anchorRect.width / 2 - boxRect.width / 2
          )
        )
      ),
      top: Math.round(anchorRect.bottom + 6),
    };

    if (Math.abs(boxRect.top - desired.top) < 1 && Math.abs(boxRect.left - desired.left) < 1) {
      return;
    }

    for (const [prop, val] of [
      ['bottom', 'auto'],
      ['right', 'auto'],
      ['transform', 'none'],
      ['margin', '0'],
    ]) {
      container.style.setProperty(prop, val, 'important');
    }

    let left = desired.left;
    let top = desired.top;
    for (let pass = 0; pass < 2; pass++) {
      container.style.setProperty('left', `${left}px`, 'important');
      container.style.setProperty('top', `${top}px`, 'important');
      const currentRect = container.getBoundingClientRect();
      const dx = desired.left - currentRect.left;
      const dy = desired.top - currentRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
      left += Math.round(dx);
      top += Math.round(dy);
    }
  }

  function inspectGameTypeMenu(menu) {
    let total = 0;
    let hasActive = false;
    for (const row of menu.querySelectorAll(`.${C.Row}`)) {
      const countEl = row.querySelector(`.${C.AppCount}`);
      if (!countEl) continue;
      const digits = countEl.textContent.replace(/[^\d]/g, '');
      const formatted = digits ? Number(digits).toLocaleString('en') : '';
      SE.mark(countEl, 'data-se-n', formatted);
      if (digits && row.querySelector('.DialogCheckbox.Active')) {
        total += Number(digits);
        hasActive = true;
      }
    }
    if (hasActive && total !== lastViewCount) {
      lastViewCount = total;
      try {
        localStorage.setItem(VIEW_COUNT_KEY, String(total));
      } catch (_) {}
      schedule();
    }
  }

  function observeTooltips() {
    /*
     * Records from the list rows are dropped by `ignore`; class changes are kept for the
     * game-type menu's checkboxes, which are inspected only when a record touches the menu.
     */
    tipObserver = SE.watch(
      records => {
        const menu = document.querySelector(`.${C.DropDown}`);
        if (menu && records.some(({ target }) => menu.contains(target) || target.contains(menu))) {
          inspectGameTypeMenu(menu);
        }
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            const tip = node.matches(TOOLTIP_SELECTOR) ? node : node.querySelector(TOOLTIP_SELECTOR);
            if (tip) {
              requestAnimationFrame(() => {
                positionTitleBarTooltip(tip);
                setTimeout(() => positionTitleBarTooltip(tip), 80);
              });
            }
          }
        }
      },
      { attributes: ['class'], records: true, ignore: LIST_ROWS }
    );
    document.addEventListener('mouseover', onMouseOver, true);
  }

  function syncActiveRoute() {
    const route = currentRoutePath();
    const url =
      /^\/browser/i.test(route) || !/^\/library/.test(route) ? currentBrowserURL() : '';
    let activeKey = '';

    for (const config of Object.values(NAV_ITEMS)) {
      for (const extra of config.extras) {
        const matches = extra.routeMatch
          ? extra.routeMatch.test(route)
          : url && extra.match?.test(url);
        if (matches) activeKey = extra.key;
      }
    }

    SE.attr(document.body, 'data-se-extra', activeKey || null);
    for (const [key, wrap] of extraNodes) {
      wrap.classList.toggle(SELECTED, key === activeKey);
    }
  }

  function update() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!railMode()) {
      cleanup(false);
      return;
    }
    bindNavItems();
    ensureSearchBar();
    syncGameList();
    syncAccountStatus();
    syncActiveRoute();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function pollState() {
    if (!railMode()) return;
    const persona = resolveSelfPersona();
    const signature = [
      currentRoutePath(),
      currentBrowserURL(),
      persona ? `${persona.is_ingame}${persona.is_online}${persona.is_awayOrSnooze}` : '',
      document.querySelector(`${LIST_SELECTOR} .${C.AppCount}`)?.textContent || '',
    ].join('|');

    if (signature !== lastPollSignature) {
      lastPollSignature = signature;
      schedule();
    }
  }

  function cleanup(full) {
    for (const wrap of extraNodes.values()) wrap.remove();
    searchBar?.remove();
    listToggleBtn?.remove();
    topBtn?.remove();
    topScroller = null;
    document.body?.classList.remove('se-list-hidden');
    document.body?.removeAttribute('data-se-list');
    for (const node of navNodes.values()) {
      node.removeEventListener('click', onNavClick, true);
    }
    navNodes.clear();
    document.body?.removeAttribute('data-se-extra');

    if (full) {
      for (const [menu, saved] of patchedMenus) {
        if (menu.Show !== saved.show) continue;
        if (saved.own) Object.defineProperty(menu, 'Show', saved.own);
        else delete menu.Show;
      }
      patchedMenus.clear();
    }
  }

  function start() {
    /* Core already batches to a frame; rows' hover/selection classes are ignored */
    observer = SE.watch(update, { attributes: ['class'], ignore: LIST_ROWS });
    document.addEventListener('keydown', onGlobalKeyDown, true);
    addEventListener('resize', schedule);
    document.addEventListener('scroll', onListScroll, { capture: true, passive: true });
    timer = SE.poll(pollState, 400, { active: railMode });
    observeTooltips();
    schedule();
  }

  window.__steamEnhancedRailNav = {
    destroy() {
      observer?.disconnect();
      timer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      cancelMountWait();
      listResizeObserver?.disconnect();
      removeEventListener('resize', schedule);
      document.removeEventListener('scroll', onListScroll, { capture: true });
      document.removeEventListener('keydown', onGlobalKeyDown, true);
      removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('mouseover', onMouseOver, true);
      tipObserver?.disconnect();
      cleanup(true);
      delete window.__steamEnhancedRailNav;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
