/* Forward friend-message notification clicks to Steam Enhanced's main window. */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seFriendNotificationClicks?.destroy();

  /*
   * Open the friend's chat in the Friends dock for the friend-message notification `target`
   * belongs to. Returns true when it did. Shared with the Stage toasts (features/toasts/toasts.js),
   * which forward their own clicks here.
   */
  function forward(target) {
    const notification = SE.run(() => SE.fromProps(target, 40, (props) => {
      const data = props.group?.notifications?.at(-1)?.data || props.notification?.data;
      return data?.getClassName?.() === 'CClientNotificationFriendMessage' ? data : undefined;
    }));
    if (!notification || SE.run(() => notification.response_steamurl?.())) return false;

    const steamId = SE.run(() => notification.steamid());
    if (!/^\d{17,20}$/.test(steamId)) return false;
    const id = BigInt(steamId);
    if (((id >> 52n) & 15n) !== 1n) return false;
    const accountId = String(id & 0xffffffffn);

    // Let Steam finish the notification's own click handling first.
    queueMicrotask(() => SE.run(() => window.SteamClient?.Messaging?.PostMessage?.(
      'SteamEnhanced.Chat', 'OpenFriendNotification', accountId,
    )));
    return true;
  }

  /*
   * In the main window notifications only sit in the bell menu, so a click elsewhere skips the
   * fiber walk. Toast, overlay and menu windows are mostly notifications: every click is checked.
   */
  const MENU = [SE.C.NotificationsMenu, SE.C.NotificationMenuItem].filter(Boolean).map(cls => `.${cls}`).join(', ');
  const mainWindow = document.title === 'Steam';

  function onClick(event) {
    if (!event.isTrusted || event.button !== 0) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!target || (mainWindow && MENU && !target.closest(MENU))) return;
    forward(target);
  }

  window.addEventListener('click', onClick, true);
  window.__seFriendNotificationClicks = {
    forward,
    destroy() {
      window.removeEventListener('click', onClick, true);
      delete window.__seFriendNotificationClicks;
    },
  };
});
