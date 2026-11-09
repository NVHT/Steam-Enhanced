/*
 * In-game overlay controller (SP Overlay windows).
 *
 * Steam's native overlay layout is kept. This script:
 *   - flags <html> with `data-se-ov` while `--se-overlay` is not `off`, so the
 *     restyle in `overlay.css` applies;
 *   - adds a game card to the top-left time stats: the game logo, playtime
 *     (this session / total / last two weeks) and a Back to Game button;
 *   - adds Achievements and Friends sections under the buttons.
 *
 * Steam's clock, date and Exit Game button stay native; Back to Game forwards
 * to Steam's own button. Steam draws Game Overview in a separate popup window,
 * so its DOM is never moved here. The sections read the same Steam data
 * instead (achievements, friends in game, friends who played recently).
 * Everything re-syncs on a slow poll, so React re-renders and token edits are
 * picked up.
 */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seOverlay?.destroy();

  const ATTR = 'data-se-ov';
  const LOGO_ATTR = 'data-se-ov-logo';
  const TICK_MS = 1000;
  const { C } = SE;
  const SEL = Object.freeze({
    timeStats: `.${C.AchievementContent_TopSection} .${C.TimeStats}`,
    logo: `.${C.TopSectionMiddle}.${C.ShowGameLogo} img`,
    backToGame: `.${C.AchievementContent_TopSection} .${C.BackToGameBtn}`,
  });
  const ICON = Object.freeze({
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  });
  const root = document.documentElement;

  const enabled = () =>
    getComputedStyle(root).getPropertyValue('--se-overlay').trim().toLowerCase() !== 'off';

  /* ---------- Steam context ---------- */

  // Steam's stores and SteamClient bindings live in the shared JS context (the
  // window that owns SteamUIStore). This popup's own globals are a fallback:
  // its SteamClient doesn't answer every call.
  const contextGlobal = key => {
    const wins = [...SE.owners()].sort(
      (a, b) => Number(!!SE.run(() => b.SteamUIStore)) - Number(!!SE.run(() => a.SteamUIStore))
    );
    for (const win of wins) {
      const value = SE.run(() => win[key]);
      if (value) return value;
    }
    return null;
  };

  // The first export of a module whose source has every marker that `pick` accepts. Used
  // inside SE.findModule tests, which own the scan and cache its result.
  const exportOf = (src, id, req, markers, pick) => {
    if (!markers.every(marker => src.includes(marker))) return null;
    for (const value of Object.values(SE.run(() => req(id)) || {})) {
      if (SE.run(() => pick(value))) return value;
    }
    return null;
  };

  const titlePid = () => Number(/^SP Overlay:\s*(\d+)/.exec(document.title)?.[1]) || 0;
  let instance = null;

  const findInstance = () => {
    if (instance && SE.run(() => instance.BrowserWindow) === window) return instance;
    instance = null;
    const pid = titlePid();
    for (const win of SE.owners()) {
      const list = SE.run(() => win.SteamUIStore?.WindowStore?.OverlayWindows);
      if (!Array.isArray(list)) continue;
      instance =
        list.find(inst => SE.run(() => inst.BrowserWindow) === window) ||
        (pid && list.find(inst => SE.run(() => inst.params.browserInfo.m_unPID) === pid)) ||
        null;
      if (instance) break;
    }
    return instance;
  };

  const desktopOverlay = () => SE.run(() => findInstance()?.DesktopOverlay) || null;

  const overviewOf = appid => (appid ? SE.run(() => SE.appStore()?.GetAppOverviewByAppID(appid)) || null : null);

  const readStats = () => {
    const ov = desktopOverlay();
    const appid = Number(SE.run(() => ov?.appid)) || 0;
    const app = overviewOf(appid);
    const start = Number(SE.run(() => ov?.time_session_start)) || 0;
    return {
      appid,
      name: SE.run(() => app?.display_name) || '',
      session: start ? Math.max(0, Math.floor((Date.now() / 1000 - start) / 60)) : null,
      total: Number(SE.run(() => app?.minutes_playtime_forever)),
      recent: Number(SE.run(() => app?.minutes_playtime_last_two_weeks)),
    };
  };

  // Minutes under an hour stay in minutes; longer spans read in hours.
  const duration = minutes => {
    if (!Number.isFinite(minutes) || minutes < 0) return { value: '–', unit: '' };
    if (minutes < 60) return { value: String(minutes), unit: 'min' };
    return { value: (minutes / 60).toFixed(1), unit: 'hrs' };
  };

  // Widget ids and visibility values from Steam's DesktopOverlay enums.
  const openWidget = id => SE.run(() => desktopOverlay()?.SetWindowVisibility(id, 1));

  // Steam's own overlay path for a friend's chat: the chat window opens in
  // this overlay (and still goes through the theme's chat routing).
  const openChat = steamid64 => {
    const accountId = SE.run(() => Number(BigInt(steamid64) & 0xffffffffn));
    if (!accountId) return;
    const browserInfo = SE.run(() => findInstance().params.browserInfo);
    const friend = SE.run(() => contextGlobal('g_FriendsUIApp').FriendStore.GetFriend(accountId));
    if (friend && browserInfo) SE.run(() => friend.OpenChatDialog(browserInfo));
  };

  /* ---------- Async data cache ---------- */

  const LOAD_TIMEOUT_MS = 10_000;

  const withTimeout = promise => {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  // One entry per key: keeps the last good value, refreshes after `ttl`, and
  // backs off by `retry` after a failure or a call that never answers.
  // `onSettled` re-renders on arrival.
  const createCache = ({ ttl, retry, load, onSettled }) => {
    const entries = new Map();
    return {
      get(key) {
        let entry = entries.get(key);
        const now = Date.now();
        if (!entry) entries.set(key, (entry = { value: null, due: 0, pending: false }));
        if (!entry.pending && now >= entry.due) {
          entry.pending = true;
          Promise.resolve()
            .then(() => withTimeout(load(key)))
            .then(
              value => {
                entry.value = value;
                entry.due = Date.now() + ttl;
              },
              () => {
                entry.due = Date.now() + retry;
              }
            )
            .finally(() => {
              entry.pending = false;
              onSettled();
            });
        }
        return entry.value;
      },
      expire() {
        for (const entry of entries.values()) entry.due = 0;
      },
      clear() {
        entries.clear();
      },
    };
  };

  /* ---------- Achievements ---------- */

  const ACH_ROWS = 3;
  const EOK = 1;

  // Same maths as Steam's own progress bars: current / max, from zero.
  const progressOf = a => Math.min(1, Math.max(0, Math.min(a.flCurrentProgress, a.flMaxProgress) / a.flMaxProgress));
  const hasProgress = a => a.flMaxProgress > 1 && a.flCurrentProgress > 0;

  const summarizeAchievements = list => {
    const unlocked = list.filter(a => a.bAchieved);
    const inProgress = list
      .filter(a => !a.bAchieved && !a.bHidden && hasProgress(a))
      .sort((a, b) => progressOf(b) - progressOf(a))
      .slice(0, ACH_ROWS)
      .map(a => ({
        id: a.strID,
        name: a.strName,
        icon: a.strImage,
        ratio: progressOf(a),
        current: Math.floor(Math.min(a.flCurrentProgress, a.flMaxProgress)),
        max: Math.floor(a.flMaxProgress),
      }));
    // Nothing in progress: show the latest unlocks instead.
    const rows = inProgress.length
      ? inProgress
      : unlocked
          .filter(a => a.rtUnlocked > 0)
          .sort((a, b) => b.rtUnlocked - a.rtUnlocked)
          .slice(0, ACH_ROWS)
          .map(a => ({ id: a.strID, name: a.strName, icon: a.strImage, unlockedAt: a.rtUnlocked }));
    return { unlocked: unlocked.length, total: list.length, rows };
  };

  // Steam's AchievementStore: the source of Game Overview's achievements. It
  // caches per game and reloads itself when an achievement unlocks.
  const summaries = new WeakMap();

  const resolveAchievementStore = () =>
    SE.findModule('overlay:achievement-store', (src, id, req) =>
      exportOf(src, id, req, ['GetMyAchievementsForApp', 'm_mapMyAchievements'], value => typeof value?.GetMyAchievements === 'function')
    );

  // undefined while loading, null when the game has none.
  const achievementsFromStore = (store, appid) => {
    const entry = SE.run(() => store.GetMyAchievements(appid));
    if (!entry || entry.loading) return undefined;
    if (entry.error || !entry.data) return null;
    let summary = summaries.get(entry.data);
    if (!summary) {
      const { achieved = {}, unachieved = {}, hidden = {} } = entry.data;
      summary = summarizeAchievements([...Object.values(achieved), ...Object.values(unachieved), ...Object.values(hidden)]);
      summaries.set(entry.data, summary);
    }
    return summary;
  };

  // Fallback when the store can't be found: ask Steam directly.
  const loadAchievements = async appid => {
    const apps = contextGlobal('SteamClient')?.Apps;
    if (typeof apps?.GetMyAchievementsForApp !== 'function') throw new Error('unavailable');
    const res = await apps.GetMyAchievementsForApp(String(appid));
    // Games without achievements answer with an error result; show nothing.
    if (res?.result !== EOK || !Array.isArray(res.data?.rgAchievements)) return null;
    return summarizeAchievements(res.data.rgAchievements);
  };

  /* ---------- Friends ---------- */

  const AVATARS_MAX = 24;

  // Player.GetFriendsGameplayInfo, the service call behind Steam's "Friends who
  // have played recently": its service, request class and message class, found by
  // shape in one pass over Steam's webpack modules.
  const GAMEPLAY_PARTS = Object.freeze({
    service: [['Player.GetFriendsGameplayInfo#1'], value => typeof value?.GetFriendsGameplayInfo === 'function'],
    Request: [
      ['CPlayer_GetFriendsGameplayInfo_Request'],
      value => typeof value === 'function' && value.prototype.getClassName() === 'CPlayer_GetFriendsGameplayInfo_Request',
    ],
    Message: [
      ['InitFromPacket', 'SerializeBody'],
      value =>
        typeof value?.Init === 'function' &&
        typeof value.InitFromPacket === 'function' &&
        typeof value.prototype?.Body === 'function' &&
        typeof value.prototype?.Hdr === 'function',
    ],
  });

  const resolveGameplayApi = () => {
    const found = {};
    return SE.findModule('overlay:gameplay-api', (src, id, req) => {
      for (const [part, [markers, pick]] of Object.entries(GAMEPLAY_PARTS)) {
        if (!found[part]) found[part] = exportOf(src, id, req, markers, pick);
      }
      return found.service && found.Request && found.Message ? found : null;
    });
  };

  const loadRecentPlayers = async appid => {
    const api = resolveGameplayApi();
    const transport = SE.run(() => contextGlobal('g_FriendsUIApp').CMInterface.GetServiceTransport());
    if (!api || !transport) throw new Error('unavailable');
    const msg = api.Message.Init(api.Request);
    msg.Body().set_appid(appid);
    const res = await api.service.GetFriendsGameplayInfo(transport, msg);
    if (!res?.BSuccess?.()) throw new Error(`EResult ${SE.run(() => res.GetEResult())}`);
    const body = res.Body().toObject();
    return [...(body.in_game || []), ...(body.played_recently || [])]
      .map(entry => ({ steamid: String(entry.steamid), minutes: Number(entry.minutes_played) || 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  };

  const friendStore = () => contextGlobal('friendStore');

  // Same states as the theme's friend rings: in game, online, offline, plus
  // away / snooze (drawn dashed).
  const toFriend = state => {
    const persona = SE.run(() => state.persona) || {};
    return {
      steamid: String(state.steamid64),
      name: state.display_name || persona.m_strPlayerName || '',
      avatar: persona.avatar_url_medium || '',
      status: persona.is_ingame ? 'ingame' : persona.is_online ? 'online' : 'offline',
      away: !!persona.is_online && !!persona.is_awayOrSnooze,
    };
  };

  const friendsInGame = appid =>
    (SE.run(() => friendStore().GetFriendsInGame(appid)) || [])
      .filter(state => !state.is_blocked)
      .map(toFriend);

  // Friends who played lately but aren't in this game right now (those show
  // under "In game now"), in Steam's order: most recent playtime first.
  const friendsPlayedRecently = (appid, entries) => {
    if (!entries?.length) return [];
    const byId = new Map((SE.run(() => friendStore().allFriends) || []).map(state => [String(state.steamid64), state]));
    const seen = new Set();
    const list = [];
    for (const { steamid } of entries) {
      const state = byId.get(steamid);
      if (!state || state.is_blocked || seen.has(steamid)) continue;
      if (SE.run(() => state.persona.m_unGamePlayedAppID) === appid) continue;
      seen.add(steamid);
      list.push(toFriend(state));
    }
    return list;
  };

  /* ---------- DOM ---------- */

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const buildStat = label => {
    const cell = el('div', 'se-ov-stat');
    const value = el('div', 'se-ov-stat-value');
    value.append(el('b'), el('small'));
    cell.append(el('div', 'se-ov-stat-label', label), value);
    return cell;
  };

  const buildBar = ratio => {
    const bar = el('div', 'se-ov-bar');
    const fill = el('i');
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    bar.append(fill);
    return bar;
  };

  const buildSection = (key, label) => {
    const section = el('section', 'se-ov-sec');
    section.dataset.sec = key;
    section.hidden = true;
    const head = el('div', 'se-ov-sec-head');
    head.append(el('span', 'se-ov-sec-label', label));
    const body = el('div', 'se-ov-sec-body');
    section.append(head, body);
    return { section, head, body, signature: '' };
  };

  const buildOverview = () => {
    const wrap = el('div', 'se-ov-overview');

    const achievements = buildSection('achievements', 'Achievements');
    // The header opens Steam's Achievements widget, like Game Overview does.
    const open = el('button', 'se-ov-sec-link');
    open.type = 'button';
    open.setAttribute('aria-label', 'Open achievements');
    open.innerHTML = ICON.chevron;
    open.prepend(el('span', 'se-ov-sec-meta'));
    open.addEventListener('click', () => openWidget('Achievements'));
    achievements.head.append(open);

    const inGame = buildSection('ingame', 'Friends in-game now');
    const recent = buildSection('recent', 'Played recently');

    // One delegated handler for every avatar.
    wrap.addEventListener('click', event => {
      const avatar = event.target.closest('.se-ov-avatar[data-steamid]');
      if (avatar) openChat(avatar.dataset.steamid);
    });

    wrap.append(achievements.section, inGame.section, recent.section);
    return { wrap, achievements, inGame, recent };
  };

  const buildCard = () => {
    const card = el('div', 'se-ov-card');
    const logo = el('img', 'se-ov-logo');
    logo.alt = '';
    logo.decoding = 'async';
    const name = el('div', 'se-ov-name');
    const stats = el('div', 'se-ov-stats');
    stats.append(buildStat('This session'), buildStat('Total'), buildStat('Last 2 weeks'));
    card.append(logo, name, stats);

    const back = el('button', 'se-ov-back');
    back.type = 'button';
    back.innerHTML = ICON.play;
    back.append(el('span', null, 'Back to game'));
    back.addEventListener('click', () => document.querySelector(SEL.backToGame)?.click());
    return { card, back, logo, name, stats, overview: buildOverview() };
  };

  /* ---------- Logo trim ---------- */

  // Library logos often sit on a padded transparent canvas. Measure the opaque
  // bounds once per URL and crop with `object-view-box`, so the logo hugs the
  // corner. Cross-origin images without CORS can't be read; they stay as-is.
  const ALPHA_MIN = 8;
  const SAMPLE_MAX = 320;
  const trims = new Map();

  const measureTrim = src =>
    new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onerror = () => resolve(null);
      img.onload = () => {
        const scale = Math.min(1, SAMPLE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h })
          .getContext('2d', { willReadFrequently: true });
        const data = SE.run(() => (ctx.drawImage(img, 0, 0, w, h), ctx.getImageData(0, 0, w, h).data));
        if (!data) return resolve(null);
        let top = h, left = w, right = -1, bottom = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] < ALPHA_MIN) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
        if (right < 0) return resolve(null);
        const pct = (n, total) => `${((n / total) * 100).toFixed(2)}%`;
        resolve(`inset(${pct(top, h)} ${pct(w - 1 - right, w)} ${pct(h - 1 - bottom, h)} ${pct(left, w)})`);
      };
      img.src = src;
    });

  const applyTrim = (logo, src) => {
    if (!trims.has(src)) {
      trims.set(src, null);
      measureTrim(src).then(box => {
        trims.set(src, box);
        if (logo.getAttribute('src') === src) logo.style.objectViewBox = box || '';
      });
    }
    logo.style.objectViewBox = trims.get(src) || '';
  };

  /* ---------- Render ---------- */

  let ui = null;
  let renderQueued = false;

  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      sync();
    });
  };

  const achievementsCache = createCache({ ttl: 60_000, retry: 15_000, load: loadAchievements, onSettled: scheduleRender });
  const recentCache = createCache({ ttl: 10 * 60_000, retry: 60_000, load: loadRecentPlayers, onSettled: scheduleRender });

  const setStat = (cell, minutes) => {
    const { value, unit } = duration(minutes);
    const [b, small] = cell.querySelector('.se-ov-stat-value').children;
    if (b.textContent !== value) b.textContent = value;
    if (small.textContent !== unit) small.textContent = unit;
  };

  // Rebuild a section's body only when what it shows has changed, so the
  // 1s poll never touches the DOM in the steady state.
  const commit = (part, visible, signature, fill) => {
    part.section.hidden = !visible;
    if (!visible || part.signature === signature) return;
    part.signature = signature;
    part.body.replaceChildren();
    fill(part.body);
  };

  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  const renderAchievements = (part, appid) => {
    const store = appid ? resolveAchievementStore() : null;
    const data = !appid ? null : store ? achievementsFromStore(store, appid) : achievementsCache.get(appid);
    const visible = !!data && data.total > 0;
    const signature = visible ? JSON.stringify(data) : '';
    commit(part, visible, signature, body => {
      part.head.querySelector('.se-ov-sec-meta').textContent = `${data.unlocked} / ${data.total}`;
      const list = el('ul', 'se-ov-ach-list');
      for (const row of data.rows) {
        const item = el('li', 'se-ov-ach');
        const icon = el('img', 'se-ov-ach-icon');
        icon.alt = '';
        icon.loading = 'lazy';
        icon.src = row.icon;
        // Name and count share a line, so every bar spans the same width.
        const line = el('div', 'se-ov-ach-line');
        line.append(
          el('span', 'se-ov-ach-name', row.name),
          el(
            'span',
            'se-ov-ach-count',
            row.unlockedAt
              ? dateFormat.format(row.unlockedAt * 1000)
              : `${row.current.toLocaleString()}/${row.max.toLocaleString()}`
          )
        );
        const text = el('div', 'se-ov-ach-text');
        text.append(line);
        if (!row.unlockedAt) text.append(buildBar(row.ratio));
        item.append(icon, text);
        list.append(item);
      }
      body.append(buildBar(data.unlocked / data.total));
      if (data.rows.length) body.append(list);
    });
  };

  const renderAvatars = (part, friends) => {
    const visible = friends.length > 0;
    const shown = friends.length > AVATARS_MAX ? friends.slice(0, AVATARS_MAX - 1) : friends;
    const signature = visible ? JSON.stringify([shown, friends.length]) : '';
    commit(part, visible, signature, body => {
      const row = el('div', 'se-ov-avatars');
      for (const friend of shown) {
        const button = el('button', 'se-ov-avatar');
        button.type = 'button';
        button.dataset.steamid = friend.steamid;
        button.dataset.status = friend.status;
        if (friend.away) button.dataset.away = '';
        button.title = friend.name;
        button.setAttribute('aria-label', friend.name);
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        if (friend.avatar) img.src = friend.avatar;
        button.append(img);
        row.append(button);
      }
      if (shown.length < friends.length) {
        row.append(el('span', 'se-ov-avatar se-ov-avatar-more', `+${friends.length - shown.length}`));
      }
      body.append(row);
    });
  };

  const renderOverview = (overview, appid) => {
    renderAchievements(overview.achievements, appid);
    renderAvatars(overview.inGame, appid ? friendsInGame(appid) : []);
    renderAvatars(overview.recent, appid ? friendsPlayedRecently(appid, recentCache.get(appid)) : []);
  };

  const render = () => {
    const host = document.querySelector(SEL.timeStats);
    if (!host) return;
    ui ||= buildCard();
    // React may replace the host; re-attach on the next tick when it does.
    if (ui.card.parentNode !== host) host.prepend(ui.card);
    if (ui.back.parentNode !== host) host.append(ui.back);
    if (ui.overview.wrap.parentNode !== host) host.append(ui.overview.wrap);

    const stats = readStats();
    const nativeLogo = document.querySelector(SEL.logo);
    const src = nativeLogo?.currentSrc || nativeLogo?.src || '';
    if (src && ui.logo.getAttribute('src') !== src) {
      ui.logo.src = src;
      applyTrim(ui.logo, src);
    }
    SE.attr(ui.logo, 'hidden', src ? null : '');
    SE.attr(ui.name, 'hidden', src || !stats.name ? '' : null);
    if (ui.name.textContent !== stats.name) ui.name.textContent = stats.name;
    // Only hide Steam's centred logo once ours has taken its place.
    SE.attr(root, LOGO_ATTR, src ? '' : null);

    const [session, total, recent] = ui.stats.children;
    setStat(session, stats.session);
    setStat(total, stats.total);
    setStat(recent, stats.recent);

    renderOverview(ui.overview, stats.appid);
  };

  const teardown = () => {
    ui?.card.remove();
    ui?.back.remove();
    ui?.overview.wrap.remove();
    SE.attr(root, LOGO_ATTR, null);
  };

  function sync() {
    const on = enabled();
    SE.attr(root, ATTR, on ? '' : null);
    if (on) SE.run(render);
    else teardown();
  }

  // Unlocks made while playing should show the next time the overlay opens.
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    achievementsCache.expire();
    scheduleRender();
  };
  document.addEventListener('visibilitychange', onVisibility);

  sync();
  const loop = SE.poll(sync, TICK_MS);

  window.__seOverlay = {
    destroy() {
      loop.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      teardown();
      achievementsCache.clear();
      recentCache.clear();
      ui = null;
      instance = null;
      SE.attr(root, ATTR, null);
    },
  };
});
