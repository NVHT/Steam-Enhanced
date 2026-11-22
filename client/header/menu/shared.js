/*
 * Root menu bar consolidation and context menu positioning.
 *
 * Patches Steam's ContextMenuManager instances so View, Friends, Games, and Help
 * render as native submenus inside the main Steam root menu, adds restart and
 * reload actions, and adds online status and profile rename controls to the
 * account menu when the vertical rail is active.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seSteamMenuParts (values parts reassign live on its `live`). Not strict
 * mode on purpose: patching writes to Steam's own menu objects (options, anchor, Show/TakeFocus,
 * CreateContextMenuInstance), some of which can be read-only, and such a write must be skipped,
 * not throw and leave a menu half-patched.
 * - shared.js     selectors, bookkeeping, and the menu's moving parts (on `live`)
 * - api.js        finding Steam's menu API
 * - menus.js      localized labels
 * - account.js    the account menu
 * - actions.js    the Steam menu's layout
 * - hover.js      hover-to-open
 * - popups.js     menu popups and the sidebar's managers
 * - placement.js  where a menu opens
 * - patch.js      patching Steam's menu instances, start()
 * - main.js       the API (destroy()) and the start
 * Listed after them: client/library/game-menu.js (the games' right-click menu), through
 * createHooks and cleanups.
 */
((SE) => {
  const ns = (window.__seSteamMenuParts = { live: {} });
  const { C } = SE;
  const { live } = ns;
  live.renameDialogOpener = undefined;
  live.hoverCloseTimer = undefined;
  live.pointerInMain = false;
  live.mainPointer = undefined;
  live.hoverButton = undefined;
  live.popupsIdle = false;
  live.manager = undefined;
  live.originalCreate = undefined;
  live.wrappedCreate = undefined;
  live.steamButton = undefined;
  live.api = undefined;
  live.observer = undefined;
  live.startPoll = undefined;
  live.popupPoll = undefined;

  window.__seSteamMenu?.destroy();

  const ROOT_BTN_SELECTOR = `.${C.RootMenuBar} .${C.RootMenuButton}`;
  // Steam's menu-bar buttons the theme takes over (their bar buttons hidden). Help's rows join
  // the Steam menu (client/header/menu/actions.js); View's went elsewhere (Hidden Games and
  // Soundtracks to the rail's Library menu, Big Picture Mode to the Steam menu) or were dropped;
  // Friends is the dock's; Games is a button at the rail's foot (client/navigation/nav-rail.js).
  const SUBMENU_NAMES = ['View', 'Friends', 'Games', 'Help'];
  const SIDE_HOVER = {
    add: '[data-se-action="add"]',
    bell: `.${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}`,
    account: `.${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`,
  };

  const patched = new Map();
  const sidebarManagers = new Map();
  const sideButtons = new Map();
  const hoverDocuments = new Set();
  const avatarLayouts = new Map();
  const popupObservers = new Map();
  const movedGroups = new Map();
  /*
   * Other features' say in Steam's menus: each create hook sees every menu the main window's
   * manager makes (popups.js bindManager), each cleanup runs on destroy (main.js). The game
   * menu (client/library/game-menu.js) uses both.
   */
  const createHooks = [];
  const cleanups = [];

  /*
   * Closing with the menus' animation: every way Steam hides a menu ends in InternalHide, which
   * drops its window at once. Wrapped, the panel (panelOf(instance)) plays the closing animation
   * first (SE.layer.closeWith, core/motion.css) and the window goes when it ends. Hidden again
   * while it fades (Steam hides a menu more than one way at once), it goes straight away, so a
   * menu is never left half closed and unable to open. Returns { cancel() for a menu shown again
   * meanwhile, restore() }. The Steam menu (patch.js) and the library menus (game-menu.js) use it.
   */
  function animateClose(instance, panelOf) {
    let closing = null;
    const own = Object.getOwnPropertyDescriptor(instance, 'InternalHide');
    const original = instance.InternalHide;
    const wrapped = function (...args) {
      if (closing) {
        closing();
        closing = null;
        return original.apply(this, args);
      }
      const panel = this.visible ? SE.run(panelOf, this) : null;
      if (!panel || !SE.layer?.closeWith) return original.apply(this, args);
      closing = SE.layer.closeWith(panel, () => {
        closing = null;
        original.apply(this, args);
      });
      return undefined;
    };
    instance.InternalHide = wrapped;
    return {
      cancel() {
        closing?.();
        closing = null;
      },
      restore() {
        if (instance.InternalHide !== wrapped) return;
        if (own) Object.defineProperty(instance, 'InternalHide', own);
        else delete instance.InternalHide;
      },
    };
  }

  Object.assign(ns, {
    animateClose, cleanups, createHooks,
    ROOT_BTN_SELECTOR, SIDE_HOVER, SUBMENU_NAMES, avatarLayouts, hoverDocuments,
    movedGroups, patched, popupObservers, sideButtons, sidebarManagers,
  });
})(window.__se);
