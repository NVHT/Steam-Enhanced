/*
 * The runtime, part 2 of 2 (core/runtime.js names the parts), listed right after it: games and
 * their art (the app store, library art and its copies, SE.art's fallback chain) and
 * achievement rarity tiers, added to window.__se before any feature runs.
 */
(() => {
  const SE = window.__se;
  if (!SE || SE.art) return;
  const { esc, findModule, global, owners, run } = SE;

  const isInstalled = (app) => {
    try {
      return !!app.per_client_data && [...app.per_client_data].some(client => client.installed);
    } catch {
      return !!app?.installed;
    }
  };

  const resolveAppStore = () => global('appStore');

  // A game in the Library's list: a game or mod (app_type 1, 1073741824) not left out of it;
  // given the collectionStore, not hidden by the user either
  const isLibraryGame = (app, collections) =>
    !!app &&
    (app.app_type === 1 || app.app_type === 1073741824) &&
    app.visible_in_game_list !== false &&
    !(collections && run(() => collections.BIsHidden(app.appid)));

  const coverURLs = (app, store) => {
    const appStore = store || resolveAppStore();
    const urls = [];
    const push = (val) => {
      if (Array.isArray(val)) urls.push(...val.filter(Boolean));
      else if (typeof val === 'string' && val) urls.push(val);
    };
    if (appStore && app) {
      if (app.rt_custom_image_mtime) push(run(() => appStore.GetCustomVerticalCapsuleURLs(app)));
      push(run(() => appStore.GetCachedVerticalCapsuleURL(app)));
      push(run(() => appStore.GetVerticalCapsuleURLForApp(app)));
    }
    if (app?.appid) {
      urls.push(
        `/assets/${app.appid}/library_600x900.jpg`,
        `https://shared.steamstatic.com/store_item_assets/steam/apps/${app.appid}/library_600x900.jpg`
      );
    }
    return [...new Set(urls)];
  };

  /*
   * Steam's own source for a game's library art (GetHeaderImages, GetHeroImages, GetLogoImages:
   * the custom art, the cached copy, then the CDN, by the file names Steam keeps for the game),
   * found once by its methods. Newer games keep their art under hashed paths, so the bare names
   * in heroURLs, headerURLs and logoURLs can 404; they stay as the last copies.
   * Finding it scans every module (a long task), so `scan: false` only takes a copy this or
   * another window already found: heroURLs, headerURLs and logoURLs ask that way.
   */
  const LIBRARY_ART = 'core:library-art';
  let found = null;
  const libraryArt = ({ scan = true } = {}) => {
    if (found) return found;
    for (const win of owners()) {
      const found = win !== window && run(() => win.__se?.libraryArt({ scan: false }));
      if (found) return found;
    }
    if (!scan) return null;
    found = findModule(LIBRARY_ART, (src, id, req) => {
      if (!src.includes('GetHeaderImagesForAppId') || !src.includes('BHasRecentlyLaunched')) return null;
      for (const value of Object.values(run(() => req(id)) || {})) {
        if (typeof value?.GetHeaderImages === 'function') return value;
      }
      return null;
    });
    return found;
  };

  const urlList = (list) => (Array.isArray(list) ? list.filter((url) => typeof url === 'string' && url) : []);
  const STORE_ART = 'https://shared.steamstatic.com/store_item_assets/steam/apps';

  // Hero art for an app: Steam's list, the user's custom hero, the local copy, then the CDN (header last).
  const heroURLs = (appid, store) => {
    if (!appid) return [];
    const appStore = store || resolveAppStore();
    const app = appStore && run(() => appStore.GetAppOverviewByAppID(Number(appid)));
    const urls = app ? urlList(run(() => libraryArt({ scan: false })?.GetHeroImages(app)?.rgHeroImages)) : [];
    if (app?.rt_custom_image_mtime) urls.push(...urlList(run(() => appStore.GetCustomHeroImageURLs(app))));
    urls.push(
      `/assets/${appid}/library_hero.jpg`,
      `${STORE_ART}/${appid}/library_hero.jpg`,
      `/assets/${appid}/header.jpg`,
      `${STORE_ART}/${appid}/header.jpg`
    );
    return [...new Set(urls)];
  };

  // Wide cover (header) art for an app, in the same order as heroURLs.
  const headerURLs = (appid, store) => {
    if (!appid) return [];
    const appStore = store || resolveAppStore();
    const app = appStore && run(() => appStore.GetAppOverviewByAppID(Number(appid)));
    const urls = app ? urlList(run(() => libraryArt({ scan: false })?.GetHeaderImages(app)?.rgHeaderImages)) : [];
    // Steam's own spelling (Landcape)
    if (app?.rt_custom_image_mtime) urls.push(...urlList(run(() => appStore.GetCustomLandcapeImageURLs(app))));
    urls.push(`/assets/${appid}/header.jpg`, `${STORE_ART}/${appid}/header.jpg`);
    return [...new Set(urls)];
  };

  // Logo art for an app, in the same order as heroURLs.
  const logoURLs = (appid, store) => {
    if (!appid) return [];
    const appStore = store || resolveAppStore();
    const app = appStore && run(() => appStore.GetAppOverviewByAppID(Number(appid)));
    const urls = app ? urlList(run(() => libraryArt({ scan: false })?.GetLogoImages(app)?.rgLogoImages)) : [];
    if (app?.rt_custom_image_mtime) urls.push(...urlList(run(() => appStore.GetCustomLogoImageURLs(app))));
    urls.push(`/assets/${appid}/logo.png`, `${STORE_ART}/${appid}/logo.png`);
    return [...new Set(urls)];
  };

  /*
   * Art works through its copies (local first, then the CDN): the ones still to try ride in
   * data-urls. Until one has loaded the image is marked data-se-art-wait and drawn as nothing
   * (core/images.css), so a failed copy never shows the broken-image icon. One chain for
   * both kinds of image: built ones listen themselves (they can fail before they're attached),
   * innerHTML-built ones (tag()) are caught by capture listeners on their container (onLoad,
   * onError).
   */
  const ART_WAIT = 'data-se-art-wait';
  const artFailed = new WeakMap(); // img → called once its last copy has failed

  /* load doesn't bubble: caught on the way down, beside onImgError */
  function onImgLoad(e) {
    if (e.target instanceof HTMLImageElement) e.target.removeAttribute(ART_WAIT);
  }

  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.urls) return;
    const rest = JSON.parse(img.dataset.urls);
    if (rest.length) {
      img.dataset.urls = JSON.stringify(rest.slice(1));
      img.src = rest[0];
    } else {
      delete img.dataset.urls;
      img.hidden = true;
      artFailed.get(img)?.();
    }
  }

  // opts.lazy: load only once near the viewport (set before src, or it has no effect)
  function artImg(urls, cls, onFail, opts) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    if (opts?.lazy) img.loading = 'lazy';
    img.setAttribute(ART_WAIT, '');
    img.dataset.urls = JSON.stringify(urls.slice(1));
    img.addEventListener('load', onImgLoad);
    img.addEventListener('error', onImgError);
    if (onFail) artFailed.set(img, onFail);
    img.src = urls[0];
    return img;
  }

  const imgTag = (urls, cls) =>
    `<img class="${cls}" alt="" draggable="false" loading="lazy" ${ART_WAIT} src="${esc(urls[0])}" data-urls="${esc(JSON.stringify(urls.slice(1)))}">`;

  const art = { img: artImg, tag: imgTag, onLoad: onImgLoad, onError: onImgError };

  // Achievement rarity tiers by global unlock rate (% of players). Colors: --se-tier-* in tokens.css.
  const TIERS = Object.freeze([
    Object.freeze({ id: 'legendary', name: 'Legendary', max: 5, rank: 5 }),
    Object.freeze({ id: 'epic', name: 'Epic', max: 15, rank: 4 }),
    Object.freeze({ id: 'rare', name: 'Rare', max: 35, rank: 3 }),
    Object.freeze({ id: 'uncommon', name: 'Uncommon', max: 60, rank: 2 }),
    Object.freeze({ id: 'common', name: 'Common', max: Infinity, rank: 1 }),
  ]);
  /*
   * The Rarity tiers setting (client/shared/settings.js keeps it here with setTiers): while off,
   * nothing has a tier, so every feature draws its plain rarity (% of players) instead.
   */
  let tiersOn = true;
  const setTiers = (on) => {
    tiersOn = Boolean(on);
  };
  const tierOf = (pct) =>
    (tiersOn && typeof pct === 'number' && Number.isFinite(pct) ? TIERS.find(t => pct <= t.max) : null);
  const fmtPct = (pct) => (pct > 0 && pct < 0.1 ? '<0.1' : pct.toFixed(1));
  // The layer over a tiered icon (styles: client/shared/achievement-tiers.css): one sparkle
  // per tier rank when unlocked, and the tier's initial so it reads without color.
  const tierFx = (tier, locked) => {
    const fx = document.createElement('span');
    fx.className = 'se-ach-fx';
    fx.setAttribute('aria-hidden', 'true');
    if (!locked) {
      for (let i = 0; i < tier.rank; i++) fx.appendChild(document.createElement('i')).className = 'se-ach-spark';
    }
    fx.appendChild(document.createElement('b')).textContent = tier.name[0];
    return fx;
  };
  const rarity = Object.freeze({ TIERS, tierOf, fmtPct, fx: tierFx, setTiers });

  Object.assign(SE, {
    appStore: resolveAppStore,
    isLibraryGame,
    isInstalled,
    coverURLs,
    headerURLs,
    heroURLs,
    logoURLs,
    libraryArt,
    art,
    rarity,
  });
})();
