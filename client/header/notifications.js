/*
 * Annotate notification tray summary rows and notification rows with their kind's glyph and
 * day headings (client/header/notifications.css). Under a day's heading a row shows its time
 * (data-se-ntf-time on Steam's time, which shows a date for older days).
 */
((SE) => {
  window.__seNotifications?.destroy();

  const { C } = SE;
  const MENU_CLS = C.NotificationsMenu;
  const PINNED_CLS = C.PinnedTemplateDesktop;
  const ITEM_CLS = C.NotificationMenuItem;
  const HEADER_CLS = C.AllNotificationsTemplate_Header;
  const ICON_CLS = C.AllNotificationsTemplate_Icon;
  const TITLE_CLS = C.AllNotificationsTemplate_Title;

  const SUMMARY_KINDS = {
    pending_invites: 'friend',
    comments: 'comment',
    offline_messages: 'chat',
    pending_gifts: 'gift',
    trade_offers: 'trade',
  };

  // ESteamNotificationType enum mapping
  const NOTIFICATION_TYPES = {
    2: 'gift',
    3: 'comment',
    5: 'friend',
    6: 'sale',
    8: 'sale',
    9: 'trade',
    13: 'chat',
  };

  const setKindAttrs = (el, kind) => SE.attr(el, 'data-se-glyph', kind || null);

  const annotateSummaryRow = (row) => {
    const countItem = SE.fromProps(row, 8, (p) => (typeof p.countItem === 'string' ? p.countItem : undefined));
    const count = SE.fromProps(row, 8, (p) => (typeof p.count === 'number' ? p.count : undefined));
    const body = SE.fromProps(row, 4, (p) => (typeof p.body === 'string' ? p.body : undefined));

    setKindAttrs(row, SUMMARY_KINDS[countItem]);

    if (typeof count === 'number' && count > 0 && body) {
      const countStr = String(count);
      let label = body
        .replace(new RegExp(`(^|\\s)${countStr}(?=\\s|$)`), ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!label || label === body) {
        SE.unmark(row, 'data-se-label');
        SE.unmark(row, 'data-se-count');
        return;
      }
      label = label.charAt(0).toLocaleUpperCase() + label.slice(1);
      SE.mark(row, 'data-se-count', count > 99 ? '99+' : countStr);
      SE.mark(row, 'data-se-label', label);
      SE.mark(row.querySelector(`.${C.PinnedBody}`), 'data-se-label', label);
    } else {
      SE.unmark(row, 'data-se-label');
      SE.unmark(row, 'data-se-count');
    }
  };

  const computeDayKey = (date) => date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();

  const formatDayLabel = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - target) / 864e5);

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return target.toLocaleDateString(undefined, { weekday: 'long' });

    const opts =
      today.getFullYear() === target.getFullYear()
        ? { month: 'long', day: 'numeric' }
        : { month: 'long', day: 'numeric', year: 'numeric' };
    return target.toLocaleDateString(undefined, opts);
  };

  const formatTime = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Steam's time in the row's head line: whatever there isn't the kind's icon or label
  const timeOf = (item) =>
    [...(item.querySelector(`.${HEADER_CLS}`)?.children || [])].find(
      (el) => !el.classList.contains(ICON_CLS) && !el.classList.contains(TITLE_CLS)
    ) || null;

  const annotateNotificationItems = (list) => {
    let prevDayKey = null;
    for (const item of list) {
      const group = SE.fromProps(item, 3, (p) =>
        p.group && Array.isArray(p.group.notifications) ? p.group : undefined
      );
      const first = group?.notifications?.[0];
      setKindAttrs(item, NOTIFICATION_TYPES[first?.data?.type]);

      const rawTimestamp = first?.rtCreated ?? first?.data?.timestamp;
      const date =
        typeof rawTimestamp === 'number' && rawTimestamp > 0
          ? new Date(rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000)
          : null;
      const currentKey = date ? computeDayKey(date) : prevDayKey;

      const startsDay = !!date && currentKey !== prevDayKey;
      SE.attr(item, 'data-se-day', startsDay ? formatDayLabel(date) : null);
      prevDayKey = currentKey;
      const time = timeOf(item);
      if (time) SE.attr(time, 'data-se-ntf-time', date ? formatTime(date) : null);
    }
  };

  /*
   * Room for the panel's shadow: Steam sizes the menu (and, over a page, its popup window) to the
   * panel, which cut the shadow off. The wrappers Steam puts around the panel (no bigger than it)
   * go see-through (data-se-ntf-frame), and in a popup window so does the page itself
   * (data-se-ntf-window); notifications.css gives the panel a margin the shadow falls in.
   */
  const markFrames = (panel) => {
    const { width, height } = panel.getBoundingClientRect();
    for (let node = panel.parentElement; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      // The menu's own wrappers hug the panel (with its margin); anything bigger is the page.
      if (rect.width > width + 80 || rect.height > height + 80) break;
      SE.mark(node, 'data-se-ntf-frame');
    }
    if (!document.querySelector(`.${C.TopBar}`)) SE.mark(document.documentElement, 'data-se-ntf-window');
  };

  // Frames are measured when a panel appears or resizes, never in the observer pass. A removed
  // panel reports one last resize and is let go then.
  const sizer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      if (target.isConnected) markFrames(target);
      else sizer.unobserve(target);
    }
  });
  const sized = new WeakSet();

  const update = () => {
    for (const menu of document.querySelectorAll(`.${MENU_CLS}`)) {
      if (!sized.has(menu)) {
        sized.add(menu);
        sizer.observe(menu);
      }
      for (const row of menu.querySelectorAll(`.${PINNED_CLS}`)) annotateSummaryRow(row);
      annotateNotificationItems([...menu.querySelectorAll(`.${ITEM_CLS}`)]);
    }
  };

  const watcher = SE.watch(() => {
    if (document.querySelector(`.${MENU_CLS}`)) update();
  });
  update();

  window.__seNotifications = {
    destroy() {
      watcher.disconnect();
      sizer.disconnect();
      delete window.__seNotifications;
    },
  };
})(window.__se);
