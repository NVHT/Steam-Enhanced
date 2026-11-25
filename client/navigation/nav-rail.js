/*
 * Navigation, part 4 of 4, listed last (window.__seNavParts; client/navigation/title-bar-search.js
 * names the parts): routing, the rail's page icons and their section menus (opened on click;
 * a right click runs the menu's first row, or the other way round with "Click opens: Page"; a
 * rest opens it with "Menus open on hover"), and the update loop that runs every part.
 */
((SE) => {
  const { C, railMode, mainWindow, navigate: goLibrary } = SE;
  window.__seRailNav?.destroy?.();
  const ns = window.__seNavParts;
  if (!ns?.search || !ns.titleBar || !ns.tips) return;

  let observer;
  let timer;
  let frame = 0;
  let lastPollSignature = '';

  const patchedMenus = new Map();
  const navNodes = new Map();

  /*
   * Every page icon opens its section's menu on click, drawn by the popup layer beside the rail
   * in the Settings menu's language (client/header/header-actions.js): groups under headings,
   * each row an icon, a name and a hint. A row runs Steam's own item of that name (its SuperNav
   * items; Games: its Games menu, a button at the rail's foot) and takes Steam's localized name
   * unless the layout gives one; a row Steam has no item for is left out, and an item the layout
   * doesn't place (one Steam adds later) still shows, in a group at the end, unless omitted.
   * Steam's hover dropdown stays off. If Steam's items can't be read, the icon goes to its
   * section's fixed page (`click`). The row for the page you're on is marked (the accent): a row
   * names its page by the library route (`route`), the Store or Community view's address (`url`),
   * or a path under your own profile (`mine`, after /id/<name> or /profiles/<id>; Steam's browser
   * manager says which addresses are yours).
   */
  const NAV_ITEMS = {
    store: {
      click: { url: 'https://store.steampowered.com/' },
      layout: [
        { heading: 'Shop' },
        { name: '#Menu_Featured', hint: 'The store front page', icon: '--se-icon-store', url: /^https:\/\/store\.steampowered\.com\/?([?#]|$)/ },
        { name: '#Menu_DiscoveryQueue', hint: 'Games picked for you', icon: '--se-icon-compass', url: /^https:\/\/store\.steampowered\.com\/explore\b/ },
        { name: '#Menu_Stats', hint: 'Top sellers and most played', icon: '--se-icon-chart', url: /^https:\/\/store\.steampowered\.com\/(charts|stats)\b/ },
        // Newer clients name the row Charts
        { name: '#Menu_Charts', hint: 'Top sellers and most played', icon: '--se-icon-chart', url: /^https:\/\/store\.steampowered\.com\/(charts|stats)\b/ },
        { name: '#Menu_News', hint: 'Updates and announcements', icon: '--se-icon-news', url: /^https:\/\/store\.steampowered\.com\/news\b/ },
        { heading: 'Yours' },
        { name: '#Menu_Wishlist', hint: 'Games you\'re waiting for', icon: '--se-icon-heart', url: /^https:\/\/store\.steampowered\.com\/wishlist\b/ },
        { name: '#Menu_PersonalCalendar', hint: 'Releases you follow', icon: '--se-icon-calendar' },
        { name: '#Menu_PointsShop', hint: 'Spend your Steam Points', icon: '--se-icon-points', url: /^https:\/\/store\.steampowered\.com\/points\b/ },
      ],
    },
    library: {
      click: { route: '/library/home' },
      // The rail's Downloads button already opens Downloads
      omit: ['#Menu_Downloads'],
      // Steam's View menu isn't kept (client/header/menu/shared.js): its library views live here
      extra: [
        { name: '#Menu_HiddenGames', steamURL: 'steam://open/library/collection/hidden' },
        { name: '#Menu_Soundtracks', steamURL: 'steam://open/library/view/soundtracks' },
      ],
      layout: [
        { heading: 'Browse' },
        { name: '#Menu_Home', hint: 'Your games and what\'s new', icon: '--se-icon-home', route: /^\/library\/home\b/ },
        { name: '#Menu_Collections', hint: 'Your shelves of games', icon: '--se-icon-grid', route: /^\/library\/collections\b/ },
        { name: '#Menu_HiddenGames', hint: 'Games you\'ve hidden', icon: '--se-icon-eye-off', route: /^\/library\/collection\/hidden\b/ },
        { name: '#Menu_Soundtracks', hint: 'Music you own', icon: '--se-icon-music', route: /^\/library\/(view\/)?soundtracks\b/ },
      ],
    },
    community: {
      click: { url: 'https://steamcommunity.com/discussions/' },
      layout: [
        { heading: 'Browse' },
        { name: '#Menu_Home', hint: 'The community front page', icon: '--se-icon-home', url: /^https:\/\/steamcommunity\.com\/?([?#]|$)/ },
        { name: '#Menu_Discussions', hint: 'Forums for every game', icon: '--se-icon-bubble', url: /^https:\/\/steamcommunity\.com\/discussions\b/ },
        { name: '#Menu_Broadcasts', hint: 'Live game streams', icon: '--se-icon-broadcast', url: /^https:\/\/steamcommunity\.com\/(\?subsection=broadcasts|broadcast\b)/ },
        { heading: 'Make and Trade' },
        { name: '#Menu_Workshop', hint: 'Mods and creations', icon: '--se-icon-workshop', url: /^https:\/\/steamcommunity\.com\/workshop\b/ },
        { name: '#Menu_Market', hint: 'Buy and sell items', icon: '--se-icon-tag', url: /^https:\/\/steamcommunity\.com\/market\b/ },
      ],
    },
    profile: {
      click: { url: 'https://steamcommunity.com/my/' },
      layout: [
        { heading: 'You' },
        { name: '#Menu_Profile', hint: 'Your public page', icon: '--se-icon-user', mine: /^\/?([?#]|$)/ },
        { name: '#Menu_Activity', hint: 'What friends are up to', icon: '--se-icon-activity', mine: /^\/home\b/ },
        { name: '#Menu_Badges', hint: 'Level and badges', icon: '--se-icon-badge', mine: /^\/(badges|gamecards)\b/ },
        { name: '#Menu_YearInReview', hint: 'Your year in games', icon: '--se-icon-calendar', url: /^https:\/\/store\.steampowered\.com\/(replay|yearinreview)\b/ },
        { heading: 'People' },
        { name: '#Menu_Friends', hint: 'Your friends list', icon: '--se-icon-friends', mine: /^\/friends\b/ },
        { name: '#Menu_Groups', hint: 'Groups you\'re in', icon: '--se-icon-group', mine: /^\/groups\b/ },
        { heading: 'Items' },
        { name: '#Menu_Content', hint: 'Screenshots, art, guides', icon: '--se-icon-photo', mine: /^\/(screenshots|images|videos|myworkshopfiles|recommended)\b/ },
        { name: '#Menu_Inventory', hint: 'Items and trading', icon: '--se-icon-inventory', mine: /^\/inventory\b/ },
      ],
    },
    games: {
      items: () => [
        ...(gamesMenuItems() || []),
        // Moved here from the Steam menu (client/header/menu/actions.js)
        backupRestore() && { name: '#Menu_BackupRestore', onClick: (win) => openBackupRestore(win) },
      ],
      // The rail's Library icon already opens the library
      omit: ['#Menu_ViewLibrary'],
      // Short names of its own: Steam's are long ("Activate a Product on Steam...")
      layout: [
        { heading: 'Redeem' },
        {
          name: '#Menu_ActivateRetail',
          label: 'Activate a Product',
          hint: 'Enter a product key',
          icon: '--se-icon-key',
        },
        {
          name: '#Menu_RedeemWallet',
          label: 'Redeem Wallet Code',
          hint: 'Add funds to your wallet',
          icon: '--se-icon-wallet',
        },
        {
          name: '#Menu_ManageGifts',
          label: 'Gifts and Guest Passes',
          hint: 'Your gift inventory',
          icon: '--se-icon-gift',
        },
        { heading: 'Add Games' },
        {
          name: '#Menu_AddNonSteam',
          label: 'Add a Non-Steam Game',
          hint: 'A game on this PC',
          icon: '--se-icon-folder-plus',
        },
        {
          name: '#Menu_BackupRestore',
          label: 'Restore a Backup',
          hint: 'Install from backup files',
          icon: '--se-icon-restore',
        },
      ],
    },
  };


  function currentRoutePath() {
    try {
      return mainWindow()?.LocationPathName || '';
    } catch {
      return '';
    }
  }

  const browserManager = () => SE.global('MainWindowBrowserManager');

  function currentBrowserURL() {
    const manager = browserManager();
    try {
      return manager?.m_URLRequested || manager?.m_URL || '';
    } catch {
      return '';
    }
  }

  function navigateToLibraryRoute(route) {
    if (goLibrary(route)) return true;
    try {
      window.SteamClient?.URL?.ExecuteSteamURL('steam://nav/library');
    } catch {}
    return false;
  }

  function activateTarget(target) {
    if (target.route) navigateToLibraryRoute(target.route);
    else if (target.url) SE.openPage(target.url); // client/shared/open-page.js
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

  /*
   * Steam's own localizer first (the one its menus use, found by client/header/menu/api.js),
   * then its LocalizationManager; a word made from the token only if neither knows it.
   */
  function localizeToken(token) {
    const sources = [
      () => window.__seSteamMenuParts?.live?.api?.localize?.(token),
      () =>
        SE.global('LocalizationManager', (m) => typeof m.LocalizeString === 'function')
          ?.LocalizeString(token, true),
      () => SE.global('LocalizeString', (fn) => typeof fn === 'function')?.(token),
    ];
    for (const source of sources) {
      const text = SE.run(source);
      if (typeof text === 'string' && text && !text.startsWith('#')) return text.replace(/\u2026/g, '...');
    }
    return token.replace(/^#(?:Menu_)?/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  /* The props Steam renders a page icon's SuperNav menu from (its menuItems among them) */
  function superNavProps(node) {
    for (let fiber = SE.fiber(node), depth = 0; fiber && depth < 15; fiber = fiber.return, depth++) {
      if (fiber.memoizedProps?.bSuperNavBehavior) return fiber.memoizedProps;
    }
    return null;
  }

  /*
   * Steam's Restore Game Backup dialog (what the Steam menu's row opened): the backup module's
   * opener taking just the window (its other export, backing up given games, takes two).
   */
  const backupRestore = () =>
    SE.findModule('rail:backup-restore', (src, id, req) => {
      if (!src.includes('#BackupApps_Title') || !src.includes('GetBackupsInFolder')) return null;
      const exports = SE.run(() => req(id));
      return Object.values(exports || {}).find((fn) => typeof fn === 'function' && fn.length === 1) || null;
    });
  const openBackupRestore = (win) => backupRestore()?.(win);

  /* Steam's Games menu items, read off its (hidden) menu-bar button */
  function gamesMenuItems() {
    const button = document.querySelector(`.${C.RootMenuBar} .${C.RootMenuButton}[data-se-icon="games"]`);
    for (let fiber = SE.fiber(button), depth = 0; fiber && depth < 15; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (props?.title === 'Games Root Menu' && Array.isArray(props.menuItems)) return props.menuItems;
    }
    return null;
  }

  // What a Steam menu item does: a route (the library's pages), a steamURL (a Store or Community
  // page), or its own onClick; nothing for a hidden one (visible: false)
  function itemAction(item) {
    if (!item || item.visible === false) return null;
    if (item.route) return () => navigateToLibraryRoute(item.route);
    if (typeof item.steamURL === 'string' && item.steamURL) return () => SE.openPage(item.steamURL);
    // Handed this window: a dialog it opens (Activate a Product) shows here as an overlay
    if (typeof item.onClick === 'function') return () => SE.run(item.onClick, window);
    return null;
  }

  // The page the main window shows: a library route, or the Store / Community view's address
  // (and, under your own profile, the path after it)
  function currentPage() {
    if (!SE.browserShown()) return { route: currentRoutePath() };
    const url = currentBrowserURL();
    const mine = SE.run(() => browserManager()?.GetTabForURL(url)) === 'me';
    const rest = mine ? url.replace(/^https:\/\/steamcommunity\.com\/(id|profiles)\/[^/?#]+/, '') : null;
    return { url, mine: rest };
  }

  // Whether a layout row names the page the main window shows
  function isCurrent(row, here) {
    if (row.route && here.route != null) return row.route.test(here.route);
    if (row.url && here.url) return row.url.test(here.url);
    if (row.mine && here.mine != null) return row.mine.test(here.mine);
    return false;
  }

  // A section's menu: the layout's rows Steam has an item for, grouped under their headings,
  // then any item of Steam's the layout doesn't place
  function layoutRows(layout, items, omit = []) {
    const here = currentPage();
    const named = items.filter((item) => typeof item?.name === 'string');
    const byName = new Map(named.map((item) => [item.name, item]));
    const groups = [];
    const placed = new Set(omit);
    for (const row of layout) {
      if (row.heading) {
        groups.push({ heading: row.heading, rows: [] });
        continue;
      }
      placed.add(row.name);
      const run = itemAction(byName.get(row.name));
      // Without a label of its own, the row takes Steam's name for the item
      const label = row.label || localizeToken(row.name);
      if (run) groups.at(-1).rows.push({ label, hint: row.hint, icon: row.icon, run, current: isCurrent(row, here) });
    }
    const rest = [];
    for (const [name, item] of byName) {
      const run = !placed.has(name) && !name.startsWith('Separator') && itemAction(item);
      if (run) rest.push({ label: localizeToken(name), run });
    }
    groups.push({ rows: rest });

    const rows = [];
    for (const group of groups.filter((g) => g.rows.length)) {
      if (rows.length) rows.push({ separator: true });
      if (group.heading) rows.push({ heading: group.heading });
      rows.push(...group.rows);
    }
    return rows.length ? rows : null;
  }

  function sectionRows(key, node) {
    const entry = NAV_ITEMS[key];
    const items = entry.items ? entry.items() : superNavProps(node)?.menuItems;
    if (!Array.isArray(items)) return null;
    return layoutRows(entry.layout, [...items, ...(entry.extra || [])], entry.omit);
  }

  let navMenu = null;
  let navMenuKey = '';
  let lastToggle = 'none yet'; // the last menu a click tried to open (the element report)
  function closeNavMenu() {
    navMenu?.release();
    navMenu = null;
    navMenuKey = '';
  }

  /*
   * Opens (or, clicked again, closes) a section's menu beside the rail, side-aligned with its
   * button (SE.layer.besideRail: a page icon's top, a foot button's bottom). Returns false if the
   * menu couldn't open.
   */
  function toggleNavMenu(key, node, { foot = false } = {}) {
    const entry = NAV_ITEMS[key];
    if (!entry || !node) return false;
    const reopen = !(navMenu && !navMenu.released && navMenuKey === key);
    closeNavMenu();
    if (!reopen) return true;

    const rows = sectionRows(key, node);
    navMenu = rows
      ? SE.layer?.menu(
          rows,
          SE.layer.besideRail(node, { foot }),
          // Leaving the button or the menu closes it, as the rail's other menus do
          { owner: node, closeOnLeave: true }
        )
      : null;
    if (navMenu) navMenuKey = key;
    lastToggle = `${key}: ${!rows ? 'no rows' : navMenu ? 'opened' : 'its popup failed'}`;
    return Boolean(navMenu);
  }

  // The section's menu, or its page if the menu couldn't open
  function openSectionMenu(key, node) {
    if (!toggleNavMenu(key, node) && NAV_ITEMS[key].click) activateTarget(NAV_ITEMS[key].click);
  }

  /*
   * The section's page at once: its first row runs (Store: Featured, Library: Home, Community:
   * Home, Profile: your profile), or its fixed page if Steam's items can't be read.
   */
  function openSectionPage(key, node) {
    closeNavMenu();
    const first = sectionRows(key, node)?.find((row) => typeof row.run === 'function');
    if (first) first.run();
    else if (NAV_ITEMS[key].click) activateTarget(NAV_ITEMS[key].click);
  }

  // The "Click opens" setting (client/shared/settings.js): a click opens the menu and a right
  // click the page, or the other way round; read at each click, so a change applies at once
  const clickOpensPage = () => SE.settings?.get('click-opens') === 'page';

  function onNavButton(event, secondary) {
    if (!railMode()) return;
    const node = event.currentTarget;
    const key = node.getAttribute('data-se-icon');
    if (!NAV_ITEMS[key]) return;
    event.preventDefault();
    event.stopPropagation();
    menuHover.cancel();
    if (secondary !== clickOpensPage()) openSectionPage(key, node);
    else openSectionMenu(key, node);
  }
  const onNavClick = (event) => onNavButton(event, false);
  const onNavContext = (event) => onNavButton(event, true);

  /*
   * The "Menus open on hover" setting: resting on a section's button opens its menu (hover
   * intent, --se-hover-delay); its leave-closer (SE.layer) closes it as for a clicked one.
   */
  const menuHover = SE.hoverIntent((node) => {
    const key = node.getAttribute('data-se-icon');
    if (!railMode() || !NAV_ITEMS[key] || (navMenu && !navMenu.released && navMenuKey === key)) return;
    toggleNavMenu(key, node);
  }, '--se-rail-hover-delay');
  function onNavEnter(event) {
    if (SE.settings?.get('menu-hover') === 'on') menuHover.enter(event.currentTarget);
  }
  const onNavLeave = () => menuHover.cancel();

  function bindNavItems() {
    for (const key of Object.keys(NAV_ITEMS)) {
      if (NAV_ITEMS[key].items) continue; // Games: a button at the rail's foot (header-actions.js)
      const node = document.querySelector(`.${C.SuperNavBar} .se-menu-icon[data-se-icon="${key}"]`);
      const prev = navNodes.get(key);
      if (node !== prev) {
        prev?.removeEventListener('click', onNavClick, true);
        prev?.removeEventListener('contextmenu', onNavContext, true);
        prev?.removeEventListener('pointerenter', onNavEnter);
        prev?.removeEventListener('pointerleave', onNavLeave);
        if (node) {
          node.addEventListener('click', onNavClick, true);
          node.addEventListener('contextmenu', onNavContext, true);
          node.addEventListener('pointerenter', onNavEnter);
          node.addEventListener('pointerleave', onNavLeave);
          node.setAttribute('aria-haspopup', 'menu');
          navNodes.set(key, node);
        } else {
          navNodes.delete(key);
        }
      }
      if (node) suppressSuperNavDropdown(node);
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
    ns.search.ensure();
    ns.titleBar.sync();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function pollState() {
    if (!railMode()) return;
    const persona = ns.resolveSelfPersona();
    const signature = [
      currentRoutePath(),
      currentBrowserURL(),
      persona ? `${persona.is_ingame}${persona.is_online}${persona.is_awayOrSnooze}${persona.m_strPlayerName}` : '',
      document.querySelector(`${ns.LIST_SELECTOR} .${C.AppCount}`)?.textContent || '',
    ].join('|');

    if (signature !== lastPollSignature) {
      lastPollSignature = signature;
      schedule();
    }
  }

  function cleanup(full) {
    ns.search.cleanup();
    ns.titleBar.cleanup();
    closeNavMenu();
    menuHover.cancel();
    for (const node of navNodes.values()) {
      node.removeEventListener('click', onNavClick, true);
      node.removeEventListener('contextmenu', onNavContext, true);
      node.removeEventListener('pointerenter', onNavEnter);
      node.removeEventListener('pointerleave', onNavLeave);
      node.removeAttribute('aria-haspopup');
    }
    navNodes.clear();

    if (full) {
      for (const [menu, saved] of patchedMenus) {
        if (menu.Show !== saved.show) continue;
        if (saved.own) Object.defineProperty(menu, 'Show', saved.own);
        else delete menu.Show;
      }
      patchedMenus.clear();
    }
  }

  Object.assign(ns, { currentRoutePath, navigateToLibraryRoute, schedule });

  function start() {
    /* Core already batches to a frame; rows' hover/selection classes are ignored */
    observer = SE.watch(update, { attributes: ['class'], ignore: ns.LIST_ROWS });
    ns.search.start();
    ns.titleBar.start();
    // Route, browser URL and persona have no shared Steam event; pollState() compares a short
    // signature and only re-renders when it changes. Rail mode only, paused when hidden.
    timer = SE.poll(pollState, 400, { active: railMode });
    ns.tips.start();
    schedule();
  }

  // For the element report (dev/inspector-report.js): each page icon's state, what a click
  // finds (its button, Steam's menu items, the rows made of them)
  function why() {
    if (!railMode()) return 'rail off';
    return Object.keys(NAV_ITEMS)
      .filter((key) => !NAV_ITEMS[key].items)
      .map((key) => {
        const node = navNodes.get(key);
        if (!node) return `${key}: no button`;
        const bound = node.isConnected ? '' : ' (detached)';
        // How many buttons match, and what a click at the bound one's centre lands on
        const count = document.querySelectorAll(`.${C.SuperNavBar} .se-menu-icon[data-se-icon="${key}"]`).length;
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        const lands = !box.width ? 'not drawn' : hit === node || node.contains(hit) ? 'clicks land on it' :
          `clicks land on ${hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : 'nothing'}`;
        const items = superNavProps(node)?.menuItems;
        const steam = Array.isArray(items) ? `${items.length} items, ${SE.run(() => sectionRows(key, node))?.length || 0} rows` : 'no Steam items';
        return `${key}: ${steam}, ${count} button(s), ${lands}${bound}`;
      })
      .join('; ') + `; last menu ${lastToggle}`;
  }

  window.__seRailNav = {
    why,
    // The Games button at the rail's foot (client/header/header-actions.js) opens its menu here
    toggleGames: (button) => toggleNavMenu('games', button, { foot: true }),
    // Opens the Games menu unless it's open already ("Menus open on hover", header-actions.js)
    showGames: (button) => {
      if (!(navMenu && !navMenu.released && navMenuKey === 'games')) toggleNavMenu('games', button, { foot: true });
    },
    destroy() {
      removeEventListener('DOMContentLoaded', start);
      observer?.disconnect();
      timer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      ns.search.destroy();
      ns.titleBar.destroy();
      ns.tips.destroy();
      cleanup(true);
      delete window.__seRailNav;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
