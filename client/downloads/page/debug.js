/* Support: copying the page's markup, the theme version, and the debug hotkey's toast. */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedDownloadsParts;
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

  // Clipboard: the async API when the page may use it, else a selected textarea
  function copyText(text) {
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(area);
      area.select();
      const ok = SE.run(() => document.execCommand('copy'));
      area.remove();
      return !!ok;
    };
    const writing = SE.run(() => navigator.clipboard.writeText(text));
    if (writing?.catch) writing.catch(fallback);
    else fallback();
  }

  // The skin's manifest is the source of the version: fetched once, when the page first shows,
  // so a report made later needs no wait
  let themeVersion = null;
  const loadThemeVersion = () => (themeVersion ||= (async () => {
    try {
      const asset = [...document.querySelectorAll('script[src], link[href]')]
        .map((el) => el.src || el.href)
        .find((url) => /\/core\/(?:core\.js|tokens\.css)(?:[?#]|$)/.test(url));
      const response = await fetch(new URL('../skin.json', asset), { cache: 'no-store' });
      const version = (await response.json())?.version;
      return typeof version === 'string' && version ? version : 'unknown';
    } catch (_) {
      return 'unknown';
    }
  })());

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
    window.__steamEnhancedDownloads?.debug().then((report) => toast(`Steam Enhanced ${report.build}: download info copied`));
  };

  Object.assign(ns, { TRACKED_ATTRS, copyText, debugKey, loadThemeVersion });
});
