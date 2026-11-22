/*
 * Proxy bottom-bar actions into the title bar (Settings into the rail) while keeping native
 * components mounted.
 */
((SE) => {
  const { C } = SE;
  window.__seHeaderActions?.destroy?.();
  const state = (window.__seHeaderActions = {});

  const ANNOUNCEMENT_SELECTOR = `.${C.AnnouncementsButton}:not(.se-header-action):not(.se-native-header-button), .AnnouncementsButton:not(.se-header-action):not(.se-native-header-button)`;
  const PROXY_ACTIONS = [
    { key: 'add', label: 'Add a Game', selector: `.${C.AddGameButton}, .AddGameButton` },
    { key: 'downloads', label: 'Downloads', selector: `.${C.DownloadStatusContent}, .DownloadStatusContent` },
    { key: 'friends', label: 'Friends & Chat', selector: `.${C.FriendsButton}, .FriendsButton` },
  ];

  const proxies = new Map();
  const decorated = new Map();
  const nativeClasses = [C.Button, C.AnnouncementsButton];
  const styled = new Map();
  const savedVariables = new Map();
  const coloredDividers = new Set();

  let settingsButton;
  let gamesButton;
  let observer;
  let menuObserver;
  let frame = 0;
  let group;
  let styleReference;
  let referenceObserver;
  let downloadObserver;
  let downloadSource;
  let homeReference;
  let homeResizeObserver;
  let stripObserver;
  let stripKey = '';
  /*
   * The strip and Home-button reads run only after a watched box resized (the game lists, the
   * title bar, the Home button), the window resized, or one of those nodes changed. The pass
   * runs on any structure change in the window; the rest reuse the last reads (no forced layout).
   */
  let geometryDirty = true;
  const remeasure = () => {
    geometryDirty = true;
    schedule();
  };
  const stripLists = new Set();

  function setBodyProperty(property, value) {
    if (!savedVariables.has(property)) {
      savedVariables.set(property, document.body.style.getPropertyValue(property));
    }
    if (document.body.style.getPropertyValue(property) !== value) {
      document.body.style.setProperty(property, value);
    }
  }

  function makeActionButton(key, label, onActivate) {
    const button = document.createElement('div');
    button.className = `${C.Button} ${C.AnnouncementsButton} se-header-action`;
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.setAttribute('data-se-action', key);
    if (label) button.setAttribute('aria-label', label);
    button.innerHTML = `<svg class="${C.Icon}" viewBox="0 0 24 24" aria-hidden="true"></svg>`;
    if (onActivate) {
      button.addEventListener('click', onActivate);
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(event);
        }
      });
    }
    return button;
  }

  const clampPercent = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null);
  const parsePercent = (text) => {
    const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(text || '');
    return match ? clampPercent(Number(match[1].replace(',', '.'))) : null;
  };

  /*
   * The transfer's percentage, from the most to the least specific source:
   * 1. the downloading game's own label in the game list ("4% (346 Mbps)"), the number the
   *    user reads beside the game; queued rows carry no percentage and are skipped;
   * 2. Steam's download overview (bytes of the current transfer);
   * 3. the bottom bar's progress bar or text, which can track another stage of the queue.
   */
  function listDownloadPercent() {
    for (const label of document.querySelectorAll(`.${C.AppIconDownloading_Container} .${C.DownloadProgress}`)) {
      const value = parsePercent(label.textContent);
      if (value !== null) return value;
    }
    return null;
  }

  function overviewDownloadPercent() {
    for (const win of SE.owners()) {
      const overview = SE.run(() => win.downloadsStore?.m_DownloadOverview);
      if (!overview) continue;
      const stages = [
        [overview.update_bytes_downloaded, overview.update_bytes_to_download],
        [overview.update_bytes_processed, overview.update_bytes_to_process],
      ];
      for (const [done, total] of stages) {
        const doneN = Number(done);
        const totalN = Number(total);
        if (totalN > 0 && Number.isFinite(doneN)) return clampPercent((doneN / totalN) * 100);
      }
    }
    return null;
  }

  function footerDownloadPercent(source) {
    const progress = source.querySelector('[role="progressbar"], progress');
    if (progress && (progress.hasAttribute('aria-valuenow') || progress.hasAttribute('value'))) {
      const value = Number(progress.getAttribute('aria-valuenow') ?? progress.getAttribute('value'));
      const maximum = Number(progress.getAttribute('aria-valuemax') ?? progress.getAttribute('max') ?? 100);
      if (Number.isFinite(value) && maximum > 0) return clampPercent((value / maximum) * 100);
    }
    return parsePercent(source.textContent);
  }

  function readDownloadProgress(source) {
    return listDownloadPercent() ?? overviewDownloadPercent() ?? footerDownloadPercent(source);
  }

  // The ring's percentage, for the Downloads card (client/header/downloads-card.js)
  state.downloadPercent = () => (downloadSource ? readDownloadProgress(downloadSource) : listDownloadPercent() ?? overviewDownloadPercent());

  /* The bar (header) and the ring (rail) share one element; CSS shows the one that fits */
  function createProgressIndicator() {
    const bar = document.createElement('span');
    bar.className = 'se-download-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Download progress');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.innerHTML =
      '<svg class="se-download-ring" viewBox="0 0 40 40" aria-hidden="true">' +
      '<circle class="se-download-ring-track" cx="20" cy="20" r="18"/>' +
      '<circle class="se-download-ring-value" cx="20" cy="20" r="18" pathLength="100"/>' +
      '</svg>';
    return bar;
  }

  function updateDownloadProgress(entry, source) {
    if (downloadSource !== source) {
      downloadObserver?.disconnect();
      downloadSource = source;
      // Own observer on purpose: Steam's downloads button only (its attributes and text); released when the source changes
      downloadObserver = new MutationObserver(schedule);
      downloadObserver.observe(source, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-valuenow', 'aria-valuemax', 'value', 'max'],
      });
    }
    const value = readDownloadProgress(source);
    let bar = entry.button.querySelector('.se-download-progress');
    if (value === null) {
      bar?.remove();
      entry.button.removeAttribute('data-se-progress');
      return;
    }
    if (!bar) {
      bar = createProgressIndicator();
      entry.button.appendChild(bar);
    }
    const percent = String(Math.round(value * 10) / 10);
    if (bar.getAttribute('aria-valuenow') !== percent) {
      bar.setAttribute('aria-valuenow', percent);
      bar.style.setProperty('--se-download-progress', `${percent}%`);
      const ring = bar.querySelector('.se-download-ring-value');
      /* A sliver stays visible at 0 % so the ring reads as started */
      if (ring) ring.style.strokeDasharray = `${Math.max(Number(percent), 0.5)} 100`;
    }
    SE.mark(entry.button, 'data-se-progress', String(Math.round(value)));
  }

  // The game list showing or collapsing resizes its header: watched instead of every class change.
  // Also the title bar, whose foot the strip lines up with. Returns whether a new node is watched.
  function observeLibraryLists(lists) {
    stripObserver ||= window.ResizeObserver ? new window.ResizeObserver(remeasure) : null;
    for (const node of stripLists) {
      if (!node.isConnected) {
        stripObserver?.unobserve(node);
        stripLists.delete(node);
      }
    }
    let added = false;
    for (const node of lists) {
      if (!node || stripLists.has(node)) continue;
      stripObserver?.observe(node);
      stripLists.add(node);
      added = true;
    }
    return added;
  }

  function matchLibraryStrip() {
    const lists = [...document.querySelectorAll(`.${C.GameListHomeAndSearch_Container}`)];
    if (observeLibraryLists([...lists, document.querySelector(`.${C.TopBar}`)])) geometryDirty = true;
    if (!geometryDirty) {
      // React can rewrite a divider's className without the set changing: keep the mark on.
      for (const divider of coloredDividers) if (divider.isConnected) divider.classList.add('se-library-strip');
      return;
    }
    const visible = lists.some(node => node.getBoundingClientRect().height > 0);
    if (document.body.classList.contains('se-hide-library-strip') !== visible) {
      document.body.classList.toggle('se-hide-library-strip', visible);
    }
    for (const divider of coloredDividers) {
      if (!divider.isConnected) coloredDividers.delete(divider);
    }
    if (!visible) {
      stripKey = '';
      return;
    }

    // The hit-test probe below forces layout: run it only when the header's edge, the window
    // width or the set of dividers has changed.
    const header = document.querySelector(`.${C.TopBar}`);
    const edge = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
    const key = `${edge}|${innerWidth}|${coloredDividers.size}`;
    if (key === stripKey) {
      // React can rewrite a divider's className without the set changing: keep the mark on.
      for (const divider of coloredDividers) divider.classList.add('se-library-strip');
      return;
    }
    stripKey = key;

    const candidates = new Set();
    const dividerClass = window.__seNativeTooltips?.resolve()?.libraryDivider;
    if (dividerClass) {
      for (const divider of document.getElementsByClassName(dividerClass)) {
        candidates.add(divider);
      }
    }

    if (header && document.elementsFromPoint) {
      for (const fraction of [0.25, 0.5, 0.75]) {
        for (const node of document.elementsFromPoint(innerWidth * fraction, edge + 1)) {
          const rect = node.getBoundingClientRect();
          if (
            rect.height > 0 &&
            rect.height <= 24 &&
            rect.width >= innerWidth * 0.6 &&
            rect.top >= edge - 1 &&
            rect.top <= edge + 2 &&
            !node.contains(header)
          ) {
            candidates.add(node);
          }
        }
      }
    }

    for (const divider of candidates) {
      if (divider.closest('#sfp-root')) continue;
      if (!divider.classList.contains('se-library-strip')) {
        divider.classList.add('se-library-strip');
      }
      coloredDividers.add(divider);
    }
    stripKey = `${edge}|${innerWidth}|${coloredDividers.size}`;
  }

  function applyNativeButtonClasses(element) {
    if (!styled.has(element)) {
      styled.set(element, nativeClasses.filter(name => !element.classList.contains(name)));
    }
    const missing = ['se-native-header-button', ...nativeClasses].filter(
      name => !element.classList.contains(name)
    );
    if (missing.length) element.classList.add(...missing);
  }

  /*
   * The live Announcements button lends its text colour to the theme's header buttons, and the
   * header's surface goes to Friends Panel. (Sizes come from the Steam/Home button instead.)
   */
  function matchReference(announcement) {
    if (styleReference === announcement) return;
    styleReference = announcement;
    referenceObserver?.disconnect();

    const measure = () => {
      let headerSurface = '#171d25';
      for (let header = document.querySelector(`.${C.TopBar}`); header; header = header.parentElement) {
        const color = window.getComputedStyle(header).backgroundColor;
        if (!color || color === 'transparent') continue;
        const rgba = color.match(/[\d.]+/g);
        if (rgba && rgba.length >= 3 && (rgba.length === 3 || Number(rgba[3]) >= 0.95)) {
          headerSurface = color;
          break;
        }
      }

      setBodyProperty('--se-announcement-header-surface', headerSurface);
      setBodyProperty('--se-announcement-color', getComputedStyle(announcement).color);
    };

    measure();
    // Own observer on purpose: one element's class and style, which the shared observer would have to watch window-wide
    referenceObserver = new MutationObserver(measure);
    referenceObserver.observe(announcement, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function pruneDisconnected(map) {
    for (const element of map.keys()) if (!element.isConnected) map.delete(element);
  }

  function decorateMenuIcons() {
    pruneDisconnected(decorated);
    pruneDisconnected(styled);
    const rootItems = document.querySelectorAll?.(`.${C.RootMenuBar} .${C.RootMenuButton}`) || [];
    const navItems =
      document.querySelectorAll?.(
        `.${C.SuperNavBar} .${C.SuperNav} > .${C.SuperNavMenu} > .${C.SuperNav_MenuButton}`
      ) || [];

    const groups = [
      [rootItems, ['steam', 'view', 'friends', 'games', 'help']],
      [navItems, ['store', 'library', 'community', 'profile', 'console']],
    ];

    for (const [items, names] of groups) {
      items.forEach((element, index) => {
        if (!names[index]) return;
        if (!decorated.has(element)) {
          decorated.set(element, {
            title: element.getAttribute('title'),
            aria: element.getAttribute('aria-label'),
          });
        }
        if (!element.classList.contains('se-menu-icon')) {
          element.classList.add('se-menu-icon');
        }
        applyNativeButtonClasses(element);
        const label = element.textContent.replace(/\s+/g, ' ').trim();
        SE.mark(element, 'data-se-icon', names[index]);
        if (label) {
          SE.unmark(element, 'title');
          SE.mark(element, 'aria-label', label);
        }
      });
    }

    const bigPicture = document.querySelector(`.${C.TopBar} .${C.GamepadUIToggle}`);
    if (bigPicture) applyNativeButtonClasses(bigPicture);
  }

  function matchSteamHome() {
    const home = document.querySelector(`.se-sidebar-icons .${C.HomeBox} a`);
    const menu = document.querySelector(`.${C.RootMenuBar}`);
    if (home !== homeReference) {
      homeResizeObserver?.disconnect();
      homeReference = home;
      geometryDirty = true;
      if (home && window.ResizeObserver) {
        homeResizeObserver = new window.ResizeObserver(remeasure);
        homeResizeObserver.observe(home);
      }
    }
    if (!home || !menu || !geometryDirty) return;
    const rect = home.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    for (const [key, number] of Object.entries({ width: rect.width, height: rect.height, inset: 6 })) {
      setBodyProperty(`--se-steam-home-${key}`, `${number}px`);
    }
  }

  function createFallbackIcon(isDownloads) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('class', C.Icon);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', isDownloads ? 'M8 1v9m-4-4 4 4 4-4M2 10v4h12v-4' : 'M8 2v12M2 8h12');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    svg.appendChild(path);
    return svg;
  }

  function createProxyEntry(action) {
    const button = makeActionButton(action.key, '');
    const entry = { button, source: null, signature: '' };

    const forwardNative = (event) => {
      const handler = SE.props(entry.source)?.onClick;
      if (typeof handler === 'function') {
        const forwarded = new Proxy(event, {
          get(target, key) {
            if (action.key === 'add' && (key === 'clientX' || key === 'clientY')) {
              const rect = button.getBoundingClientRect();
              return key === 'clientX' ? rect.right : rect.top;
            }
            if (action.key === 'friends') {
              if (key === 'button') return 0;
              if (key === 'type') return 'click';
            }
            if (key === 'nativeEvent') return target;
            if (key === 'persist') return () => {};
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        handler(forwarded);
      } else {
        entry.source.click();
      }
    };

    // Friends & Chat: a click opens its menu, a right-click shows or folds the dock at once
    button.addEventListener('click', (event) => {
      const dock = action.key === 'friends' && window.__seFriendsDock;
      if (!dock) {
        forwardNative(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggleFriendsMenu(button, () => dock.openWindow(() => forwardNative(event)));
    });

    if (action.key === 'friends') {
      button.setAttribute('aria-haspopup', 'menu');
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.__seFriendsDock) onFriends();
        else forwardNative(event);
      });
    }

    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });

    group.appendChild(button);
    proxies.set(action.key, entry);
    return entry;
  }

  function syncProxyButton(action, source) {
    const entry = proxies.get(action.key) || createProxyEntry(action);
    entry.source = source;
    const icon =
      source.querySelector('svg') || (action.key === 'downloads' ? null : source.querySelector('img'));
    const label = source.textContent.replace(/\s+/g, ' ').trim() || action.label;
    const signature = `${label}|${icon?.outerHTML || ''}|${source.className}`;

    if (signature !== entry.signature) {
      entry.signature = signature;
      entry.button.replaceChildren();
      if (icon) {
        const copy = icon.cloneNode(true);
        copy.setAttribute('class', C.Icon);
        copy.setAttribute('aria-hidden', 'true');
        entry.button.appendChild(copy);
      } else {
        entry.button.appendChild(createFallbackIcon(action.key === 'downloads'));
      }
      entry.button.removeAttribute('title');
      entry.button.setAttribute('aria-label', label);
    }

    if (action.key === 'downloads') updateDownloadProgress(entry, source);
  }

  /*
   * Friends & Chat runs the friends dock (client/friends/dock/main.js) in one button: a click
   * opens a menu (the popup layer's, in the Settings menu's style) to hide or show the dock,
   * switch Steam's compact list and compact favorites, and open the Friends & Chat window; a
   * right-click collapses the open dock to its rail and expands it back, or shows it when
   * hidden. The button carries the dock's state (data-se-dock: open, rail or hidden) for its
   * icon; the dock calls syncFriendsButton when its state changes.
   */
  let friendsMenu = null;

  const dockState = (dock) => (dock.hidden ? 'hidden' : dock.mode === 'rail' ? 'rail' : 'open');

  function syncFriendsButton() {
    const button = proxies.get('friends')?.button;
    const dock = window.__seFriendsDock;
    if (!button) return;
    if (!dock) {
      SE.attr(button, 'data-se-dock', null);
      return;
    }
    const current = dockState(dock);
    SE.attr(button, 'data-se-dock', current);
  }

  state.syncFriendsButton = syncFriendsButton;

  function onFriends() {
    const dock = window.__seFriendsDock;
    friendsMenu?.release();
    if (dock.hidden) dock.toggle();
    else dock.toggleMode();
    syncFriendsButton();
  }

  // Under a title-bar button, right edges aligned, the menus' gap below it; kept in the window
  function belowButton(button) {
    const rect = button.getBoundingClientRect();
    const edge = SE.px('--se-space-2');
    return (width) => ({
      left: Math.max(edge, Math.min(rect.right - width, innerWidth - width - edge)),
      top: rect.bottom + SE.px('--se-space-3'),
    });
  }

  function toggleFriendsMenu(button, openWindow) {
    if (friendsMenu && !friendsMenu.released) {
      friendsMenu.release();
      friendsMenu = null;
      return;
    }
    const dock = window.__seFriendsDock;
    const run = (act) => () => {
      act();
      syncFriendsButton();
    };
    const current = dockState(dock);
    const dockRows =
      current === 'hidden'
        ? [{ label: 'Show friends', hint: 'Bring the dock back', icon: '--se-icon-friends', run: run(() => dock.toggle()) }]
        : [
            current === 'rail'
              ? { label: 'Expand friends', hint: 'Show the full list', icon: '--se-icon-collapse', run: run(() => dock.toggleMode()) }
              : { label: 'Collapse friends', hint: 'Keep just a rail of games', icon: '--se-icon-collapse', run: run(() => dock.toggleMode()) },
            { label: 'Hide friends', hint: 'Take the dock off the side', icon: '--se-icon-eye-off', run: run(() => dock.toggle()) },
          ];
    // Steam's own Friends & Chat settings, as its Friends settings page sets them: its settings
    // store lives in Steam's shared context (the window that opened this one), not here
    const settings = [...SE.owners()].map((win) => SE.run(() => win.settingsStore)).find((store) => store?.UpdateFriendSetting);
    const friendSetting = (key) => Boolean(settings?.friendSettings?.[key]);
    const flip = (key) => () => SE.run(() => settings.UpdateFriendSetting(key, !friendSetting(key)));
    const viewRows = settings
      ? [
          { separator: true },
          { heading: 'View' },
          {
            label: 'Compact list',
            hint: 'Tighter rows in the list and chats',
            icon: '--se-icon-view-compact',
            checked: friendSetting('bCompactFriendsList'),
            run: flip('bCompactFriendsList'),
          },
          {
            label: 'Compact favorites',
            hint: 'Favorites as avatars only',
            icon: '--se-icon-heart',
            checked: friendSetting('bCompactQuickAccess'),
            run: flip('bCompactQuickAccess'),
          },
        ]
      : [];
    friendsMenu = SE.layer?.menu(
      [
        { heading: 'Dock' },
        ...dockRows,
        ...viewRows,
        { separator: true },
        { heading: 'Window' },
        { label: 'Open chat window', hint: 'Friends & Chat on its own', icon: '--se-icon-bubble', run: openWindow },
      ],
      belowButton(button),
      // Leaving the button or the menu closes it, as the Settings menu closes
      { owner: button, closeOnLeave: true }
    );
    if (!friendsMenu) openWindow();
  }

  function openSteamSettings() {
    if (SE.run(() => window.SteamClient?.URL?.ExecuteSteamURL?.('steam://open/settings')) !== undefined) {
      return;
    }
    location.href = 'steam://open/settings';
  }

  function openMillennium() {
    if (!window.__seMillenniumWindow?.openDirect?.()) {
      window.__seMillenniumWindow?.showError?.();
    }
  }

  const reloadUI = () => SE.steamCall('Browser', 'RestartJSContext');
  // false: a plain restart, as Steam's own Restart buttons make it (true is another kind of restart)
  const restartSteam = () => SE.steamCall('User', 'StartRestart', false);

  /*
   * Keyboard shortcuts, in the main window: Ctrl+` Steam Settings, Ctrl+1 Millennium (beside
   * Millennium's own Ctrl+2, the Library Manager), Ctrl+R Reload UI, Ctrl+Shift+R Restart Steam
   * (shown on the Settings menu's and the Steam menu's rows). By the key's place (event.code),
   * so they work on any keyboard layout.
   */
  const SHORTCUTS = {
    Backquote: openSteamSettings,
    Digit1: openMillennium,
    KeyR: reloadUI,
    'Shift+KeyR': restartSteam,
  };

  function onShortcut(event) {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const action = SHORTCUTS[(event.shiftKey ? 'Shift+' : '') + event.code];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  addEventListener('keydown', onShortcut, true);

  function openLibraryManager() {
    if (window.__seMillenniumWindow?.openLibraryManager) {
      window.__seMillenniumWindow.openLibraryManager();
      return;
    }
    SE.run(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '2',
          code: 'Digit2',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
  }

  /*
   * Settings: one button at the rail's foot, opening Steam Settings, Millennium and the Library
   * Manager as a menu beside it, its foot on the button's (the popup layer's menu,
   * client/shared/popup-layer.js): Steam's and Millennium's in two groups, each row with its
   * icon and a line on what it opens.
   */
  let settingsMenu = null;

  function onSettings() {
    if (settingsMenu && !settingsMenu.released) {
      settingsMenu.release();
      settingsMenu = null;
      return;
    }
    settingsMenu = SE.layer?.menu(
      [
        { heading: 'Steam' },
        { label: 'Settings', hint: 'Account, downloads, display', icon: '--se-icon-settings', keys: 'Ctrl+`', run: openSteamSettings },
        { separator: true },
        { heading: 'Millennium' },
        { label: 'Millennium', hint: 'Themes, plugins, updates', icon: '--se-icon-millennium', keys: 'Ctrl+1', run: openMillennium },
        {
          label: 'Library Manager',
          hint: 'Theme and plugin settings',
          icon: '--se-icon-library-manager',
          keys: 'Ctrl+2',
          run: openLibraryManager,
        },
      ],
      // Beside the rail, its bottom level with the cog's, as every rail menu opens
      SE.layer.besideRail(settingsButton, { foot: true }),
      // Leaving the cog or the menu closes it, as Steam's rail menus close
      { owner: settingsButton, closeOnLeave: true }
    );
    if (!settingsMenu) openSteamSettings();
  }

  /*
   * Games: a button at the rail's foot, between Announcements and Downloads, opening the Games menu
   * (Steam's Games items, laid out in client/navigation/nav-rail.js) beside it.
   */
  function onGames() {
    window.__seRailNav?.toggleGames(gamesButton);
  }

  function ensureExtraButtons(target) {
    if (!settingsButton) {
      settingsButton = makeActionButton('settings', 'Settings', onSettings);
      settingsButton.setAttribute('aria-haspopup', 'menu');
    }
    if (!gamesButton) {
      gamesButton = makeActionButton('games', 'Games', onGames);
      gamesButton.setAttribute('aria-haspopup', 'menu');
    }
    if (settingsButton.parentElement !== target) target.appendChild(settingsButton);
    if (gamesButton.parentElement !== target) target.appendChild(gamesButton);
  }

  function update() {
    frame = 0;
    matchLibraryStrip();
    matchSteamHome();
    geometryDirty = false;

    const announcement = document.querySelector(ANNOUNCEMENT_SELECTOR);
    const sources = PROXY_ACTIONS.map(action => document.querySelector(action.selector));
    if (!announcement || sources.some(source => !source)) {
      group?.remove();
      settingsButton?.remove();
      gamesButton?.remove();
      document.body?.classList.remove('se-header-actions-ready');
      return;
    }

    matchReference(announcement);
    const target =
      announcement.closest(`.${C.BranchBar_TitleBarControls}, .TitleBarControls`) ||
      announcement.parentElement;
    let anchor = announcement;
    while (anchor.parentElement && anchor.parentElement !== target) {
      anchor = anchor.parentElement;
    }

    if (!group) {
      group = document.createElement('div');
      group.className = 'se-header-actions';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Steam actions');
    }
    if (group.parentElement !== target || group.nextElementSibling !== anchor) {
      target.insertBefore(group, anchor);
    }

    ensureExtraButtons(target);
    PROXY_ACTIONS.forEach((action, index) => syncProxyButton(action, sources[index]));
    syncFriendsButton();
    decorateMenuIcons();
    if (!document.body.classList.contains('se-header-actions-ready')) {
      document.body.classList.add('se-header-actions-ready');
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  /*
   * Structure only: no `class` or text watching (both widened the shared observer to every
   * hover and every counter in the window). Download text is followed by downloadObserver,
   * the Announcements button by referenceObserver, layout changes by the ResizeObservers.
   */
  function start() {
    addEventListener('resize', remeasure);
    observer = SE.watch(update, { throttle: 200 });
    // Steam's menu buttons get our icon classes; React rewriting their className would drop
    // them, so class changes inside the menu bars repaint the icons before the next paint.
    menuObserver = SE.watch(decorateMenuIcons, {
      attributes: ['class'],
      scope: [C.RootMenuBar, C.SuperNavBar].filter(Boolean).map((cls) => `.${cls}`).join(', '),
      sync: true,
    });
    update();
  }

  state.destroy = () => {
    for (const divider of coloredDividers) divider.classList.remove('se-library-strip');
    coloredDividers.clear();
    observer?.disconnect();
    menuObserver?.disconnect();
    homeResizeObserver?.disconnect();
    stripObserver?.disconnect();
    stripLists.clear();
    referenceObserver?.disconnect();
    downloadObserver?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    removeEventListener('DOMContentLoaded', start);
    removeEventListener('keydown', onShortcut, true);
    settingsMenu?.release();
    friendsMenu?.release();
    group?.remove();
    settingsButton?.remove();
    gamesButton?.remove();
    removeEventListener('resize', remeasure);
    document.body?.classList.remove('se-header-actions-ready', 'se-hide-library-strip');

    for (const [element, saved] of decorated) {
      element.classList.remove('se-menu-icon');
      element.removeAttribute('data-se-icon');
      for (const [attribute, value] of [
        ['title', saved.title],
        ['aria-label', saved.aria],
      ]) {
        if (value === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, value);
      }
    }
    for (const [element, classes] of styled) {
      element.classList.remove('se-native-header-button', ...classes);
    }
    for (const [property, value] of savedVariables) {
      if (value) document.body.style.setProperty(property, value);
      else document.body.style.removeProperty(property);
    }
    delete window.__seHeaderActions;
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
