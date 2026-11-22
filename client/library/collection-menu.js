/*
 * A collection's right-click menu (its header in the library list, Favorites' too), in the game
 * menu's language (client/library/collection-menu.css over game-menu.css): a bar of this
 * collection's actions (View only this or Show all, Collapse or Expand, Rename, Delete in red),
 * then rows with a hint (Edit filters for a dynamic one, Expand all, Collapse all, any other).
 *
 * Steam's rows stay Steam's (its collection menu: { strCollectionId, strDisplayName,
 * bOnlyManagement }, rows shown only when they apply) and are told apart by what they run,
 * Expand all and Collapse all by their own localized names (their onSelected is a store method).
 * Patched and laid out by the game menu's code (client/library/game-menu.js: ns.libraryMenus).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns?.libraryMenus) return;
  const { run } = SE;
  const { live } = ns;
  const { add, layoutRows, source } = ns.libraryMenus;

  // The bar's buttons, by kind, with their word under the icon
  const BAR = {
    only: 'Only this',
    showall: 'Show all',
    collapse: 'Collapse',
    expand: 'Expand',
    rename: 'Rename',
    delete: 'Delete',
  };

  const HINTS = {
    edit: 'Change its filters',
    expandall: 'Open every collection',
    collapseall: 'Fold every collection',
    // The bar's, as rows when the bar is too short to draw (game-menu.js MIN_BAR)
    only: 'Hide the other collections',
    showall: 'Show every collection again',
    collapse: 'Fold its games away',
    expand: 'Show its games',
    rename: 'Give it a new name',
    delete: 'Its games stay in your library',
  };

  const localize = (token) => run(() => live.api?.localize(token)) || null;
  const named = (text, ...tokens) => Boolean(text) && tokens.some((token) => text === localize(token));

  // What a row's onSelected runs (the store's method names stay in Steam's bundle); its words tell the toggles' state
  function kindOfAction(fn, text) {
    if (named(text, '#CollectionAction_ExpandAll', '#CollectionAction_ExpandAllCollections')) return 'expandall';
    if (named(text, '#CollectionAction_CollapseAll', '#CollectionAction_CollapseAllCollections')) return 'collapseall';
    const src = source(fn);
    if (src.includes('SelectGameListView')) return named(text, '#GameList_View_ShowAllCollections') ? 'showall' : 'only';
    if (src.includes('toggleCollapsed')) return named(text, '#CollectionAction_Expand') ? 'expand' : 'collapse';
    if (src.includes('SetCollectionRenameOpen')) return 'rename';
    if (src.includes('SetCollectionEditorOpen')) return 'edit';
    if (src.includes('DeleteDialog') || src.includes('bIsDeletable')) return 'delete';
    return 'other';
  }

  // The nearest props with an onSelected (a row's), never further: the menu's own come next
  function kindOf(row) {
    for (let f = SE.fiber(row), depth = 0; f && depth < 12; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (props && typeof props === 'object' && 'onSelected' in props) {
        return kindOfAction(props.onSelected, typeof props.children === 'string' ? props.children : row.textContent.trim());
      }
    }
    return 'other';
  }

  function layout(panel) {
    layoutRows(panel, {
      kindOf,
      bar: Object.keys(BAR),
      hints: HINTS,
      danger: ['delete'],
      word: (kind) => BAR[kind],
    });
  }

  add({
    name: 'collection',
    test: (props) => typeof props.strCollectionId === 'string' && 'strDisplayName' in props,
    layout,
  });
})(window.__se);
