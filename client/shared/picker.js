/*
 * The theme's picker: a list to tick (or one row to choose) with a search, in the place of the
 * menu it was opened from, and the placement every such popup shares. Home's panels
 * (client/home/stage/picks.js) and the game menu's Collections (client/library/game-menu.js)
 * open it. Drawn in the settings menu's classes (client/shared/menu.css), placed and styled by
 * client/shared/picker.css.
 *   SE.picker  { open(anchor, opts), close(), place(), read(key), write(key, ids) }
 *   SE.placePop(el, button, side, opts)  places a popup by its button (the settings menu too);
 *                                        .gap, its distance from the button
 */
((SE) => {
  if (SE.picker) return;

  // Under this much room, a kept side (opts.keep) gives way to the other
  const KEEP_MIN = 200;
  // Between a popup and its button (SE.placePop.gap: the game menu's Collections lines up by it)
  const GAP = 8;

  /**
   * Places a popup (a menu, a picker) by its button: below when it fits, else on the side with
   * more room, and keeps `side` once chosen (the edge by the button fixed, so a list opening
   * inside it grows away from the button instead of moving it) unless it no longer fits there
   * and the other side has more room. Never taller than its side's room: past that it scrolls
   * inside, so it never runs out of a short window. Returns the side.
   *   opts.cap   its tallest, whatever the room (a long list scrolls inside instead)
   *   opts.keep  stay on `side` even when it doesn't fit whole (a page taking a menu's place),
   *              unless that side has under KEEP_MIN of room and the other has more
   */
  function placePop(el, button, side, { cap = Infinity, keep = false } = {}) {
    const r = button.getBoundingClientRect();
    const EDGE = 12;
    const room = {
      below: Math.max(0, innerHeight - r.bottom - GAP - EDGE),
      above: Math.max(0, r.top - GAP - EDGE),
    };
    const other = (s) => (s === 'below' ? 'above' : 'below');
    // Its full height: the inline cap off for the read (the stylesheet's 100vh cap stays)
    el.style.maxHeight = 'none';
    const need = Math.min(el.offsetHeight, cap);
    const fits = (x) => need <= room[x] || room[x] >= room[other(x)] || (keep && room[x] >= KEEP_MIN);
    let s = side && fits(side) ? side : null;
    s ??= need <= room.below || room.below >= room.above ? 'below' : 'above';
    const w = el.offsetWidth;
    el.style.left = `${Math.max(EDGE, Math.min(r.right - w, innerWidth - w - EDGE))}px`;
    if (s === 'below') {
      el.style.top = `${r.bottom + GAP}px`;
      el.style.bottom = '';
    } else {
      el.style.top = '';
      el.style.bottom = `${innerHeight - r.top + GAP}px`;
    }
    el.style.maxHeight = `${Math.min(room[s], cap)}px`;
    return s;
  }

  // A saved choice (ids, as strings) under its localStorage key; null when none was saved.
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

  let pickEl = null;
  let pickOpts = null;
  // A row being renamed or asked to confirm a delete ({ id }); its right-click menu's handle
  let pickEdit = null;
  let pickMenu = null;
  let pickAnchor = null;
  let pickSide = null;
  // A picker's tallest: about 7 rows under its search; a taller menu it replaces sets its own
  const PICK_MAX = 420;

  function closePick() {
    if (!pickEl) return;
    pickMenu?.release();
    pickMenu = null;
    pickEdit = null;
    pickEl.remove();
    pickEl = null;
    const { onClose } = pickOpts || {};
    pickOpts = null;
    pickSide = null;
    document.removeEventListener('pointerdown', onPickOutside, true);
    document.removeEventListener('keydown', onPickKey, true);
    removeEventListener('resize', placePick);
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
    if (pickEl && !pickEl.contains(e.target) && !pickAnchor?.contains(e.target)) {
      closePick();
    }
  }

  /*
   * By its button, in the place of the menu it came from (placePop above): on that menu's side
   * even when the list is long, no taller than PICK_MAX (or that menu), the list scrolling inside
   */
  function placePick() {
    if (!pickEl || !pickAnchor?.isConnected) {
      closePick();
      return;
    }
    pickSide = placePop(pickEl, pickAnchor, pickSide, {
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
    if (!pickEl) return;
    pickEdit = null;
    // The search as typed (a name to create keeps its case), and lowercased to match
    const typed = (pickEl.querySelector('.se-pick-search')?.value || '').trim();
    const q = typed.toLowerCase();
    const chosen = pickOpts.checked ? null : new Set(pickedNow());
    const groups = pickOpts.items(q);
    const make = typed && pickOpts.create?.allowed(typed) ? typed : '';
    pickEl.querySelector('.se-pick-list').innerHTML =
      groups
        .map(
          (g) =>
            (g.label && g.rows.length ? `<div class="se-mn-group"><span>${SE.esc(g.label)}</span></div>` : '') +
            g.rows
              .map((r) => {
                const on = isOn(r.id, chosen);
                const inner =
                  (r.img ? `<span class="se-pick-pic">${SE.art.tag(r.img, 'se-pick-img')}</span>` : '') +
                  `<span class="se-mn-name">${SE.esc(r.name)}</span>` +
                  (r.sub ? `<span class="se-mn-value">${SE.esc(r.sub)}</span>` : '');
                return pickOpts.single
                  ? `<button type="button" class="se-mn-row se-pick-row" role="radio" aria-checked="${on}" data-one="${SE.esc(r.id)}" data-pk-row="${SE.esc(r.id)}"${on ? ' data-on' : ''}>` +
                      `${inner}<span class="se-mn-mark" data-round></span></button>`
                  : `<label class="se-mn-row se-pick-row" data-pk-row="${SE.esc(r.id)}">` +
                      `<input type="checkbox" class="se-mn-input" data-id="${SE.esc(r.id)}"${on ? ' checked' : ''}>` +
                      `${inner}<span class="se-mn-mark"></span></label>`;
              })
              .join('')
        )
        .join('') +
      (make
        ? `<button type="button" class="se-mn-row se-pick-row" data-pk-create="${SE.esc(make)}">` +
          '<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-folder-plus)"></span>' +
          `<span class="se-mn-name">${SE.esc(pickOpts.create.label(make))}</span></button>`
        : '') ||
      `<span class="se-pick-empty">${SE.esc(!q && pickOpts.empty ? pickOpts.empty : 'Nothing found')}</span>`;
    paintPickFoot();
  }

  // The header's count and the footer's rows: Show all / Show none, or Clear (a choice that
  // replaces something when it has any: the Favorites panel's games)
  function paintPickFoot() {
    if (!pickEl || pickOpts.single) return;
    if (pickOpts.count) {
      pickEl.querySelector('.se-pick-count').textContent = pickOpts.count();
      return;
    }
    const picks = readPick(pickOpts.key);
    const n = picks?.length || 0;
    pickEl.querySelector('.se-pick-count').textContent = pickOpts.clearable
      ? n ? `${n} chosen` : 'None'
      : !picks ? 'All' : n ? `${n} chosen` : 'None';
    const set = (sel, off) => {
      const b = pickEl.querySelector(sel);
      if (b) b.disabled = off;
    };
    set('[data-pk-all]', !picks);
    set('[data-pk-none]', Boolean(picks && !n));
    set('[data-pk-clear]', !n);
  }

  function onPickKey(e) {
    if (e.key !== 'Escape' || !pickEl) return;
    // The row menu closes itself; a rename or a delete question ends before the picker goes back
    if (pickMenu && !pickMenu.released) return;
    e.stopPropagation();
    if (pickEdit) paintPick();
    else backPick();
  }

  /* ---------- Managing a row (opts.manage): right-click Rename, Delete ---------- */

  const rowFor = (id) =>
    pickEl ? [...pickEl.querySelectorAll('[data-pk-row]')].find((row) => row.dataset.pkRow === String(id)) : null;

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
    const name = row?.querySelector('.se-mn-name');
    if (!name) return;
    const opts = pickOpts;
    const old = name.textContent;
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'se-pick-rename';
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
      if (pickOpts === opts && pickEl) paintPick();
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
    const name = row?.querySelector('.se-mn-name')?.textContent;
    if (!row || name == null) return;
    const ask = document.createElement('div');
    ask.className = 'se-mn-row se-pick-row se-pick-ask';
    ask.setAttribute('role', 'group');
    ask.innerHTML =
      `<span class="se-mn-name">Delete “${SE.esc(name)}”?</span>` +
      '<button type="button" class="se-pick-ask-btn" data-pk-keep>Keep</button>' +
      `<button type="button" class="se-pick-ask-btn" data-pk-delete="${SE.esc(id)}" data-danger>Delete</button>`;
    row.replaceWith(ask);
    pickEdit = { id };
    ask.querySelector('[data-pk-keep]').focus();
  }

  async function deleteRow(id) {
    const opts = pickOpts;
    try {
      await opts.manage.remove(id);
    } catch {}
    if (pickOpts === opts && pickEl) paintPick();
  }

  // The create row: made (async, Steam saves it), then the search cleared to show it ticked
  async function createFromSearch(name) {
    const opts = pickOpts;
    try {
      await opts.create.run(name);
    } catch {}
    if (pickOpts !== opts || !pickEl) return;
    const search = pickEl.querySelector('.se-pick-search');
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
    if (e.key !== 'Enter' || !e.target.matches('.se-pick-search')) return;
    const make = pickEl?.querySelector('[data-pk-create]');
    if (!make) return;
    e.preventDefault();
    createFromSearch(make.dataset.pkCreate);
  }

  const pickRow = (attr, iconName, name) =>
    `<button type="button" class="se-mn-row" ${attr}>` +
    `<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-${iconName})"></span>` +
    `<span class="se-mn-name">${name}</span></button>`;

  /*
   * A list to tick, drawn as the settings menu is (client/shared/menu.js): a header (‹ back to the menu it
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
   *     onChange()     after a tick, Show all / none or Clear changed the saved choice
   *     onClose()      after it closes, however it closes
   */
  function openPick(anchor, opts) {
    if (pickEl && pickAnchor === anchor) {
      closePick();
      return;
    }
    closePick();
    pickOpts = opts;
    pickAnchor = anchor;
    pickSide = opts.side || null;
    anchor.setAttribute('aria-expanded', 'true');
    pickEl = document.createElement('div');
    pickEl.className = 'se-placed se-mn se-pick';
    pickEl.setAttribute('role', 'dialog');
    pickEl.setAttribute('aria-label', opts.title);
    pickEl.innerHTML =
      '<div class="se-mn-sum">' +
      (opts.back ? '<button type="button" class="se-pick-back" data-pk-back aria-label="Back"></button>' : '') +
      `<span class="se-mn-title">${SE.esc(opts.title)}</span>${opts.single ? '' : '<span class="se-pick-count"></span>'}</div>` +
      (opts.placeholder
        ? '<label class="se-pick-find"><span class="se-pick-glass"></span>' +
          `<input type="search" class="se-pick-search" placeholder="${SE.esc(opts.placeholder)}" aria-label="${SE.esc(opts.placeholder)}"></label>`
        : '') +
      '<div class="se-mn-body se-pick-list"></div>' +
      (opts.create?.newLabel
        ? '<div class="se-mn-foot se-pick-foot">' + pickRow('data-pk-new', 'folder-plus', SE.esc(opts.create.newLabel)) + '</div>'
        : opts.single || opts.onToggle
        ? ''
        : '<div class="se-mn-foot se-pick-foot">' +
          (opts.clearable
            ? pickRow('data-pk-clear', 'restore', 'Clear')
            : pickRow('data-pk-all', 'list', 'Show all') + pickRow('data-pk-none', 'eye-off', 'Show none')) +
          '</div>');

    pickEl.addEventListener('error', SE.art.onError, true);
    pickEl.addEventListener('load', SE.art.onLoad, true);
    pickEl.addEventListener('input', (e) => {
      if (e.target.matches('.se-pick-search')) {
        paintPick();
        placePick();
      }
    });
    pickEl.addEventListener('keydown', onPickEnter);
    pickEl.addEventListener('contextmenu', onPickContext);
    pickEl.addEventListener('change', (e) => {
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
      pickOpts.onChange?.();
    });
    pickEl.addEventListener('click', (e) => {
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
        pickOpts.onChange?.();
        return;
      }
      const all = e.target.closest('[data-pk-all]');
      if (all || e.target.closest('[data-pk-none]')) {
        writePick(pickOpts.key, all ? null : []);
        paintPick();
        pickOpts.onChange?.();
      }
    });

    document.body.appendChild(pickEl);
    document.addEventListener('pointerdown', onPickOutside, true);
    document.addEventListener('keydown', onPickKey, true);
    // Follows the window's size wherever it opened (Home's layout pass also calls SE.picker.place)
    addEventListener('resize', placePick);
    paintPick();
    placePick();
    (pickEl.querySelector('.se-pick-search') || pickEl.querySelector('input'))?.focus();
  }

  SE.placePop = Object.assign(placePop, { gap: GAP });
  SE.picker = {
    open: openPick,
    close: closePick,
    // Again by its button, after the page under it moved (the Home's layout pass)
    place: () => pickEl && placePick(),
    read: readPick,
    write: writePick,
  };
})(window.__se);
