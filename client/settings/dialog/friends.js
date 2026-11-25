/*
 * Steam Settings › Friends & Chat: a header of your friends, then Steam's sections as cards
 * (styles: client/settings/pages.css, "Friends & Chat").
 *
 * The header's art is a wall of your friends' pictures (Steam's "?" left out), online ones bright
 * and offline ones faded, mixed once per view, under the count ("901 friends · 190 online").
 * Friends come from Steam's friend store (SE.friendStatus).
 *
 * The page is found by its route (the content's id ends "/settings/friends_Content"), the same
 * in every language. The header is the theme's own node first in Steam's body, after the page's
 * title (ns.pageView); Steam's sections stay as they are.
 */
((SE) => {
  window.__seSettingsFriends?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  const WALL = 96; // pictures: enough to fill the widest window's three rows

  const friends = () => {
    const app = run(() => SE.global('g_FriendsUIApp', (a) => a.FriendStore));
    return (run(() => app.FriendStore.all_friends) || []).map((player) => SE.friendStatus(player));
  };

  // A few friends' pictures in a random order, online ones first so the wall is never all faded
  const wallOf = (all) => {
    const shown = all.filter((f) => f.avatar);
    for (let i = shown.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shown[i], shown[j]] = [shown[j], shown[i]];
    }
    const on = shown.filter((f) => f.state !== 'offline');
    const off = shown.filter((f) => f.state === 'offline');
    const picked = [...on.slice(0, WALL / 2), ...off].slice(0, WALL);
    // Mixed again, so the bright ones scatter across the wall
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    const wall = el('div', 'se-fc-wall');
    for (const friend of picked) {
      const img = el('img');
      img.decoding = 'async';
      img.alt = '';
      img.src = friend.avatar;
      if (friend.state !== 'offline') img.dataset.on = '';
      img.addEventListener('error', () => img.remove(), { once: true });
      wall.append(img);
    }
    return wall;
  };

  const view = ns.pageView({
    route: 'friends',
    make() {
      const all = friends();
      const online = all.filter((f) => f.state !== 'offline').length;
      const head = el('div', 'se-fc-head');
      head.setAttribute('aria-hidden', 'true'); // a picture of your friends, not a control
      const count = el('span', 'se-fc-count', SE.dialogArt?.count(all.length, 'friend', 'friends') || `${all.length} friends`);
      if (online) count.append(' · ', el('span', 'se-fc-online', `${online} online`));
      head.append(wallOf(all), count);
      return { root: head };
    },
    // Nothing of the page's rows: drawn once
    read: () => null,
    draw() {},
  });

  window.__seSettingsFriends = {
    destroy() {
      view.destroy();
      delete window.__seSettingsFriends;
    },
  };
})(window.__se);
