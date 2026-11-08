/* Forward friend-message notification clicks to Steam Enhanced's main window. */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seFriendNotificationClicks?.destroy();

  function onClick(event) {
    if (!event.isTrusted || event.button !== 0) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!target) return;
    const notification = SE.run(() => SE.fromProps(target, 40, (props) => {
      const data = props.group?.notifications?.at(-1)?.data || props.notification?.data;
      return data?.getClassName?.() === 'CClientNotificationFriendMessage' ? data : undefined;
    }));
    if (!notification || SE.run(() => notification.response_steamurl?.())) return;

    const steamId = SE.run(() => notification.steamid());
    if (!/^\d{17,20}$/.test(steamId)) return;
    const id = BigInt(steamId);
    if (((id >> 52n) & 15n) !== 1n) return;
    const accountId = String(id & 0xffffffffn);

    // Let Steam finish the notification's own click handling first.
    queueMicrotask(() => SE.run(() => window.SteamClient?.Messaging?.PostMessage?.(
      'SteamEnhanced.Chat', 'OpenFriendNotification', accountId,
    )));
  }

  window.addEventListener('click', onClick, true);
  window.__seFriendNotificationClicks = {
    destroy() {
      window.removeEventListener('click', onClick, true);
      delete window.__seFriendNotificationClicks;
    },
  };
});
