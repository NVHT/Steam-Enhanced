/*
 * A friend's right-click menu (the friends list, the dock, a chat), in the game menu's language
 * (client/friends/friend-menu.css over client/library/game-menu.css), with no submenu: a bar of
 * the friend's quick actions (Message, Voice, Profile, Favorite, Remove in red), then Manage's
 * and Trading's rows with a glyph and a hint (nickname, categories, notifications, inventory,
 * trade offer, report), Block in red last. Steam's rows for the game they play (its label, Launch, Watch,
 * Store, Hub...), Find Games to Play Together, your own game's invites and Recent Names (a
 * submenu) stay mounted, hidden ([data-se-fm-hide]).
 *
 * Steam's rows stay Steam's (its friend menu: { friend, browserContext, ownerWindow, context })
 * and are told apart by their React key (Steam keys every row it builds), never their words.
 * Patched and laid out by the game menu's code (client/library/game-menu.js: ns.libraryMenus);
 * the dividers are theme nodes among Steam's rows, placed by CSS order.
 *
 * Manage and Trading are drawn in the menu itself: the menu component's render is wrapped (once,
 * on its class; undone by cleanups) so Manage's submenu element becomes its rows in a fragment,
 * and Trading's component (which builds its own submenu) becomes the rows its render makes,
 * keyed for kindOf. Steam's elements either way: their clicks intact.
 *
 * The panel keeps the popup menus' room for its shadow (--se-pop-room-*, friend-menu.css), so the
 * menu's place (the instance's m_position, the pointer) moves by that room as it is made, toward
 * the side it opens to: the panel still opens at the pointer. Its window stays hidden until the
 * theme's stylesheet reaches it (settle). The component is a MobX
 * observer: its first render puts its reactive render on the instance, which redraws on every
 * change after, so that one is wrapped too (its MobX properties kept, so it still disposes).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns?.libraryMenus) return;
  const { run, attr } = SE;
  const { live } = ns;
  const { add, layoutRows, own, divider, keep } = ns.libraryMenus;

  // Steam's row keys (its friend menu and game section; se-* are Trading's, keyed here) -> kind
  const KEYS = {
    chat: 'chat', voicechat: 'voice', closetab: 'closetab',
    acceptincominginvite: 'accept', ignoreincominginvite: 'ignore', invite: 'add', remove: 'cancel',
    viewprofile: 'profile', findgamestoplay: 'together', report: 'report',
    setnickname: 'nickname', quickaccess: 'quickaccess', block: 'block',
    managecategories: 'categorize', notifications: 'notifications', removefriend: 'removefriend',
    aliases: 'aliases', 'se-inventory': 'inventory', 'se-tradeoffer': 'tradeoffer',
    launchgame: 'launch', joingame: 'join', joinparty: 'join', showinsteam: 'get',
    watchgame: 'watch', viewgameinfo: 'info', viewstorepage: 'store', viewcommunityhub: 'hub',
    gameinvite: 'invite', lobbyinvite: 'invite', invitetowatch: 'invite', invitetoremoteplay: 'invite',
    cancelremoteplay: 'invite', cancelallremoteplay: 'invite',
  };
  // Manage's rows, by key (how its submenu element is recognised)
  const MANAGE = ['setnickname', 'quickaccess', 'managecategories', 'notifications', 'removefriend', 'aliases', 'block'];
  // Trading's two rows, in its order: View Inventory, Send Trade Offer
  const TRADING = ['se-inventory', 'se-tradeoffer'];
  // The bar: the friend's quick actions, with the word under each icon
  const BAR = { chat: 'Message', voice: 'Voice', profile: 'Profile', quickaccess: 'Favorite', removefriend: 'Remove' };
  // The rows' hint lines (the bar's buttons have none)
  const HINTS = {
    nickname: 'A name only you see',
    categorize: 'Sort them into your groups',
    notifications: 'Sounds and alerts for them',
    inventory: 'Their items on Steam',
    tradeoffer: 'Swap items with them',
    report: 'Tell Steam about this player',
    block: 'No messages, invites or requests',
    closetab: 'Close this chat',
    accept: 'Add them to your friends',
    ignore: 'Dismiss their request',
    add: 'Send a friend request',
    cancel: 'Take back your request',
  };
  // Hidden: the game they play (its section's label and rows), your game's invites, Recent Names
  const HIDDEN = new Set([
    'gametitle', 'launch', 'join', 'get', 'watch', 'info', 'store', 'hub', 'mygametitle', 'invite', 'aliases', 'together',
  ]);
  // In red: the two that cut a friend off
  const DANGER = ['removefriend', 'block'];

  // A row's kind: the key on the few fibers above it; the game titles by class
  function kindOf(row) {
    if (row.classList.contains('contextMenuGameTitle')) {
      // The friend's game section (props unAppID) or your own game's (your invites)
      return SE.fromProps(row, 12, (p) => ('unAppID' in p ? 'gametitle' : undefined)) || 'mygametitle';
    }
    for (let f = SE.fiber(row), depth = 0; f && depth < 6; f = f.return, depth++) {
      if (f.key && KEYS[f.key]) return KEYS[f.key];
    }
    return 'other';
  }

  /* ---------- Manage and Trading in the menu ---------- */

  const keyed = (child, key) => child?.key === key;
  const isManage = (node) =>
    'label' in node.props && Array.isArray(node.props.children) && node.props.children.some((child) => MANAGE.some((key) => keyed(child, key)));

  // Trading's rows: its component's own render (a submenu of two rows), its rows keyed
  function tradingRows(node, React) {
    const Type = node.type;
    if (typeof Type?.prototype?.render !== 'function') return null;
    const instance = Object.create(Type.prototype);
    instance.props = node.props;
    const submenu = Type.prototype.render.call(instance);
    const rows = React.isValidElement(submenu) ? [].concat(submenu.props.children).filter(React.isValidElement) : [];
    if (rows.length !== TRADING.length) return null;
    return React.createElement(React.Fragment, { key: 'trading' }, ...rows.map((row, i) => React.cloneElement(row, { key: TRADING[i] })));
  }

  // The menu's element tree with Manage's submenu and Trading's component opened (a few levels)
  function inline(node, React, depth = 0) {
    if (depth > 4 || !node) return node;
    if (Array.isArray(node)) {
      let changed = false;
      const out = node.map((child) => {
        const next = inline(child, React, depth);
        if (next !== child) changed = true;
        return next;
      });
      return changed ? out : node;
    }
    if (!React.isValidElement(node)) return node;
    if (node.key === 'trading') return tradingRows(node, React) || node;
    if (isManage(node)) return React.createElement(React.Fragment, { key: 'se-manage' }, node.props.children);
    const children = node.props?.children;
    if (children == null) return node;
    const next = inline(children, React, depth + 1);
    return next === children ? node : React.cloneElement(node, null, next);
  }

  const INLINED = Symbol('se-inline');

  // render, its output opened; Steam's element as it is if anything fails (runs inside Steam's render)
  function inlining(render, React) {
    const wrapped = function (...args) {
      const element = render.apply(this, args);
      return run(inline, element, React) || element;
    };
    wrapped[INLINED] = true;
    return wrapped;
  }

  let renderHook = null;
  function inlineSubmenus(menu) {
    const React = live.api?.React;
    const proto = menu?.type?.prototype;
    if (renderHook || !React || typeof proto?.render !== 'function') return;
    const original = proto.render;
    const first = inlining(original, React);
    const wrapped = function (...args) {
      const element = first.apply(this, args);
      // MobX put its reactive render on the instance: wrapped too, with its own properties (its reaction)
      const own = Object.prototype.hasOwnProperty.call(this, 'render') ? this.render : null;
      if (typeof own === 'function' && !own[INLINED]) {
        run(() => {
          const reactive = inlining(own, React);
          for (const key of Reflect.ownKeys(own)) {
            if (!['length', 'name', 'prototype'].includes(key)) Object.defineProperty(reactive, key, Object.getOwnPropertyDescriptor(own, key));
          }
          this.render = reactive;
        });
      }
      return element;
    };
    proto.render = wrapped;
    renderHook = { proto, original, wrapped };
  }

  /* ---------- The room for the shadow ---------- */

  // The menu's likely size with its room, for the first guess (the real one is known once drawn)
  const GUESS_W = 364;
  const GUESS_H = 460;

  /** instance -> the pointer as Steam had it: { clientX, clientY, x, y } (x, y on the screen) */
  const pointers = new WeakMap();

  /*
   * Which side Steam opens a w × h menu on from the pointer (x, y on the screen), as its
   * PositionMenu decides: right unless it doesn't fit there and does on the left; below unless
   * it doesn't fit there and does above.
   */
  function sides(x, y, w, h, screen) {
    const { availLeft = 0, availTop = 0, availWidth, availHeight } = screen;
    const right = availLeft + availWidth - x - w > 0;
    const left = x - availLeft - w > 0;
    const below = availTop + availHeight - y - h > 0;
    const above = y - availTop - h > 0;
    return { left: !right && left, up: !below && above };
  }

  // The menu's place moved by the room toward the side it opens to, so the panel meets the pointer
  function place(instance, { left, up }) {
    const at = instance.m_position;
    const from = pointers.get(instance);
    const clientX = from.clientX + (left ? SE.px('--se-pop-room-side') : -SE.px('--se-pop-room-side'));
    const clientY = from.clientY + (up ? SE.px('--se-pop-room-bottom') : -SE.px('--se-pop-room-top'));
    at.clientX = clientX;
    at.clientY = clientY;
  }

  /*
   * As the menu is made: its place guessed from the menu's likely size (Steam reads the place
   * when it draws the menu, before its size is known). settle corrects it once the menu is drawn,
   * before Steam measures it.
   */
  function makeRoom(instance, guess = { w: GUESS_W, h: GUESS_H }) {
    const at = instance?.m_position;
    if (!at || pointers.has(instance) || typeof at.clientX !== 'number' || typeof at.clientY !== 'number') return;
    const win = at.element?.ownerDocument?.defaultView || window;
    const screenXY = Boolean(instance.m_options?.bScreenCoordinates);
    const x = at.clientX + (screenXY ? 0 : win.screenLeft);
    const y = at.clientY + (screenXY ? 0 : win.screenTop);
    pointers.set(instance, { clientX: at.clientX, clientY: at.clientY, x, y });
    place(instance, sides(x, y, guess.w, guess.h, win.screen));
  }

  /*
   * The side the menu opens to, worked out again with its real size (font-proof: a fixed width,
   * fixed row heights, friend-menu.css), straight into the place Steam's positioner reads: its
   * props, and the instance's m_position for any later drawing. Done in the layout, which runs
   * before Steam first measures and places the window (after its fonts are ready), so it opens
   * where it belongs, nothing to hide or move.
   *
   * The window is new each time; should friend-menu.css not have reached it yet (its room is the
   * menu box's padding), Steam would measure the bare menu: then the menu stays hidden until the
   * stylesheet applies, is placed again, its window shrinks to the menu (Steam moves the window
   * before resizing it, and Windows pushes a too-tall window moved near the screen's foot up), and
   * Steam's positioner sizes and places the window anew; it shows ([data-se-fm-shown]) once the
   * window stands where Steam put it (the positioner's state; else once still six frames), at
   * most half a second on. Checked each frame: nothing announces the stylesheet or the window
   * arriving.
   */
  const settling = new WeakSet();
  function settle(panel, instance) {
    const doc = panel.ownerDocument;
    const win = doc.defaultView;
    if (settling.has(panel) || !win) return;
    settling.add(panel);
    const frame = (fn) => win.requestAnimationFrame(() => panel.isConnected && run(fn));
    // Steam's positioner for the menu (the component that places its window)
    const positioner = () => {
      for (let f = SE.fiber(panel), depth = 0; f && depth < 6; f = f.return, depth++) {
        if (typeof f.stateNode?.PositionPopupWindow === 'function') return f.stateNode;
      }
      return null;
    };
    const correct = () => {
      const from = pointers.get(instance);
      if (!from) return;
      const box = panel.getBoundingClientRect();
      place(instance, sides(from.x, from.y, box.width, box.height, win.screen));
      const props = positioner()?.props;
      if (props && !Object.isFrozen(props)) {
        props.clientX = instance.m_position.clientX;
        props.clientY = instance.m_position.clientY;
      }
    };
    const reveal = () => attr(panel, 'data-se-fm-shown', '');
    const styled = () => win.getComputedStyle(panel).paddingLeft === `${SE.px('--se-pop-room-side')}px`;
    if (styled()) {
      correct();
      reveal();
      return;
    }

    // Opacity, not visibility: Steam writes the box's inline visibility itself (shown once placed)
    panel.style.setProperty('opacity', '0');
    const near = (a, b) => typeof b !== 'number' || Math.abs(a - b) <= 2;
    let waits = 0;
    let still = 0;
    let last = '';
    const revealWhenPlaced = () => {
      const state = positioner()?.state;
      const placed = !state || (near(win.screenX, state.menuLeft) && near(win.screenY, state.menuTop) && near(win.innerHeight, state.menuHeight));
      const now = `${win.screenX},${win.screenY},${win.innerWidth},${win.innerHeight}`;
      still = now === last ? still + 1 : 0;
      last = now;
      if (placed || still >= 6 || ++waits > 30) {
        panel.style.removeProperty('opacity');
        reveal();
      } else {
        frame(revealWhenPlaced);
      }
    };
    let frames = 0;
    const waitForStyles = () => {
      if (!styled() && ++frames < 120) {
        frame(waitForStyles);
        return;
      }
      correct();
      // The window shrinks to the menu first: Steam moves it before resizing it, and moved at the
      // bare menu's height near the screen's foot, Windows pushes it up to keep it on screen
      const box = panel.getBoundingClientRect();
      run(() => win.SteamClient.Window.ResizeTo(Math.ceil(box.width), Math.ceil(box.height), true));
      // Steam sizes and places the window now (its positioner), else on a passing node
      const pos = positioner();
      if (pos) {
        run(() => pos.PositionMenu());
      } else {
        const rows = panel.querySelector('.contextMenuContents') || panel;
        const node = doc.createComment('');
        rows.append(node);
        node.remove();
      }
      frame(revealWhenPlaced);
    };
    frame(waitForStyles);
  }

  /* ---------- Layout ---------- */

  // The friend in your favorites (Steam's one Favorites row adds or removes: its word says which)
  function isFavorite(panel) {
    const row = panel.querySelector('.contextMenuItem');
    const friend = row && SE.fromProps(row, 40, (p) => (p.friend?.persona ? p.friend : undefined));
    const favorites = SE.global('g_FriendsUIApp', (app) => app.FriendStore)?.FriendStore?.FavoritesStore;
    return Boolean(friend && run(() => favorites.BIsFavorited({ friend })));
  }

  function layout(panel, instance) {
    const favorite = isFavorite(panel);
    const laid = layoutRows(panel, {
      kindOf,
      bar: Object.keys(BAR),
      hints: HINTS,
      danger: DANGER,
      word: (kind) => (kind === 'quickaccess' && favorite ? 'Unfavorite' : BAR[kind]),
    });
    if (!laid) return;
    const { container, rows } = laid;
    const kinds = new Set(rows.map((row) => row.getAttribute('data-se-gm')));
    keep(own(panel, 'danger-start', (doc) => divider(doc, 'danger-start')), container, kinds.has('block'));
    for (const row of rows) attr(row, 'data-se-fm-hide', HIDDEN.has(row.getAttribute('data-se-gm')) ? '' : null);
    run(settle, panel, instance);
  }

  // The room and settling, for the friends list's other menus (client/friends/group-menus.js)
  ns.popMenuRoom = { make: makeRoom, settle };

  add({
    name: 'friend',
    test: (props) => Boolean(props.friend?.persona) && 'browserContext' in props && !('unAppID' in props),
    layout,
    patched: (menu, instance) => {
      inlineSubmenus(menu);
      run(makeRoom, instance);
    },
  });

  ns.cleanups.push(() => {
    if (renderHook?.proto.render === renderHook?.wrapped) renderHook.proto.render = renderHook.original;
    renderHook = null;
  });
})(window.__se);
