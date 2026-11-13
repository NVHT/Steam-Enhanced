/* Annotate notification tray summary rows and notification cards with type and day metadata. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedNotifications?.destroy();

  const { C } = SE;
  const MENU_CLS = C.NotificationsMenu;
  const PINNED_CLS = C.PinnedTemplateDesktop;
  const ITEM_CLS = C.NotificationMenuItem;

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

  const setKindAttrs = (el, kind) => {
    if (kind) {
      SE.mark(el, 'data-se-kind', kind);
      SE.mark(el, 'data-se-glyph', kind);
    } else {
      SE.unmark(el, 'data-se-kind');
      SE.unmark(el, 'data-se-glyph');
    }
  };

  const annotateSummaryRow = row => {
    const countItem = SE.fromProps(row, 8, p => (typeof p.countItem === 'string' ? p.countItem : undefined));
    const count = SE.fromProps(row, 8, p => (typeof p.count === 'number' ? p.count : undefined));
    const body = SE.fromProps(row, 4, p => (typeof p.body === 'string' ? p.body : undefined));

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

  const computeDayKey = date => date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();

  const formatDayLabel = date => {
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

  const annotateNotificationItems = list => {
    let prevDayKey = null;
    const dayStarts = list.map(item => {
      const group = SE.fromProps(item, 3, p =>
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
      return startsDay;
    });

    // The last card of each day (the one before a new day's first, and the very last).
    list.forEach((item, index) => {
      SE.attr(item, 'data-se-last', index === list.length - 1 || dayStarts[index + 1] ? '' : null);
    });
  };

  const update = () => {
    for (const menu of document.querySelectorAll(`.${MENU_CLS}`)) {
      for (const row of menu.querySelectorAll(`.${PINNED_CLS}`)) annotateSummaryRow(row);
      annotateNotificationItems([...menu.querySelectorAll(`.${ITEM_CLS}`)]);
    }
  };

  const watcher = SE.watch(() => {
    if (document.querySelector(`.${MENU_CLS}`)) update();
  });
  update();

  window.__steamEnhancedNotifications = {
    destroy() {
      watcher.disconnect();
    },
  };
});
