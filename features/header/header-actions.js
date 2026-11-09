/* Proxy bottom-bar actions into the header / navigation rail while keeping native components mounted. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  if (window.__steamEnhancedHeaderActions?.version === '1.90.14') return;
  window.__steamEnhancedHeaderActions?.destroy?.();
  const state = (window.__steamEnhancedHeaderActions = { version: '1.90.14' });

  const ANNOUNCEMENT_SELECTOR = `.${C.AnnouncementsButton}:not(.se-header-action):not(.se-native-header-button), .AnnouncementsButton:not(.se-header-action):not(.se-native-header-button)`;
  const PROXY_ACTIONS = [
    { key: 'add', label: 'Add a Game', selector: `.${C.AddGameButton}, .AddGameButton` },
    { key: 'downloads', label: 'Downloads', selector: `.${C.DownloadStatusContent}, .DownloadStatusContent` },
    { key: 'friends', label: 'Friends & Chat', selector: `.${C.FriendsButton}, .FriendsButton` },
  ];

  const proxies = new Map();
  const decorated = new Map();
  const millButtons = [];
  const nativeClasses = [C.Button, C.AnnouncementsButton];
  const styled = new Map();
  const savedVariables = new Map();
  const coloredDividers = new Set();

  let settingsButton;
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
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(event);
        }
      });
    }
    return button;
  }

  const clampPercent = value => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null);
  const parsePercent = text => {
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
  function observeLibraryLists(lists) {
    stripObserver ||= window.ResizeObserver ? new window.ResizeObserver(schedule) : null;
    for (const node of stripLists) {
      if (!node.isConnected) {
        stripObserver?.unobserve(node);
        stripLists.delete(node);
      }
    }
    for (const node of lists) {
      if (stripLists.has(node)) continue;
      stripObserver?.observe(node);
      stripLists.add(node);
    }
  }

  function matchLibraryStrip() {
    const lists = [...document.querySelectorAll(`.${C.GameListHomeAndSearch_Container}`)];
    observeLibraryLists(lists);
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
    const dividerClass = window.__steamEnhancedNativeTooltips?.resolve()?.libraryDivider;
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
      if (home && window.ResizeObserver) {
        homeResizeObserver = new window.ResizeObserver(schedule);
        homeResizeObserver.observe(home);
      }
    }
    if (!home || !menu) return;
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

    const forwardNative = event => {
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

    button.addEventListener('click', event => {
      if (action.key === 'friends' && window.__steamEnhancedFriendsDock?.toggle) {
        event.preventDefault();
        event.stopPropagation();
        window.__steamEnhancedFriendsDock.toggle();
      } else {
        forwardNative(event);
      }
    });

    if (action.key === 'friends') {
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        const dock = window.__steamEnhancedFriendsDock;
        if (dock?.openWindow) dock.openWindow(() => forwardNative(event));
        else forwardNative(event);
      });
    }

    button.addEventListener('keydown', event => {
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

  function ensureExtraButtons(target) {
    if (!settingsButton) {
      settingsButton = makeActionButton('settings', 'Settings', () => {
        if (SE.run(() => window.SteamClient?.URL?.ExecuteSteamURL?.('steam://open/settings')) !== undefined) {
          return;
        }
        location.href = 'steam://open/settings';
      });
    }
    if (settingsButton.parentElement !== target) target.appendChild(settingsButton);

    if (!millButtons.length) {
      millButtons.push(
        makeActionButton('millennium', 'Millennium', () => {
          if (!window.__seMillenniumWindow?.openDirect?.()) {
            window.__seMillenniumWindow?.showError?.();
          }
        }),
        makeActionButton('library-manager', 'Library Manager', () => {
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
        })
      );
    }

    let next = settingsButton;
    for (const btn of [...millButtons].reverse()) {
      if (btn.parentElement !== target || btn.nextElementSibling !== next) {
        target.insertBefore(btn, next);
      }
      next = btn;
    }
  }

  function update() {
    frame = 0;
    matchLibraryStrip();
    matchSteamHome();

    const navIcons = document.querySelectorAll(
      '.se-menu-icon[data-se-icon="store"], .se-menu-icon[data-se-icon="library"], .se-menu-icon[data-se-icon="community"], .se-menu-icon[data-se-icon="profile"], .se-menu-icon[data-se-icon="console"]'
    );
    const navCount = [...navIcons].filter(node => node.getBoundingClientRect().height > 0).length || 5;
    setBodyProperty('--se-rail-nav-count', String(navCount));

    const announcement = document.querySelector(ANNOUNCEMENT_SELECTOR);
    const sources = PROXY_ACTIONS.map(action => document.querySelector(action.selector));
    if (!announcement || sources.some(source => !source)) {
      group?.remove();
      settingsButton?.remove();
      for (const btn of millButtons) btn.remove();
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
    addEventListener('resize', schedule);
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
    group?.remove();
    settingsButton?.remove();
    for (const btn of millButtons) btn.remove();
    removeEventListener('resize', schedule);
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
    delete window.__steamEnhancedHeaderActions;
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
