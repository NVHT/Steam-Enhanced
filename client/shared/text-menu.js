/*
 * The right-click menu of text and text fields (every window), in the game menu's language
 * (client/shared/text-menu.css over client/library/game-menu.css): Cut, Copy and Paste as a bar
 * when all three apply (game-menu.js MIN_BAR; else rows), then spelling suggestions, Add to
 * dictionary and the developer rows.
 *
 * Steam keys every row it builds (cut, copy, paste, spelling_<n>_<word>, addtodictionary_<word>,
 * opendevtools, inspectelement): told apart by those keys, never their words. Patched and laid
 * out by the game menu's code (client/library/game-menu.js: ns.libraryMenus).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns?.libraryMenus) return;
  const { add, layoutRows } = ns.libraryMenus;

  const BAR = { cut: 'Cut', copy: 'Copy', paste: 'Paste' };

  // The hint lines of rows (the bar's buttons show none)
  const HINTS = {
    cut: 'Move it to the clipboard',
    copy: 'Keep a copy on the clipboard',
    paste: 'Put the clipboard here',
    dictionary: 'Stop marking it as a typo',
  };

  // A Steam row key -> its kind
  function kindOfKey(key) {
    const k = String(key ?? '');
    if (k in BAR) return k;
    if (k.startsWith('spelling_')) return 'spelling';
    if (k.startsWith('addtodictionary_')) return 'dictionary';
    if (k === 'opendevtools' || k === 'inspectelement') return 'devtools';
    return null;
  }

  // The menu's element: its rows keyed as above (Steam's own keys, not React's prefixed ones)
  // A chat message's menu starts with Copy too, but is the friends menus' (group-menus.js), its
  // own rows told apart by their keys
  const MESSAGE_ROWS = new Set(['select', 'react', 'report', 'delete']);
  const isTextMenu = (props) =>
    Array.isArray(props.children) &&
    props.children.some((row) => row?.key === 'copy' || row?.key === 'paste' || row?.key === 'cut') &&
    !props.children.some((row) => MESSAGE_ROWS.has(row?.key));

  function kindOf(row) {
    for (let f = SE.fiber(row), depth = 0; f && depth < 6; f = f.return, depth++) {
      const kind = f.key != null && kindOfKey(f.key);
      if (kind) return kind;
    }
    return 'other';
  }

  add({
    name: 'text',
    test: isTextMenu,
    layout: (panel) => layoutRows(panel, { kindOf, bar: Object.keys(BAR), hints: HINTS, word: (kind) => BAR[kind] }),
  });
})(window.__se);
