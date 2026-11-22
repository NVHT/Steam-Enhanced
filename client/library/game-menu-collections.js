/*
 * The games' right-click menu, part 2 of 2: Collections (client/library/game-menu.js is part 1
 * and describes the menu). Its row opens the theme's picker (SE.picker, client/shared/picker.js)
 * in the menu's place: every collection ticked or not, a search, a row making a new one, and a
 * right-click to rename or delete one; its ‹ shows the menu again. Publishes
 * ns.gameMenuCollections ({ hint, open }), read by part 1 when it lays the menu out.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns?.libraryMenus) return;
  const { C, run } = SE;
  const { targetApps, patchLibraryMenu } = ns.libraryMenus;

  // Room under the menu's top the picker wants before it opens upward instead
  const PICKER_ROOM = 420;
  // placePop's gap between a popup and its anchor (client/shared/picker.js)
  const POP_GAP = 8;
  const RECENT_KEY = 'se-collections-recent';
  const RECENT_ROWS = 3;
  // Collection names shown in the Collections row's hint before "+n"
  const HINT_NAMES = 2;

  const store = () => SE.global('collectionStore');
  const nameOf = (c) => c.displayName || c.strName || String(c.id);

  // The collections a game can be put in by hand, as Steam's Add to › lists them, A–Z
  function collections() {
    const s = store();
    return (run(() => [...s.userCollections]) || [])
      .filter(
        (c) =>
          c?.bAllowsDragAndDrop &&
          !run(() => s.BIsSystemCollectionId(c.id)) &&
          !run(() => s.BIsPartnerCollectionId(c.id))
      )
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  const findCollection = (id) => collections().find((c) => String(c.id) === String(id));

  // In it: every game the menu acts on is
  function holds(c, apps) {
    const set = run(() => c.AsDragDropCollection().apps);
    return Boolean(set && apps.length) && apps.every((app) => set.has(app.appid));
  }

  function readRecent() {
    try {
      const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(ids) ? ids.map(String) : [];
    } catch {
      return [];
    }
  }

  function useRecent(id) {
    try {
      const ids = [String(id), ...readRecent().filter((x) => x !== String(id))].slice(0, RECENT_ROWS);
      localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
    } catch {}
  }

  /*
   * A new name only: Steam's SaveCollection deletes a collection already named so. `self` is the
   * collection being renamed (its own name, in another case, is fine).
   */
  function canCreate(name, self = null) {
    const s = store();
    const lower = name.toLowerCase();
    if (!s || run(() => s.BIsSystemCollectionName(name) || s.BIsPartnerCollectionName?.(name))) return false;
    return !(run(() => [...s.userCollections]) || []).some((c) => String(c.id) !== String(self) && nameOf(c).toLowerCase() === lower);
  }

  // Steam's own name limit (its New Collection field's maxLength)
  const NAME_MAX = 32;

  // Right-click on a picker row: rename (displayName, then Save) or delete it, as Steam allows
  const manageCollections = {
    canRename: (id) => Boolean(findCollection(id)?.bIsEditable),
    canDelete: (id) => Boolean(findCollection(id)?.bIsDeletable),
    allowed: (name, id) => canCreate(name, id),
    async rename(id, name) {
      const c = findCollection(id);
      if (!c) return;
      c.displayName = name;
      await c.Save();
    },
    async remove(id) {
      await store()?.DeleteCollection(id);
    },
    deleteLabel: 'Delete collection',
    taken: 'A collection already has this name',
    maxLength: NAME_MAX,
  };

  function collectionsHint(apps) {
    const names = collections()
      .filter((c) => holds(c, apps))
      .map(nameOf);
    if (!names.length) return 'Not in a collection';
    const more = names.length - HINT_NAMES;
    return `In ${names.slice(0, HINT_NAMES).join(', ')}${more > 0 ? ` +${more}` : ''}`;
  }

  // The picker's rows: In this game, Recent, then All (A–Z); a search lists every match A–Z
  function pickerGroups(q, apps) {
    const list = collections();
    const row = (c) => {
      const n = run(() => c.visibleApps.length) || 0;
      return { id: String(c.id), name: nameOf(c), sub: `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}` };
    };
    if (q) return [{ label: '', rows: list.filter((c) => nameOf(c).toLowerCase().includes(q)).map(row) }];
    const inIt = list.filter((c) => holds(c, apps));
    const taken = new Set(inIt.map((c) => String(c.id)));
    const recent = readRecent()
      .map((id) => list.find((c) => String(c.id) === id))
      .filter((c) => c && !taken.has(String(c.id)));
    for (const c of recent) taken.add(String(c.id));
    return [
      { label: apps.length > 1 ? 'In these games' : 'In this game', rows: inIt.map(row) },
      { label: 'Recent', rows: recent.map(row) },
      { label: taken.size ? 'All' : '', rows: list.filter((c) => !taken.has(String(c.id))).map(row) },
    ];
  }

  // Steam's library menu component (its rows' owner), read before the menu hides
  function menuComponent(panel) {
    const row = panel.querySelector(`.${C.contextMenuItem}:not([data-se-gm-own])`);
    for (let f = row && SE.fiber(row), depth = 0; f && depth < 40; f = f.return, depth++) {
      if (typeof f.stateNode?.AddToNewCollection === 'function') return f.stateNode;
    }
    return null;
  }

  // Where the menu's panel is, in the main window (a menu can have a window of its own)
  function menuPlace(panel) {
    const win = panel.ownerDocument.defaultView;
    const r = panel.getBoundingClientRect();
    const dx = win && win !== window ? win.screenX - window.screenX : 0;
    const dy = win && win !== window ? win.screenY - window.screenY : 0;
    return { left: r.left + dx, top: r.top + dy, bottom: r.bottom + dy };
  }

  /*
   * The picker in the menu's place: its top where the menu's was (its bottom, when the menu
   * opened near the window's foot), left edges lined up
   */
  // Whether the open picker is this file's: teardown closes only its own, never Home's
  let ownsPicker = false;

  function openCollections(panel, instance) {
    const apps = targetApps(panel, instance);
    if (!apps.length || !SE.picker) return;
    const place = menuPlace(panel);
    const menu = menuComponent(panel);
    run(() => instance.Hide());

    const below = innerHeight - place.top >= PICKER_ROOM;
    const anchor = document.createElement('div');
    anchor.className = 'se-gm-anchor';
    anchor.style.left = `${place.left}px`;
    anchor.style.top = `${below ? place.top - POP_GAP : place.bottom + POP_GAP}px`;
    // As wide as the picker (placePop aligns their right edges), so it lines up with the menu's left
    anchor.style.width = `${SE.px('--se-menu-width')}px`;
    document.body.appendChild(anchor);

    SE.picker.open(anchor, {
      title: 'Collections',
      placeholder: 'Search collections',
      side: below ? 'below' : 'above',
      empty: 'No collections yet. Type a name to make one.',
      items: (q) => pickerGroups(q, apps),
      checked: (id) => {
        const c = findCollection(id);
        return Boolean(c) && holds(c, apps);
      },
      onToggle: (id, on) => {
        const dnd = run(() => findCollection(id)?.AsDragDropCollection());
        if (!dnd) return;
        run(() => (on ? dnd.AddApps(apps) : dnd.RemoveApps(apps)));
        useRecent(id);
      },
      count: () => {
        const n = collections().filter((c) => holds(c, apps)).length;
        return n ? `In ${n}` : 'In none';
      },
      manage: manageCollections,
      create: {
        allowed: (name) => canCreate(name),
        label: (name) => `Create “${name}”`,
        newLabel: menu ? 'New collection' : undefined,
        // Steam's New Collection dialog, these games in it (the menu's own AddToNewCollection)
        open: (event) => run(() => menu?.AddToNewCollection(event, apps)),
        async run(name) {
          const s = store();
          const made = s.NewUnsavedCollection(name, undefined, apps);
          await s.SaveCollection(made);
          useRecent(made.id);
        },
      },
      // ‹ and Escape: the same menu again, where it was (patched again if a newer menu unpatched it)
      back: () => {
        patchLibraryMenu(instance);
        run(() => instance.Show());
      },
      onClose: () => {
        ownsPicker = false;
        anchor.remove();
      },
    });
    // After open(): opening closes the picker before, whose onClose clears the flag
    ownsPicker = true;
  }

  ns.gameMenuCollections = { hint: collectionsHint, open: openCollections };
  ns.cleanups.push(() => {
    if (ownsPicker) SE.picker?.close();
    delete ns.gameMenuCollections;
  });
})(window.__se);
