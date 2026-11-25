/*
 * Toasts: attributes, sizes, the rules that tell a toast's kind, the settings. The kinds, their
 * glyphs and the tray's size: card.js.
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { run } = SE;
  const { IN_GAME } = ns;
  const { KINDS, PRUNE_MS, TRAY_W, ZOOM } = SE.toastCard;

  /* ---------- Config ---------- */

  const SRC_ATTR = 'data-se-tst-src';   // on Steam toasts that have a Stage toast
  const ON_ATTR = 'data-se-tst-on';     // on <html> while every Steam toast is adopted
  const WAIT_ATTR = 'data-se-tst-wait'; // on <html> while a new toast window is being read
  const ADOPT_TIMEOUT_MS = 2000;        // a toast still unreadable after this stays native
  const STALE_MAX_MS = 30000;           // a queued toast Steam has dropped is kept this long

  /*
   * Size. The tray is laid out at BASE_W and zoomed as a whole to TRAY_W (card.js). Each toast
   * window is sized to the tray at its tallest (with the strip) plus room for the shadow, and
   * sits at the bottom centre, `lift` above the work area.
   */
  const TRAY_H = Math.ceil(170 * ZOOM); // stage 124 + strip 34 + padding 12, zoomed
  const BOX = Object.freeze({ trayW: TRAY_W, trayH: TRAY_H, padX: 24, padTop: 24, padBottom: 8, lift: 24 });

  // Data class name (CClientNotification*) → kind. Checked in order.
  const CLASS_RULES = [
    [/IncomingVoiceChat|VoiceChat|Call/, 'call'],
    [/FriendMessage|GroupChat|ChatMessage/, 'msg'],
    [/FriendInvite/, 'request'],
    [/FriendInGame|InGame/, 'playing'],
    [/FriendOnline|Online/, 'online'],
    [/Invite|Playtest/, 'invite'],
    [/Achievement/, 'ach'],
    [/DownloadCompleted|Download/, 'ready'],
    [/Screenshot/, 'shot'],
    [/GameRecording|Clip/, 'clip'],
    [/LowBattery|Battery/, 'battery'],
    [/Controller|SteamInput|Gamepad/, 'controller'],
    [/LowDiskSpace|Disk|CloudSync|Error|Failure/, 'error'],
    [/Gift/, 'gift'],
    [/ItemAnnouncement|Item/, 'item'],
    [/Wishlist|Sale/, 'sale'],
    [/Trade/, 'trade'],
    [/Comment/, 'comment'],
    [/Family|Parental|Playtime|Purchase/, 'family'],
    [/OverlaySplash|Overlay/, 'overlay'],
  ];

  // EClientNotificationType → kind, for notifications without a data class (best effort).
  const TYPE_KINDS = Object.freeze({
    1: 'ready', 2: 'request', 3: 'playing', 4: 'online', 5: 'ach', 6: 'battery', 8: 'msg',
    9: 'msg', 10: 'request', 14: 'shot', 15: 'error', 16: 'error', 17: 'call', 19: 'gift',
    20: 'item', 22: 'error', 23: 'battery', 27: 'comment', 28: 'sale', 29: 'trade', 33: 'overlay',
    44: 'family', 46: 'family', 48: 'family', 49: 'family', 50: 'error', 54: 'clip', 58: 'clip',
    59: 'invite',
  });

  // The Toasts settings (client/shared/settings.js), read live: a change applies to the next toast
  const setting = (key) => SE.settings?.get(key);
  const enabled = () => setting('toasts') !== 'off' && !(IN_GAME && setting('toasts-in-game') === 'off');
  // The Stage unless compact is asked for (decided once: a window shows one toast).
  const COMPACT = setting('toast-style') === 'compact';

  /* ---------- Steam data ---------- */

  // A protobuf getter (`steamid()`) or a plain field, under any of the given names.
  const field = (obj, ...names) => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const name of names) {
      const v = run(() => (typeof obj[name] === 'function' ? obj[name]() : obj[name]));
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };

  Object.assign(ns, { ADOPT_TIMEOUT_MS, BOX, CLASS_RULES, COMPACT, KINDS, ON_ATTR, PRUNE_MS, SRC_ATTR, STALE_MAX_MS, TYPE_KINDS, WAIT_ATTR, ZOOM, enabled, field, setting });
})(window.__se);
