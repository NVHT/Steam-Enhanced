/*
 * Steam Settings › Family: the Steam Families intro as a hero over your library's art (styles:
 * client/settings/pages.css, "Family").
 *
 * The art is the capsules of the games you played last (what a family would share), in rows at
 * the hero's right, in the body holding the intro and its button (layout.js marks it
 * [data-se-family] for the layout); in a family that button is gone and no art is added.
 *
 * The page is found by its route (the content's id ends "/settings/family_Content"), the same in
 * every language. The art is the theme's own node beside Steam's; Steam's nodes stay as they are.
 */
((SE) => {
  window.__seSettingsFamily?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  const PAGE = '[id$="/settings/family_Content"]';
  const SHOWN = 12; // capsules: three rows of four
  const SPARE = 12; // more games to stand in for art that fails to load

  // The games you played last, each with its capsule's copies (Steam's list first)
  const games = () => {
    const { store, apps } = ns.recentGames(SHOWN + SPARE);
    if (!store) return [];
    return apps.map((app) => run(() => SE.headerURLs(app.appid, store)) || []).filter((urls) => urls.length);
  };

  const createView = (body) => {
    const list = games();
    if (!list.length) return null; // no art: the plain card
    const art = el('div', 'se-fam-art');
    art.setAttribute('aria-hidden', 'true');
    const wall = el('div', 'se-fam-wall');
    const spares = list.slice(SHOWN);
    // A capsule whose every copy fails gives its place to the next game, so no row has a gap
    const capsule = (urls) => {
      const img = SE.art.img(urls, '', () => {
        const next = spares.shift();
        if (next && img.isConnected) img.replaceWith(capsule(next));
        else img.remove();
      });
      img.decoding = 'async';
      return img;
    };
    for (const urls of list.slice(0, SHOWN)) wall.append(capsule(urls));
    art.append(wall);
    body.append(art);
    return { destroy: () => art.remove() };
  };

  const mounted = SE.mount(
    'Settings family',
    // The body holding the intro's button (Steam's plain class), not layout.js's mark, which may
    // land after this scan
    () => [...document.querySelectorAll(`${PAGE} .DialogBody:has(> .TrySteamFamiliesButtonContainer)`)],
    createView,
    // Before the page's first paint, so the hero never shows bare
    { sync: true, scope: PAGE, ignore: SE.inside('.se-fam-art') }
  );

  window.__seSettingsFamily = {
    destroy() {
      mounted.destroy();
      delete window.__seSettingsFamily;
    },
  };
})(window.__se);
