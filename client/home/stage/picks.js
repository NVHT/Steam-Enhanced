/*
 * Pickers for the board's panels (Favorites, Collections), opened from a panel's ⋯ menu in its
 * place, on the theme's picker (client/shared/picker.js): what each lists and where its choice is kept.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { appStore, collectionStore, hours, libraryArt, schedule, userCollections } = ns;

  const { coverURLs, run } = SE;
  const { close: closePick, open: openPick, place: placePick, read: readPick, write: writePick } = SE.picker;

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
      onChange: schedule,
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
      onChange: schedule,
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
