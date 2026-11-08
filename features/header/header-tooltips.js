/* Attach native Steam React tooltips to header, rail, and sidebar icon buttons. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C, railMode } = SE;
  window.__steamEnhancedHeaderTooltips?.destroy();

  const mounts = new Map();
  const pageIcons = new Set(['store', 'library', 'community', 'profile']);
  let isRail = false;

  // Controls that open hover menus must not host a nested tooltip root.
  const ownsDropdown = node => {
    const icon = node.getAttribute('data-se-icon');
    if (
      icon === 'steam' ||
      node.getAttribute('data-se-action') === 'add' ||
      (node.matches(`.${C.NotificationsButton}`) && hasNotifications() !== false)
    ) {
      return true;
    }
    return pageIcons.has(icon) && !isRail;
  };

  const RAIL_LABELS = { profile: 'Profile', community: 'Discussions' };

  const labelFor = node =>
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

  // Exclude client-only tray entries (eSource === 1) that Steam's notification menu skips.
  const hasNotifications = () => {
    for (const owner of SE.owners()) {
      try {
        const result = owner.NotificationStore?.GetNotificationsInTray?.();
        if (Array.isArray(result?.[0])) {
          return result[0].some(group => {
            const first = group.notifications?.[0];
            return first && first.eSource !== 1;
          });
        }
      } catch (_) {}
    }
    return null;
  };

  let trayCallbacks = null;
  let traySubscription = null;

  const watchTray = () => {
    for (const owner of SE.owners()) {
      try {
        const callbacks = owner.NotificationStore?.GetNotificationsInTray?.()?.[1];
        if (!callbacks?.Register) continue;
        if (callbacks === trayCallbacks) return;
        traySubscription?.Unregister();
        trayCallbacks = callbacks;
        traySubscription = callbacks.Register(schedule);
        break;
      } catch (_) {}
    }
  };

  const mutedNodes = new Set();
  const MUTE_EVENTS = ['mouseover', 'mouseout', 'pointerover', 'pointerout'];
  const stopHoverPropagation = event => event.stopPropagation();

  const muteNode = node => {
    if (mutedNodes.has(node)) return;
    for (const type of MUTE_EVENTS) node.addEventListener(type, stopHoverPropagation);
    mutedNodes.add(node);
  };

  const unmuteNode = node => {
    for (const type of MUTE_EVENTS) node.removeEventListener(type, stopHoverPropagation);
    node.removeAttribute('data-se-tip');
    mutedNodes.delete(node);
  };

  const titleBarHeight = () => {
    const bar = document.querySelector(`.${C.TopBar}`);
    return bar ? bar.getBoundingClientRect().bottom - 2 : 48;
  };

  function syncNativeTips() {
    const activeSet = new Set();
    if (isRail) {
      for (const [selector, label] of NATIVE_TIPS) {
        const node = document.querySelector(selector);
        if (!node) continue;
        activeSet.add(node);
        if (node.getAttribute('data-se-tip') !== label) node.setAttribute('data-se-tip', label);
        muteNode(node);
      }
    }

    const bell = document.querySelector(`.${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}`);
    if (bell) {
      const label = hasNotifications() === false ? 'Notifications' : null;
      if (label && bell.getAttribute('data-se-tip') !== label) bell.setAttribute('data-se-tip', label);
      if (!label) bell.removeAttribute('data-se-tip');
      for (const node of new Set([bell, bell.closest('.tool-tip-source')].filter(Boolean))) {
        activeSet.add(node);
        muteNode(node);
      }
    }

    for (const node of mutedNodes) {
      if (!activeSet.has(node)) unmuteNode(node);
    }
  }

  let observer;
  let frame = 0;

  const update = () => {
    frame = 0;
    isRail = railMode();
    watchTray();
    syncNativeTips();

    for (const [node, entry] of mounts) {
      if (!node.isConnected || !entry.host.isConnected || ownsDropdown(node) || !labelFor(node)) {
        entry.root.unmount();
        entry.host.remove();
        mounts.delete(node);
      }
    }

    const candidates = [
      ...document.querySelectorAll('.se-menu-icon, .se-header-action, .se-sidebar-tip, [data-se-tip]'),
    ].filter(node => !ownsDropdown(node));
    if (!candidates.length) return;

    const native = window.__steamEnhancedNativeTooltips?.resolve();
    if (!native) return;
    const { React, DOM, Tooltip } = native;

    for (const node of candidates) {
      const label = labelFor(node);
      if (!label) continue;

      const fallbackDirection = () =>
        node.closest('.se-fdock')
          ? 'left'
          : isRail && node.getBoundingClientRect().top >= titleBarHeight()
            ? 'right'
            : 'bottom';
      const direction = node.getAttribute('data-se-tip-dir') || fallbackDirection();

      let entry = mounts.get(node);
      if (!entry) {
        const host = document.createElement('span');
        host.className = 'se-header-tooltip-host';
        node.appendChild(host);
        entry = { host, root: DOM.createRoot(host), label: null, direction: null };
        mounts.set(node, entry);
      }

      if (entry.label === label && entry.direction === direction) continue;
      entry.label = label;
      entry.direction = direction;
      entry.root.render(
        React.createElement(Tooltip, {
          toolTipContent: label,
          bTopmost: true,
          nDelayShowMS: 200,
          direction,
          nBodyAlignment: 0.5,
          nBodyDistance: 6,
          bPortalToBody: true,
          children: React.createElement('span', { className: 'se-header-tooltip-hitbox' }),
        })
      );
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const start = () => {
    observer = SE.watch(schedule, {
      attributes: ['aria-label', 'class', 'data-se-icon', 'data-se-tip', 'data-se-tip-dir'],
      sync: true,
    });
    schedule();
  };

  window.__steamEnhancedHeaderTooltips = {
    hasNotifications,
    destroy() {
      observer?.disconnect();
      traySubscription?.Unregister();
      traySubscription = null;
      trayCallbacks = null;
      if (frame) cancelAnimationFrame(frame);
      for (const node of [...mutedNodes]) unmuteNode(node);
      for (const entry of mounts.values()) {
        entry.root.unmount();
        entry.host.remove();
      }
      mounts.clear();
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedHeaderTooltips;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
