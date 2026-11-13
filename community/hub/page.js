/*
 * Community Hub (/app/<id>...): the hub header gets the game's library hero art. The app id
 * comes from the URL; the art is preloaded from Steam's CDN (two hosts, in order) and only
 * set (--se-hub-art, [data-se-hub-art]) once one has loaded, so a game without hero art keeps
 * the plain card. Removed on destroy.
 */
const ART_URLS = (appid) => [
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
];

const preload = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth > 1 ? resolve(url) : reject(new Error('empty')));
    img.onerror = reject;
    img.src = url;
  });

const firstLoaded = async (urls) => {
  for (const url of urls) {
    try {
      return await preload(url);
    } catch {
      // next host
    }
  }
  return null;
};

export default (dom) => {
  const $ = dom.scope();
  const appid = location.pathname.match(/^\/app\/(\d+)/)?.[1];
  let art = null;

  const apply = () => {
    const header = document.querySelector('.apphub_HomeHeader');
    if (!header || !art) return;
    dom.setVar(header, '--se-hub-art', `url("${art}")`);
    dom.mark(header, 'data-se-hub-art');
  };

  if (appid) {
    firstLoaded(ART_URLS(appid)).then((url) => {
      if (!$.alive || !url) return;
      art = url;
      apply();
      $.observe(apply);
    });
  }

  $.add(() => {
    const header = document.querySelector('.apphub_HomeHeader');
    header?.style.removeProperty('--se-hub-art');
    header?.removeAttribute('data-se-hub-art');
  });

  return () => $.destroy();
};
