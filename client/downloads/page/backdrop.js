/*
 * The downloading game's art behind the page (its logo over it is hero.js's).
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { setAttr } = ns;

  // Nodes the theme mounted on the page (the backdrop, the hero, the drag grips), removed on teardown
  const mountedNodes = new Set();

  // Steam's art URLs carry the app id: /assets/<appid>/… (cache), …/apps/<appid>/… (CDN),
  // /customimages/<appid>_… (artwork the user set).
  const ART_APPID = /\/(?:assets|apps)\/(\d+)(?:[/?]|$)|\/customimages\/(\d+)[._]/;
  const appIdFromArt = (src) => {
    const match = ART_APPID.exec(src || '');
    return match ? match[1] || match[2] : null;
  };

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

  Object.assign(ns, { appIdFromArt, mountedNodes, syncBackdrop });
})(window.__se);
