/*
 * Client loader: which theme files each Steam window gets.
 *
 * skin.json injects core/core.js and this loader into every window (".*"); this file decides
 * the rest. It sorts the window into groups by its title (GROUPS below) and adds every file
 * listed for those groups, in list order. To add a feature or a window group, edit this file
 * only: no skin.json change, no Steam restart.
 *
 * A feature split into parts is listed part by part, in the order its parts run. The parts are
 * classic scripts sharing one namespace object (window.__se<Feature>Parts): each takes what
 * earlier parts published, looks up later parts' names when it calls them, and publishes what
 * others use; a value parts reassign lives on the namespace's `live`. Not ES modules: in Steam's
 * popup windows a module's imports can stall (they did for the toasts), and a module's strict
 * mode throws on writes to Steam's objects that a classic script skips, which the theme's
 * patching relies on (the Steam menu). Every script here is a classic one.
 *
 * The list order is the cascade. Each stylesheet's <link> carries its list position and goes in
 * among the theme's other links by that position, so rules that tie on specificity resolve the
 * same in every window. Scripts run in list order (a split feature's parts rely on it), and only
 * once core/core.js has published the runtime (window.__se): every script can take it as given.
 *
 * Files load with the loader's own query string, so whatever cache-busting Millennium puts on
 * this file carries over to every file.
 *
 * Web pages: skin.json's patches match web views too, so this loader also runs on Store,
 * Community and other web pages. Those have their own loaders (core/core.js starts them); here
 * they get only WEB_FILES, the window-agnostic basics. Client windows are served from
 * steamloopback.host or are about:blank popups of it.
 */
