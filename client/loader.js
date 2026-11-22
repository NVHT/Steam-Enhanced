/*
 * Client loader: which theme files each Steam window gets.
 *
 * skin.json injects core/core.js (the web pages' boot) and this loader into every window
 * (".*"); this file adds the runtime first (core/classmap.js, core/runtime.js) and decides
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
 * The list order is the cascade: a window's stylesheets are @imported in list order by one
 * <style id="se-sheets"> (addStylesheets), so rules that tie on specificity resolve the same in
 * every window. Scripts run in list order (a split feature's parts rely on it), and only
 * once core/runtime.js has published the runtime (window.__se): every script can take it as given.
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
   *   tiers         windows that show achievement rarity tiers: desktop windows and the overlay
   *   tray          plain "Menu" popups: the tray menu's window (client/tray/tray.js checks it
   *                 holds the tray's rows, since other context menus share the title)
   */
  const GROUPS = {
    main: /^Steam$/,
    content: /^(?!.*(?:Menu|Supernav)$|notificationtoasts_)/,
    desktop:
      /^(?!Steam Games List$|.*(?:Menu|Supernav)$|notificationtoasts_|SP Overlay:|OverlayBrowser_|OverlayTab\d+_|SteamBrowser_Find$|Steam Big Picture Mode$|QuickAccess_|MainMenu_)/,
    overlay: /^SP Overlay:/,
    toasts: /^notificationtoasts_/,
    notify: /^(?:Steam$|notificationtoasts_|SP Overlay:)|Menu$/,
    tray: /^Menu$/,
  };
  GROUPS.tiers = { test: (title) => GROUPS.desktop.test(title) || GROUPS.overlay.test(title) };

  /*
   * [group, folder, files]: a feature's files, in list order. The list order is the cascade
   * (stylesheets) and the run order (scripts).
   */
  /** @type {[group: string, folder: string, files: string[]][]} */
  const FEATURES = [
    // Shared runtime pieces
    ['all', 'core/', ['font.css', 'tokens.css', 'icons-nav.css', 'icons-ui.css', 'motion.css', 'images.css', 'images.js', 'levels.css']],
    ['all', 'client/shared/', ['popup-layer.css', 'search-field.css', 'segmented.css']],
    ['main', 'client/shared/', ['plugin-rpc.js', 'popup-layer.js', 'popup-layer-panel.js', 'popup-layer-menu.js', 'picker.js', 'menu.js', 'menu.css', 'picker.css', 'news-feed.js', 'column-resize.css', 'column-resize.js', 'window-fold.js']],
    ['notify', 'client/friends/', ['friend-notification-clicks.js']],
    // In-game overlay
    ['overlay', 'client/overlay/', [
      'overlay.css', 'overlay-views.css', 'overlay-tools.css',
      'context.js', 'data.js', 'sources.js', 'widgets.js', 'dom.js', 'render.js',
      'friends.js', 'notes.js', 'browser.js', 'achievements.js', 'main.js',
    ]],
    ['all', 'client/overlay/', ['overlay-popups.css']],
    ['main', 'client/friends/', ['friends-background.js']],
    // Notification toasts
    ['toasts', 'client/toasts/', [
      'toasts.css', 'context.js', 'config.js', 'steam.js', 'stage.js', 'hub.js', 'placement.js',
      'scan.js', 'compact.js', 'main.js',
    ]],
    // Loading spinner (also holds the mark), then startup, sign-in, entrance
    ['content', 'core/', ['spinner.css']],
    ['content', 'client/startup/', ['startup.css', 'startup.js', 'sign-in.css']],
    ['main', 'client/entrance/', ['entrance.css', 'entrance.js']],
    ['desktop', 'client/shared/', ['native-tooltips.js']],
    // Library, title bar and navigation
    ['main', 'client/library/', ['artwork.css']],
    ['main', 'client/game-page/', ['always-open-game-details.js']],
    ['main', 'client/home/', ['news-hub.js']],
    ['main', 'client/header/', ['header-actions.css', 'header-actions.js']],
    ['main', 'client/browser/', ['url-bar.css', 'url-bar.js']],
    ['main', 'client/navigation/', ['icons.css']],
    ['main', 'client/header/', ['header-tooltips.js', 'downloads-card.css', 'downloads-card.js', 'announcements.js']],
    ['main', 'client/navigation/', ['sidebar-icons.css', 'sidebar-icons.js']],
    ['main', 'client/header/menu/', [
      'shared.js', 'api.js', 'menus.js', 'account.js', 'actions.js', 'hover.js', 'popups.js',
      'placement.js', 'patch.js', 'main.js',
    ]],
    ['main', 'client/navigation/', [
      'nav-rail.css', 'title-bar.css', 'title-bar-filters.css', 'filters-panel.css',
      'title-bar-search.js', 'title-bar.js', 'title-bar-tips.js', 'nav-rail.js', 'filters-panel.js',
    ]],
    ['main', 'client/library/', [
      'library.css', 'library-home.css', 'library-covers.css', 'game-list.css', 'game-list.js',
      'game-drag.css', 'game-drag.js', 'collections.css', 'collections.js',
    ]],
    // The library's right-click menus (games, collections, Home's updates and shelves): part of the Steam menu's patching
    // (client/header/menu/)
    ['main', 'client/library/', ['game-menu.js', 'game-menu-collections.js', 'collection-menu.js', 'home-menus.js']],
    // Text and text fields' right-click menu, laid out by the same code
    ['main', 'client/shared/', ['text-menu.js']],
    // A friend's right-click menu, then the friends list's game, category and group chat menus,
    // laid out by the game menu's code (ns.libraryMenus)
    ['main', 'client/friends/', ['friend-menu.js', 'group-menus.js']],
    // Downloads page
    ['main', 'client/downloads/', [
      'downloads.css', 'downloads-queue.css', 'downloads-buttons.css', 'downloads-library.css',
    ]],
    ['main', 'client/downloads/page/', [
      'shared.js', 'native.js', 'library.js', 'backdrop.js', 'read.js', 'hero.js', 'transfer.js',
      'queue.js', 'drag.js', 'pass.js', 'support.js', 'main.js',
    ]],
    // Friends dock
    ['main', 'client/friends/', ['friends-dock.css', 'friends-dock-chat.css']],
    ['main', 'client/friends/dock/', [
      'templates.js', 'data.js', 'ui.js', 'routing.js', 'flyouts.js', 'embed.js', 'dock.js',
      'chat-popup.js', 'friend-card.js', 'main.js',
    ]],
    ['main', 'client/friends/', ['playing-card.js']],
    ['main', 'client/library/', ['sort-segments.css', 'sort-segments.js']],
    // Library Home
    ['main', 'client/home/', ['home-shelves.css', 'home-shelves.js']],
    ['main', 'client/home/stage/', ['stage.css', 'stage-hero.css', 'stage-settings.css', 'stage-tray.css', 'stage-shelves.css', 'stage-panels.css', 'stage-narrow.css', 'util.js', 'tray.js', 'picks.js', 'stage-settings.js', 'panels-library.js', 'panels-community.js', 'board.js', 'home-mode.js', 'stage.js', 'stage-art.js', 'data.js', 'main.js']],
    // Menus, hover cards, notifications, dialogs
    ['all', 'client/dialogs/', ['dialogs.css']],
    ['content', 'client/dialogs/', ['install.css', 'eula.css']],
    ['all', 'client/shared/', ['hover-cards.css']],
    ['all', 'client/friends/', ['friend-hover.css', 'friend-hover.js']],
    ['main', 'client/shared/', ['hover-cards.js']],
    ['all', 'client/header/', ['notifications.css', 'notifications.js', 'account-menu.css', 'steam-menu.css']],
    ['all', 'client/library/', ['game-menu.css', 'collection-menu.css', 'home-menus.css']],
    ['all', 'client/shared/', ['text-menu.css']],
    ['all', 'client/friends/', ['friend-menu.css', 'group-menus.css']],
    ['all', 'client/header/', ['window-controls.css']],
    // The tray menu (Steam's icon in the Windows tray)
    ['tray', 'client/tray/', ['tray.css', 'tray.js']],
    ['content', 'client/dialogs/utility/', [
      'base.css', 'servers.css', 'media.css', 'library-tools.css', 'modals.css', 'friends.css',
      'standalone.css',
    ]],
    ['content', 'client/dialogs/', ['about-steam.css', 'about-steam.js', 'system-info.css', 'system-info.js', 'system-report.css']],
    ['content', 'client/dialogs/system-report/', ['shared.js', 'parse.js', 'view.js', 'main.js']],
    ['content', 'client/dialogs/', ['add-non-steam.css', 'add-non-steam.js']],
    ['desktop', 'client/dialogs/', [
      'dialog-art.js', 'activate-product.css', 'activate-product.js', 'backups.css', 'backups.js', 'install.js',
      'eula.js', 'uninstall.css', 'uninstall.js', 'new-collection.css', 'new-collection.js',
      'delete-collection.css', 'delete-collection.js', 'mark-private.css', 'mark-private.js',
      'exit-game.css', 'exit-game.js',
    ]],
    // Plugin integrations
    ['main', 'compat/hltb-for-steam/', ['hltb-for-steam.css', 'hltb-for-steam.js']],
    ['all', 'compat/extendium/', ['extendium.css']],
    ['content', 'compat/extendium/', ['manager.js']],
    ['desktop', 'compat/steam-size-on-disk/', ['size-on-disk.css', 'size-on-disk.js']],
    ['main', 'compat/playercount-badge/', ['playercount-badge.css']],
    ['main', 'compat/protondb-library-badges/', ['protondb-library-badges.css']],
    ['tiers', 'client/shared/', ['achievement-tiers.css']],
    ['desktop', 'compat/achievement-manager/', ['achievement-manager.css', 'achievement-manager.js']],
    ['desktop', 'compat/steamgriddb/', ['steamgriddb.css', 'steamgriddb-browser.css', 'steamgriddb.js']],
    // Game page and achievements
    ['main', 'client/game-page/', [
      'layout.css', 'play-bar.css', 'overview.css', 'achievements.css', 'friends.css', 'cards.css',
      'activity.css', 'activity-feed.css', 'activity-comments.css', 'spotlights.css', 'player-count.css',
      'util.js', 'achievements.js',
      'layout.js', 'friends.js', 'activity.js', 'cards.js', 'page.js', 'play-bar.js', 'main.js',
    ]],
    ['main', 'client/achievements/', ['achievements-page.css', 'achievements-page.js']],
    // Friends list and chat windows
    ['desktop', 'client/friends/', ['chat/chat-tooltips.js']],
    ['desktop', 'client/friends/list/', [
      'friends.css', 'friends-search.css', 'friends-rows.css', 'friends-requests.css',
      'friends-chats.css', 'friends-window.css', 'friends-list.js',
    ]],
    ['desktop', 'client/friends/chat/', [
      'tabs.css', 'header.css', 'messages.css', 'input.css', 'voice.css', 'members.css', 'icons.css',
      'groups.css', 'chat.js',
    ]],
    ['all', 'core/', ['scrollbars.css', 'scrollbars.js']],
    ['all', 'core/', ['emoticon-picker.css', 'emoticon-picker.js']],
    // Settings, game properties, Millennium, storage
    ['desktop', 'client/settings/', [
      'layout.css', 'controls.css', 'pages.css', 'storage.css', 'search.css', 'game-properties.css',
      'game-properties-install.css', 'game-properties-extras.css', 'spacing.css',
    ]],
    ['desktop', 'client/settings/dialog/', [
      'shared.js', 'options.js', 'search.js', 'window.js', 'sidebar.js', 'layout.js', 'props-pages.js',
      'props-header.js', 'props.js', 'main.js',
    ]],
    ['desktop', 'client/settings/millennium/', [
      'millennium.css', 'millennium-window.css', 'millennium-redesign.css', 'millennium-editor.css',
      'millennium-plugins.css', 'millennium-updates.css', 'millennium-logs.css', 'millennium-general.css',
      'millennium-icons.js', 'millennium-plugins.js', 'millennium-updates.js', 'millennium-logs.js',
      'millennium-pages.js',
    ]],
    // Brew Hub's page in Millennium Settings: after the Millennium files, whose icons and fillHeight it reads
    ['desktop', 'compat/brew-hub/', ['brew-hub.css', 'brew-hub.js']],
    ['main', 'client/settings/millennium/', ['millennium-window.js']],
    ['main', 'client/settings/library-manager/', ['library-manager.css', 'library-manager.js']],
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
    'core/emoticon-picker.css',
    'core/emoticon-picker.js',
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
      `${WAIT},${LIFT}{background:var(--se-bg,#171a20)!important}` + // the token once loaded; its value before
      `${WAIT}::after,${LIFT}::after{content:"";position:fixed;inset:0;z-index:2147483646;` +
      'background:var(--se-bg,#171a20);will-change:opacity}' +
      `${WAIT}::after{animation:se-cover-out ${lift}ms ease ${FALLBACK_MS}ms forwards}` +
      `${LIFT}::after{pointer-events:none;animation:se-cover-lift ${lift + 60}ms cubic-bezier(.4,0,.2,1) 40ms both}` +
      '@keyframes se-cover-out{to{opacity:0;visibility:hidden}}' + // hidden lets clicks through
      '@keyframes se-cover-lift{from{opacity:1}to{opacity:0}}';
    if (kind !== 'logo') return css;
    // The mark: fades in, breathes while the window loads; on the lift it swells and dissolves.
    // The cover gets a faint blue halo where it sits.
    css +=
      `${WAIT}::after,${LIFT}::after{background:radial-gradient(circle at 50% 50%,` +
      'color-mix(in srgb,var(--se-color-accent,#7cc4ff) 9%,transparent),transparent 160px) var(--se-bg,#171a20)}' +
      `${WAIT}::before,${LOGO_LIFT}::before{content:"";position:fixed;top:50%;left:50%;z-index:2147483647;` +
      'width:72px;height:72px;margin:-36px 0 0 -36px;pointer-events:none;background:var(--se-text,#e6e8eb);' + // --se-text
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
    // Its own observer on purpose: the loader runs before the runtime (and its shared observer) exists; it lives only until the first window settles
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

  /*
   * The window's stylesheets, file → URL in list order (the cascade). Parts that hand theme files
   * to other windows read it (client/shared/popup-layer.js, compat/steamgriddb/steamgriddb.js).
   */
  const sheets = new Map();

  /*
   * Every stylesheet goes in through one <style> of @imports, in list order. Chromium matches an
   * element against each sheet on its own, and imports fold into the sheet importing them: the
   * main window's 135 links cost a full style pass ~58 ms, the same files imported ~43 ms
   * (dev/perf.js probe). Each file keeps its own URL, so its url()s and the cache work as before.
   * Its load event comes once every import is in.
   */
  const addStylesheets = () => {
    const style = document.createElement('style');
    style.id = 'se-sheets';
    style.setAttribute('blocking', 'render'); // no flash of Steam's own look on a window's first paint
    style.textContent = [...sheets.values()].map((href) => `@import url("${href}");`).join('\n');
    if (MENU) style.addEventListener('load', remeasureMenu, { once: true });
    if (sheets.has('core/tokens.css')) style.addEventListener('load', readEntrance, { once: true });
    track(style);
    head.append(style);
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
   * Stylesheets go in at once. Scripts wait for the runtime (window.__se): core/classmap.js and
   * core/runtime.js, which this loader adds first, in order; the wait holds the cover like any
   * pending file.
   */
  const RUNTIME = ['core/classmap.js', 'core/runtime.js'];
  const load = () => {
    const scripts = [];
    for (const [group, file] of FILES) {
      if (!groups.has(group) || added.has(file) || (onWeb && !WEB_FILES.has(file))) continue;
      added.add(file);
      if (file.endsWith('.css')) sheets.set(file, asset(file));
      else scripts.push(file);
    }
    if (sheets.size) addStylesheets();
    if (window.__se) {
      scripts.forEach(addScript);
      return;
    }
    // The profiler, once armed (Ctrl+Shift+P, core/core.js): before the runtime, so it times
    // everything the theme starts
    try {
      if (!onWeb && localStorage.getItem('se-perf') === '1') addScript('dev/perf.js');
    } catch {}
    for (const file of RUNTIME) {
      if (added.has(file)) continue;
      added.add(file);
      addScript(file);
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

  window.__seClient = { groups, files: added, sheets };
  load();
  if (!pending) settle(); // nothing to wait for
})();
