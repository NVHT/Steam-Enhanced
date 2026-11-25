/*
 * Steam Settings › Downloads: the download running now, over Steam's rows (the card
 * pages-hero.css, its bar client/settings/pages-downloads.css).
 *
 * Read from Steam's live download feed (SE.downloadFeed, client/shared/download-feed.js),
 * subscribed only while the page is open: the game downloading (its art, name, how far, its
 * speed and time left, or Paused), else "Nothing downloading": the region and speed limit stay
 * Steam's rows under it, the card doesn't repeat them. The rate is in bits when "Display
 * download rates in bits per second" is on.
 */
((SE) => {
  window.__seSettingsDownloads?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns || !SE.downloadFeed) return;

  const { run, el } = SE;
  const feed = SE.downloadFeed;

  const ROWS = [[/rates in bits/i, 'bits']];

  // The download running: its game, how far, speed and time left (Steam's overview)
  function readDownload() {
    const overview = feed.overview;
    const appid = Number(overview?.update_appid) || 0;
    if (!appid) return null;
    const store = run(() => SE.global('appStore', (s) => s.allApps));
    const app = run(() => store.GetAppOverviewByAppID(appid));
    const done = Number(overview.update_bytes_downloaded) || 0;
    const total = Number(overview.update_bytes_to_download) || 0;
    const percent = Number(overview.overall_percent_complete);
    return {
      name: app?.display_name || '',
      urls: run(() => SE.heroURLs(appid, store)) || [],
      percent: Number.isFinite(percent) ? percent : total > 0 ? (done / total) * 100 : 0,
      speed: Number(overview.update_network_bytes_per_second) || 0,
      seconds: Number(overview.overall_estimated_time_remaining_sec ?? overview.update_seconds_remaining) || 0,
      paused: Boolean(overview.paused),
    };
  }

  const speedText = (bytes, bits) => {
    const value = bits ? bytes * 8 : bytes;
    const unit = bits ? 'bit/s' : 'B/s';
    return value >= 1e6 ? `${(value / 1e6).toFixed(1)} M${unit}` : `${Math.round(value / 1e3)} K${unit}`;
  };

  function timeText(seconds) {
    if (!(seconds > 0)) return '';
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min left`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours} h ${minutes % 60} min left` : `${hours} h left`;
  }

  // Subscribed while a view is open; make() can run inside pageView(), before `view` is set
  let unsubscribe = null;
  let view = null;
  const resync = () => view?.sync();
  view = ns.pageView({
    route: 'downloads',
    make() {
      const hero = ns.pageHero();
      hero.root.setAttribute('aria-live', 'polite');
      const bar = el('div', 'se-dl-bar');
      const fill = el('span');
      bar.append(fill);
      hero.body.append(bar);
      unsubscribe ||= feed.subscribe(resync);
      return {
        root: hero.root,
        hero,
        bar,
        fill,
        destroy() {
          if (view?.views.size) return; // another view still shows it
          unsubscribe?.();
          unsubscribe = null;
        },
      };
    },
    read(page) {
      const rows = ns.rowsOf(page, ROWS);
      return {
        bits: ns.switchOn(rows.bits),
        dl: readDownload(),
      };
    },
    draw(v, { bits, dl }) {
      v.hero.setArt(dl?.urls || []);
      v.bar.hidden = !dl;
      v.hero.title(dl ? dl.name || 'Downloading' : 'Nothing downloading');
      v.hero.line(
        dl
          ? [`${Math.floor(dl.percent)}%`, dl.paused ? 'Paused' : dl.speed ? speedText(dl.speed, bits) : '', dl.paused ? '' : timeText(dl.seconds)]
              .filter(Boolean)
              .join(' · ')
          : ''
      );
      v.fill.style.transform = `scaleX(${dl ? Math.max(0, Math.min(1, dl.percent / 100)) : 0})`;
    },
  });

  window.__seSettingsDownloads = {
    destroy() {
      view.destroy();
      unsubscribe?.();
      unsubscribe = null;
      delete window.__seSettingsDownloads;
    },
  };
})(window.__se);
