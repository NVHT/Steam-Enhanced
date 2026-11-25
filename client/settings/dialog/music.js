/*
 * Steam Settings › Music: your soundtracks (the card pages-hero.css, its covers
 * client/settings/pages-music.css).
 *
 *   [ 6 soundtracks                                             ]
 *   [ [cover][cover][cover][cover][cover][cover]                ]
 *
 * Your Library's music albums (Steam's BIsMusicAlbum), newest first. The volume and the
 * switches stay Steam's rows under it: the card doesn't repeat them.
 */
((SE) => {
  window.__seSettingsMusic?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { el, run } = SE;
  const SHOWN = 6;

  const soundtracks = () => {
    const store = run(() => SE.global('appStore', (s) => s.allApps));
    const albums = (run(() => store.allApps) || [])
      .filter((a) => run(() => a.BIsMusicAlbum?.()))
      .sort((a, b) => (b.rt_purchased_time || 0) - (a.rt_purchased_time || 0));
    return { store, albums };
  };

  const view = ns.pageView({
    route: 'music',
    make() {
      const hero = ns.pageHero();
      const { store, albums } = soundtracks();
      const strip = el('div', 'se-page-hero-covers se-music-strip');
      // Twice as many as shown: one whose art fails leaves, the next takes its place (CSS shows six)
      for (const app of albums.slice(0, SHOWN * 2)) {
        const urls = run(() => SE.headerURLs(app.appid, store)) || [];
        if (!urls.length) continue;
        const cover = el('div', 'se-page-hero-cover');
        cover.append(SE.art.img(urls, '', () => cover.remove()));
        strip.append(cover);
      }
      if (albums.length) hero.body.append(strip);
      hero.title(albums.length ? `${albums.length} ${albums.length === 1 ? 'soundtrack' : 'soundtracks'}` : 'Soundtracks');
      hero.line(albums.length ? '' : 'Soundtracks you own play here');
      return { root: hero.root };
    },
    // Nothing of the page's rows: drawn once
    read: () => null,
    draw() {},
  });

  window.__seSettingsMusic = {
    destroy() {
      view.destroy();
      delete window.__seSettingsMusic;
    },
  };
})(window.__se);
