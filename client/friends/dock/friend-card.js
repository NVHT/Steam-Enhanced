/*
 * The friend card: an avatar hovered in the open panel (Steam's Friends tree) shows who the
 * friend is. The card is Steam's own (its MiniProfile component, given what Steam's hover gives
 * it: the persona and the loader of its community data, the profile background, frame, level
 * and badge), rendered by the theme for real in a popup-layer panel (core/popup-layer.js): in
 * the page on the Library, in a popup window above a Store or Community page, which Steam's own
 * hover can't reach above. Steam's hover is hidden; client/dialogs/hover-cards.css styles both.
 *
 * Without the component (a Steam update moved it) the theme's own card stands in:
 * friendCardHTML (templates.js), the game flyout's card headed by the friend.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { app, ago, COPY, dock, friendCardHTML, state, STATE, statusLabel, steamHost } = ns;

  const { run } = SE;
  const layer = SE.layer;

  const AVATAR = '.avatarHolder';
  // On <body> while the theme's card stands in for Steam's hover (friends-dock.css hides it)
  const ATTR = 'data-se-friend-card';

  let card = null;
  // Steam waits a moment before its hover too: a pointer passing over the list opens nothing
  const intent = SE.hoverIntent((avatar, friend) => show(avatar, friend));

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

  function leave() {
    intent.cancel();
    card?.release();
    card = null;
  }

  function show(avatar, friend) {
    if (state.destroyed || !avatar.isConnected) return;
    card = layer.panel({ sheets: ['client/dialogs/hover-cards.css', 'client/friends/friends-dock.css'], steam: true });
    if (!card) {
      // No window over a browser page: Steam's hover shows instead.
      document.body.removeAttribute(ATTR);
      return;
    }
    const props = steamProps(friend);
    const steamCard = props && layer.react(findMiniProfile(), props);
    const rect = { right: dock.getBoundingClientRect().left - SE.px('--se-space-3'), top: avatar.getBoundingClientRect().top };
    try {
      card.show(rect, steamCard || themeCard(friend));
    } catch {
      card.show(rect, themeCard(friend));
    }
  }

  function over(event) {
    const target = event.target.closest?.(AVATAR);
    if (!target || target === intent.node || !steamHost.contains(target)) return;
    leave();
    const friend = layer ? friendOf(target) : null;
    // Set before Steam's own hover shows, which waits for its delay.
    SE.attr(document.body, ATTR, friend ? '' : null);
    if (friend) intent.enter(target, friend);
  }

  function out(event) {
    if (intent.left(event)) leave();
  }

  function dispose() {
    leave();
    document.body?.removeAttribute(ATTR);
  }

  ns.friendCard = { over, out, dispose };
})(window.__se);
