/*
 * The friends list's other right-click menus, in the friend menu's language
 * (client/friends/group-menus.css over client/friends/friend-menu.css and
 * client/library/game-menu.css):
 *
 *   - a game's header (friends playing it): Steam's header art as a banner, the game's name and
 *     how many friends play it under it, then a bar (Play or Join tinted, Watch, Info, Store, Hub);
 *   - a category's header: rows with a glyph and a hint (New, Manage), Remove in red last;
 *   - a group chat (the list, a chat's tab): its avatar, name and members, a bar (Open tinted,
 *     Favorite, Leave in red), then rows (Close tab, Group profile, Play together, a game group's
 *     game rows; the game's own label goes).
 *
 * Steam's rows stay Steam's, told apart by their React key, never their words. Patched and laid
 * out by the game menu's code (client/library/game-menu.js: ns.libraryMenus); in its own popup
 * window a menu keeps the friend menu's room for its shadow and settles as it does
 * (ns.popMenuRoom, client/friends/friend-menu.js). The header and dividers are theme nodes among
 * Steam's rows, placed by CSS order, built once per menu. Drawn in the opener's page instead (Steam's
 * choice when it fits, [data-se-fm-inpage]), a menu is the library menus' panel, no room.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  const room = ns?.popMenuRoom;
  if (!ns?.libraryMenus || !room) return;
  const { run, attr } = SE;
  const { add, layoutRows, own, divider, keep, source } = ns.libraryMenus;

  // Steam's row keys (its game section, category and group chat menus) -> kind
  const KEYS = {
    launchgame: 'launch', joingame: 'join', joinparty: 'join', showinsteam: 'get',
    watchgame: 'watch', viewgameinfo: 'info', viewstorepage: 'store', viewcommunityhub: 'hub',
    creategroup: 'newcategory', managegroup: 'editcategory', removegroup: 'removecategory',
    opentab: 'openchat', closetab: 'closetab', viewprofile: 'groupprofile',
    findgamestoplay: 'playtogether', leavechatroom: 'leavechat', quickaccess: 'favorite',
  };

  // The hint lines of rows (a bar button shows none)
  const HINTS = {
    launch: 'Play it now',
    join: 'Join their game',
    get: 'Find it in your library',
    watch: 'Watch their stream',
    info: 'Server and session details',
    store: 'Price and reviews',
    hub: 'Guides, art and discussions',
    newcategory: 'A new group for your friends',
    editcategory: 'Its name and members',
    removecategory: 'Your friends stay friends',
    closetab: 'Close this chat',
    groupprofile: 'Its page on Steam Community',
    playtogether: 'Games you all own',
    // The bar's, as rows when the bar is too short to draw (game-menu.js MIN_BAR)
    openchat: 'In its own window',
    favorite: 'Pin it to the top of your list',
    unfavorite: 'Unpin it from the top',
    leavechat: 'You can rejoin by invite',
  };

  // The bar's words, by kind
  const WORDS = {
    launch: 'Play', join: 'Join', get: 'View', watch: 'Watch', info: 'Info', store: 'Store', hub: 'Hub',
    openchat: 'Open', favorite: 'Favorite', unfavorite: 'Unfavorite', leavechat: 'Leave',
  };

  // The main button's tint (game-menu.css [data-se-gm-action]; Open's in group-menus.css)
  const ACTION = { launch: 'play', join: 'play', openchat: 'open' };

  // A row's kind: the key on the few fibers above it (Favorite adds or removes: what it runs says which)
  function kindOf(row) {
    if (row.classList.contains('contextMenuGameTitle')) return 'gametitle';
    for (let f = SE.fiber(row), depth = 0; f && depth < 6; f = f.return, depth++) {
      const kind = f.key && KEYS[f.key];
      if (!kind) continue;
      if (kind === 'favorite' && source(f.memoizedProps?.onSelected).includes('RemoveFromFavorites')) return 'unfavorite';
      return kind;
    }
    return 'other';
  }

  // Each menu's likely size with its room, the popup's first guess (friend-menu.js makeRoom)
  const GUESS = { game: { w: 364, h: 330 }, category: { w: 324, h: 220 }, chat: { w: 364, h: 300 } };

  /** menu instance -> its element's props (Steam's menu component's) */
  const propsOf = new WeakMap();

  /*
   * One menu's layout: the bar and rows (spec: bar kinds, danger kinds, hidden kinds), the main
   * button's tint, the bar's divider only when rows follow it, the theme's header (head, built
   * once), and, in its own window, the room for its shadow and the window settled
   */
  function lay(panel, instance, spec) {
    const laid = layoutRows(panel, {
      kindOf,
      bar: spec.bar,
      hints: HINTS,
      danger: spec.danger,
      skip: [...spec.hidden, 'gametitle'],
      word: (kind) => WORDS[kind],
    });
    if (!laid) return;
    const { container, rows } = laid;
    const kinds = new Set();
    for (const row of rows) {
      const kind = row.getAttribute('data-se-gm');
      const hidden = spec.hidden.includes(kind);
      attr(row, 'data-se-fm-hide', hidden ? '' : null);
      attr(row, 'data-se-gm-action', row.getAttribute('data-se-gm-place') === 'bar' ? ACTION[kind] || null : null);
      if (!hidden) kinds.add(kind);
    }
    const asRow = (kind) => rows.some((row) => row.getAttribute('data-se-gm') === kind && row.getAttribute('data-se-gm-place') !== 'bar');
    keep(own(panel, 'danger-start', (doc) => divider(doc, 'danger-start')), container, spec.danger.some((kind) => kinds.has(kind) && asRow(kind)));
    const props = propsOf.get(instance);
    if (spec.head && props) keep(own(panel, 'head', (doc) => spec.head(doc, props)), container, true);
    /*
     * Unlike the friend menu (forced into a popup), Steam draws these in the opener's page when
     * they fit: there, no room and no shift (a shifted panel at the window's foot overflows it
     * and lifts the whole client); in a popup window the room is made now, before Steam
     * measures the menu (settle corrects the place it reads)
     */
    const inPage = (run(() => instance.m_position.element.ownerDocument) || document) === panel.ownerDocument;
    attr(panel, 'data-se-fm-inpage', inPage ? '' : null);
    if (inPage) return;
    run(room.make, instance, spec.guess);
    run(room.settle, panel, instance);
  }

  // A text node in its own element
  function text(doc, attrName, value) {
    const node = doc.createElement('span');
    node.setAttribute(attrName, '');
    node.textContent = value;
    return node;
  }

  /* ---------- A game's header ---------- */

  // The game as the Friends dock reads it (its name, the friends playing it)
  const dockGame = (appid) => window.__seFriendsDockParts?.read?.()?.games.find((game) => game.appid === appid) || null;

  // Under the banner: the game's name, and how many friends play it
  function gameHead(doc, props) {
    const game = run(dockGame, props.appid);
    const name = game?.name || run(() => window.appStore.GetAppOverviewByAppID(props.appid).display_name) || '';
    const count = game?.friends.length || 0;
    const head = doc.createElement('div');
    head.setAttribute('data-se-grm-head', 'game');
    head.append(text(doc, 'data-se-grm-name', name));
    if (count) head.append(text(doc, 'data-se-grm-meta', count === 1 ? '1 friend playing' : `${count} friends playing`));
    return head;
  }

  add({
    name: 'friend-game',
    // Steam's game header menu: { browserContext, appid, ownerWindow }, the game section inside
    test: (props) =>
      typeof props.appid === 'number' && 'browserContext' in props && 'ownerWindow' in props && Object.keys(props).length === 3,
    layout: (panel, instance) =>
      lay(panel, instance, { bar: ['launch', 'join', 'get', 'watch', 'info', 'store', 'hub'], danger: [], hidden: [], head: gameHead, guess: GUESS.game }),
    patched: (menu, instance) => propsOf.set(instance, menu.props),
  });

  /* ---------- A category's header ---------- */

  add({
    name: 'friend-category',
    // Steam's category menu: { browserContext, group (none on a built-in section), ownerWindow }
    test: (props) =>
      'group' in props && 'browserContext' in props && 'ownerWindow' in props && Object.keys(props).length === 3,
    layout: (panel, instance) => lay(panel, instance, { bar: [], danger: ['removecategory'], hidden: [], guess: GUESS.category }),
  });

  /* ---------- A group chat ---------- */

  // On top: the group's picture (else its initials), its name and its members
  function chatHead(doc, props) {
    const { group, clan } = props;
    const name = run(() => group.name) || run(() => clan.name) || '';
    const src = run(() => (group.hasIcon ? group.avatar_url_full : clan?.avatar_url_medium)) || '';
    const members = run(() => group.memberList.member_list.length) || 0;
    const head = doc.createElement('div');
    head.setAttribute('data-se-grm-head', 'chat');
    const avatar = doc.createElement('span');
    avatar.setAttribute('data-se-grm-avatar', '');
    if (src) {
      const img = doc.createElement('img');
      img.alt = '';
      img.src = src;
      avatar.append(img);
    } else {
      avatar.textContent = SE.initials(name);
    }
    const lines = doc.createElement('span');
    lines.setAttribute('data-se-grm-lines', '');
    lines.append(text(doc, 'data-se-grm-name', name));
    if (members) lines.append(text(doc, 'data-se-grm-meta', members === 1 ? '1 member' : `${members.toLocaleString()} members`));
    head.append(avatar, lines);
    return head;
  }

  add({
    name: 'friend-chat',
    // Steam's group chat menu: { browserContext, group (a chat group), clan, context, ownerWindow }
    test: (props) => 'clan' in props && 'context' in props && Boolean(props.group?.memberList),
    layout: (panel, instance) =>
      lay(panel, instance, {
        bar: ['openchat', 'favorite', 'unfavorite', 'leavechat'],
        danger: ['leavechat'],
        hidden: ['gametitle'],
        head: chatHead,
        guess: GUESS.chat,
      }),
    patched: (menu, instance) => propsOf.set(instance, menu.props),
  });
})(window.__se);
