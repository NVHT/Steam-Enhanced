/*
 * Tips for the title bar, rail, sidebar and dock buttons: the theme's own tip, drawn for real
 * as a popup-layer panel (client/shared/popup-layer.js): in the page, or in a popup window above a Store
 * or Community page (the dock's tips open over it). One listener for the whole window; a button
 * opts in by being a theme button or carrying [data-se-tip] (its text), [data-se-tip-dir] its
 * side. Steam's own tips on the buttons the theme labels are muted. The tip wears the skin
 * client/dialogs/dialogs.css gives Steam's tooltips (.se-tip), so every tip looks the same.
 */
((SE) => {
  const { C, railMode } = SE;
  window.__seHeaderTooltips?.destroy();
  const layer = SE.layer;

  const pageIcons = new Set(['store', 'library', 'community', 'profile']);
  let isRail = false;

  // The Steam menu is Steam's own context menu (client/header/menu/): open while one of its
  // instances the menu patches is visible.
  const steamMenuOpen = () => {
    const parts = window.__seSteamMenuParts;
    if (!parts?.patched || typeof parts.isSteam !== 'function') return false;
    for (const instance of parts.patched.keys()) if (instance.visible && parts.isSteam(instance)) return true;
    return false;
  };

  // Controls that open hover menus show the menu, not a tip; a click menu or card (Settings,
  // Downloads, the Steam menu) shows its tip until it is open.
  const ownsDropdown = (node) => {
    const icon = node.getAttribute('data-se-icon');
    if (icon === 'steam') return steamMenuOpen();
    if (
      node.getAttribute('data-se-action') === 'add' ||
      (node.hasAttribute('aria-haspopup') && node.getAttribute('aria-expanded') === 'true')
    ) {
      return true;
    }
    return pageIcons.has(icon) && !isRail;
  };

  const RAIL_LABELS = { profile: 'Profile', community: 'Community' };

  const labelFor = (node) =>
    node.getAttribute('data-se-tip') ||
    (isRail && RAIL_LABELS[node.getAttribute('data-se-icon')]) ||
    node.getAttribute('aria-label');

  // Native header buttons whose built-in bottom tooltips are replaced with right-aligned rail tooltips.
  const NATIVE_TIPS = [
    [`.${C.FocusNavigationRoot_TitleBarControls} .${C.GamepadUIToggle}`, 'Big Picture Mode'],
    [
      `.${C.FocusNavigationRoot_TitleBarControls} .${C.AnnouncementsButton}:not(.se-header-action):not(.se-native-header-button)`,
      'Announcements',
    ],
  ];

  /*
   * Buttons whose own Steam tip is muted (the theme tips them): the title bar's Big Picture and
   * Announcements buttons in the rail, the bell and the avatar (and their tooltip sources; the
   * avatar shows your mini profile instead, client/friends/dock/friend-card.js). Muted by hiding
   * Steam's tooltips while the pointer is on one ([data-se-tip-muted] on <body>, dialogs.css),
   * decided at each hover: Steam re-renders these buttons, so nothing is tied to an element, and
   * every event goes on to Steam, whose tip opens and closes as it always does. (Stopping the
   * events instead cut React's enter and leave apart and left Steam's tip open for good.)
   */
  const BELL = `.${C.FocusNavigationRoot_TitleBarControls} :is(.${C.NotificationsButton}, .tool-tip-source:has(.${C.NotificationsButton}), .${C.AccountMenu}, .tool-tip-source:has(.${C.AccountMenu}))`;
  const muted = (target) =>
    Boolean(target.closest?.(BELL)) || (railMode() && NATIVE_TIPS.some(([selector]) => target.closest?.(selector)));

  const titleBarHeight = () => {
    const bar = document.querySelector(`.${C.TopBar}`);
    return bar ? bar.getBoundingClientRect().bottom - 2 : 48;
  };

  // Which side a tip opens on: the dock's to the left, the rail's below the title bar to the
  // right, the rest below; a button can name its own.
  const directionFor = (node, barBottom) =>
    node.getAttribute('data-se-tip-dir') ||
    (node.closest('.se-fdock')
      ? 'left'
      : isRail && node.getBoundingClientRect().top >= barBottom()
        ? 'right'
        : 'bottom');

  // Labels for the buttons the theme tips in place of Steam: data-se-tip, read by labelFor.
  function syncNativeTips() {
    for (const [selector, label] of NATIVE_TIPS) {
      const node = document.querySelector(selector);
      if (node) SE.attr(node, 'data-se-tip', isRail ? label : null);
    }
    const bell = document.querySelector(`.${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}`);
    // The bell opens on click (client/header/menu/hover.js): hovering it shows its tip
    if (bell) SE.attr(bell, 'data-se-tip', 'Notifications');
  }

  const CANDIDATES = '.se-menu-icon, .se-header-action, .se-sidebar-tip, [data-se-tip]';


  // Where the tip goes beside its button: on `direction`'s side, centred on it (SE.tipSpot)
  function spotFor(node, direction) {
    const r = node.getBoundingClientRect();
    return (w, h) => SE.tipSpot(r, w, h, direction);
  }

  // Steam's own tooltip delay (nDelayShowMS, --se-tip-delay), as these tips had. Without the
  // popup layer there are no tips; the rest (labels, muting) still runs.
  const tips = layer?.hover({
    sheets: ['client/dialogs/dialogs.css'],
    delay: '--se-tip-delay',
    place: (source) => spotFor(source, directionFor(source, titleBarHeight)),
    draw: (source, label) => (container) => {
      const el = container.ownerDocument.createElement('div');
      el.className = 'se-tip';
      el.setAttribute('role', 'tooltip');
      el.textContent = label;
      container.append(el);
    },
  }) ?? { enter() {}, left: () => false, leave() {}, node: null };

  const hide = () => tips.leave();
  const show = (node) => {
    const label = labelFor(node);
    if (label) tips.enter(node, label);
  };

  // The button a hover or keyboard focus lands on, when it has a tip to show.
  const tipped = (target) => {
    const node = target.closest?.(CANDIDATES);
    return node && !ownsDropdown(node) && labelFor(node) ? node : null;
  };

  function onOver(event) {
    const node = event.target.closest?.(CANDIDATES);
    if (node && node === tips.node) return;
    hide();
    if (tipped(event.target)) show(node);
  }

  function onOut(event) {
    if (tips.left(event)) hide();
  }

  // Keyboard focus shows the tip as a hover does (pointer focus doesn't: the hover already did).
  function onFocus(event) {
    const node = tipped(event.target);
    if (!node || node === tips.node || !node.matches(':focus-visible')) return;
    hide();
    show(node);
  }

  function onBlur(event) {
    if (tips.node && tips.node.contains(event.target)) hide();
  }

  function onKey(event) {
    if (event.key === 'Escape' && tips.node) hide();
  }

  const MUTE_ATTR = 'data-se-tip-muted';
  const STEAM_TIPS = `.${C.TextToolTip}, .${C.ToolTipCustom}`;

  /*
   * Leaving a muted button: Steam's tip for it is still in the page for a moment (it closes after
   * the hover ends), so it is marked on its own before <body> stops hiding Steam's tips; otherwise
   * it shows for those frames. Tips opened later are new nodes, and show as usual.
   */
  function setMuted(on) {
    if (on || !document.body.hasAttribute(MUTE_ATTR)) {
      SE.attr(document.body, MUTE_ATTR, on ? '' : null);
      return;
    }
    for (const tip of document.querySelectorAll(STEAM_TIPS)) tip.setAttribute(MUTE_ATTR, '');
    document.body.removeAttribute(MUTE_ATTR);
  }

  // The window's hover (capture, on the document: seen whatever Steam's own listeners do).
  function onHover(event) {
    if (event.type === 'mouseover') {
      setMuted(muted(event.target));
      onOver(event);
    } else {
      onOut(event);
    }
  }

  const HOVER_EVENTS = ['mouseover', 'mouseout'];

  let observer;
  let frame = 0;

  const update = () => {
    frame = 0;
    isRail = railMode();
    syncNativeTips();
    // A button that went away, or now opens a menu, takes its tip with it.
    const source = tips.node;
    if (source && (!source.isConnected || ownsDropdown(source))) hide();
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const start = () => {
    // Core already batches non-sync watchers into one frame; the throttle keeps hover-driven
    // class churn from re-reading the title bar more than ten times a second.
    observer = SE.watch(update, {
      attributes: ['aria-label', 'class', 'data-se-icon', 'data-se-tip'],
      throttle: 100,
    });
    schedule();
  };

  for (const type of HOVER_EVENTS) document.addEventListener(type, onHover, true);
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('focusout', onBlur, true);
  document.addEventListener('keydown', onKey, true);
  // A press acts on the button: its tip goes, as Steam's did.
  document.addEventListener('pointerdown', hide, true);

  window.__seHeaderTooltips = {
    destroy() {
      observer?.disconnect();
      for (const type of HOVER_EVENTS) document.removeEventListener(type, onHover, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', onBlur, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', hide, true);
      if (frame) cancelAnimationFrame(frame);
      hide();
      SE.unmark(document.body, MUTE_ATTR);
      for (const [selector] of NATIVE_TIPS) SE.unmark(document.querySelector(selector), 'data-se-tip');
      removeEventListener('DOMContentLoaded', start);
      delete window.__seHeaderTooltips;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
