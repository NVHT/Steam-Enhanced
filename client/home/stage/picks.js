/*
 * Pickers for the board's panels (Favorites, Collections), opened from a panel's ⋯ menu in its
 * place: reading and saving the choice, the popup, its keyboard and placement.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    appStore, collectionStore, hours, imgTag, onImgError, onImgLoad, schedule, userCollections,
  } = ns;
  const { live } = ns;

  const { coverURLs, run } = SE;

  /*
   * Steam's own source for a game's library art (its GetHeaderImages: the custom capsule, the
   * cached copy, then the CDN, by the file names Steam keeps for the game), found once by its
   * methods.
   */
  const libraryArt = () =>
    SE.findModule('home:library-art', (src, id, req) => {
      if (!src.includes('GetHeaderImagesForAppId') || !src.includes('BHasRecentlyLaunched')) return null;
      for (const value of Object.values(run(() => req(id)) || {})) {
        if (typeof value?.GetHeaderImages === 'function') return value;
      }
      return null;
    });

  /**
   * A game's wide capsule: Steam's own list first, then the file Steam names for it (newer
   * games keep theirs under a hashed path, so a bare header.jpg can miss), then its hero art.
   */
  function wideURLs(app) {
    const s = appStore();
    const list = [];
    const add = (v) => {
      if (Array.isArray(v)) list.push(...v.filter((u) => typeof u === 'string' && u));
      else if (typeof v === 'string' && v) list.push(v);
    };
    add(run(() => libraryArt()?.GetHeaderImages(app)));
    if (s && app.rt_custom_image_mtime) add(run(() => s.GetCustomLandcapeImageURLs(app)));
    const file = app.header_filename || 'header.jpg';
    list.push(`/assets/${app.appid}/${file}`, `${ns.CDN(app.appid)}/${file}`);
    if (file !== 'header.jpg') list.push(`/assets/${app.appid}/header.jpg`, `${ns.CDN(app.appid)}/header.jpg`);
    add(SE.heroURLs(app.appid, s));
    return [...new Set(list)];
  }

  // A collection's games, or null when Steam has no such collection. Falls back to the user
  // collection list, which the Collections panel already reads, if the lookup comes back empty.
  const collectionApps = (id) => {
    if (!id) return null;
    const c =
      run(() => collectionStore().GetCollection(id)) ||
      run(() => [...collectionStore().userCollections].find((col) => col?.id === id));
    return c ? run(() => [...c.visibleApps]) || [] : null;
  };
  const hoursText = (app) =>
    app.minutes_playtime_forever ? `${hours(app.minutes_playtime_forever)} h` : 'Not played';

  function readPick(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(v) ? v.map(String) : null;
    } catch {
      return null;
    }
  }

  function writePick(key, ids) {
    try {
      if (ids) localStorage.setItem(key, JSON.stringify(ids));
      else localStorage.removeItem(key);
    } catch {}
  }

  function appById(id) {
    const s = appStore();
    return (
      run(() => s.GetAppOverviewByAppID(Number(id))) ||
      run(() => s.allApps.find((a) => String(a.appid) === String(id))) ||
      null
    );
  }

  const libraryGames = () =>
    run(() =>
      appStore().allApps.filter(
        (a) => a && (a.app_type === 1 || a.app_type === 1073741824) && a.visible_in_game_list !== false
      )
    ) || [];

  live.pickEl = null;
  let pickOpts = null;
  let pickAnchor = null;
  let pickSide = null;

  function closePick() {
    if (!live.pickEl) return;
    live.pickEl.remove();
    live.pickEl = null;
    pickOpts = null;
    pickSide = null;
    document.removeEventListener('pointerdown', onPickOutside, true);
    document.removeEventListener('keydown', onPickKey, true);
    pickAnchor?.setAttribute('aria-expanded', 'false');
    pickAnchor = null;
  }

  // Back to the menu it came from (its ‹ and Escape), else closed
  function backPick() {
    const { back } = pickOpts || {};
    const a = pickAnchor;
    const s = pickSide;
    closePick();
    if (back) back(s);
    else a?.focus();
  }

  function onPickOutside(e) {
    if (live.pickEl && !live.pickEl.contains(e.target) && !pickAnchor?.contains(e.target)) {
      closePick();
    }
  }

  // By its button, on the side the menu it came from had (menu.js placePop), so it opens in its place
  function placePick() {
    if (!live.pickEl || !pickAnchor?.isConnected) {
      closePick();
      return;
    }
    pickSide = ns.placePop(live.pickEl, pickAnchor, pickSide);
  }

  const pickedNow = () => (pickOpts.single ? [String(pickOpts.current())] : readPick(pickOpts.key) || pickOpts.defaults());

  /*
   * The rows, as the menu's: art, name, a quiet line at the end (hours, games), the square mark;
   * the checkbox kept for the keyboard and the change, not seen
   */
  function paintPick() {
    if (!live.pickEl) return;
    const q = (live.pickEl.querySelector('.se-hs-pk-search')?.value || '').trim().toLowerCase();
    const chosen = new Set(pickedNow());
    const groups = pickOpts.items(q);
    live.pickEl.querySelector('.se-hs-pk-list').innerHTML =
      groups
        .map(
          (g) =>
            (g.label && g.rows.length ? `<div class="se-hs-mn-group"><span>${SE.esc(g.label)}</span></div>` : '') +
            g.rows
              .map((r) => {
                const on = chosen.has(String(r.id));
                const inner =
                  (r.img ? `<span class="se-hs-pk-pic">${imgTag(r.img, 'se-hs-pk-img')}</span>` : '') +
                  `<span class="se-hs-mn-name">${SE.esc(r.name)}</span>` +
                  (r.sub ? `<span class="se-hs-mn-value">${SE.esc(r.sub)}</span>` : '');
                return pickOpts.single
                  ? `<button type="button" class="se-hs-mn-row se-hs-pk-row" role="radio" aria-checked="${on}" data-one="${SE.esc(r.id)}"${on ? ' data-on' : ''}>` +
                      `${inner}<span class="se-hs-mn-mark" data-round></span></button>`
                  : '<label class="se-hs-mn-row se-hs-pk-row">' +
                      `<input type="checkbox" class="se-hs-mn-input" data-id="${SE.esc(r.id)}"${on ? ' checked' : ''}>` +
                      `${inner}<span class="se-hs-mn-mark"></span></label>`;
              })
              .join('')
        )
        .join('') || '<span class="se-hs-empty">Nothing found</span>';
    paintPickFoot();
  }

  // The header's count and the footer's rows: Show all / Show none, or Clear (a choice that
  // replaces something when it has any: the Favorites panel's games)
  function paintPickFoot() {
    if (!live.pickEl || pickOpts.single) return;
    const picks = readPick(pickOpts.key);
    const n = picks?.length || 0;
    live.pickEl.querySelector('.se-hs-pk-count').textContent = pickOpts.clearable
      ? n ? `${n} chosen` : 'None'
      : !picks ? 'All' : n ? `${n} chosen` : 'None';
    const set = (sel, off) => {
      const b = live.pickEl.querySelector(sel);
      if (b) b.disabled = off;
    };
    set('[data-pk-all]', !picks);
    set('[data-pk-none]', Boolean(picks && !n));
    set('[data-pk-clear]', !n);
  }

  function onPickKey(e) {
    if (e.key === 'Escape' && live.pickEl) {
      e.stopPropagation();
      backPick();
    }
  }

  const pickRow = (attr, iconName, name) =>
    `<button type="button" class="se-hs-mn-row" ${attr}>` +
    `<span class="se-hs-mn-icon" style="--se-hs-mn-icon: var(--se-icon-${iconName})"></span>` +
    `<span class="se-hs-mn-name">${name}</span></button>`;

  /*
   * A list to tick, drawn as the Home's menus are (menu.js): a header (‹ back to the menu it
   * came from, the title, how many are chosen), a search box, the rows, Show all and Show
   * none in the footer. Every tick applies at once.
   *   opts { key, title, placeholder, defaults(), items(q), back(side), side }
   *     clearable      none chosen means none kept (Clear in the footer, not Show all / none)
   *     single         one to choose, current() the one set: rows with a round mark, choosing
   *                    one calls onChoose(id) and goes back; no count, no footer
   */
  function openPick(anchor, opts) {
    if (live.pickEl && pickAnchor === anchor) {
      closePick();
      return;
    }
    closePick();
    pickOpts = opts;
    pickAnchor = anchor;
    pickSide = opts.side || null;
    anchor.setAttribute('aria-expanded', 'true');
    live.pickEl = document.createElement('div');
    live.pickEl.className = 'se-hs-pick se-hs-menu se-hs-pk';
    live.pickEl.setAttribute('role', 'dialog');
    live.pickEl.setAttribute('aria-label', opts.title);
    live.pickEl.innerHTML =
      '<div class="se-hs-mn-sum">' +
      (opts.back ? '<button type="button" class="se-hs-pk-back" data-pk-back aria-label="Back"></button>' : '') +
      `<span class="se-hs-mn-title">${SE.esc(opts.title)}</span>${opts.single ? '' : '<span class="se-hs-pk-count"></span>'}</div>` +
      (opts.placeholder
        ? '<label class="se-hs-pk-find"><span class="se-hs-pk-glass"></span>' +
          `<input type="search" class="se-hs-pk-search" placeholder="${SE.esc(opts.placeholder)}" aria-label="${SE.esc(opts.placeholder)}"></label>`
        : '') +
      '<div class="se-hs-mn-body se-hs-pk-list"></div>' +
      (opts.single
        ? ''
        : '<div class="se-hs-mn-foot se-hs-pk-foot">' +
          (opts.clearable
            ? pickRow('data-pk-clear', 'restore', 'Clear')
            : pickRow('data-pk-all', 'list', 'Show all') + pickRow('data-pk-none', 'eye-off', 'Show none')) +
          '</div>');

    live.pickEl.addEventListener('error', onImgError, true);
    live.pickEl.addEventListener('load', onImgLoad, true);
    live.pickEl.addEventListener('input', (e) => {
      if (e.target.matches('.se-hs-pk-search')) {
        paintPick();
        placePick();
      }
    });
    live.pickEl.addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"][data-id]');
      if (!box) return;
      const ids = pickedNow().filter((id) => id !== box.dataset.id);
      if (box.checked) ids.push(box.dataset.id);
      writePick(pickOpts.key, pickOpts.clearable && !ids.length ? null : ids);
      paintPickFoot();
      schedule();
    });
    live.pickEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-pk-back]')) {
        backPick();
        return;
      }
      const one = e.target.closest('[data-one]');
      if (one) {
        pickOpts.onChoose(one.dataset.one);
        backPick();
        return;
      }
      if (e.target.closest('[data-pk-clear]')) {
        writePick(pickOpts.key, null);
        paintPick();
        schedule();
        return;
      }
      const all = e.target.closest('[data-pk-all]');
      if (all || e.target.closest('[data-pk-none]')) {
        writePick(pickOpts.key, all ? null : []);
        paintPick();
        schedule();
      }
    });

    document.body.appendChild(live.pickEl);
    document.addEventListener('pointerdown', onPickOutside, true);
    document.addEventListener('keydown', onPickKey, true);
    paintPick();
    placePick();
    (live.pickEl.querySelector('.se-hs-pk-search') || live.pickEl.querySelector('input'))?.focus();
  }

  /*
   * The games chosen for the Favorites panel: when there are any they replace the collection it
   * shows (tray.js paintFav); none chosen, the collection again
   */
  const favPickKey = () => 'se-home-fav-pick';
  // Rows of the library shown at once (the search finds the rest)
  const LIBRARY_ROWS = 100;

  function favPicker(anchor, from = {}) {
    openPick(anchor, {
      ...from,
      key: favPickKey(),
      title: 'Choose games',
      placeholder: 'Search your library',
      clearable: true,
      defaults: () => [],
      items: (q) => {
        const match = (a) => !q || String(a.display_name || '').toLowerCase().includes(q);
        const row = (a) => ({
          id: String(a.appid),
          name: a.display_name,
          sub: hoursText(a),
          img: coverURLs(a, appStore()),
        });
        const picked = (readPick(favPickKey()) || []).map(appById).filter(Boolean);
        const ids = new Set(picked.map((a) => String(a.appid)));
        const rest = sorted(libraryGames().filter((a) => !ids.has(String(a.appid)) && match(a)), 'az');
        return [
          { label: 'Chosen', rows: sorted(picked.filter(match), 'az').map(row) },
          { label: picked.length ? 'Library' : '', rows: rest.slice(0, LIBRARY_ROWS).map(row) },
        ];
      },
    });
  }

  /** The collection the Favorites panel shows: one to choose, `from.current()` the one set. */
  function sourcePicker(anchor, from) {
    openPick(anchor, {
      ...from,
      single: true,
      title: 'Collection',
      placeholder: 'Search collections',
      items: (q) => {
        const list = [
          { id: 'favorite', name: 'Favorites', apps: collectionApps('favorite') || [] },
          ...userCollections()
            .filter((c) => c.id !== 'favorite')
            .map((c) => ({ id: String(c.id), name: c.displayName || c.strName || String(c.id), apps: run(() => c.visibleApps) || [] })),
        ];
        return [
          {
            label: '',
            rows: list
              .filter((c) => !q || c.name.toLowerCase().includes(q))
              .map((c) => {
                const n = run(() => c.apps.length) || 0;
                return { id: c.id, name: c.name, sub: `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}` };
              }),
          },
        ];
      },
    });
  }

  function collPicker(anchor, from = {}) {
    openPick(anchor, {
      ...from,
      key: 'se-home-coll-pick',
      title: 'Collections to show',
      placeholder: 'Search collections',
      defaults: () => userCollections().map((c) => String(c.id)),
      items: (q) => [
        {
          label: '',
          rows: userCollections()
            .filter((c) => !q || String(c.displayName || c.id).toLowerCase().includes(q))
            .map((c) => {
              const n = run(() => c.visibleApps.length) || 0;
              return {
                id: String(c.id),
                name: c.displayName || c.strName || c.id,
                sub: `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}`,
              };
            }),
        },
      ],
    });
  }

  const sorted = (list, k) =>
    list.slice().sort(
      k === 'recent'
        ? (a, b) => (b.rt_last_time_played || 0) - (a.rt_last_time_played || 0)
        : k === 'hours'
          ? (a, b) => (b.minutes_playtime_forever || 0) - (a.minutes_playtime_forever || 0)
          : (a, b) => String(a.sort_as || a.display_name || '').localeCompare(String(b.sort_as || b.display_name || ''))
    );

  Object.assign(ns, {
    appById, closePick, collPicker, collectionApps, favPickKey, favPicker, hoursText, libraryGames,
    placePick, readPick, sorted, sourcePicker, wideURLs, writePick,
  });
})(window.__se);
