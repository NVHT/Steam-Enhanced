/*
 * The friend card: an avatar hovered in the open panel (Steam's Friends tree) shows who the
 * friend is. The card is Steam's own (its MiniProfile component, given what Steam's hover gives
 * it: the persona and the loader of its community data, the profile background, frame, level
 * and badge), rendered by the theme for real in a popup-layer panel (client/shared/popup-layer.js): in
 * the page on the Library, in a popup window above a Store or Community page, which Steam's own
 * hover can't reach above. Steam's hover is hidden; client/shared/hover-cards.css styles both.
 *
 * Without the component (a Steam update moved it) the theme's own card stands in:
 * friendCardHTML (templates.js), the game flyout's card headed by the friend.
 *
 * A face in the collapsed rail (overRail / outRail) shows the same card, beside the rail; a
 * friend's row in a rail flyout (a game's or a "+N" tile's; overFly / outFly), beside the flyout.
 *
 * Hovering your avatar in the title bar shows your own card the same way, beside
 * the rail (the avatar's menu opens on click; client/header/menu/hover.js leaves its hover to this).
 *
 * Other parts show a friend's card beside an avatar of theirs the same way: showFor(avatar,
 * accountid) on the pointer coming in, leaveFor(event) on it going out, dropFor() when the
 * avatar may have been replaced (the Home's Friend activity, client/home/stage/panels-community.js).
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { app, ago, COPY, dock, friendCardHTML, state, STATE, statusLabel, steamHost } = ns;

  const { C, run } = SE;
  const layer = SE.layer;

  const AVATAR = '.avatarHolder';
  const SHEETS = ['core/levels.css', 'client/shared/hover-cards.css', 'client/friends/friends-dock.css', 'client/friends/friends-dock-chat.css'];
  // On <body> while the theme's card stands in for Steam's hover (friends-dock.css hides it)
  const ATTR = 'data-se-friend-card';


  /*
   * Steam's MiniProfile: the module that draws the card (it alone reads community_data_override
   * and blurs sections over a profile background); its class component export (the other
   * export, the background, is a plain function).
   */
  const findMiniProfile = () =>
    SE.findModule('friend-card:mini-profile', (src, id, req) => {
      if (!src.includes('community_data_override') || !src.includes('miniProfileBackdropBlur')) return null;
      const mod = run(() => req(id));
      return Object.values(mod || {}).find((value) => typeof value === 'function' && value.prototype?.render) || null;
    });

  // The Steam friend an avatar was drawn for: a row's friend, or you at the top.
  const friendOf = (el) =>
    SE.fromProps(el, 20, (props) => (props.friend?.persona ? props.friend : null)) ||
    (el.closest('.currentUserContainer') ? run(() => app().FriendStore.self) : null);

  // What Steam's own hover gives the card.
  function steamProps(friend) {
    const loader = run(() => friend.miniProfileData);
    if (!loader) return null;
    run(() => loader.EnsureCommunityDataLoaded());
    const props = {
      className: 'miniProfileHoverInner',
      persona: friend.persona,
      data_loader: loader,
      is_friend: Boolean(run(() => friend.is_friend) || friend === run(() => app().FriendStore.self)),
      is_blocked: Boolean(run(() => friend.is_blocked)),
      friend_relationship: run(() => friend.efriendrelationship),
    };
    if (run(() => friend.has_nickname)) props.nickname = friend.nickname;
    return props;
  }

  // The theme's own card, where Steam's can't be drawn.
  function describe(friend) {
    const persona = friend.persona;
    const playing = Boolean(run(() => persona.is_ingame));
    const stateName = playing ? 'ingame' : STATE[persona.m_ePersonaState] || 'offline';
    const game = playing ? run(() => persona.GetCurrentGameName()) || COPY.inGame : '';
    const presence = playing ? run(() => persona.GetCurrentGameRichPresence()) || '' : '';
    const last = run(() => persona.last_seen_online) || 0;
    let detail = '';
    if (playing && presence !== game) detail = presence;
    else if (stateName === 'offline' && last) detail = COPY.lastOnline(ago(last));
    return {
      name: run(() => friend.display_name) || persona.m_strPlayerName || '',
      avatar: run(() => persona.avatar_url_full) || run(() => persona.avatar_url_medium) || '',
      state: stateName,
      appid: playing ? persona.m_unGamePlayedAppID || 0 : 0,
      status: playing ? game : statusLabel(stateName),
      detail,
    };
  }

  const themeCard = (friend) => (container) => {
    container.insertAdjacentHTML('beforeend', friendCardHTML(describe(friend)));
  };

  // Steam's card where it can be drawn, the theme's otherwise (or if Steam's throws).
  function draw(avatar, friend) {
    const props = steamProps(friend);
    return (props && layer.react(findMiniProfile(), props)) || themeCard(friend);
  }

  // Steam waits a moment before its hover too: a pointer passing over the list opens nothing
  const card = layer?.hover({
    sheets: SHEETS,
    steam: true,
    place: (avatar) => ({ right: dock.getBoundingClientRect().left - SE.px('--se-space-3'), top: avatar.getBoundingClientRect().top }),
    draw,
    fallback: (avatar, friend) => themeCard(friend),
    // No window over a browser page: Steam's hover shows instead.
    blocked: () => document.body.removeAttribute(ATTR),
  });

  function over(event) {
    const target = event.target.closest?.(AVATAR);
    if (!card || state.destroyed || !target || target === card.node || !steamHost.contains(target)) return;
    card.leave();
    const friend = friendOf(target);
    // Set before Steam's own hover shows, which waits for its delay.
    SE.attr(document.body, ATTR, friend ? '' : null);
    if (friend) card.enter(target, friend);
  }

  function out(event) {
    if (card?.left(event)) card.leave();
  }

  // A friend's face in the collapsed rail (templates.js railTile): the card beside the rail
  const RAIL_FACE = '.se-fd-railfriend';

  function overRail(event) {
    const tile = event.target.closest?.(RAIL_FACE);
    if (!card || state.destroyed || !tile || tile === card.node || steamHost.contains(tile)) return;
    card.leave();
    const friend = run(() => app().FriendStore.GetPlayer(Number(tile.dataset.friend)));
    if (friend?.persona) card.enter(tile, friend);
  }

  function outRail(event) {
    if (event.target.closest?.(RAIL_FACE) && card?.left(event)) card.leave();
  }

  // A press opens the friend's chat beside the rail: the card makes way
  const pressRail = (event) => {
    if (event.target.closest?.(RAIL_FACE)) card?.leave();
  };

  /*
   * A friend's row in a rail flyout: the card to the flyout's left, level with the row. Only
   * in the main window: over a browser page the flyout is a popup window itself, and Steam
   * closes a menu window when another opens (client/shared/popup-layer.js), so the card would
   * close the flyout under the pointer.
   */
  const FLY_ROW = '.se-fd-fly .se-fd-row[data-friend]';

  const flyCard = layer?.hover({
    sheets: SHEETS,
    steam: true,
    place: (row) => ({
      right: row.closest('.se-fd-fly').getBoundingClientRect().left - SE.px('--se-space-3'),
      top: row.getBoundingClientRect().top,
    }),
    draw,
    fallback: (row, friend) => themeCard(friend),
  });

  function overFly(event) {
    const row = event.target.closest?.(FLY_ROW);
    if (!flyCard || state.destroyed || !row || row === flyCard.node || row.ownerDocument !== document) return;
    flyCard.leave();
    const friend = run(() => app().FriendStore.GetPlayer(Number(row.dataset.friend)));
    if (friend?.persona) flyCard.enter(row, friend);
  }

  function outFly(event) {
    if (event.target.closest?.(FLY_ROW) && flyCard?.left(event)) flyCard.leave();
  }

  // The flyout closed or a row was pressed (its chat opens): its card goes too
  const leaveFly = () => flyCard?.leave();

  // Your card, from the title bar's avatar
  const ACCOUNT = `.${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`;
  const selfCard = layer?.hover({
    sheets: SHEETS,
    steam: true,
    // Beside the rail, its foot on the avatar's
    place: (avatar) => {
      const rect = avatar.getBoundingClientRect();
      const gap = SE.px('--se-space-3');
      return (width, height) => ({ left: rect.right + gap, top: rect.bottom - height });
    },
    draw,
    fallback: (avatar, friend) => themeCard(friend),
  });

  function overAccount(event) {
    const avatar = event.target.closest?.(ACCOUNT);
    if (!selfCard || state.destroyed || !avatar || avatar === selfCard.node) return;
    const self = run(() => app().FriendStore.self);
    if (self) selfCard.enter(avatar, self);
  }

  function outAccount(event) {
    if (selfCard?.left(event)) selfCard.leave();
  }

  // A press opens the avatar's menu: the card makes way
  const pressAccount = () => selfCard?.leave();

  addEventListener('mouseover', overAccount, true);
  addEventListener('mouseout', outAccount, true);
  addEventListener('pointerdown', pressAccount, true);

  // A friend's card beside an avatar elsewhere in the main window, at its right
  const besideCard = layer?.hover({
    sheets: SHEETS,
    steam: true,
    place: (avatar) => {
      const rect = avatar.getBoundingClientRect();
      return { left: rect.right + SE.px('--se-space-3'), top: rect.top };
    },
    draw,
    fallback: (avatar, friend) => themeCard(friend),
  });

  function showFor(avatar, accountid) {
    if (!besideCard || state.destroyed || avatar === besideCard.node) return;
    const friend = run(() => app().FriendStore.GetPlayer(accountid));
    if (friend?.persona) besideCard.enter(avatar, friend);
  }

  function leaveFor(event) {
    if (besideCard?.left(event)) besideCard.leave();
  }

  // Closes the card when its avatar is gone (its list repainted) or, `always`, whatever it is on
  function dropFor(always = false) {
    if (besideCard?.node && (always || !besideCard.node.isConnected)) besideCard.leave();
  }

  function dispose() {
    card?.leave();
    selfCard?.leave();
    besideCard?.leave();
    flyCard?.leave();
    removeEventListener('mouseover', overAccount, true);
    removeEventListener('mouseout', outAccount, true);
    removeEventListener('pointerdown', pressAccount, true);
    document.body?.removeAttribute(ATTR);
  }

  ns.friendCard = {
    over, out, overRail, outRail, pressRail, overFly, outFly, leaveFly, dispose, showFor, leaveFor, dropFor,
  };
})(window.__se);
