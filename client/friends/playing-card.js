/*
 * "Playing now": the game list shows who is playing a game when its friends icon is hovered.
 * The theme draws that card itself, for real, as a popup-layer panel (client/shared/popup-layer.js): in
 * the page on the Library, in a popup window above a Store or Community page's browser view,
 * which Steam's own hover (drawn in the main window) can't reach above. Steam's hover is hidden.
 * The card carries the attributes client/friends/friend-hover.css styles, the same look
 * Steam's hover had.
 *
 * The friends come from the Friends dock's read of Steam's FriendStore; without the dock, or if
 * the card can't open, Steam's hover shows.
 */
((SE) => {
  const { C } = SE;
  SE.playingCard?.destroy();
  const layer = SE.layer;
  if (!layer) return;

  const ICON = `.${C.FriendIsPlaying}`;
  // On <body> while the theme's card stands in for Steam's hover (friend-hover.css hides it)
  const ATTR = 'data-se-playing-card';

  // Steam waits a moment before its hover too: a pointer passing over the list opens nothing
  const card = layer.hover({
    sheets: ['client/friends/friend-hover.css'],
    place(icon) {
      const rect = icon.getBoundingClientRect();
      const gap = SE.px('--se-space-2');
      return { left: rect.right + gap, top: rect.top - gap };
    },
    draw: (icon, game) => build(game),
    // No window over a browser page: Steam's hover shows instead.
    blocked: () => document.body.removeAttribute(ATTR),
  });

  const gameOf = (appid) =>
    window.__seFriendsDockParts?.read?.()?.games.find((game) => game.appid === appid && game.friends.length) || null;

  // The card, in the window's document: one row per friend, as Steam's hover has them.
  const build = (game) => (wrap) => {
    const doc = wrap.ownerDocument;
    const el = (tag, attr) => {
      const node = doc.createElement(tag);
      node.setAttribute(attr, '');
      return node;
    };
    const host = el('div', 'data-se-fh-host');
    host.setAttribute('data-se-fh', '');
    host.setAttribute('data-se-fh-own', ''); // the theme's, kept when Steam's is hidden
    for (const friend of game.friends) {
      const row = el('div', 'data-se-fh-row');
      const frame = doc.createElement('div');
      const avatar = el('img', 'data-se-fh-av');
      avatar.alt = '';
      if (friend.avatar) avatar.src = friend.avatar;
      frame.append(avatar);
      const text = doc.createElement('div');
      const name = el('span', 'data-se-fh-name');
      const playing = el('span', 'data-se-fh-game');
      name.textContent = friend.name;
      playing.textContent = game.name;
      text.append(name, playing);
      row.append(frame, text);
      host.append(row);
    }
    wrap.append(host);
  };

  function onOver(event) {
    const target = event.target.closest?.(ICON);
    if (!target || target === card.node) return;
    card.leave();
    const game = gameOf(SE.appOf(target)?.appid);
    // Set before Steam's own hover shows, which waits for its delay.
    SE.attr(document.body, ATTR, game ? '' : null);
    if (game) card.enter(target, game);
  }

  function onOut(event) {
    if (card.left(event)) card.leave();
  }

  document.addEventListener('mouseover', onOver);
  document.addEventListener('mouseout', onOut);

  SE.playingCard = {
    destroy() {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      card.leave();
      document.body?.removeAttribute(ATTR);
      delete SE.playingCard;
    },
  };
})(window.__se);
