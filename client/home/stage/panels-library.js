/*
 * A board panel drawn from the library (board.js adds it to its list): Recently added (newest
 * in the library), a grid of capsules (tileHTML, fitTiles) with Play on installed games; not
 * on the board until turned on in the Home stage menu.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { client, fitTiles, libraryGames, ownPanel, panelMenuButton, playable, tileHTML } = ns;
  const { isInstalled, navigate, run } = SE;

  const DAY = 86400;
  const LIST = 30; // capsules painted; fitTiles shows what fits
  const now = () => Date.now() / 1000;

  // The library's games, hidden and non-game entries left out, installed ones only if asked
  const pool = (games) => libraryGames().filter((a) => playable(a) && (games !== 'installed' || isInstalled(a)));

  /**
   * A panel of capsules: heading, the grid, Play on installed games.
   * `rows` are [{ app, text }]; the panel repaints only when `sig` changes.
   */
  function paintTiles(cell, cls, title, { rows, sig, empty }) {
    const entry = ownPanel(cell, cls, (el, self) => {
      el.innerHTML =
        `<div class="se-hs-ohead"><span class="se-hs-nh">${SE.esc(title)}</span>${panelMenuButton(title)}</div>` +
        '<div class="se-hs-grid"></div>';
      el.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-app]');
        const app = tile && self.apps.find((a) => String(a.appid) === tile.dataset.app);
        if (!app) return;
        if (e.target.closest('[data-play]')) {
          e.stopPropagation();
          run(() => client().Apps.RunGame(String(app.appid), '', -1, 100));
          return;
        }
        navigate(`/library/app/${app.appid}`);
      });
    });
    entry.apps = rows.map((r) => r.app);
    const full = `${sig}|${rows.map((r) => `${r.app.appid}:${isInstalled(r.app) ? 1 : 0}:${r.text}`).join('|')}`;
    if (entry.sig !== full) {
      entry.sig = full;
      entry.el.querySelector('.se-hs-grid').innerHTML =
        rows.map((r) => tileHTML(r.app, r.text)).join('') || `<span class="se-hs-empty">${empty}</span>`;
    }
    return { entry, grid: entry.el.querySelector('.se-hs-grid'), fit: fitTiles };
  }

  /* ---------- Recently added ---------- */

  const dateText = (rt) =>
    new Date(rt * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(now() - rt > 300 * DAY ? { year: 'numeric' } : {}),
    });

  // The newest games, kept for 5 s like the stage's other lists: the board repaints on every
  // Home change, and each pick walks the whole library
  const addedCache = { at: 0, sig: '', list: [] };
  const newestGames = (show, games) => {
    const sig = `${show}|${games}`;
    if (sig === addedCache.sig && Date.now() - addedCache.at < 5000) return addedCache.list;
    const list = pool(games)
      .filter((a) => a.rt_purchased_time > 0 && (show !== 'unplayed' || !a.minutes_playtime_forever))
      .sort((a, b) => b.rt_purchased_time - a.rt_purchased_time)
      .slice(0, LIST);
    Object.assign(addedCache, { at: Date.now(), sig, list });
    return list;
  };

  function paintAdded(cell, { show, games }) {
    const list = newestGames(show, games);
    return paintTiles(cell, 'se-hs-added', 'Recently added', {
      rows: list.map((app) => ({ app, text: dateText(app.rt_purchased_time) })),
      sig: `${show}|${games}`,
      empty: show === 'unplayed' ? 'Every game added has been played' : 'No games added yet',
    });
  }

  /* ---------- Their place on the board (board.js) ---------- */

  const GAMES = [['all', 'All'], ['installed', 'Installed']];

  ns.LIBRARY_PANELS = {
    added: {
      name: 'Recently added',
      desc: 'The newest games in your library',
      span: 4,
      // Its capsules set the board's height (board.js's boardIdeal)
      capsules: true,
      opts: { show: [['all', 'All'], ['unplayed', 'Not played']], games: GAMES },
      paint: paintAdded,
    },
  };
})(window.__se);
