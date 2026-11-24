/*
 * Wishlist store data (a part: web.parts.wishlistData, used by wishlist/page.js): the
 * wishlist's apps (IWishlistService/GetWishlist), then their prices, release and top tags
 * (IStoreBrowseService/GetItems) and the tags' names (IStoreService/GetLocalizedNameForTags),
 * from Steam's Web API as the store page itself does. load(own, signal) resolves to the
 * page's summary and tags, or null for an empty list.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const API = 'https://api.steampowered.com';
  const BATCH = 100; // apps per GetItems request
  const ITEM_TAGS = 5; // each game's top tags, as its row shows them

  /**
   * The store page's own settings (#application_config on most store pages; whichever element
   * carries them here): language, country, the signed-in user.
   */
  const pageConfig = () => {
    const holder = (name) => document.getElementById('application_config') ?? document.querySelector(`[data-${name}]`);
    const read = (name) => {
      try {
        return JSON.parse(holder(name)?.getAttribute(`data-${name}`) ?? 'null');
      } catch {
        return null;
      }
    };
    const node = holder('config') ?? holder('userinfo');
    const config = read('config') ?? {};
    const user = read('userinfo') ?? {};
    const raw = read('loyalty_webapi_token');
    const token = typeof raw === 'string' && raw ? raw : null;
    return {
      language: config.LANGUAGE || 'english',
      country: config.COUNTRY || undefined,
      steamid: user.steamid || tokenSubject(token),
      token,
      found: `config ${node ? 'yes' : 'no'}, user ${user.steamid ? 'yes' : 'no'}, token ${token ? 'yes' : 'no'}`,
    };
  };

  /**
   * What Steam's own wishlist request said: the list's owner (the request's protobuf starts with
   * field 1, a fixed64 SteamID) and the token it used. Read from the page's resource timings,
   * so it works under a custom URL and for a friend's list too.
   */
  const steamRequest = () => {
    const calls = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .filter((name) => name.startsWith(API))
      .map((name) => new URL(name));
    const wishlistCall = calls.find((url) => url.pathname.startsWith('/IWishlistService/'));
    let steamid = wishlistCall?.searchParams.get('steamid') ?? null;
    const encoded = wishlistCall?.searchParams.get('input_protobuf_encoded');
    if (!steamid && encoded) {
      try {
        const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
        if (bytes[0] === 0x09 && bytes.length >= 9) steamid = String(new DataView(bytes.buffer, 1, 8).getBigUint64(0, true));
      } catch {
        // not the shape expected: no owner from here
      }
    }
    if (!/^\d{17}$/.test(steamid ?? '')) steamid = null;
    // Any of Steam's own calls carries the signed-in user's token.
    const token = calls.map((url) => url.searchParams.get('access_token')).find(Boolean) ?? null;
    return {
      steamid,
      token,
      found: `${calls.length} calls, wishlist ${wishlistCall ? (steamid ? 'yes' : 'unread') : 'no'}, token ${token ? 'yes' : 'no'}`,
    };
  };

  /**
   * The same from the page's HTML as Steam serves it (the live page may have dropped its settings
   * element by now): the signed-in user's token and SteamID, and the SteamIDs it mentions.
   */
  const servedPage = async (signal) => {
    const response = await fetch(location.href, { signal, credentials: 'include' });
    if (!response.ok) return { found: `html ${response.status}` };
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const read = (name) => {
      try {
        return JSON.parse(doc.querySelector(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? 'null');
      } catch {
        return null;
      }
    };
    const raw = read('loyalty_webapi_token');
    const token = typeof raw === 'string' && raw ? raw : null;
    const self = read('userinfo')?.steamid || tokenSubject(token);
    const ids = [...new Set(html.match(/7656119\d{10}/g) ?? [])];
    const country = read('config')?.COUNTRY ?? html.match(/COUNTRY(?:&quot;|")\s*:\s*(?:&quot;|")([A-Z]{2})/)?.[1] ?? null;
    return { token, self, ids, country, found: `html user ${self ? 'yes' : 'no'}, token ${token ? 'yes' : 'no'}, ids ${ids.length}, country ${country ?? 'no'}` };
  };

  /** The SteamID a Web API token was issued to (its JWT payload's "sub"). */
  const tokenSubject = (token) => {
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const sub = JSON.parse(atob(payload)).sub;
      return /^\d{17}$/.test(sub) ? sub : null;
    } catch {
      return null;
    }
  };

  /** One Web API call (GET, JSON in input_json); resolves the response body. */
  const api = async (path, params, signal) => {
    const url = new URL(`${API}/${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(name, typeof value === 'string' ? value : JSON.stringify(value));
    }
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return (await response.json())?.response ?? {};
  };

  /** Tag names by id: just these tags, else Steam's whole tag list. */
  const tagNames = async (tagids, language, signal) => {
    try {
      const { tags = [] } = await api('IStoreService/GetLocalizedNameForTags/v1/', { input_json: { language, tagids } }, signal);
      if (tags.length) return new Map(tags.map((tag) => [tag.tagid, tag.name || tag.english_name]));
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
    const { tags = [] } = await api('IStoreService/GetTagList/v1/', { language }, signal);
    return new Map(tags.map((tag) => [tag.tagid, tag.name]));
  };

  /**
   * The wishlist's store data: how many are on sale and coming soon, and its tags by how many
   * games carry them ([{ name, count }], most first). The owner is the address's SteamID, else
   * the one Steam's own wishlist request asked for, else on your own list (`own`) the signed-in
   * user. Null for an empty list.
   */
  const loadWishlist = async (own, signal) => {
    const config = pageConfig();
    const steam = steamRequest();
    let token = config.token ?? steam.token ?? null;
    let steamid = location.pathname.match(/^\/wishlist\/profiles\/(\d{17})/i)?.[1]
      ?? steam.steamid
      ?? (own ? config.steamid ?? tokenSubject(token) : null);
    let served = { found: 'html not read' };
    if (!steamid || !token || !config.country) {
      // Last: the page as served. The one SteamID it names other than yours is the owner's; on
      // your own list, yours (or the only one it names).
      served = await servedPage(signal);
      token ??= served.token;
      const ids = served.ids ?? [];
      const others = ids.filter((id) => id !== served.self);
      steamid ??= own
        ? served.self ?? (ids.length === 1 ? ids[0] : null)
        : others.length === 1 ? others[0] : null;
    }
    if (!steamid) throw new Error(`No owner SteamID on the page (${config.found}; ${steam.found}; ${served.found}; own list ${own ? 'yes' : 'no'})`);
    // GetItems answers nothing without a country: the page's, else the served page's, else US.
    const { language } = config;
    const country = config.country ?? served.country ?? 'US';

    // With your token, so a private or friends-only list loads; without it if that fails.
    const wishlist = (accessToken) => api('IWishlistService/GetWishlist/v1/', { steamid, access_token: accessToken }, signal);
    const { items = [] } = token
      ? await wishlist(token).catch((error) => (error.name === 'AbortError' ? Promise.reject(error) : wishlist(null)))
      : await wishlist(null);
    const appids = items.map((item) => item.appid).filter(Boolean);
    if (!appids.length) return null;

    const batches = [];
    for (let i = 0; i < appids.length; i += BATCH) batches.push(appids.slice(i, i + BATCH));
    const stores = await Promise.all(batches.map((ids) => api('IStoreBrowseService/GetItems/v1/', {
      input_json: {
        ids: ids.map((appid) => ({ appid })),
        context: { language, country_code: country, steam_realm: 1 },
        data_request: {
          include_assets: true,
          include_release: true,
          include_platforms: true,
          include_tag_count: ITEM_TAGS,
          include_reviews: true,
          include_basic_info: true,
          include_best_purchase_option: true,
        },
      },
    }, signal)));
    const apps = stores.flatMap((store) => store.store_items ?? []);

    const counts = new Map();
    for (const app of apps) {
      const ids = app.tags?.map((tag) => tag.tagid) ?? app.tagids?.slice(0, ITEM_TAGS) ?? [];
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const names = counts.size ? await tagNames([...counts.keys()], language, signal) : new Map();

    const tagged = apps.filter((app) => app.tags?.length || app.tagids?.length).length;
    // Each app with its place on the list (rank 1 first), when it was added and its tags' names.
    const listed = new Map(items.map((item) => [item.appid, item]));
    const ranked = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map((item) => item.appid);
    const rankOf = new Map(ranked.map((appid, i) => [appid, i + 1]));
    return {
      total: appids.length,
      apps: apps.filter((app) => app.appid).map((app) => ({
        ...app,
        rank: rankOf.get(app.appid) ?? ranked.length + 1,
        date_added: listed.get(app.appid)?.date_added ?? 0,
        tagNames: (app.tags?.map((tag) => tag.tagid) ?? app.tagids?.slice(0, ITEM_TAGS) ?? []).map((id) => names.get(id)).filter(Boolean),
      })),
      summary: `wishlist ${appids.length}, store items ${apps.length}, with tags ${tagged}, named ${names.size}, country ${country}`,
      onSale: apps.filter((app) => (app.best_purchase_option?.discount_pct ?? 0) > 0).length,
      comingSoon: apps.filter((app) => app.release?.is_coming_soon || app.is_coming_soon).length,
      tags: [...counts]
        .filter(([id]) => names.get(id))
        .map(([id, count]) => ({ name: names.get(id), count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  };

  web.parts.wishlistData = { load: loadWishlist };
})();
