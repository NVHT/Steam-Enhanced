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
  // A row being renamed or asked to confirm a delete ({ id }); its right-click menu's handle
  let pickEdit = null;
  let pickMenu = null;
  let pickAnchor = null;
  let pickSide = null;
  // A picker's tallest: about 7 rows under its search; a taller menu it replaces sets its own
  const PICK_MAX = 420;

  function closePick() {
    if (!live.pickEl) return;
    pickMenu?.release();
    pickMenu = null;
    pickEdit = null;
    live.pickEl.remove();
    live.pickEl = null;
    const { onClose } = pickOpts || {};
    pickOpts = null;
    pickSide = null;
    document.removeEventListener('pointerdown', onPickOutside, true);
    document.removeEventListener('keydown', onPickKey, true);
    pickAnchor?.setAttribute('aria-expanded', 'false');
    pickAnchor = null;
    onClose?.();
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
    // A row's right-click menu (SE.layer.menu) is the picker's own
    if (e.target.closest?.('.se-menu')) return;
    if (live.pickEl && !live.pickEl.contains(e.target) && !pickAnchor?.contains(e.target)) {
      closePick();
    }
  }

  /*
   * By its button, in the place of the menu it came from (menu.js placePop): on that menu's side
   * even when the list is long, no taller than PICK_MAX (or that menu), the list scrolling inside
   */
  function placePick() {
    if (!live.pickEl || !pickAnchor?.isConnected) {
      closePick();
      return;
    }
    pickSide = ns.placePop(live.pickEl, pickAnchor, pickSide, {
      cap: Math.max(pickOpts.height || 0, PICK_MAX),
      keep: Boolean(pickOpts.side),
    });
  }

  const pickedNow = () => (pickOpts.single ? [String(pickOpts.current())] : readPick(pickOpts.key) || pickOpts.defaults());
  // A row's mark: the picker's own state (`checked`, e.g. Steam's collections) or the saved choice
  const isOn = (id, chosen) => (pickOpts.checked ? Boolean(pickOpts.checked(String(id))) : chosen.has(String(id)));

  /*
   * The rows, as the menu's: art, name, a quiet line at the end (hours, games), the square mark;
   * the checkbox kept for the keyboard and the change, not seen
   */
  function paintPick() {
    if (!live.pickEl) return;
    pickEdit = null;
    // The search as typed (a name to create keeps its case), and lowercased to match
    const typed = (live.pickEl.querySelector('.se-hs-pk-search')?.value || '').trim();
    const q = typed.toLowerCase();
    const chosen = pickOpts.checked ? null : new Set(pickedNow());
    const groups = pickOpts.items(q);
    const make = typed && pickOpts.create?.allowed(typed) ? typed : '';
    live.pickEl.querySelector('.se-hs-pk-list').innerHTML =
      groups
        .map(
          (g) =>
            (g.label && g.rows.length ? `<div class="se-hs-mn-group"><span>${SE.esc(g.label)}</span></div>` : '') +
            g.rows
              .map((r) => {
                const on = isOn(r.id, chosen);
                const inner =
                  (r.img ? `<span class="se-hs-pk-pic">${imgTag(r.img, 'se-hs-pk-img')}</span>` : '') +
                  `<span class="se-hs-mn-name">${SE.esc(r.name)}</span>` +
                  (r.sub ? `<span class="se-hs-mn-value">${SE.esc(r.sub)}</span>` : '');
                return pickOpts.single
                  ? `<button type="button" class="se-hs-mn-row se-hs-pk-row" role="radio" aria-checked="${on}" data-one="${SE.esc(r.id)}" data-pk-row="${SE.esc(r.id)}"${on ? ' data-on' : ''}>` +
                      `${inner}<span class="se-hs-mn-mark" data-round></span></button>`
                  : `<label class="se-hs-mn-row se-hs-pk-row" data-pk-row="${SE.esc(r.id)}">` +
                      `<input type="checkbox" class="se-hs-mn-input" data-id="${SE.esc(r.id)}"${on ? ' checked' : ''}>` +
                      `${inner}<span class="se-hs-mn-mark"></span></label>`;
              })
              .join('')
        )
        .join('') +
      (make
        ? `<button type="button" class="se-hs-mn-row se-hs-pk-row" data-pk-create="${SE.esc(make)}">` +
          '<span class="se-hs-mn-icon" style="--se-hs-mn-icon: var(--se-icon-folder-plus)"></span>' +
          `<span class="se-hs-mn-name">${SE.esc(pickOpts.create.label(make))}</span></button>`
        : '') ||
      `<span class="se-hs-empty">${SE.esc(!q && pickOpts.empty ? pickOpts.empty : 'Nothing found')}</span>`;
    paintPickFoot();
  }

  // The header's count and the footer's rows: Show all / Show none, or Clear (a choice that
  // replaces something when it has any: the Favorites panel's games)
  function paintPickFoot() {
    if (!live.pickEl || pickOpts.single) return;
    if (pickOpts.count) {
      live.pickEl.querySelector('.se-hs-pk-count').textContent = pickOpts.count();
      return;
    }
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
    if (e.key !== 'Escape' || !live.pickEl) return;
    // The row menu closes itself; a rename or a delete question ends before the picker goes back
    if (pickMenu && !pickMenu.released) return;
    e.stopPropagation();
    if (pickEdit) paintPick();
    else backPick();
  }

  /* ---------- Managing a row (opts.manage): right-click Rename, Delete ---------- */

  const rowFor = (id) =>
    live.pickEl ? [...live.pickEl.querySelectorAll('[data-pk-row]')].find((row) => row.dataset.pkRow === String(id)) : null;

  // The row's menu: Rename and Delete, as the owner allows them for this row
  function onPickContext(e) {
    // Text fields keep the native menu (paste)
    if (e.target.closest('input[type="text"], input[type="search"]')) return;
    e.preventDefault();
    const row = e.target.closest('[data-pk-row]');
    const manage = pickOpts?.manage;
    if (!row || !manage || pickEdit || !SE.layer?.menu) return;
    const id = row.dataset.pkRow;
    const items = [];
    if (manage.canRename(id)) items.push({ label: 'Rename', icon: '--se-icon-edit', run: () => startRename(id) });
    if (manage.canDelete(id)) {
      items.push({ label: manage.deleteLabel || 'Delete', icon: '--se-icon-trash', danger: true, run: () => askDelete(id) });
    }
    if (!items.length) return;
    // From the keyboard's menu key the event has no pointer: the menu opens under the row
    const r = row.getBoundingClientRect();
    const at = e.clientX || e.clientY ? { left: e.clientX, top: e.clientY } : { left: r.left + 40, top: r.bottom };
    pickMenu = SE.layer.menu(items, at, { owner: row });
  }

  /*
   * Rename in place: the row's name becomes a field. Enter or leaving it saves; a name the owner
   * refuses (one already taken) keeps the field open and marked on Enter, and is dropped on leave.
   */
  function startRename(id) {
    const row = rowFor(id);
    const name = row?.querySelector('.se-hs-mn-name');
    if (!name) return;
    const opts = pickOpts;
    const old = name.textContent;
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'se-hs-pk-rename';
    field.value = old;
    field.maxLength = opts.manage.maxLength || 64;
    field.setAttribute('aria-label', 'Name');
    name.replaceWith(field);
    pickEdit = { id };
    field.focus();
    field.select();

    let saving = false;
    const commit = async (leaving) => {
      if (saving || pickOpts !== opts || pickEdit?.id !== id) return;
      const next = field.value.trim();
      if (!next || next === old) {
        paintPick();
        return;
      }
      if (!opts.manage.allowed(next, id)) {
        if (leaving) {
          paintPick();
          return;
        }
        field.setAttribute('aria-invalid', 'true');
        field.title = opts.manage.taken || '';
        return;
      }
      saving = true;
      try {
        await opts.manage.rename(id, next);
      } catch {}
      if (pickOpts === opts && live.pickEl) paintPick();
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(false);
      }
      // Space and Enter in the field never tick the row it sits in
      if (e.key !== 'Escape') e.stopPropagation();
    });
    field.addEventListener('input', () => {
      field.removeAttribute('aria-invalid');
      field.title = '';
    });
    field.addEventListener('blur', () => commit(true));
  }

  // Delete asks first, in the row's place: Keep, or Delete in red (it can't be undone)
  function askDelete(id) {
    const row = rowFor(id);
    const name = row?.querySelector('.se-hs-mn-name')?.textContent;
    if (!row || name == null) return;
    const ask = document.createElement('div');
    ask.className = 'se-hs-mn-row se-hs-pk-row se-hs-pk-ask';
    ask.setAttribute('role', 'group');
    ask.innerHTML =
      `<span class="se-hs-mn-name">Delete “${SE.esc(name)}”?</span>` +
      '<button type="button" class="se-hs-pk-ask-btn" data-pk-keep>Keep</button>' +
      `<button type="button" class="se-hs-pk-ask-btn" data-pk-delete="${SE.esc(id)}" data-danger>Delete</button>`;
    row.replaceWith(ask);
    pickEdit = { id };
    ask.querySelector('[data-pk-keep]').focus();
  }

  async function deleteRow(id) {
    const opts = pickOpts;
    try {
      await opts.manage.remove(id);
    } catch {}
    if (pickOpts === opts && live.pickEl) paintPick();
  }

  // The create row: made (async, Steam saves it), then the search cleared to show it ticked
  async function createFromSearch(name) {
    const opts = pickOpts;
    try {
      await opts.create.run(name);
    } catch {}
    if (pickOpts !== opts || !live.pickEl) return;
    const search = live.pickEl.querySelector('.se-hs-pk-search');
    if (search) search.value = '';
    paintPick();
    placePick();
    search?.focus();
  }

  // The footer's New row: the picker gives way to the owner's own dialog (create.open), handed the click
  function newFromFooter(event) {
    const { open } = pickOpts.create;
    closePick();
    open(event);
  }

  // Enter in the search: makes what it names when the create row shows
  function onPickEnter(e) {
    if (e.key !== 'Enter' || !e.target.matches('.se-hs-pk-search')) return;
    const make = live.pickEl?.querySelector('[data-pk-create]');
    if (!make) return;
    e.preventDefault();
    createFromSearch(make.dataset.pkCreate);
  }

  const pickRow = (attr, iconName, name) =>
    `<button type="button" class="se-hs-mn-row" ${attr}>` +
    `<span class="se-hs-mn-icon" style="--se-hs-mn-icon: var(--se-icon-${iconName})"></span>` +
    `<span class="se-hs-mn-name">${name}</span></button>`;

  /*
   * A list to tick, drawn as the Home's menus are (menu.js): a header (‹ back to the menu it
   * came from, the title, how many are chosen), a search box, the rows, Show all and Show
   * none in the footer. Every tick applies at once.
   *   opts { key, title, placeholder, defaults(), items(q), back(side), side, height }
   *     side, height   the menu it takes the place of: its side of the button, its height
   *     clearable      none chosen means none kept (Clear in the footer, not Show all / none)
   *     single         one to choose, current() the one set: rows with a round mark, choosing
   *                    one calls onChoose(id) and goes back; no count, no footer
   *     checked(id), onToggle(id, on)
   *                    state kept elsewhere (Steam's collections): marks read from checked(),
   *                    ticks go to onToggle(); no footer, count() fills the header
   *     create         { allowed(q), label(q), run(q) }: a last row making what the search names;
 *                    with { newLabel, open(event) }, also a footer row opening a dialog
   *     manage         { canRename(id), canDelete(id), allowed(name, id), rename(id, name),
 *                    remove(id), deleteLabel, taken, maxLength }: a row's right-click menu
 *                    renames it in place or deletes it (asked first, in the row)
 *     empty          the list's text when there is nothing to show yet
   *     onClose()      after it closes, however it closes
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
      (opts.create?.newLabel
        ? '<div class="se-hs-mn-foot se-hs-pk-foot">' + pickRow('data-pk-new', 'folder-plus', SE.esc(opts.create.newLabel)) + '</div>'
        : opts.single || opts.onToggle
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
    live.pickEl.addEventListener('keydown', onPickEnter);
    live.pickEl.addEventListener('contextmenu', onPickContext);
    live.pickEl.addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"][data-id]');
      if (!box) return;
      if (pickOpts.onToggle) {
        pickOpts.onToggle(box.dataset.id, box.checked);
        paintPickFoot();
        return;
      }
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
      if (e.target.closest('[data-pk-keep]')) {
        paintPick();
        return;
      }
      const del = e.target.closest('[data-pk-delete]');
      if (del) {
        deleteRow(del.dataset.pkDelete);
        return;
      }
      if (e.target.closest('[data-pk-new]')) {
        newFromFooter(e);
        return;
      }
      const make = e.target.closest('[data-pk-create]');
      if (make) {
        createFromSearch(make.dataset.pkCreate);
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

  // The picker for other features (the game menu's Collections, client/library/game-menu.js)
  SE.picker = { open: openPick, close: closePick };

  Object.assign(ns, {
    appById, closePick, collPicker, collectionApps, favPickKey, favPicker, hoursText, libraryGames,
    placePick, readPick, sorted, sourcePicker, wideURLs, writePick,
  });
})(window.__se);
