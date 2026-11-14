/*
 * Pickers for the tray columns (Favorites, What's New sources, Collections): reading and
 * saving the choice, the popup, its keyboard and placement.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    appStore, collectionStore, hours, imgTag, onImgError, onImgLoad, schedule, userCollections,
  } = ns;
  const { live } = ns;

  const { coverURLs, run } = SE;

  function wideURLs(app) {
    const s = appStore();
    const list = [];
    const add = (v) => {
      if (Array.isArray(v)) list.push(...v.filter(Boolean));
      else if (typeof v === 'string' && v) list.push(v);
    };
    if (s) {
      if (app.rt_custom_image_mtime) {
        add(run(() => s.GetCustomLandcapeImageURLs(app)));
        add(run(() => s.GetCustomLandscapeImageURLs(app)));
      }
      add(run(() => s.GetCachedLandscapeImageURL(app)));
      add(run(() => s.GetLandscapeImageURLForApp(app)));
    }
    list.push(
      `/assets/${app.appid}/header.jpg`,
      `${ns.CDN(app.appid)}/header.jpg`,
      `/assets/${app.appid}/library_hero.jpg`
    );
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

  function closePick() {
    if (!live.pickEl) return;
    live.pickEl.remove();
    live.pickEl = null;
    pickOpts = null;
    document.removeEventListener('pointerdown', onPickOutside, true);
    document.removeEventListener('keydown', onPickKey, true);
    pickAnchor?.setAttribute('aria-expanded', 'false');
    pickAnchor = null;
  }

  function onPickOutside(e) {
    if (live.pickEl && !live.pickEl.contains(e.target) && !pickAnchor?.contains(e.target)) {
      closePick();
    }
  }

  function placePick() {
    if (!live.pickEl || !pickAnchor?.isConnected) {
      closePick();
      return;
    }
    const r = pickAnchor.getBoundingClientRect();
    const w = live.pickEl.offsetWidth;
    const h = live.pickEl.offsetHeight;
    const left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12));
    const top = r.bottom + 8 + h <= innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - 8 - h);
    live.pickEl.style.left = `${left}px`;
    live.pickEl.style.top = `${top}px`;
  }

  const pickedNow = () => readPick(pickOpts.key) || pickOpts.defaults();

  function paintPick() {
    if (!live.pickEl) return;
    const q = (live.pickEl.querySelector('.se-hs-pk-search')?.value || '').trim().toLowerCase();
    const chosen = new Set(pickedNow());
    const groups = pickOpts.items(q);
    live.pickEl.querySelector('.se-hs-pk-list').innerHTML =
      groups
        .map(
          (g) =>
            (g.label && g.rows.length ? `<div class="se-hs-pk-group">${SE.esc(g.label)}</div>` : '') +
            g.rows
              .map(
                (r) =>
                  '<label class="se-hs-pk-row">' +
                  `<input type="checkbox" data-id="${SE.esc(r.id)}"${chosen.has(String(r.id)) ? ' checked' : ''}>` +
                  (r.img ? `<span class="se-hs-pk-pic">${imgTag(r.img, 'se-hs-pk-img')}</span>` : '') +
                  `<span class="se-hs-pk-text"><span class="se-hs-pk-name">${SE.esc(r.name)}</span>${r.sub ? `<span class="se-hs-pk-sub">${SE.esc(r.sub)}</span>` : ''}</span>` +
                  '</label>'
              )
              .join('')
        )
        .join('') || '<span class="se-hs-empty">Nothing found</span>';
    paintPickFoot();
  }

  function paintPickFoot() {
    if (!live.pickEl) return;
    const picks = readPick(pickOpts.key);
    live.pickEl.querySelector('.se-hs-pk-count').textContent = !picks
      ? pickOpts.allText
      : picks.length
        ? `${picks.length} chosen`
        : 'None shown';
    live.pickEl.querySelector('[data-pk-all]').disabled = !picks;
    live.pickEl.querySelector('[data-pk-none]').disabled = Boolean(picks && !picks.length);
  }

  function onPickKey(e) {
    if (e.key === 'Escape' && live.pickEl) {
      e.stopPropagation();
      const a = pickAnchor;
      closePick();
      a?.focus();
    }
  }

  function openPick(anchor, opts) {
    if (live.pickEl && pickAnchor === anchor) {
      closePick();
      return;
    }
    closePick();
    pickOpts = opts;
    pickAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    live.pickEl = document.createElement('div');
    live.pickEl.className = 'se-hs-pick';
    live.pickEl.setAttribute('role', 'dialog');
    live.pickEl.setAttribute('aria-label', opts.title);
    live.pickEl.innerHTML =
      `<div class="se-hs-pk-head"><span class="se-hs-pk-title">${SE.esc(opts.title)}</span>` +
      '<button type="button" class="se-hs-pk-x" data-pk-close aria-label="Close">×</button></div>' +
      (opts.placeholder
        ? `<input type="search" class="se-hs-pk-search" placeholder="${SE.esc(opts.placeholder)}" aria-label="${SE.esc(opts.placeholder)}">`
        : '') +
      '<div class="se-hs-pk-list"></div>' +
      '<div class="se-hs-pk-foot"><span class="se-hs-pk-count"></span>' +
      '<button type="button" class="se-hs-hall" data-pk-all>Show all</button>' +
      '<button type="button" class="se-hs-hall" data-pk-none>Show none</button>' +
      '<button type="button" class="se-hs-pk-done" data-pk-close>Done</button></div>';

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
      writePick(pickOpts.key, ids);
      paintPickFoot();
      schedule();
    });
    live.pickEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-pk-close]')) {
        closePick();
        return;
      }
      if (e.target.closest('[data-pk-all]')) {
        writePick(pickOpts.key, null);
        paintPick();
        schedule();
      }
      if (e.target.closest('[data-pk-none]')) {
        writePick(pickOpts.key, []);
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

  function favPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-fav-pick',
      title: 'Games in Favorites',
      placeholder: 'Search your library',
      allText: 'Showing all favorites',
      defaults: () => (collectionApps(live.favCollection) || []).map((a) => String(a.appid)),
      items: (q) => {
        const favs = sorted(collectionApps(live.favCollection) || [], 'az');
        const ids = new Set(favs.map((a) => String(a.appid)));
        const match = (a) => !q || String(a.display_name || '').toLowerCase().includes(q);
        const row = (a) => ({
          id: String(a.appid),
          name: a.display_name,
          sub: hoursText(a),
          img: coverURLs(a, appStore()),
        });
        const extra = (readPick('se-home-fav-pick') || [])
          .filter((id) => !ids.has(id))
          .map(appById)
          .filter(Boolean);
        const more =
          q.length >= 2
            ? sorted(
                libraryGames().filter((a) => !ids.has(String(a.appid)) && match(a)),
                'az'
              ).slice(0, 40)
            : [];
        const seen = new Set();
        const once = (list) => list.filter((a) => !seen.has(String(a.appid)) && seen.add(String(a.appid)));
        return [
          { label: '', rows: once(favs.filter(match)).map(row) },
          { label: 'Other games', rows: once([...extra.filter(match), ...more]).map(row) },
        ];
      },
    });
  }

  function newsPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-news-types',
      title: 'News types',
      placeholder: '',
      allText: 'Showing every type',
      defaults: () => Object.keys(ns.NEWS_TYPES),
      items: () => [
        {
          label: '',
          rows: Object.entries(ns.NEWS_TYPES).map(([id, name]) => ({
            id,
            name,
            sub: ns.NEWS_SUBS[id] || '',
          })),
        },
      ],
    });
  }

  function collPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-coll-pick',
      title: 'Collections to show',
      placeholder: 'Search collections',
      allText: 'Showing all collections',
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
    appById, closePick, collPicker, collectionApps, favPicker, hoursText, newsPicker, placePick,
    readPick, sorted, wideURLs,
  });
})(window.__se);
