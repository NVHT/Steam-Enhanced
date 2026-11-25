/*
 * Steam Settings › Library: a live preview of your Library over Steam's rows (styles:
 * client/settings/pages-library.css).
 *
 * The preview draws your recently played games as the Library does, from Steam's own rows as
 * they are now, redrawn as they change:
 * - Display size: the covers' size (Small, Medium, Large; Automatic as Medium)
 * - Show game icons in the left column: the list's icons
 * - Show Steam Deck compatibility information: a badge on each cover (Verified, Playable)
 * - Disable Community Content, Low Bandwidth Mode: the friend activity under the covers goes
 * - Low Performance Mode: the covers' shine and motion go
 * - Ready to Play should include streamable games: a streaming mark in the list
 * Hovering a row lights the part it changes. Rows are told by their label (as shared.js's row
 * icons are); a switch's value is its On class. Display size is Steam's radio group, read by its
 * checked button's place (ns.choiceAt).
 */
((SE) => {
  window.__seSettingsLibrary?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  const SHOWN = 10; // covers drawn (the widest size shows them all in two rows)

  // A row's label → what it changes in the preview
  const ROWS = [
    [/^low bandwidth/i, 'bandwidth'],
    [/^low performance/i, 'performance'],
    [/^disable community content/i, 'community'],
    [/^show game icons/i, 'icons'],
    [/^ready to play/i, 'streaming'],
    [/steam deck compatibility/i, 'deck'],
  ];
  // Display size's buttons, by place (Automatic, Small, Medium, Large: Steam's order)
  const SIZES = ['medium', 'small', 'medium', 'large'];

  const keyOf = (field) => {
    const label = ns.fieldLabel(field);
    return ROWS.find(([re]) => re.test(label))?.[1] || null;
  };

  // Display size is Steam's radio group (no .Field of its own), the switches its rows
  const SIZE_GROUP = '.Shared_Radio_Group';

  function read(page) {
    const state = { size: SIZES[ns.choiceAt(page.querySelector(SIZE_GROUP)?.parentElement)] || 'medium' };
    const rows = ns.rowsOf(page, ROWS);
    for (const [, key] of ROWS) state[key] = ns.switchOn(rows[key]);
    return state;
  }

  // Your games, last played first, with their cover, icon and Steam Deck category
  function games() {
    const { store, apps } = ns.recentGames(SHOWN);
    return apps.map((app) => ({
        name: app.display_name || '',
        cover: run(() => SE.coverURLs(app, store)) || [],
        icon: run(() => store.GetIconURLForApp(app)) || '',
        deck: Number(app.steam_deck_compat_category) || 0,
      }));
  }

  const part = (node, name) => {
    node.dataset.part = name;
    return node;
  };

  function makePreview() {
    const root = el('div', 'se-lib-preview');
    root.setAttribute('aria-hidden', 'true'); // a picture of the Library, not a control
    const list = part(el('div', 'se-lib-list'), 'icons');
    const covers = part(el('div', 'se-lib-covers'), 'size');
    const activity = part(el('div', 'se-lib-activity'), 'community');
    const main = el('div', 'se-lib-main');
    main.append(covers, activity);
    const shown = games();
    for (const game of shown.slice(0, 7)) {
      const row = el('div', 'se-lib-row');
      const icon = el('span', 'se-lib-icon');
      if (game.icon) {
        const img = el('img');
        img.alt = '';
        img.src = game.icon;
        img.addEventListener('error', () => img.remove(), { once: true });
        icon.append(img);
      }
      row.append(icon, el('span', 'se-lib-name', game.name));
      list.append(row);
    }
    const stream = part(el('div', 'se-lib-stream', 'Streamable games count as ready'), 'streaming');
    list.append(stream);
    for (const game of shown) {
      const cover = el('div', 'se-lib-cover');
      if (game.cover.length) cover.append(SE.art.img(game.cover, '', () => cover.classList.add('se-lib-blank')));
      const badge = part(el('span', 'se-lib-deck'), 'deck');
      if (game.deck === 3 || game.deck === 2) badge.dataset.deck = game.deck === 3 ? 'verified' : 'playable';
      cover.append(badge);
      covers.append(cover);
    }
    for (let i = 0; i < 3; i++) activity.append(el('span'));
    const frame = el('div', 'se-lib-frame');
    frame.append(list, main);
    root.append(frame);
    return { root, frame };
  }

  function draw(v, s) {
    v.frame.dataset.size = s.size || 'medium';
    SE.attr(v.frame, 'data-icons', s.icons ? '' : null);
    SE.attr(v.frame, 'data-deck', s.deck ? '' : null);
    SE.attr(v.frame, 'data-stream', s.streaming ? '' : null);
    SE.attr(v.frame, 'data-calm', s.performance ? '' : null);
    SE.attr(v.frame, 'data-quiet', s.community || s.bandwidth ? '' : null);
  }

  const view = ns.pageView({
    route: 'library',
    make: makePreview,
    read,
    draw,
    // Steam's switches move their On class; Display size its chosen button
    attributes: ['class', 'aria-checked'],
  });

  // The hovered row's part lit
  let hovered = null;
  const onOver = (event) => {
    const field = event.target.closest?.(`${view.PAGE} .Field`);
    const inSize = event.target.closest?.(`${view.PAGE} .DialogControlsSection`)?.querySelector(SIZE_GROUP);
    let key = field ? keyOf(field) : inSize ? 'size' : null;
    if (key === 'bandwidth') key = 'community'; // both quiet the activity
    if (key === 'performance') key = 'size'; // the covers' effects
    if (key === hovered) return;
    hovered = key;
    for (const v of view.views) {
      for (const node of v.root.querySelectorAll('[data-part]')) SE.attr(node, 'data-lit', node.dataset.part === key ? '' : null);
    }
  };
  document.addEventListener('pointerover', onOver);

  window.__seSettingsLibrary = {
    destroy() {
      view.destroy();
      document.removeEventListener('pointerover', onOver);
      delete window.__seSettingsLibrary;
    },
  };
})(window.__se);
