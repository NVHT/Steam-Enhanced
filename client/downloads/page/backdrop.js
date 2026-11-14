/*
 * The downloading game's art behind the page and its logo over it.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { setAttr } = ns;

  // Art backdrop and logo for the game downloading
  const STORE_CDN = 'https://shared.steamstatic.com/store_item_assets/steam/apps';
  const mountedNodes = new Set();

  // Steam's art URLs carry the app id: /assets/<appid>/… (cache), …/apps/<appid>/… (CDN),
  // /customimages/<appid>_… (artwork the user set).
  const ART_APPID = /\/(?:assets|apps)\/(\d+)(?:[/?]|$)|\/customimages\/(\d+)[._]/;
  const appIdFromArt = (src) => {
    const match = ART_APPID.exec(src || '');
    return match ? match[1] || match[2] : null;
  };

  function logoURLs(appid) {
    const store = SE.appStore();
    const app = store && SE.run(() => store.GetAppOverviewByAppID(Number(appid)));
    const urls = [];
    if (app?.rt_custom_image_mtime) {
      const custom = SE.run(() => store.GetCustomLogoImageURLs(app));
      if (Array.isArray(custom)) urls.push(...custom.filter(Boolean));
    }
    urls.push(`/assets/${appid}/logo.png`, `${STORE_CDN}/${appid}/logo.png`);
    return [...new Set(urls)];
  }

  function syncBackdrop(page, art) {
    let layer = page.querySelector(':scope > .se-dl-backdrop');
    if (!art) {
      layer?.remove();
      setAttr(page, 'data-se-dl-art', null);
      return;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'se-dl-backdrop';
      layer.setAttribute('aria-hidden', 'true');
      page.prepend(layer);
      mountedNodes.add(layer);
    }
    SE.cssVar(layer, '--se-dl-art', `url("${art.replace(/["\\]/g, '\\$&')}")`);
    setAttr(page, 'data-se-dl-art', '1');
  }

  Object.assign(ns, { appIdFromArt, logoURLs, mountedNodes, syncBackdrop });
})(window.__se);
