/*
 * Overlay: the toolbar's Game Overview and Achievements widgets, and their windows.
 *
 * Part of client/overlay/ (see context.js).
 */
((SE) => {
  const ns = window.__seOverlayParts;
  if (!ns) return;
  const { SEL, TOOLBAR_ACTIVE, desktopOverlay } = ns;

  /* ---------- Toolbar: Game Overview and Achievements ---------- */

  const CLOSE_RETRY_MS = 1500;
  // Steam names each toolbar button by its widget in its class list
  // (`ToolbarButton GameOverview`, `ToolbarButton FriendsList`, ...), in every
  // language. Those names are also the widgets' window ids.
  const WIDGET = Object.freeze({
    overview: 'GameOverview',
    achievements: 'Achievements',
    friends: 'FriendsList',
    remote: 'RemotePlayTogether',
    notes: 'Notes',
    controller: 'Controller',
    browser: 'Browser',
    settings: 'Settings',
  });

  const toolbarButton = (id) => document.querySelector(`${SEL.toolbarButton}.${WIDGET[id]}`);

  // A widget the column replaces: Steam may still open it (with the overlay, a
  // hotkey, a saved layout), so it's closed the way its toolbar button would,
  // once per opening, and `onClosed` shows the column's view instead. The
  // toolbars themselves are hidden by overlay.css; their buttons stay in the
  // DOM and still take .click().
  const createReplaced = (find, onClosed) => {
    let closedAt = 0;
    return {
      sync() {
        const button = find();
        if (button?.classList.contains(TOOLBAR_ACTIVE) && Date.now() - closedAt > CLOSE_RETRY_MS) {
          closedAt = Date.now();
          button.click();
          onClosed?.();
        }
      },
      release() {
        closedAt = 0;
      },
    };
  };

  // Game Overview's content is the left column; Achievements is its list view.
  const replacedButtons = [
    createReplaced(() => toolbarButton('overview')),
    createReplaced(() => toolbarButton('achievements'), () => ns.setView('achievements')),
  ];

  // Widgets a view hands off to (its own window), through their toolbar button.
  const toolButtons = Object.fromEntries(
    ['friends', 'remote', 'notes', 'controller', 'browser', 'settings'].map(id => [id, { current: () => toolbarButton(id) }])
  );

  // Open Steam's own widget for a view, through its (hidden) toolbar button.
  const openToolWidget = (id) => {
    if (id === 'remote' && SE.run(() => (desktopOverlay().ShowRemotePlayTogether(), true))) return true;
    const target = toolButtons[id]?.current();
    if (target && !target.classList.contains(TOOLBAR_ACTIVE)) target.click();
    return !!target;
  };

  const syncToolbar = () => {
    for (const replaced of replacedButtons) replaced.sync();
  };

  /* ---------- Widget windows ---------- */

  // Every widget window (Browser, Settings, Guides, Screenshots, ...) opens
  // centred on the overlay at one fixed size. Steam restores each widget's
  // last spot, so it's moved right after it shows, then left alone, so it
  // can still be dragged.
  const WINDOW_W = 1120;
  const WINDOW_H = 720;
  const WINDOW_MARGIN = 0.9; // at most this share of the overlay
  const WINDOW_SETTLE_MS = 1500;
  const WINDOW_TICK_MS = 100;
  const WINDOW_SLACK = 2;

  // Widget ids: ours, plus each toolbar button's widget class.
  const widgetIds = () => {
    const ids = new Set(Object.values(WIDGET));
    for (const btn of document.querySelectorAll(SEL.toolbarButton)) {
      for (const name of btn.classList) {
        if (/^[A-Z]/.test(name) && name !== 'ToolbarButton' && name !== 'DialogButton') ids.add(name);
      }
    }
    return ids;
  };

  // Widget windows carry Steam's OverlayPopupBody class on <body>.
  const OVERLAY_POPUP_BODY = '_1UJDmU3N-pkv7oTJ_Zf9nK';
  const isWindow = (value) => !!SE.run(() => value && typeof value.moveTo === 'function' && !!value.document);
  const isWidgetWindow = (win) =>
    isWindow(win) && win !== window && !!SE.run(() => win.document.body.classList.contains(OVERLAY_POPUP_BODY));

  // The Window inside one of Steam's popup objects, whichever field holds it.
  const windowOf = (popup) => {
    if (!popup) return null;
    if (isWindow(popup)) return popup;
    for (const key of ['m_popup', 'window', 'm_window', 'browserWindow', 'BrowserWindow']) {
      const win = SE.run(() => popup[key]);
      if (isWindow(win)) return win;
    }
    return SE.run(() => Object.values(popup).find(isWindow)) || null;
  };

  // Steam's popup manager, in this window or the one that created it.
  const popupManager = () => {
    for (const host of [window, SE.run(() => window.opener), SE.run(() => window.parent)]) {
      const manager = SE.run(() => host?.g_PopupManager);
      if (manager) return manager;
    }
    return null;
  };

  const managedPopups = () => {
    const manager = popupManager();
    if (!manager) return [];
    const list = SE.run(() => manager.GetPopups?.()) || SE.run(() => manager.m_mapPopups?.values()) || [];
    return SE.run(() => Array.from(list)) || [];
  };

  // Every open widget window: by widget id (GetPopupForWindow returns the
  // Window itself), plus any visible overlay popup Steam's popup manager
  // knows (Settings, chat, ...).
  const widgetWindows = () => {
    const found = new Set();
    const overlay = desktopOverlay();
    if (overlay) {
      for (const id of widgetIds()) {
        if (!SE.run(() => overlay.BWindowVisible(id))) continue;
        const win = windowOf(SE.run(() => overlay.GetPopupForWindow(id)));
        if (win) found.add(win);
      }
    }
    for (const popup of managedPopups()) {
      const win = windowOf(popup);
      if (isWidgetWindow(win) && SE.run(() => win.document.visibilityState) === 'visible') found.add(win);
    }
    return [...found].filter(win => !SE.run(() => win.closed));
  };

  // Target in this window's CSS pixels (it spans the screen).
  const windowTarget = () => {
    const w = Math.round(Math.min(WINDOW_W, window.innerWidth * WINDOW_MARGIN));
    const h = Math.round(Math.min(WINDOW_H, window.innerHeight * WINDOW_MARGIN));
    const x = Math.round(window.screenX + (window.innerWidth - w) / 2);
    const y = Math.round(window.screenY + (window.innerHeight - h) / 2);
    return { x, y, w, h };
  };

  const windowRect = (win) => SE.run(() => ({ x: win.screenX, y: win.screenY, w: win.outerWidth, h: win.outerHeight }));

  // Overlay popups ignore the DOM's moveTo/resizeTo; their own
  // SteamClient.Window API works. Positions are screen DIPs, the same units
  // as this window's CSS pixels and every window's screenX/outerWidth; the
  // popup's devicePixelRatio only reflects Steam's UI zoom, so it isn't used.
  // The DOM calls are a fallback for windows without that API.
  const placeWindow = (win) => {
    const target = windowTarget();
    const at = windowRect(win);
    const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= WINDOW_SLACK;
    const sized = !!at && near(at.w, target.w) && near(at.h, target.h);
    const moved = !!at && near(at.x, target.x) && near(at.y, target.y);
    if (sized && moved) return true;
    const api = SE.run(() => win.SteamClient?.Window);
    if (api?.MoveTo) {
      if (!sized) SE.run(() => api.ResizeTo(target.w, target.h, true));
      if (!moved) SE.run(() => api.MoveTo(target.x, target.y, false));
    } else {
      if (!sized) SE.run(() => win.resizeTo(target.w, target.h));
      if (!moved) SE.run(() => win.moveTo(target.x, target.y));
    }
    return false;
  };

  // Each window is placed once per opening (Steam keeps hidden widget windows
  // alive, so state is dropped when one hides), then left free to drag.
  const placedWindows = new Map();

  const centerWidgets = () => {
    const now = Date.now();
    const open = widgetWindows();
    for (const win of placedWindows.keys()) if (!open.includes(win)) placedWindows.delete(win);
    for (const win of open) {
      let state = placedWindows.get(win);
      if (!state) placedWindows.set(win, (state = { since: now, attempt: 0, done: false }));
      if (state.done || now - state.since > WINDOW_SETTLE_MS) continue;
      state.attempt++;
      state.done = placeWindow(win);
    }
  };

  const windowsDebug = () => {
    const overlay = desktopOverlay();
    const visible = [...widgetIds()].filter(id => SE.run(() => overlay.BWindowVisible(id)));
    return {
      target: windowTarget(),
      self: windowRect(window),
      popupManager: popupManager() ? ns.namesOf(popupManager()).slice(0, 60) : null,
      overlayNames: overlay ? ns.namesOf(overlay).filter(name => /window|popup|position|rect|size|pin/i.test(name)) : null,
      visible: visible.map(id => {
        const popup = SE.run(() => overlay.GetPopupForWindow(id));
        const win = windowOf(popup);
        return {
          id,
          popup: popup ? ns.namesOf(popup).slice(0, 60) : null,
          window: !!win,
          rect: win && windowRect(win),
          steamWindowApi: win && ns.namesOf(SE.run(() => win.SteamClient?.Window)),
          state: win && placedWindows.get(win),
        };
      }),
      managed: managedPopups().map(popup => ({
        names: ns.namesOf(popup).slice(0, 30),
        widget: isWidgetWindow(windowOf(popup)),
        title: SE.run(() => windowOf(popup)?.document.title),
      })),
    };
  };

  Object.assign(ns, { WIDGET, WINDOW_TICK_MS, centerWidgets, openToolWidget, replacedButtons, syncToolbar, toolButtons, windowsDebug });
})(window.__se);
