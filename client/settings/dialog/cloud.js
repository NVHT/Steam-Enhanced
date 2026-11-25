/*
 * Steam Settings › Cloud: whose saves Steam Cloud keeps, over Steam's two rows (the card
 * pages-hero.css, its covers client/settings/pages-cloud.css).
 *
 * Your recently played games are asked for their app details (Steam's appDetailsStore, else
 * SteamClient.Apps.RegisterForAppDetails), registered only while the page is open; the ones that
 * support Steam Cloud show as a strip of covers, a game whose own Cloud switch is off dimmed. The
 * title and line follow the page's "Enable Steam Cloud" switch: off, the strip dims and the line
 * says saves stay on this PC.
 */
((SE) => {
  window.__seSettingsCloud?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  const ASKED = 16; // recent games asked about
  const SHOWN = 6; // covers in the strip (one row at the page's width)
  const ROWS = [[/^enable steam cloud/i, 'cloud']];

  // An app's details as Steam sends them, now and on change; → unregister
  function watchDetails(appid, onDetails) {
    const store = run(() => SE.global('appDetailsStore', (s) => typeof s.GetAppDetails === 'function'));
    const now = run(() => store?.GetAppDetails(appid));
    if (now) onDetails(now);
    const handle =
      typeof store?.RegisterForAppData === 'function'
        ? run(() => store.RegisterForAppData(appid, onDetails))
        : SE.steamCall('Apps', 'RegisterForAppDetails', appid, onDetails);
    return () => run(() => handle?.unregister());
  }

  // make() can run inside pageView(), before `view` is set: details answered then wait for it
  let view = null;
  const resync = () => view?.sync();

  view = ns.pageView({
    route: 'cloud',
    make() {
      const hero = ns.pageHero();
      const strip = el('div', 'se-page-hero-covers se-cloud-strip');
      hero.body.append(strip);
      const v = { root: hero.root, hero, strip, games: new Map(), stops: [] };
      const { store, apps } = ns.recentGames(ASKED);
      // Covers in recency order, each shown once its details say it supports Cloud
      for (const app of apps) {
        const cover = el('div', 'se-page-hero-cover');
        cover.hidden = true;
        const urls = run(() => SE.headerURLs(app.appid, store)) || [];
        if (urls.length) cover.append(SE.art.img(urls, ''));
        strip.append(cover);
        v.games.set(app.appid, { cover, cloud: false, on: true });
        v.stops.push(
          watchDetails(app.appid, (details) => {
            const game = v.games.get(app.appid);
            if (!game || !details) return;
            game.cloud = Boolean(details.bCloudAvailable ?? details.bCloudEnabledForApp);
            game.on = details.bCloudEnabledForApp !== false;
            resync();
          })
        );
      }
      v.destroy = () => {
        for (const stop of v.stops) stop();
      };
      return v;
    },
    read: (page) => {
      const field = ns.rowsOf(page, ROWS).cloud;
      return { on: field ? ns.switchOn(field) : true };
    },
    draw(v, { on }) {
      SE.attr(v.root, 'data-off', on ? null : '');
      let shown = 0;
      for (const game of v.games.values()) {
        const show = game.cloud && shown < SHOWN;
        if (show) shown++;
        if (game.cover.hidden === show) game.cover.hidden = !show;
        SE.attr(game.cover, 'data-off', show && !game.on ? '' : null);
      }
      const count = [...v.games.values()].filter((g) => g.cloud).length;
      v.hero.title(on ? 'Your saves follow you' : 'Steam Cloud is off');
      v.hero.line(
        !on
          ? 'Saves stay on this PC'
          : count
            ? `${count} of your recent games keep their saves in Steam Cloud`
            : 'Games that support it keep their saves in Steam Cloud'
      );
      SE.attr(v.strip, 'data-empty', shown ? null : '');
    },
  });

  window.__seSettingsCloud = {
    destroy() {
      view.destroy();
      delete window.__seSettingsCloud;
    },
  };
})(window.__se);
