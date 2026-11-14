/*
 * Toasts: reading Steam's toasts: React props, text, buttons, achievements.
 *
 * Part of client/toasts/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedToastsParts;
  if (!ns) return;
  const { rarity, run } = SE;
  const { CLASS_RULES, KINDS, TYPE_KINDS, field } = ns;

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

  const steamClient = () =>
    SE.global('SteamClient', sc => typeof sc?.Apps?.GetMyAchievementsForApp === 'function') || window.SteamClient || null;

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
    const apps = run(() => SE.appStore()?.allApps) || [];
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

  const inDock = SE.inside('#se-tst');

  // Newly drawn toasts, seen at once (not throttled) so the duration changes before Steam reads it.
  function onEarlyMutation(records) {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || inDock(n)) continue;
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
    for (const e of ns.hub().entries) {
      const el = e.click || e.src;
      if (e.done || !ns.alive(e.win) || !el?.isConnected) continue;
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
    ns.notify();
  }

  Object.assign(ns, { FIBER_DEPTH, GUARD_MS, describe, enrichAchievement, held, holdTimer, hoverSteam, inDock, keyOf, letGo, noteOf, onEarlyMutation, templateOf });
});
