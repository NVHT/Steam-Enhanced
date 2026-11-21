/*
 * Panels the theme draws in the board's cells (stage/board.js): the panel shell (ownPanel),
 * Favorites and Collections, and the grids sized to the room they get.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    appStore, client, collectionStore, ICON_PLAY, imgTag, onImgError, onImgLoad, panelMenuButton,
  } = ns;
  const { live } = ns;

  const { coverURLs, isInstalled, navigate, run } = SE;

  const own = new Map();
  const spare = new Map();

  function ownPanel(row, cls, build) {
    let entry = own.get(row);
    if (!entry && spare.has(cls)) {
      entry = spare.get(cls);
      spare.delete(cls);
      own.set(row, entry);
    }
    if (!entry) {
      const el = document.createElement('div');
      el.className = `se-hs-own ${cls}`;
      entry = { el, sig: '', cls, apps: [] };
      build(el, entry);
      el.addEventListener('error', onImgError, true);
      el.addEventListener('load', onImgLoad, true);
      own.set(row, entry);
    }
    if (entry.el.parentElement !== row) row.appendChild(entry.el);
    return entry;
  }

  function dropOwn(row) {
    const e = own.get(row);
    e?.el.remove();
    own.delete(row);
  }

  function dropAllOwn(keep) {
    for (const [row, e] of [...own]) {
      if (keep) {
        e.el.remove();
        own.delete(row);
        spare.set(e.cls, e);
      } else {
        dropOwn(row);
      }
    }
    if (!keep) spare.clear();
  }

  live.favCollection = 'favorite';

  /**
   * A game as a wide capsule: art, name and, at its right, its hours (`hours` true), other
   * words (`hours` a string: a date, "2 years ago") or nothing (false); Play when installed.
   */
  const tileHTML = (a, hours = true) =>
    `<button type="button" class="se-hs-tile" data-app="${a.appid}" aria-label="${SE.esc(a.display_name)}">` +
    imgTag(ns.wideURLs(a), 'se-hs-timg') +
    '<span class="se-hs-tshade"></span>' +
    `<span class="se-hs-tfoot"><span class="se-hs-tname">${SE.esc(a.display_name)}</span>${hours ? `<span class="se-hs-thrs">${SE.esc(typeof hours === 'string' ? hours : ns.hoursText(a))}</span>` : ''}</span>` +
    (isInstalled(a) ? `<span class="se-hs-tplay" data-play title="Play">${ICON_PLAY}</span>` : '') +
    '<span class="se-hs-tmore"></span>' +
    '</button>';

  /**
   * A collection's games as capsules (the Favorites panel): `id` the collection (Favorites
   * when it's gone), sorted by `sort` (az | recent | hours), hours on the capsules or not.
   */
  function paintFav(row, id, title, { sort = 'az', hours = true } = {}) {
    let colApps = ns.collectionApps(id);
    if (!colApps && id !== 'favorite') {
      colApps = ns.collectionApps('favorite');
      if (colApps) {
        id = 'favorite';
        title = 'Favorites';
      }
    }
    if (!colApps) {
      dropOwn(row);
      return null;
    }
    live.favCollection = id;
    const entry = ownPanel(row, 'se-hs-fav', (el, self) => {
      el.innerHTML =
        `<div class="se-hs-ohead"><span class="se-hs-nh"></span><span class="se-hs-ncount"></span>${panelMenuButton('Favorites')}</div>` +
        '<div class="se-hs-grid"></div>';
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-more]')) {
          if (!ns.readPick(ns.favPickKey())?.length) navigate(`/library/collection/${encodeURIComponent(live.favCollection)}`);
          return;
        }
        const play = e.target.closest('[data-play]');
        const tile = e.target.closest('[data-app]');
        const app = tile && self.apps.find((a) => String(a.appid) === tile.dataset.app);
        if (!app) return;
        if (play) {
          e.stopPropagation();
          run(() => client().Apps.RunGame(String(app.appid), '', -1, 100));
          return;
        }
        navigate(`/library/app/${app.appid}`);
      });
    });

    // Games chosen (picks.js favPicker) replace the collection
    const kept = ns.readPick(ns.favPickKey());
    const picks = kept?.length ? kept : null;
    if (picks) title = 'Chosen games';
    const list = ns.sorted(picks ? picks.map(ns.appById).filter(Boolean) : colApps, sort);
    entry.apps = list;
    entry.moreNoun = 'favorites';
    const shown = list.slice(0, 30);
    const sig = [
      title,
      sort,
      hours ? 'h' : '',
      list.length,
      picks ? 'p' : '',
      ...shown.map((a) => `${a.appid}:${a.minutes_playtime_forever || 0}:${isInstalled(a) ? 1 : 0}`),
    ].join('|');

    const el = entry.el;
    const grid = el.querySelector('.se-hs-grid');
    if (entry.sig !== sig) {
      entry.sig = sig;
      el.querySelector('.se-hs-nh').textContent = title || 'Favorites';
      el.querySelector('.se-hs-ncount').textContent = `· ${list.length}`;
      grid.innerHTML =
        shown.map((a) => tileHTML(a, hours)).join('') ||
        `<span class="se-hs-empty">${picks ? 'None of the chosen games are in your library' : id === 'favorite' ? 'No favorites yet' : 'No games in this collection'}</span>`;
    }
    return entry;
  }

  // A grid's size, read in layout()'s measuring pass.
  const boxOf = (grid) => ({ W: grid?.clientWidth || 0, H: grid?.clientHeight || 0 });

  // As many rows of capsules as the games need and the cell holds, the last one "+N" when
  // there are more (Favorites; entry.moreNoun names them). Writes only.
  // Capsules across a panel: 3 for every 4 of the board's 12 columns it spans (its cell's span
  // out of the board's columns now, board.js)
  function tilesAcross(el) {
    const cell = el.closest('.se-hs-cell');
    const span = parseInt(cell?.style.gridColumn.replace('span', ''), 10);
    const boardCols = parseInt(cell?.parentElement?.style.getPropertyValue('--se-hs-cols'), 10);
    if (!(span > 0 && boardCols > 0)) return 3;
    return Math.max(1, Math.round(((span / boardCols) * 12) / 4)) * 3;
  }

  function fitTiles(entry, { W, H }) {
    const grid = entry.el.querySelector('.se-hs-grid');
    const tiles = [...grid.querySelectorAll('.se-hs-tile')];
    const GAP = 8; // stage-shelves.css: the grid's gap (--se-space-2)
    /*
     * Up to 3 rows' worth of capsules, 3 for every 4 of the board's 12 columns the panel spans
     * (9 at 4 columns, 18 at 8, 27 at 12), laid out at the largest size the cell holds: the
     * columns that give the biggest capsule for the games shown, so a few games in a wide cell
     * fill it instead of sitting small in its top row. Every capsule keeps Steam's wide shape
     * (460 × 215); the grid is centred in what it leaves.
     */
    const RATIO = 460 / 215;
    const fit = tilesAcross(entry.el) * 3;
    const count = Math.max(1, Math.min(tiles.length, fit));
    let cols = Math.min(3, count);
    let tileW = 0;
    if (W > 0 && H > 0) {
      for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c);
        const w = Math.floor(Math.min((W - GAP * (c - 1)) / c, ((H - GAP * (r - 1)) / r) * RATIO));
        if (w > tileW) {
          tileW = w;
          cols = c;
        }
      }
    }
    const rows = Math.ceil(count / cols);

    SE.cssVar(grid, '--se-hs-fcols', String(cols));
    SE.cssVar(grid, '--se-hs-fcolw', tileW ? `${tileW}px` : 'minmax(0, 1fr)');
    SE.cssVar(grid, '--se-hs-frows', String(rows));
    SE.cssVar(grid, '--se-hs-frowh', tileW ? `${Math.floor(tileW / RATIO)}px` : 'auto');

    const over = Boolean(entry.moreNoun) && tiles.length > fit;
    const show = over || tiles.length > fit ? fit : tiles.length;
    tiles.forEach((t, i) => {
      const hide = i >= show;
      if (t.hidden !== hide) t.hidden = hide;
      const isMore = over && i === fit - 1;
      if (t.hasAttribute('data-more') !== isMore) t.toggleAttribute('data-more', isMore);
      if (isMore) {
        const n = tiles.length - fit + 1;
        const txt = `+${n}`;
        if (t.querySelector('.se-hs-tmore').textContent !== txt) {
          t.querySelector('.se-hs-tmore').textContent = txt;
          t.setAttribute('aria-label', `${n} more ${entry.moreNoun}`);
        }
      } else if (t.querySelector('.se-hs-tmore').textContent) {
        t.querySelector('.se-hs-tmore').textContent = '';
        t.setAttribute('aria-label', entry.apps.find((a) => String(a.appid) === t.dataset.app)?.display_name || '');
      }
    });
  }

  function userCollections() {
    const list = run(() => [...collectionStore().userCollections]) || [];
    return list
      .filter((c) => c && c.id !== 'uncategorized' && (c.bIsEditable || (run(() => c.visibleApps.length) || 0)))
      .sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
  }

  // The `n` most recently played of a collection, in one pass (no copy-and-sort of the whole set).
  function recentOf(apps, n) {
    const top = [];
    for (const app of apps) {
      const t = app?.rt_last_time_played || 0;
      if (top.length === n && t <= (top[n - 1].rt_last_time_played || 0)) continue;
      let i = top.length;
      while (i > 0 && (top[i - 1].rt_last_time_played || 0) < t) i--;
      top.splice(i, 0, app);
      if (top.length > n) top.pop();
    }
    return top;
  }

  /** Your collections as cards, sorted by `sort` (az | size | recent). */
  function paintColl(row, sort = 'az') {
    let list = collectionStore() ? userCollections() : null;
    if (!list) {
      dropOwn(row);
      return null;
    }
    const entry = ownPanel(row, 'se-hs-coll', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh">Collections</span><span class="se-hs-ncount"></span>' +
        `<button type="button" class="se-hs-hall" data-all>View all</button>${panelMenuButton('Collections')}</div>` +
        '<div class="se-hs-clist-box"><div class="se-hs-cgrid" role="list"></div></div>';
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-all]')) {
          navigate('/library/collections');
          return;
        }
        if (e.target.closest('[data-cmore]')) {
          navigate('/library/collections');
          return;
        }
        const r = e.target.closest('[data-coll]');
        if (r) navigate(`/library/collection/${encodeURIComponent(r.dataset.coll)}`);
      });
    });

    const picks = ns.readPick('se-home-coll-pick');
    const total = list.length;
    if (picks) {
      const want = new Set(picks);
      list = list.filter((c) => want.has(String(c.id)));
    }
    const rows = list.map((c) => {
      const colApps = run(() => c.visibleApps) || [];
      return {
        id: c.id,
        name: c.displayName || c.strName || c.id,
        count: run(() => colApps.length) || 0,
        covers: run(() => recentOf(colApps, 3)) || [],
      };
    });
    if (sort === 'size') rows.sort((a, b) => b.count - a.count);
    else if (sort === 'recent') {
      const last = (r) => r.covers[0]?.rt_last_time_played || 0;
      rows.sort((a, b) => last(b) - last(a));
    }

    const sig =
      `${sort}|` +
      (picks ? `${total}|` : '') +
      rows.map((r) => `${r.id}:${r.name}:${r.count}:${r.covers.map((a) => a.appid).join('.')}`).join('|');
    const grid = entry.el.querySelector('.se-hs-cgrid');

    if (entry.sig !== sig) {
      entry.sig = sig;
      entry.el.querySelector('.se-hs-ncount').textContent = picks ? `· ${rows.length} of ${total}` : `· ${rows.length}`;
      const store = appStore();
      grid.innerHTML =
        rows
          .map((r) => {
            const [a, b, c] = r.covers;
            const cover = (app, cls) =>
              app ? `<span class="se-hs-fcov ${cls}">${imgTag(coverURLs(app, store), 'se-hs-fimg2')}</span>` : '';
            return (
              `<button type="button" class="se-hs-ccard" role="listitem" data-coll="${SE.esc(r.id)}" aria-label="${SE.esc(r.name)}">` +
              `<span class="se-hs-ctext"><span class="se-hs-cname">${SE.esc(r.name)}</span>` +
              `<span class="se-hs-csub">${r.count.toLocaleString()} ${r.count === 1 ? 'game' : 'games'}</span></span>` +
              `<span class="se-hs-cfan">${cover(b, 'l')}${cover(c, 'r')}${cover(a, 'm')}</span></button>`
            );
          })
          .join('') +
        '<button type="button" class="se-hs-ccard" data-cmore hidden><span class="se-hs-cmore"></span></button>' +
        (rows.length ? '' : `<span class="se-hs-empty">${picks ? 'No collections chosen' : 'No collections yet'}</span>`);
    }
    return entry;
  }

  // Columns and card height for the room the cell gives, a "+N" card for the rest (writes only).
  function fitColl(entry, { W, H }) {
    const grid = entry.el.querySelector('.se-hs-cgrid');
    const tiles = [...grid.querySelectorAll('[data-coll]')];
    const moreTile = grid.querySelector('[data-cmore]');
    const GAP = 8; // stage-shelves.css: the grid's gap (--se-space-2)
    // 3 rows, as the capsule panels (fitTiles), and 2 cards across for every 4 of the board's
    // 12 columns the panel spans (2, 4, 6: 6, 12 or 18 cards), the rows sharing the cell's
    // height; one card across when the cell is very narrow
    const ROWS = 3;
    const cols = W > 0 && W < 300 ? 1 : (tilesAcross(entry.el) / 3) * 2;
    const fit = cols * ROWS;
    const cardH = H > 0 ? Math.floor(((H - GAP * (ROWS - 1)) / ROWS) * 100) / 100 : 104;

    SE.cssVar(grid, '--se-hs-ccols', String(cols));
    SE.cssVar(grid, '--se-hs-ch', `${cardH}px`);

    const over = tiles.length > fit && fit > 1;
    const show = over ? fit - 1 : Math.min(tiles.length, fit);
    tiles.forEach((t, i) => {
      const hide = i >= show;
      if (t.hidden !== hide) t.hidden = hide;
    });
    if (moreTile) {
      if (moreTile.hidden !== !over) moreTile.hidden = !over;
      const txt = `+${tiles.length - show}`;
      const tm = moreTile.querySelector('.se-hs-cmore');
      if (over && tm.textContent !== txt) {
        tm.textContent = txt;
        moreTile.setAttribute('aria-label', `${tiles.length - show} more collections`);
      }
    }
  }

  function scrollerOf(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.clientHeight > 0) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Elements of Steam's the stage has marked, so a teardown can unmark them
  const marked = new Set();

  function mark(el, name, value = '') {
    SE.mark(el, name, value);
    marked.add(el);
  }

  function clearMarks(keep) {
    for (const el of marked) {
      if (keep?.has(el)) continue;
      for (const a of ['data-se-hs', 'data-se-hs-narrow', 'data-se-hs-event']) {
        SE.unmark(el, a);
      }
      marked.delete(el);
    }
  }

  Object.assign(ns, {
    boxOf, clearMarks, dropAllOwn, dropOwn, fitColl, fitTiles, mark, ownPanel,
    paintColl, paintFav, scrollerOf, tileHTML, userCollections,
  });
})(window.__se);
