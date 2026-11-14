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
 * A feature split into parts lists only its entry, <folder>/index.js, which loads as an ES module
 * and imports its parts itself (they reach core's runtime through core/se.js). Every other script
 * is a classic one.
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
    ['main', 'client/entrance/entrance.css'],
    ['main', 'client/entrance/entrance.js'],
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

  const root = document.documentElement;
  const head = document.head ?? root;
  const groups = new Set(['all']);
  const added = new Set();

  /*
   * No flash of Steam's own look. `blocking="render"` only holds a first paint the loader beats,
   * and Millennium may inject it after <body> exists. So, as core/core.js does on web pages,
   * the window waits under a cover until every file from the early flushes has loaded (scripts
   * run, so features have started; a stub that flushes meanwhile still counts), then for the
   * main thread's first idle moment, so the theme's first DOM work is done before anything
   * shows. [data-se-styled] then lifts the cover. If a file never settles, a CSS timer lifts it
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
  const TRANSPARENT = /^(?:SP Overlay:|notificationtoasts_|OverlayBrowser_|OverlayTab\d+_|QuickAccess_|MainMenu_)/;
  const MAIN = document.title === 'Steam'; // the main window (skin.json's "main" group)
  const LOGO_MS = 250;
  const SETTLE_STEP_MS = 150;
  const SETTLE_QUIET_MS = 450;
  const SETTLE_MAX_MS = 4500;
  const SETTLE_BURST = 6; // new elements per step that still count as building
  const FALLBACK_MS = MAIN ? SETTLE_MAX_MS + 500 : 1500;
  const LIFT_MS = 300;
  const IDLE_MAX_MS = 400;
  let pending = 0;
  let revealed =
    onWeb || // core/core.js guards web pages
    /(?:Menu|Supernav)$/.test(document.title) ||
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

  /** Puts a stylesheet among the theme's own by list position, so the cascade matches the list. */
  const addStylesheet = (file, order) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(file);
    link.setAttribute('blocking', 'render'); // no flash of Steam's own look on a window's first paint
    link.dataset.seFile = file;
    link.dataset.seOrder = String(order);
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
    if (file.endsWith('/index.js')) script.type = 'module'; // a split feature's entry
    else script.async = false; // run in list order, as Millennium would
    script.dataset.seFile = file;
    track(script);
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
  if (!pending) settle(); // nothing to wait for
})();
