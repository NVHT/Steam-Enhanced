/*
 * Overlay: the data each section shows: achievements, friends, screenshots, guides, news.
 *
 * Part of client/overlay/ (see context.js).
 */
((SE) => {
  const ns = window.__seOverlayParts;
  if (!ns) return;
  const { LOAD_TIMEOUT_MS, accountIdOf, callService, contextGlobal, contextWindows, defineApi, exportOf, requestPart, selfSteamId, servicePart } = ns;
  const { live } = ns;

  /* ---------- Achievements ---------- */

  const ACH_ROWS = 2;
  const EOK = 1;
  const ACH_TABS = Object.freeze([
    { id: 'progress', label: 'In progress' },
    { id: 'unlocked', label: 'Unlocked' },
    { id: 'locked', label: 'Locked' },
  ]);

  // Same maths as Steam's own progress bars: current / max, from zero.
  const progressOf = (a) => Math.min(1, Math.max(0, Math.min(a.flCurrentProgress, a.flMaxProgress) / a.flMaxProgress));
  const hasProgress = (a) => a.flMaxProgress > 1 && a.flCurrentProgress > 0;

  // Every achievement, normalized for the list view. Locked hidden ones keep
  // their secret, as in Steam. `pct` is the global unlock rate (rarity tier).
  const toItem = (a) => {
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

  const summarizeAchievements = (list) => {
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
      exportOf(src, id, req, ['GetMyAchievementsForApp', 'm_mapMyAchievements'], (value) => typeof value?.GetMyAchievements === 'function')
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
  const loadAchievements = async (appid) => {
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

  const loadRecentPlayers = async (appid) => {
    const body = await callService(resolveGameplayApi, 'GetFriendsGameplayInfo', 'Request', (req) => req.set_appid(appid));
    return [...(body.in_game || []), ...(body.played_recently || [])]
      .map(entry => ({ steamid: String(entry.steamid), minutes: Number(entry.minutes_played) || 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  };

  const friendStore = () => contextGlobal('friendStore');

  // Same states as the theme's friend rings: in game, online, offline, plus
  // away / snooze (drawn dashed).
  const toFriend = (state) => {
    const persona = SE.run(() => state.persona) || {};
    return {
      steamid: String(state.steamid64),
      name: state.display_name || persona.m_strPlayerName || '',
      avatar: persona.avatar_url_medium || '',
      status: persona.is_ingame ? 'ingame' : persona.is_online ? 'online' : 'offline',
      away: !!persona.is_online && !!persona.is_awayOrSnooze,
    };
  };

  const friendsInGame = (appid) =>
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
  const shotAppId = (shot) => Number(shot?.nAppID ?? shot?.unAppID ?? shot?.appid ?? shot?.strGameID) || 0;
  const shotUrl = (shot) =>
    (typeof shot?.strUrl === 'string' && shot.strUrl) ||
    Object.values(shot || {}).find(value => typeof value === 'string' && URL_RE.test(value)) ||
    '';
  const shotTime = (shot) => Number(shot?.nCreated ?? shot?.rtCreated ?? shot?.unCreated) || 0;

  const loadScreenshots = async (appid) => {
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
    live.shotSample = list[0] || null;
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
    if (lastShotHandle !== undefined && handle !== lastShotHandle) ns.screenshotsCache.expire();
    lastShotHandle = handle;
  };

  /* ---------- Guides ---------- */

  const GUIDE_ROWS = 4;
  // EPublishedFileInfoMatchingFileType / EPublishedFileQueryType.
  const FILETYPE_ALL_GUIDES = 10;
  const QUERY_RANKED_BY_VOTE = 0;
  const GUIDE_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=';
  const GUIDES_URL = (appid) => `https://steamcommunity.com/app/${appid}/guides/`;

  // PublishedFile.QueryFiles (top rated) and GetUserFiles (your favorites):
  // the same community data Game Overview lists.
  const resolveGuidesApi = defineApi('overlay:guides-api', {
    service: servicePart('PublishedFile', ['QueryFiles', 'GetUserFiles']),
    Query: requestPart('CPublishedFile_QueryFiles_Request'),
    User: requestPart('CPublishedFile_GetUserFiles_Request'),
  });

  const toGuide = (favorite) => (file) => ({
    id: String(file.publishedfileid),
    title: String(file.title || '').trim(),
    favorite,
  });

  // Fallback when the service can't be reached: the community guide pages,
  // fetched from Steam's context with the user's session and parsed.
  const COMMUNITY = 'https://steamcommunity.com';
  const GUIDE_PAGES = Object.freeze({
    favorites: (appid) => `${COMMUNITY}/my/myworkshopfiles/?appid=${appid}&browsefilter=myfavorites&section=guides`,
    top: (appid) => `${COMMUNITY}/app/${appid}/guides/?browsefilter=toprated`,
  });

  const fetchText = async (url) => {
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

  const loadGuidesFromWeb = async (appid) => {
    const [favorites, top] = await Promise.allSettled([
      fetchText(GUIDE_PAGES.favorites(appid)).then(html => parseGuidePage(html, true)),
      fetchText(GUIDE_PAGES.top(appid)).then(html => parseGuidePage(html, false)),
    ]);
    if (favorites.status === 'rejected' && top.status === 'rejected') throw top.reason;
    return [favorites, top].flatMap(result => (result.status === 'fulfilled' ? result.value : []));
  };

  const mergeGuides = (list) => {
    const seen = new Set();
    return list.filter(guide => guide.title && !seen.has(guide.id) && seen.add(guide.id)).slice(0, GUIDE_ROWS);
  };

  const loadGuidesFromService = async (appid) => {
    const steamid = selfSteamId();
    const [favorites, top] = await Promise.allSettled([
      steamid
        ? callService(resolveGuidesApi, 'GetUserFiles', 'User', (req) => {
            req.set_steamid(steamid);
            req.set_appid(appid);
            req.set_type('myfavorites');
            req.set_filetype(FILETYPE_ALL_GUIDES);
            req.set_numperpage(GUIDE_ROWS);
            req.set_return_details?.(true);
          })
        : Promise.reject(new Error('no user')),
      callService(resolveGuidesApi, 'QueryFiles', 'Query', (req) => {
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
    live.guidesRaw = {
      favorites: favorites.status === 'fulfilled' ? (favorites.value.publishedfiledetails || []).length : String(favorites.reason?.message || favorites.reason),
      top: top.status === 'fulfilled' ? (top.value.publishedfiledetails || []).length : String(top.reason?.message || top.reason),
    };
    return [...listOf(favorites, true), ...listOf(top, false)];
  };

  // Favorites first, then top guides that aren't favorites, untitled ones
  // dropped. The service first; the web pages when it fails or comes back empty.
  const loadGuides = async (appid) => {
    let list = [];
    try {
      list = mergeGuides(await loadGuidesFromService(appid));
      live.guidesServiceError = null;
    } catch (err) {
      live.guidesServiceError = String(err?.message || err);
    }
    return list.length ? list : mergeGuides(await loadGuidesFromWeb(appid));
  };

  /* ---------- News ---------- */

  const NEWS_COUNT = 3;
  const NEWS_ENDPOINT = 'https://store.steampowered.com/events/ajaxgetpartnereventspageable/';
  const CLAN_IMAGES = 'https://clan.akamai.steamstatic.com/images/';
  // Posts without a capsule (most patch notes) show the game's store header.
  const HEADER_ART = (appid) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
  // The community announcement pages, not the store's News Hub: the News Hub
  // never finishes loading in the overlay's browser. `/ogg/<appid>` addresses
  // the game's official group by app id (`/games/` wants the group's vanity name).
  const NEWS_URL = (appid, gid = '') =>
    `https://steamcommunity.com/ogg/${appid}/announcements/${gid ? `detail/${gid}` : ''}`;
  // EProtoClanEventType, the ones a game posts as news.
  const EVENT_LABEL = Object.freeze({ 12: 'Patch notes', 13: 'Update', 14: 'Major update', 15: 'Release', 28: 'News' });

  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const toNews = (appid) => (event) => {
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
  const loadNews = async (appid) => {
    const win = contextWindows()[0];
    const url = new URL(NEWS_ENDPOINT);
    url.search = new URLSearchParams({ clan_accountid: 0, appid, offset: 0, count: NEWS_COUNT });
    const res = await win.fetch(url, { credentials: 'include', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Number(data.success) !== 1 || !Array.isArray(data.events)) throw new Error('bad response');
    return data.events.map(toNews(appid)).filter(Boolean).slice(0, NEWS_COUNT);
  };

  Object.assign(ns, { ACH_TABS, GUIDES_URL, GUIDE_URL, HEADER_ART, NEWS_URL, achievementsFromStore, checkNewScreenshot, friendStore, friendsInGame, friendsPlayedRecently, loadAchievements, loadGuides, loadNews, loadRecentPlayers, loadScreenshots, resolveAchievementStore, resolveGameplayApi, resolveGuidesApi, screenshotsApi, shotAppId, shotUrl, toFriend });
})(window.__se);
