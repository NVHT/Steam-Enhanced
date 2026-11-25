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
 * popup windows a module's imports can stall (the toasts' windows among them), and a module's strict
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
    // The theme's settings, kept in step in every window (their stylesheets: applyOptions below)
    ['all', 'client/shared/', ['settings-palette.js', 'settings.js']],
    // A friend's profile background and Steam's "?" picture (toasts, tray, chat, friend dialogs)
    ['content', 'client/shared/', ['mini-profile.js']],
    ['toasts', 'client/shared/', ['mini-profile.js']],
    ['tray', 'client/shared/', ['mini-profile.js']],
    // A page or steam:// link opened in the main window (the rail's menus, About Steam)
    ['content', 'client/shared/', ['open-page.js']],
    // Steam's own confirm dialog for a theme prompt (Reload UI during a call)
    ['main', 'client/shared/', ['steam-confirm.js']],
    ['main', 'client/shared/', ['plugin-rpc.js', 'popup-layer.js', 'popup-layer-panel.js', 'popup-layer-menu.js', 'picker.js', 'menu.js', 'menu.css', 'picker.css', 'news-feed.js', 'column-resize.css', 'column-resize.js', 'window-fold.js']],
    // Steam's live download feed: the rail's card and the Downloads page (main), Settings ›
    // Downloads (the settings window)
    ['desktop', 'client/shared/', ['download-feed.js']],
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
      'card.css', 'toasts.css', 'card.js', 'context.js', 'config.js', 'steam.js', 'stage.js', 'hub.js', 'placement.js',
      'scan.js', 'compact.js', 'main.js',
    ]],
    // Loading spinner (also holds the mark), the Library wireframe, then startup, sign-in, entrance
    ['content', 'core/', ['spinner.css']],
    ['content', 'client/shared/', ['wireframe.css', 'wireframe.js']],
    ['content', 'client/startup/', ['startup.css', 'startup.js', 'sign-in.css']],
    ['main', 'client/entrance/', ['entrance.css', 'entrance.js']],
    ['desktop', 'client/shared/', ['native-tooltips.js']],
    // Library, title bar and navigation
    ['main', 'client/library/', ['artwork.css']],
    ['main', 'client/game-page/', ['always-open-game-details.js']],
    ['main', 'client/home/', ['news-hub.js']],
    ['main', 'client/header/', ['header-actions.css', 'header-shortcuts.js', 'header-actions.js']],
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
    // Started on a Store or Community page: the Library rendered once, so its list is beside it
    ['main', 'client/library/', ['start-on-page.js']],
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
    // A call bar's stand-ins for Steam's call buttons (the dock's flyout, chat windows: SE.callTools)
    ['desktop', 'client/friends/', ['call-tools.js']],
    // Friends dock
    ['main', 'client/friends/', [
      'friends-dock.css', 'friends-dock-chat.css', 'friends-dock-chat-group.css',
      'friends-dock-chat-rail.css',
    ]],
    ['main', 'client/friends/dock/', [
      'templates.js', 'data.js', 'ui.js', 'routing.js', 'flyouts.js', 'member-list.js', 'embed.js',
      'dock.js', 'chat-popup.js', 'friend-card.js', 'main.js',
    ]],
    ['main', 'client/friends/', ['playing-card.js']],
    ['main', 'client/library/', ['sort-segments.css', 'sort-segments.js']],
    // Library Home
    ['main', 'client/home/', ['home-shelves.css', 'home-shelves.js']],
    ['main', 'client/home/stage/', ['stage.css', 'stage-hero.css', 'stage-settings.css', 'stage-tray.css', 'stage-shelves.css', 'stage-panels.css', 'stage-narrow.css', 'util.js', 'tray.js', 'picks.js', 'stage-settings.js', 'panels-library.js', 'panels-community.js', 'board.js', 'home-mode.js', 'stage.js', 'stage-art.js', 'data.js', 'main.js']],
    // Menus, hover cards, notifications, dialogs
    ['all', 'client/dialogs/', ['dialogs.css', 'confirm.css']],
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
    // A rebuilt dialog's tooltips and copied flash (About Steam, System Information, System Report)
    ['content', 'client/shared/', ['dialog-controls.css', 'dialog-controls.js']],
    ['content', 'client/dialogs/', ['about-steam.css', 'about-steam.js', 'system-info.css', 'system-info.js', 'survey.css', 'survey.js', 'system-report.css']],
    ['content', 'client/dialogs/system-report/', ['shared.js', 'parse.js', 'view.js', 'main.js']],
    ['content', 'client/dialogs/', ['add-non-steam.css', 'add-non-steam.js']],
    ['desktop', 'client/dialogs/', [
      'dialog-art.js', 'activate-product.css', 'activate-product.js', 'backups.css', 'backups.js', 'install.js',
      'eula.js', 'uninstall.css', 'uninstall.js', 'new-collection.css', 'new-collection.js',
      'delete-collection.css', 'delete-collection.js', 'mark-private.css', 'mark-private.js',
      'exit-game.css', 'exit-game.js', 'cd-keys.css', 'cd-keys.js', 'friend-picker.css',
      'friend-picker.js', 'friend-dialogs.css', 'friend-dialogs.js', 'group-settings.css', 'group-settings.js',
      'report-content.css',
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
      'friends-chats.css', 'friends-window.css', 'friends-list.js', 'friends-place.js',
    ]],
    ['desktop', 'client/friends/chat/', [
      'tabs.css', 'header.css', 'messages.css', 'bubbles.css', 'input.css', 'voice.css', 'calls.css', 'members.css',
      'icons.css', 'groups.css', 'chat.js',
    ]],
    ['all', 'core/', ['scrollbars.css', 'scrollbars.js']],
    ['all', 'core/', ['emoticon-picker.css', 'emoticon-picker.js']],
    // Settings, game properties, Millennium, storage
    ['desktop', 'client/settings/', [
      'layout.css', 'controls.css', 'pages.css', 'pages-notifications.css', 'pages-interface.css',
      'pages-store.css', 'pages-library.css', 'pages-downloads.css', 'pages-cloud.css', 'pages-ingame.css',
      'pages-accessibility.css', 'pages-hero.css', 'pages-controller.css', 'pages-gamerecording.css',
      'pages-voice.css', 'pages-remoteplay.css', 'pages-broadcast.css', 'pages-music.css', 'storage.css',
      'search.css', 'game-properties.css',
      'game-properties-install.css', 'game-properties-extras.css', 'spacing.css',
    ]],
    // A toast as the theme draws it, for the sample on Settings › Notifications
    ['desktop', 'client/toasts/', ['card.css', 'card.js']],
    ['desktop', 'client/settings/dialog/', [
      'shared.js', 'options.js', 'search.js', 'window.js', 'sidebar.js', 'layout.js', 'props-pages.js',
      'props-header.js', 'props.js', 'account.js', 'friends.js', 'family.js', 'security.js',
      'notifications.js', 'interface.js', 'store.js', 'library.js', 'downloads.js', 'cloud.js', 'ingame.js',
      'accessibility.js', 'controller.js', 'gamerecording.js', 'voice.js', 'remoteplay.js', 'broadcast.js',
      'music.js', 'main.js',
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
    // The theme's own settings window: drawn from the main window into a Steam popup (its
    // popup runtime: millennium-window.js), styled in that popup
    ['desktop', 'client/settings/theme/', ['theme-settings.css', 'spinner-previews.css']],
    ['main', 'client/settings/theme/', ['theme-settings.js']],
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
  let fresh = ''; // a dev reload's stamp (devReload below): every file again, past the cache
  const asset = (file) => {
    const url = new URL(`../${file}`, self);
    url.search = query;
    if (fresh) url.searchParams.set('se-reload', fresh);
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
  // For window-level rules (options/appearance/popups-solid.css)
  if (MENU) root.setAttribute('data-se-menu-window', '');
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
  const BRAND = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%2266 66 380 380%22%3E%3Cg transform=%22translate(0 7.92)%22%3E%3Cdefs%3E%3Cmask id=%22h%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22302%22 cy=%22212%22 r=%2235.5%22 fill=%22%23000%22/%3E%3Ccircle cx=%22302%22 cy=%22212%22 r=%2219.7%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22218%22 cy=%22304%22 r=%2234.3%22 fill=%22%23000%22/%3E%3Cpath d=%22M 218 304 L 106.0 257.0%22 stroke=%22%23000%22 stroke-width=%2260.3%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M 218 304 L 106.0 257.0%22 stroke=%22%23fff%22 stroke-width=%2235%22 stroke-linecap=%22round%22/%3E%3Ccircle cx=%22218%22 cy=%22304%22 r=%2218.5%22 fill=%22%23fff%22/%3E%3C/mask%3E%3Cmask id=%22p%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3Cpath d=%22M 189.2 282.4 L 262.1 178.4 A 52 52 0 1 1 335.6 251.9 L 241.6 330.8 A 36 36 0 1 1 189.2 282.4 Z%22 fill=%22%23000%22 stroke=%22%23000%22 stroke-width=%2231.7%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M 218 304 L 106.0 257.0%22 stroke=%22%23000%22 stroke-width=%2266.7%22 stroke-linecap=%22round%22/%3E%3C/mask%3E%3Cmask id=%22s%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3Cpath d=%22M50 0 C53 32 68 47 100 50 C68 53 53 68 50 100 C47 68 32 53 0 50 C32 47 47 32 50 0 Z%22 fill=%22%23000%22 transform=%22translate(199.00 49.00) scale(1.14)%22/%3E%3C/mask%3E%3Cmask id=%22q0%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3Crect width=%2281.0%22 height=%22111.0%22 rx=%2216%22 fill=%22%23000%22 stroke=%22%23000%22 stroke-width=%2237.2%22 transform=%22translate(248.0 230.0) rotate(0) translate(-40.5 -55.5)%22/%3E%3Crect width=%2281.0%22 height=%22111.0%22 rx=%2216%22 fill=%22%23000%22 stroke=%22%23000%22 stroke-width=%2237.2%22 transform=%22translate(285.5 239.0) rotate(20) translate(-40.5 -55.5)%22/%3E%3C/mask%3E%3Cmask id=%22q1%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3Crect width=%2281.0%22 height=%22111.0%22 rx=%2216%22 fill=%22%23000%22 stroke=%22%23000%22 stroke-width=%2237.2%22 transform=%22translate(285.5 239.0) rotate(20) translate(-40.5 -55.5)%22/%3E%3C/mask%3E%3Cmask id=%22q2%22 maskUnits=%22userSpaceOnUse%22 x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22%3E%3Crect x=%2266%22 y=%2266%22 width=%22380%22 height=%22380%22 fill=%22%23fff%22/%3E%3C/mask%3E%3C/defs%3E%3Cg mask=%22url(%23p)%22%3E%3Cg mask=%22url(%23s)%22%3E%3Cpath d=%22M256.00 106.00 A150 150 0 0 1 256.00 406.00%22 fill=%22none%22 stroke=%22%23000%22 stroke-opacity=%220.32%22 stroke-width=%2231.7%22/%3E%3Cpath d=%22M256.00 406.00 A150 150 0 0 1 255.97 106.00%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%2231.7%22/%3E%3Cg mask=%22url(%23q0)%22%3E%3Crect width=%2278.0%22 height=%22108.0%22 rx=%2216%22 fill=%22%23000%22 fill-opacity=%220.32%22 stroke=%22%23000%22 stroke-width=%2218.2%22 transform=%22translate(210.5 239.0) rotate(-22) translate(-39.0 -54.0)%22/%3E%3C/g%3E%3Cg mask=%22url(%23q1)%22%3E%3Crect width=%2281.0%22 height=%22111.0%22 rx=%2216%22 fill=%22%23000%22 fill-opacity=%220.32%22 stroke=%22%23000%22 stroke-width=%2218.2%22 transform=%22translate(248.0 230.0) rotate(0) translate(-40.5 -55.5)%22/%3E%3C/g%3E%3Cg mask=%22url(%23q2)%22%3E%3Crect width=%2281.0%22 height=%22111.0%22 rx=%2216%22 fill=%22%23000%22 fill-opacity=%220.32%22 stroke=%22%23000%22 stroke-width=%2218.2%22 transform=%22translate(285.5 239.0) rotate(20) translate(-40.5 -55.5)%22/%3E%3C/g%3E%3C/g%3E%3C/g%3E%3Cg mask=%22url(%23h)%22%3E%3Cpath d=%22M 189.2 282.4 L 262.1 178.4 A 52 52 0 1 1 335.6 251.9 L 241.6 330.8 A 36 36 0 1 1 189.2 282.4 Z%22 fill=%22%23000%22/%3E%3Cpath d=%22M 218 304 L 106.0 257.0%22 stroke=%22%23000%22 stroke-width=%2235%22 stroke-linecap=%22round%22/%3E%3C/g%3E%3Cpath d=%22M50 0 C53 32 68 47 100 50 C68 53 53 68 50 100 C47 68 32 53 0 50 C32 47 47 32 50 0 Z%22 fill=%22%23000%22 transform=%22translate(218.00 68.00) scale(0.76)%22/%3E%3C/g%3E%3C/svg%3E")';
  /*
   * The theme's settings (client/shared/settings.js, localStorage "se-settings", shared by every
   * client window): the option stylesheets they switch on and the colour palette, in one
   * <style id="se-options"> after se-sheets. Read here, before the window's first paint, so it
   * never shows the defaults first; settings.js calls applyOptions again on a change. A new
   * <style> replaces the old once its imports are in, so the look never drops to the defaults
   * in between.
   */
  const SETTINGS_KEY = 'se-settings';
  const OPTION_FILE = /^options\/[a-z-]+\/[a-z0-9-]+\.css$/;
  const readSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  };
  const settings = readSettings();

  /*
   * The entrance is a setting (splash | logo | fade | none), read from the settings above;
   * <html data-se-entrance> carries it.
   *
   * "splash" is the main window's: client/entrance/ mounts the splash over the cover, and the
   * reveal hands over to it (finish()) instead of lifting the cover, so its "Ready" lands on the
   * finished Library. Other windows take the logo entrance with it, and the main window falls
   * back to a plain lift if the splash never mounted.
   */
  const ENTRANCES = ['splash', 'logo', 'fade', 'none'];
  const chosen = ENTRANCES.includes(settings.values?.entrance) ? settings.values.entrance : 'splash';

  /*
   * "Show splash" (every start | daily | first): when the main window may play the splash; a
   * start that may not takes Logo. The last splash's time is kept in localStorage.
   */
  const SPLASH_KEY = 'se-splash-last';
  const splashDue = () => {
    const rule = settings.values?.['splash-when'];
    if (!MAIN || !rule) return true;
    let last = 0;
    try {
      last = Number(localStorage.getItem(SPLASH_KEY)) || 0;
    } catch {}
    if (rule === 'first') return !last;
    return new Date(last).toDateString() !== new Date().toDateString(); // daily
  };
  const entrance = chosen === 'splash' && !splashDue() ? 'logo' : chosen;
  if (MAIN && entrance === 'splash') {
    try {
      localStorage.setItem(SPLASH_KEY, String(Date.now()));
    } catch {}
  }

  // The cover each entrance uses: the splash draws its own over a plain one
  const coverKind = (setting = entrance) => (setting !== 'splash' ? setting : MAIN ? 'fade' : 'logo');
  // The cover for each entrance (see the top of this section)
  const coverCSS = (setting) => {
    const kind = coverKind(setting);
    const lift = kind === 'none' ? 0 : LIFT_MS;
    // The lift's animations have their own names: a CSS animation that keeps its name keeps its
    // clock, so reusing the fallback's would start the lift part-way through (or already over).
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

  const started = performance.now();
  const reveal = () => {
    if (revealed || pending) return;
    revealed = true;
    step(settledBy ? `revealed (settled ${settledBy})` : 'revealed');
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
  const whenSettled = (reveal) => {
    // "Wait for Library: At once": shown as soon as the theme's files are in
    if (!MAIN || !document.body || settings.values?.['startup-wait'] === 'now') return reveal();
    let over = false;
    let observer = null;
    const done = (how) => {
      if (over) return;
      over = true;
      observer?.disconnect();
      settledBy = how || '';
      reveal();
    };
    /*
     * After Reload UI during a voice call the window can drop the first check's timer while later
     * timers run, and so never be revealed. A second way out, past the longest wait, that
     * needs no timer: a frame loop watching the clock (a hidden window has no frames, but there
     * the first check ends the wait)
     */
    const deadline = started + SETTLE_MAX_MS + SETTLE_STEP_MS * 2;
    const watchDeadline = () => {
      if (over) return;
      if (performance.now() >= deadline) done('by the frame deadline');
      else requestAnimationFrame(watchDeadline);
    };
    requestAnimationFrame(watchDeadline);
    let added = 0;
    try {
      // Its own observer on purpose: the loader runs before the runtime (and its shared observer) exists; it lives only until the first window settles
      observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) added++;
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (err) {
      return done(`at once, the observer failed (${err?.message || err})`);
    }
    let busyAt = performance.now();
    const check = () => {
      if (over) return;
      const now = performance.now();
      // A check that threw would end this loop without a reveal (Steam's state can be half-made
      // after Reload UI during a voice call): an error counts as quiet, kept for the element picker's
      // report, and each check stamps the step's time
      try {
        if (added > SETTLE_BURST || loadingScreen() || imagesLoading()) busyAt = now;
        step('settling');
      } catch (err) {
        step(`settling, a check failed (${err?.message || err})`);
      }
      added = 0;
      if (now - busyAt < SETTLE_QUIET_MS && document.visibilityState === 'visible' && now - started < SETTLE_MAX_MS) {
        setTimeout(check, SETTLE_STEP_MS);
        return;
      }
      done();
    };
    setTimeout(check, SETTLE_STEP_MS);
  };
  // Idle callbacks and frames don't run in a hidden window, so one that loads in the background
  // reveals at once.
  const settle = () => {
    step('settling');
    whenSettled(() => {
      step('waiting for idle');
      if (document.visibilityState !== 'visible') reveal();
      else if (window.requestIdleCallback) requestIdleCallback(reveal, { timeout: IDLE_MAX_MS });
      else requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
  };
  // Files still loading, by name, and the last step reached: the element picker's report shows
  // them while the cover waits
  const waiting = new Set();
  let settledBy = ''; // set when the settle wait ended other than by its checks
  const step = (name) => {
    if (window.__seClient) window.__seClient.step = `${name} at ${Math.round(performance.now() - started)} ms`;
  };
  const track = (el, name) => {
    if (revealed) return;
    pending++;
    waiting.add(name);
    const done = () => {
      waiting.delete(name);
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
  const sheetImports = () => [...sheets.values()].map((href) => `@import url("${href}");`).join('\n');
  const addStylesheets = () => {
    const style = document.createElement('style');
    style.id = 'se-sheets';
    style.setAttribute('blocking', 'render'); // no flash of Steam's own look on a window's first paint
    style.textContent = sheetImports();
    if (MENU) style.addEventListener('load', remeasureMenu, { once: true });
    track(style, 'stylesheets');
    head.append(style);
  };

  // The colour palette's base tokens, when not the default: one rule, each name and colour checked
  const paletteCSS = (vars) => {
    const pairs = Object.entries(vars && typeof vars === 'object' ? vars : {}).filter(([name, value]) =>
      /^--se-[a-z0-9-]+$/.test(name) &&
      /^(?:#[0-9a-f]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i.test(value));
    return pairs.length ? `:root:root{${pairs.map(([name, value]) => `${name}:${value}`).join(';')}}` : '';
  };

  /*
   * What a chip setting turns off (its `hide` selectors, client/shared/settings.js), each checked
   * to be a plain attribute selector or a single class (a Steam one). !important beats the
   * features' own display rules and Steam's.
   */
  const hideCSS = (selectors) => {
    const list = (Array.isArray(selectors) ? selectors : []).filter((s) => /^(?:\[data-[a-z-]+="[a-z0-9-]+"\]|\.-?[A-Za-z_][\w-]*)$/.test(s));
    return list.length ? `${list.join(',')}{display:none!important}` : '';
  };

  // The settings' stylesheets and palette (see the top of the entrance section), after se-sheets
  let optionsStyle = null;
  const applyOptions = () => {
    const saved = readSettings();
    const files = (Array.isArray(saved.client) ? saved.client : []).filter((file) => OPTION_FILE.test(file));
    const css = [...files.map((file) => `@import url("${asset(file)}");`), paletteCSS(saved.vars), hideCSS(saved.hide)].join('\n');
    if (optionsStyle?.textContent === css) return;
    const style = document.createElement('style');
    style.id = 'se-options';
    style.textContent = css;
    const old = optionsStyle;
    optionsStyle = style;
    if (!old) {
      style.setAttribute('blocking', 'render');
      if (files.length) track(style, 'settings');
      head.append(style);
      return;
    }
    old.after(style);
    if (!files.length) {
      old.remove();
      return;
    }
    style.addEventListener('load', () => old.remove(), { once: true });
    style.addEventListener('error', () => old.remove(), { once: true });
  };

  const addScript = (file) => {
    const script = document.createElement('script');
    script.src = asset(file);
    script.async = false; // run in list order: a split feature's parts rely on it
    script.dataset.seFile = file;
    track(script, file);
    head.append(script);
  };

  /*
   * Stylesheets go in at once. Scripts wait for the runtime (window.__se): core/classmap.js,
   * core/runtime.js and its part runtime-art.js, which this loader adds first, in order; the
   * wait holds the cover like any pending file.
   */
  const RUNTIME = ['core/classmap.js', 'core/runtime.js', 'core/runtime-art.js'];
  const load = () => {
    const scripts = [];
    for (const [group, file] of FILES) {
      if (!groups.has(group) || added.has(file) || (onWeb && !WEB_FILES.has(file))) continue;
      added.add(file);
      if (file.endsWith('.css')) sheets.set(file, asset(file));
      else scripts.push(file);
    }
    if (sheets.size) addStylesheets();
    if (!onWeb && !optionsStyle) applyOptions();
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
    waiting.add('se-core event');
    addEventListener(
      'se-core',
      () => {
        waiting.delete('se-core event');
        scripts.forEach(addScript);
        if (--pending === 0) settle();
      },
      { once: true }
    );
  };

  /*
   * Dev reload (Ctrl+Shift+U, core/core.js; only with dev/live-reload.json on): this window's
   * stylesheets again, and with `scripts` its scripts too, without Reload UI. The new sheets go in
   * beside the old and take over once loaded, so nothing flashes; each script, run again, calls
   * its old copy's destroy() first (CLAUDE.md, JS), in list order. The runtime stays: features
   * hold it. Other client windows follow through the storage event.
   */
  const RELOAD_KEY = 'se-dev-reload';
  const devReload = (scripts = false) => {
    if (onWeb) return;
    fresh = String(Date.now());
    for (const file of sheets.keys()) sheets.set(file, asset(file));
    const old = document.getElementById('se-sheets');
    const style = document.createElement('style');
    style.textContent = sheetImports();
    const swap = () => {
      old?.remove();
      style.id = 'se-sheets';
    };
    style.addEventListener('load', swap, { once: true });
    style.addEventListener('error', swap, { once: true });
    if (old) old.after(style);
    else head.append(style);
    applyOptions();
    if (scripts) {
      for (const file of added) {
        if (!file.endsWith('.js') || RUNTIME.includes(file)) continue;
        head.querySelector(`script[data-se-file="${file}"]`)?.remove();
        addScript(file);
      }
    }
    devBadge(scripts ? 'CSS and JS reloaded' : 'CSS reloaded');
  };

  // A short note at the window's foot-left that the reload ran; shadow DOM, so no style reaches it
  let badge = null;
  const devBadge = (text) => {
    badge?.remove();
    const host = (badge = document.createElement('div'));
    host.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;pointer-events:none';
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<span style="display:inline-block;padding:5px 10px;border-radius:999px;background:rgba(16,18,23,.88);' +
      'box-shadow:inset 0 0 0 1px #7cc4ff;color:#fff;font:700 11px/1 var(--se-font,sans-serif)"></span>';
    host.shadowRoot.firstChild.textContent = text;
    (document.body ?? root).append(host);
    setTimeout(() => {
      host.remove();
      if (badge === host) badge = null;
    }, 1500);
  };

  addEventListener('storage', (event) => {
    if (event.key !== RELOAD_KEY || !event.newValue) return;
    try {
      devReload(Boolean(JSON.parse(event.newValue).scripts));
    } catch {}
  });

  window.__seClient = {
    groups, files: added, sheets, waiting, applyOptions,
    devReload(scripts) {
      devReload(scripts);
      try {
        localStorage.setItem(RELOAD_KEY, JSON.stringify({ at: Date.now(), scripts: Boolean(scripts) }));
      } catch {}
    },
  };
  load();
  if (!pending) settle(); // nothing to wait for
})();
