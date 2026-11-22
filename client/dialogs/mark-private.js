/*
 * Mark as Private, rebuilt: the game's hero art bleeds in behind the top under its capsule and
 * name, then two cards say what changes: what others stop seeing (ownership, in-game status,
 * playtime and activity) and what stays yours (the library, saves and achievements, undoing it).
 *
 * Steam renders the dialog from sp.js module 75799 (the route state's PrivateAppDialogTarget): a
 * generic ConfirmDialog (module 30583), in its own 680×320 popup when it pops out, with props
 * { rgAppIDs, fnCloseModal }. Its DialogHeader holds Steam's FeatureHidden icon and "Mark as
 * Private"; its body an empty description box and one pre-line div with the text; the
 * footer's ConfirmButtons are Mark as Private and Cancel. Inline, it renders in the window's
 * own tree (module 34271), under modal layers that put its props far up its fibers. The dialog
 * has no class of its own: it is found by that pre-line div, then told apart by the rgAppIDs
 * its fibers carry.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog's
 * DialogContent ([data-se-private]), hides Steam's icon and text, and appends its art and body at
 * the ends of child lists React doesn't change while the dialog is open. Marking is still Steam's
 * button. Popped out, the window grows to the taller dialog.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seMarkPrivate?.destroy();

  const OURS = 'se-private';
  const ROOT = 'data-se-private';
  // Steam's description: the only pre-line text in a dialog's body
  const TEXT = '.DialogBody div[style*="pre-line"]';
  // The dialog sits under Steam's modal layers (position, focus, portal): its props are far up
  const MAX_DEPTH = 40;

  // [icon token, text]: what others stop seeing, and what stays
  const HIDDEN = [
    ['--se-icon-eye-off', 'Ownership'],
    ['--se-icon-play', 'In-game status'],
    ['--se-icon-activity', 'Playtime and activity'],
  ];
  const KEPT = [
    ['--se-icon-grid', 'In your library'],
    ['--se-icon-badge', 'Saves and achievements'],
    ['--se-icon-restore', 'Undo from the game menu'],
  ];

  const attempt = SE.attempt('Mark as private');
  const { el } = SE;
  const isOurs = SE.inside(`.${OURS}`);

  // The dialog's own props ({ rgAppIDs, fnCloseModal })
  const readApps = (node) =>
    SE.fromProps(node, MAX_DEPTH, (p) =>
      Array.isArray(p.rgAppIDs) && p.rgAppIDs.length
        ? p.rgAppIDs.map(Number).filter((id) => id > 0)
        : undefined
    ) || [];

  const nameOf = (appid) => attempt(() => SE.appStore()?.GetAppOverviewByAppID(appid)?.display_name, '') || '';

  /*
   * The menu lists the chosen games in selection order, then every DLC of each (module 75799's
   * caller adds their app details' vecDLC). Games have a library overview; DLC don't. The game
   * the menu was opened on goes first, so its cover and art lead. { games: [{ appid, name }], dlc }
   */
  const splitApps = (appids) => {
    const games = [];
    for (const appid of appids) {
      const name = nameOf(appid);
      if (name) games.push({ appid, name });
    }
    if (!games.length) games.push({ appid: appids[0], name: '' });
    return { games: SE.leadApp(games, (game) => game.appid), dlc: appids.length - games.length };
  };

  const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

  /* ---------- Parts ---------- */

  const buildGame = ({ games, dlc }) => {
    const game = el('div', `${OURS}-game`);
    const stack = SE.dialogArt.capsules(games.map((g) => g.appid));
    const single = games.length === 1;
    const name = el('div', `${OURS}-name`, single ? games[0].name : plural(games.length, 'game', 'games'));
    // Several: the first two names, then how many more (all of them in the tooltip)
    const shown = games.slice(0, 2).map((g) => g.name);
    const more = games.length - shown.length;
    const what = single
      ? 'Hidden everywhere outside your library'
      : more ? `${shown.join(', ')} and ${more.toLocaleString()} more` : shown.join(' and ');
    const sub = el('div', `${OURS}-sub`, dlc ? `${what} · ${single ? 'with its' : 'with their'} ${dlc.toLocaleString()} DLC` : what);
    sub.title = single ? sub.textContent : games.map((g) => g.name).join('\n');
    game.append(stack, name, sub);
    return game;
  };

  const buildCard = (title, rows) => {
    const card = el('div', `${OURS}-card`);
    const list = el('ul', `${OURS}-list`);
    for (const [token, text] of rows) {
      const row = el('li', `${OURS}-row`, text);
      row.style.setProperty('--row-icon', `var(${token})`);
      list.append(row);
    }
    card.append(el('div', `${OURS}-label`, title), list);
    return card;
  };

  const buildBody = (apps) => {
    const body = el('div', `${OURS} ${OURS}-body`);
    const cards = el('div', `${OURS}-cards`);
    cards.append(buildCard('Hidden from others', HIDDEN), buildCard('Still yours', KEPT));
    body.append(buildGame(apps), cards);
    return body;
  };

  /*
   * Popped out, the dialog is its window: Steam opens it at 680×320, shorter than the rebuilt
   * dialog, so the window grows to fit (SteamClient's ResizeTo takes CSS pixels with `true`, as
   * Settings sizes its window in client/settings/dialog/window.js).
   */
  const fitWindow = (root) => {
    if (document.title === 'Steam') return;
    const win = window.SteamClient?.Window;
    if (!win?.ResizeTo) return;
    const need = Math.ceil(root.getBoundingClientRect().top + root.scrollHeight);
    if (need > innerHeight + 1) attempt(() => win.ResizeTo(innerWidth, Math.min(need, screen.availHeight || need), true));
  };

  /* ---------- View ---------- */

  const createView = (root) => {
    const text = root.querySelector(TEXT);
    const appids = text ? attempt(() => readApps(text), []) : [];
    if (!appids.length) return null;

    const nodes = [];
    const apps = splitApps(appids);
    const body = buildBody(apps);
    text.parentElement.append(body);
    nodes.push(body, attempt(() => SE.dialogArt.hero(root, apps.games[0].appid, OURS), null));
    SE.attr(root, ROOT, '');
    const frame = requestAnimationFrame(() => fitWindow(root));

    return {
      root,
      destroy() {
        cancelAnimationFrame(frame);
        for (const node of nodes) node?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'Mark as private',
    () =>
      [...document.querySelectorAll(TEXT)]
        .filter((text) => !text.closest('.GamepadMode'))
        .map((text) => text.closest('.DialogContent'))
        .filter(Boolean),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so Steam's
    // look never shows
    { sync: true, scope: '.DialogBody', ignore: isOurs }
  );

  window.__seMarkPrivate = {
    destroy() {
      mounted.destroy();
      delete window.__seMarkPrivate;
    },
  };
})(window.__se);
