/*
 * ProtonDB Library Badges: marks <html data-se-pdb-toggle> while the plugin's dots toggle is in
 * the library's Recent / Ready to play row, so the sidebar toolbar (client/navigation) lays out
 * a slot for it. An attribute on the root, not a :has() there, so a layout switch costs one
 * lookup per batch of DOM changes instead of a document-wide selector match.
 */
((SE) => {
  const KEY = '__seProtonDB';
  window[KEY]?.destroy?.();

  const ATTR = 'data-se-pdb-toggle';
  const root = document.documentElement;
  const update = () =>
    SE.attr(root, ATTR, document.querySelector('.se-sidebar-icons .pdb-dots-toggle > *') ? '' : null);

  const watcher = SE.watch(update, { throttle: 100 });
  update();

  window[KEY] = {
    destroy() {
      watcher.disconnect();
      SE.unmark(root, ATTR);
      delete window[KEY];
    },
  };
})(window.__se);
