/* Startup status progress strip, configurable background layers, and sign-in form tagging. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedStartup?.destroy();
  if (!document.body) return;

  const { C } = SE;
  const CLS = {
    animatedBg: C.LoginAnimatedBackground,
    china: C.SteamChina,
    login: C.Login,
    statusBox: C.LoginStatusContainer,
    chooser: C.UserChooser,
    spinner: C.SpinnerLoaderContainer,
  };

  const SIGNIN_ATTR = 'data-se-si';
  const SIGNIN_TABS = [
    {
      id: 'password',
      label: 'Password',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    },
    {
      id: 'qr',
      label: 'QR code',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 21h-4M21 14v3"/></svg>',
    },
  ];

  // LoginStore loginState enum: 2 = network, 3 = steam server, 4 = library, 6 = shutdown
  const LOGIN_PHASES = { 2: 'net', 3: 'server', 4: 'lib', 6: 'off' };
  const PHASE_ORDER = { net: 0, server: 1, lib: 2, off: 3 };
  const VALID_BACKGROUNDS = ['library', 'hero', 'mosaic', 'wall', 'plain', 'dots', 'steam'];
  const ART_STORAGE_KEY = 'se-startup-art';
  const WALL_CROPS = ['18% 22%', '78% 64%', '46% 88%', '8% 70%', '62% 12%', '92% 34%'];

  const PROGRESS_STEPS = [
    { id: 'net', label: 'Network', doing: 'Connecting', done: 'Connected' },
    { id: 'server', label: 'Steam', doing: 'Signing in', done: 'Signed in' },
    { id: 'lib', label: 'Library', doing: 'Loading', done: 'Ready' },
  ];

  const docRoot = document.documentElement;
  const MOSAIC_COLS = 12;
  const MOSAIC_GAP = 6;

  // Wireframe library skeleton parameters for the default 'library' startup background.
  const SKELETON_GAMES = 8;
  const SKELETON_GAME_WIDTHS = [58, 44, 66, 38, 52, 61, 35, 49, 56, 42, 63, 47, 40, 55, 50];
  const SKELETON_FRIENDS = [
    ['game', 44], ['game', 38], ['on', 50], ['on', 36], ['on', 46],
    ['away', 40], ['off', 42], ['off', 34], ['off', 48], ['off', 38], ['off', 44],
  ];

  const repeat = (count, fn) => Array.from({ length: count }, (_, i) => fn(i)).join('');

  const buildLibraryWireframeHTML = () => {
    const bar = (w, extra = '') => `<s style="width:${w}${typeof w === 'number' ? 'px' : ''}${extra}"></s>`;
    const friendRow = ([st, w], i) =>
      `<span class="se-sl-fd" data-st="${st}">` +
        `<b style="animation-delay:${-i * 0.6}s"></b>` +
        `<span class="se-sl-lines">${bar(w)}${bar(w - 14, ';opacity:.5')}</span>` +
      `</span>` +
      (i === 1 || i === 4 ? '<span class="se-sl-grp"></span>' : '');

    const listRows = SKELETON_GAME_WIDTHS.map(
      (w, i) => `<span class="se-sl-row"${i === 2 ? ' data-sel' : ''}><b></b>${bar(w)}</span>`
    ).join('');

    const heroLayers = repeat(
      SKELETON_GAMES,
      i => `<div class="se-sl-hero" style="animation-delay:${i * 4.5 - SKELETON_GAMES * 4.5}s"></div>`
    );

    const stripItems = repeat(
      SKELETON_GAMES,
      i => `<span style="animation-delay:${i * 4.5 - SKELETON_GAMES * 4.5}s"></span>`
    );

    const newsHeadlines = repeat(2, () =>
      [90, 76, 84, 70, 88, 74]
        .map(w => `<span class="se-sl-lines">${bar(w + '%')}${bar(w - 30 + '%', ';opacity:.5')}</span>`)
        .join('')
    );

    const favCapsules = repeat(6, i => `<span style="animation-delay:${i * 0.35}s"><s></s></span>`);
    const collCards = [40, 32, 46]
      .map(
        w =>
          `<span>` +
            `<span class="se-sl-fan"><i></i><i></i><i></i></span>` +
            `<span class="se-sl-lines">${bar(w)}${bar(22, ';opacity:.5')}</span>` +
          `</span>`
      )
      .join('');

    return (
      '<div class="se-sl">' +
        `<div class="se-sl-rail">${repeat(6, () => '<i></i>')}</div>` +
        '<div class="se-sl-frame">' +
          '<div class="se-sl-head"><span class="se-sl-search"></span><i></i><i class="se-sl-bell"></i><i></i><i class="se-sl-me"></i></div>' +
          '<div class="se-sl-body">' +
            `<div class="se-sl-list"><span class="se-sl-seg"><i></i><i></i><i></i></span>${listRows}</div>` +
            '<div class="se-sl-home">' +
              '<div class="se-sl-stage">' +
                heroLayers +
                '<div class="se-sl-shade"></div><span class="se-sl-logo"></span>' +
                '<div class="se-sl-info">' +
                  '<span class="se-sl-chips"><i></i><i></i></span>' +
                  `${bar('100%')}${bar('92%')}${bar('70%')}` +
                  '<span class="se-sl-stats"><s></s><u></u></span>' +
                  '<span class="se-sl-play"><b></b><i></i></span>' +
                '</div>' +
                `<div class="se-sl-strip">${stripItems}</div>` +
              '</div>' +
              '<div class="se-sl-tray">' +
                `<div class="se-sl-col se-sl-news"><span class="se-sl-card"></span><div class="se-sl-heads"><div>${newsHeadlines}</div></div></div>` +
                `<div class="se-sl-col se-sl-favs">${favCapsules}</div>` +
                `<div class="se-sl-col se-sl-cols">${collCards}</div>` +
              '</div>' +
            '</div>' +
            `<div class="se-sl-friends"><span class="se-sl-self"><b></b><s></s></span><span class="se-sl-grp"></span>${SKELETON_FRIENDS.map(friendRow).join('')}</div>` +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="se-sl-scan"></div><div class="se-sl-sheen"></div>'
    );
  };

  let strip = null;
  let bgLayer = null;
  let bgLayerKind = '';
  let bgLayerHost = null;
  let poller = null;
  let watcher = null;
  let mosaicResizeObserver = null;
  let artSaveTimer = 0;
  let signinTabs = null;
  let activeSigninTab = 'password';
  let bgSetting = { at: -Infinity, kind: 'library' };

  // Read at most every 2 s: getComputedStyle on the root forces a style recalc, and update() polls.
  const resolveBackgroundSetting = () => {
    const now = performance.now();
    if (now - bgSetting.at > 2000) {
      const val = getComputedStyle(docRoot).getPropertyValue('--se-startup-background').trim().toLowerCase();
      bgSetting = { at: now, kind: VALID_BACKGROUNDS.includes(val) ? val : 'library' };
    }
    return bgSetting.kind;
  };

  const resolveLoginStore = () => {
    for (const win of SE.owners()) {
      try {
        if (win.loginStore && typeof win.loginStore.loginState === 'number') {
          return win.loginStore;
        }
      } catch (_) {}
    }
    return null;
  };

  const readLoginStatus = statusBox => {
    const store = resolveLoginStore();
    const state = store
      ? store.loginState
      : SE.fromProps(statusBox, 12, p => (typeof p.loginState === 'number' ? p.loginState : undefined));
    const pct = store && typeof store.loginPercentage === 'number' ? store.loginPercentage : 0;
    return {
      phase: LOGIN_PHASES[state] || '',
      pct: Math.max(0, Math.min(1, pct)),
    };
  };

  const buildProgressStrip = () => {
    const container = document.createElement('div');
    container.className = 'se-startup-strip';
    container.setAttribute('aria-hidden', 'true');
    for (const step of PROGRESS_STEPS) {
      const cell = document.createElement('div');
      cell.className = 'se-startup-cell';
      cell.dataset.step = step.id;
      cell.innerHTML =
        '<div class="se-startup-cell-head">' +
          '<span class="se-startup-icon"></span>' +
          `<span class="se-startup-label">${SE.esc(step.label)}</span>` +
          '<span class="se-startup-tick"></span>' +
        '</div>' +
        '<div class="se-startup-value"></div>' +
        '<div class="se-startup-bar"><span></span></div>';
      container.append(cell);
    }
    return container;
  };

  const updateProgressStrip = (phase, pct) => {
    const activeIndex = PHASE_ORDER[phase];
    for (const [idx, step] of PROGRESS_STEPS.entries()) {
      const cell = strip.children[idx];
      let state;
      let labelValue;
      let barWidth = '0%';
      let isSliding = false;

      if (phase === 'off' || idx < activeIndex) {
        state = 'done';
        labelValue = step.done;
        barWidth = '100%';
      } else if (idx === activeIndex) {
        state = 'current';
        if (step.id === 'lib' && pct > 0) {
          labelValue = `${Math.round(pct * 100)}%`;
          barWidth = labelValue;
        } else {
          labelValue = step.doing;
          isSliding = true;
        }
      } else {
        state = 'waiting';
        labelValue = 'Waiting';
      }

      SE.mark(cell, 'data-state', state);
      SE.mark(cell, 'data-sliding', isSliding ? 'true' : 'false');

      const valueEl = cell.querySelector('.se-startup-value');
      if (valueEl.textContent !== labelValue) valueEl.textContent = labelValue;

      const barFill = cell.querySelector('.se-startup-bar > span');
      if (barFill.style.width !== barWidth) barFill.style.width = barWidth;
    }
  };

  /*
   * Recent games' hero and capsule art. Read live from the library when this window can reach
   * it; the main window also caches it in localStorage so it is there on the next cold start.
   * spinner.js reads it through window.__steamEnhancedStartup.art.
   */
  const ownAppStore = () => {
    try {
      return window.appStore?.allApps ? window.appStore : null;
    } catch (_) {
      return null;
    }
  };

  const liveRecentGames = () => {
    const store = SE.appStore();
    if (!store?.allApps) return [];
    const collections = SE.global('collectionStore');
    const isHidden = appid => SE.run(() => collections.BIsHidden(appid)) || false;
    const recentApps =
      SE.run(() =>
        store.allApps
          .filter(
            app =>
              app &&
              app.rt_last_time_played > 0 &&
              (app.app_type === 1 || app.app_type === 1073741824) &&
              app.visible_in_game_list !== false &&
              !isHidden(app.appid)
          )
          .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
          .slice(0, 8)
      ) || [];
    return recentApps.map(app => ({
      id: app.appid,
      hero: SE.heroURLs(app.appid, store).filter(url => !url.endsWith('/header.jpg')),
      cover: SE.coverURLs(app, store),
    }));
  };

  // Only the window that owns the library writes the cache; every other window would repeat it.
  const persistRecentArt = () => {
    artSaveTimer = 0;
    if (!ownAppStore()) return;
    const games = liveRecentGames();
    if (!games.length) {
      artSaveTimer = setTimeout(persistRecentArt, 30000);
      return;
    }
    try {
      localStorage.setItem(ART_STORAGE_KEY, JSON.stringify({ at: Date.now(), games }));
    } catch (_) {}
    artSaveTimer = setTimeout(persistRecentArt, 10 * 60000);
  };

  const readCachedArt = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(ART_STORAGE_KEY) || 'null');
      return Array.isArray(parsed?.games) ? parsed.games : [];
    } catch (_) {
      return [];
    }
  };

  const recentGames = () => {
    const live = liveRecentGames();
    return live.length ? live : readCachedArt();
  };

  const toCssUrl = url => `url("${String(url).replace(/["\\\n]/g, ch => encodeURIComponent(ch))}")`;

  const applySlideBackground = (el, urlList, fallbackCrop, wallSize) => {
    el.style.backgroundImage = [...urlList.map(toCssUrl), 'var(--se-startup-wall)'].join(', ');
    el.style.backgroundSize = [...urlList.map(() => 'cover'), wallSize].join(', ');
    el.style.backgroundPosition = [...urlList.map(() => 'center'), fallbackCrop].join(', ');
  };

  const resolveWallImage = host => {
    const computedBg = getComputedStyle(host).backgroundImage;
    if (computedBg && computedBg !== 'none') return computedBg;
    return host.classList.contains(CLS.china)
      ? 'url(/images/client_login_bg_grid_china.jpg)'
      : 'url(/images/client_login_bg_grid.jpg)';
  };

  const syncMosaicGrid = () => {
    if (!bgLayer || bgLayerKind !== 'mosaic') return;
    const grid = bgLayer.querySelector('.se-startup-mosaic');
    const width = bgLayer.clientWidth || innerWidth;
    const height = bgLayer.clientHeight || innerHeight;
    const cellWidth = (width - MOSAIC_GAP * (MOSAIC_COLS + 1)) / MOSAIC_COLS;
    const rows = Math.ceil(height / (cellWidth * 1.5 + MOSAIC_GAP)) + 1;
    const targetCount = MOSAIC_COLS * rows;

    while (grid.children.length < targetCount) {
      const idx = grid.children.length;
      const tile = document.createElement('span');
      tile.style.setProperty('--se-tile-dur', `${6 + ((idx * 13) % 7)}s`);
      tile.style.setProperty('--se-tile-delay', `${-((idx * 37) % 97) / 10}s`);
      grid.append(tile);
    }
    while (grid.children.length > targetCount) {
      grid.lastChild.remove();
    }
  };

  const removeBackgroundLayer = () => {
    mosaicResizeObserver?.disconnect();
    mosaicResizeObserver = null;
    bgLayer?.remove();
    bgLayer = null;
    if (bgLayerHost) SE.unmark(bgLayerHost, 'data-se-startup-host');
    bgLayerHost = null;
    bgLayerKind = '';
  };

  const mountBackgroundLayer = kind => {
    const host = document.querySelector(`.${CLS.animatedBg}`);
    if (kind === 'steam' || !host) {
      removeBackgroundLayer();
      return;
    }
    if (bgLayer && bgLayerHost === host && bgLayerKind === kind) return;
    removeBackgroundLayer();

    const wallImg = resolveWallImage(host);
    bgLayer = document.createElement('div');
    bgLayer.className = 'se-startup-bg';
    bgLayer.dataset.kind = kind;
    bgLayer.setAttribute('aria-hidden', 'true');
    bgLayer.style.setProperty('--se-startup-wall', wallImg);

    if (kind === 'mosaic') bgLayer.innerHTML = '<div class="se-startup-mosaic"></div>';
    if (kind === 'library') bgLayer.innerHTML = buildLibraryWireframeHTML();
    if (kind === 'hero') {
      const games = readCachedArt().filter(g => g.hero?.length);
      for (let i = 0; i < 3; i++) {
        const slide = document.createElement('div');
        slide.className = 'se-startup-slide';
        applySlideBackground(
          slide,
          games.length ? games[i % games.length].hero : [],
          WALL_CROPS[i],
          '170% auto'
        );
        bgLayer.append(slide);
      }
    }

    host.append(bgLayer);
    bgLayerHost = host;
    bgLayerKind = kind;
    SE.mark(host, 'data-se-startup-host');

    if (kind === 'mosaic') {
      syncMosaicGrid();
      mosaicResizeObserver = new ResizeObserver(syncMosaicGrid);
      mosaicResizeObserver.observe(bgLayer);
    }
  };

  const buildSigninTabBar = () => {
    const tablist = document.createElement('div');
    tablist.className = 'se-signin-tabs';
    tablist.setAttribute('role', 'tablist');

    for (const tab of SIGNIN_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'se-signin-tab';
      btn.dataset.tab = tab.id;
      btn.setAttribute('role', 'tab');
      btn.innerHTML = `${tab.icon}<span>${SE.esc(tab.label)}</span>`;
      btn.addEventListener('click', () => selectSigninTab(tab.id));
      tablist.append(btn);
    }

    tablist.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = activeSigninTab === 'password' ? 'qr' : 'password';
      selectSigninTab(next);
      tablist.querySelector(`[data-tab="${next}"]`)?.focus();
    });

    return tablist;
  };

  const syncSigninTabBar = cardNode => {
    SE.mark(cardNode, 'data-se-signin-tab', activeSigninTab);
    for (const btn of signinTabs.children) {
      const isSelected = btn.dataset.tab === activeSigninTab;
      SE.mark(btn, 'aria-selected', isSelected ? 'true' : 'false');
      SE.mark(btn, 'tabindex', isSelected ? '0' : '-1');
    }
  };

  const selectSigninTab = tabId => {
    activeSigninTab = tabId;
    if (signinTabs?.parentNode) syncSigninTabBar(signinTabs.parentNode);
  };

  const removeSigninTabBar = () => {
    if (!signinTabs) return;
    const cardNode = signinTabs.parentNode;
    signinTabs.remove();
    signinTabs = null;
    if (cardNode) SE.unmark(cardNode, 'data-se-signin-tab');
  };

  const ensureSigninTabBar = (cardNode, hasQrCode) => {
    if (!hasQrCode) {
      removeSigninTabBar();
      return;
    }
    if (!signinTabs || signinTabs.parentNode !== cardNode) {
      removeSigninTabBar();
      signinTabs = buildSigninTabBar();
      cardNode.prepend(signinTabs);
    }
    syncSigninTabBar(cardNode);
  };

  // Tag sign-in form elements structurally so sign-in.css remains resilient to hash changes.
  const tagNode = (el, role) => {
    if (el) SE.mark(el, SIGNIN_ATTR, role);
  };

  const clearSigninTags = () => {
    for (const el of document.querySelectorAll(`[${SIGNIN_ATTR}]`)) {
      SE.unmark(el, SIGNIN_ATTR);
      SE.unmark(el, 'data-se-si-busy');
    }
  };

  const annotateSigninForm = form => {
    const cardNode = form.parentElement;
    const columnNode = cardNode?.parentElement;
    if (!cardNode || !columnNode) return;

    tagNode(columnNode, 'column');
    tagNode(cardNode, 'card');
    tagNode(form, 'form');

    let passedCard = false;
    for (const child of columnNode.children) {
      if (child === cardNode) {
        passedCard = true;
        continue;
      }
      if (!passedCard && child.querySelector('svg')) {
        tagNode(child, 'logo');
        for (const sub of child.children) {
          tagNode(sub, sub.tagName.toLowerCase() === 'svg' ? 'wordmark' : 'back');
        }
      } else if (passedCard && child.querySelector('a, div, span')) {
        tagNode(child, 'footer');
        for (const sub of child.children) {
          if (sub.children.length) {
            tagNode(sub, 'create');
            tagNode(sub.firstElementChild, 'create-prompt');
            if (sub.lastElementChild !== sub.firstElementChild) {
              tagNode(sub.lastElementChild, 'create-link');
            }
          } else {
            tagNode(sub, 'help');
          }
        }
      }
    }

    const formChildren = [...form.children];
    for (const child of formChildren) {
      if (child.querySelector('input')) {
        tagNode(child, 'field');
        tagNode(child.querySelector('label'), 'label');
        tagNode(child.querySelector('input'), 'input');
      } else if (child.querySelector('[role="checkbox"]')) {
        tagNode(child, 'remember');
        tagNode(child.querySelector('[role="checkbox"]'), 'check');
      } else if (child.querySelector('button')) {
        tagNode(child, 'submit');
        tagNode(child.querySelector('button'), 'button');
      } else if (child === formChildren[formChildren.length - 1] || !child.querySelector('*')) {
        tagNode(child, 'error');
      }
    }

    const qrColumn = [...cardNode.children].find(el => el !== form && el !== signinTabs);
    if (qrColumn) {
      tagNode(qrColumn, 'qr');
      const innerBox = qrColumn.firstElementChild;
      const parts = innerBox ? [...innerBox.children] : [];
      const qrTile = parts.find(el => el.querySelector('canvas, svg, img'));
      for (const el of parts) {
        if (el === qrTile) continue;
        if (el.tagName === 'LABEL') tagNode(el, 'qr-label');
        else if (el.querySelector('a')) tagNode(el, 'qr-help');
      }
      if (qrTile) {
        tagNode(qrTile, 'qr-tile');
        const relWrapper = [...qrTile.querySelectorAll('div')].find(d => d.style.position === 'relative');
        tagNode(relWrapper?.firstElementChild || qrTile.querySelector('canvas, svg, img'), 'qr-code');
        if (relWrapper && relWrapper.children.length > 1) {
          SE.mark(qrTile, 'data-se-si-busy');
        } else {
          SE.unmark(qrTile, 'data-se-si-busy');
        }
      }
    }

    ensureSigninTabBar(cardNode, !!qrColumn);
  };

  const detectLoginScreen = () => {
    const loginHost = document.querySelector(`.${CLS.login}`);
    if (!loginHost) return null;
    const chooser = loginHost.querySelector(`.${CLS.chooser}`);
    if (chooser) return { kind: 'chooser', el: chooser };
    const passwordInput = loginHost.querySelector('form input[type="password"]');
    if (passwordInput) return { kind: 'signin', el: passwordInput.closest('form') };
    return { kind: 'other', el: loginHost };
  };

  const stopPolling = () => {
    poller?.disconnect();
    poller = null;
  };

  const resetStartupState = () => {
    stopPolling();
    strip?.remove();
    strip = null;
    removeSigninTabBar();
    clearSigninTags();
    removeBackgroundLayer();
    for (const attrName of ['data-se-startup', 'data-se-startup-phase', 'data-se-startup-bg', 'data-se-login']) {
      SE.unmark(docRoot, attrName);
    }
  };

  const update = () => {
    const statusBox = document.querySelector(`.${CLS.statusBox}`);
    const loginHost = statusBox?.closest(`.${CLS.login}`);
    const { phase, pct } = statusBox ? readLoginStatus(statusBox) : { phase: '' };
    const bgKind = resolveBackgroundSetting();

    if (statusBox && loginHost && phase) {
      removeSigninTabBar();
      clearSigninTags();
      SE.unmark(docRoot, 'data-se-login');
      SE.mark(docRoot, 'data-se-startup');
      SE.mark(docRoot, 'data-se-startup-phase', phase);
      SE.mark(docRoot, 'data-se-startup-bg', bgKind);
      if (!strip || !strip.isConnected) {
        strip?.remove();
        strip = buildProgressStrip();
        loginHost.append(strip);
      }
      updateProgressStrip(phase, pct);
      mountBackgroundLayer(bgKind);
      return;
    }

    const screen = detectLoginScreen();
    if (!screen) {
      resetStartupState();
      return;
    }

    strip?.remove();
    strip = null;
    SE.unmark(docRoot, 'data-se-startup-phase');
    SE.mark(docRoot, 'data-se-startup');
    SE.mark(docRoot, 'data-se-login', screen.kind);
    SE.mark(docRoot, 'data-se-startup-bg', bgKind);

    if (screen.kind === 'signin') {
      annotateSigninForm(screen.el);
    } else {
      removeSigninTabBar();
      clearSigninTags();
    }
    mountBackgroundLayer(bgKind);
  };

  const startPolling = () => {
    if (poller) return;
    update();
    poller = SE.poll(update, 250, { active: () => !!document.querySelector(`.${CLS.statusBox}`) });
  };

  let idleTimer = 0;

  const stopWatching = () => {
    clearTimeout(idleTimer);
    idleTimer = 0;
    watcher?.disconnect();
    watcher = null;
  };

  // Once nothing startup-related has shown for 8 s, the page-wide watcher goes too.
  const scheduleIdleStop = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!poller && !document.querySelector(`.${CLS.login}`)) stopWatching();
    }, 8000);
  };

  const check = () => {
    if (document.querySelector(`.${CLS.statusBox}`)) startPolling();
    else if (detectLoginScreen()) update();
    else if (poller || strip || bgLayer || signinTabs || docRoot.hasAttribute('data-se-startup')) {
      resetStartupState();
      scheduleIdleStop();
    }
  };

  watcher = SE.watch(check);
  check();
  scheduleIdleStop();

  artSaveTimer = setTimeout(persistRecentArt, 15000);

  window.__steamEnhancedStartup = {
    destroy() {
      clearTimeout(artSaveTimer);
      stopWatching();
      resetStartupState();
      delete window.__steamEnhancedStartup;
    },
    art: { recentGames, cssUrl: toCssUrl, WALL_CROPS },
  };
});
