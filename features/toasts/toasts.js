/*
 * Stage toasts: Steam's desktop notification toasts as a miniature Library Home stage at the
 * bottom centre of the screen. Runs in Steam's `notificationtoasts_` windows (one per toast).
 *
 * Steam keeps rendering its own toasts. Each one is read from its React props (kind, app,
 * ids) and its rendered output (text, images, buttons) into a queue the toast windows share.
 * One window draws the stage and plays the queue one toast at a time: the game's hero art
 * under the Home stage grade, a sweep countdown, and a strip for the ones waiting. Clicks go
 * to Steam's own toast and buttons, so what they do, and the language they're in, stay Steam's.
 *
 * Fail-safe: a Steam toast is hidden only once it's queued; a toast this script can't read
 * stays as Steam drew it. `--se-toasts: off` (shared/tokens.css) turns it all off.
 * Debug, in a toast window's console: `__seToasts.why()` shows the shared queue, which window
 * is the stage and the placement; `__seToasts.probe()` shows the React components and props
 * above the window's text.
 */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seToasts?.destroy();

  const { run, esc, mark, unmark, rarity } = SE;
  const root = document.documentElement;

  // In Steam's toast windows this reads and plays Steam's toasts. Anywhere else (the main
  // window) it only plays previews, for the toast tester (features/toasts/toast-tester.js).
  const IN_TOAST_WINDOW = /^notificationtoasts_/.test(window.name || document.title || '');

  /* ---------- Config ---------- */

  const SRC_ATTR = 'data-se-tst-src';   // on Steam toasts that have a Stage toast
  const ON_ATTR = 'data-se-tst-on';     // on <html> while every Steam toast is adopted
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

  const enabled = () => getComputedStyle(root).getPropertyValue('--se-toasts').trim().toLowerCase() !== 'off';

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

  /*
   * How Steam draws a desktop toast (React tree above the toast's text):
   *
   *   ee(appid, notification, toastIndex, toastCount, onDismiss, registerPopup)  one popup window per toast
   *   └ Oe(notification, onDismiss, toastIndex, toastCount)                       the toast
   *     └ ?(className, group, location, onDismiss)                                its notification group
   *       └ ze(logo, title, icon, body, onActivate, onDismiss, personaStatus)    the template
   *
   * Minified names change between Steam builds, so components are matched by their props.
   */
  const FIBER_DEPTH = 24;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v) && !v.$$typeof && !v.nodeType;

  /*
   * The toast an element belongs to: the `notification` prop of the component that stacks it.
   * It may be an object or a plain id, so entries are kept in a Map (not a WeakMap) by that value.
   */
  const NO_ID = Object.freeze({ noId: true });
  const toastIn = p => ('notification' in p && ('toastIndex' in p || 'toastCount' in p) ? p : undefined);
  const keyOf = el => {
    if (!el || el === document.body) return null;
    const stack = run(() => SE.fromProps(el, FIBER_DEPTH, toastIn));
    return stack ? (stack.notification ?? NO_ID) : null;
  };

  // Props of the first component below `src` that matches.
  const below = (src, test) => run(() => SE.findDown(src, test, 800)) || null;
  const templateOf = src => below(src, p => typeof p.onActivate === 'function' && ('title' in p || 'body' in p));
  const groupOf = src => below(src, p => isObj(p.group) && 'location' in p)?.group || null;
  const stackOf = src => run(() => SE.fromProps(src, FIBER_DEPTH, toastIn)) || null;

  // The notification itself: the group's newest (as friend-notification-clicks.js reads it), else the toast's.
  const noteOf = (key, src) => {
    const group = src && groupOf(src);
    return (Array.isArray(group?.notifications) && group.notifications.at(-1)) || key;
  };

  // English wording, only when Steam's data says nothing about the kind.
  const TEXT_KINDS = [
    [/\bachievement\b/i, 'ach'],
    [/ready to play|download (is )?complete/i, 'ready'],
    [/\bscreenshot/i, 'shot'],
    [/\bclip\b|recording/i, 'clip'],
    [/friend request|wants to be (your )?friends?/i, 'request'],
    [/\binvited?\b/i, 'invite'],
    [/wishlist|on sale|% off/i, 'sale'],
    [/\bgift\b/i, 'gift'],
    [/trade offer/i, 'trade'],
    [/comment/i, 'comment'],
    [/battery/i, 'battery'],
    [/\bcontroller\b/i, 'controller'],
  ];

  function kindOf(note, tpl, text) {
    const data = note?.data;
    const cls = String(run(() => data?.getClassName?.()) || '');
    for (const [re, kind] of CLASS_RULES) if (cls && re.test(cls)) return kind;
    const type = Number(field(note, 'eType', 'notification_type', 'type'));
    if (TYPE_KINDS[type]) return TYPE_KINDS[type];
    // A friend's presence toast carries their persona status.
    if (tpl && 'personaStatus' in tpl && tpl.personaStatus) return /\bplaying\b/i.test(text) ? 'playing' : 'online';
    for (const [re, kind] of TEXT_KINDS) if (re.test(text)) return kind;
    return 'system';
  }

  // A plain URL from a template prop (Steam passes either a URL or an element).
  const urlOf = v => (typeof v === 'string' && /^(https?:|\/|data:image\/(?!gif))/.test(v) ? v : '');

  const contextGlobal = name => {
    for (const win of SE.owners()) {
      const v = run(() => win[name]);
      if (v) return v;
    }
    return null;
  };

  const steamClient = () => {
    for (const win of SE.owners()) {
      const sc = run(() => win.SteamClient);
      if (typeof sc?.Apps?.GetMyAchievementsForApp === 'function') return sc;
    }
    return window.SteamClient || null;
  };

  /* ---------- Reading a Steam toast ---------- */

  const BUTTONS = 'button, [role="button"], .DialogButton';
  const shown = el => el.getClientRects().length > 0;
  const isInline = el => /^(inline|contents)$/.test(getComputedStyle(el).display);
  const blockOf = (el, stop) => {
    let cur = el;
    while (cur && cur !== stop && isInline(cur)) cur = cur.parentElement;
    return cur || stop;
  };
  const clean = s => s.replace(/\s+/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim();

  // Text lines (one per block), images and buttons, in the order Steam draws them.
  function read(src) {
    // Steam wraps the whole toast in a role="button" element (its click target): that one
    // isn't an action button. Real buttons are <button>s, or role="button"s holding less text.
    const all = clean(src.textContent || '');
    const isAction = el =>
      el.matches('button, .DialogButton') || (el.matches(BUTTONS) && clean(el.textContent || '') !== all);
    const actionOf = el => {
      for (let cur = el; cur && cur !== src; cur = cur.parentElement) if (cur.matches(BUTTONS) && isAction(cur)) return cur;
      return null;
    };

    const lines = new Map();
    const walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const host = node.parentElement;
      if (!host || !node.data.trim() || actionOf(host) || !shown(host)) continue;
      const block = blockOf(host, src);
      lines.set(block, `${lines.get(block) || ''} ${node.data}`);
    }
    const uniq = [...new Set([...lines.values()].map(clean).filter(Boolean))];
    // Drop lines another line already says (a group chat draws the sender, then "sender: message").
    const text = uniq.filter((l, i) => i === 0 || !uniq.some((o, j) => j !== i && j !== 0 && o.length > l.length && o.includes(l)));

    const images = [...src.querySelectorAll('img')]
      .map(img => ({ src: img.currentSrc || img.getAttribute('src') || '', area: img.offsetWidth * img.offsetHeight }))
      .filter(i => i.src && !i.src.startsWith('data:image/gif'));

    const buttons = [...src.querySelectorAll(BUTTONS)]
      .filter(b => isAction(b) && !actionOf(b.parentElement) && clean(b.textContent || ''))
      .slice(0, 2)
      .map(b => ({ label: clean(b.textContent), el: b }));

    // The element whose React onClick is the toast's own action (opening the chat, the game...).
    let click = src;
    for (const el of [src, ...src.querySelectorAll('*')]) {
      if (el !== src && actionOf(el)) continue;
      if (typeof SE.props(el)?.onClick === 'function') {
        click = el;
        break;
      }
    }

    return {
      title: text[0] || '',
      text: text.slice(1).join(' · ').slice(0, 160),
      icon: images[0]?.src || '',
      large: images.slice().sort((a, b) => b.area - a.area)[0]?.src || '',
      buttons,
      click,
    };
  }

  // A friend's 32-bit account id from their 64-bit SteamID (individual accounts only).
  const accountIdOf = v => {
    if (!/^\d{17,20}$/.test(String(v || ''))) return 0;
    const id = BigInt(String(v));
    return ((id >> 52n) & 15n) === 1n ? Number(id & 0xffffffffn) : 0;
  };

  // A Steam app id (non-Steam game ids are 64-bit and have no art).
  const appIdOf = v => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 && n <= 0xffffffff ? n : 0;
  };

  // The longest name of a game in your library that the text mentions.
  function appByName(text) {
    const apps = run(() => contextGlobal('appStore')?.allApps) || [];
    let best = null;
    for (const a of apps) {
      const name = a?.display_name;
      if (name && name.length > 2 && text.includes(name) && (!best || name.length > best.display_name.length)) best = a;
    }
    return best ? appIdOf(best.appid) : 0;
  }

  function describe(key, src) {
    const note = noteOf(key, src);
    const data = note?.data;
    const tpl = templateOf(src);
    const stack = stackOf(src);
    const seen = read(src);
    const kind = kindOf(note, tpl, `${seen.title} ${seen.text}`);
    const k = KINDS[kind];
    const appid =
      appIdOf(field(data, 'appid', 'game_id', 'gameid', 'app_id') || field(note, 'appid')) ||
      appIdOf(run(() => SE.fromProps(src, FIBER_DEPTH, p => (Number(p.appid) > 0 ? Number(p.appid) : undefined)))) ||
      // A friend's game: their persona status carries it (the toast itself has none).
      appIdOf(field(tpl?.personaStatus, 'm_unGamePlayedAppID', 'm_gameid', 'unGamePlayedAppID', 'gameid', 'appid')) ||
      (kind === 'playing' ? appByName(`${seen.title} ${seen.text}`) : 0);
    const dismiss = [tpl?.onDismiss, stack?.onDismiss].find(f => typeof f === 'function') || null;
    const pct = Number(field(data, 'global_achieved_pct', 'global_achieved_percent', 'achieved_pct', 'flAchieved'));
    return {
      kind,
      label: k.label,
      accent: k.accent,
      // Steam's own display time for this toast, so ours ends with it; sticky kinds stay sticky.
      ms: k.ms && steamMs(key) > 0 ? steamMs(key) : k.ms,
      steamMs: steamMs(key),
      pri: !!k.pri,
      artKind: k.art,
      glyph: k.icon,
      play: !!k.play,
      title: seen.title,
      text: seen.text,
      icon: seen.icon || urlOf(tpl?.logo) || urlOf(tpl?.icon),
      shot: kind === 'shot' ? seen.large : '',
      buttons: seen.buttons,
      click: seen.click,
      dismiss,
      stackIndex: Number(stack?.toastIndex) || 0,
      appid,
      achId: String(field(data, 'achievement_id', 'api_name', 'achievement', 'name_id') || ''),
      accountId: accountIdOf(field(data, 'steamid', 'steamid_sender', 'steamid_friend', 'steamid_requestor', 'steamid_commenter', 'steamid_partner', 'steamid_inviter', 'steamid_caller', 'steamid_other')),
      pct: Number.isFinite(pct) ? pct : NaN,
    };
  }

  /* ---------- Steam's timer ---------- */

  /*
   * Steam closes each toast window when its own timer runs out, whatever the stage is doing:
   * that cuts the close animation short and ignores hover. So as soon as a toast appears its
   * duration is set far out (read before Steam schedules it, if Steam reads it late) and the
   * theme dismisses it itself once it has played.
   *
   * Whether Steam honours that is learnt, not assumed: until a toast window has outlived its
   * original time, slots still shrink to fit Steam's timers (hub.timerHeld).
   * A guard dismisses any toast the stage never finishes, so none can stay up forever.
   */
  const HOLD_MS = 10 * 60 * 1000;
  const GUARD_MS = 60 * 1000;          // past Steam's own time, unless hovered
  const origMs = new WeakMap();        // notification → Steam's original duration

  const steamMs = key => (key && typeof key === 'object' && origMs.has(key) ? origMs.get(key) : Number(field(key, 'nToastDurationMS')) || 0);

  function holdTimer(key) {
    if (!key || typeof key !== 'object' || origMs.has(key)) return;
    const ms = Number(run(() => key.nToastDurationMS));
    if (!(ms > 0)) return;
    origMs.set(key, ms);
    run(() => { key.nToastDurationMS = HOLD_MS; });
  }
  const held = key => !!key && typeof key === 'object' && run(() => key.nToastDurationMS) === HOLD_MS;

  // Put Steam's duration back for a toast left native (it can't be read), and close it on time.
  function letGo(key, src, born) {
    const ms = origMs.get(key);
    if (!ms || !held(key)) return;
    run(() => { key.nToastDurationMS = ms; });
    const dismiss = stackOf(src)?.onDismiss;
    if (typeof dismiss === 'function') setTimeout(() => run(dismiss), Math.max(0, born + ms - Date.now()));
  }

  // Newly drawn toasts, seen at once (not throttled) so the duration changes before Steam reads it.
  function onEarlyMutation(records) {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || dock?.contains(n)) continue;
        holdTimer(keyOf(n));
        for (const el of n.querySelectorAll?.('*') || []) {
          const key = keyOf(el);
          if (key !== null) {
            holdTimer(key);
            break;
          }
        }
      }
    }
  }

  // The pointer on the stage counts as on every queued Steam toast (Steam may pause on hover).
  function hoverSteam(on) {
    const types = on ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
    for (const e of hub().entries) {
      const el = e.click || e.src;
      if (e.done || !alive(e.win) || !el?.isConnected) continue;
      run(() => {
        for (const type of types) {
          const Ctor = type.startsWith('pointer') ? e.win.PointerEvent || e.win.MouseEvent : e.win.MouseEvent;
          el.dispatchEvent(new Ctor(type, { bubbles: !type.endsWith('enter') && !type.endsWith('leave'), relatedTarget: null }));
        }
      });
    }
  }

  /* ---------- Achievements: the theme's rarity ---------- */

  const achCache = new Map(); // appid → Promise<rgAchievements[]>

  function achievements(appid) {
    if (!achCache.has(appid)) {
      const sc = steamClient();
      const p = sc?.Apps?.GetMyAchievementsForApp
        ? Promise.resolve(sc.Apps.GetMyAchievementsForApp(String(appid)))
            .then(r => (typeof r === 'string' ? JSON.parse(r) : r))
            .then(r => (r?.result === 1 && Array.isArray(r.data?.rgAchievements) ? r.data.rgAchievements : []))
            .catch(() => [])
        : Promise.resolve([]);
      achCache.set(appid, p);
      setTimeout(() => achCache.delete(appid), 15000); // a new unlock changes the list
    }
    return achCache.get(appid);
  }

  async function enrichAchievement(m) {
    if (m.kind !== 'ach' || !m.appid) return;
    if (m.preview && (Number.isFinite(m.pct) || m.mastered)) return; // the tester gave its own
    const all = await achievements(m.appid);
    if (!all.length || m.done) return;
    const name = m.title.toLowerCase();
    const hit =
      (m.achId && all.find(a => a.strID === m.achId)) ||
      all.find(a => a.strName && (name === a.strName.toLowerCase() || m.text.toLowerCase().includes(a.strName.toLowerCase()))) ||
      all.filter(a => a.bAchieved).sort((a, b) => (b.rtUnlocked || 0) - (a.rtUnlocked || 0))[0];
    if (hit && !Number.isFinite(m.pct)) m.pct = Number(hit.flAchieved);
    if (hit && !m.icon && hit.strImage) m.icon = hit.strImage;
    if (all.every(a => a.bAchieved)) {
      m.mastered = {
        total: all.length,
        counts: rarity.TIERS.map(t => ({ t, n: all.filter(a => rarity.tierOf(a.flAchieved) === t).length })).filter(c => c.n),
      };
    }
    m.rev++;
    notify();
  }

  /* ---------- View ---------- */

  let dock = null;
  let tray = null;
  let stage = null;
  let strip = null;
  let pos = null;

  function build() {
    dock = document.createElement('div');
    dock.id = 'se-tst';
    dock.style.setProperty('--se-tst-zoom', String(Math.round(ZOOM * 10000) / 10000));
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Notifications');
    dock.setAttribute('aria-live', 'polite');
    dock.innerHTML =
      '<div class="se-tst-tray"><div class="se-tst-stage"></div>' +
      '<div class="se-tst-strip"><span class="se-tst-pos"></span></div></div>';
    tray = dock.firstElementChild;
    stage = tray.querySelector('.se-tst-stage');
    strip = tray.querySelector('.se-tst-strip');
    pos = strip.querySelector('.se-tst-pos');
    dock.addEventListener('click', onDockClick);
    dock.addEventListener('animationend', onDockAnimationEnd);
    dock.addEventListener('pointerover', onTrayHover);
    dock.addEventListener('pointerout', onTrayHover);
    document.body.appendChild(dock);
  }

  // An <img> working through its copies; drawn as nothing until one loads (shared/images.css).
  function artImg(urls, cls, onFail) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    if (!urls.length) return img;
    img.setAttribute('data-se-art-wait', '');
    let i = 0;
    img.onload = () => img.removeAttribute('data-se-art-wait');
    img.onerror = () => {
      if (++i < urls.length) img.src = urls[i];
      else {
        img.onerror = null;
        onFail?.(img);
      }
    };
    img.src = urls[0];
    return img;
  }

  /*
   * A friend's mini-profile background (the one Steam shows on their hover card), from the
   * community's mini-profile JSON. Fetched once per friend and shared across toast windows.
   */
  function miniProfile(accountId) {
    const host = run(() => window.opener) || window;
    const cache = run(() => (host.__seMiniProfiles ||= new Map())) || new Map();
    if (!cache.has(accountId)) {
      cache.set(
        accountId,
        fetch(`https://steamcommunity.com/miniprofile/${accountId}/json`, { credentials: 'include' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
    return cache.get(accountId);
  }

  async function profileArt(accountId, art) {
    const bg = (await miniProfile(accountId))?.profile_background;
    if (!bg || !art.isConnected) return;
    const video = bg['video/webm'] || bg['video/mp4'];
    const still = bg.image || bg['image/jpeg'] || bg['image/png'];
    let el;
    if (video) {
      el = document.createElement('video');
      Object.assign(el, { src: video, muted: true, loop: true, autoplay: true, playsInline: true });
      el.setAttribute('aria-hidden', 'true');
    } else if (typeof still === 'string') {
      el = artImg([still], 'se-tst-hero');
    } else {
      return;
    }
    el.className = 'se-tst-hero';
    const show = () => {
      art.replaceChildren(el);
      delete art.dataset.ambient;
    };
    if (video) el.addEventListener('loadeddata', show, { once: true });
    else el.addEventListener('load', show, { once: true });
    if (video) run(() => el.play());
  }

  /*
   * The ground for toasts with no art: the splash's background (branding/splash.png), the
   * wireframe of the themed Library, redrawn to the stage's shape. It comes alive in the
   * toast's color: the selection moves down the list, the bottom cards light in turn, friends'
   * status rings breathe, the hero panel glows, and a light passes over it all.
   */
  const AMBIENT_HTML = (() => {
    const list = [62, 44, 70, 38, 54, 48, 60].map((w, i) => `<rect class="se-tst-wf-line" x="42" y="${30 + i * 11}" width="${w}" height="2" rx="1"/>`).join('');
    const rail = [0, 1, 2, 3].map(i => `<rect class="se-tst-wf-ln${i === 0 ? ' se-tst-wf-on' : ''}" x="12" y="${14 + i * 16}" width="10" height="10" rx="3"/>`).join('');
    const cards = [0, 1, 2].map(i => `<rect class="se-tst-wf-ln se-tst-wf-card" style="--i:${i}" x="${148 + i * 57}" y="96" width="51" height="40" rx="5"/>`).join('');
    const friends = ['game', 'game', 'on', 'off', 'off']
      .map((st, i) => `<circle class="se-tst-wf-fr" data-st="${st}" style="--i:${i}" cx="${332}" cy="${18 + i * 18}" r="5.5"/>` +
        `<rect class="se-tst-wf-line" x="${343}" y="${17 + i * 18}" width="${[16, 14, 46, 28, 36][i]}" height="2" rx="1"/>`)
      .join('');
    return (
      '<svg class="se-tst-wf" viewBox="0 0 408 124" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">' +
      '<rect class="se-tst-wf-ln" x="4" y="6" width="400" height="150" rx="10"/>' +
      '<path class="se-tst-wf-ln" d="M30 6v150M134 6v150M318 6v150"/>' +
      rail +
      '<rect class="se-tst-wf-ln" x="40" y="12" width="86" height="10" rx="3"/>' + list +
      '<rect class="se-tst-wf-sel" x="42" y="30" width="70" height="2" rx="1"/>' +
      '<rect class="se-tst-wf-ln" x="142" y="12" width="168" height="78" rx="6"/>' +
      '<ellipse class="se-tst-wf-glow" cx="226" cy="50" rx="44" ry="22"/>' +
      cards + friends +
      '</svg><i class="se-tst-wf-light"></i>'
    );
  })();

  const artURLs = m => {
    const hero = m.appid && m.artKind !== 'ambient' ? SE.heroURLs(m.appid, contextGlobal('appStore')) : [];
    if (m.artKind === 'image' && m.shot) return [m.shot, ...hero];
    if (m.artKind === 'app' || m.artKind === 'image') return hero;
    return [];
  };

  function sparkles(rank) {
    return `<span class="se-tst-fx" aria-hidden="true">${'<i class="se-tst-spark"></i>'.repeat(rank)}</span>`;
  }

  // Presence as an outline round the avatar, as in the friends list: blue online, green in game.
  const PRESENCE = Object.freeze({ online: 'online', playing: 'ingame' });

  function tileHTML(m, tier) {
    const img = m.icon ? `<img class="se-tst-tile-img" src="${esc(m.icon)}" alt="" draggable="false">` : icon(m.glyph);
    if (m.kind !== 'ach') return img;
    if (m.mastered) return icon('cup') + sparkles(5);
    return tier ? img + sparkles(tier.rank) + `<b class="se-tst-initial">${tier.name[0]}</b>` : img;
  }

  function rightHTML(m, tier) {
    if (m.kind === 'ach' && m.mastered) {
      return `<div class="se-tst-stat"><b>${m.mastered.total}<small> / ${m.mastered.total}</small></b><em class="se-tst-pill">100%</em></div>`;
    }
    if (m.kind === 'ach' && tier) {
      return `<div class="se-tst-stat"><b>${esc(rarity.fmtPct(m.pct))}%</b><em class="se-tst-pill">${tier.name}</em></div>`;
    }
    return m.buttons
      .map((b, i) => {
        const cls = i === 0 ? (m.play ? 'se-tst-btn-play' : 'se-tst-btn-acc') : 'se-tst-btn-glass';
        return `<button type="button" class="se-tst-btn ${cls}" data-se-tst-act="${i}"${m.stale ? ' disabled' : ''}>${esc(b.label)}</button>`;
      })
      .join('');
  }

  function detailHTML(m) {
    if (m.kind === 'ach' && m.mastered) {
      const chips = m.mastered.counts
        .map(c => `<i data-se-tier="${c.t.id}">${c.t.name[0]} ${c.n}</i>`)
        .join('');
      return `<div class="se-tst-chips">${chips}</div>`;
    }
    return `<div class="se-tst-ds">${esc(m.text)}</div>`;
  }

  /* ---------- One stage for every toast window ---------- */

  /*
   * Steam opens a window per toast. They share one queue (the hub, kept in Steam's shared
   * context: the windows' opener) and one stage. The newest window that has reached the
   * bottom centre plays every toast, one at a time, with the rest waiting in its strip; the
   * other windows read their own Steam toast into the queue and draw nothing. When the stage's
   * window closes (Steam's timer), the next newest takes over where it left off.
   *
   * A toast plays in a slot: its own time, shortened when the queue wouldn't otherwise finish
   * before the last Steam toast closes (never below MIN_SLOT_MS).
   *
   * Steam's toast is dismissed by its own window once its Stage toast has played, except the
   * stage's own, which stays until the queue empties (dismissing it closes the stage).
   */
  const HUB_KEY = '__seToastHub';
  const HUB_V = 3;
  const MIN_SLOT_MS = 2500;
  const MIN_LEFT_MS = 1500;      // a shortened toast still shows at least this much more
  const CLOSE_MS = 900;          // the tray's close animation, with margin
  const HANDOFF_MS = 60;         // the old stage steps down this long after the new one draws

  const alive = w => !!w && run(() => !w.closed) === true;

  // The shared context, or this window for previews in the main window.
  const home = () => (IN_TOAST_WINDOW ? shared() : window);

  /*
   * Made from the shared context's own constructors, so the hub outlives whichever toast
   * window created it.
   */
  function hub() {
    const at = home();
    let h = run(() => at[HUB_KEY]);
    if (h?.v === HUB_V) return h;
    const O = run(() => at.Object && at.Array) ? at : window;
    h = new O.Object();
    Object.assign(h, {
      v: HUB_V,
      seq: 0,
      wins: new O.Array(),     // toast windows, oldest first
      stage: null,             // the window drawing the tray
      entries: new O.Array(),  // play order
      active: 0,               // entry id on the stage
      startedAt: 0,
      pausedAt: 0,
      slot: 0,
      playRev: 0,              // bumped whenever the active toast (re)starts
      open: false,
      closing: false,
      timerHeld: false,        // Steam's timer waits for the theme (learnt)
      steamCloses: new O.Array(), // windows Steam closed before the theme did (for why())
    });
    run(() => { at[HUB_KEY] = h; });
    return h;
  }

  const entryById = id => hub().entries.find(e => e.id === id) || null;
  const activeEntry = () => {
    const h = hub();
    return h.entries.find(e => e.id === h.active && !e.done) || null;
  };
  const live = () => hub().entries.filter(e => !e.done);
  const isStage = () => hub().stage === window;
  const elapsed = h => Math.max(0, (h.pausedAt || Date.now()) - h.startedAt);

  function register() {
    const h = hub();
    if (!h.wins.includes(window)) h.wins.push(window);
  }

  // Every window (this one too) re-syncs on its next tick.
  function notify() {
    const h = hub();
    for (const w of new Set([...h.wins, window])) if (alive(w)) run(() => w.__seToasts?.wake?.());
  }

  let syncQueued = false;
  function wake() {
    if (syncQueued) return;
    syncQueued = true;
    setTimeout(sync, 0);
  }

  /*
   * The slot for the toast about to play: its time, or less so that everything still queued
   * fits before the last live Steam toast closes.
   */
  function slotFor(e, h, waiting) {
    if (!e.ms) return 0;
    if (h.timerHeld) return e.ms;
    const ends = h.entries.filter(x => !x.stale && alive(x.win)).map(x => x.deadline);
    const horizon = ends.length ? Math.max(...ends) : Infinity;
    if (!Number.isFinite(horizon)) return e.ms;
    const fair = (horizon - Date.now() - CLOSE_MS) / Math.max(1, waiting);
    return Math.round(Math.min(e.ms, Math.max(MIN_SLOT_MS, fair)));
  }

  /*
   * More toasts joined while one plays: shorten what's left of it to its fair share, so the
   * rest still fit (the countdown jumps ahead rather than toasts being lost).
   */
  function reslot(h) {
    const cur = h.entries.find(e => e.id === h.active && !e.done);
    if (!cur || !h.slot) return;
    const played = elapsed(h);
    const share = slotFor(cur, h, h.entries.filter(x => !x.done).length);
    const slot = Math.round(Math.max(MIN_SLOT_MS, played + MIN_LEFT_MS, Math.min(h.slot, played + share)));
    if (slot >= h.slot) return;
    h.slot = slot;
    h.playRev++;
  }

  // Puts `id` (else the first waiting) on the stage, or starts closing when nothing waits.
  function advance(h, id = 0) {
    const waiting = h.entries.filter(x => !x.done);
    const next = (id && waiting.find(x => x.id === id)) || waiting[0];
    if (!next) {
      h.active = 0;
      if (h.open) h.closing = true;
      return;
    }
    h.closing = false;
    h.active = next.id;
    h.startedAt = Date.now();
    h.pausedAt = 0;
    h.slot = slotFor(next, h, waiting.length);
    h.playRev++;
  }

  /* ---------- Queue ---------- */

  const byKey = new Map();           // this window's Steam notifications (object or id) → entry
  const pendingKeys = new Map();     // unreadable so far → first seen
  const skipped = new Set();         // gave up: left native

  function add(key, src, info) {
    const h = hub();
    const now = Date.now();
    // `seenIcon` is what Steam drew; `icon` may be filled in later (an achievement's own image).
    const e = {
      id: ++h.seq,
      key,
      src,
      win: window,
      born: now,
      deadline: info.preview || !info.ms ? Infinity : now + info.ms,
      done: false,
      stale: false,
      released: false,
      rev: 1,
      ...info,
      seenIcon: info.icon,
    };
    byKey.set(key, e);
    if (src) mark(src, SRC_ATTR);

    // Priority toasts play next; the rest join the end.
    const at = e.pri && h.active ? h.entries.findIndex(x => x.id === h.active) + 1 : h.entries.length;
    h.entries.splice(at, 0, e);
    if (!h.active) advance(h);
    else reslot(h);
    enrichAchievement(e);
    notify();
    return e;
  }

  /*
   * Plays a Stage toast from a description instead of a Steam toast (the toast tester).
   * spec: { kind, title, text, icon, shot, appid, accountId, pct, ms, buttons: [labels],
   * mastered: { total, counts } }. Buttons and clicks only finish the preview.
   */
  function preview(spec = {}) {
    if (!document.body) return null;
    register();
    const kind = KINDS[spec.kind] ? spec.kind : 'system';
    const k = KINDS[kind];
    const e = add({ preview: true }, null, {
      kind,
      label: k.label,
      accent: k.accent,
      ms: spec.ms ?? k.ms,
      pri: !!k.pri,
      artKind: k.art,
      glyph: k.icon,
      play: !!k.play,
      title: spec.title || k.label,
      text: spec.text || '',
      icon: spec.icon || '',
      shot: spec.shot || '',
      buttons: (spec.buttons || []).map(label => ({ label, el: null })),
      click: null,
      dismiss: null,
      appid: Number(spec.appid) || 0,
      achId: '',
      accountId: Number(spec.accountId) || 0,
      pct: Number.isFinite(spec.pct) ? spec.pct : NaN,
      mastered: spec.mastered || null,
      preview: true,
    });
    return e.id;
  }

  // Ends every toast now, without the close animation (the tester's Clear).
  function clearAll() {
    const h = hub();
    for (const e of h.entries) e.done = true;
    h.active = 0;
    h.open = false;
    h.closing = false;
    teardown();
    notify();
  }

  const history = []; // the last toasts finished, and why (for why())
  function finish(e, why = '') {
    if (!e || e.done) return;
    e.done = true;
    history.push({ title: e.title, kind: e.kind, ms: e.ms, slot: e.id === hub().active ? hub().slot : 0, why, after: Date.now() - e.born });
    if (history.length > 6) history.shift();
    const h = hub();
    if (e.id === h.active) advance(h);
    notify();
  }

  function play(id) {
    const h = hub();
    if (id === h.active || !entryById(id) || entryById(id).done) return;
    advance(h, id);
    notify();
  }

  // The close animation ended: the queue is empty.
  function closed() {
    const h = hub();
    if (!h.closing) return;
    h.closing = false;
    h.open = false;
    teardown();
    notify(); // windows now release their finished toasts, the stage's own included
  }

  /*
   * This window's part: dismiss Steam's toast for entries that have played (not the stage's
   * own while the tray is up), and forget entries nobody needs any more.
   */
  function release(h) {
    const up = h.open || h.closing;
    for (const e of h.entries) {
      if (e.win !== window || !e.done || e.released) continue;
      if (IN_TOAST_WINDOW && isStage() && up) continue; // dismissing it would close the stage
      e.released = true;
      unmark(e.src, SRC_ATTR);
      if (e.dismiss && e.src?.isConnected) {
        dismissedByUs = true;
        run(e.dismiss);
      }
    }
    for (let i = h.entries.length - 1; i >= 0; i--) {
      const e = h.entries[i];
      if (!e.done || !(e.released || !alive(e.win))) continue;
      h.entries.splice(i, 1);
      if (e.preview && e.win === window) byKey.delete(e.key);
    }
  }

  /*
   * The window that should be the stage: the newest one that's ready at the bottom centre.
   * Windows whose toast couldn't be read (left native) never get ready, so never take it.
   */
  function candidate(h) {
    for (let i = h.wins.length - 1; i >= 0; i--) {
      const w = h.wins[i];
      if (alive(w) && run(() => w.__seToasts?.ready?.())) return w;
    }
    return null;
  }

  let claiming = false;
  async function claim() {
    claiming = true;
    try {
      await place(); // Steam may have moved the window back to its corner meanwhile
    } finally {
      claiming = false;
    }
    const h = hub();
    if (candidate(h) !== window) return;
    // Hover pauses don't carry over (the pointer is on the old window).
    if (h.pausedAt) {
      h.startedAt += Date.now() - h.pausedAt;
      h.pausedAt = 0;
    }
    h.stage = window;
    render(true);
    setTimeout(notify, HANDOFF_MS); // the old stage steps down once this one is drawn
  }

  function sync() {
    syncQueued = false;
    if (!document.body) return;
    const h = hub();
    for (let i = h.wins.length - 1; i >= 0; i--) if (!alive(h.wins[i])) h.wins.splice(i, 1);
    if (h.stage && !alive(h.stage)) h.stage = null;

    const want = candidate(h);
    if (want === window && h.stage !== window && !claiming) claim();
    if (h.stage === window) {
      tick(h);
      render();
    } else {
      teardown();
    }
    if (IN_TOAST_WINDOW) guard(h);
    release(h);

    // Get to the bottom centre once a toast from this window is queued, ready to take over.
    if (IN_TOAST_WINDOW && !ready() && !preparing && byKeyHasLive()) prepare();
  }

  const byKeyHasLive = () => [...byKey.values()].some(e => !e.done);

  /*
   * The stage's housekeeping: a countdown that ended without its animationend (a window that
   * was hidden), and queued toasts whose Steam toast is long gone.
   */
  function tick(h) {
    const cur = activeEntry();
    if (cur && h.slot && !h.pausedAt && elapsed(h) > h.slot + 600) finish(cur, 'countdown (late)');
    const now = Date.now();
    for (const e of h.entries) {
      if (!e.done && e.stale && e.id !== h.active && now - e.born > STALE_MAX_MS) finish(e, 'dropped by Steam');
      // A toast window still open well past Steam's own time: Steam waits for the theme.
      if (!h.timerHeld && !e.stale && e.steamMs && alive(e.win) && now - e.born > e.steamMs + 1500) h.timerHeld = true;
    }
  }

  // This window's toasts that never finished (the stage is gone or stuck): end them.
  function guard(h) {
    if (h.pausedAt) return;
    const now = Date.now();
    for (const e of byKey.values()) {
      if (!e.done && !e.preview && now - e.born > (e.steamMs || STALE_MAX_MS) + GUARD_MS) finish(e, 'guard');
    }
  }

  /* ---------- Placement readiness ---------- */

  let preparing = false;
  let prepared = !IN_TOAST_WINDOW;
  // Ready to be the stage: at the bottom centre, with a toast of its own still up.
  const ready = () =>
    prepared && !!document.body && (!IN_TOAST_WINDOW || [...byKey.values()].some(e => !e.released));

  async function prepare() {
    preparing = true;
    try {
      await place();
    } finally {
      preparing = false;
      // Even if the window couldn't be moved it can play the stage where Steam put it.
      prepared = true;
      notify();
    }
  }

  /* ---------- Drawing the stage (only in the stage window) ---------- */

  const views = new Map(); // entry id → { layer, thumb, rev, armed, leaving }

  // (Re)draws an entry's content in place; its art and countdown are left running.
  function paint(e, v) {
    v.rev = e.rev;
    const tier = e.kind === 'ach' && !e.mastered ? rarity.tierOf(e.pct) : null;
    const tierId = e.mastered ? 'legendary' : tier?.id;
    SE.attr(v.layer, 'data-se-tier', tierId || null);
    SE.attr(v.thumb, 'data-se-tier', tierId || null);
    const label = e.kind === 'ach' && e.mastered ? 'Game mastered' : e.label;
    v.layer.querySelector('.se-tst-ct').innerHTML =
      `<div class="se-tst-tile"${PRESENCE[e.kind] ? ` data-presence="${PRESENCE[e.kind]}"` : ''}>${tileHTML(e, tier)}</div>` +
      `<div class="se-tst-tx"><div class="se-tst-ey">${esc(label)}</div>` +
      `<div class="se-tst-tt">${esc(e.title)}</div>${detailHTML(e)}</div>` +
      `<div class="se-tst-rt">${rightHTML(e, tier)}</div>`;
  }

  function makeView(e, instant) {
    const layer = document.createElement('div');
    layer.className = 'se-tst-layer';
    // Taking over mid-toast: already showing, no fade-in (cleared once drawn).
    if (instant) {
      layer.dataset.instant = '';
      setTimeout(() => delete layer.dataset.instant, 80);
    }
    layer.dataset.id = String(e.id);
    layer.dataset.accent = e.accent;

    const art = document.createElement('div');
    art.className = 'se-tst-art';
    const urls = artURLs(e);
    // No art: the theme's own ground (toasts.css), lit in the toast's color.
    const ambient = () => {
      art.replaceChildren();
      art.dataset.ambient = '';
      art.insertAdjacentHTML('beforeend', AMBIENT_HTML);
    };
    // No game art: the avatar as a glow (friends, achievements), else the ambient ground.
    const fallback = () => {
      if (e.icon && e.artKind !== 'ambient') art.replaceChildren(artImg([e.icon], 'se-tst-glow'));
      else ambient();
    };
    if (urls.length) art.appendChild(artImg(urls, 'se-tst-hero', fallback));
    else fallback();
    // A friend: their mini-profile background replaces the glow once it arrives.
    if (e.accountId && !urls.length) profileArt(e.accountId, art);

    layer.append(art);
    layer.insertAdjacentHTML(
      'beforeend',
      '<div class="se-tst-grade"></div><div class="se-tst-ct"></div>' +
        '<button type="button" class="se-tst-sweep" aria-label="Dismiss">' +
        '<svg class="se-tst-ring" viewBox="0 0 30 30" aria-hidden="true">' +
        '<circle class="se-tst-trk" cx="15" cy="15" r="13.5"/><circle class="se-tst-arc" cx="15" cy="15" r="13.5"/></svg>' +
        `<span class="se-tst-lead"></span><span class="se-tst-kdot"></span>${icon('close', 'se-tst-x')}</button>`
    );

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'se-tst-thumb';
    thumb.dataset.id = String(e.id);
    thumb.dataset.accent = e.accent;
    thumb.setAttribute('aria-label', `${e.label}: ${e.title}`);
    const thumbURLs = [...urls, ...(e.icon && e.artKind !== 'ambient' ? [e.icon] : [])];
    if (thumbURLs.length) thumb.appendChild(artImg(thumbURLs, 'se-tst-thumb-img'));

    const v = { layer, thumb, rev: 0, armed: 0, leaving: false };
    views.set(e.id, v);
    stage.appendChild(layer);
    paint(e, v);
    return v;
  }

  // Finished: out of the strip now, off the stage after its crossfade.
  function leave(id, v) {
    if (v.leaving) return;
    v.leaving = true;
    v.thumb.remove();
    unmark(v.layer, 'data-on');
    setTimeout(() => {
      v.layer.remove();
      if (views.get(id) === v) views.delete(id);
    }, PRUNE_MS);
  }

  /*
   * Starts the active toast's countdown: its slot as the duration, minus the time it has
   * already played (a stage that took over mid-toast picks up where the last one was).
   */
  function arm(v, h) {
    // The pointer is already on the tray (it just clicked): CSS holds the countdown, so does the hub.
    if (h.slot && !h.pausedAt && run(() => tray.matches(':hover'))) h.pausedAt = Date.now();
    const left = -elapsed(h);
    for (const el of [v.layer, v.thumb]) {
      el.style.setProperty('--se-tst-d', `${h.slot || 1}ms`);
      el.style.setProperty('--se-tst-delay', `${left}ms`);
      SE.attr(el, 'data-sticky', h.slot ? null : '');
      unmark(el, 'data-on');
    }
    void v.layer.offsetWidth; // restart the animations
    mark(v.layer, 'data-on');
    mark(v.thumb, 'data-on');
    v.armed = h.playRev;
  }

  function render(instant = false) {
    const h = hub();
    const list = h.entries;
    const waiting = list.filter(e => !e.done);
    if (!waiting.length && !h.closing && !h.open) return teardown();
    if (!dock) build();

    for (const e of list) {
      let v = views.get(e.id);
      if (!v && !e.done) {
        v = makeView(e, instant);
        // In play order: before the next waiting entry's thumb.
        const after = waiting.slice(waiting.indexOf(e) + 1).map(x => views.get(x.id)).find(x => x && !x.leaving);
        strip.insertBefore(v.thumb, after?.thumb || pos);
      }
      if (!v || v.leaving) continue;
      if (e.done) leave(e.id, v);
      else if (v.rev !== e.rev) paint(e, v);
    }
    for (const [id, v] of views) if (!list.some(e => e.id === id)) leave(id, v);

    const cur = activeEntry();
    for (const [id, v] of views) {
      if (v.leaving) continue;
      if (cur && id === cur.id) {
        if (v.armed !== h.playRev) arm(v, h);
      } else if (v.armed) {
        v.armed = 0;
        unmark(v.layer, 'data-on');
        unmark(v.thumb, 'data-on');
      }
    }

    // The tray: rises in when it opens, or simply appears when this window takes over.
    const wasOut = tray.hasAttribute('data-out');
    SE.attr(tray, 'data-out', h.closing || null);
    if (!tray.hasAttribute('data-show') || (wasOut && !h.closing)) {
      SE.attr(tray, 'data-instant', instant && h.open ? '' : null);
      unmark(tray, 'data-show');
      void tray.offsetWidth;
      mark(tray, 'data-show');
      h.open = true;
      fit();
    }

    const curView = cur && views.get(cur.id);
    SE.attr(tray, 'data-se-tier', curView?.layer.getAttribute('data-se-tier') || null);
    SE.attr(tray, 'data-accent', cur?.accent || null);
    const i = waiting.indexOf(cur);
    SE.attr(tray, 'data-queue', waiting.length > 1 && !h.closing ? '' : null);
    pos.textContent = i >= 0 && waiting.length > 1 ? `${i + 1} of ${waiting.length}` : '';
    return undefined;
  }

  // This window stops drawing the stage (another took over, or the queue is empty).
  function teardown() {
    if (!dock) return;
    dock.remove();
    dock = tray = stage = strip = pos = null;
    views.clear();
  }

  /* ---------- Placement ---------- */

  /*
   * Steam sizes and places the toast window itself (its corner). The window is moved to the
   * bottom centre of the work area and sized to the tray plus its shadow. The standard
   * window API is tried first, then SteamClient.Window; whichever lands is remembered.
   * If Steam already gives the window the whole work area, the tray is placed by CSS alone.
   */
  /*
   * Ways to move the window, tried in turn until one lands (then remembered).
   * Steam's MoveTo applies the display scale itself (asked for x, it lands at x × 1.5 on a
   * 150% display), and that isn't documented: the first move is measured, and the ratio it
   * shows is divided out from then on. Resizing uses the standard API, which Steam allows.
   */
  const scWindow = () => window.SteamClient?.Window;
  const dpr = () => window.devicePixelRatio || 1;
  const sane = r => Number.isFinite(r) && r > 0.2 && r < 5;

  // The ratio is the same for every toast window, so it's kept in Steam's shared context
  // (this window's opener) once measured; later toasts land in one move.
  const shared = () => run(() => window.opener) || window;
  const getRatio = () => run(() => shared().__seToastMoveRatio) || null;
  const setRatio = r => run(() => { shared().__seToastMoveRatio = r; });

  // Steam moves the window a moment after MoveTo returns: wait until it really has moved
  // (Steam's own small corner adjustments don't count).
  const MOVED = 40;
  const movedFrom = from => Math.abs(window.screenX - from.x) > MOVED || Math.abs(window.screenY - from.y) > MOVED;
  async function settle(from, t, ms = 1200) {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      await sleep(50);
      if (landed(t) || movedFrom(from)) {
        await sleep(80); // let it finish
        return;
      }
    }
  }

  // A new toast window opens mid-screen and Steam then moves it to its corner: wait for that
  // to finish (position unchanged for a few checks), so Steam doesn't undo our move.
  async function steamPlaced(ms = 1500) {
    let last = { x: window.screenX, y: window.screenY };
    let still = 0;
    for (const end = Date.now() + ms; Date.now() < end && still < 4; ) {
      await sleep(60);
      const now = { x: window.screenX, y: window.screenY };
      still = now.x === last.x && now.y === last.y ? still + 1 : 0;
      last = now;
    }
  }

  const MOVERS = [
    {
      name: 'SteamClient MoveTo',
      steam: true,
      async move(t) {
        const W = scWindow();
        const known = getRatio();
        const from = { x: window.screenX, y: window.screenY };
        if (known) {
          W.MoveTo(Math.round(t.x / known.x), Math.round(t.y / known.y), 1);
          return settle(from, t);
        }
        W.MoveTo(t.x, t.y, 1);
        await settle(from, t);
        if (landed(t)) {
          setRatio({ x: 1, y: 1 });
          return undefined;
        }
        if (!movedFrom(from)) return undefined; // didn't move
        const r = { x: window.screenX / t.x, y: window.screenY / t.y };
        if (!sane(r.x) || !sane(r.y)) return undefined;
        const again = { x: window.screenX, y: window.screenY };
        W.MoveTo(Math.round(t.x / r.x), Math.round(t.y / r.y), 1);
        await settle(again, t);
        if (landed(t)) setRatio(r);
        return undefined;
      },
    },
    {
      name: 'window.moveTo',
      move(t) {
        const from = { x: window.screenX, y: window.screenY };
        window.moveTo(t.x, t.y);
        return settle(from, t, 600);
      },
    },
  ];
  let mover = -1;          // index into MOVERS that worked, -1 = untried, -2 = none work
  let target = null;
  let placeWarned = false;
  let attempts = [];       // what each mover did, for why()
  let steamRect = null;    // where and how big Steam made the window
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function applyMove(i, t) {
    await Promise.resolve(run(() => MOVERS[i].move(t))).catch(() => {});
  }

  /*
   * Steam sizes its toast window to its own toast and undoes a standard resize. Its ResizeTo
   * holds, but applies the display scale itself (asked for 544 it gives 816 at 150%): the first
   * resize is measured and that ratio divided out, as for MoveTo, and shared with later toasts.
   */
  const sized = t => Math.abs(window.innerWidth - t.w) <= 4 && Math.abs(window.innerHeight - t.h) <= 4;
  const getSizeRatio = () => run(() => shared().__seToastSizeRatio) || null;
  const setSizeRatio = r => run(() => { shared().__seToastSizeRatio = r; });
  async function resized(from, t, ms = 900) {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      await sleep(50);
      if (sized(t) || Math.abs(window.innerWidth - from.w) > 4 || Math.abs(window.innerHeight - from.h) > 4) {
        await sleep(60);
        return;
      }
    }
  }
  const SIZERS = [
    {
      name: 'SteamClient ResizeTo',
      steam: true,
      async size(t) {
        const W = scWindow();
        const known = getSizeRatio();
        const from = { w: window.innerWidth, h: window.innerHeight };
        if (known) {
          W.ResizeTo(Math.round(t.w / known.x), Math.round(t.h / known.y), false);
          return resized(from, t);
        }
        W.ResizeTo(t.w, t.h, false);
        await resized(from, t);
        if (sized(t)) {
          setSizeRatio({ x: 1, y: 1 });
          return undefined;
        }
        const r = { x: window.innerWidth / t.w, y: window.innerHeight / t.h };
        if (!sane(r.x) || !sane(r.y) || (Math.abs(r.x - 1) < 0.02 && Math.abs(r.y - 1) < 0.02)) return undefined;
        const again = { w: window.innerWidth, h: window.innerHeight };
        W.ResizeTo(Math.round(t.w / r.x), Math.round(t.h / r.y), false);
        await resized(again, t);
        if (sized(t)) setSizeRatio(r);
        return undefined;
      },
    },
    {
      name: 'window.resizeTo',
      size(t) {
        const from = { w: window.innerWidth, h: window.innerHeight };
        window.resizeTo(t.w, t.h);
        return resized(from, t, 600);
      },
    },
  ];
  let sizer = -1;
  const sizeAttempts = [];
  async function ensureSize(t) {
    if (sized(t)) return true;
    const order = sizer >= 0 ? [sizer] : SIZERS.map((_, i) => i);
    for (const i of order) {
      if (SIZERS[i].steam && typeof scWindow()?.ResizeTo !== 'function') continue;
      await Promise.resolve(run(() => SIZERS[i].size(t))).catch(() => {});
      sizeAttempts.push({ sizer: SIZERS[i].name, w: window.innerWidth, h: window.innerHeight });
      if (sized(t)) {
        sizer = i;
        return true;
      }
    }
    return false;
  }

  function wanted() {
    const s = window.screen;
    const w = BOX.trayW + BOX.padX * 2;
    const h = BOX.padTop + BOX.trayH + BOX.padBottom;
    const left = s.availLeft ?? 0;
    const top = s.availTop ?? 0;
    // Every toast window goes to the same spot; only the stage draws anything there.
    const bottom = top + s.availHeight - BOX.lift + BOX.padBottom;
    return { x: Math.round(left + (s.availWidth - w) / 2), y: Math.round(bottom - h), w, h };
  }

  const fullArea = () => window.innerWidth >= screen.availWidth - 8 && window.innerHeight >= screen.availHeight / 2;
  const landed = t => Math.abs(window.screenX - t.x) <= 4 && Math.abs(window.screenY - t.y) <= 4;

  /*
   * Where the tray sits in the window: its own small window → just above the bottom pad;
   * a work-area window → `lift` up. If the window stays smaller than the tray (it couldn't be
   * moved or sized), the tray scales down to fit rather than being cut off.
   */
  function fit() {
    if (!dock) return;
    const full = fullArea();
    const bottom = full ? BOX.lift : mover >= 0 ? BOX.padBottom : 4;
    const scale = Math.min(1, (window.innerWidth - 8) / BOX.trayW, (window.innerHeight - bottom - 4) / BOX.trayH);
    dock.style.setProperty('--se-tst-bottom', `${bottom}px`);
    dock.style.setProperty('--se-tst-scale', String(Math.max(0.5, Math.round(scale * 1000) / 1000)));
  }

  async function place() {
    if (!IN_TOAST_WINDOW) return; // a preview in the main window sits at its bottom centre (CSS)
    try {
      await moveWindow();
    } finally {
      fit();
    }
  }

  async function moveWindow() {
    if (fullArea() || mover === -2) return;
    if (!steamRect) {
      await steamPlaced();
      steamRect = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    }
    target = wanted();
    if (landed(target)) {
      if (mover < 0) mover = 0;
      await ensureSize(target);
      return;
    }
    const order = mover >= 0 ? [mover] : MOVERS.map((_, i) => i);
    for (const i of order) {
      if (MOVERS[i].steam && typeof scWindow()?.MoveTo !== 'function') continue;
      await applyMove(i, target);
      attempts.push({ mover: MOVERS[i].name, x: window.screenX, y: window.screenY, ratio: getRatio() });
      if (landed(target)) {
        mover = i;
        // Then the size; a resize can shift the window, so it's put back if it did.
        if (await ensureSize(target) && !landed(target)) await applyMove(i, target);
        return;
      }
    }
    if (mover >= 0) return;
    mover = -2;
    // Couldn't land it: put the window back as Steam had it (size and spot), so it stays on
    // screen in Steam's corner and the tray scales down to fit.
    const sr = getSizeRatio();
    if (sr && typeof scWindow()?.ResizeTo === 'function') {
      run(() => scWindow().ResizeTo(Math.round(steamRect.w / sr.x), Math.round(steamRect.h / sr.y), false));
    } else {
      run(() => window.resizeTo(steamRect.w, steamRect.h));
    }
    const r = getRatio();
    if (r && typeof scWindow()?.MoveTo === 'function') {
      run(() => scWindow().MoveTo(Math.round(steamRect.x / r.x), Math.round(steamRect.y / r.y), 1));
    } else {
      run(() => window.moveTo(steamRect.x, steamRect.y));
    }
    if (!placeWarned) {
      placeWarned = true;
      console.warn('[Steam Enhanced] Toasts: could not move the toast window; showing it where Steam put it.', { want: target, attempts });
    }
  }

  // Steam may put the window back in its corner when its own toast list changes.
  let replaceTimer = 0;
  let reMoves = 0;
  function restack() {
    if (!tray?.hasAttribute('data-show') || mover < 0 || replaceTimer) return;
    replaceTimer = setTimeout(() => {
      replaceTimer = 0;
      target = wanted();
      Promise.resolve(landed(target) || applyMove(mover, target))
        .then(() => ensureSize(target))
        .then(fit);
      fit();
    }, 60);
  }

  function onWindowResize() {
    fit();
    restack();
  }

  /* ---------- Events (stage window) ---------- */

  function onDockClick(e) {
    const thumb = e.target.closest('.se-tst-thumb');
    if (thumb) return play(Number(thumb.dataset.id));

    const layer = e.target.closest('.se-tst-layer');
    const m = layer && entryById(Number(layer.dataset.id));
    if (!m || m.done) return undefined;

    if (e.target.closest('.se-tst-sweep')) return finish(m, 'close button');

    // Steam's toast may live in another toast window: its elements and handlers still work
    // from here, as long as that window is open.
    const usable = !m.stale && alive(m.win);
    const act = e.target.closest('[data-se-tst-act]');
    if (act) {
      const b = m.buttons[Number(act.dataset.seTstAct)];
      if (usable && b?.el?.isConnected) run(() => b.el.click());
      return finish(m, 'action');
    }

    // The toast itself: Steam's own click (opens the chat, game, store page...), then the
    // theme's friend-chat forwarding, as when the native toast is clicked.
    if (usable && m.click?.isConnected) {
      run(() => m.click.click());
      run(() => (m.win.__seFriendNotificationClicks || window.__seFriendNotificationClicks)?.forward?.(m.click));
    }
    return finish(m, 'click');
  }

  function onDockAnimationEnd(e) {
    if (e.animationName === 'se-tst-fill') {
      const layer = e.target.closest('.se-tst-layer');
      const cur = activeEntry();
      if (cur && layer && Number(layer.dataset.id) === cur.id) finish(cur, 'countdown');
    } else if (e.animationName === 'se-tst-close' && e.target === tray && hub().closing) {
      closed();
    }
  }

  // Hovering the tray pauses the countdown (CSS); the hub keeps the time so a new stage agrees.
  function onTrayHover(e) {
    const h = hub();
    if (!e.target.closest?.('.se-tst-tray')) return;
    if (e.type === 'pointerover' && !h.pausedAt && h.active) {
      h.pausedAt = Date.now();
      hoverSteam(true);
    } else if (e.type === 'pointerout' && h.pausedAt && !tray?.contains(e.relatedTarget)) {
      h.startedAt += Date.now() - h.pausedAt;
      h.pausedAt = 0;
      hoverSteam(false);
    }
  }

  /* ---------- Scanning this window's Steam toasts ---------- */

  let lastScan = null; // for __seToasts.why()

  function scan() {
    if (!document.body) return;
    const live = new Map();
    for (const el of document.body.querySelectorAll('*')) {
      if (dock?.contains(el)) continue;
      const key = keyOf(el);
      if (key !== null && !live.has(key)) live.set(key, el); // document order: the first hit is the toast's root
    }
    if (isStage() && tray?.hasAttribute('data-show')) {
      fit();
      // Steam can move the window back to its corner after it landed: move it again (a few times).
      if (mover >= 0 && target && (!landed(target) || (sizer >= 0 && !sized(target))) && reMoves < 3) {
        reMoves++;
        restack();
      }
    }
    lastScan = { at: new Date().toISOString(), elements: document.body.getElementsByTagName('*').length, toasts: live.size, read: [] };

    const now = Date.now();
    noteUnreadable(live, now);
    for (const [key, src] of live) {
      if (skipped.has(key)) continue;
      const m = byKey.get(key);
      if (m && !m.done) {
        refresh(m, key, src);
        continue;
      }
      if (m) continue; // finished; Steam just hasn't removed it yet
      const info = describe(key, src);
      lastScan.read.push({ kind: info.kind, title: info.title, text: info.text, template: !!templateOf(src) });
      if (info.title) {
        pendingKeys.delete(key);
        add(key, src, info);
      } else if (!pendingKeys.has(key)) {
        pendingKeys.set(key, now);
      } else if (now - pendingKeys.get(key) > ADOPT_TIMEOUT_MS) {
        letGo(key, src, pendingKeys.get(key));
        pendingKeys.delete(key);
        skipped.add(key);
      }
    }

    // Toasts Steam dropped: the one playing finishes on its own timer, queued ones are kept a while.
    for (const [k, m] of byKey) {
      if (m.preview || live.has(k)) continue;
      if (!m.done && !m.stale) {
        m.stale = true;
        m.rev++;
        notify();
      }
      // Finished toasts are forgotten once Steam has removed them too (never replayed before that).
      if (m.done) byKey.delete(k);
    }

    // Steam's own drawing goes out of sight only while every toast it has is on the stage.
    const all = live.size > 0 && [...live.keys()].every(k => byKey.has(k));
    SE.attr(root, ON_ATTR, all || null);
  }

  // Text on screen but no notification found behind it: say so once, with what React holds.
  let unseenSince = 0;
  let probeWarned = false;
  function noteUnreadable(live, now) {
    if (live.size || probeWarned || !document.body.innerText.trim()) {
      unseenSince = 0;
      return;
    }
    if (!unseenSince) unseenSince = now;
    else if (now - unseenSince > ADOPT_TIMEOUT_MS) {
      probeWarned = true;
      console.warn('[Steam Enhanced] Toasts: no notification data found, Steam\'s toasts stay as they are.', JSON.stringify(probe(), null, 1));
    }
  }

  // A grouped toast (more messages from one friend) changes in place: follow it.
  function refresh(m, key, src) {
    if (src !== m.src) {
      unmark(m.src, SRC_ATTR);
      m.src = src;
      mark(src, SRC_ATTR);
    }
    const info = describe(key, src);
    m.buttons = info.buttons;
    m.click = info.click;
    m.dismiss = info.dismiss || m.dismiss;
    if (!info.title || (info.title === m.title && info.text === m.text && info.icon === m.seenIcon)) return;
    Object.assign(m, { title: info.title, text: info.text, seenIcon: info.icon, icon: info.icon || m.icon });
    m.rev++;
    // New content: Steam restarts its timer, and so does the stage if it's playing this one.
    if (info.ms) m.deadline = Date.now() + info.ms;
    const h = hub();
    if (m.id === h.active) {
      h.startedAt = Date.now();
      h.pausedAt = 0;
      h.slot = slotFor(m, h, live().length);
      h.playRev++;
    }
    notify();
  }

  /* ---------- Lifecycle ---------- */

  let watcher = null;
  let poller = null;
  let early = null;

  const busy = () => hub().entries.length > 0 || pendingKeys.size > 0 || unseenSince > 0;
  const step = () => {
    scan();
    sync();
  };

  // Steam closed this toast window: its queued toasts stay queued (without their buttons),
  // and if it was the stage, the next newest window takes over.
  let dismissedByUs = false;
  function onPageHide() {
    const h = hub();
    // Steam closed it on its own timer (the theme hadn't dismissed it): Steam doesn't wait.
    const own = [...byKey.values()].filter(e => !e.preview);
    if (!dismissedByUs && own.length) {
      const first = Math.min(...own.map(e => e.born));
      h.steamCloses.push({ window: window.name, after: Date.now() - first, steamMs: own[0].steamMs, held: own.some(e => held(e.key)) });
      if (h.steamCloses.length > 6) h.steamCloses.shift();
      h.timerHeld = false;
    }
    for (const e of h.entries) if (e.win === window && !e.done) e.stale = true;
    const i = h.wins.indexOf(window);
    if (i >= 0) h.wins.splice(i, 1);
    if (h.stage === window) h.stage = null;
    const others = h.wins.filter(alive);
    // The last toast window: nothing is left to show the queue, so it ends here.
    if (!others.length && IN_TOAST_WINDOW) {
      h.entries.splice(0);
      Object.assign(h, { active: 0, open: false, closing: false, pausedAt: 0 });
    }
    for (const w of others) run(() => w.__seToasts?.wake?.());
  }

  function start() {
    if (!enabled() || !IN_TOAST_WINDOW) return;
    register();
    early = new MutationObserver(onEarlyMutation);
    early.observe(document.body, { childList: true, subtree: true });
    for (const el of document.body.querySelectorAll('*')) holdTimer(keyOf(el));
    watcher = SE.watch(step, { throttle: 60, characterData: true });
    // Steam can fill a toast in without a DOM mutation the observer sees (images, late props),
    // and the stage needs its housekeeping while toasts are queued.
    poller = SE.poll(step, 400, { active: busy });
    addEventListener('resize', onWindowResize);
    addEventListener('pagehide', onPageHide);
    step();
  }

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });

  // Where the window is, where it should be, and what Steam offers to move it (for why()).
  function placement() {
    const own = [...byKey.values()].filter(e => !e.preview);
    const src = own.find(e => !e.done)?.src || own[0]?.src;
    const popup = src && run(() => SE.fromProps(src, FIBER_DEPTH, p => ('registerPopup' in p && p.popup ? p.popup : undefined)));
    const members = o => {
      const out = new Set();
      for (let x = o, i = 0; x && x !== Object.prototype && i < 4; x = Object.getPrototypeOf(x), i++) {
        for (const k of Object.getOwnPropertyNames(x)) out.add(k);
      }
      return [...out].slice(0, 150);
    };
    return {
      mover: MOVERS[mover]?.name || mover,
      target,
      attempts,
      sizer: SIZERS[sizer]?.name || sizer,
      sizeAttempts,
      sizeRatio: getSizeRatio(),
      steamRect,
      ratio: getRatio(),
      got: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight, dpr: window.devicePixelRatio },
      avail: { l: screen.availLeft, t: screen.availTop, w: screen.availWidth, h: screen.availHeight },
      steamClientWindow: Object.keys(window.SteamClient?.Window || {}),
      dock: dock && { bottom: dock.style.getPropertyValue('--se-tst-bottom'), scale: dock.style.getPropertyValue('--se-tst-scale') },
      popup: !popup ? null : popup === window ? 'this window' : { type: typeof popup, members: run(() => members(popup)), holdsThisWindow: run(() => Object.values(popup).includes(window)) },
    };
  }

  // What React has above the window's text: component names and prop names, level by level.
  function probe() {
    const hosts = [...document.body.querySelectorAll('*')]
      .filter(el => !dock?.contains(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim()))
      .slice(0, 4);
    return hosts.map(el => {
      const chain = [];
      for (let f = SE.fiber(el), i = 0; f && i < FIBER_DEPTH + 6; f = f.return, i++) {
        const t = f.type;
        const name = typeof t === 'string' ? t : t?.displayName || t?.name || '?';
        const p = f.memoizedProps && typeof f.memoizedProps === 'object' ? Object.keys(f.memoizedProps).filter(k => k !== 'children') : [];
        chain.push(`${name}(${p.join(',')})`);
      }
      return { text: el.textContent.trim().slice(0, 40), fiber: !!SE.fiber(el), chain };
    });
  }

  // What every toast window is doing, from this one's point of view.
  function stageInfo() {
    const h = hub();
    const name = w => (w === window ? 'this window' : run(() => w.name) || '?');
    return {
      stage: h.stage ? name(h.stage) : null,
      windows: h.wins.map(w => ({ name: name(w), alive: alive(w), ready: !!run(() => w.__seToasts?.ready?.()) })),
      timerHeld: h.timerHeld,
      steamCloses: [...h.steamCloses],
      heldHere: [...byKey.values()].filter(e => !e.preview).map(e => ({ title: e.title, steamMs: e.steamMs, held: held(e.key) })),
      active: h.active,
      slot: h.slot,
      elapsed: h.active ? elapsed(h) : 0,
      open: h.open,
      closing: h.closing,
      queue: h.entries.map(e => ({ id: e.id, title: e.title, done: e.done, stale: e.stale, released: e.released, from: name(e.win), deadlineIn: Number.isFinite(e.deadline) ? e.deadline - Date.now() : null })),
    };
  }

  window.__seToasts = {
    version: '1.95.8',
    preview,
    clearAll,
    kinds: Object.keys(KINDS),
    probe,
    wake,
    ready,
    history: () => history.slice(),
    // Why nothing (or something) is on the stage: the last scan, the shared queue and placement.
    why: () => ({ history: history.slice(), enabled: enabled(), lastScan, stage: stageInfo(), skipped: skipped.size, pending: pendingKeys.size, placement: placement() }),
    dump() {
      return [...byKey.values()].map(m => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        text: m.text,
        appid: m.appid,
        pct: m.pct,
        buttons: m.buttons.map(b => b.label),
        stale: m.stale,
        done: m.done,
        canDismiss: !!m.dismiss,
        dataClass: run(() => noteOf(m.key, m.src)?.data?.getClassName?.()),
        noteKeys: run(() => Object.keys(noteOf(m.key, m.src) || {})),
        dataKeys: run(() => Object.keys(noteOf(m.key, m.src)?.data || {})),
        templateKeys: run(() => Object.keys(templateOf(m.src) || {}).filter(k => k !== 'children')),
        accountId: m.accountId,
      }));
    },
    destroy() {
      watcher?.disconnect();
      poller?.disconnect();
      early?.disconnect();
      clearTimeout(replaceTimer);
      removeEventListener('resize', onWindowResize);
      removeEventListener('pagehide', onPageHide);
      const h = hub();
      const i = h.wins.indexOf(window);
      if (i >= 0) h.wins.splice(i, 1);
      if (h.stage === window) h.stage = null;
      for (const el of document.querySelectorAll(`[${SRC_ATTR}]`)) unmark(el, SRC_ATTR);
      unmark(root, ON_ATTR);
      teardown();
      delete window.__seToasts;
    },
  };
});