(() => {
  if (window.__seClient) return;

  /*
   * Window groups, by document.title (Millennium matched this window by the same title):
   *   all           every client window
   *   main          the main Steam window
   *   content       every window but menus and notification toasts
   *   desktop       content windows minus the overlay, Big Picture, Quick Access, Main Menu,
   *                 the Games List and browser find bars
   *   overlay       the in-game overlay
   *   toasts        notification toasts
   *   notify        windows a friend notification can be clicked in (main, toasts, overlay, menus)
   *   achievements  the main window and the overlay
   */
  const GROUPS = {
    main: /^Steam$/,
    content: /^(?!.*(?:Menu|Supernav)$|notificationtoasts_)/,
    desktop:
      /^(?!Steam Games List$|.*(?:Menu|Supernav)$|notificationtoasts_|SP Overlay:|OverlayBrowser_|OverlayTab\d+_|SteamBrowser_Find$|Steam Big Picture Mode$|QuickAccess_|MainMenu_)/,
    overlay: /^SP Overlay:/,
    toasts: /^notificationtoasts_/,
    notify: /^(?:Steam$|notificationtoasts_|SP Overlay:)|Menu$/,
    achievements: /^(?:Steam$|SP Overlay:)/,
  };

  /*
   * [group, folder, files]: a feature's files, in list order. The list order is the cascade
   * (stylesheets) and the run order (scripts).
   */
  /** @type {[group: string, folder: string, files: string[]][]} */
  const FEATURES = [
    // Shared runtime pieces
    ['all', 'core/', ['font.css', 'tokens.css', 'images.css', 'images.js']],
    ['main', 'core/', ['plugin-rpc.js']],
    ['notify', 'client/friends/', ['friend-notification-clicks.js']],
    // In-game overlay
    ['overlay', 'client/overlay/', [
      'overlay.css', 'context.js', 'data.js', 'sources.js', 'widgets.js', 'dom.js', 'render.js',
      'friends.js', 'notes.js', 'browser.js', 'achievements.js', 'main.js',
    ]],
    ['all', 'client/overlay/', ['overlay-popups.css']],
    ['main', 'client/friends/', ['friends-background.js']],
    // Notification toasts
    ['toasts', 'client/toasts/', [
      'toasts.css', 'context.js', 'config.js', 'steam.js', 'stage.js', 'hub.js', 'placement.js',
      'scan.js', 'compact.js', 'main.js',
    ]],
    // Startup, sign-in, entrance, spinner
    ['content', 'client/startup/', ['startup.css', 'startup.js', 'sign-in.css']],
    ['main', 'client/entrance/', ['entrance.css', 'entrance.js']],
    ['content', 'client/spinner/', ['spinner.css', 'spinner.js']],
    ['desktop', 'core/', ['native-tooltips.js']],
    // Library, title bar and navigation
    ['main', 'client/library/', ['artwork.css']],
    ['main', 'client/game-page/', ['always-open-game-details.js']],
    ['main', 'client/home/', ['news-hub.js']],
    ['main', 'client/header/', ['header-actions.css', 'header-actions.js']],
    ['main', 'client/browser/', ['url-bar.css', 'url-bar.js']],
    ['main', 'client/navigation/', ['icons.css']],
    ['main', 'client/header/', ['header-tooltips.js']],
    ['main', 'client/navigation/', ['sidebar-icons.css', 'sidebar-icons.js']],
    ['main', 'client/header/menu/', [
      'shared.js', 'api.js', 'menus.js', 'account.js', 'actions.js', 'hover.js', 'popups.js',
      'placement.js', 'patch.js', 'main.js',
    ]],
    ['main', 'client/navigation/', ['nav-rail.css', 'nav-rail.js']],
    ['main', 'client/library/', [
      'library.css', 'game-list.css', 'game-list.js', 'game-drag.css', 'game-drag.js',
      'collections.css', 'collections.js',
    ]],
    // Downloads page
    ['main', 'client/downloads/', ['downloads.css']],
    ['main', 'client/downloads/page/', [
      'shared.js', 'native.js', 'library.js', 'backdrop.js', 'read.js', 'hero.js', 'transfer.js',
      'queue.js', 'drag.js', 'pass.js', 'debug.js', 'main.js',
    ]],
    // Friends dock
    ['main', 'client/friends/', ['friends-dock.css']],
    ['main', 'client/friends/dock/', [
      'templates.js', 'data.js', 'ui.js', 'routing.js', 'flyouts.js', 'embed.js', 'dock.js',
      'chat-popup.js', 'main.js',
    ]],
    ['main', 'client/library/', ['sort-segments.css', 'sort-segments.js']],
    // Library Home
    ['main', 'client/home/', ['home-polish.css', 'home-polish.js', 'home-stage.css']],
    ['main', 'client/home/stage/', ['util.js', 'tray.js', 'picks.js', 'stage.js', 'data.js', 'news.js', 'main.js']],
    // Menus, hover cards, notifications, dialogs
    ['all', 'client/dialogs/', ['dialogs.css']],
    ['content', 'client/dialogs/', ['install.css', 'eula.css']],
    ['all', 'client/dialogs/', ['hover-cards.css']],
    ['all', 'client/friends/', ['friend-hover.css', 'friend-hover.js']],
    ['main', 'client/dialogs/', ['hover-cards.js']],
    ['all', 'client/header/', ['notifications.css', 'notifications.js']],
    ['all', 'client/dialogs/', ['window-controls.css']],
    ['content', 'client/dialogs/utility/', [
      'base.css', 'servers.css', 'media.css', 'library-tools.css', 'modals.css', 'friends.css',
      'standalone.css',
    ]],
    ['content', 'client/dialogs/', ['about-steam.css', 'about-steam.js', 'system-info.css', 'system-info.js', 'system-report.css']],
    ['content', 'client/dialogs/system-report/', ['shared.js', 'parse.js', 'view.js', 'main.js']],
    ['content', 'client/dialogs/', ['add-non-steam.css', 'add-non-steam.js']],
    ['desktop', 'client/dialogs/', [
      'activate-product.css', 'activate-product.js', 'backups.css', 'backups.js', 'install.js',
      'eula.js', 'uninstall.css', 'uninstall.js',
    ]],
    // Plugin integrations
    ['main', 'compat/hltb-for-steam/', ['hltb-for-steam.css', 'hltb-for-steam.js']],
    // Game page and achievements
    ['achievements', 'core/', ['achievement-tiers.css']],
    ['main', 'client/game-page/', [
      'layout.css', 'play-bar.css', 'overview.css', 'achievements.css', 'friends.css', 'cards.css',
      'activity.css', 'spotlights.css', 'player-count.css', 'util.js', 'achievements.js',
      'layout.js', 'friends.js', 'activity.js', 'cards.js', 'page.js', 'play-bar.js', 'main.js',
    ]],
    ['main', 'client/achievements/', ['achievements-page.css', 'achievements-page.js']],
    // Friends list and chat windows
    ['desktop', 'client/friends/', ['chat/chat-tooltips.js', 'friends.css', 'friends-list.js']],
    ['desktop', 'client/friends/chat/', [
      'tabs.css', 'header.css', 'messages.css', 'input.css', 'voice.css', 'members.css', 'icons.css',
      'groups.css', 'chat.js',
    ]],
    ['all', 'core/', ['scrollbars.css', 'scrollbars.js']],
    ['all', 'client/friends/', ['emoticon-picker.css', 'emoticon-picker.js']],
    // Settings, game properties, Millennium, storage
    ['desktop', 'client/settings/', [
      'layout.css', 'controls.css', 'pages.css', 'storage.css', 'search.css', 'game-properties.css',
      'finishing.css',
    ]],
    ['desktop', 'client/settings/dialog/', [
      'shared.js', 'options.js', 'search.js', 'window.js', 'sidebar.js', 'layout.js', 'props-pages.js',
      'props.js', 'main.js',
    ]],
    ['desktop', 'client/settings/', ['millennium.css', 'millennium-pages.js']],
    ['main', 'client/settings/', ['millennium-window.js', 'library-manager.css', 'library-manager.js']],
    ['main', 'client/game-page/', ['player-count.js']],
  ];
  /** [group, file] in list order */
  const FILES = FEATURES.flatMap(([group, folder, files]) => files.map((file) => [group, folder + file]));

  /** What web pages take from this list: the broken-image guard, scrollbars, emoticon picker. */
  const WEB_FILES = new Set([
    'core/images.css',
    'core/images.js',
    'core/scrollbars.css',
    'core/scrollbars.js',
    'client/friends/emoticon-picker.css',
    'client/friends/emoticon-picker.js',
  ]);
  const onWeb = /^https?:$/.test(location.protocol) && location.hostname !== 'steamloopback.host';

  const self =
    document.currentScript?.src ||
    [...document.scripts].find((script) => /\/client\/loader\.js(?:[?#]|$)/.test(script.src))?.src;
  if (!self) {
    console.warn('[Steam Enhanced] Client loader: theme folder not found from this window.');
    return;
  }

  const query = new URL(self).search;
  const asset = (file) => {
    const url = new URL(`../${file}`, self);
    url.search = query;
    return url.href;
  };

  const root = document.documentElement;
  const head = document.head ?? root;
  const groups = new Set(['all']);
  if (!onWeb) {
    for (const [group, test] of Object.entries(GROUPS)) if (test.test(document.title)) groups.add(group);
  }
  const added = new Set();

  /*
   * No flash of Steam's own look. `blocking="render"` only holds a first paint the loader beats,
   * and Millennium may inject it after <body> exists. So, as core/core.js does on web pages,
   * the window waits under a cover until every file it was given has loaded (scripts run, so
   * features have started), then for the main thread's first idle moment, so the theme's first
   * DOM work is done before anything shows. [data-se-styled] then lifts the cover. If a file never settles, a CSS timer lifts it
   * anyway at FALLBACK_MS. Menus aren't guarded: they open often and get little from the theme.
   *
   * The main window waits longer. Steam first shows its own loading spinner there, then builds
   * the Library over a second or two (hero, tiles, What's New, art, the Friends dock), so it
   * holds the cover until that has settled: no big Steam spinner on screen, no bursts of new
   * elements, no pictures in view still loading, for SETTLE_QUIET_MS in a row (so the gap
   * between Steam's spinner going and the Library starting isn't taken for the end), checked
   * every SETTLE_STEP_MS, for at most SETTLE_MAX_MS. The whole page then shows at once instead
   * of piece by piece.
   *
   * Opaque windows: the cover is html::after, a plain sheet of the theme's background over the
   * window, which draws underneath it as normal. Lifting it fades that one sheet (opacity, on
   * the compositor), so the entrance stays smooth however busy the page is; animating the
   * window itself would repaint all of it every frame, at exactly the busiest moment. With the
   * logo entrance, if the wait passes LOGO_MS, the theme's mark (html::before) fades in on the cover and breathes;
   * on the lift it swells and dissolves while the cover fades from under it.
   *
   * Transparent windows (overlay, toasts, Big Picture side menus) can't take a cover over the
   * game: their body is just hidden until ready, then shown.
   */
  const MENU = /(?:Menu|Supernav)$/.test(document.title); // menus and the store's dropdowns
  const TRANSPARENT = /^(?:SP Overlay:|notificationtoasts_|OverlayBrowser_|OverlayTab\d+_|QuickAccess_|MainMenu_)/;
  const MAIN = groups.has('main');
  const LOGO_MS = 250;
  const SETTLE_STEP_MS = 150;
  const SETTLE_QUIET_MS = 450;
  const SETTLE_MAX_MS = 3000;
  const SETTLE_BURST = 6; // new elements per step that still count as building
  const FALLBACK_MS = MAIN ? SETTLE_MAX_MS + 500 : 1500;
  const LIFT_MS = 300;
  const IDLE_MAX_MS = 400;
  let pending = 0;
  let revealed =
    onWeb || // core/core.js guards web pages
    MENU ||
    root.hasAttribute('data-se-styled') ||
    !!document.getElementById('se-guard');

  const WAIT = 'html:not([data-se-styled])';
  const LIFT = 'html[data-se-lifting]';
  const LOGO_LIFT = 'html[data-se-lifting="logo"]';
  // The theme's mark (--se-brand-icon in client/navigation/nav-rail.css), used as a mask
  const BRAND = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%2292 92 328 328%22%3E%3Cdefs%3E%3CclipPath id=%22c%22%3E%3Ccircle cx=%22256%22 cy=%22256%22 r=%22146%22/%3E%3C/clipPath%3E%3Cmask id=%22k%22 maskUnits=%22userSpaceOnUse%22 x=%2292%22 y=%2292%22 width=%22328%22 height=%22328%22%3E%3Crect x=%2292%22 y=%2292%22 width=%22328%22 height=%22328%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22302%22 cy=%22212%22 r=%2235.5%22 fill=%22%23000%22/%3E%3Ccircle cx=%22302%22 cy=%22212%22 r=%2225.5%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22218%22 cy=%22304%22 r=%2226.5%22 fill=%22%23000%22/%3E%3Cpath d=%22M 218 304 L 94 252%22 stroke=%22%23000%22 stroke-width=%2248%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M 218 304 L 94 252%22 stroke=%22%23fff%22 stroke-width=%2235%22 stroke-linecap=%22round%22/%3E%3Ccircle cx=%22218%22 cy=%22304%22 r=%2218.5%22 fill=%22%23fff%22/%3E%3C/mask%3E%3C/defs%3E%3Ccircle cx=%22256%22 cy=%22256%22 r=%22150%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%2222%22/%3E%3Cg clip-path=%22url%28%23c%29%22%3E%3Cg fill=%22%23000%22 fill-opacity=%22.32%22%3E%3Crect width=%22104%22 height=%22144%22 rx=%2214%22 transform=%22translate%28216 232%29 rotate%28-15%29 translate%28-52 -72%29%22/%3E%3Crect width=%22108%22 height=%22148%22 rx=%2214%22 transform=%22translate%28248 226%29 rotate%28-3%29 translate%28-54 -74%29%22/%3E%3Crect width=%22108%22 height=%22148%22 rx=%2214%22 transform=%22translate%28280 234%29 rotate%2810%29 translate%28-54 -74%29%22/%3E%3C/g%3E%3Cg mask=%22url%28%23k%29%22%3E%3Cpath d=%22M 189.2 282.4 L 262.1 178.4 A 52 52 0 1 1 335.6 251.9 L 241.6 330.8 A 36 36 0 1 1 189.2 282.4 Z%22 fill=%22%23000%22/%3E%3Cpath d=%22M 218 304 L 94 252%22 stroke=%22%23000%22 stroke-width=%2235%22 stroke-linecap=%22round%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")';
  // The lift's animations have their own names: a CSS animation that keeps its name keeps its
  // clock, so reusing the fallback's would start the lift part-way through (or already over).
  /*
   * The entrance is a setting: --se-entrance in core/tokens.css (splash | logo | fade | none).
   * The guard runs before tokens.css is in, so it starts from the last value seen (kept in
   * localStorage, shared by every client window) and redraws itself once tokens.css loads, so a
   * change shows on the window's own first load. <html data-se-entrance> carries it.
   *
   * "splash" is the main window's: client/entrance/ mounts the splash over the cover, and the
   * reveal hands over to it (finish()) instead of lifting the cover, so its "Ready" lands on the
   * finished Library. Other windows take the logo entrance with it, and the main window falls
   * back to a plain lift if the splash never mounted.
   */
  const ENTRANCES = ['splash', 'logo', 'fade', 'none'];
  const ENTRANCE_KEY = 'se-entrance';
  let entrance = 'splash';
  try {
    const saved = localStorage.getItem(ENTRANCE_KEY);
    if (ENTRANCES.includes(saved)) entrance = saved;
  } catch {}

  // The cover each entrance uses: the splash draws its own over a plain one
  const coverKind = (setting = entrance) => (setting !== 'splash' ? setting : MAIN ? 'fade' : 'logo');
  // The cover for each entrance (see the top of this section)
  const coverCSS = (setting) => {
    const kind = coverKind(setting);
    const lift = kind === 'none' ? 0 : LIFT_MS;
    let css =
      `${WAIT},${LIFT}{background:#171a20!important}` + // --se-bg
      `${WAIT}::after,${LIFT}::after{content:"";position:fixed;inset:0;z-index:2147483646;` +
      'background:#171a20;will-change:opacity}' +
      `${WAIT}::after{animation:se-cover-out ${lift}ms ease ${FALLBACK_MS}ms forwards}` +
      `${LIFT}::after{pointer-events:none;animation:se-cover-lift ${lift + 60}ms cubic-bezier(.4,0,.2,1) 40ms both}` +
      '@keyframes se-cover-out{to{opacity:0;visibility:hidden}}' + // hidden lets clicks through
      '@keyframes se-cover-lift{from{opacity:1}to{opacity:0}}';
    if (kind !== 'logo') return css;
    // The mark: fades in, breathes while the window loads; on the lift it swells and dissolves.
    // The cover gets a faint blue halo where it sits.
    css +=
      `${WAIT}::after,${LIFT}::after{background:radial-gradient(circle at 50% 50%,` +
      'rgba(124,196,255,.09),rgba(124,196,255,0) 160px) #171a20}' +
      `${WAIT}::before,${LOGO_LIFT}::before{content:"";position:fixed;top:50%;left:50%;z-index:2147483647;` +
      'width:72px;height:72px;margin:-36px 0 0 -36px;pointer-events:none;background:#e6edf3;' + // --se-text
      `-webkit-mask:${BRAND} center/contain no-repeat;mask:${BRAND} center/contain no-repeat;` +
      'will-change:opacity,scale}' +
      `${WAIT}::before{opacity:0;animation:se-logo-in .4s ease-out ${LOGO_MS}ms forwards,` +
      `se-logo-breathe 2.4s ease-in-out ${LOGO_MS}ms infinite,se-cover-out .3s ${FALLBACK_MS}ms forwards}` +
      `${LOGO_LIFT}::before{animation:se-logo-lift ${LIFT_MS}ms cubic-bezier(.2,.6,.3,1) forwards}` +
      '@keyframes se-logo-in{from{opacity:0}to{opacity:.92}}' +
      '@keyframes se-logo-breathe{0%,100%{scale:1}50%{scale:.94}}' +
      '@keyframes se-logo-lift{from{opacity:.92;scale:1}60%{opacity:0}to{opacity:0;scale:1.5}}' +
      `@media (prefers-reduced-motion:reduce){${WAIT}::before{animation-name:se-logo-in,none,se-cover-out}` +
      '@keyframes se-logo-lift{from{opacity:.92}to{opacity:0}}}';
    return css;
  };
  const HIDE =
    `${WAIT} body{visibility:hidden;animation:se-guard ${FALLBACK_MS}ms step-end forwards}` +
    '@keyframes se-guard{to{visibility:visible}}';

  let guard = null;
  if (!revealed) {
    guard = document.createElement('style');
    guard.id = 'se-guard';
    guard.textContent = TRANSPARENT.test(document.title) ? HIDE : coverCSS(entrance);
    head.append(guard);
    root.dataset.seEntrance = entrance;
  }

  /** Called once tokens.css has loaded: picks up a changed --se-entrance. */
  const readEntrance = () => {
    const value = getComputedStyle(root).getPropertyValue('--se-entrance').trim().toLowerCase();
    if (!ENTRANCES.includes(value) || value === entrance) return;
    entrance = value;
    try {
      localStorage.setItem(ENTRANCE_KEY, value);
    } catch {}
    if (guard && !revealed) {
      root.dataset.seEntrance = value;
      if (!TRANSPARENT.test(document.title)) guard.textContent = coverCSS(value);
    }
  };

  const started = performance.now();
  const reveal = () => {
    if (revealed || pending) return;
    revealed = true;
    const waited = performance.now() - started;
    const splash = MAIN && entrance === 'splash' ? window.__seEntrance : null;
    if (!splash) window.__seEntrance?.destroy(); // mounted from a stale saved setting
    if (splash) {
      splash.finish(); // the splash covers the window; the cover underneath just goes
    } else if (waited < FALLBACK_MS && entrance !== 'none' && !TRANSPARENT.test(document.title)) {
      root.setAttribute('data-se-lifting', coverKind() === 'logo' && waited > LOGO_MS ? 'logo' : '');
      setTimeout(() => root.removeAttribute('data-se-lifting'), LIFT_MS + 120);
    }
    root.setAttribute('data-se-styled', '');
  };
  // Steam's big loading spinner (the main window's, before the Library), not the small ones
  // inside panels
  const loadingScreen = () =>
    [...document.querySelectorAll('.SteamLogoThrobber, img[src*="steam_spinner.png"]')].some((el) => {
      const box = el.getBoundingClientRect();
      return box.width >= 64 && box.bottom > 0 && box.top < innerHeight;
    });
  const imagesLoading = () =>
    [...document.images].some((img) => {
      if (img.complete) return false;
      const box = img.getBoundingClientRect();
      return box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    });
  // The main window's Library build (see above); other windows are done once their files are.
  const whenSettled = (done) => {
    if (!MAIN || !document.body) return done();
    let added = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) added++;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    let busyAt = performance.now();
    const check = () => {
      const now = performance.now();
      if (added > SETTLE_BURST || loadingScreen() || imagesLoading()) busyAt = now;
      added = 0;
      if (now - busyAt < SETTLE_QUIET_MS && document.visibilityState === 'visible' && now - started < SETTLE_MAX_MS) {
        setTimeout(check, SETTLE_STEP_MS);
        return;
      }
      observer.disconnect();
      done();
    };
    setTimeout(check, SETTLE_STEP_MS);
  };
  // Idle callbacks and frames don't run in a hidden window, so one that loads in the background
  // reveals at once.
  const settle = () =>
    whenSettled(() => {
      if (document.visibilityState !== 'visible') reveal();
      else if (window.requestIdleCallback) requestIdleCallback(reveal, { timeout: IDLE_MAX_MS });
      else requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
  const track = (el) => {
    if (revealed) return;
    pending++;
    const done = () => {
      if (--pending === 0) settle();
    };
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', done, { once: true });
  };

  /*
   * Menus: Steam sizes a menu's popup window to the menu as it first measures it, which in a new
   * submenu window is before the theme's stylesheets and font are in, so the window came out too
   * short (last items cut off) or too tall. Steam measures again whenever the menu's DOM changes
   * (its MutationObserver), so once each sheet and the font have loaded, an empty comment put in
   * and taken straight out has it size the window to the themed menu.
   */
  let remeasureQueued = false;
  const remeasureMenu = () => {
    if (remeasureQueued) return;
    remeasureQueued = true;
    requestAnimationFrame(() => {
      remeasureQueued = false;
      const host = document.querySelector('[role="menuitem"], [class*="MenuItem"]')?.parentElement;
      if (!host) return;
      const mark = document.createComment('');
      host.append(mark);
      mark.remove();
    });
  };
  if (MENU) {
    document.fonts?.addEventListener?.('loadingdone', remeasureMenu);
    document.fonts?.ready.then(remeasureMenu);
  }

  /** Puts a stylesheet among the theme's own by list position, so the cascade matches the list. */
  const addStylesheet = (file, order) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(file);
    link.setAttribute('blocking', 'render'); // no flash of Steam's own look on a window's first paint
    link.dataset.seFile = file;
    link.dataset.seOrder = String(order);
    if (MENU) link.addEventListener('load', remeasureMenu, { once: true });
    if (file === 'core/tokens.css') link.addEventListener('load', readEntrance, { once: true });
    const theme = [...head.querySelectorAll(':scope > link[data-se-order]')];
    const next = theme.find((el) => Number(el.dataset.seOrder) > order);
    if (next) next.before(link);
    else if (theme.length) theme[theme.length - 1].after(link);
    else head.append(link);
    track(link);
  };

  const addScript = (file) => {
    const script = document.createElement('script');
    script.src = asset(file);
    script.async = false; // run in list order: a split feature's parts rely on it
    script.dataset.seFile = file;
    track(script);
    head.append(script);
  };

  /*
   * Stylesheets go in at once. Scripts wait for core/core.js's runtime (window.__se), which
   * Millennium normally injects first; the wait holds the cover like any pending file.
   */
  const load = () => {
    const scripts = [];
    FILES.forEach(([group, file], order) => {
      if (!groups.has(group) || added.has(file) || (onWeb && !WEB_FILES.has(file))) return;
      added.add(file);
      if (file.endsWith('.css')) addStylesheet(file, order);
      else scripts.push(file);
    });
    if (window.__se) {
      scripts.forEach(addScript);
      return;
    }
    pending++;
    addEventListener(
      'se-core',
      () => {
        scripts.forEach(addScript);
        if (--pending === 0) settle();
      },
      { once: true }
    );
  };

  window.__seClient = { groups, files: added };
  load();
  if (!pending) settle(); // nothing to wait for
})();
