/*
 * Root menu bar consolidation and context menu positioning.
 *
 * Patches Steam's ContextMenuManager instances so View, Friends, Games, and Help
 * render as native submenus inside the main Steam root menu, adds restart and
 * reload actions, and adds online status and profile rename controls to the
 * account menu when the vertical rail is active.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedSteamMenuParts (values parts reassign live on its `live`). Not strict
 * mode on purpose: patching writes to Steam's own menu objects (options, anchor, Show/TakeFocus,
 * CreateContextMenuInstance), some of which can be read-only, and such a write must be skipped,
 * not throw and leave a menu half-patched.
 * - shared.js     selectors, bookkeeping, and the menu's moving parts (on `live`)
 * - api.js        finding Steam's menu API
 * - menus.js      native submenus and localized labels
 * - account.js    the account menu
 * - actions.js    the added menus and actions
 * - hover.js      hover-to-open
 * - popups.js     menu popups and the sidebar's managers
 * - placement.js  where a menu opens
 * - patch.js      patching Steam's menu instances, start()
 * - main.js       the API (destroy()) and the start
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = (window.__steamEnhancedSteamMenuParts = { live: {} });
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
  live.timer = undefined;
  live.popupPoll = undefined;

  window.__steamEnhancedSteamMenu?.destroy();

  const ROOT_BTN_SELECTOR = `.${C.RootMenuBar} .${C.RootMenuButton}`;
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
  Object.assign(ns, {
    ROOT_BTN_SELECTOR, SIDE_HOVER, SUBMENU_NAMES, avatarLayouts, hoverDocuments, movedGroups,
    patched, popupObservers, sideButtons, sidebarManagers,
  });
});
