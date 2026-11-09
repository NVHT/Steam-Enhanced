/*
 * Stage toasts: Steam's desktop notification toasts as a miniature Library Home stage at the
 * bottom centre of the screen. Runs in Steam's `notificationtoasts_` window.
 *
 * Steam keeps rendering its own toasts. Each one is read from its React props (kind, app,
 * ids) and its rendered output (text, images, buttons), then played on the stage: the game's
 * hero art under the Home stage grade, a sweep countdown, and a strip for the ones waiting.
 * One toast plays at a time. Clicks go to Steam's own toast and buttons, so what they do,
 * and the language they're in, stay Steam's.
 *
 * Fail-safe: a Steam toast is hidden only once its Stage toast exists; a toast this script
 * can't read stays as Steam drew it. `--se-toasts: off` (shared/tokens.css) turns it all off.
 * Debug, in the toast window's console: `__seToasts.dump()` lists what was read;
 * `__seToasts.probe()` shows the React components and props above the window's text.
 */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seToasts?.destroy();

  const { run, esc, mark, unmark, rarity } = SE;
  const root = document.documentElement;

  /* ---------- Config ---------- */

  const SRC_ATTR = 'data-se-tst-src';   // on Steam toasts that have a Stage toast
  const ON_ATTR = 'data-se-tst-on';     // on <html> while every Steam toast is adopted
  const ADOPT_TIMEOUT_MS = 2000;        // a toast still unreadable after this stays native
  const STALE_MAX_MS = 30000;           // a queued toast Steam has dropped is kept this long
  const PRUNE_MS = 650;                 // finished layers leave after their crossfade
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /*
   * Each toast is its own window (Steam stacks them by toastIndex). Each window is sized to its
   * tray plus room for the shadow, centred, and stacked up from `lift` above the work area.
   */
  const BOX = Object.freeze({ trayW: 480, trayH: 136, padX: 32, padTop: 32, padBottom: 8, lift: 24, gap: 10 });

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
    battery: { label: 'Battery low', accent: 'ach', ms: 6000, art: 'none', icon: 'battery' },
    error: { label: 'Needs attention', accent: 'err', ms: 0, pri: true, art: 'app', icon: 'alert' },
    overlay: { label: 'Steam overlay', accent: 'sys', ms: 4000, art: 'app', icon: 'screen' },
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

  const ICONS = Object.freeze({
    chat: '<path d="M4 4h16v12H9l-5 4z" fill="currentColor"/>',
    dot: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
    pad: '<path d="M6 8h12a3 3 0 0 1 3 3v4a2 2 0 0 1-3.5 1.3L15 14H9l-2.5 2.3A2 2 0 0 1 3 15v-4a3 3 0 0 1 3-3z" fill="currentColor"/>',
    plus: '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5M19 8v6M16 11h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" fill="currentColor"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    cup: '<path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H4a3.5 3.5 0 0 0 3.5 5M17 5h3a3.5 3.5 0 0 1-3.5 5M10.5 15h3v3h-3zM7.5 19h9v2h-9z" fill="currentColor"/>',
    check: '<path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    rec: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    tag: '<path d="M3 12V4h8l9 9-8 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/>',
    gift: '<path d="M3 8h18v4H3zM5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    trade: '<path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    home: '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    battery: '<rect x="3" y="8" width="16" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 11v2M6 11v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    alert: '<path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    screen: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    steam: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
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
   * It may be an object or a plain id, so models are kept in a Map (not a WeakMap) by that value.
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
    const text = [...new Set([...lines.values()].map(clean).filter(Boolean))];

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

  function describe(key, src) {
    const note = noteOf(key, src);
    const data = note?.data;
    const tpl = templateOf(src);
    const stack = stackOf(src);
    const seen = read(src);
    const kind = kindOf(note, tpl, `${seen.title} ${seen.text}`);
    const k = KINDS[kind];
    const appid =
      Number(field(data, 'appid', 'game_id', 'gameid', 'app_id') || field(note, 'appid')) ||
      Number(run(() => SE.fromProps(src, FIBER_DEPTH, p => (Number(p.appid) > 0 ? Number(p.appid) : undefined)))) ||
      0;
    const dismiss = [tpl?.onDismiss, stack?.onDismiss].find(f => typeof f === 'function') || null;
    const pct = Number(field(data, 'global_achieved_pct', 'global_achieved_percent', 'achieved_pct', 'flAchieved'));
    return {
      kind,
      label: k.label,
      accent: k.accent,
      // Steam's own display time for this toast, so ours ends with it; sticky kinds stay sticky.
      ms: k.ms && Number(field(key, 'nToastDurationMS')) > 0 ? Number(field(key, 'nToastDurationMS')) : k.ms,
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
      pct: Number.isFinite(pct) ? pct : NaN,
    };
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
    paint(m);
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

  const artURLs = m => {
    if (m.artKind === 'image' && m.shot) return [m.shot];
    if (m.artKind !== 'none' && m.appid) return SE.heroURLs(m.appid, contextGlobal('appStore'));
    return [];
  };

  function sparkles(rank) {
    return `<span class="se-tst-fx" aria-hidden="true">${'<i class="se-tst-spark"></i>'.repeat(rank)}</span>`;
  }

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

  // (Re)draws a layer's content in place; its art and countdown are left running.
  function paint(m) {
    if (!m.layer) return;
    const tier = m.kind === 'ach' && !m.mastered ? rarity.tierOf(m.pct) : null;
    const tierId = m.mastered ? 'legendary' : tier?.id;
    SE.attr(m.layer, 'data-se-tier', tierId || null);
    SE.attr(m.thumb, 'data-se-tier', tierId || null);
    const label = m.kind === 'ach' && m.mastered ? 'Game mastered' : m.label;
    m.layer.querySelector('.se-tst-ct').innerHTML =
      `<div class="se-tst-tile">${tileHTML(m, tier)}</div>` +
      `<div class="se-tst-tx"><div class="se-tst-ey">${esc(label)}</div>` +
      `<div class="se-tst-tt">${esc(m.title)}</div>${detailHTML(m)}</div>` +
      `<div class="se-tst-rt">${rightHTML(m, tier)}</div>`;
    if (m === active()) syncTray();
  }

  function makeLayer(m) {
    const layer = document.createElement('div');
    layer.className = 'se-tst-layer';
    layer.dataset.id = String(m.id);
    layer.dataset.accent = m.accent;
    if (!m.ms) layer.dataset.sticky = '';
    layer.style.setProperty('--se-tst-d', `${m.ms || 1}ms`);

    const art = document.createElement('div');
    art.className = 'se-tst-art';
    const urls = artURLs(m);
    // No art at all: the avatar as a glow, else the plain ground in the toast's color.
    const fallback = () => {
      art.replaceChildren();
      if (m.icon) art.appendChild(artImg([m.icon], 'se-tst-glow'));
      else art.dataset.plain = '';
    };
    if (urls.length) art.appendChild(artImg(urls, 'se-tst-hero', fallback));
    else if (m.artKind === 'avatar' && m.icon) art.appendChild(artImg([m.icon], 'se-tst-glow'));
    else art.dataset.plain = '';

    layer.append(art);
    layer.insertAdjacentHTML(
      'beforeend',
      '<div class="se-tst-grade"></div><div class="se-tst-ct"></div>' +
        '<button type="button" class="se-tst-sweep" aria-label="Dismiss">' +
        '<svg class="se-tst-ring" viewBox="0 0 30 30" aria-hidden="true">' +
        '<circle class="se-tst-trk" cx="15" cy="15" r="13.5"/><circle class="se-tst-arc" cx="15" cy="15" r="13.5"/></svg>' +
        `<span class="se-tst-lead"></span><span class="se-tst-kdot"></span>${icon('close', 'se-tst-x')}</button>`
    );
    m.layer = layer;

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'se-tst-thumb';
    thumb.dataset.id = String(m.id);
    thumb.dataset.accent = m.accent;
    thumb.style.setProperty('--se-tst-d', `${m.ms || 1}ms`);
    if (!m.ms) thumb.dataset.sticky = '';
    thumb.setAttribute('aria-label', `${m.label}: ${m.title}`);
    const thumbURLs = urls.length ? urls : m.icon ? [m.icon] : [];
    if (thumbURLs.length) thumb.appendChild(artImg(thumbURLs, 'se-tst-thumb-img'));
    m.thumb = thumb;

    stage.appendChild(layer);
    paint(m);
  }

  /* ---------- Queue ---------- */

  let seq = 0;
  let activeId = 0;
  let closing = false;
  const models = [];                  // in play order
  const byKey = new Map();           // Steam notification (object or id) → model
  const pendingKeys = new Map();      // unreadable so far → first seen
  const skipped = new Set();         // gave up: left native

  const active = () => models.find(m => m.id === activeId) || null;
  const pending = () => models.filter(m => !m.done);

  function add(key, src, info) {
    // `seenIcon` is what Steam drew; `icon` may be filled in later (an achievement's own image).
    const m = { id: ++seq, key, src, born: Date.now(), done: false, stale: false, layer: null, thumb: null, ...info, seenIcon: info.icon };
    byKey.set(key, m);
    mark(src, SRC_ATTR);

    // Priority toasts play next; the rest join the end.
    const at = m.pri && activeId ? models.findIndex(x => x.id === activeId) + 1 : models.length;
    models.splice(at, 0, m);

    if (!dock) build();
    makeLayer(m);
    const next = pending()[pending().indexOf(m) + 1];
    strip.insertBefore(m.thumb, next?.thumb || pos);

    if (!activeId || closing) {
      closing = false;
      activeId = m.id;
      open();
    }
    syncTray();
    enrichAchievement(m);
  }

  function play(id) {
    const m = models.find(x => x.id === id && !x.done);
    if (!m) return;
    activeId = id;
    syncTray();
  }

  const history = []; // the last toasts finished, and why (for dump())
  function finish(m, why = '') {
    if (!m || m.done) return;
    m.done = true;
    history.push({ title: m.title, kind: m.kind, ms: m.ms, why, after: Date.now() - m.born });
    if (history.length > 6) history.shift();
    m.thumb?.remove();
    if (m.id === activeId) {
      const next = pending()[0];
      if (next) activeId = next.id;
      else close();
    }
    syncTray();
    setTimeout(prune, PRUNE_MS);
  }

  // Steam closes its toast (and so its window) once ours has finished, keeping both in step.
  const dismissSteam = m => {
    if (m.dismiss && m.src?.isConnected) run(m.dismiss);
  };

  function prune() {
    for (let i = models.length - 1; i >= 0; i--) {
      const m = models[i];
      if (m.done && m.id !== activeId) {
        m.layer?.remove();
        unmark(m.src, SRC_ATTR);
        dismissSteam(m);
        models.splice(i, 1);
      }
    }
  }

  function syncTray() {
    if (!tray) return;
    const cur = active();
    for (const m of models) {
      const on = m === cur;
      if (m.layer && on !== m.layer.hasAttribute('data-on')) SE.attr(m.layer, 'data-on', on || null);
      if (m.thumb) SE.attr(m.thumb, 'data-on', on || null);
    }
    SE.attr(tray, 'data-se-tier', cur?.layer?.getAttribute('data-se-tier') || null);
    SE.attr(tray, 'data-accent', cur?.accent || null);
    const list = pending();
    const i = list.indexOf(cur);
    SE.attr(tray, 'data-queue', list.length > 1 && !closing ? '' : null);
    pos.textContent = i >= 0 ? `${i + 1} of ${list.length}` : '';
  }

  /* ---------- Open / close and placement ---------- */

  function open() {
    unmark(tray, 'data-out');
    // Hidden until the window sits at the bottom centre, so it never flashes in Steam's corner.
    mark(dock, 'data-placing');
    place().finally(() => {
      unmark(dock, 'data-placing');
      // Restart the rise and letterbox each time the tray opens.
      unmark(tray, 'data-show');
      void tray.offsetWidth;
      mark(tray, 'data-show');
    });
  }

  function close() {
    closing = true;
    mark(tray, 'data-out');
  }

  function closed(steamToo = true) {
    for (const m of models) {
      m.layer?.remove();
      m.thumb?.remove();
      unmark(m.src, SRC_ATTR);
      if (steamToo) dismissSteam(m);
    }
    models.length = 0;
    activeId = 0;
    closing = false;
    unmark(tray, 'data-show');
    unmark(tray, 'data-out');
    syncTray();
  }

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
    run(() => window.resizeTo(t.w, t.h));
    await Promise.resolve(run(() => MOVERS[i].move(t))).catch(() => {});
  }

  function wanted() {
    const s = window.screen;
    const w = BOX.trayW + BOX.padX * 2;
    const h = BOX.padTop + BOX.trayH + BOX.padBottom;
    const left = s.availLeft ?? 0;
    const top = s.availTop ?? 0;
    const stack = active()?.stackIndex || 0;
    const bottom = top + s.availHeight - BOX.lift + BOX.padBottom - stack * (BOX.trayH + BOX.gap);
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
      return;
    }
    const order = mover >= 0 ? [mover] : MOVERS.map((_, i) => i);
    for (const i of order) {
      if (MOVERS[i].steam && typeof scWindow()?.MoveTo !== 'function') continue;
      await applyMove(i, target);
      attempts.push({ mover: MOVERS[i].name, x: window.screenX, y: window.screenY, ratio: getRatio() });
      if (landed(target)) {
        mover = i;
        return;
      }
    }
    if (mover >= 0) return;
    mover = -2;
    // Couldn't land it: put the window back as Steam had it (size and spot), so it stays on
    // screen in Steam's corner and the tray scales down to fit.
    run(() => window.resizeTo(steamRect.w, steamRect.h));
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
  // A toast below closing moves this one down a slot (its toastIndex changes).
  let replaceTimer = 0;
  let reMoves = 0;
  function restack() {
    if (!tray?.hasAttribute('data-show') || mover < 0 || replaceTimer) return;
    replaceTimer = setTimeout(() => {
      replaceTimer = 0;
      target = wanted();
      if (!landed(target)) applyMove(mover, target).then(fit);
      fit();
    }, 60);
  }

  function onWindowResize() {
    fit();
    restack();
  }

  /* ---------- Events ---------- */

  function onDockClick(e) {
    const thumb = e.target.closest('.se-tst-thumb');
    if (thumb) return play(Number(thumb.dataset.id));

    const layer = e.target.closest('.se-tst-layer');
    const m = layer && models.find(x => x.id === Number(layer.dataset.id));
    if (!m) return;

    if (e.target.closest('.se-tst-sweep')) return finish(m, 'close button');

    const act = e.target.closest('[data-se-tst-act]');
    if (act) {
      const b = m.buttons[Number(act.dataset.seTstAct)];
      if (b?.el?.isConnected) run(() => b.el.click());
      return finish(m, 'action');
    }

    // The toast itself: Steam's own click (opens the chat, game, store page...), then the
    // theme's friend-chat forwarding, as when the native toast is clicked.
    if (!m.stale && m.click?.isConnected) {
      run(() => m.click.click());
      run(() => window.__seFriendNotificationClicks?.forward?.(m.click));
    }
    finish(m, 'click');
  }

  function onDockAnimationEnd(e) {
    if (e.animationName === 'se-tst-fill') {
      const layer = e.target.closest('.se-tst-layer');
      const m = layer && models.find(x => x.id === Number(layer.dataset.id));
      if (m && m.id === activeId) finish(m, 'countdown');
    } else if (e.animationName === 'se-tst-close' && e.target === tray && closing) {
      closed();
    }
  }

  /* ---------- Scanning Steam's toasts ---------- */

  let lastScan = null; // for __seToasts.why()

  function scan() {
    if (!document.body) return;
    const live = new Map();
    for (const el of document.body.querySelectorAll('*')) {
      if (dock?.contains(el)) continue;
      const key = keyOf(el);
      if (key !== null && !live.has(key)) live.set(key, el); // document order: the first hit is the toast's root
    }
    if (tray?.hasAttribute('data-show')) {
      fit();
      // Steam can move the window back to its corner after it landed: move it again (a few times).
      if (mover >= 0 && target && !landed(target) && reMoves < 3) {
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
        pendingKeys.delete(key);
        skipped.add(key);
      }
    }

    // Toasts Steam dropped: the one playing finishes on its own timer, queued ones are kept a while.
    for (const m of models) {
      if (m.done || live.has(m.key)) continue;
      if (!m.stale) {
        m.stale = true;
        if (m.layer) for (const b of m.layer.querySelectorAll('[data-se-tst-act]')) b.disabled = true;
      }
      if (m.id !== activeId && now - m.born > STALE_MAX_MS) finish(m, 'dropped by Steam');
    }

    // Finished toasts are forgotten once Steam has removed them too (never replayed before that).
    for (const [k, m] of byKey) if (m.done && !live.has(k)) byKey.delete(k);

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
    if (info.stackIndex !== m.stackIndex) {
      m.stackIndex = info.stackIndex;
      if (m.id === activeId) restack();
    }
    if (!info.title || (info.title === m.title && info.text === m.text && info.icon === m.seenIcon)) return;
    Object.assign(m, { title: info.title, text: info.text, seenIcon: info.icon, icon: info.icon || m.icon });
    paint(m);
    if (m.id === activeId && m.layer) {
      // New content: the countdown starts over, as Steam's does.
      unmark(m.layer, 'data-on');
      void m.layer.offsetWidth;
      mark(m.layer, 'data-on');
    }
  }

  /* ---------- Lifecycle ---------- */

  let watcher = null;
  let poller = null;

  function start() {
    if (!enabled()) return;
    watcher = SE.watch(scan, { throttle: 60, characterData: true });
    // Steam can fill a toast in without a DOM mutation the observer sees (images, late props).
    poller = SE.poll(scan, 400, { active: () => models.length > 0 || pendingKeys.size > 0 || unseenSince > 0 });
    addEventListener('resize', onWindowResize);
    scan();
  }

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });

  // Where the window is, where it should be, and what Steam offers to move it (for why()).
  function placement() {
    const src = active()?.src || models[0]?.src;
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

  window.__seToasts = {
    version: '1.93.8',
    probe,
    // Why nothing (or something) is on the stage: the last scan, and what each toast read as.
    history: () => history.slice(),
    why: () => ({ history: history.slice(), enabled: enabled(), lastScan, models: models.length, skipped: skipped.size, pending: pendingKeys.size, placement: placement() }),
    dump() {
      return models.map(m => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        text: m.text,
        appid: m.appid,
        pct: m.pct,
        buttons: m.buttons.map(b => b.label),
        stale: m.stale,
        done: m.done,
        stackIndex: m.stackIndex,
        canDismiss: !!m.dismiss,
        dataClass: run(() => noteOf(m.key, m.src)?.data?.getClassName?.()),
        noteKeys: run(() => Object.keys(noteOf(m.key, m.src) || {})),
        dataKeys: run(() => Object.keys(noteOf(m.key, m.src)?.data || {})),
        templateKeys: run(() => Object.keys(templateOf(m.src) || {}).filter(k => k !== 'children')),
      }));
    },
    destroy() {
      watcher?.disconnect();
      poller?.disconnect();
      clearTimeout(replaceTimer);
      removeEventListener('resize', onWindowResize);
      for (const el of document.querySelectorAll(`[${SRC_ATTR}]`)) unmark(el, SRC_ATTR);
      unmark(root, ON_ATTR);
      dock?.remove();
      delete window.__seToasts;
    },
  };
});
