/*
 * Delete Collection, rebuilt: the collection's tile (its first covers, a red bin badge) beside
 * "Delete “name”?" and what goes (its game count, the games staying in your library), then
 * Cancel and Delete, the red one.
 *
 * Steam renders the dialog from sp.js (CSS module 83628, CollectionDeleteContainer on the
 * dialog's content, a destructive dialog of the collection menu's Delete): CollectionDelete
 * (Steam's collection tile with a cross over it), then CollectionDeleteRightSide holding the
 * DialogHeader "Delete Collection" and the body: "Are you sure…" (DialogBodyText) and the
 * footer's ConfirmButtons (Remove, Cancel). Its props are { strCollectionId, strDisplayName }.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the box holding
 * Steam's tile and right side ([data-se-delcoll]; the dialog's content wraps it), hides Steam's
 * tile, header and question, and appends its tile and text at the ends of child lists React
 * doesn't change while the dialog is open (that box, the right side), placed first by CSS order. Deleting is still Steam's Remove button, labelled Delete.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seDeleteCollection?.destroy();

  /* CollectionDeleteContainer CSS module (sp.js 83628) */
  const C = {
    root: `.${SE.C.CollectionDeleteContainer}`,
    side: `.${SE.C.CollectionDeleteContainer_RightSide}`,
  };

  const OURS = 'se-dc';
  const ROOT = 'data-se-delcoll';
  // Covers in the tile (two by two)
  const COVERS = 4;

  const attempt = SE.attempt('Delete collection');
  const isOurs = (node) => node.nodeType === 1 && node.closest?.(`.${OURS}`);

  // The dialog's own props ({ strCollectionId, strDisplayName }), and the collection they name
  function readCollection(root) {
    const props = SE.fromProps(root, 12, (p) => (typeof p.strCollectionId === 'string' ? p : undefined));
    if (!props) return null;
    const collection = SE.run(() => SE.global('collectionStore').GetCollection(props.strCollectionId));
    const apps = SE.run(() => [...collection.visibleApps]) || [];
    return { name: props.strDisplayName || collection?.displayName || '', apps };
  }

  // A cover working through its copies, local first (core/runtime.js SE.art); none left: no img
  function cover(app) {
    const urls = SE.run(() => SE.coverURLs(app)) || [];
    if (!urls.length) return null;
    const img = SE.art.img(urls, '', () => img.remove());
    return img;
  }

  function buildTile(doc, apps) {
    const tile = doc.createElement('div');
    tile.className = `${OURS}-tile ${OURS}`;
    tile.setAttribute('aria-hidden', 'true');
    const covers = doc.createElement('div');
    covers.className = `${OURS}-covers`;
    for (let i = 0; i < COVERS; i++) {
      const cell = doc.createElement('span');
      const img = apps[i] && cover(apps[i]);
      if (img) cell.append(img);
      covers.append(cell);
    }
    const badge = doc.createElement('span');
    badge.className = `${OURS}-badge`;
    tile.append(covers, badge);
    return tile;
  }

  function buildText(doc, { name, apps }) {
    const text = doc.createElement('div');
    text.className = `${OURS}-text ${OURS}`;
    const title = doc.createElement('div');
    title.className = `${OURS}-title`;
    title.textContent = `Delete “${name}”?`;
    const body = doc.createElement('p');
    body.className = `${OURS}-body`;
    const n = apps.length;
    body.textContent = n
      ? `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}. They stay in your library; only the collection goes.`
      : 'It has no games. Only the collection goes.';
    text.append(title, body);
    return text;
  }

  const createView = (root) => {
    const nodes = [];
    let built = false;
    // Steam's tile and right side sit together in this box (marked [data-se-delcoll])
    let box = null;
    let button = null;

    const sync = () => {
      if (built || !root.isConnected) return;
      const side = root.querySelector(C.side);
      const data = side && attempt(() => readCollection(root), null);
      if (!data) return;
      built = true;
      change.disconnect();
      const doc = root.ownerDocument;
      const tile = buildTile(doc, data.apps);
      const text = buildText(doc, data);
      box = side.parentElement;
      box.append(tile);
      side.append(text);
      nodes.push(tile, text);
      SE.attr(box, ROOT, '');
      // CSS draws "Delete" over Steam's "Remove": one name for screen readers
      button = box.querySelector('.DialogFooter .DialogButton.Primary');
      SE.attr(button, 'aria-label', 'Delete');
    };

    // The right side can mount after the frame
    const change = SE.onChange(root, sync, { ignore: isOurs });
    sync();

    return {
      root,
      destroy() {
        change.disconnect();
        for (const node of nodes) node.remove();
        if (box) SE.unmark(box, ROOT);
        SE.unmark(button, 'aria-label');
      },
    };
  };

  const mounted = SE.mount(
    'Delete collection',
    () => [...document.querySelectorAll(C.root)].filter((root) => !root.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so
    // Steam's look never shows
    { sync: true, scope: C.root, ignore: isOurs }
  );

  window.__seDeleteCollection = {
    destroy() {
      mounted.destroy();
      delete window.__seDeleteCollection;
    },
  };
})(window.__se);
