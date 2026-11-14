/*
 * Client loader: which theme files each Steam window gets.
 *
 * Millennium matches windows, this file picks files. skin.json injects core/core.js and this
 * loader into every window (".*"), plus one stub per window group (client/windows/<group>.js).
 * Each group's regex lives only in skin.json. A stub adds its group's name to
 * window.__seWindows, and the loader adds every file listed for the groups present, in list
 * order. Stubs and loader may run in either order. To add a feature, list its files here; only
 * a new window group needs a skin.json change (and a full Steam restart).
 *
 * The list order is the cascade. Each stylesheet's <link> carries its list position and goes in
 * among the theme's other links by that position, whichever group asked for it first. So rules
 * that tie on specificity resolve the same in every window. Scripts don't depend on order: each
 * one waits for core's `se-core` event.
 *
 * Files load with the loader's own query string, so whatever cache-busting Millennium puts on
 * this file carries over to every file.
 *
 * Web pages: skin.json's patches match web views by URL, so this loader and the content and
 * desktop stubs also run on Store, Community and other web pages. Those have their own loaders
 * (core/core.js starts them); here they get only WEB_FILES, the window-agnostic basics. Client
 * windows are served from steamloopback.host or are about:blank popups of it.
 *
 * Groups (regexes in skin.json):
 *   all           every client window (no stub: this file)
 *   main          the main Steam window
 *   content       every window but menus and notification toasts
 *   desktop       content windows minus the overlay, Big Picture, Quick Access, Main Menu,
 *                 the Games List and browser find bars
 *   overlay       the in-game overlay
 *   toasts        notification toasts
 *   notify        windows a friend notification can be clicked in (main, toasts, overlay, menus)
 *   achievements  the main window and the overlay
 */
