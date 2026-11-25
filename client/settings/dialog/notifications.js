/*
 * Steam Settings › Notifications: the toast switches in a hero beside a sample toast (styles:
 * client/settings/pages-notifications.css).
 *
 * The sample is the theme's own toast (SE.toastCard, client/toasts/card.js), in the Toast style
 * the theme's settings pick (Stage or Compact), at rest. It starts as an achievement for the game
 * you played last. Hovering a row (Store rows too, never greyed: their picker says what it picked
 * only in its own words), or flipping its Show Toast switch, turns it into that row's kind (a
 * friend coming online, a message, a controller's battery…), drawn from your own friends and
 * games where it can, and greys it out with "Toast off" when that toast is off; leaving the rows
 * puts the last flipped one back. Rows are told apart by their label, as the page's row icons
 * are (shared.js); an unknown row shows its own label.
 *
 * Steam's first section (the toasts dropdown and the sound toggle) is marked so CSS places it in
 * the hero beside the sample. Under it, four tiles (Client, Friends, Store, Email) show Steam's
 * other groups a tile at a time. The page is found by its route (the content's id ends
 * "/settings/notifications_Content"), the same in every language. The sample is the theme's own
 * node first in Steam's body, after the page's title (ns.pageView).
 */
((SE) => {
  window.__seSettingsNotifications?.destroy();
  const ns = window.__seSettingsParts;
  const card = SE.toastCard;
  if (!ns || !card) return;

  const { run, el } = SE;
  const PAGE = '[id$="/settings/notifications_Content"]';
  const MAIN = 'data-se-ntf-main';
  // The sample a little smaller than the real toast (card.js TRAY_W), so the switches keep room
  const SAMPLE_W = 280; // pages-notifications.css .se-ntf-sample

  // One of your friends in a state ('ingame' or 'online'): name, picture, account, their game
  const friendIn = (state) => {
    const app = run(() => SE.global('g_FriendsUIApp', (a) => a.FriendStore));
    for (const player of run(() => app.FriendStore.all_friends) || []) {
      const f = SE.friendStatus(player);
      if (state === 'ingame' ? f.state !== 'ingame' : f.state !== 'online' && f.state !== 'away') continue;
      return {
        ...f,
        accountId: run(() => player.accountid) || 0,
        appid: run(() => player.persona.m_unGamePlayedAppID) || 0,
      };
    }
    return null;
  };

  // A friend's part of an entry: their picture as the tile, their profile background as the art
  const from = (f) => (f ? { icon: f.avatar, accountId: f.accountId } : {});

  // Each row's label and its toast, as an entry of the toast window's kinds (card.js KINDS)
  const KINDS = [
    [/unlock an achievement/i, () => {
      const game = ns.lastGame();
      // The eyebrow already says what happened: the title is the game, the unlock a rare one so
      // the sample shows the rarity tiers when they're on
      return card.entry('ach', { title: game?.name || 'Your game', text: 'A rare achievement, just unlocked', appid: game?.appid || 0, pct: 8.4 });
    }],
    [/connect or disconnect a controller/i, () => card.entry('controller', { label: 'Controller', title: 'Controller connected', text: 'Ready to play' })],
    [/battery is low/i, () => card.entry('battery', { title: 'Controller battery low', text: '10% left' })],
    [/friend joins a game/i, () => {
      const f = friendIn('ingame');
      return card.entry('playing', { title: f?.name || 'A friend', text: f?.line || 'A game', ...from(f), appid: f?.appid || 0 });
    }],
    [/friend comes online/i, () => {
      const f = friendIn('online');
      return card.entry('online', { title: f?.name || 'A friend', text: 'Is now online', ...from(f) });
    }],
    [/direct chat message/i, () => {
      const f = friendIn('online');
      return card.entry('msg', { title: f?.name || 'A friend', text: 'gg, one more?', ...from(f) });
    }],
    [/chat room notification/i, () => {
      const f = friendIn('online');
      return card.entry('msg', { title: f ? `${f.name} in your group` : 'Group chat', text: 'Are you joining tonight?', ...from(f) });
    }],
    // The Store tile's rows (Steam's SteamNotificationTypeDesc_* labels)
    [/receive a gift/i, () => {
      const f = friendIn('online');
      return card.entry('gift', { title: 'You received a gift', text: f ? `from ${f.name}` : 'from a friend', ...from(f) });
    }],
    [/discussion .* reply/i, () => card.entry('comment', { title: 'A new reply', text: 'In a discussion you follow' })],
    [/new item in my inventory/i, () => card.entry('item', { title: 'New item', text: 'Added to your inventory' })],
    [/friend invitation/i, () => card.entry('request', { title: 'Friend request', text: 'Someone wants to be your friend' })],
    [/major sale/i, () => card.entry('sale', { label: 'Sale', title: 'A Steam sale has started', text: 'Deals across the store' })],
    [/wishlist is on sale/i, () => {
      const game = ns.lastGame();
      return card.entry('sale', { title: 'A game on your wishlist is on sale', text: '-40%', appid: game?.appid || 0 });
    }],
    [/trade offer/i, () => {
      const f = friendIn('online');
      return card.entry('trade', { title: 'You received a trade offer', text: f ? `from ${f.name}` : 'from a friend', ...from(f) });
    }],
    [/steam support/i, () => card.entry('system', { label: 'Steam Support', title: 'You have a new reply', text: 'About your request' })],
    [/playtest|limited launch/i, () => {
      const game = ns.lastGame();
      return card.entry('invite', { label: 'Playtest', title: 'You are invited to a playtest', text: game?.name || '', appid: game?.appid || 0 });
    }],
  ];

  const style = () => (SE.settings?.get('toast-style') === 'compact' ? 'compact' : 'stage');

  // Draws one entry into a sample, greyed under "Toast off" when its toast is off
  const draw = (sample, entry, off) => {
    sample.toast.show(entry, style());
    SE.attr(sample.box, 'data-off', off ? '' : null);
  };

  const makeSample = () => {
    const box = el('div', 'se-ntf-sample');
    box.setAttribute('aria-hidden', 'true'); // a picture of a toast, not a control
    box.inert = true; // its Dismiss button is drawn, not used
    const toast = card.sample(SAMPLE_W);
    box.append(toast.root);
    const sample = { box, toast };
    if (!shown) shown = { kind: KINDS[0][1](), off: false };
    drawn = drawn || shown;
    draw(sample, drawn.kind, drawn.off);
    return sample;
  };

  const kinds = new Map(); // label → entry, made once so hovering back and forth keeps its art
  const kindOf = (field) => {
    const label = ns.fieldLabel(field);
    if (!kinds.has(label)) {
      const make = KINDS.find(([re]) => re.test(label))?.[1];
      kinds.set(label, make ? make() : card.entry('system', { label: 'Notification', title: label }));
    }
    return kinds.get(label);
  };

  let shown = null; // { kind, off } drawn when no row is hovered: the first sample, then the last flipped
  let drawn = null; // what the samples show now (redrawn when the Toast style changes)
  const drawAll = (kind, off) => {
    drawn = { kind, off };
    for (const view of page.views) draw(view.sample, kind, off);
  };

  /*
   * A row's Show Toast switch (the first of its two) flipped: the sample becomes that row's kind.
   * The click is caught before Steam's (capture), so the switch still shows its old state: on
   * means it's turning off (Steam saves the setting first and moves its On class later).
   */
  const onClick = (event) => {
    const toggle = event.target.closest?.('.Field .Toggles > .Toggle');
    if (!toggle || toggle !== toggle.parentElement.firstElementChild || !toggle.closest(PAGE)) return;
    shown = { kind: kindOf(toggle.closest('.Field')), off: toggle.classList.contains('On') };
    drawAll(shown.kind, shown.off);
  };

  // Hovering a row previews its kind, greyed out when its toast is off; leaving the rows puts the
  // last sample back. Drawn only when the hovered row changes.
  let hovered = null;
  // A switch row (its Show Toast switch tells off) or a Store row (its target picker: never greyed,
  // as which targets it picked is only its localized text)
  const onOver = (event) => {
    const row = event.target.closest?.(`${PAGE} .Field`);
    const toggles = row?.querySelector('.Toggles');
    const field = toggles || row?.querySelector('.TargetSelectCtn') ? row : null;
    if (field === hovered) return;
    hovered = field;
    if (field) drawAll(kindOf(field), Boolean(toggles) && !toggles.firstElementChild?.classList.contains('On'));
    else if (shown) drawAll(shown.kind, shown.off);
  };

  // The Toast style changed in the theme's settings: the sample follows
  const offSettings = SE.settings?.on(() => drawn && drawAll(drawn.kind, drawn.off));

  /*
   * Section tabs: Steam's groups under the hero, four at most, one shown at a time. Steam's
   * groups (a labelled section and any unlabelled one after it: Flash window joins Friend
   * Notifications) are sorted by their rows, the same in every language: the first with Show
   * Toast | Play Sound switch pairs (.Toggles) is Client, later ones Friends; rows with target
   * pickers (.TargetSelectCtn: Store News, Personal, Wishlist, Developer) are Store; the rest
   * (Email Opt-out) Email. Each tab is a tile with a count (toasts on, groups or settings); the
   * chosen one's sections show under the tiles with Steam's own headings, the others are marked
   * hidden.
   */
  const HIDDEN = 'data-se-ntf-hidden';
  const TABS = [['client', 'Client'], ['friends', 'Friends'], ['store', 'Store'], ['email', 'Email']];
  let chosen = 'client'; // the open tab, kept while Settings stays open

  const groupsOf = (body, main) => {
    const steam = [];
    for (const section of body.querySelectorAll(':scope > .DialogControlsSection')) {
      if (section === main) continue;
      if (section.querySelector('.SettingsDialogSubHeader') || !steam.length) steam.push([section]);
      else steam[steam.length - 1].push(section);
    }
    const tabs = new Map();
    let seenSwitches = false;
    for (const sections of steam) {
      const has = (sel) => sections.some((s) => s.querySelector(sel));
      let key = 'email';
      if (has('.TargetSelectCtn')) key = 'store';
      else if (has('.Toggles')) key = seenSwitches ? 'friends' : 'client';
      if (key === 'client') seenSwitches = true;
      tabs.set(key, [...(tabs.get(key) || []), ...sections]);
    }
    return TABS.filter(([key]) => tabs.has(key)).map(([key, name]) => ({ key, name, sections: tabs.get(key) }));
  };

  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

  // A tile's line: how many toasts a switch group has on, else how many of Steam's groups or rows
  const summaryOf = (group) => {
    const rows = group.sections.flatMap((s) => [...s.querySelectorAll('.Field .Toggles')]);
    if (rows.length) {
      const on = rows.filter((r) => r.firstElementChild?.classList.contains('On')).length;
      return `${on} of ${rows.length} toasts on`;
    }
    if (group.key === 'store') return plural(group.sections.filter((s) => s.querySelector('.SettingsDialogSubHeader')).length, 'group');
    return plural(group.sections.reduce((n, s) => n + s.querySelectorAll('.Field').length, 0), 'setting');
  };

  // The tiles and the shown group, kept in step with Steam's sections (some load late) and switches
  const syncTabs = (view) => {
    const groups = groupsOf(view.body, view.main);
    const shown = groups.some((g) => g.key === chosen) ? chosen : groups[0]?.key;
    const names = groups.map((g) => g.key).join('|');
    if (names !== view.names) {
      view.names = names;
      view.tabs.replaceChildren(
        ...groups.map((g) => {
          const tab = el('button', 'se-ntf-tile');
          tab.type = 'button';
          tab.dataset.key = g.key;
          tab.setAttribute('role', 'tab');
          tab.append(el('span', 'se-ntf-tile-name', g.name), el('span', 'se-ntf-tile-line'));
          tab.addEventListener('click', () => {
            chosen = g.key;
            syncTabs(view);
          });
          return tab;
        })
      );
    }
    for (const tab of view.tabs.children) {
      tab.setAttribute('aria-selected', String(tab.dataset.key === shown));
      const line = tab.lastElementChild;
      const text = summaryOf(groups.find((g) => g.key === tab.dataset.key));
      if (line.textContent !== text) line.textContent = text;
    }
    for (const g of groups) for (const section of g.sections) SE.attr(section, HIDDEN, g.key === shown ? null : '');
    view.groups = groups;
  };

  // Steam's first section into the hero, the tiles right under it: again when Steam redraws it
  const attach = (view) => {
    const main = view.body.querySelector(':scope > .DialogControlsSection');
    if (main !== view.main) {
      if (view.main) SE.unmark(view.main, MAIN);
      view.main = main;
      if (main) SE.attr(main, MAIN, '');
    }
    if (main && main.nextElementSibling !== view.tabs) main.after(view.tabs);
    return Boolean(main);
  };

  // Before the page's first paint, so the switches never jump into the hero; redrawn as Steam adds
  // or swaps sections (the wishlist categories load after the page) and flips switches (the
  // tiles' counts)
  const page = ns.pageView({
    route: 'notifications',
    make(body) {
      const hero = el('div', 'se-ntf-hero');
      const sample = makeSample();
      hero.append(sample.box);
      const tabs = el('div', 'se-ntf-tabs');
      tabs.setAttribute('role', 'tablist');
      const view = {
        root: hero,
        body,
        main: null,
        sample,
        tabs,
        names: '',
        groups: [],
        destroy() {
          sample.toast.destroy();
          tabs.remove();
          if (view.main) SE.unmark(view.main, MAIN);
          for (const section of body.querySelectorAll(`[${HIDDEN}]`)) SE.unmark(section, HIDDEN);
        },
      };
      return view;
    },
    read: () => null,
    draw(view) {
      if (attach(view)) syncTabs(view);
    },
  });

  // A field in a hidden group taking focus (the settings search, the keyboard): open its tab
  const onFocus = (event) => {
    const section = event.target.closest?.(`${PAGE} [${HIDDEN}]`);
    if (!section) return;
    for (const view of page.views) {
      const group = view.groups.find((g) => g.sections.includes(section));
      if (!group) continue;
      chosen = group.key;
      syncTabs(view);
    }
  };

  // Capture: Steam's switch may stop the click on its way up
  document.addEventListener('click', onClick, true);
  document.addEventListener('focusin', onFocus);
  document.addEventListener('pointerover', onOver);

  window.__seSettingsNotifications = {
    destroy() {
      page.destroy();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('pointerover', onOver);
      offSettings?.();
      delete window.__seSettingsNotifications;
    },
  };
})(window.__se);
