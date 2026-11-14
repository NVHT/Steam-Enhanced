/*
 * In-game overlay controller (SP Overlay windows).
 *
 * Steam's native overlay layout is kept; its toolbars, clock and top-right
 * Back to Game are hidden (overlay.css). This script fills the top-left time
 * stats column:
 *   - a header: the game logo over two rows, beside Time · This session and
 *     Total · Last 2 weeks; clicking the time starts a timer (it then shows
 *     the elapsed time), in place of Steam's Clock/Timer;
 *   - a rail of duotone view tabs with Back to game
 *     and Exit game at its foot, both forwarding to Steam's own buttons;
 *   - a drawer beside it with the open view: Overview (Achievements, Friends,
 *     Your Screenshots, Guides, Recent News), Achievements (the full list with
 *     rarity tiers), Friends, Remote Play Together, Notes, Controller, Browser
 *     and Settings. Steam's widget windows open centred at a fixed size.
 *
 * Steam draws Game Overview in a separate popup window,
 * so its DOM is never moved here. The sections read the same Steam data
 * instead. Every section hides itself when its data is missing or Steam does
 * not answer; `__seOverlay.debug()` in the overlay's DevTools says why.
 * Everything re-syncs on a slow poll, so React re-renders and token edits are
 * picked up. Data also loads in the background while the overlay is hidden,
 * so the column is filled the moment it opens.
 */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seOverlay?.destroy();

  const ATTR = 'data-se-ov';
  const LOGO_ATTR = 'data-se-ov-logo';
  const SCROLL_ATTR = 'data-se-ov-scroll';
  const TICK_MS = 1000;
  const { C } = SE;
  const SEL = Object.freeze({
    timeStats: `.${C.AchievementContent_TopSection} .${C.TimeStats}`,
    logo: `.${C.TopSectionMiddle}.${C.ShowGameLogo} img`,
    backToGame: `.${C.AchievementContent_TopSection} .${C.BackToGameBtn}`,
    // Steam's Exit game button in the time stats column (hidden; the rail's clicks it).
    exitGame: `.${C.AchievementContent_TopSection} .${C.TimeStats} .BoygotvcKo4DC4dSix8G3`,
    // ToolbarContainer > ToolbarButton (module 13, not in the core class map).
    toolbarButton: '._3OzkVrQFFPv0aV41N4MrHV ._3ZLaTxSHxeGcoKlIy_-Z0L',
  });
  // ToolbarButton's "widget open" state.
  const TOOLBAR_ACTIVE = '_1BXjK5v8XI_SEhGola5ftn';
  const ICON = Object.freeze({
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.6 1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5z"/></svg>',
    open: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    power: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.6 4.4a5 5 0 1 0 6.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  });
  // Rail icons: one duotone set on a 24px grid. The back shape is the second
  // tone (TONE), the detail on top full strength (FILL); both follow `color`.
  const TONE = 'fill="currentColor" fill-opacity=".38"';
  const FILL = 'fill="currentColor"';
  const icon24 = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const VIEW_ICON = Object.freeze({
    overview: icon24(`<rect x="3" y="3" width="8" height="10" rx="2.2" ${FILL}/><rect x="13" y="3" width="8" height="6" rx="2.2" ${TONE}/><rect x="13" y="11" width="8" height="10" rx="2.2" ${FILL}/><rect x="3" y="15" width="8" height="6" rx="2.2" ${TONE}/>`),
    achievements: icon24(`<path d="M7.2 2.5h3.3l2.3 6.2H9.5zM16.8 2.5h-3.3l-2.3 6.2h3.3z" ${TONE}/><circle cx="12" cy="15.3" r="6.2" ${TONE}/><path d="m12 11.3 1.25 2.55 2.8.4-2.03 1.98.48 2.79L12 17.7l-2.5 1.32.48-2.79-2.03-1.98 2.8-.4z" ${FILL}/>`),
    friends: icon24(`<circle cx="16.6" cy="8" r="3.1" ${TONE}/><path d="M13 14.2a5.6 5.6 0 0 1 9 4.4v.9a1 1 0 0 1-1 1h-6.4z" ${TONE}/><circle cx="9" cy="7.6" r="3.9" ${FILL}/><path d="M1.8 19.4a7.2 7.2 0 0 1 14.4 0v.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" ${FILL}/>`),
    remote: icon24(`<rect x="2" y="3" width="20" height="13.5" rx="2.6" ${TONE}/><rect x="7.5" y="19" width="9" height="2.2" rx="1.1" ${FILL}/><rect x="11" y="16" width="2" height="3.5" ${FILL}/><path d="M8.6 10.6a4.8 4.8 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.2 8.2a8.2 8.2 0 0 1 11.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".6"/><circle cx="12" cy="12.9" r="1.4" ${FILL}/>`),
    notes: icon24(`<rect x="4" y="2" width="16" height="20" rx="2.8" ${TONE}/><rect x="7.5" y="7" width="9" height="1.9" rx=".95" ${FILL}/><rect x="7.5" y="11" width="9" height="1.9" rx=".95" ${FILL}/><rect x="7.5" y="15" width="5.5" height="1.9" rx=".95" ${FILL}/>`),
    controller: icon24(`<path d="M7.2 6h9.6a5 5 0 0 1 4.9 6l-1.1 5.3a2.7 2.7 0 0 1-4.6 1.3L13.8 16.5h-3.6l-2.2 2.1a2.7 2.7 0 0 1-4.6-1.3L2.3 12a5 5 0 0 1 4.9-6z" ${TONE}/><path d="M7 8.9h1.8v1.9h1.9v1.8H8.8v1.9H7v-1.9H5.1v-1.8H7z" ${FILL}/><circle cx="16" cy="10.4" r="1.35" ${FILL}/><circle cx="18.1" cy="12.8" r="1.35" ${FILL}/>`),
    browser: icon24(`<circle cx="12" cy="12" r="10" ${TONE}/><path d="M2.6 12h18.8M12 2.3c2.7 2.7 4 6 4 9.7s-1.3 7-4 9.7c-2.7-2.7-4-6-4-9.7s1.3-7 4-9.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
    settings: icon24(`<path d="M9.4 4.6L10 1.9h4l.6 2.7.8.3 2.3-1.5 2.9 2.9-1.5 2.3.3.8 2.7.6v4l-2.7.6-.3.8 1.5 2.3-2.9 2.9-2.3-1.5-.8.3-.6 2.7h-4l-.6-2.7-.8-.3-2.3 1.5-2.9-2.9 1.5-2.3-.3-.8-2.7-.6v-4l2.7-.6.3-.8-1.5-2.3 2.9-2.9 2.3 1.5z" ${TONE}/><circle cx="12" cy="12" r="3.6" ${FILL}/>`),
  });

  const root = document.documentElement;

  const enabled = () =>
    getComputedStyle(root).getPropertyValue('--se-overlay').trim().toLowerCase() !== 'off';

  /* ---------- Steam context ---------- */

  // Steam's stores and SteamClient bindings live in the shared JS context (the
  // window that owns SteamUIStore). This popup's own globals are a fallback:
  // its SteamClient doesn't answer every call.
  const contextWindows = () =>
    [...SE.owners()].sort(
      (a, b) => Number(!!SE.run(() => b.SteamUIStore)) - Number(!!SE.run(() => a.SteamUIStore))
    );

  const contextGlobal = key => {
    for (const win of contextWindows()) {
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

  // Web pages open as a new tab in the overlay's own browser:
  // DesktopOverlay.AddWebPageRequest(url, activate) adds the tab, saves it and
  // shows the Browser widget. Outside an overlay (or if that ever fails), Steam's
  // URL handler opens the page in the client instead.
  const openUrl = url => {
    const overlay = desktopOverlay();
    if (typeof overlay?.AddWebPageRequest === 'function') {
      try {
        overlay.AddWebPageRequest(url, true);
        return;
      } catch (err) {
        console.warn('[Steam Enhanced overlay] browser tab failed', err);
      }
    }
    SE.run(() => contextGlobal('SteamClient').URL.ExecuteSteamURL(`steam://openurl/${url}`));
  };

  // Steam's own overlay path for a friend's chat: the chat window opens in
  // this overlay (and still goes through the theme's chat routing).
  const openChat = steamid64 => {
    const accountId = SE.run(() => Number(BigInt(steamid64) & 0xffffffffn));
    if (!accountId) return;
    const browserInfo = SE.run(() => findInstance().params.browserInfo);
    const friend = SE.run(() => contextGlobal('g_FriendsUIApp').FriendStore.GetFriend(accountId));
    if (friend && browserInfo) SE.run(() => friend.OpenChatDialog(browserInfo));
  };

  const accountIdOf = steamid64 => SE.run(() => Number(BigInt(steamid64) & 0xffffffffn)) || 0;

  const selfSteamId = () =>
    SE.run(() => contextGlobal('App').m_CurrentUser.strSteamID) ||
    SE.run(() => String(contextGlobal('g_FriendsUIApp').FriendStore.self.steamid64)) ||
    '';

  /* ---------- Async data cache ---------- */

  const LOAD_TIMEOUT_MS = 10_000;

  const withTimeout = promise => {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  // One entry per key: keeps the last good value (shown at once while a
  // refresh runs), refreshes after `ttl`, and backs off by `retry` after a
  // failure or a call that never answers. `onSettled` re-renders on arrival.
  const createCache = ({ ttl, retry, load, onSettled }) => {
    const entries = new Map();
    return {
      get(key) {
        let entry = entries.get(key);
        const now = Date.now();
        if (!entry) entries.set(key, (entry = { value: null, due: 0, pending: false, error: null, at: 0 }));
        if (!entry.pending && now >= entry.due) {
          entry.pending = true;
          Promise.resolve()
            .then(() => withTimeout(load(key)))
            .then(
              value => {
                entry.value = value;
                entry.error = null;
                entry.due = Date.now() + ttl;
              },
              err => {
                entry.error = String(err?.message || err);
                entry.due = Date.now() + retry;
              }
            )
            .finally(() => {
              entry.pending = false;
              entry.at = Date.now();
              onSettled();
            });
        }
        return entry.value;
      },
      expire(key) {
        for (const [k, entry] of entries) if (key === undefined || k === key) entry.due = 0;
      },
      clear() {
        entries.clear();
      },
      // For `__seOverlay.debug()`.
      inspect(key) {
        const entry = entries.get(key);
        if (!entry) return { status: 'not requested' };
        return {
          status: entry.pending ? 'loading' : entry.error ? 'error' : 'ok',
          error: entry.error,
          value: entry.value,
          settledSecondsAgo: entry.at ? Math.round((Date.now() - entry.at) / 1000) : null,
        };
      },
    };
  };

  /* ---------- Steam services ---------- */

  // Steam's protobuf service calls, found by shape in Steam's webpack modules:
  // the service object, its request classes and the shared message wrapper.
  // One SE.findModule pass resolves every part of an API.
  const servicePart = (name, methods) => [
    [`${name}.${methods[0]}#1`],
    value => methods.every(method => typeof value?.[method] === 'function'),
  ];
  const requestPart = className => [
    [className],
    value => typeof value === 'function' && value.prototype.getClassName() === className,
  ];
  const MESSAGE_PART = [
    ['InitFromPacket', 'SerializeBody'],
    value =>
      typeof value?.Init === 'function' &&
      typeof value.InitFromPacket === 'function' &&
      typeof value.prototype?.Body === 'function' &&
      typeof value.prototype?.Hdr === 'function',
  ];

  // The resolver also reports which parts it last failed to find (debug).
  const defineApi = (key, parts) => {
    const all = { ...parts, Message: MESSAGE_PART };
    let missing = [];
    const resolve = () => {
      const found = {};
      const api = SE.findModule(key, (src, id, req) => {
        for (const [part, [markers, pick]] of Object.entries(all)) {
          if (!found[part]) found[part] = exportOf(src, id, req, markers, pick);
        }
        return Object.keys(all).every(part => found[part]) ? found : null;
      });
      // A cached hit or miss skips the scan; only a fresh scan updates this.
      if (Object.keys(found).length) missing = Object.keys(all).filter(part => !found[part]);
      else if (api) missing = [];
      return api;
    };
    resolve.missing = () => missing;
    return resolve;
  };

  const callService = async (resolveApi, method, requestKey, fill) => {
    const api = resolveApi();
    const transport = SE.run(() => contextGlobal('g_FriendsUIApp').CMInterface.GetServiceTransport());
    if (!api) throw new Error(`service not found (missing: ${resolveApi.missing().join(', ') || 'unknown'})`);
    if (!transport) throw new Error('no service transport');
    const msg = api.Message.Init(api[requestKey]);
    fill(msg.Body());
    const res = await api.service[method](transport, msg);
    if (!res?.BSuccess?.()) throw new Error(`EResult ${SE.run(() => res.GetEResult())}`);
    return res.Body().toObject();
  };

  /* ---------- Achievements ---------- */

  const ACH_ROWS = 2;
  const EOK = 1;
  const ACH_TABS = Object.freeze([
    { id: 'progress', label: 'In progress' },
    { id: 'unlocked', label: 'Unlocked' },
    { id: 'locked', label: 'Locked' },
  ]);

  // Same maths as Steam's own progress bars: current / max, from zero.
  const progressOf = a => Math.min(1, Math.max(0, Math.min(a.flCurrentProgress, a.flMaxProgress) / a.flMaxProgress));
  const hasProgress = a => a.flMaxProgress > 1 && a.flCurrentProgress > 0;

  // Every achievement, normalized for the list view. Locked hidden ones keep
  // their secret, as in Steam. `pct` is the global unlock rate (rarity tier).
  const toItem = a => {
    const secret = !a.bAchieved && !!a.bHidden;
    const tracked = !a.bAchieved && !a.bHidden && hasProgress(a);
    return {
      id: String(a.strID),
      name: secret ? 'Hidden achievement' : String(a.strName || ''),
      desc: secret ? 'Details are revealed once you unlock it.' : String(a.strDescription || ''),
      icon: a.strImage || '',
      achieved: !!a.bAchieved,
      unlockedAt: a.bAchieved ? Number(a.rtUnlocked) || 0 : 0,
      pct: typeof a.flAchieved === 'number' && Number.isFinite(a.flAchieved) ? a.flAchieved : null,
      progress: tracked
        ? {
            ratio: progressOf(a),
            current: Math.floor(Math.min(a.flCurrentProgress, a.flMaxProgress)),
            max: Math.floor(a.flMaxProgress),
          }
        : null,
    };
  };

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
        pct: a.flAchieved,
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
          .map(a => ({ id: a.strID, name: a.strName, icon: a.strImage, pct: a.flAchieved, unlockedAt: a.rtUnlocked }));
    return { unlocked: unlocked.length, total: list.length, rows, items: list.map(toItem) };
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

  // Player.GetFriendsGameplayInfo, the service call behind Steam's "Friends who
  // have played recently".
  const resolveGameplayApi = defineApi('overlay:gameplay-api', {
    service: servicePart('Player', ['GetFriendsGameplayInfo']),
    Request: requestPart('CPlayer_GetFriendsGameplayInfo_Request'),
  });

  const loadRecentPlayers = async appid => {
    const body = await callService(resolveGameplayApi, 'GetFriendsGameplayInfo', 'Request', req => req.set_appid(appid));
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
  // first), in Steam's order: most recent playtime first.
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

  /* ---------- Screenshots ---------- */

  const SHOT_COUNT = 2;
  // SteamClient.Screenshots has no per-game range call; these list the local
  // library, and the game's newest are picked from it.
  const SHOT_SOURCES = ['GetAllLocalScreenshots', 'GetAllAppsLocalScreenshots'];
  const URL_RE = /^(?:https?|file):\/\//i;

  const screenshotsApi = () => contextGlobal('SteamClient')?.Screenshots || null;

  // Field names vary between client builds: the app id from the first id-like
  // field, the image from the first URL-like string.
  const shotAppId = shot => Number(shot?.nAppID ?? shot?.unAppID ?? shot?.appid ?? shot?.strGameID) || 0;
  const shotUrl = shot =>
    (typeof shot?.strUrl === 'string' && shot.strUrl) ||
    Object.values(shot || {}).find(value => typeof value === 'string' && URL_RE.test(value)) ||
    '';
  const shotTime = shot => Number(shot?.nCreated ?? shot?.rtCreated ?? shot?.unCreated) || 0;

  let shotSample = null;

  const loadScreenshots = async appid => {
    const api = screenshotsApi();
    let list = null;
    const errors = [];
    for (const method of SHOT_SOURCES) {
      if (typeof api?.[method] !== 'function') continue;
      try {
        const res = await api[method]();
        if (Array.isArray(res)) {
          list = res;
          break;
        }
        errors.push(`${method}: not a list`);
      } catch (err) {
        errors.push(`${method}: ${err?.message || err}`);
      }
    }
    if (!list) throw new Error(errors.join('; ') || 'unavailable');
    shotSample = list[0] || null;
    const shots = list
      .filter(shot => shotAppId(shot) === appid && shotUrl(shot))
      .sort((a, b) => shotTime(b) - shotTime(a));
    return {
      count: shots.length,
      shots: shots.slice(0, SHOT_COUNT).map(shot => ({ url: shotUrl(shot), created: shotTime(shot) })),
    };
  };

  // A cheap change check: the last screenshot's handle. A new one refreshes
  // the section right away instead of waiting out the cache.
  let lastShotHandle;

  const checkNewScreenshot = async () => {
    const api = screenshotsApi();
    if (typeof api?.GetLastScreenshotTaken !== 'function') return;
    const last = await Promise.resolve()
      .then(() => api.GetLastScreenshotTaken())
      .catch(() => null);
    const handle = last ? String(last.hHandle ?? last.handle ?? shotTime(last)) : '';
    if (lastShotHandle !== undefined && handle !== lastShotHandle) screenshotsCache.expire();
    lastShotHandle = handle;
  };

  /* ---------- Guides ---------- */

  const GUIDE_ROWS = 4;
  // EPublishedFileInfoMatchingFileType / EPublishedFileQueryType.
  const FILETYPE_ALL_GUIDES = 10;
  const QUERY_RANKED_BY_VOTE = 0;
  const GUIDE_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=';
  const GUIDES_URL = appid => `https://steamcommunity.com/app/${appid}/guides/`;

  // PublishedFile.QueryFiles (top rated) and GetUserFiles (your favorites):
  // the same community data Game Overview lists.
  const resolveGuidesApi = defineApi('overlay:guides-api', {
    service: servicePart('PublishedFile', ['QueryFiles', 'GetUserFiles']),
    Query: requestPart('CPublishedFile_QueryFiles_Request'),
    User: requestPart('CPublishedFile_GetUserFiles_Request'),
  });

  const toGuide = favorite => file => ({
    id: String(file.publishedfileid),
    title: String(file.title || '').trim(),
    favorite,
  });

  // Fallback when the service can't be reached: the community guide pages,
  // fetched from Steam's context with the user's session and parsed.
  const COMMUNITY = 'https://steamcommunity.com';
  const GUIDE_PAGES = Object.freeze({
    favorites: appid => `${COMMUNITY}/my/myworkshopfiles/?appid=${appid}&browsefilter=myfavorites&section=guides`,
    top: appid => `${COMMUNITY}/app/${appid}/guides/?browsefilter=toprated`,
  });

  const fetchText = async url => {
    const win = contextWindows()[0];
    const res = await win.fetch(url, { credentials: 'include', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const parseGuidePage = (html, favorite) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set();
    const list = [];
    for (const link of doc.querySelectorAll('a[href*="sharedfiles/filedetails/?id="]')) {
      const id = /[?&]id=(\d+)/.exec(link.getAttribute('href'))?.[1];
      if (!id || seen.has(id)) continue;
      const card = link.closest('.workshopItem, .workshopItemCollection') || link;
      const title = (card.querySelector('.workshopItemTitle')?.textContent || '').trim();
      if (!title) continue;
      seen.add(id);
      list.push({ id, title, favorite });
    }
    return list;
  };

  const loadGuidesFromWeb = async appid => {
    const [favorites, top] = await Promise.allSettled([
      fetchText(GUIDE_PAGES.favorites(appid)).then(html => parseGuidePage(html, true)),
      fetchText(GUIDE_PAGES.top(appid)).then(html => parseGuidePage(html, false)),
    ]);
    if (favorites.status === 'rejected' && top.status === 'rejected') throw top.reason;
    return [favorites, top].flatMap(result => (result.status === 'fulfilled' ? result.value : []));
  };

  const mergeGuides = list => {
    const seen = new Set();
    return list.filter(guide => guide.title && !seen.has(guide.id) && seen.add(guide.id)).slice(0, GUIDE_ROWS);
  };

  const loadGuidesFromService = async appid => {
    const steamid = selfSteamId();
    const [favorites, top] = await Promise.allSettled([
      steamid
        ? callService(resolveGuidesApi, 'GetUserFiles', 'User', req => {
            req.set_steamid(steamid);
            req.set_appid(appid);
            req.set_type('myfavorites');
            req.set_filetype(FILETYPE_ALL_GUIDES);
            req.set_numperpage(GUIDE_ROWS);
            req.set_return_details?.(true);
          })
        : Promise.reject(new Error('no user')),
      callService(resolveGuidesApi, 'QueryFiles', 'Query', req => {
        req.set_appid(appid);
        req.set_query_type(QUERY_RANKED_BY_VOTE);
        req.set_filetype(FILETYPE_ALL_GUIDES);
        req.set_numperpage(GUIDE_ROWS * 2);
        // Without this (or another return_* flag) QueryFiles only sends vote
        // data: no titles.
        req.set_return_details?.(true);
      }),
    ]);
    if (favorites.status === 'rejected' && top.status === 'rejected') throw top.reason;
    const listOf = (result, favorite) =>
      result.status === 'fulfilled' ? (result.value.publishedfiledetails || []).map(toGuide(favorite)) : [];
    guidesRaw = {
      favorites: favorites.status === 'fulfilled' ? (favorites.value.publishedfiledetails || []).length : String(favorites.reason?.message || favorites.reason),
      top: top.status === 'fulfilled' ? (top.value.publishedfiledetails || []).length : String(top.reason?.message || top.reason),
    };
    return [...listOf(favorites, true), ...listOf(top, false)];
  };

  // Favorites first, then top guides that aren't favorites, untitled ones
  // dropped. The service first; the web pages when it fails or comes back empty.
  let guidesServiceError = null;
  let guidesRaw = null;

  const loadGuides = async appid => {
    let list = [];
    try {
      list = mergeGuides(await loadGuidesFromService(appid));
      guidesServiceError = null;
    } catch (err) {
      guidesServiceError = String(err?.message || err);
    }
    return list.length ? list : mergeGuides(await loadGuidesFromWeb(appid));
  };

  /* ---------- News ---------- */

  const NEWS_COUNT = 3;
  const NEWS_ENDPOINT = 'https://store.steampowered.com/events/ajaxgetpartnereventspageable/';
  const CLAN_IMAGES = 'https://clan.akamai.steamstatic.com/images/';
  // Posts without a capsule (most patch notes) show the game's store header.
  const HEADER_ART = appid => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
  // The community announcement pages, not the store's News Hub: the News Hub
  // never finishes loading in the overlay's browser. `/ogg/<appid>` addresses
  // the game's official group by app id (`/games/` wants the group's vanity name).
  const NEWS_URL = (appid, gid = '') =>
    `https://steamcommunity.com/ogg/${appid}/announcements/${gid ? `detail/${gid}` : ''}`;
  // EProtoClanEventType, the ones a game posts as news.
  const EVENT_LABEL = Object.freeze({ 12: 'Patch notes', 13: 'Update', 14: 'Major update', 15: 'Release', 28: 'News' });

  const parseJson = text => {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };

  const toNews = appid => event => {
    const body = event.announcement_body || {};
    const title = String(event.event_name || body.headline || '').trim();
    if (!title) return null;
    const meta = parseJson(event.jsondata) || {};
    const file = meta.localized_capsule_image?.find(Boolean) || meta.localized_title_image?.find(Boolean) || '';
    const clan = accountIdOf(String(event.clan_steamid || ''));
    return {
      id: String(body.gid || event.gid),
      title,
      label: EVENT_LABEL[event.event_type] || 'News',
      time: Number(event.rtime32_start_time || body.posttime) || 0,
      image: file && clan ? `${CLAN_IMAGES}${clan}/${file}` : '',
      url: NEWS_URL(appid, body.gid || event.gid),
    };
  };

  // The store's partner events feed, fetched from Steam's own context with the
  // user's store session, like the theme's News Hub.
  const loadNews = async appid => {
    const win = contextWindows()[0];
    const url = new URL(NEWS_ENDPOINT);
    url.search = new URLSearchParams({ clan_accountid: 0, appid, offset: 0, count: NEWS_COUNT });
    const res = await win.fetch(url, { credentials: 'include', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Number(data.success) !== 1 || !Array.isArray(data.events)) throw new Error('bad response');
    return data.events.map(toNews(appid)).filter(Boolean).slice(0, NEWS_COUNT);
  };

  /* ---------- Toolbar: Game Overview and Achievements ---------- */

  const CLOSE_RETRY_MS = 1500;
  // Steam names each toolbar button by its widget in its class list
  // (`ToolbarButton GameOverview`, `ToolbarButton FriendsList`, ...), in every
  // language. Those names are also the widgets' window ids.
  const WIDGET = Object.freeze({
    overview: 'GameOverview',
    achievements: 'Achievements',
    friends: 'FriendsList',
    remote: 'RemotePlayTogether',
    notes: 'Notes',
    controller: 'Controller',
    browser: 'Browser',
    settings: 'Settings',
  });

  const toolbarButton = id => document.querySelector(`${SEL.toolbarButton}.${WIDGET[id]}`);

  // A widget the column replaces: Steam may still open it (with the overlay, a
  // hotkey, a saved layout), so it's closed the way its toolbar button would,
  // once per opening, and `onClosed` shows the column's view instead. The
  // toolbars themselves are hidden by overlay.css; their buttons stay in the
  // DOM and still take .click().
  const createReplaced = (find, onClosed) => {
    let closedAt = 0;
    return {
      sync() {
        const button = find();
        if (button?.classList.contains(TOOLBAR_ACTIVE) && Date.now() - closedAt > CLOSE_RETRY_MS) {
          closedAt = Date.now();
          button.click();
          onClosed?.();
        }
      },
      release() {
        closedAt = 0;
      },
    };
  };

  // Game Overview's content is the left column; Achievements is its list view.
  const replacedButtons = [
    createReplaced(() => toolbarButton('overview')),
    createReplaced(() => toolbarButton('achievements'), () => setView('achievements')),
  ];

  // Widgets a view hands off to (its own window), through their toolbar button.
  const toolButtons = Object.fromEntries(
    ['friends', 'remote', 'notes', 'controller', 'browser', 'settings'].map(id => [id, { current: () => toolbarButton(id) }])
  );

  // Open Steam's own widget for a view, through its (hidden) toolbar button.
  const openToolWidget = id => {
    if (id === 'remote' && SE.run(() => (desktopOverlay().ShowRemotePlayTogether(), true))) return true;
    const target = toolButtons[id]?.current();
    if (target && !target.classList.contains(TOOLBAR_ACTIVE)) target.click();
    return !!target;
  };

  const syncToolbar = () => {
    for (const replaced of replacedButtons) replaced.sync();
  };

  /* ---------- Widget windows ---------- */

  // Every widget window (Browser, Settings, Guides, Screenshots, ...) opens
  // centred on the overlay at one fixed size. Steam restores each widget's
  // last spot, so it's moved right after it shows, then left alone, so it
  // can still be dragged.
  const WINDOW_W = 1120;
  const WINDOW_H = 720;
  const WINDOW_MARGIN = 0.9; // at most this share of the overlay
  const WINDOW_SETTLE_MS = 1500;
  const WINDOW_TICK_MS = 100;
  const WINDOW_SLACK = 2;

  // Widget ids: ours, plus each toolbar button's widget class.
  const widgetIds = () => {
    const ids = new Set(Object.values(WIDGET));
    for (const btn of document.querySelectorAll(SEL.toolbarButton)) {
      for (const name of btn.classList) {
        if (/^[A-Z]/.test(name) && name !== 'ToolbarButton' && name !== 'DialogButton') ids.add(name);
      }
    }
    return ids;
  };

  // Widget windows carry Steam's OverlayPopupBody class on <body>.
  const OVERLAY_POPUP_BODY = '_1UJDmU3N-pkv7oTJ_Zf9nK';
  const isWindow = value => !!SE.run(() => value && typeof value.moveTo === 'function' && !!value.document);
  const isWidgetWindow = win =>
    isWindow(win) && win !== window && !!SE.run(() => win.document.body.classList.contains(OVERLAY_POPUP_BODY));

  // The Window inside one of Steam's popup objects, whichever field holds it.
  const windowOf = popup => {
    if (!popup) return null;
    if (isWindow(popup)) return popup;
    for (const key of ['m_popup', 'window', 'm_window', 'browserWindow', 'BrowserWindow']) {
      const win = SE.run(() => popup[key]);
      if (isWindow(win)) return win;
    }
    return SE.run(() => Object.values(popup).find(isWindow)) || null;
  };

  // Steam's popup manager, in this window or the one that created it.
  const popupManager = () => {
    for (const host of [window, SE.run(() => window.opener), SE.run(() => window.parent)]) {
      const manager = SE.run(() => host?.g_PopupManager);
      if (manager) return manager;
    }
    return null;
  };

  const managedPopups = () => {
    const manager = popupManager();
    if (!manager) return [];
    const list = SE.run(() => manager.GetPopups?.()) || SE.run(() => manager.m_mapPopups?.values()) || [];
    return SE.run(() => Array.from(list)) || [];
  };

  // Every open widget window: by widget id (GetPopupForWindow returns the
  // Window itself), plus any visible overlay popup Steam's popup manager
  // knows (Settings, chat, ...).
  const widgetWindows = () => {
    const found = new Set();
    const overlay = desktopOverlay();
    if (overlay) {
      for (const id of widgetIds()) {
        if (!SE.run(() => overlay.BWindowVisible(id))) continue;
        const win = windowOf(SE.run(() => overlay.GetPopupForWindow(id)));
        if (win) found.add(win);
      }
    }
    for (const popup of managedPopups()) {
      const win = windowOf(popup);
      if (isWidgetWindow(win) && SE.run(() => win.document.visibilityState) === 'visible') found.add(win);
    }
    return [...found].filter(win => !SE.run(() => win.closed));
  };

  // Target in this window's CSS pixels (it spans the screen).
  const windowTarget = () => {
    const w = Math.round(Math.min(WINDOW_W, window.innerWidth * WINDOW_MARGIN));
    const h = Math.round(Math.min(WINDOW_H, window.innerHeight * WINDOW_MARGIN));
    const x = Math.round(window.screenX + (window.innerWidth - w) / 2);
    const y = Math.round(window.screenY + (window.innerHeight - h) / 2);
    return { x, y, w, h };
  };

  const windowRect = win => SE.run(() => ({ x: win.screenX, y: win.screenY, w: win.outerWidth, h: win.outerHeight }));

  // Overlay popups ignore the DOM's moveTo/resizeTo; their own
  // SteamClient.Window API works. Positions are screen DIPs, the same units
  // as this window's CSS pixels and every window's screenX/outerWidth; the
  // popup's devicePixelRatio only reflects Steam's UI zoom, so it isn't used.
  // The DOM calls are a fallback for windows without that API.
  const placeWindow = win => {
    const target = windowTarget();
    const at = windowRect(win);
    const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= WINDOW_SLACK;
    const sized = !!at && near(at.w, target.w) && near(at.h, target.h);
    const moved = !!at && near(at.x, target.x) && near(at.y, target.y);
    if (sized && moved) return true;
    const api = SE.run(() => win.SteamClient?.Window);
    if (api?.MoveTo) {
      if (!sized) SE.run(() => api.ResizeTo(target.w, target.h, true));
      if (!moved) SE.run(() => api.MoveTo(target.x, target.y, false));
    } else {
      if (!sized) SE.run(() => win.resizeTo(target.w, target.h));
      if (!moved) SE.run(() => win.moveTo(target.x, target.y));
    }
    return false;
  };

  // Each window is placed once per opening (Steam keeps hidden widget windows
  // alive, so state is dropped when one hides), then left free to drag.
  const placedWindows = new Map();

  const centerWidgets = () => {
    const now = Date.now();
    const open = widgetWindows();
    for (const win of placedWindows.keys()) if (!open.includes(win)) placedWindows.delete(win);
    for (const win of open) {
      let state = placedWindows.get(win);
      if (!state) placedWindows.set(win, (state = { since: now, attempt: 0, done: false }));
      if (state.done || now - state.since > WINDOW_SETTLE_MS) continue;
      state.attempt++;
      state.done = placeWindow(win);
    }
  };

  const windowsDebug = () => {
    const overlay = desktopOverlay();
    const visible = [...widgetIds()].filter(id => SE.run(() => overlay.BWindowVisible(id)));
    return {
      target: windowTarget(),
      self: windowRect(window),
      popupManager: popupManager() ? namesOf(popupManager()).slice(0, 60) : null,
      overlayNames: overlay ? namesOf(overlay).filter(name => /window|popup|position|rect|size|pin/i.test(name)) : null,
      visible: visible.map(id => {
        const popup = SE.run(() => overlay.GetPopupForWindow(id));
        const win = windowOf(popup);
        return {
          id,
          popup: popup ? namesOf(popup).slice(0, 60) : null,
          window: !!win,
          rect: win && windowRect(win),
          steamWindowApi: win && namesOf(SE.run(() => win.SteamClient?.Window)),
          state: win && placedWindows.get(win),
        };
      }),
      managed: managedPopups().map(popup => ({
        names: namesOf(popup).slice(0, 30),
        widget: isWidgetWindow(windowOf(popup)),
        title: SE.run(() => windowOf(popup)?.document.title),
      })),
    };
  };

  /* ---------- DOM ---------- */

  const { el } = SE;

  const button = (className, attrs = {}) => {
    const node = el('button', className);
    node.type = 'button';
    for (const [key, value] of Object.entries(attrs)) node.dataset[key] = value;
    return node;
  };

  const img = (className, src) => {
    const node = el('img', className);
    node.alt = '';
    node.loading = 'lazy';
    node.decoding = 'async';
    if (src) node.src = src;
    return node;
  };

  const buildStat = label => {
    const cell = el('div', 'se-ov-stat');
    const value = el('div', 'se-ov-stat-value');
    value.append(el('b'), el('small'));
    cell.append(el('div', 'se-ov-stat-label', label), value);
    return cell;
  };

  // A search input in a styled box with an icon, so the overlay's own input
  // styles never decide its size. The column's input handler routes it by
  // `data-search`.
  const searchField = (kind, placeholder) => {
    const box = el('label', 'se-ov-achl-searchbox');
    box.innerHTML = ICON.search;
    const input = el('input', 'se-ov-achl-search');
    input.type = 'text';
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', placeholder);
    input.dataset.search = kind;
    box.append(input);
    return { box, input };
  };

  const buildBar = ratio => {
    const bar = el('div', 'se-ov-bar');
    const fill = el('i');
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    bar.append(fill);
    return bar;
  };

  // A section with a header label and, optionally, a header link: `meta` is
  // the link's text, `action` the data attributes the delegated click reads.
  const buildSection = (key, label, link) => {
    const section = el('section', 'se-ov-sec');
    section.dataset.sec = key;
    section.hidden = true;
    const head = el('div', 'se-ov-sec-head');
    head.append(el('span', 'se-ov-sec-label', label));
    let meta = null;
    if (link) {
      const open = button('se-ov-sec-link', link.action);
      open.setAttribute('aria-label', link.aria);
      open.innerHTML = ICON.chevron;
      meta = el('span', 'se-ov-sec-meta', link.text || '');
      open.prepend(meta);
      head.append(open);
    } else {
      meta = el('span', 'se-ov-sec-note');
      head.append(meta);
    }
    const body = el('div', 'se-ov-sec-body');
    section.append(head, body);
    return { section, head, meta, body, signature: '' };
  };

  const { tierOf, fmtPct } = SE.rarity;

  // An achievement icon with its rarity tier: aura and sparkles when unlocked,
  // the tier's initial either way (core/achievement-tiers.css).
  const achIcon = (className, item, achieved) => {
    const box = el('span', className);
    box.append(img(null, item.icon));
    const tier = tierOf(item.pct);
    if (tier) {
      box.dataset.seTier = tier.id;
      if (!achieved) box.dataset.seTierLocked = '';
      box.append(SE.rarity.fx(tier, !achieved));
    }
    return box;
  };

  // The full list (Steam's Achievements widget, in the column): header with a
  // way back, the progress bar, tier chips that filter, search, tabs and rows.
  // Built once; only the counts and rows change.
  const buildAchList = () => {
    const panel = el('section', 'se-ov-view se-ov-achl');
    panel.dataset.view = 'achievements';
    panel.setAttribute('aria-label', 'Achievements');

    const bar = buildBar(0);
    const chips = el('div', 'se-ov-achl-tiers');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter by rarity');

    const { box: searchBox, input: search } = searchField('achievements', 'Search achievements');

    const tabs = el('div', 'se-ov-achl-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabButtons = new Map(
      ACH_TABS.map(({ id }) => {
        const tab = button('se-ov-achl-tab', { achTab: id });
        tab.setAttribute('role', 'tab');
        tabs.append(tab);
        return [id, tab];
      })
    );

    const list = el('ul', 'se-ov-achl-list');
    const empty = el('p', 'se-ov-achl-empty');
    panel.append(bar, chips, searchBox, tabs, list, empty);
    return { panel, bar, chips, search, tabButtons, list, empty, chipsSig: '', rowsSig: '' };
  };

  // The rail of view tabs, the drawer head naming the open view, and the
  // footer under them: Exit game under the rail, Back to game (labelled, with
  // its shortcut) under the drawer. Icon-only buttons name themselves in a
  // flyout (`data-tip`, drawn by CSS) instead of the slow native tooltip.
  const buildTabs = () => {
    const rail = el('nav', 'se-ov-rail');
    rail.setAttribute('aria-label', 'Overlay views');
    const tabs = new Map(
      VIEWS.map(({ id, label }) => {
        const tab = button('se-ov-tab', { view: id, tip: label });
        tab.setAttribute('aria-label', label);
        tab.setAttribute('aria-pressed', 'false');
        const icon = el('span', 'se-ov-tab-icon');
        icon.innerHTML = VIEW_ICON[id];
        tab.append(icon);
        rail.append(tab);
        return [id, { tab }];
      })
    );
    rail.addEventListener('click', event => {
      const tab = event.target.closest('[data-view]');
      if (tab) setView(tab.dataset.view);
    });

    const back = button('se-ov-back');
    back.setAttribute('aria-keyshortcuts', 'Shift+Tab');
    back.innerHTML = ICON.play;
    back.append(el('span', 'se-ov-back-label', 'Back to game'), el('kbd', 'se-ov-back-key', 'Shift+Tab'));
    back.addEventListener('click', () => document.querySelector(SEL.backToGame)?.click());
    const exit = button('se-ov-exit', { tip: 'Exit game' });
    exit.setAttribute('aria-label', 'Exit game');
    exit.innerHTML = ICON.power;
    exit.addEventListener('click', () => document.querySelector(SEL.exitGame)?.click());

    const head = el('div', 'se-ov-tabs-head');
    const title = el('h2', 'se-ov-tabs-title');
    const note = el('span', 'se-ov-tabs-note');
    head.append(title, note);
    return { rail, tabs, head, title, note, back, exit };
  };

  // The time cell: today's time; click to start the timer (it then shows the
  // elapsed time), click again to pause, right-click to reset to the clock.
  const buildTimeCell = () => {
    const cell = button('se-ov-stat se-ov-time');
    const label = el('div', 'se-ov-stat-label');
    const value = el('div', 'se-ov-stat-value');
    const b = el('b');
    const small = el('small');
    value.append(b, small);
    cell.append(label, value);
    cell.addEventListener('click', () => (timer.running() ? timer.pause() : timer.start()));
    cell.addEventListener('contextmenu', event => {
      event.preventDefault();
      timer.reset();
    });
    return { cell, label, b, small };
  };

  const buildFriendsView = () => {
    const panel = el('section', 'se-ov-view se-ov-friends');
    panel.dataset.view = 'friends';
    panel.setAttribute('aria-label', 'Friends');
    const { box: searchBox } = searchField('friends', 'Search friends');
    const list = el('div', 'se-ov-friends-list');
    const listPane = el('div', 'se-ov-friends-pane');
    listPane.append(searchBox, list);
    panel.append(listPane);
    return { panel, list, sig: '' };
  };

  const sectionLabel = text => el('h3', 'se-ov-friends-group', text);

  // Remote Play Together, drawn in the column: you as host with hosting
  // state; inviting opens Steam's own window.
  const buildRemoteView = () => {
    const panel = el('section', 'se-ov-view se-ov-remote');
    panel.dataset.view = 'remote';
    panel.setAttribute('aria-label', 'Remote Play Together');

    const host = el('div', 'se-ov-card-row');
    const hostAvatar = el('span', 'se-ov-avatar');
    hostAvatar.dataset.status = 'ingame';
    const hostText = el('span', 'se-ov-friend-text');
    const hostName = el('span', 'se-ov-friend-name');
    const hostStatus = el('span', 'se-ov-friend-status');
    hostText.append(hostName, hostStatus);
    host.append(hostAvatar, hostText, el('span', 'se-ov-pill', 'Host'));

    // Friend and guest invites go through Steam's own window.
    const open = button('se-ov-btn', { tool: 'remote' });
    open.innerHTML = ICON.open;
    open.prepend(el('span', null, 'Invite friends or a guest'));
    open.title = "Steam's Remote Play Together window";

    const notice = el('p', 'se-ov-tool-text');
    notice.hidden = true;
    panel.append(host, notice, open);
    return { panel, hostAvatar, hostName, hostStatus, notice };
  };

  // Controller, drawn in the column: Steam Input for this game, what the
  // game supports, the connected controllers, and the layout editor.
  const buildControllerView = () => {
    const panel = el('section', 'se-ov-view se-ov-pad');
    panel.dataset.view = 'controller';
    panel.setAttribute('aria-label', 'Controller');

    const toggle = button('se-ov-switch-row', { padSwitch: '' });
    toggle.setAttribute('role', 'switch');
    const toggleText = el('span', 'se-ov-friend-text');
    toggleText.append(
      el('span', 'se-ov-friend-name', "Use the game's built-in support"),
      el('span', 'se-ov-switch-desc')
    );
    toggle.append(toggleText, el('span', 'se-ov-switch'));

    const support = el('div', 'se-ov-chips');
    const pads = el('div', 'se-ov-pad-list');
    const layout = button('se-ov-btn', { padLayout: '' });
    layout.innerHTML = ICON.chevron;
    layout.prepend(el('span', null, 'Controller layout'));
    panel.append(toggle, sectionLabel('Game support'), support, sectionLabel('Connected'), pads, layout);
    return { panel, toggle, desc: toggle.querySelector('.se-ov-switch-desc'), support, pads, sig: '' };
  };

  // Notes, drawn in the column: picker, new/delete, title, a formatting bar
  // and the editor. Saves through Steam's notes store (see Notes below).
  const buildNotesView = () => {
    const panel = el('section', 'se-ov-view se-ov-notes-view');
    panel.dataset.view = 'notes';
    panel.setAttribute('aria-label', 'Notes');

    const bar = el('div', 'se-ov-notes-bar');
    const pickerBox = el('label', 'se-ov-select');
    const picker = el('select', 'se-ov-select-input');
    picker.setAttribute('aria-label', 'Note');
    picker.dataset.notePick = '';
    pickerBox.append(picker);
    const add = button('se-ov-btn', { noteNew: '' });
    add.textContent = '+ New';
    const remove = button('se-ov-btn se-ov-btn-icon', { noteDelete: '' });
    remove.setAttribute('aria-label', 'Delete note');
    remove.title = 'Delete note';
    remove.innerHTML = ICON.trash;
    bar.append(pickerBox, add, remove);

    const confirm = el('div', 'se-ov-confirm');
    confirm.hidden = true;
    const yes = button('se-ov-btn se-ov-btn-danger', { noteDeleteYes: '' });
    yes.textContent = 'Delete';
    const no = button('se-ov-btn', { noteDeleteNo: '' });
    no.textContent = 'Keep';
    confirm.append(el('span', null, 'Delete this note? This can’t be undone.'), yes, no);

    const tools = el('div', 'se-ov-format');
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', 'Formatting');
    for (const [cmd, label, glyph] of FORMAT_TOOLS) {
      const tool = button('se-ov-format-btn', { format: cmd });
      tool.setAttribute('aria-label', label);
      tool.title = label;
      tool.innerHTML = glyph;
      // Keep the editor's selection when a tool is pressed.
      tool.addEventListener('mousedown', event => event.preventDefault());
      tools.append(tool);
    }

    const editor = el('div', 'se-ov-note-editor');
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Note');
    editor.dataset.noteField = '';

    const foot = el('div', 'se-ov-notes-foot');
    const status = el('span', 'se-ov-notes-status');
    const steam = button('se-ov-link', { tool: 'notes' });
    steam.textContent = 'Open in Steam’s editor';
    foot.append(status, steam);

    const empty = el('p', 'se-ov-tool-text');
    panel.append(bar, confirm, tools, editor, foot, empty);
    return { panel, picker, add, remove, confirm, tools, editor, status, steam, empty, listSig: '' };
  };

  // Browser, drawn in the column: an address field, this game's pages, and
  // the overlay browser's open tabs (Steam's own browser shows the page).
  const buildBrowserView = () => {
    const panel = el('section', 'se-ov-view se-ov-browser');
    panel.dataset.view = 'browser';
    panel.setAttribute('aria-label', 'Browser');

    const form = el('form', 'se-ov-field se-ov-address');
    form.setAttribute('role', 'search');
    const icon = el('span', 'se-ov-address-icon');
    icon.innerHTML = ICON.search;
    const input = el('input', 'se-ov-field-input');
    input.type = 'text';
    input.placeholder = 'Search or enter address';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search or enter address');
    const go = button('se-ov-field-go');
    go.type = 'submit';
    go.setAttribute('aria-label', 'Open');
    go.innerHTML = ICON.chevron;
    form.append(icon, input, go);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const target = addressUrl(input.value);
      if (!target) return;
      openUrl(target);
      input.value = '';
    });

    const links = el('div', 'se-ov-links');
    const tabs = el('div', 'se-ov-web-tabs');
    const open = button('se-ov-btn', { webOpen: '' });
    open.innerHTML = ICON.open;
    open.prepend(el('span', null, 'Open browser'));
    panel.append(form, sectionLabel('This game'), links, sectionLabel('Open tabs'), tabs, open);
    return { panel, links, tabs, linksSig: '', tabsSig: '' };
  };

  // Settings, drawn in the column: the theme's overlay options, and Steam's
  // own in-game settings one click away.
  const buildSettingsView = () => {
    const panel = el('section', 'se-ov-view se-ov-settings');
    panel.dataset.view = 'settings';
    panel.setAttribute('aria-label', 'Settings');

    const sliders = {};
    const rows = Object.entries(BACKDROP).map(([key, spec]) => {
      const row = el('label', 'se-ov-slider');
      const range = el('input', 'se-ov-range');
      range.type = 'range';
      range.min = String(spec.min);
      range.max = String(spec.max);
      range.step = '1';
      range.dataset.backdrop = key;
      range.setAttribute('aria-label', spec.label);
      const value = el('span', 'se-ov-tool-value');
      row.append(el('span', 'se-ov-tool-label', spec.label), range, value);
      sliders[key] = { range, value };
      return row;
    });

    const steam = button('se-ov-btn', { steamSettings: '' });
    steam.innerHTML = ICON.open;
    steam.prepend(el('span', null, 'Steam overlay settings'));

    panel.append(sectionLabel('Backdrop'), ...rows, sectionLabel('Steam'), steam);
    return { panel, sliders };
  };

  const buildOverview = () => {
    const wrap = el('div', 'se-ov-overview');
    const parts = {
      achievements: buildSection('achievements', 'Achievements', {
        aria: 'Show all achievements',
        action: { view: 'achievements' },
      }),
      friends: buildSection('friends', 'Friends'),
      screenshots: buildSection('screenshots', 'Your screenshots', {
        text: 'View all',
        aria: 'Open screenshots',
        action: { widget: 'Screenshots' },
      }),
      guides: buildSection('guides', 'Guides', { text: 'Browse', aria: 'Browse guides', action: { url: '' } }),
      news: buildSection('news', 'Recent news', { text: 'All news', aria: 'Open all news', action: { url: '' } }),
    };

    // One delegated handler: avatars open chat, `data-widget` opens an overlay
    // widget, `data-url` a web page, `data-view` switches the column, and the
    // list's tabs and tier chips filter it.
    wrap.addEventListener('click', event => {
      const target = event.target.closest(
        '[data-steamid], [data-widget], [data-url], [data-view], [data-ach-tab], [data-ach-tier], [data-tool], [data-offline], [data-pad-switch], [data-pad-layout], [data-web-open], [data-web-close], [data-steam-settings], [data-format], [data-note-new], [data-note-delete], [data-note-delete-yes], [data-note-delete-no]'
      );
      if (!target || !wrap.contains(target)) return;
      const { steamid, widget, url, view: nextView, achTab, achTier, tool } = target.dataset;
      if (target.dataset.format) formatNote(target.dataset.format);
      else if (target.dataset.noteNew !== undefined) newNote();
      else if (target.dataset.noteDelete !== undefined) askDeleteNote(true);
      else if (target.dataset.noteDeleteYes !== undefined) deleteNote();
      else if (target.dataset.noteDeleteNo !== undefined) askDeleteNote(false);
      else if (target.dataset.padSwitch !== undefined) toggleSteamInput();
      else if (target.dataset.padLayout !== undefined) openControllerLayout();
      else if (target.dataset.webOpen !== undefined) openBrowser(target.dataset.webOpen);
      else if (target.dataset.webClose) closeWebTab(Number(target.dataset.webClose));
      else if (target.dataset.steamSettings !== undefined) openToolWidget('settings');
      else if (steamid) openChat(steamid);
      else if (tool) openToolWidget(tool);
      else if (target.dataset.offline !== undefined) setFriendsState({ offline: !friendsState.offline });
      else if (widget) openWidget(widget);
      else if (url) openUrl(url);
      else if (nextView) setView(nextView);
      else if (achTab) setListState({ tab: achTab });
      else if (achTier !== undefined) setListState({ tier: listState.tier === achTier ? null : achTier });
    });
    wrap.addEventListener('input', event => {
      const { search } = event.target.dataset;
      if (search === 'achievements') setListState({ query: event.target.value });
      else if (search === 'friends') setFriendsState({ query: event.target.value });
      else if (event.target.dataset.backdrop) setBackdrop(event.target.dataset.backdrop, Number(event.target.value));
      else if (event.target.closest('[data-note-field]')) noteEdited();
    });
    wrap.addEventListener('change', event => {
      if (event.target.dataset.notePick !== undefined) pickNote(event.target.value);
    });
    // The bottom fade shows only while more content sits below.
    wrap.addEventListener('scroll', () => updateScrollHint(wrap), { passive: true });

    const list = buildAchList();
    const friendsView = buildFriendsView();
    const tools = {
      remote: buildRemoteView(),
      notes: buildNotesView(),
      controller: buildControllerView(),
      browser: buildBrowserView(),
      settings: buildSettingsView(),
    };
    wrap.append(
      ...Object.values(parts).map(part => part.section),
      list.panel,
      friendsView.panel,
      ...Object.values(tools).map(tool => tool.panel)
    );
    return { wrap, ...parts, list, friendsView, tools };
  };

  // Header: the logo over two rows, beside Time · This session and
  // Total · Last 2 weeks. Body: the rail beside the drawer (the open view).
  const buildCard = () => {
    const card = el('div', 'se-ov-card');
    const logo = img('se-ov-logo');
    logo.loading = 'eager';
    const name = el('div', 'se-ov-name');
    const time = buildTimeCell();
    const session = buildStat('This session');
    const total = buildStat('Total');
    const recent = buildStat('Last 2 weeks');
    card.append(logo, name, time.cell, session, total, recent);

    const overview = buildOverview();
    const tabs = buildTabs();
    const body = el('div', 'se-ov-body');
    const drawer = el('div', 'se-ov-drawer');
    drawer.append(tabs.head, overview.wrap);
    body.append(tabs.rail, drawer, tabs.exit, tabs.back);
    return { card, body, logo, name, time, stats: { session, total, recent }, overview, tabs };
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
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onerror = () => resolve(null);
      image.onload = () => {
        const scale = Math.min(1, SAMPLE_MAX / Math.max(image.naturalWidth, image.naturalHeight));
        const w = Math.max(1, Math.round(image.naturalWidth * scale));
        const h = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h })
          .getContext('2d', { willReadFrequently: true });
        const data = SE.run(() => (ctx.drawImage(image, 0, 0, w, h), ctx.getImageData(0, 0, w, h).data));
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
      image.src = src;
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
  const screenshotsCache = createCache({ ttl: 60_000, retry: 30_000, load: loadScreenshots, onSettled: scheduleRender });
  const guidesCache = createCache({ ttl: 30 * 60_000, retry: 2 * 60_000, load: loadGuides, onSettled: scheduleRender });
  const newsCache = createCache({ ttl: 30 * 60_000, retry: 2 * 60_000, load: loadNews, onSettled: scheduleRender });
  // `loadNotes` is defined further down; resolve it at call time.
  const caches = [achievementsCache, recentCache, screenshotsCache, guidesCache, newsCache];

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

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const formatDate = seconds => (seconds > 0 ? dateFormat.format(seconds * 1000) : '');

  const renderAchievements = (part, appid) => {
    const store = appid ? resolveAchievementStore() : null;
    const data = !appid ? null : store ? achievementsFromStore(store, appid) : achievementsCache.get(appid);
    if (data !== undefined) achData = data;
    const visible = !!data && data.total > 0;
    const signature = visible ? JSON.stringify([data.unlocked, data.total, data.rows]) : '';
    commit(part, visible, signature, body => {
      setText(part.meta, `${data.unlocked} / ${data.total}`);
      const list = el('ul', 'se-ov-ach-list');
      for (const row of data.rows) {
        const item = el('li', 'se-ov-ach');
        // Name and count share a line, so every bar spans the same width.
        const line = el('div', 'se-ov-ach-line');
        line.append(
          el('span', 'se-ov-ach-name', row.name),
          el(
            'span',
            'se-ov-ach-count',
            row.unlockedAt ? formatDate(row.unlockedAt) : `${row.current.toLocaleString()}/${row.max.toLocaleString()}`
          )
        );
        const text = el('div', 'se-ov-ach-text');
        text.append(line);
        if (!row.unlockedAt) text.append(buildBar(row.ratio));
        item.append(achIcon('se-ov-ach-icon', row, !!row.unlockedAt), text);
        list.append(item);
      }
      body.append(buildBar(data.unlocked / data.total));
      if (data.rows.length) body.append(list);
    });
  };

  // Avatar geometry, matching `.se-ov-avatar` and `.se-ov-avatars` in overlay.css.
  const AVATAR = Object.freeze({ size: 34, gap: 12, inset: 8, rows: 2 });

  // As many avatars as fit in two rows of the column. In-game friends come
  // first, then a divider and the recent ones; the rest fold into "+N".
  const renderFriends = (part, inGame, recent, width) => {
    const total = inGame.length + recent.length;
    const perRow = Math.max(1, Math.floor((width - AVATAR.inset + AVATAR.gap) / (AVATAR.size + AVATAR.gap)));
    // In-game friends lead (green ring); no divider, so both rows share columns.
    let capacity = perRow * AVATAR.rows;
    if (total > capacity) capacity -= 1;
    const shownIn = inGame.slice(0, capacity);
    const shownRecent = recent.slice(0, Math.max(0, capacity - shownIn.length));
    const more = total - shownIn.length - shownRecent.length;

    const visible = total > 0;
    const signature = visible ? JSON.stringify([shownIn, shownRecent, more, inGame.length, recent.length]) : '';
    commit(part, visible, signature, body => {
      setText(
        part.meta,
        [inGame.length && `${inGame.length} in-game`, recent.length && `${recent.length} recent`].filter(Boolean).join(' · ')
      );
      const row = el('div', 'se-ov-avatars');
      const avatar = friend => {
        const node = button('se-ov-avatar', { steamid: friend.steamid, status: friend.status });
        if (friend.away) node.dataset.away = '';
        node.title = friend.name;
        node.setAttribute('aria-label', friend.name);
        node.append(img(null, friend.avatar));
        return node;
      };
      row.append(...shownIn.map(avatar));
      row.append(...shownRecent.map(avatar));
      if (more > 0) row.append(el('span', 'se-ov-avatar se-ov-avatar-more', `+${more}`));
      body.append(row);
    });
  };

  const renderScreenshots = (part, data) => {
    const visible = !!data?.shots.length;
    const signature = visible ? JSON.stringify(data) : '';
    commit(part, visible, signature, body => {
      const grid = el('div', 'se-ov-shots');
      for (const shot of data.shots) {
        const tile = button('se-ov-shot', { widget: 'Screenshots' });
        tile.setAttribute('aria-label', `Screenshot from ${formatDate(shot.created)}`);
        tile.append(img(null, shot.url));
        grid.append(tile);
      }
      body.append(grid);
    });
  };

  const renderGuides = (part, appid, guides) => {
    const visible = !!guides?.length;
    const signature = visible ? JSON.stringify([appid, guides]) : '';
    commit(part, visible, signature, body => {
      part.head.querySelector('.se-ov-sec-link').dataset.url = GUIDES_URL(appid);
      const list = el('ul', 'se-ov-guides');
      for (const guide of guides) {
        const item = el('li');
        const row = button('se-ov-guide', { url: GUIDE_URL + guide.id, fav: String(guide.favorite) });
        const icon = el('span', 'se-ov-guide-icon');
        icon.innerHTML = guide.favorite ? ICON.star : ICON.open;
        row.title = guide.title;
        row.append(icon, el('span', 'se-ov-guide-title', guide.title));
        item.append(row);
        list.append(item);
      }
      body.append(list);
    });
  };

  // The newest post as a featured card with its capsule, the rest as rows.
  const renderNews = (part, appid, news) => {
    const visible = !!news?.length;
    const signature = visible ? JSON.stringify([appid, news]) : '';
    commit(part, visible, signature, body => {
      part.head.querySelector('.se-ov-sec-link').dataset.url = NEWS_URL(appid);
      const [lead, ...rest] = news;
      const featured = button('se-ov-news-lead', { url: lead.url });
      featured.append(img('se-ov-news-art', lead.image || HEADER_ART(appid)));
      const kicker = [lead.label, formatDate(lead.time)].filter(Boolean).join(' · ');
      featured.append(el('span', 'se-ov-news-kicker', kicker), el('span', 'se-ov-news-title', lead.title));
      body.append(featured);
      for (const item of rest) {
        const row = button('se-ov-news-row', { url: item.url });
        row.title = item.title;
        const thumb = el('span', 'se-ov-news-thumb');
        if (item.image) thumb.append(img(null, item.image));
        row.append(thumb, el('span', 'se-ov-news-row-title', item.title), el('span', 'se-ov-news-date', formatDate(item.time)));
        body.append(row);
      }
    });
  };

  /* ---------- Views ---------- */

  const VIEWS = Object.freeze([
    { id: 'overview', label: 'Overview' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'friends', label: 'Friends' },
    { id: 'remote', label: 'Remote Play Together' },
    { id: 'notes', label: 'Notes' },
    { id: 'controller', label: 'Controller' },
    { id: 'browser', label: 'Browser' },
    { id: 'settings', label: 'Settings' },
  ]);

  const renderTabs = (tabs, notes) => {
    for (const [id, { tab }] of tabs.tabs) {
      tab.setAttribute('aria-pressed', String(id === view));
      tab.hidden = id === 'achievements' && !achData?.total;
    }
    const current = VIEWS.find(({ id }) => id === view);
    setText(tabs.title, current.label);
    setText(tabs.note, notes[view] || '');
    tabs.rail.dataset.view = view;
  };

  /* ---------- Timer ---------- */

  // A stopwatch kept across overlay openings and restarts (localStorage).
  const TIMER_KEY = 'se-overlay-timer';
  const timer = (() => {
    const read = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(TIMER_KEY));
        if (saved && typeof saved === 'object') return { start: Number(saved.start) || 0, acc: Number(saved.acc) || 0 };
      } catch (_) {}
      return { start: 0, acc: 0 };
    };
    let state = read();
    const save = () => {
      try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(state));
      } catch (_) {}
      scheduleRender();
    };
    return {
      running: () => state.start > 0,
      elapsed: () => state.acc + (state.start ? Date.now() - state.start : 0),
      start() {
        if (!state.start) (state = { ...state, start: Date.now() }), save();
      },
      pause() {
        if (state.start) (state = { start: 0, acc: state.acc + Date.now() - state.start }), save();
      },
      reset() {
        state = { start: 0, acc: 0 };
        save();
      },
    };
  })();

  const clockText = ms => {
    const total = Math.floor(ms / 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  };

  const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const renderTime = part => {
    const elapsed = timer.elapsed();
    const running = timer.running();
    const mode = running ? 'running' : elapsed > 0 ? 'paused' : 'clock';
    if (mode === 'clock') {
      const parts = clockFormat.formatToParts(new Date());
      setText(part.b, parts.filter(x => x.type !== 'dayPeriod').map(x => x.value).join('').trim());
      setText(part.small, parts.find(x => x.type === 'dayPeriod')?.value || '');
      setText(part.label, dayFormat.format(new Date()));
    } else {
      setText(part.b, clockText(elapsed));
      setText(part.small, '');
      setText(part.label, running ? 'Timer' : 'Timer · paused');
    }
    if (part.cell.dataset.mode === mode) return;
    part.cell.dataset.mode = mode;
    part.cell.setAttribute('aria-pressed', String(running));
    part.cell.title = {
      clock: 'Start a timer',
      running: 'Pause the timer (right-click to reset)',
      paused: 'Resume the timer (right-click to reset)',
    }[mode];
  };

  /* ---------- Friends view ---------- */

  const friendsState = { query: '', offline: false };
  const OFFLINE_MAX = 200;

  const setFriendsState = patch => {
    Object.assign(friendsState, patch);
    scheduleRender();
  };

  const gameName = appid => (appid ? SE.run(() => SE.appStore().GetAppOverviewByAppID(appid).display_name) || '' : '');

  // Every friend with what the list shows: status, and what they're playing.
  const allFriends = () =>
    (SE.run(() => friendStore().allFriends) || [])
      .filter(state => !state.is_blocked)
      .map(state => {
        const persona = SE.run(() => state.persona) || {};
        const friend = toFriend(state);
        const appid = Number(persona.m_unGamePlayedAppID) || 0;
        return { ...friend, appid, game: gameName(appid) || persona.m_strGameExtraInfo || '' };
      });

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const friendGroups = (appid, query) => {
    const q = query.trim().toLowerCase();
    const list = allFriends().filter(friend => !q || friend.name.toLowerCase().includes(q));
    const here = list.filter(friend => appid && friend.appid === appid).sort(byName);
    const online = list
      .filter(friend => friend.status !== 'offline' && !here.includes(friend))
      // Playing something first, then online, then away.
      .sort((a, b) => Number(!!b.appid) - Number(!!a.appid) || Number(a.away) - Number(b.away) || byName(a, b));
    const offline = list.filter(friend => friend.status === 'offline').sort(byName);
    return { here, online, offline };
  };

  const statusLine = (friend, appid) => {
    if (friend.appid && friend.appid === appid) return friend.game || 'In this game';
    if (friend.appid || friend.status === 'ingame') return friend.game ? `Playing ${friend.game}` : 'In a game';
    if (friend.status === 'offline') return 'Offline';
    return friend.away ? 'Away' : 'Online';
  };

  const friendRow = (friend, appid) => {
    const row = button('se-ov-friend', { steamid: friend.steamid });
    row.title = `Chat with ${friend.name}`;
    const avatar = el('span', 'se-ov-avatar');
    avatar.dataset.status = friend.status;
    if (friend.away) avatar.dataset.away = '';
    avatar.append(img(null, friend.avatar));
    const text = el('span', 'se-ov-friend-text');
    const status = el('span', 'se-ov-friend-status', statusLine(friend, appid));
    status.dataset.status = friend.appid === appid && appid ? 'here' : friend.status;
    text.append(el('span', 'se-ov-friend-name', friend.name), status);
    row.append(avatar, text, el('span', 'se-ov-friend-chat', 'Chat'));
    return row;
  };

  const renderFriendsView = (part, appid, groups) => {
    const sig = JSON.stringify([
      appid,
      friendsState.offline,
      ...['here', 'online', 'offline'].map(key =>
        groups[key].map(f => [f.steamid, f.status, f.away, f.appid, f.name, f.avatar])
      ),
    ]);
    if (part.sig === sig) return;
    part.sig = sig;
    const fragment = document.createDocumentFragment();
    const group = (label, friends) => {
      if (!friends.length) return;
      fragment.append(el('h3', 'se-ov-friends-group', `${label} · ${friends.length}`));
      for (const friend of friends) fragment.append(friendRow(friend, appid));
    };
    group('In this game', groups.here);
    group('Online', groups.online);
    if (groups.offline.length) {
      const toggle = button('se-ov-friends-more', { offline: '' });
      toggle.setAttribute('aria-expanded', String(friendsState.offline));
      toggle.textContent = `Offline · ${groups.offline.length}`;
      fragment.append(toggle);
      if (friendsState.offline) for (const friend of groups.offline.slice(0, OFFLINE_MAX)) fragment.append(friendRow(friend, appid));
    }
    if (!fragment.childNodes.length) fragment.append(el('p', 'se-ov-achl-empty', 'No friends match.'));
    part.list.replaceChildren(fragment);
  };

  /* ---------- Remote Play, Notes, Controller ---------- */

  const remoteApi = () => contextGlobal('SteamClient')?.RemotePlay || null;
  const remotePlayStatus = () => {
    const store = contextGlobal('RemotePlayStore_SteamUI');
    const streams = SE.run(() => store.remoteClientStreams);
    const guests = Array.isArray(streams) ? streams.length : Number(SE.run(() => streams.size)) || 0;
    return { hosting: !!SE.run(() => store.BIsStreamingRemotePlayTogetherGame()), guests };
  };

  const selfFriend = () => {
    const self = SE.run(() => friendStore().self);
    return self ? toFriend(self) : null;
  };

  let controllerSample = null;
  // Steam Input per game: SteamClient.Apps.SetThirdPartyControllerConfiguration
  // (0 default, 1 forced off, 2 forced on). Steam doesn't expose the current
  // value here, so the switch starts from what the connected controller does.
  const STEAM_INPUT = Object.freeze({ off: 1, on: 2 });
  const padState = { builtIn: null };
  // xbox_controller_support on the app: 0 none, 1 partial, 2 full.
  const SUPPORT_LABEL = Object.freeze({ 0: 'No controller support', 1: 'Partial Xbox support', 2: 'Full Xbox support' });

  const connectedControllers = () => {
    const store = contextGlobal('ControllerStore');
    const list = SE.run(() => Array.from(store.GetControllersSorted() || store.GetControllers() || [])) || [];
    controllerSample = list[0] || null;
    return {
      steamInput: !!SE.run(() => store.BSteamInputEnabledForAnyConnectedController()),
      list: list.map(c => ({
        name:
          String(c?.strName || '').trim() ||
          SE.run(() => store.GetControllerTypeString(c.eControllerType)) ||
          'Controller',
        battery: Number(c?.ucBatteryLevel),
        charging: !!c?.bCharging,
        wireless: !!(c?.bWireless || c?.bBluetooth),
      })),
    };
  };

  const toggleSteamInput = () => {
    const appid = readStats().appid;
    const apps = contextGlobal('SteamClient')?.Apps;
    if (!appid || typeof apps?.SetThirdPartyControllerConfiguration !== 'function') return;
    const builtIn = !(padState.builtIn ?? !connectedControllers().steamInput);
    SE.run(() => apps.SetThirdPartyControllerConfiguration(appid, builtIn ? STEAM_INPUT.off : STEAM_INPUT.on));
    padState.builtIn = builtIn;
    scheduleRender();
  };

  // Steam's Controller window, in this overlay (ShowControllerConfigurator
  // would open the editor in the desktop client instead).
  const openControllerLayout = () => openToolWidget('controller');

  const renderRemoteView = (part, appid) => {
    const me = selfFriend();
    const status = remotePlayStatus();
    if (me) {
      if (part.hostAvatar.dataset.src !== me.avatar) {
        part.hostAvatar.dataset.src = me.avatar;
        part.hostAvatar.replaceChildren(img(null, me.avatar));
      }
      setText(part.hostName, me.name);
    }
    setText(part.hostStatus, status.hosting ? `Hosting · ${status.guests} guest${status.guests === 1 ? '' : 's'}` : 'Not hosting yet');

    const canInvite = SE.run(() => remoteApi().BCanCreateInviteForGame(String(appid), false));
    setText(part.notice, canInvite === false ? "This game can't be shared over Remote Play Together." : '');
    part.notice.hidden = canInvite !== false;
  };

  const renderControllerView = (part, appid) => {
    const pads = connectedControllers();
    const builtIn = padState.builtIn ?? !pads.steamInput;
    const level = Number(SE.run(() => overviewOf(appid).xbox_controller_support));
    const sig = JSON.stringify([pads, builtIn, level]);
    if (part.sig === sig) return;
    part.sig = sig;
    part.toggle.setAttribute('aria-checked', String(builtIn));
    setText(
      part.desc,
      builtIn
        ? 'Steam Input is off: the game reads your controller directly.'
        : 'Steam Input is on: Steam translates your controller for the game.'
    );
    const chip = (text, good) => {
      const node = el('span', 'se-ov-chip', text);
      node.dataset.good = String(good);
      return node;
    };
    part.support.replaceChildren(
      chip(SUPPORT_LABEL[level] || 'Support not listed', level >= 1),
      chip(builtIn ? 'Using game support' : 'Using Steam Input', true)
    );
    part.pads.replaceChildren(
      ...(pads.list.length
        ? pads.list.map(pad => {
            const parts = [pad.wireless ? 'Wireless' : 'Wired'];
            if (Number.isFinite(pad.battery) && pad.battery > 0 && pad.battery <= 100) {
              parts.push(`${pad.battery}%${pad.charging ? ' · charging' : ''}`);
            }
            return toolRow(pad.name, parts.join(' · '));
          })
        : [el('p', 'se-ov-tool-text', 'No controller connected.')])
    );
  };

  const toolRow = (label, value) => {
    const row = el('div', 'se-ov-tool-row');
    row.append(el('span', 'se-ov-tool-label', label), el('span', 'se-ov-tool-value', value));
    return row;
  };

  const renderToolViews = (tools, appid) => {
    if (view === 'remote') renderRemoteView(tools.remote, appid);
    if (view === 'controller') renderControllerView(tools.controller, appid);
    if (view === 'browser') renderBrowserView(tools.browser, appid);
    if (view === 'settings') renderSettingsView(tools.settings);
  };

  /* ---------- Notes ---------- */

  // Steam's notes store: the GameNotesCloudStore singleton (`.Get()` on its
  // class), the one Steam's Notes widget reads through React context. Its
  // calls, as the widget uses them:
  //   GetGameNotesList({ appid }) -> [{ id, appid, ordinal, time_created,
  //                                     time_modified, title, content (BBCode) }]
  //   SaveGameNotes({ appid }, notes) -> EResult; the whole list is written
  //     to the cloud file notes_<appid>
  //   NewNote({ appid }, title) -> a new, unsaved note
  const EOK_SAVE = 1;
  const SAVE_DELAY_MS = 900;
  const NOTE_TITLE_MAX = 60;
  const notes = { appid: 0, list: null, activeId: null, status: '', readOnly: false, loading: false, error: null };
  let notesStoreRef = null;
  let saveTimer = 0;
  let pendingSave = null;

  const isNotesStore = value =>
    !!value &&
    typeof value.GetGameNotesList === 'function' &&
    typeof value.SaveGameNotes === 'function' &&
    typeof value.NewNote === 'function';

  const resolveNotesClass = () =>
    SE.findModule('overlay:notes-store', (src, id, req) =>
      exportOf(
        src,
        id,
        req,
        ['GameNotesCloudStore', 'GetGameNotesList'],
        value => typeof value?.Get === 'function' && typeof value.prototype?.GetGameNotesList === 'function'
      )
    );

  const notesStore = () => {
    if (isNotesStore(notesStoreRef)) return notesStoreRef;
    const store = SE.run(() => resolveNotesClass()?.Get());
    notesStoreRef = isNotesStore(store) ? store : null;
    return notesStoreRef;
  };

  const noteKey = appid => ({ appid });
  const savedOk = result => result === EOK_SAVE || result === true;

  // BBCode <-> the editor's HTML, for the tags the editor can write. A note
  // using anything else opens read-only, so saving can never drop content.
  const NOTE_TAGS = Object.freeze({ p: 'p', b: 'b', i: 'i', u: 'u', strike: 's', s: 's', code: 'code', url: 'a' });
  const FORMAT_TOOLS = Object.freeze([
    ['bold', 'Bold', '<b>B</b>'],
    ['italic', 'Italic', '<i>I</i>'],
    ['underline', 'Underline', '<u>U</u>'],
    ['strikeThrough', 'Strikethrough', '<s>S</s>'],
    ['code', 'Code', '<span class="se-ov-format-code">&lt;/&gt;</span>'],
  ]);

  const unsupportedTags = bbcode =>
    [...String(bbcode).matchAll(/\[\/?([a-z0-9*]+)/gi)].map(m => m[1].toLowerCase()).filter(tag => !(tag in NOTE_TAGS));

  const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const bbToHtml = bbcode => {
    const html = escapeHtml(String(bbcode || ''))
      .replace(/\[url=([^\]]+)\]/gi, (_, href) => `<a href="${href}">`)
      .replace(/\[\/url\]/gi, '</a>')
      .replace(/\[(\/?)(p|b|i|u|strike|s|code)\]/gi, (_, close, tag) => `<${close}${NOTE_TAGS[tag.toLowerCase()]}>`);
    return /<p>/i.test(html) ? html : html.split('\n').map(line => `<p>${line}</p>`).join('');
  };

  const BB_FOR = Object.freeze({ B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 'strike', STRIKE: 'strike', DEL: 'strike', CODE: 'code' });

  const htmlToBb = root => {
    const walk = node => {
      if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
      if (node.nodeType !== 1) return '';
      const inner = [...node.childNodes].map(walk).join('');
      const tag = node.tagName;
      if (tag === 'BR') return '\n';
      if (BB_FOR[tag]) return inner ? `[${BB_FOR[tag]}]${inner}[/${BB_FOR[tag]}]` : '';
      if (tag === 'A') return `[url=${node.getAttribute('href') || ''}]${inner}[/url]`;
      return inner;
    };
    // Each block (or line) is one paragraph, as Steam's editor writes them.
    const blocks = [];
    let line = '';
    for (const child of root.childNodes) {
      if (child.nodeType === 1 && /^(P|DIV|H\d|LI)$/.test(child.tagName)) {
        if (line) blocks.push(line), (line = '');
        blocks.push(walk(child));
      } else line += walk(child);
    }
    if (line) blocks.push(line);
    return blocks
      .flatMap(block => block.split('\n'))
      .map(text => `[p]${text}[/p]`)
      .join('');
  };

  const activeNote = () => notes.list?.find(note => note.id === notes.activeId) || null;

  const loadNotesFor = async appid => {
    const store = notesStore();
    if (!store) {
      notes.error = 'store';
      return scheduleRender();
    }
    notes.loading = true;
    try {
      const list = (await store.GetGameNotesList(noteKey(appid))) || [];
      if (notes.appid !== appid) return;
      notes.list = [...list].sort((a, b) => (b.time_modified || 0) - (a.time_modified || 0));
      notes.error = null;
      if (!activeNote()) notes.activeId = notes.list[0]?.id ?? null;
    } catch (err) {
      notes.error = String(err?.message || err);
    } finally {
      notes.loading = false;
      scheduleRender();
    }
  };

  // Write the whole list back, with this note replaced (or added), from a fresh
  // read, the way Steam's own widget saves.
  const writeNote = async (appid, note) => {
    const store = notesStore();
    const fresh = (await store.GetGameNotesList(noteKey(appid))) || [];
    const next = fresh.some(n => n.id === note.id) ? fresh.map(n => (n.id === note.id ? note : n)) : [...fresh, note];
    const result = await store.SaveGameNotes(noteKey(appid), next);
    if (!savedOk(result)) throw new Error(`EResult ${result}`);
    return next;
  };

  const flushSave = async () => {
    clearTimeout(saveTimer);
    const job = pendingSave;
    pendingSave = null;
    if (!job) return;
    notes.status = 'Saving…';
    scheduleRender();
    try {
      const saved = await writeNote(job.appid, job.note);
      if (notes.appid === job.appid) {
        notes.list = notes.list.map(n => (n.id === job.note.id ? job.note : n));
        if (!notes.list.some(n => n.id === job.note.id)) notes.list = [job.note, ...notes.list];
      }
      notes.status = saved ? 'Saved to Steam Cloud' : '';
    } catch (err) {
      notes.status = "Couldn't save. Your text is still here; try again.";
      console.warn('[Steam Enhanced overlay] note save failed', err);
    }
    scheduleRender();
  };

  const noteEdited = () => {
    const part = ui?.overview.tools.notes;
    const note = activeNote();
    if (!part || !note || notes.readOnly) return;
    // Like Steam's editor: the note's title is its first line.
    const firstLine = (part.editor.innerText || '').split('\n').map(line => line.trim()).find(Boolean) || '';
    const title = firstLine.slice(0, NOTE_TITLE_MAX) || 'Untitled Note';
    const content = htmlToBb(part.editor);
    const updated = { ...note, title, content, time_modified: Math.floor(Date.now() / 1000) };
    delete updated.not_persisted;
    pendingSave = { appid: notes.appid, note: updated };
    notes.status = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
    // Keep the picker's label in step with the title.
    const option = [...part.picker.options].find(o => o.value === note.id);
    if (option && option.textContent !== title) option.textContent = title;
    scheduleRender();
  };

  const showNote = (part, note) => {
    notes.readOnly = !!note && unsupportedTags(note.content).length > 0;
    part.editor.innerHTML = note ? bbToHtml(note.content) : '';
    part.editor.contentEditable = String(!!note && !notes.readOnly);
    part.editor.dataset.readonly = String(notes.readOnly);
    notes.status = notes.readOnly ? 'This note uses formatting only Steam’s editor can change.' : '';
  };

  const pickNote = async id => {
    await flushSave();
    notes.activeId = id;
    const part = ui?.overview.tools.notes;
    if (part) showNote(part, activeNote());
    scheduleRender();
  };

  const newNote = async () => {
    const store = notesStore();
    if (!store || !notes.appid) return;
    await flushSave();
    const note = SE.run(() => store.NewNote(noteKey(notes.appid), 'Untitled Note'));
    if (!note) return;
    const fresh = { ...note, title: note.title || 'Untitled Note', content: note.content || '', time_modified: Math.floor(Date.now() / 1000) };
    delete fresh.not_persisted;
    notes.list = [fresh, ...(notes.list || [])];
    notes.activeId = fresh.id;
    const part = ui?.overview.tools.notes;
    if (part) {
      part.listSig = '';
      showNote(part, fresh);
      requestAnimationFrame(() => part.editor.focus());
    }
    pendingSave = { appid: notes.appid, note: fresh };
    await flushSave();
  };

  const askDeleteNote = show => {
    const part = ui?.overview.tools.notes;
    if (part) part.confirm.hidden = !show || !activeNote();
  };

  const deleteNote = async () => {
    const store = notesStore();
    const note = activeNote();
    askDeleteNote(false);
    if (!store || !note) return;
    clearTimeout(saveTimer);
    pendingSave = null;
    try {
      const fresh = (await store.GetGameNotesList(noteKey(notes.appid))) || [];
      const result = await store.SaveGameNotes(noteKey(notes.appid), fresh.filter(n => n.id !== note.id));
      if (!savedOk(result)) throw new Error(`EResult ${result}`);
      notes.list = notes.list.filter(n => n.id !== note.id);
      notes.activeId = notes.list[0]?.id ?? null;
      notes.status = 'Note deleted';
      const part = ui?.overview.tools.notes;
      if (part) (part.listSig = ''), showNote(part, activeNote());
    } catch (err) {
      notes.status = "Couldn't delete the note.";
      console.warn('[Steam Enhanced overlay] note delete failed', err);
    }
    scheduleRender();
  };

  const formatNote = command => {
    const part = ui?.overview.tools.notes;
    if (!part || notes.readOnly || !activeNote()) return;
    part.editor.focus();
    if (command === 'code') {
      const selection = getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const code = document.createElement('code');
      code.append(range.extractContents());
      range.insertNode(code);
    } else {
      document.execCommand(command);
    }
    noteEdited();
  };

  const renderNotesView = (part, appid) => {
    if (notes.appid !== appid) {
      Object.assign(notes, { appid, list: null, activeId: null, status: '', error: null });
      part.listSig = '';
      if (appid) loadNotesFor(appid);
    } else if (!notes.list && !notes.loading && !notes.error && appid) loadNotesFor(appid);

    const list = notes.list || [];
    const sig = JSON.stringify([appid, notes.activeId, list.map(n => [n.id, n.title])]);
    if (part.listSig !== sig) {
      const first = !part.listSig;
      part.listSig = sig;
      part.picker.replaceChildren(
        ...list.map(note => {
          const option = el('option', null, note.title || 'Untitled Note');
          option.value = note.id;
          option.selected = note.id === notes.activeId;
          return option;
        })
      );
      // Fill the editor when the note changes, never while typing.
      if (first || part.editor.dataset.noteId !== String(notes.activeId)) {
        part.editor.dataset.noteId = String(notes.activeId);
        showNote(part, activeNote());
      }
    }
    const ready = !!notesStore() && !!notes.list;
    const hasNote = !!activeNote();
    part.picker.disabled = !list.length;
    part.add.disabled = !ready;
    part.remove.disabled = !hasNote;
    for (const node of [part.tools, part.editor]) node.hidden = !hasNote;
    part.empty.hidden = hasNote;
    setText(
      part.empty,
      notes.error === 'store'
        ? 'Steam’s notes aren’t available here. Use Steam’s editor instead.'
        : notes.error
          ? 'Couldn’t load your notes.'
          : !notes.list
            ? 'Loading notes…'
            : 'No notes for this game yet. Press + New to start one.'
    );
    setText(part.status, notes.status);
  };

  /* ---------- Browser ---------- */

  // The overlay browser's tabs: DesktopOverlay.web_requests
  // ([{ requestid, strURL }]), opened with AddWebPageRequest and closed with
  // RemoveWebPageRequest(requestid); its window id is "Browser".
  const webTabs = () =>
    (SE.run(() => Array.from(desktopOverlay().web_requests || [])) || []).map(tab => ({
      id: Number(tab.requestid),
      url: String(tab.strURL || ''),
    }));

  const openBrowser = () =>
    openToolWidget('browser') || SE.run(() => desktopOverlay().SetWindowVisibility(WIDGET.browser, 1));

  const closeWebTab = id => {
    SE.run(() => desktopOverlay().RemoveWebPageRequest(id));
    scheduleRender();
  };

  // A typed address opens as typed (https:// added); anything else searches.
  const addressUrl = text => {
    const value = text.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) return `https://${value}`;
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  };

  const gameLinks = appid => [
    ['Store page', `https://store.steampowered.com/app/${appid}/`],
    ['Community hub', `https://steamcommunity.com/app/${appid}/`],
    ['Discussions', `https://steamcommunity.com/app/${appid}/discussions/`],
    ['Guides', GUIDES_URL(appid)],
    ['News', NEWS_URL(appid)],
  ];

  const tabLabel = url => {
    try {
      const u = new URL(url);
      return { host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') || '/' };
    } catch (_) {
      return { host: url, path: '' };
    }
  };

  const renderBrowserView = (part, appid) => {
    const linksSig = String(appid);
    if (part.linksSig !== linksSig) {
      part.linksSig = linksSig;
      part.links.replaceChildren(
        ...(appid ? gameLinks(appid) : []).map(([label, url]) => {
          const link = button('se-ov-chip-btn', { url });
          link.textContent = label;
          return link;
        })
      );
    }
    const tabs = webTabs();
    const tabsSig = JSON.stringify(tabs);
    if (part.tabsSig === tabsSig) return;
    part.tabsSig = tabsSig;
    part.tabs.replaceChildren(
      ...(tabs.length
        ? tabs.map(tab => {
            const { host, path } = tabLabel(tab.url);
            const row = el('div', 'se-ov-web-tab');
            const open = button('se-ov-web-open', { webOpen: '' });
            open.title = tab.url;
            const badge = el('span', 'se-ov-web-badge', host.charAt(0).toUpperCase());
            const text = el('span', 'se-ov-friend-text');
            text.append(el('span', 'se-ov-friend-name', host), el('span', 'se-ov-friend-status', path));
            open.append(badge, text);
            const close = button('se-ov-web-close', { webClose: String(tab.id) });
            close.setAttribute('aria-label', `Close ${host}`);
            close.innerHTML = ICON.close;
            row.append(open, close);
            return row;
          })
        : [el('p', 'se-ov-tool-text', 'No open tabs.')])
    );
  };

  /* ---------- Settings ---------- */

  // Backdrop darkness: a CSS variable on this window, kept per user
  // in localStorage. Slider values are in `unit`; `toCss` maps them to the
  // variable (stored as --se-overlay-dim, 0.4-1.4). The backdrop's edges reach
  // full black at 100%; past it the lighter centre darkens too, until 140%
  // hides the game entirely (alphas over 1 clamp).
  const BACKDROP = Object.freeze({
    dim: {
      label: 'Darkness',
      cssVar: '--se-overlay-dim',
      storageKey: 'se-overlay-dim',
      min: 40,
      max: 140,
      fallback: 120,
      unit: '%',
      toCss: value => String(value / 100),
      fromStored: stored => stored * 100,
      toStored: value => value / 100,
    },
  });

  const readBackdrop = key => {
    const spec = BACKDROP[key];
    try {
      const raw = localStorage.getItem(spec.storageKey);
      const value = raw === null ? NaN : Math.round(spec.fromStored(Number(raw)));
      if (value >= spec.min && value <= spec.max) return value;
    } catch (_) {}
    return null;
  };

  const applyBackdrop = (key, value) =>
    SE.cssVar(root, BACKDROP[key].cssVar, value == null ? null : BACKDROP[key].toCss(value));

  const applyBackdrops = (clear = false) => {
    for (const key of Object.keys(BACKDROP)) applyBackdrop(key, clear ? null : readBackdrop(key));
  };

  const setBackdrop = (key, raw) => {
    const spec = BACKDROP[key];
    if (!spec || !Number.isFinite(raw)) return;
    const value = Math.min(spec.max, Math.max(spec.min, Math.round(raw)));
    applyBackdrop(key, value);
    try {
      localStorage.setItem(spec.storageKey, String(spec.toStored(value)));
    } catch (_) {}
    scheduleRender();
  };

  const renderSettingsView = part => {
    for (const [key, spec] of Object.entries(BACKDROP)) {
      const { range, value } = part.sliders[key];
      const current = readBackdrop(key) ?? spec.fallback;
      if (document.activeElement !== range) range.value = String(current);
      setText(value, `${current}${spec.unit}`);
    }
  };

  /* ---------- Achievements list view ---------- */

  const VIEW_ATTR = 'data-se-ov-view';
  const listState = { tab: null, query: '', tier: null };
  let view = 'overview';
  let achData = null;

  // A view that has nothing to show (a game without achievements) falls back
  // to the overview.
  const setView = next => {
    const known = VIEWS.some(({ id }) => id === next);
    const target = !known || (next === 'achievements' && !achData?.total) ? 'overview' : next;
    if (target === view) return;
    view = target;
    if (ui) {
      SE.attr(ui.overview.wrap, VIEW_ATTR, view === 'overview' ? null : view);
      ui.overview.wrap.scrollTop = 0;
    }
    scheduleRender();
  };

  const setListState = patch => {
    Object.assign(listState, patch);
    if (ui) renderAchList(ui.overview.list, achData);
  };

  const byNewest = (a, b) => b.unlockedAt - a.unlockedAt;
  const byEasiest = (a, b) => (b.pct ?? -1) - (a.pct ?? -1);
  const byClosest = (a, b) => b.progress.ratio - a.progress.ratio;

  // Tab contents: closest first, newest unlock first, easiest locked first.
  const tabItems = (items, tab) => {
    switch (tab) {
      case 'progress':
        return items.filter(item => item.progress).sort(byClosest);
      case 'unlocked':
        return items.filter(item => item.achieved).sort(byNewest);
      default:
        return items.filter(item => !item.achieved).sort(byEasiest);
    }
  };

  const tierCounts = items =>
    SE.rarity.TIERS.map(tier => {
      const all = items.filter(item => tierOf(item.pct) === tier);
      return { tier, total: all.length, unlocked: all.filter(item => item.achieved).length };
    }).filter(count => count.total);

  const buildAchRow = item => {
    const row = el('li', 'se-ov-achl-row');
    if (!item.achieved) row.dataset.locked = '';
    const text = el('div', 'se-ov-achl-text');
    const line = el('div', 'se-ov-achl-line');
    const right = item.progress
      ? `${item.progress.current.toLocaleString()}/${item.progress.max.toLocaleString()}`
      : item.achieved
        ? formatDate(item.unlockedAt)
        : '';
    // Name, then the rarity pill and the date or count, on one line.
    line.append(el('span', 'se-ov-achl-name', item.name));
    const tier = tierOf(item.pct);
    if (tier) {
      const pill = el('span', 'se-ov-achl-pill', `${tier.name} · ${fmtPct(item.pct)}%`);
      pill.dataset.seTier = tier.id;
      line.append(pill);
    }
    if (right) line.append(el('span', 'se-ov-achl-when', right));
    text.append(line, el('span', 'se-ov-achl-desc', item.desc));
    if (item.progress) text.append(buildBar(item.progress.ratio));
    row.append(achIcon('se-ov-achl-icon', item, item.achieved), text);
    return row;
  };

  const renderAchList = (part, data) => {
    if (!data?.total) return;
    const items = data.items;
    const counts = {
      progress: items.filter(item => item.progress).length,
      unlocked: data.unlocked,
      locked: data.total - data.unlocked,
    };
    // Open on In progress when anything is, else on the unlocks.
    if (!listState.tab || (listState.tab === 'progress' && !counts.progress)) {
      listState.tab = counts.progress ? 'progress' : 'unlocked';
    }

    part.bar.firstChild.style.width = `${((data.unlocked / data.total) * 100).toFixed(1)}%`;

    for (const { id, label } of ACH_TABS) {
      const tab = part.tabButtons.get(id);
      const count = counts[id];
      setText(tab, count === undefined ? label : `${label} · ${count}`);
      tab.hidden = id === 'progress' && !counts.progress;
      tab.setAttribute('aria-selected', String(listState.tab === id));
    }

    const tiers = tierCounts(items);
    const chipsSig = JSON.stringify([tiers.map(c => [c.tier.id, c.unlocked, c.total]), listState.tier]);
    if (part.chipsSig !== chipsSig) {
      part.chipsSig = chipsSig;
      part.chips.hidden = !tiers.length;
      part.chips.replaceChildren(
        ...tiers.map(({ tier, unlocked, total }) => {
          const chip = button('se-ov-achl-chip', { achTier: tier.id, seTier: tier.id });
          chip.setAttribute('aria-pressed', String(listState.tier === tier.id));
          chip.title = `${tier.name}: ${unlocked} of ${total} unlocked`;
          chip.append(el('i'), el('span', null, tier.name), el('b', null, `${unlocked}/${total}`));
          return chip;
        })
      );
    }

    const query = listState.query.trim().toLowerCase();
    const rowsSig = [data.items.length, data.unlocked, items.reduce((n, i) => n + (i.progress?.current || 0), 0), listState.tab, listState.tier, query].join('|');
    if (part.rowsSig === rowsSig) return;
    part.rowsSig = rowsSig;
    let shown = tabItems(items, listState.tab);
    if (listState.tier) shown = shown.filter(item => tierOf(item.pct)?.id === listState.tier);
    if (query) shown = shown.filter(item => `${item.name} ${item.desc}`.toLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    for (const item of shown) fragment.append(buildAchRow(item));
    part.list.replaceChildren(fragment);
    part.list.scrollTop = 0;
    part.empty.hidden = shown.length > 0;
    setText(part.empty, query || listState.tier ? 'No achievements match.' : 'Nothing here yet.');
  };

  // A box's width inside its padding (the wrap pads for clipped effects).
  const contentWidth = node => {
    const style = getComputedStyle(node);
    return node.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  };

  const renderOverview = (overview, appid) => {
    renderAchievements(overview.achievements, appid);
    if (achData?.total) renderAchList(overview.list, achData);
    else if (view === 'achievements') setView('overview');
    if (view === 'friends') renderFriendsView(overview.friendsView, appid, friendGroups(appid, friendsState.query));
    renderToolViews(overview.tools, appid);
    if (view === 'notes') renderNotesView(overview.tools.notes, appid);
    renderFriends(
      overview.friends,
      appid ? friendsInGame(appid) : [],
      appid ? friendsPlayedRecently(appid, recentCache.get(appid)) : [],
      contentWidth(overview.wrap)
    );
    renderScreenshots(overview.screenshots, appid ? screenshotsCache.get(appid) : null);
    renderGuides(overview.guides, appid, appid ? guidesCache.get(appid) : null);
    renderNews(overview.news, appid, appid ? newsCache.get(appid) : null);
  };

  /* ---------- Fit to the screen ---------- */

  const BOTTOM_GAP = 32;
  const FIT_MIN = 160;

  const updateScrollHint = wrap => {
    const more = wrap.scrollHeight - wrap.clientHeight - wrap.scrollTop > 1;
    SE.attr(wrap, SCROLL_ATTR, more ? '' : null);
  };

  // The rail and drawer take the height left under the header, and the open
  // view scrolls inside the drawer, so the column never runs off the screen.
  const fitOverview = (body, wrap) => {
    const bodyTop = body.getBoundingClientRect().top;
    const bottom = Math.max(bodyTop + FIT_MIN, innerHeight - BOTTOM_GAP);
    SE.cssVar(body, '--se-ov-body-h', `${Math.floor(bottom - bodyTop)}px`);
    const top = wrap.getBoundingClientRect().top;
    SE.cssVar(wrap, '--se-ov-avail', `${Math.max(FIT_MIN, Math.floor(bottom - top))}px`);
    updateScrollHint(wrap);
  };

  const render = () => {
    const host = document.querySelector(SEL.timeStats);
    if (!host) return;
    ui ||= buildCard();
    // React may replace the host; re-attach on the next tick when it does.
    if (ui.card.parentNode !== host) host.prepend(ui.card);
    if (ui.body.parentNode !== host) host.append(ui.body);

    const stats = readStats();
    const nativeLogo = document.querySelector(SEL.logo);
    const src = nativeLogo?.currentSrc || nativeLogo?.src || '';
    if (src && ui.logo.getAttribute('src') !== src) {
      ui.logo.src = src;
      applyTrim(ui.logo, src);
    }
    SE.attr(ui.logo, 'hidden', src ? null : '');
    SE.attr(ui.name, 'hidden', src || !stats.name ? '' : null);
    setText(ui.name, stats.name);
    // Only hide Steam's centred logo once ours has taken its place.
    SE.attr(root, LOGO_ATTR, src ? '' : null);

    setStat(ui.stats.session, stats.session);
    setStat(ui.stats.total, stats.total);
    setStat(ui.stats.recent, stats.recent);
    renderTime(ui.time);

    renderOverview(ui.overview, stats.appid);
    syncToolbar();
    const inGame = stats.appid ? friendsInGame(stats.appid).length : 0;
    const online = (SE.run(() => friendStore().allFriends) || []).filter(f => SE.run(() => f.persona.is_online)).length;
    renderTabs(ui.tabs, {
      achievements: achData?.total ? `${achData.unlocked} / ${achData.total} · ${Math.round((achData.unlocked / achData.total) * 100)}%` : '',
      friends: [inGame && `${inGame} in game`, `${online} online`].filter(Boolean).join(' · '),
    });
    fitOverview(ui.body, ui.overview.wrap);
  };

  const teardown = () => {
    ui?.card.remove();
    ui?.body.remove();
    for (const replaced of replacedButtons) replaced.release();
    view = 'overview';
    SE.attr(ui?.overview.wrap, VIEW_ATTR, null);
    SE.attr(root, LOGO_ATTR, null);
  };

  function sync() {
    const on = enabled();
    SE.attr(root, ATTR, on ? '' : null);
    if (on) SE.run(render);
    else teardown();
  }

  // The overlay window exists (hidden) from game launch, but SE.poll pauses
  // while it's hidden. Warm every cache on a slow timer meanwhile, so the
  // column is filled the moment the overlay opens. Hidden-tab timers are
  // throttled by the browser; this only needs to run now and then.
  const PREFETCH_MS = 20_000;

  const prefetch = () => {
    if (!enabled()) return;
    const appid = readStats().appid;
    if (!appid) return;
    achievementsCache.get(appid);
    recentCache.get(appid);
    screenshotsCache.get(appid);
    guidesCache.get(appid);
    newsCache.get(appid);
    SE.run(checkNewScreenshot);
  };

  // Unlocks made while playing should show as soon as the overlay opens.
  const onVisibility = () => {
    // The overlay opens on the overview each time.
    if (document.visibilityState !== 'visible') {
      flushSave();
      return setView('overview');
    }
    achievementsCache.expire();
    SE.run(checkNewScreenshot);
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', scheduleRender);

  applyBackdrops();
  sync();
  const loop = SE.poll(sync, TICK_MS);
  const windowLoop = SE.poll(() => enabled() && centerWidgets(), WINDOW_TICK_MS);
  const prefetchTimer = setInterval(() => SE.run(prefetch), PREFETCH_MS);
  SE.run(prefetch);

  // Method and field names of the stores the next views would use.
  const namesOf = obj => {
    const names = new Set();
    for (let p = obj, depth = 0; p && p !== Object.prototype && depth < 4; p = Object.getPrototypeOf(p), depth++) {
      for (const name of Object.getOwnPropertyNames(p)) names.add(name);
    }
    return [...names].filter(name => name !== 'constructor').slice(0, 150);
  };
  // An object's names plus, for each array field, the fields of its first item
  // (e.g. a chat's message list).
  const shapeOf = obj => {
    if (!obj) return null;
    const arrays = {};
    for (const name of namesOf(obj)) {
      const value = SE.run(() => obj[name]);
      const first = Array.isArray(value) ? value[0] : null;
      if (first && typeof first === 'object') arrays[name] = namesOf(first).slice(0, 40);
    }
    return { names: namesOf(obj), arrays };
  };

  // Identifiers mentioning notes in Steam's code: method and store names survive minifying.
  const noteNames = () => {
    const found = new Set();
    for (const req of SE.requires()) {
      for (const id of Object.keys(req.m || {})) {
        const src = SE.run(() => Function.prototype.toString.call(req.m[id])) || '';
        if (!/Notes?/.test(src)) continue;
        for (const [name] of src.matchAll(/\b[A-Za-z_]*Notes?[A-Za-z_]*\b/g)) {
          if (name.length > 5 && found.size < 120) found.add(name);
        }
      }
    }
    return [...found];
  };

  const discover = () => {
    const win = contextWindows()[0];
    return {
      remotePlay: shapeOf(SE.run(() => win.RemotePlayStore_SteamUI)),
      controllerConfigurator: namesOf(SE.run(() => win.controllerConfiguratorStore)),
      controller: namesOf(SE.run(() => win.ControllerStore)),
      notes: noteNames(),
    };
  };

  // `__seOverlay.debug()` in the SP Overlay DevTools: what each section has
  // and why a hidden one is empty.
  const debug = () => {
    const appid = readStats().appid;
    const report = {
      appid,
      achievements: resolveAchievementStore() ? 'AchievementStore' : achievementsCache.inspect(appid),
      friendsInGame: appid ? friendsInGame(appid).length : 0,
      recentPlayers: { ...recentCache.inspect(appid), missingParts: resolveGameplayApi.missing() },
      screenshots: {
        ...screenshotsCache.inspect(appid),
        methods: Object.keys(screenshotsApi() || {}),
        sampleFields: shotSample ? Object.keys(shotSample) : null,
        sampleAppId: shotSample ? shotAppId(shotSample) : null,
        sampleUrl: shotSample ? shotUrl(shotSample) : null,
      },
      guides: {
        ...guidesCache.inspect(appid),
        serviceError: guidesServiceError,
        serviceResults: guidesRaw,
        missingParts: resolveGuidesApi.missing(),
      },
      news: newsCache.inspect(appid),
      // For the Remote Play, Notes and Controller views.
      toolbar: [...document.querySelectorAll(SEL.toolbarButton)].map(b => [...b.classList].filter(c => /^[A-Z]/.test(c) && c !== 'ToolbarButton' && c !== 'DialogButton')),
      toolButtons: Object.fromEntries(Object.entries(toolButtons).map(([id, t]) => [id, !!t.current()])),
      discovery: discover(),
      notes: { store: !!notesStore(), state: { ...notes, list: notes.list?.length ?? null } },
      controllerSample: controllerSample && namesOf(controllerSample),
      windows: windowsDebug(),
    };
    console.log('[Steam Enhanced overlay]', report);
    return report;
  };

  window.__seOverlay = {
    debug,
    destroy() {
      loop.disconnect();
      windowLoop.disconnect();
      clearInterval(prefetchTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', scheduleRender);
      teardown();
      applyBackdrops(true);
      for (const cache of caches) cache.clear();
      ui = null;
      instance = null;
      SE.attr(root, ATTR, null);
    },
  };
});
