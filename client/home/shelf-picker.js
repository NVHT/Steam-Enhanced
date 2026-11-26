/*
 * The shelf picker on Steam's Home: a shelf's name (Steam's CollectionDropDown) opens the theme's
 * picker (SE.picker, client/shared/picker.js) in place of Steam's long dropdown: a search, the
 * choices grouped (Steam's shelves, your collections, the library), each collection's game count,
 * the shelf's choice marked, and Remove shelf at the end (home-shelves.css draws it red). The
 * choices, their names (in Steam's language) and the change are Steam's own: read from the
 * dropdown's props (rgOptions) and handed back through its onChange, so Steam's dropdown stays the
 * source of truth, never opened.
 */
((SE) => {
  const { C } = SE;
  window.__seShelfPicker?.destroy();

  // A shelf's name, outside Arrange shelves (there it's a disabled label)
  const PICKER = `.${C.ShowcaseHeader}:not(.${C.Reordering}) .${C.CollectionDropDown}`;
  const STEAM = ['recent-games', 'play-next', 'all-collections'];
  const REMOVE = '__remove';

  // The dropdown's props: its choices, the shelf's current one, the change
  const dropdownOf = (picker) =>
    SE.fromProps(picker.querySelector('.DialogDropDown') || picker, 8,
      (p) => (Array.isArray(p.rgOptions) && typeof p.onChange === 'function' ? p : null), { live: true });

  const open = (picker) => {
    const dropdown = dropdownOf(picker);
    if (!dropdown) return false;
    const collections = SE.global('collectionStore');
    // Your collections: Uncategorized and the library's sections (Soundtracks, type-*) aside, as
    // Steam lists them with the library. Collections View shows all but Uncategorized (Steam's count)
    const all = (SE.run(() => collections.userCollections) || []).map((c) => c.id).filter((id) => id !== 'uncategorized');
    const own = new Set(all.filter((id) => !id.startsWith('type-')));
    const countOf = (id) => {
      if (id === 'all-collections') return all.length;
      const n = SE.run(() => collections.GetCollection(id)?.visibleApps?.length);
      return typeof n === 'number' ? n : null;
    };
    const options = dropdown.rgOptions.map((option) => ({
      id: option.data === undefined ? REMOVE : String(option.data),
      name: option.label,
      option,
    }));
    const byId = new Map(options.map((o) => [o.id, o]));

    SE.picker.open(picker, {
      title: picker.textContent.replace(/\(\s*[\d.,\s/]+\)/, '').trim() || 'Shelf',
      placeholder: 'Find a collection',
      align: 'start',
      single: true,
      current: () => String(dropdown.selectedOption ?? ''),
      items: (q) => {
        const rows = (list) => list
          .filter((o) => !q || o.name.toLowerCase().includes(q))
          .map((o) => {
            const n = o.id === REMOVE ? null : countOf(o.id);
            return { id: o.id, name: o.name, sub: n == null ? '' : n.toLocaleString() };
          });
        return [
          { label: 'Steam', rows: rows(options.filter((o) => STEAM.includes(o.id))) },
          { label: 'Your collections', rows: rows(options.filter((o) => own.has(o.id))) },
          {
            label: 'Library',
            rows: rows(options.filter((o) => o.id !== REMOVE && !STEAM.includes(o.id) && !own.has(o.id))),
          },
          { label: '', rows: rows(options.filter((o) => o.id === REMOVE)) },
        ];
      },
      onChoose: (id) => {
        const chosen = byId.get(id);
        if (chosen) SE.run(() => dropdown.onChange(chosen.option));
      },
    });
    return true;
  };

  // Steam's dropdown opens on its own press: the theme's picker takes the press first
  const onPress = (event) => {
    const picker = event.target instanceof Element && event.target.closest(PICKER);
    if (!picker) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'mousedown' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== 'mousedown') open(picker);
  };

  const EVENTS = ['mousedown', 'click', 'keydown'];
  for (const type of EVENTS) document.addEventListener(type, onPress, true);

  window.__seShelfPicker = {
    destroy() {
      for (const type of EVENTS) document.removeEventListener(type, onPress, true);
      SE.picker?.close();
      delete window.__seShelfPicker;
    },
  };
})(window.__se);
