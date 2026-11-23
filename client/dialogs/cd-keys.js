/*
 * CD Keys, rebuilt: the game's hero art behind the top, Steam's "CD Keys" as the eyebrow over the
 * game's name and Steam's description, then each key as a card (its name over the key, a copy
 * button at its end) and Close.
 *
 * Steam renders the dialog from sp.js (the game menu's CD keys, steam://cdkeys/<appid>): a
 * GenericDialog with className CDKeysDialog, inside the component holding { app,
 * bShowDontShowCheckbox, onClose }. Its KeyList holds one focusable CDKeyOption per key (KeyName,
 * KeyValue); activating one copies the key when the game allows it (its app details'
 * bSupportsCDKeyCopyToClipboard) and swaps the value for "Copied key to clipboard" for 2 s
 * (KeyValue.CopyAnimation).
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog's
 * DialogContent ([data-se-cdkeys], with [data-se-cdkeys-copy] when keys copy), puts the game's
 * name after Steam's header (the dialog doesn't change while open), appends the art and, popped
 * out, grows the window to the dialog (Steam sizes it to its own). Copying
 * is still Steam's.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seCdKeys?.destroy();

  const OURS = 'se-cdkeys';
  const ROOT = 'data-se-cdkeys';
  const COPY = 'data-se-cdkeys-copy';
  // The dialog sits under Steam's modal layers (position, focus, portal): its props are far up
  const MAX_DEPTH = 40;

  const attempt = SE.attempt('CD keys');
  const isOurs = SE.inside(`.${OURS}`);

  const readApp = (node) =>
    SE.fromProps(node, MAX_DEPTH, (p) => (Number(p.app?.appid) > 0 && 'bShowDontShowCheckbox' in p ? p.app : undefined)) || null;

  // Steam's own flag for copying (the dialog reads the same one)
  const copies = (appid) =>
    attempt(() => SE.global('appDetailsStore')?.GetAppDetails(appid)?.bSupportsCDKeyCopyToClipboard, false) === true;

  const createView = (marked) => {
    const root = marked.closest('.DialogContent') || marked.querySelector('.DialogContent');
    const app = root ? readApp(marked) : null;
    if (!app) return null;
    const appid = Number(app.appid);

    const nodes = [];
    const header = root.querySelector('.DialogHeader');
    const name = SE.el('div', `${OURS} se-dialog-name`, app.display_name || '');
    if (header && name.textContent) {
      header.after(name);
      nodes.push(name);
    }
    nodes.push(attempt(() => SE.dialogArt.hero(root, appid, OURS), null));
    SE.attr(root, ROOT, '');
    if (copies(appid)) SE.attr(root, COPY, '');
    // Popped out, Steam sizes the window to its own dialog, whose list scrolled at 160 px
    const unfit = SE.dialogArt.fitWindow(root);

    return {
      root,
      destroy() {
        unfit();
        for (const node of nodes) node?.remove();
        SE.unmark(root, ROOT);
        SE.unmark(root, COPY);
      },
    };
  };

  const DIALOG = `.${SE.C.CDKeysDialog}`;
  const mounted = SE.mount(
    'CD keys',
    () => [...document.querySelectorAll(DIALOG)].filter((node) => !node.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so Steam's
    // look never shows
    { sync: true, scope: DIALOG, ignore: isOurs }
  );

  window.__seCdKeys = {
    destroy() {
      mounted.destroy();
      delete window.__seCdKeys;
    },
  };
})(window.__se);
