/*
 * Support: copying the page's markup, the theme version, and the debug hotkey's toast.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { PAGE_SELECTOR, mountedNodes } = ns;

  const TRACKED_ATTRS = [
    'data-se-dl-title',
    'data-se-count',
    'data-se-dl-art',
    'data-se-dlh',
    'data-se-dlh-source',
    'data-se-dl-action',
    'data-se-dl-text',
    'data-se-dl-bar',
    'data-se-dl-sortable',
    'data-se-dl-dragging',
    'data-se-dl-sorting',
    'data-drop',
    'data-now',
  ];

  // The skin's manifest is the source of the version: fetched once, when the page first shows,
  // so a report made later needs no wait
  let themeVersion = null;
  const loadThemeVersion = () => (themeVersion ||= SE.themeVersion().then((version) => version || 'unknown'));

  // Ctrl+Shift+D on the Downloads page: copies the support report, no console needed
  function toast(message) {
    const note = document.createElement('div');
    note.className = 'se-dl-toast';
    note.textContent = message;
    document.body.append(note);
    mountedNodes.add(note);
    setTimeout(() => {
      note.remove();
      mountedNodes.delete(note);
    }, 2600);
  }

  const debugKey = (event) => {
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.code !== 'KeyD') return;
    if (!document.querySelector(PAGE_SELECTOR)) return;
    event.preventDefault();
    event.stopPropagation();
    window.__seDownloads?.debug().then((report) => toast(`Steam Enhanced ${report.build}: download info copied`));
  };

  Object.assign(ns, { TRACKED_ATTRS, debugKey, loadThemeVersion });
})(window.__se);
