/*
 * Navigation, part 2 of 4 (window.__seNavParts; client/navigation/title-bar-search.js names the
 * parts): the game list's header in the title bar (the "Steam Enhanced" lockup with the list's
 * total, the hide-list toggle, back to top), the list's edges and resize handle, the search's
 * place in the title bar, and the avatar's status ring.
 */
((SE) => {
  const ns = window.__seNavParts;
  if (!ns) return;
  const { C } = SE;

  let listResizeObserver;
  let listWatchedNode;

  // Game list header metrics and collapse toggle
  const LIST_SELECTOR = `.${C.GameListHomeAndSearch_Container}`;
  const HIDE_KEY = 'se-list-hidden';
  const VIEW_COUNT_KEY = 'se-view-count';
  /* The game-type menu's last total, mirrored to storage for the next start */
  let lastViewCount = null;

  let listToggleBtn;
  // Scroll-to-top tile at the list header's right edge, always shown while the list shows.
  let topBtn;
  let topScroller = null;
  /* Until measured: the rail's width, plus the fixed list width (--se-list-w) */
  let listLeft = 60;
  let listRight = 410;
  /* The game list's header lockup (the Steam button's face while the list shows) */
  let listBrand;
  let listBrandWidth = -1;

  /* Read once; updates go to memory and storage together */
  let listHidden = (() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  })();

  const isListHidden = () => listHidden;

  const setListHidden = (hidden) => {
    listHidden = hidden;
    try {
      localStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
    } catch {}
  };

  // The list's width is --se-list-w in CSS; only its edges are tracked here. Its resize handle
  // (client/shared/column-resize.js) rides on whichever list is showing; the "Game list width"
  // setting's Adjustable file shows it and makes the dragged width count.
  let listResize = null;
  const syncListHandle = (list, visible) => {
    const host = visible ? list.closest(`.${C.LeftListSizableContainer}`) : null;
    if (!host) {
      listResize?.handle.remove();
      return;
    }
    listResize ??= SE.columnResize?.({
      col: 'list',
      side: 'right',
      cssVar: '--se-list-w-user',
      storageKey: 'se-list-w',
      label: 'Resize game list',
      min: 260,
      max: () => Math.min(560, innerWidth * 0.4),
      // The host it sits on now: Steam remounts the list, and the handle moves with it
      measure: () => listResize.handle.parentElement?.getBoundingClientRect().width || 0,
    });
    if (listResize && listResize.handle.parentElement !== host) host.appendChild(listResize.handle);
  };

  // Scroll doesn't bubble, so this listens in the capture phase and takes whichever
  // tall scroller inside the list fired (the one scroll-to-top scrolls): no hashed class to
  // chase for the virtual list. Before any scroll the list is at its top, so none is needed.
  const onListScroll = (event) => {
    const el = event.target;
    if (!(el instanceof Element) || el.clientHeight < 200 || !el.closest(LIST_SELECTOR)) return;
    topScroller = el;
  };

  const applyListEdgeVars = () => {
    for (const el of [listToggleBtn, topBtn, document.querySelector('.se-sidebar-icons')]) {
      SE.cssVar(el, '--se-list-left', `${listLeft}px`);
      SE.cssVar(el, '--se-list-right', `${listRight}px`);
    }
  };

  let countCache = { at: 0, count: null };

  /*
   * The title bar's lockup (mark, "Steam Enhanced", and under it the list's total while the
   * list shows), drawn over
   * Steam's own button, which title-bar.css stretches to the lockup's width so clicks,
   * hover and the Steam menu stay Steam's. The width (it follows the font) is written only
   * when it changes.
   */
  function syncListBrand(topBar, stat = '') {
    if (!topBar) {
      listBrand?.remove();
      return;
    }
    if (!listBrand) {
      listBrand = document.createElement('span');
      listBrand.className = 'se-list-brand';
      listBrand.setAttribute('aria-hidden', 'true');
      listBrand.innerHTML =
        '<span class="se-list-brand-mark"></span>' +
        '<span class="se-list-brand-text">' +
          '<span class="se-list-brand-word">Steam <em>Enhanced</em></span>' +
          '<span class="se-list-brand-stat"></span>' +
        '</span>';
    }
    // The game list's total under the wordmark ("4,409"), while the list shows
    const statNode = listBrand.querySelector('.se-list-brand-stat');
    if (statNode.textContent !== stat) statNode.textContent = stat;
    if (listBrand.parentElement !== topBar) topBar.appendChild(listBrand);
    const width = Math.ceil(listBrand.getBoundingClientRect().width);
    if (!width || width === listBrandWidth) return;
    listBrandWidth = width;
    SE.cssVar(document.body, '--se-list-brand-w', `${width}px`);
  }


  function totalLibraryGameCount() {
    if (Date.now() - countCache.at < 5000) return countCache.count;
    const apps = SE.global('appStore', (store) => Array.isArray(store.allApps))?.allApps;
    const collections = SE.global('collectionStore');
    const isHidden = (id) => !!SE.run(() => collections.BIsHidden(id));
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

  // The avatar's status ring (at the rail's foot), from your persona.
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
    // Your name under the avatar (nav-rail.css)
    SE.attr(account, 'data-se-name', persona?.m_strPlayerName || null);
  }

  function syncGameList() {
    const hidden = isListHidden();
    document.body.classList.toggle('se-list-hidden', hidden);

    const downloadsList = window.__seDownloads?.library;
    const list = downloadsList || document.querySelector(LIST_SELECTOR);
    if (list !== listWatchedNode && window.ResizeObserver) {
      listResizeObserver ??= new ResizeObserver(() => ns.schedule());
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
    syncListHandle(list, isVisible);
    if (isVisible !== document.body.hasAttribute('data-se-list')) {
      document.body.toggleAttribute('data-se-list', isVisible);
    }

    const picker = list?.querySelector(`.${C.MenuHeader}`);
    let statText = '';
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
        } catch {}
      }
      if (count === null) count = lastViewCount;
      if (count === null && /^(all )?games$/.test(viewLabel)) {
        count = totalLibraryGameCount();
      }
      SE.attr(picker, 'data-se-count', count === null ? null : count.toLocaleString('en'));
      if (count !== null && isVisible && !downloadsList) {
        statText = count.toLocaleString('en');
      }
    }

    const onLibraryRoute = /^\/library/.test(ns.currentRoutePath()) || !!list;
    if (!listToggleBtn) {
      listToggleBtn = document.createElement('button');
      listToggleBtn.type = 'button';
      listToggleBtn.className = 'se-list-toggle se-sidebar-tip';
      listToggleBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/></svg>';
      listToggleBtn.addEventListener('click', () => {
        setListHidden(!isListHidden());
        ns.schedule();
      });
    }

    // The rail's corner on every page (client/navigation/title-bar.css), so the page
    // icons under it never move
    const topBar = document.querySelector(`.${C.TopBar}`);
    if (topBar) {
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

    // The list header's last tile, at the list column's right edge (title-bar.css)
    if (topBar && onLibraryRoute && isVisible) {
      if (topBtn.parentElement !== topBar) topBar.appendChild(topBtn);
      if (!topScroller?.isConnected) topScroller = null;
    } else {
      topBtn.remove();
    }

    SE.mark(listToggleBtn, 'aria-label', hidden ? 'Show game list' : 'Hide game list');
    SE.mark(listToggleBtn, 'aria-pressed', String(hidden));
    applyListEdgeVars();
    syncListBrand(topBar, statText);
    syncTitleBar(topBar, isVisible);
    // After the search's place is set: the toggles line up with its views slot
    const views = list?.querySelector(`.${C.CheckboxWithImage}`)?.parentElement?.parentElement;
    ns.search.syncViews(isVisible && !downloadsList ? views : null);
  }

  /*
   * The search's place, measured: the middle of the title bar between what the list header
   * holds (the game list's column, or the Steam button) and the status
   * buttons, centred when there is room. Written only when it changes, on <body>: the
   * game-type chip and Steam's Filters panel, inside the list, line up with it.
   */
  const TITLE_GAP = 12;
  const SEARCH_MIN = 240;
  const SEARCH_MAX = 600;
  let titleKey = '';

  function syncTitleBar(topBar, listVisible) {
    if (!topBar) {
      if (titleKey) {
        titleKey = '';
        SE.cssVar(document.body, '--se-title-search-x', null);
        SE.cssVar(document.body, '--se-title-search-w', null);
      }
      return;
    }
    const steam = topBar.querySelector(`.${C.RootMenuBar}`)?.getBoundingClientRect();
    const controls = topBar.querySelector(`.${C.FocusNavigationRoot_TitleBarControls}`)?.getBoundingClientRect();
    const brand = listBrand?.isConnected ? listBrand.getBoundingClientRect() : null;
    const start = listVisible
      ? listRight
      : Math.max(steam?.width ? steam.right : 0, brand?.width ? brand.right : 0);
    const end = controls?.width ? controls.left : innerWidth;
    const room = end - start - 2 * TITLE_GAP;
    const width = Math.round(Math.max(SEARCH_MIN, Math.min(SEARCH_MAX, room)));
    const x = Math.round(
      Math.max(start + TITLE_GAP, Math.min((innerWidth - width) / 2, end - TITLE_GAP - width))
    );

    const key = `${x}|${width}`;
    if (key === titleKey) return;
    titleKey = key;
    SE.cssVar(document.body, '--se-title-search-x', `${x}px`);
    SE.cssVar(document.body, '--se-title-search-w', `${width}px`);
  }

  /* The game-type menu's total, from its rows (client/navigation/title-bar-tips.js) */
  function setViewCount(total) {
    if (total === lastViewCount) return;
    lastViewCount = total;
    try {
      localStorage.setItem(VIEW_COUNT_KEY, String(total));
    } catch {}
    ns.schedule();
  }

  function cleanup() {
    syncTitleBar(null, false);
    syncListBrand(null);
    listBrandWidth = -1;
    SE.cssVar(document.body, '--se-list-brand-w', null);
    listToggleBtn?.remove();
    topBtn?.remove();
    listResize?.handle.remove();
    topScroller = null;
    document.body?.classList.remove('se-list-hidden');
    document.body?.removeAttribute('data-se-list');
  }

  Object.assign(ns, { LIST_SELECTOR, resolveSelfPersona });
  ns.titleBar = {
    sync() {
      syncGameList();
      syncAccountStatus();
    },
    setViewCount,
    cleanup,
    start() {
      addEventListener('resize', ns.schedule);
      document.addEventListener('scroll', onListScroll, { capture: true, passive: true });
    },
    destroy() {
      listResizeObserver?.disconnect();
      removeEventListener('resize', ns.schedule);
      document.removeEventListener('scroll', onListScroll, { capture: true });
      cleanup();
      listResize?.destroy();
      listResize = null;
    },
  };
})(window.__se);
