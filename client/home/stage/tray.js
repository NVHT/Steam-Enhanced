/*
 * The tray under the stage: the theme's own panels, the Favorites and Collections grids sized
 * to the room they get, and marking Steam's Home rows by kind.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    ADD_SHELF, appStore, client, COLLECTION_TILE, collectionStore, COVER, ICON_PICK, ICON_PLAY,
    imgTag, NEWS, onImgError, onImgLoad, PLAY_NEXT, RECENT, SHELF, SHELF_HEADER,
  } = ns;
  const { live } = ns;

  const { coverURLs, findDown, isInstalled, navigate, run } = SE;

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
      build(el);
      el.addEventListener('error', onImgError, true);
      el.addEventListener('load', onImgLoad, true);
      entry = { el, sig: '', cls };
      own.set(row, entry);
    }
    if (entry.el.parentElement !== row) row.appendChild(entry.el);
    SE.mark(row, 'data-se-hs-own');
    return entry;
  }

  function dropOwn(row) {
    const e = own.get(row);
    e?.el.remove();
    own.delete(row);
    SE.unmark(row, 'data-se-hs-own');
  }

  function dropAllOwn(keep) {
    for (const [row, e] of [...own]) {
      if (keep) {
        e.el.remove();
        own.delete(row);
        SE.unmark(row, 'data-se-hs-own');
        spare.set(e.cls, e);
      } else {
        dropOwn(row);
      }
    }
    if (!keep) spare.clear();
    document.querySelectorAll('[data-se-hs-own]').forEach((el) => el.removeAttribute('data-se-hs-own'));
  }

  live.favCollection = 'favorite';
  let favApps = [];

  function paintFav(row, id, title) {
    // The shelf's own collection; else Favorites, so the column never shows an empty Steam shelf
    // (a shelf with no readable collection id, or one Steam can't resolve).
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
    const entry = ownPanel(row, 'se-hs-fav', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh"></span><span class="se-hs-ncount"></span>' +
        `<button type="button" class="se-hs-pickbtn" data-pick aria-label="Choose games" title="Choose games" aria-haspopup="dialog" aria-expanded="false">${ICON_PICK}</button></div>` +
        '<div class="se-hs-grid"></div>';
      el.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          ns.favPicker(pick);
          return;
        }
        if (e.target.closest('[data-more]')) {
          navigate(`/library/collection/${encodeURIComponent(live.favCollection)}`);
          return;
        }
        const play = e.target.closest('[data-play]');
        const tile = e.target.closest('[data-app]');
        const app = tile && favApps.find((a) => String(a.appid) === tile.dataset.app);
        if (!app) return;
        if (play) {
          e.stopPropagation();
          run(() => client().Apps.RunGame(String(app.appid), '', -1, 100));
          return;
        }
        navigate(`/library/app/${app.appid}`);
      });
    });

    const k = 'az';
    const picks = ns.readPick('se-home-fav-pick');
    const list = ns.sorted(picks ? picks.map(ns.appById).filter(Boolean) : colApps, k);
    favApps = list;
    const shown = list.slice(0, 30);
    const sig = [
      title,
      k,
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
        shown
          .map(
            (a) =>
              `<button type="button" class="se-hs-tile" data-app="${a.appid}" aria-label="${SE.esc(a.display_name)}">` +
              imgTag(ns.wideURLs(a), 'se-hs-timg') +
              '<span class="se-hs-tshade"></span>' +
              `<span class="se-hs-tfoot"><span class="se-hs-tname">${SE.esc(a.display_name)}</span><span class="se-hs-thrs">${SE.esc(ns.hoursText(a))}</span></span>` +
              (isInstalled(a) ? `<span class="se-hs-tplay" data-play title="Play">${ICON_PLAY}</span>` : '') +
              '<span class="se-hs-tmore"></span>' +
              '</button>'
          )
          .join('') || `<span class="se-hs-empty">${picks ? 'No games chosen' : 'No favorites yet'}</span>`;
    }
    return entry;
  }

  // A grid's size, read in layout()'s measuring pass.
  const boxOf = (grid) => ({ W: grid?.clientWidth || 0, H: grid?.clientHeight || 0 });

  // As many rows of capsules as the games need and the tray holds (writes only).
  function fitFav(entry, { W, H }) {
    const grid = entry.el.querySelector('.se-hs-grid');
    const tiles = [...grid.querySelectorAll('.se-hs-tile')];
    const GAP = 10;
    const natural = (W - GAP * 2) / 3 / (460 / 215);
    const room = W > 0 && H > 0 ? Math.max(1, Math.floor((H + GAP) / (natural * 0.85 + GAP))) : 2;
    const rows = Math.max(1, Math.min(room, Math.ceil(tiles.length / 3)));
    const fit = room * 3;
    const rowH =
      !(W > 0 && H > 0)
        ? 'auto'
        : rows === room
          ? '1fr'
          : `${Math.floor(Math.min(natural * 1.15, (H - GAP * (rows - 1)) / rows))}px`;

    SE.cssVar(grid, '--se-hs-frows', String(rows));
    SE.cssVar(grid, '--se-hs-frowh', rowH);

    const over = tiles.length > fit;
    const show = over ? fit : tiles.length;
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
          t.setAttribute('aria-label', `${n} more favorites`);
        }
      } else if (t.querySelector('.se-hs-tmore').textContent) {
        t.querySelector('.se-hs-tmore').textContent = '';
        t.setAttribute('aria-label', favApps.find((a) => String(a.appid) === t.dataset.app)?.display_name || '');
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

  function paintColl(row) {
    let list = collectionStore() ? userCollections() : null;
    if (!list) {
      dropOwn(row);
      return null;
    }
    const entry = ownPanel(row, 'se-hs-coll', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh">Collections</span><span class="se-hs-ncount"></span>' +
        `<button type="button" class="se-hs-pickbtn" data-pick aria-label="Choose collections" title="Choose collections" aria-haspopup="dialog" aria-expanded="false">${ICON_PICK}</button>` +
        '<button type="button" class="se-hs-hall" data-all>View all</button></div><div class="se-hs-clist-box"><div class="se-hs-cgrid" role="list"></div></div>';
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-all]')) {
          navigate('/library/collections');
          return;
        }
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          ns.collPicker(pick);
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

    const sig =
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

  // Columns and card height for the room the tray gives, a "+N" card for the rest (writes only).
  function fitColl(entry, { W, H }) {
    const grid = entry.el.querySelector('.se-hs-cgrid');
    const tiles = [...grid.querySelectorAll('[data-coll]')];
    const moreTile = grid.querySelector('[data-cmore]');
    const GAP = 10;
    const cols = W >= 600 ? 3 : W < 300 ? 1 : 2;
    let fit = tiles.length;
    let cardH = 104;

    if (W > 0 && H > 0) {
      const least = cols === 1 ? 64 : 84;
      const room = Math.max(1, Math.floor((H + GAP) / (least + GAP)));
      const rowCount = Math.max(1, Math.min(room, Math.ceil((tiles.length || 1) / cols)));
      const share = (H - GAP * (rowCount - 1)) / rowCount;
      cardH = rowCount === room ? Math.floor(share * 100) / 100 : Math.floor(Math.min(124, share));
      fit = cols * room;
    }

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

  function idIn(p) {
    for (const k of ['strCollectionId', 'collectionId', 'strCollectionID', 'collectionid']) {
      if (typeof p[k] === 'string') return p[k];
    }
    for (const k of ['collection', 'showcase']) {
      const v = p[k];
      if (v && typeof v === 'object') {
        for (const kk of ['strCollectionId', 'm_strId', 'id']) {
          if (typeof v[kk] === 'string') return v[kk];
        }
      }
    }
    return null;
  }

  const shelfIds = new WeakMap();

  function shelfId(shelf) {
    if (shelfIds.has(shelf)) return shelfIds.get(shelf);
    let id = SE.fromProps(shelf, 8, idIn);
    if (!id) {
      const down = findDown(shelf, (p) => Boolean(idIn(p)));
      id = down ? idIn(down) : null;
    }
    if (id) shelfIds.set(shelf, id);
    return id;
  }

  function isFavorites(shelf) {
    const id = shelfId(shelf);
    if (id) return id === 'favorite';
    return /favo/i.test(shelf.querySelector(SHELF_HEADER)?.textContent || '');
  }

  function kindOf(el) {
    if (el.matches(NEWS) || el.querySelector(NEWS)) return 'news';
    if (el.matches(ADD_SHELF) || (el.querySelector(ADD_SHELF) && !el.querySelector(SHELF))) return 'add';
    if (el.querySelector(PLAY_NEXT)) return 'playnext';
    if (el.matches(RECENT) || el.querySelector(RECENT)) return 'recent';
    const shelf = el.matches(SHELF) ? el : el.querySelector(SHELF);
    if (!shelf) return 'other';
    if (shelf.querySelector(COLLECTION_TILE)) return 'coll';
    const name = shelf.querySelector(SHELF_HEADER)?.textContent || '';
    if (/collection/i.test(name) && !shelf.querySelector(COVER)) return 'coll';
    return isFavorites(shelf) ? 'fav' : 'shelf';
  }

  function scrollerOf(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.clientHeight > 0) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  function mark(el, name, value = '') {
    SE.mark(el, name, value);
    ns.marked.add(el);
  }

  function clearMarks(keep) {
    for (const el of ns.marked) {
      if (keep?.has(el)) continue;
      for (const a of [
        'data-se-hs',
        'data-se-hs-lock',
        'data-se-hs-narrow',
        'data-se-hs-n',
        'data-se-hs-flat',
        'data-se-hs-sec',
        'data-se-hs-col',
        'data-se-hs-last',
      ]) {
        SE.unmark(el, a);
      }
      ns.marked.delete(el);
    }
  }

  Object.assign(ns, {
    boxOf, clearMarks, dropAllOwn, dropOwn, fitColl, fitFav, isFavorites, kindOf, mark, own,
    paintColl, paintFav, scrollerOf, shelfId, userCollections,
  });
})(window.__se);
