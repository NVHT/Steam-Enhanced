/*
 * Toasts: attributes, sizes, toast kinds and their glyphs, the settings.
 *
 * Part of client/toasts/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedToastsParts;
  if (!ns) return;
  const { run } = SE;
  const { IN_GAME, root } = ns;

  /* ---------- Config ---------- */

  const SRC_ATTR = 'data-se-tst-src';   // on Steam toasts that have a Stage toast
  const ON_ATTR = 'data-se-tst-on';     // on <html> while every Steam toast is adopted
  const WAIT_ATTR = 'data-se-tst-wait'; // on <html> while a new toast window is being read
  const ADOPT_TIMEOUT_MS = 2000;        // a toast still unreadable after this stays native
  const STALE_MAX_MS = 30000;           // a queued toast Steam has dropped is kept this long
  const PRUNE_MS = 650;                 // finished layers leave after their crossfade
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /*
   * Size. The tray is laid out at BASE_W (toasts.css) and zoomed as a whole to TRAY_W. Each toast
   * window is sized to the tray at its tallest (with the strip) plus room for the shadow, and
   * sits at the bottom centre, `lift` above the work area.
   */
  const BASE_W = 420;
  const TRAY_W = 350;
  const ZOOM = TRAY_W / BASE_W;
  const TRAY_H = Math.ceil(170 * ZOOM); // stage 124 + strip 34 + padding 12, zoomed
  const BOX = Object.freeze({ trayW: TRAY_W, trayH: TRAY_H, padX: 24, padTop: 24, padBottom: 8, lift: 24 });

  /*
   * Kinds: eyebrow, accent, countdown (0 = until handled), art source and fallback icon.
   * `pri` toasts play next instead of joining the end of the queue.
   */
  const KINDS = Object.freeze({
    msg: { label: 'Message', accent: 'msg', ms: 6000, art: 'avatar', icon: 'chat' },
    online: { label: 'Online', accent: 'on', ms: 4000, art: 'avatar', icon: 'dot' },
    playing: { label: 'Now playing', accent: 'play', ms: 6000, art: 'app', icon: 'play' },
    invite: { label: 'Invite', accent: 'inv', ms: 12000, art: 'app', icon: 'pad' },
    request: { label: 'Friend request', accent: 'inv', ms: 12000, art: 'avatar', icon: 'plus' },
    call: { label: 'Voice call', accent: 'play', ms: 0, pri: true, art: 'avatar', icon: 'phone' },
    ach: { label: 'Achievement unlocked', accent: 'ach', ms: 5000, art: 'app', icon: 'trophy' },
    ready: { label: 'Ready to play', accent: 'play', ms: 8000, art: 'app', icon: 'check', play: true },
    update: { label: 'Updated', accent: 'dl', ms: 6000, art: 'app', icon: 'down' },
    shot: { label: 'Screenshot saved', accent: 'dl', ms: 4000, art: 'image', icon: 'camera' },
    clip: { label: 'Game Recording', accent: 'dl', ms: 4000, art: 'app', icon: 'rec' },
    sale: { label: 'Wishlist', accent: 'shop', ms: 6000, art: 'app', icon: 'tag' },
    gift: { label: 'Gift received', accent: 'ach', ms: 6000, art: 'app', icon: 'gift' },
    item: { label: 'New item', accent: 'shop', ms: 6000, art: 'app', icon: 'cube' },
    trade: { label: 'Trade offer', accent: 'shop', ms: 6000, art: 'avatar', icon: 'trade' },
    comment: { label: 'Comment', accent: 'msg', ms: 6000, art: 'avatar', icon: 'chat' },
    family: { label: 'Steam Family', accent: 'sys', ms: 12000, art: 'app', icon: 'home' },
    battery: { label: 'Battery low', accent: 'ach', ms: 6000, art: 'ambient', icon: 'battery' },
    error: { label: 'Needs attention', accent: 'err', ms: 0, pri: true, art: 'app', icon: 'alert' },
    overlay: { label: 'Steam overlay', accent: 'sys', ms: 4000, art: 'app', icon: 'screen' },
    controller: { label: 'Controller', accent: 'sys', ms: 5000, art: 'ambient', icon: 'pad' },
    system: { label: 'Steam', accent: 'sys', ms: 5000, art: 'app', icon: 'steam' },
  });

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

  /*
   * Duotone glyphs: the shape in a 40% tint of the toast's color, the detail at full strength
   * (`.d` paths and strokes). One color, two tones.
   */
  const T = 'opacity=".4"';
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = Object.freeze({
    chat: `<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" fill="currentColor" ${T}/><path d="M8 8h8M8 11.5h5" ${S}/>`,
    dot: `<circle cx="12" cy="12" r="9" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4.5" fill="currentColor"/>`,
    play: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><path d="M10 8.2l6 3.8-6 3.8z" fill="currentColor"/>`,
    pad: `<path d="M7 7h10a4 4 0 0 1 4 4v4.5a2.5 2.5 0 0 1-4.4 1.6L14.8 15H9.2l-1.8 2.1A2.5 2.5 0 0 1 3 15.5V11a4 4 0 0 1 4-4z" fill="currentColor" ${T}/><path d="M8 9.8v3.4M6.3 11.5h3.4" ${S}/><circle cx="15.5" cy="10.6" r="1.2" fill="currentColor"/><circle cx="17.6" cy="12.7" r="1.2" fill="currentColor"/>`,
    plus: `<circle cx="9" cy="8" r="4" fill="currentColor" ${T}/><path d="M2 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5z" fill="currentColor" ${T}/><path d="M19 8v6M16 11h6" ${S}/>`,
    phone: `<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M15 3.5a6 6 0 0 1 5.5 5.5M15 7a2.5 2.5 0 0 1 2 2" ${S} ${T}/>`,
    trophy: `<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="currentColor" ${T}/><path d="M7 5H4.5a3 3 0 0 0 3 4.5M17 5h2.5a3 3 0 0 1-3 4.5M12 14v3.5M8 20.5h8" ${S}/>`,
    cup: `<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5H4a3.5 3.5 0 0 0 3.5 5M17 5h3a3.5 3.5 0 0 1-3.5 5" ${S}/><path d="M10.5 15h3v3h-3zM7.5 19h9v2h-9z" fill="currentColor" ${T}/>`,
    check: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><path d="M7.5 12.2l3 3 6-6.4" ${S} stroke-width="2.4"/>`,
    down: `<path d="M4 15h16v3.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" fill="currentColor" ${T}/><path d="M12 3.5v9M8 8.5l4 4 4-4" ${S}/>`,
    camera: `<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.8-2.5h6l1.8 2.5h2.7A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="currentColor" ${T}/><circle cx="12" cy="13.5" r="3.6" ${S}/>`,
    rec: `<circle cx="12" cy="12" r="9.5" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4.5" fill="currentColor"/>`,
    tag: `<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h6.9a1.5 1.5 0 0 1 1.1.4l8.3 8.4a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0l-8.4-8.3a1.5 1.5 0 0 1-.4-1.1z" fill="currentColor" ${T}/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>`,
    gift: `<path d="M4 12h16v7.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5zM3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V12H3z" fill="currentColor" ${T}/><path d="M12 7v14M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1" ${S}/>`,
    cube: `<path d="M12 3l8 4.5L12 12 4 7.5z" fill="currentColor"/><path d="M4 7.5L12 12v9l-8-4.5zM20 7.5V16.5L12 21v-9z" fill="currentColor" ${T}/>`,
    trade: `<path d="M4 8h14l-4-4" ${S} stroke-width="2.2"/><path d="M20 16H6l4 4" ${S} stroke-width="2.2" ${T}/>`,
    home: `<path d="M3.5 11L12 3.5l8.5 7.5v8.5A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" ${T}/><path d="M10 21v-5.5h4V21" ${S}/>`,
    battery: `<rect x="2.5" y="7" width="17" height="10" rx="2.5" fill="currentColor" ${T}/><path d="M21.5 10.5v3" ${S}/><rect x="5" y="9.5" width="3.5" height="5" rx="1" fill="currentColor"/>`,
    alert: `<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="currentColor" ${T}/><path d="M12 9.5v4M12 16.8h.01" ${S} stroke-width="2.4"/>`,
    screen: `<rect x="2.5" y="4" width="19" height="13" rx="2" fill="currentColor" ${T}/><path d="M8 20.5h8M12 17v3.5M6.5 13h6" ${S}/>`,
    steam: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4" fill="currentColor"/>`,
    close: '<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  });
  const icon = (name, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.steam}</svg>`;

  const token = name => getComputedStyle(root).getPropertyValue(name).trim().toLowerCase();
  const enabled = () => token('--se-toasts') !== 'off' && !(IN_GAME && token('--se-toasts-ingame') === 'off');
  // The Stage unless compact is asked for (decided once: a window shows one toast).
  const COMPACT = token('--se-toasts-style') === 'compact';

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

  Object.assign(ns, { ADOPT_TIMEOUT_MS, BOX, CLASS_RULES, COMPACT, KINDS, ON_ATTR, PRUNE_MS, SRC_ATTR, STALE_MAX_MS, TYPE_KINDS, WAIT_ATTR, ZOOM, enabled, field, icon, token });
});