(() => {
  if (window.__seClient) {
    window.__seClient.flush();
    return;
  }

  /** @type {[group: string, file: string][]} */
  const FILES = [
    ['main', 'core/plugin-rpc.js'],
    ['notify', 'client/friends/friend-notification-clicks.js'],
    ['overlay', 'client/overlay/overlay.css'],
    ['overlay', 'client/overlay/overlay.js'],
    ['all', 'client/overlay/overlay-popups.css'],
    ['main', 'client/friends/friends-background.js'],
    ['all', 'core/font.css'],
    ['all', 'core/tokens.css'],
    ['all', 'core/images.css'],
    ['all', 'core/images.js'],
    ['toasts', 'client/toasts/toasts.css'],
    ['toasts', 'client/toasts/toasts.js'],
    ['content', 'client/startup/startup.css'],
    ['content', 'client/startup/startup.js'],
    ['content', 'client/startup/sign-in.css'],
    ['content', 'client/spinner/spinner.css'],
    ['content', 'client/spinner/spinner.js'],
    ['desktop', 'core/native-tooltips.js'],
    ['main', 'client/library/artwork.css'],
    ['main', 'client/game-page/always-open-game-details.js'],
    ['main', 'client/home/news-hub.js'],
    ['main', 'client/header/header-actions.css'],
    ['main', 'client/header/header-actions.js'],
    ['main', 'client/browser/url-bar.css'],
    ['main', 'client/browser/url-bar.js'],
    ['main', 'core/icons.css'],
    ['main', 'client/header/header-tooltips.js'],
    ['main', 'client/navigation/sidebar-icons.css'],
    ['main', 'client/navigation/sidebar-icons.js'],
    ['main', 'client/header/steam-menu.js'],
    ['main', 'client/navigation/nav-rail.css'],
    ['main', 'client/navigation/nav-rail.js'],
    ['main', 'client/library/library.css'],
    ['main', 'client/library/game-list.css'],
    ['main', 'client/library/game-list.js'],
    ['main', 'client/library/game-drag.css'],
    ['main', 'client/library/game-drag.js'],
    ['main', 'client/library/collections.css'],
    ['main', 'client/library/collections.js'],
    ['main', 'client/downloads/downloads.css'],
    ['main', 'client/downloads/downloads.js'],
    ['main', 'client/friends/friends-dock.css'],
    ['main', 'client/friends/friends-dock.js'],
    ['main', 'client/library/sort-segments.css'],
    ['main', 'client/library/sort-segments.js'],
    ['main', 'client/home/home-polish.css'],
    ['main', 'client/home/home-polish.js'],
    ['main', 'client/home/home-stage.css'],
    ['main', 'client/home/home-stage.js'],
    ['all', 'client/dialogs/dialogs.css'],
    ['content', 'client/dialogs/install.css'],
    ['content', 'client/dialogs/eula.css'],
    ['all', 'client/dialogs/hover-cards.css'],
    ['all', 'client/friends/friend-hover.css'],
    ['all', 'client/friends/friend-hover.js'],
    ['main', 'client/dialogs/hover-cards.js'],
    ['all', 'client/header/notifications.css'],
    ['all', 'client/header/notifications.js'],
    ['all', 'client/dialogs/window-controls.css'],
    ['content', 'client/dialogs/utility/base.css'],
    ['content', 'client/dialogs/utility/servers.css'],
    ['content', 'client/dialogs/utility/media.css'],
    ['content', 'client/dialogs/utility/library-tools.css'],
    ['content', 'client/dialogs/utility/modals.css'],
    ['content', 'client/dialogs/utility/friends.css'],
    ['content', 'client/dialogs/utility/standalone.css'],
    ['content', 'client/dialogs/about-steam.css'],
    ['content', 'client/dialogs/about-steam.js'],
    ['content', 'client/dialogs/system-info.css'],
    ['content', 'client/dialogs/system-info.js'],
    ['content', 'client/dialogs/system-report.css'],
    ['content', 'client/dialogs/system-report.js'],
    ['content', 'client/dialogs/add-non-steam.css'],
    ['content', 'client/dialogs/add-non-steam.js'],
    ['desktop', 'client/dialogs/activate-product.css'],
    ['desktop', 'client/dialogs/activate-product.js'],
    ['desktop', 'client/dialogs/backups.css'],
    ['desktop', 'client/dialogs/backups.js'],
    ['desktop', 'client/dialogs/install.js'],
    ['desktop', 'client/dialogs/eula.js'],
    ['desktop', 'client/dialogs/uninstall.css'],
    ['desktop', 'client/dialogs/uninstall.js'],
    ['main', 'compat/plugins/hltb-for-steam.css'],
    ['main', 'compat/plugins/hltb-for-steam.js'],
    ['achievements', 'core/achievement-tiers.css'],
    ['main', 'client/game-page/layout.css'],
    ['main', 'client/game-page/play-bar.css'],
    ['main', 'client/game-page/overview.css'],
    ['main', 'client/game-page/achievements.css'],
    ['main', 'client/game-page/friends.css'],
    ['main', 'client/game-page/cards.css'],
    ['main', 'client/game-page/activity.css'],
    ['main', 'client/game-page/game-page.js'],
    ['main', 'client/achievements/achievements-page.css'],
    ['main', 'client/achievements/achievements-page.js'],
    ['main', 'client/game-page/spotlights.css'],
    ['desktop', 'client/friends/chat/chat-tooltips.js'],
    ['desktop', 'client/friends/friends.css'],
    ['desktop', 'client/friends/friends-list.js'],
    ['desktop', 'client/friends/chat/tabs.css'],
    ['desktop', 'client/friends/chat/header.css'],
    ['desktop', 'client/friends/chat/messages.css'],
    ['desktop', 'client/friends/chat/input.css'],
    ['desktop', 'client/friends/chat/voice.css'],
    ['desktop', 'client/friends/chat/members.css'],
    ['desktop', 'client/friends/chat/icons.css'],
    ['desktop', 'client/friends/chat/groups.css'],
    ['desktop', 'client/friends/chat/chat.js'],
    ['all', 'core/scrollbars.css'],
    ['all', 'core/scrollbars.js'],
    ['all', 'client/friends/emoticon-picker.css'],
    ['all', 'client/friends/emoticon-picker.js'],
    ['desktop', 'client/settings/layout.css'],
    ['desktop', 'client/settings/controls.css'],
    ['desktop', 'client/settings/pages.css'],
    ['desktop', 'client/settings/storage.css'],
    ['desktop', 'client/settings/search.css'],
    ['desktop', 'client/settings/game-properties.css'],
    ['desktop', 'client/settings/finishing.css'],
    ['desktop', 'client/settings/settings.js'],
    ['desktop', 'client/settings/millennium.css'],
    ['desktop', 'client/settings/millennium-pages.js'],
    ['main', 'client/settings/millennium-window.js'],
    ['main', 'client/settings/library-manager.css'],
    ['main', 'client/settings/library-manager.js'],
    ['main', 'client/game-page/player-count.js'],
    ['main', 'client/game-page/player-count.css'],
  ];

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

  const head = document.head ?? document.documentElement;
  const groups = new Set(['all']);
  const added = new Set();

  /** Puts a stylesheet among the theme's own by list position, so the cascade matches the list. */
  const addStylesheet = (file, order) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(file);
    link.setAttribute('blocking', 'render'); // no flash of Steam's own look on a window's first paint
    link.dataset.seFile = file;
    link.dataset.seOrder = String(order);
    const theme = [...head.querySelectorAll(':scope > link[data-se-order]')];
    const next = theme.find((el) => Number(el.dataset.seOrder) > order);
    if (next) next.before(link);
    else if (theme.length) theme[theme.length - 1].after(link);
    else head.append(link);
  };

  const addScript = (file) => {
    const script = document.createElement('script');
    script.src = asset(file);
    script.async = false; // run in list order, as Millennium would
    script.dataset.seFile = file;
    head.append(script);
  };

  const flush = () => {
    for (const group of (window.__seWindows ??= []).splice(0)) groups.add(group);
    FILES.forEach(([group, file], order) => {
      if (!groups.has(group) || added.has(file) || (onWeb && !WEB_FILES.has(file))) return;
      added.add(file);
      if (file.endsWith('.css')) addStylesheet(file, order);
      else addScript(file);
    });
  };

  window.__seClient = { flush, groups, files: added };
  flush();
})();
