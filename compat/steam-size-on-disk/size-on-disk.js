/*
 * Size on Disk (github.com/k0d13/steam-size-on-disk): its Installed Files page for non-Steam
 * games in Game Properties, paired with size-on-disk.css. (Its play bar stat and settings panel
 * are CSS only.)
 *
 * The plugin builds that page from the Shortcut page's parts (SettingsStyles: Title,
 * AsyncBackedInputChildren) with no classes of its own:
 *
 *   Title "Folder", description, row [path input (read-only), Change, Clear]
 *   Title "Size on Disk", "12.3 GB across 456 files", row [Recalculate]   (once a folder is set)
 *
 * This tags the parts so the CSS can lay them out as one card, the size in a tile like Steam's
 * own Installed Files page, and splits the size line into the figure and the rest. The panel is
 * told apart from the Shortcut page by its read-only path input (Shortcut's fields are editable).
 */
((SE) => {
  const KEY = '__seSizeOnDisk';
  window[KEY]?.destroy?.();

  const TITLE = `.${SE.C.Added_Title}`; // SettingsStyles.Title
  const ROW = `.${SE.C.AsyncBackedInputChildren}`; // SettingsStyles.AsyncBackedInputChildren
  const PANEL = 'data-se-sod';
  const PART = 'data-se-sod-part';
  const SIZE = /^\s*([\d.,]+\s*[^\s\d.,]+)\s+(.+?)\s*$/; // "12.3 GB" + "across 456 files"

  const tagged = new Set();

  const tag = (el, part) => {
    if (!el) return;
    SE.mark(el, PART, part);
    tagged.add(el);
  };

  function scan() {
    for (const el of tagged) if (!el.isConnected) tagged.delete(el);

    for (const first of document.querySelectorAll(`.DialogBody > div > ${TITLE}:first-child`)) {
      const panel = first.parentElement;
      const rows = panel.querySelectorAll(`:scope > ${ROW}`);
      if (!rows[0]?.querySelector('input[readonly]')) continue;

      SE.mark(panel, PANEL, '');
      tagged.add(panel);

      const titles = panel.querySelectorAll(`:scope > ${TITLE}`);
      tag(titles[0], 'title');
      tag(titles[0].nextElementSibling, 'desc');
      tag(rows[0], 'folder');

      const sizeTitle = titles[1];
      SE.attr(panel, 'data-se-sod-sized', sizeTitle ? '' : null);
      if (!sizeTitle) continue;
      tag(sizeTitle, 'title-size');
      const line = sizeTitle.nextElementSibling;
      tag(line, 'size');
      tag(rows[1], 'actions');

      const m = line && SIZE.exec(line.textContent || '');
      // "Calculating..." and the failure message stay plain text
      const figure = m && /\d/.test(m[1]) ? m : null;
      SE.attr(line, 'data-se-big', figure ? figure[1] : null);
      SE.attr(line, 'data-se-rest', figure ? figure[2] : null);
    }
  }

  const watcher = SE.watch(scan, { characterData: true, throttle: 50 });
  scan();

  window[KEY] = {
    destroy() {
      watcher.disconnect();
      for (const el of tagged) {
        for (const name of [PANEL, PART, 'data-se-sod-sized', 'data-se-big', 'data-se-rest']) SE.unmark(el, name);
      }
      tagged.clear();
      delete window[KEY];
    },
  };
})(window.__se);
