/*
 * The library's small right-click menus, in the game menu's language (client/library/
 * home-menus.css over game-menu.css): rows with a glyph, Steam's name and a hint.
 *
 *   - an update on Home: View game details, Remove this update, Show less / more from the game,
 *     Home's settings;
 *   - a shelf's header on Home: Go to collection (or all collections), Play Next's Unhide all and
 *     each dismissed game's Unhide;
 *   - a game page's collection: Go to collection, Remove from it;
 *   - a game page's art: its hero (background, logo, the logo's place) and its cover.
 *
 * Steam builds most as a bare menu element with no props of its own, so a menu is told by what
 * its rows run (the store and router method names stay in Steam's bundle); the art menus' rows
 * run bound methods (no source), so those are told by Steam's own localized names, never by
 * fixed words. The game page's collection menu is a component: told by its props.
 * Drawn in the page (no popup window, no room); the divider is a theme node, placed by CSS
 * order. Patched and laid out by the game menu's code (client/library/game-menu.js:
 * ns.libraryMenus).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns?.libraryMenus) return;
  const { run } = SE;
  const { live } = ns;
  const { add, layoutRows, source, own, divider, keep } = ns.libraryMenus;

  // What a row runs -> its kind; first match wins (AllCollections before Collection)
  const ACTIONS = [
    [/RemoveEvent\(/, 'removeupdate'],
    [/LowerAppPriorityForApp/, 'fewer'],
    [/RaiseAppPriorityForApp/, 'more'],
    [/Settings\.Home\(/, 'homesettings'],
    [/\.App\(/, 'details'],
    [/AllCollections\(/, 'allcollections'],
    [/\.Collection\(/, 'gotocollection'],
    [/ClearIgnoredApps/, 'unhideall'],
    [/RemoveIgnoredApp/, 'unhideone'],
    [/RemoveApps\(/, 'removefromcollection'],
  ];

  // A menu is one of these when a row runs one of its own actions (details and settings are shared)
  const OWN = new Set(['removeupdate', 'fewer', 'more', 'allcollections', 'gotocollection', 'unhideall', 'unhideone', 'removefromcollection']);

  const HINTS = {
    details: 'Its page in your library',
    removeupdate: 'Take it off your Home',
    fewer: 'Fewer of its updates on Home',
    more: 'More of its updates on Home',
    homesettings: 'What Home shows you',
    gotocollection: 'Open it in your library',
    allcollections: 'Every collection, side by side',
    unhideall: 'Suggest every dismissed game again',
    unhideone: 'Suggest it again',
    removefromcollection: 'The game stays in your library',
    heroset: 'A picture of your own behind the game',
    heroclear: 'Back to Steam’s background',
    logoset: 'Your own logo over the art',
    logoclear: 'Back to Steam’s logo',
    logoedit: 'Move and size the logo',
    logoreset: 'Back to where Steam puts it',
    artworkset: 'Your own cover for the game',
    artworkclear: 'Back to Steam’s cover',
  };

  // The art menus' rows, by Steam's localized name -> kind (set and clear apart: their hints differ)
  const NAMES = {
    '#CustomArt_SetCustomBackground': 'heroset',
    '#CustomArt_ClearCustomBackground': 'heroclear',
    '#CustomArt_SetCustomLogo': 'logoset',
    '#CustomArt_ClearCustomLogo': 'logoclear',
    '#CustomArt_EditLogoPosition': 'logoedit',
    '#CustomArt_ResetLogoPosition': 'logoreset',
    '#GameAction_SetCustomArtwork': 'artworkset',
    '#GameAction_ClearCustomArtwork': 'artworkclear',
  };

  const kindOfAction = (fn) => ACTIONS.find(([test]) => test.test(source(fn)))?.[1] || null;

  // A row's kind by its name: Steam's localized words for one of NAMES
  function kindOfName(text) {
    if (typeof text !== 'string' || !text) return null;
    for (const [token, kind] of Object.entries(NAMES)) {
      if (text === run(() => live.api.localize(token))) return kind;
    }
    return null;
  }

  const kindOfRow = (props) => kindOfAction(props?.onSelected) || kindOfName(props?.children);

  // The menu element's rows (arrays and fragments opened, false left out)
  const rowsOf = (props) => run(() => live.api.React.Children.toArray(props.children)) || [];

  function isOwnMenu(props) {
    // The game page's collection menu: { collection, app }, its rows inside its own render
    if (typeof props.collection?.AsDragDropCollection === 'function' && 'app' in props) return true;
    if ('overview' in props || !props.children) return false;
    return rowsOf(props).some((row) => {
      const kind = kindOfRow(row?.props);
      return OWN.has(kind) || Object.values(NAMES).includes(kind);
    });
  }

  // A row's kind: what the nearest onSelected above it runs
  function kindOf(row) {
    for (let f = SE.fiber(row), depth = 0; f && depth < 8; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (props && typeof props === 'object' && 'onSelected' in props) return kindOfRow(props) || 'other';
    }
    return 'other';
  }

  add({
    name: 'home',
    test: isOwnMenu,
    layout(panel) {
      const laid = layoutRows(panel, { kindOf, bar: [], hints: HINTS, word: () => null });
      // Home's settings set apart, as Steam's separator did (its separators go, game-menu.css)
      if (laid) keep(own(panel, 'last', (doc) => divider(doc, 'last')), laid.container, Boolean(laid.found.homesettings));
    },
  });
})(window.__se);
