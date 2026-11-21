/*
 * Library Home data: recently played games, their art, achievements, store review summary
 * (cached for a week) and live player counts.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { appStore, client, collectionStore, libraryArt, paintGame, schedule } = ns;
  const { live } = ns;

  const { run } = SE;


  let recentCache = { at: 0, list: [] };

  /** The n most recently played games (the stage's "Recently played"), up to 10. */
  function recentApps(n = 8) {
    if (Date.now() - recentCache.at < 5000) return recentCache.list.slice(0, n);
    const store = appStore();
    let list = [];
    if (store) {
      const hidden = (id) => run(() => collectionStore().BIsHidden(id)) || false;
      list =
        run(() =>
          store.allApps
            .filter(
              (a) =>
                a &&
                a.rt_last_time_played > 0 &&
                (a.app_type === 1 || a.app_type === 1073741824) &&
                a.visible_in_game_list !== false &&
                !hidden(a.appid)
            )
            .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
            .slice(0, 10)
        ) || [];
    }
    recentCache = { at: Date.now(), list };
    return list.slice(0, n);
  }

  const CDN = (id) => `https://shared.steamstatic.com/store_item_assets/steam/apps/${id}`;

  /*
   * Hero and logo art: Steam's own lists first (util.js libraryArt: the custom art, the cached
   * copy, then the CDN by the file names Steam keeps; newer games keep theirs under a hashed
   * path, so a bare library_hero.jpg or logo.png can miss), then the bare names.
   */
  const steamArt = (list) => (Array.isArray(list) ? list.filter((url) => typeof url === 'string' && url) : []);

  const heroURLs = (app) => [
    ...new Set([
      ...steamArt(run(() => libraryArt()?.GetHeroImages(app)?.rgHeroImages)),
      ...SE.heroURLs(app.appid, appStore()),
    ]),
  ];

  function logoURLs(app) {
    const s = appStore();
    const custom = s && app.rt_custom_image_mtime ? run(() => s.GetCustomLogoImageURLs(app)) : null;
    return [
      ...new Set([
        ...steamArt(run(() => libraryArt()?.GetLogoImages(app)?.rgLogoImages)),
        ...steamArt(custom),
        `/assets/${app.appid}/logo.png`,
        `${CDN(app.appid)}/logo.png`,
      ]),
    ];
  }



  const achievements = new Map();

  function achievementsOf(id) {
    if (achievements.has(id)) return achievements.get(id);
    achievements.set(id, null);
    const sc = client();
    if (typeof sc?.Apps?.GetMyAchievementsForApp !== 'function') return null;
    Promise.resolve(sc.Apps.GetMyAchievementsForApp(String(id)))
      .then((r) => {
        if (typeof r === 'string') r = JSON.parse(r);
        const all = r?.data?.rgAchievements;
        if (r?.result !== 1 || !Array.isArray(all) || !all.length) return;
        achievements.set(id, { got: all.filter((a) => a.bAchieved).length, total: all.length });
        if (live.apps[live.selected]?.appid === id) paintGame();
        schedule(); // the board's Achievements panel
      })
      .catch(() => {});
    return null;
  }

  const INFO_KEY = 'se-home-info';
  const INFO_DAYS = 7;
  const infoCache = (() => {
    try {
      return JSON.parse(localStorage.getItem(INFO_KEY) || '{}') || {};
    } catch {
      return {};
    }
  })();
  try {
    localStorage.removeItem('se-home-desc');
  } catch {}

  const infoAsked = new Set();
  let langAsk = null;

  const steamLanguage = () =>
    (langAsk ||= Promise.resolve(run(() => client().Settings.GetCurrentLanguage())).then(
      (l) => (typeof l === 'string' && /^[a-z]+$/.test(l) ? l : 'english'),
      () => 'english'
    ));

  function decode(t) {
    const el = document.createElement('textarea');
    el.innerHTML = t;
    return el.value;
  }

  function infoOf(id) {
    const hit = infoCache[id];
    if (hit && Date.now() - hit.at < INFO_DAYS * 864e5) return hit;
    if (infoAsked.has(id)) return hit || null;
    infoAsked.add(id);

    steamLanguage()
      .then((lang) => {
        const input = {
          ids: [{ appid: id }],
          context: { language: lang, country_code: 'US' },
          data_request: { include_basic_info: true, include_release: true, include_reviews: true },
        };
        return fetch(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
          { credentials: 'omit' }
        );
      })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const item = j?.response?.store_items?.[0];
        if (!item) return;
        const b = item.basic_info || {};
        const rev = item.reviews?.summary_filtered || {};
        const rel = Number(item.release?.steam_release_date || item.release?.original_release_date) || 0;
        infoCache[id] = {
          at: Date.now(),
          text: decode(String(b.short_description || ''))
            .replace(/\s+/g, ' ')
            .trim(),
          dev: (b.developers || [])
            .map((d) => d?.name)
            .filter(Boolean)
            .slice(0, 2)
            .join(', '),
          year: rel ? new Date(rel * 1000).getFullYear() : 0,
          pct: Number.isFinite(rev.percent_positive) && rev.review_count >= 10 ? rev.percent_positive : null,
          score: String(rev.review_score_label || ''),
        };
        const keys = Object.keys(infoCache).sort((a, b) => infoCache[b].at - infoCache[a].at);
        for (const k of keys.slice(60)) delete infoCache[k];
        try {
          localStorage.setItem(INFO_KEY, JSON.stringify(infoCache));
        } catch {}
        if (live.apps[live.selected]?.appid === id) paintGame();
      })
      .catch(() => {});

    return hit || null;
  }

  const players = new Map();

  function playersOf(id) {
    const hit = players.get(id);
    if (hit && Date.now() - hit.at < 60000) return hit.count;
    const ask = window.__sePlayerCount?.count;
    if (typeof ask !== 'function' || hit?.busy) return hit?.count ?? null;
    players.set(id, { ...hit, busy: true });
    Promise.resolve(ask(id)).then(
      (count) => {
        players.set(id, { count: Number.isSafeInteger(count) ? count : null, at: Date.now() });
        if (live.apps[live.selected]?.appid === id) paintGame();
      },
      () => players.set(id, { count: null, at: Date.now() })
    );
    return hit?.count ?? null;
  }

  Object.assign(ns, {
    CDN, achievementsOf, decode, heroURLs, infoOf, logoURLs, playersOf, recentApps,
  });
})(window.__se);
