/*
 * Dim uninstalled games (a theme setting, client/shared/settings.js; drawn by
 * options/library/dim-uninstalled.css): each cover (LibraryItemBox) whose game isn't installed
 * is marked data-se-uninstalled. Steam's own marks on a cover don't say it at rest everywhere (a
 * collection shelf's Install button exists only while hovered), so it's read from the game
 * (SE.appOf, SE.isInstalled): the game found once per cover, its state read again each pass, so
 * a game installed or removed meanwhile follows. Idle while the setting is off.
 */
((SE) => {
  window.__seDimUninstalled?.destroy();
  const { C } = SE;

  const BOX = `.${C.LibraryItemBox}`;
  const MARK = 'data-se-uninstalled';
  const games = new Map(); // a cover → its game (null: none found)
  let watcher = null;

  const update = () => {
    for (const [box] of games) if (!box.isConnected) games.delete(box);
    for (const box of document.querySelectorAll(BOX)) {
      if (!games.has(box)) games.set(box, SE.appOf(box) || null);
    }
    for (const [box, app] of games) {
      SE.attr(box, MARK, app && !SE.isInstalled(app) ? '' : null);
    }
  };

  const stop = () => {
    watcher?.disconnect();
    watcher = null;
    for (const [box] of games) box.removeAttribute(MARK);
    games.clear();
  };

  // On with the setting, off without it
  const apply = () => {
    const on = SE.settings?.get('dim-uninstalled') === 'on';
    if (on && !watcher) {
      // Throttled: covers redraw in bursts as shelves and grids scroll
      watcher = SE.watch(update, { throttle: 200 });
      update();
    } else if (!on && watcher) stop();
  };

  const unsubscribe = SE.settings?.on(apply);
  apply();

  window.__seDimUninstalled = {
    destroy() {
      unsubscribe?.();
      stop();
      delete window.__seDimUninstalled;
    },
  };
})(window.__se);
