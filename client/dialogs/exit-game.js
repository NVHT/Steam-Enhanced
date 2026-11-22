/*
 * Exit Game, rebuilt: the game's hero art behind the top, Steam's "Exit game?" as the eyebrow over
 * the game's name and the warning, then Keep playing and Exit game, the red one.
 *
 * Steam renders the dialog from sp.js (the library's Stop button, ShowExitGameDialog): a generic
 * ConfirmDialog with className ExitGameDialog, strTitle "#GameAction_ConfirmExitGameTitle",
 * strDescription "#AppOverlay_UnsavedDataWarning", inside the component holding
 * { gameid, appid, fnAccepted, fnCanceled }. Its OK button (Confirm) terminates the game.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog's
 * DialogContent ([data-se-exitgame]), puts the game's name after Steam's header (the dialog
 * doesn't change while open) and appends the art; CSS gives the buttons their words. Exiting is still
 * Steam's Confirm button.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seExitGame?.destroy();

  const OURS = 'se-exitgame';
  const ROOT = 'data-se-exitgame';
  // The dialog sits under Steam's modal layers (position, focus, portal): its props are far up
  const MAX_DEPTH = 40;

  const attempt = SE.attempt('Exit game');
  const isOurs = SE.inside(`.${OURS}`);

  const readAppId = (node) =>
    SE.fromProps(node, MAX_DEPTH, (p) => ('gameid' in p && Number(p.appid) > 0 ? Number(p.appid) : undefined)) || 0;

  const nameOf = (appid) => attempt(() => SE.appStore()?.GetAppOverviewByAppID(appid)?.display_name, '') || '';

  const createView = (marked) => {
    const root = marked.closest('.DialogContent') || marked.querySelector('.DialogContent');
    const appid = root ? readAppId(marked) : 0;
    if (!appid) return null;

    const nodes = [];
    const header = root.querySelector('.DialogHeader');
    const name = SE.el('div', `${OURS} ${OURS}-name`, nameOf(appid));
    if (header && name.textContent) {
      header.after(name);
      nodes.push(name);
    }
    nodes.push(attempt(() => SE.dialogArt.hero(root, appid, OURS), null));
    SE.attr(root, ROOT, '');
    // CSS draws the buttons' words over Steam's Confirm and Cancel: one name each for screen readers
    const ok = root.querySelector('.DialogFooter .DialogButton.Primary');
    const cancel = root.querySelector('.DialogFooter .DialogButton:not(.Primary)');
    SE.attr(ok, 'aria-label', 'Exit game');
    SE.attr(cancel, 'aria-label', 'Keep playing');

    return {
      root,
      destroy() {
        for (const node of nodes) node?.remove();
        SE.unmark(root, ROOT);
        SE.unmark(ok, 'aria-label');
        SE.unmark(cancel, 'aria-label');
      },
    };
  };

  const DIALOG = `.${SE.C.ExitGameDialog}`;
  const mounted = SE.mount(
    'Exit game',
    () => [...document.querySelectorAll(DIALOG)].filter((node) => !node.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so Steam's
    // look never shows
    { sync: true, scope: DIALOG, ignore: isOurs }
  );

  window.__seExitGame = {
    destroy() {
      mounted.destroy();
      delete window.__seExitGame;
    },
  };
})(window.__se);
