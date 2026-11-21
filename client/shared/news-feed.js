/*
 * Steam news, read once for every part that shows it (the rail's Announcements menu,
 * client/header/announcements.js):
 * Steam's What's New events (its events store, the list Steam's own Home shows) and Steam's
 * official news, as items; opening one; Steam's news hub. Steam's Home row is never read.
 *
 * An item: { key, title, game, icon, img, avatar, kind, excerpt, t, clan, ev | url }. kind is
 * one of KINDS' keys; t is Unix seconds; clan the posting group's account id, avatar its
 * picture for Steam's own posts (Steam's clan store, once loaded); ev is Steam's event model (native events), url
 * the post's link (official news read from the feeds).
 */
((SE) => {
  window.__seNewsFeed?.destroy?.();
  const state = (window.__seNewsFeed = {});
  const { run } = SE;

  const appStore = () => SE.global('appStore', (s) => !!s.allApps);
  const partnerEventStore = () => SE.global('partnerEventStore');
  const client = () => SE.global('SteamClient', (sc) => !!sc.Apps) || window.SteamClient;

  function language() {
    for (const o of SE.owners()) {
      const l = run(() => o.LocalizationManager.GetELanguageFallbackOrder()[0]);
      if (typeof l === 'number') return l;
    }
    return 0;
  }

  function decode(text) {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  }

  const KINDS = {
    events: 'Events',
    streams: 'Live-streams',
    updates: 'Content updates',
    releases: 'Releases',
    sales: 'Sales',
    news: 'News',
    steam: 'Steam official',
  };
  // Steam's event types (ev.type) by kind
  const TYPE_KIND = {
    22: 'events', 23: 'events', 24: 'events', 25: 'events', 26: 'events', 27: 'events', 35: 'events',
    11: 'streams', 17: 'streams', 18: 'streams', 19: 'streams',
    12: 'updates', 13: 'updates', 14: 'updates', 30: 'updates', 32: 'updates', 33: 'updates',
    10: 'releases', 15: 'releases', 16: 'releases', 29: 'releases',
    20: 'sales', 21: 'sales', 31: 'sales',
    28: 'news', 34: 'news',
  };
  const STEAM_APP = 593110;
  const STEAM_SOURCES = [
    { name: 'Steam Frame', app: 4165890 },
    { name: 'Steam Client Beta', clan: 4397053, group: 'steamclientbeta' },
    { name: 'Steam Promotions', clan: 39049601 },
    { name: 'Steam Hardware', clan: 45479024, group: 'steam_hardware' },
    { name: 'Steam Deck', app: 1675200 },
    { name: 'Steam News', app: STEAM_APP, clan: 4 },
    { name: 'SteamVR', app: 250820 },
  ];
  const steamSource = (appid, clan) => STEAM_SOURCES.find((source) =>
    (source.app && source.app === Number(appid)) || (source.clan && source.clan === Number(clan))
  );

  function officialSourceFromLink(link) {
    const app = /\/(?:app|games)\/(\d+)(?:[/?#]|$)/i.exec(link)?.[1];
    const group = /\/(?:group|groups)\/([^/?#]+)/i.exec(link)?.[1]?.toLowerCase();
    return steamSource(app, group) || STEAM_SOURCES.find((source) => group && source.group === group);
  }

  const clanOf = (ev) => run(() => ev.clanSteamID.GetAccountID()) ?? ev?.clan_account_id;

  /*
   * A group's avatar, from Steam's clan store (g_ClanStore: the picture Steam shows beside a
   * post). One not loaded yet is asked for once; its arrival tells the listeners (onChange).
   */
  const clanStore = () => SE.global('g_ClanStore', (store) => typeof store.GetClanInfoByClanAccountID === 'function');
  const clansAsked = new Set();
  function avatarOf(clan) {
    clan = Number(clan);
    if (!clan) return '';
    const store = clanStore();
    if (!store) return '';
    const url = run(() => store.GetClanInfoByClanAccountID(clan)?.avatar_full_url);
    if (url) return url;
    if (!clansAsked.has(clan)) {
      clansAsked.add(clan);
      Promise.resolve(run(() => store.LoadClanInfoForClanAccountID(clan)))
        .then(() => !state.destroyed && notify())
        .catch(() => {});
    }
    return '';
  }

  function eventKind(ev, title, game) {
    if (steamSource(ev?.appid, clanOf(ev)) || /^steam( blog| news( hub)?| official)?$/i.test(game || '')) return 'steam';
    const t = Number(ev?.type ?? ev?.event_type);
    if (TYPE_KIND[t]) return TYPE_KIND[t];
    if (/% off|\b(sale|deal|discount|free weekend|free to play this weekend)\b/i.test(title)) return 'sales';
    if (/\b(live ?stream|streaming|twitch|broadcast|live now)\b/i.test(title)) return 'streams';
    if (/\b(dlc|out now|available now|launch(es|ed)?|release[sd]?|early access|coming)\b/i.test(title)) {
      return 'releases';
    }
    if (/\b(update|patch|hotfix|changelog|beta|v?\d+\.\d+(\.\d+)?)\b/i.test(title)) return 'updates';
    if (/\b(event|season|contest|challenge|tournament|halloween|christmas|anniversary)\b/i.test(title)) {
      return 'events';
    }
    return 'news';
  }

  function excerptOf(value, title, game) {
    if (typeof value !== 'string') return '';
    const normalize = (line) => line.replace(/\s+/g, ' ').trim();
    const repeated = [title, game].map((line) => normalize(line).toLowerCase());
    const excerpt = decode(value)
      .replace(/\[(img|previewyoutube|video|spoiler)\b[^\]]*\][\s\S]*?\[\/\1\]/gi, '')
      .replace(/\{STEAM_CLAN_IMAGE\}[^\s\]]+/g, '')
      .replace(/<\/?(?:p|div|li|h[1-6]|br)\b[^>]*>/gi, '\n')
      .replace(/\[\/?(?:h[1-6]|list|olist|p)\b[^\]]*\]/gi, '\n')
      .replace(/<\/?[a-z][^>]*>|\[\/?(?:b|i|u|s|strike|url|quote|code|center|hr|table|tr|td)\b[^\]]*\]|\[\*\]/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .split(/\r?\n/)
      .map(normalize)
      .filter((line) => /[\p{L}\p{N}]/u.test(line) && !repeated.includes(line.toLowerCase()))
      .join(' ');
    return excerpt.length > 320 ? excerpt.slice(0, 320).trimEnd() + '…' : excerpt;
  }

  // One key per post, the same for its native event and its feed copy: what dedupes them, and
  // what a reader marks as read.
  const keyOf = (game, title) =>
    `${String(game).toLowerCase()}:${String(title).toLowerCase().replace(/[\p{P}\s]+/gu, ' ').trim()}`;

  /*
   * Steam's events store (the What's New list its Home shows): found once by its methods. It
   * loads by itself at startup and when the window comes back, Steam's Home shown or not.
   */
  const eventsStore = () =>
    SE.findModule('home:whats-new-store', (src, id, req) => {
      if (!src.includes('GetWhatsNewEvents') || !src.includes('m_vecHomeBestEventsForUser')) return null;
      for (const value of Object.values(run(() => req(id)) || {})) {
        if (typeof value?.GetWhatsNewEvents === 'function') return value;
      }
      return null;
    });

  function eventItem(ev, lang) {
    const appid = Number(ev.appid) || 0;
    const source = steamSource(appid, clanOf(ev));
    const app = appid ? run(() => appStore().GetAppOverviewByAppID(appid)) : null;
    const game = source?.name || app?.display_name || '';
    const title = String(run(() => ev.GetNameWithFallback(lang)) || '').trim();
    return {
      key: keyOf(game, title),
      clan: Number(clanOf(ev)) || 0,
      img:
        run(() => ev.GetImageURL('capsule', lang)) ||
        run(() => ev.GetImageURL('header', lang)) ||
        (appid ? `/assets/${appid}/header.jpg` : ''),
      title,
      game,
      icon: (app && run(() => appStore().GetIconURLForApp(app))) || '',
      kind: source ? 'steam' : eventKind(ev, title, game),
      excerpt: excerptOf(run(() => ev.GetSummaryWithFallback(lang, 320)), title, game),
      ev,
      t: Number(run(() => ev.GetStartTimeAndDateUnixSeconds())) || 0,
    };
  }

  /*
   * Steam's official news, from every source at once (its event pages, the news collection
   * feed and the legacy news API), the last 30 days, refreshed at most every 30 minutes (2 while
   * nothing has come in). Each arrival tells the listeners (onChange).
   */
  const STEAM_NEWS_DAYS = 30;
  const STEAM_NEWS_FEED = 'https://store.steampowered.com/feeds/news/collection/steam';
  const official = { at: 0, items: [], busy: false };
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) run(listener);
  };

  function clanImage(text) {
    const m =
      /\[img(?:\s+src=["']?([^"'\]\s]+)["']?)?\]\s*([^\[\s]*)/i.exec(text || '') ||
      /(\{STEAM_CLAN_IMAGE\}[^\s"'\[\]]+)/.exec(text || '');
    const raw = (m && (m[1] || m[2])) || '';
    return raw
      .replace('{STEAM_CLAN_IMAGE}', 'https://clan.akamai.steamstatic.com/images')
      .replace(/^http:/, 'https:');
  }

  function officialItem(source, title, contents, url, t, artwork, clan = source.clan) {
    title = decode(String(title || '')).trim();
    if (!title || !Number.isFinite(t) || !/^https:\/\//i.test(url)) return null;
    return {
      key: keyOf(source.name, title),
      clan: Number(clan) || 0,
      img: /^https?:\/\//i.test(artwork || '') ? decode(artwork).replace(/^http:/i, 'https:') : clanImage(contents),
      title,
      game: source.name,
      excerpt: excerptOf(contents, title, source.name),
      icon: '',
      kind: 'steam',
      url,
      t,
    };
  }

  async function steamCollection() {
    const response = await fetch(STEAM_NEWS_FEED, { credentials: 'omit' });
    if (!response.ok) return [];
    const feed = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return [...feed.querySelectorAll('channel > item')].map((item) => {
      const field = (name) => item.querySelector(name)?.textContent?.trim() || '';
      const link = field('link');
      const source = officialSourceFromLink(link);
      if (!source) return null;
      const body = field('description');
      const image = [...item.children].find((el) =>
        ['thumbnail', 'content', 'enclosure'].includes(el.localName) &&
        (el.localName === 'thumbnail' || el.getAttribute('medium') === 'image' || el.getAttribute('type')?.startsWith('image/'))
      )?.getAttribute('url') || /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(body)?.[1];
      return officialItem(source, field('title'), body, link, Date.parse(field('pubDate')) / 1000, image);
    });
  }

  async function steamNativeNews(source) {
    const store = partnerEventStore();
    // The pageable method reads the clan through GetAccountID when no app is supplied.
    const clan = source.app ? undefined : { GetAccountID: () => source.clan };
    const path = source.app ? `app/${source.app}` : `group/${source.clan}`;
    const events = await store?.LoadPartnerEventsPageable?.(clan, source.app, 0, 24) || [];
    const lang = language();
    return events.map((event) => officialItem(
      source,
      event.GetNameWithFallback(lang),
      event.GetSummaryWithFallback(lang, 320),
      `https://store.steampowered.com/news/${path}/view/${event.GID}`,
      event.GetStartTimeAndDateUnixSeconds(),
      event.GetImageURL('capsule', lang) || event.GetImageURL('header', lang),
      clanOf(event) || source.clan
    ));
  }

  async function steamLegacyNews() {
    const response = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP}&count=24&maxlength=0&feeds=steam_community_announcements`,
      { credentials: 'omit' }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.appnews?.newsitems || []).map((item) =>
      officialItem(steamSource(STEAM_APP), item.title, item.contents, item.url, item.date)
    );
  }

  async function loadOfficial() {
    const requests = [...STEAM_SOURCES.map(steamNativeNews), steamCollection(), steamLegacyNews()];
    const results = await Promise.allSettled(requests.map(async (request) => {
      let timer;
      try {
        return await Promise.race([request, new Promise((resolve) => {
          timer = setTimeout(() => resolve([]), 8000);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }));
    if (state.destroyed) return;
    const since = Date.now() / 1000 - STEAM_NEWS_DAYS * 86400;
    const items = new Map();
    for (const result of [...results, { status: 'fulfilled', value: official.items }]) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!item || item.t < since) continue;
        const previous = items.get(item.key);
        if (!previous) {
          items.set(item.key, item);
          continue;
        }
        if (!previous.img && item.img) previous.img = item.img;
        if (!previous.clan && item.clan) previous.clan = item.clan;
      }
    }
    official.items = [...items.values()].sort((a, b) => b.t - a.t);
    official.at = Date.now();
    official.busy = false;
    notify();
  }

  function officialItems() {
    if (!official.busy && Date.now() - official.at > (official.items.length ? 30 : 2) * 60000) {
      official.busy = true;
      void loadOfficial();
    }
    return official.items;
  }

  /**
   * Every post, newest first: Steam's What's New events, then the official posts they don't
   * already hold. loading: Steam's events haven't come in yet.
   */
  function items() {
    const store = eventsStore();
    const events = store ? run(() => store.GetWhatsNewEvents()) : null;
    const loading = Boolean(events && !events.bEventsLoaded && events.bInitialLoadPending);
    const lang = language();
    const all = [...(events?.takeoverEvents || []), ...(events?.eventsToShow || [])]
      .map((ev) => eventItem(ev, lang))
      .filter((it) => it.title);
    const keys = new Set(all.map((it) => it.key));
    for (const it of officialItems()) {
      if (!keys.has(it.key)) all.push(it);
    }
    all.sort((a, b) => (b.t || 0) - (a.t || 0));
    // Steam's own groups only: a game's post has its game's icon, and asking every game's group
    // would be a request per game
    for (const it of all) it.avatar = it.kind === 'steam' ? avatarOf(it.clan) : '';
    return { items: all, loading };
  }

  const NEWS_HUB = 'https://store.steampowered.com/news/collection/library/';
  const openURL = (url) => run(() => client().URL.ExecuteSteamURL(`steam://openurl/${url}`));
  const openHub = () => openURL(NEWS_HUB);

  function officialEventLink(url, sourceName) {
    const post = /^https:\/\/store\.steampowered\.com\/news\/(app|group)\/(\d+)\/view\/(\d+)(?:[/?#]|$)/i.exec(url);
    if (post) {
      const [, kind, source, eventid] = post;
      return kind.toLowerCase() === 'app'
        ? { appid: Number(source), eventid }
        : { clan: Number(source), eventid };
    }
    const announcement = /^https:\/\/steamcommunity\.com\/(?:games|app|groups|gid)\/[^/]+\/announcements\/detail\/(\d+)(?:[/?#]|$)/i.exec(url);
    if (!announcement) return null;
    const source = officialSourceFromLink(url) || STEAM_SOURCES.find(({ name }) => name === sourceName);
    if (!source) return null;
    return { appid: source.app, clan: source.clan, announcement: announcement[1] };
  }

  async function resolveOfficialEvent({ url, game }) {
    const link = officialEventLink(url, game);
    const store = partnerEventStore();
    if (!link || !store) return null;
    const { appid, clan, eventid, announcement } = link;
    const cached = eventid
      ? store.GetClanEventModel?.(eventid)
      : store.GetClanEventFromAnnouncementGID?.(announcement);
    if (cached) return cached;
    const clanID = clan ? { GetAccountID: () => clan } : undefined;
    const load = store.LoadPartnerEventGeneric;
    if (typeof load !== 'function') return null;
    let timer;
    try {
      return await Promise.race([
        load.call(store, clanID, appid, eventid, announcement, 0),
        new Promise((resolve) => { timer = setTimeout(resolve, 3500); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  let openRequest = 0;

  /** Open a post: Steam's own event view over Library Home, or the post's link. */
  async function open(it) {
    const request = ++openRequest;
    if (!it) return;
    let event = it.ev || null;
    if (!event && it.url) {
      try {
        event = await resolveOfficialEvent(it);
      } catch {
        // A failed event lookup can still use the original link.
      }
      if (request !== openRequest) return;
    }
    const main = SE.mainWindow();
    const appid = Number(event?.appid) || undefined;
    const clanSteamID = event?.clanSteamID;
    if (event?.GID && (appid || clanSteamID) && typeof main?.Navigate === 'function' &&
        main.BCanNavigate?.() !== false) {
      try {
        const location = main.m_history?.location;
        const shown = location?.pathname === '/library/home' ? location.state : null;
        main.Navigate('/library/home', false, false, {
          ...(shown && typeof shown === 'object' ? shown : {}),
          event_to_show: { appid, eventid: event.GID, clanSteamID },
        });
        return;
      } catch {
        // A client without the Library event route can still use the link.
      }
    }
    if (it.url) openURL(it.url);
  }

  /** A post opening now is dropped when its lookup returns. */
  const cancelOpen = () => {
    openRequest++;
  };

  /** fn runs whenever Steam's official news or a group's avatar comes in; returns the unsubscribe. */
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  state.destroy = () => {
    state.destroyed = true;
    cancelOpen();
    listeners.clear();
    delete SE.news;
  };

  SE.news = { KINDS, items, open, openHub, cancelOpen, onChange };
})(window.__se);
