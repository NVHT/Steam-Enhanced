/*
 * Dev reload (Ctrl+Shift+U, core/core.js; only with dev/live-reload.json on): this window's
 * stylesheets again, and with `scripts` its scripts too, without Reload UI. client/loader.js loads
 * this file on the first reload in a window and hands it its own parts (`loader`). The new sheets
 * go in beside the old and take over once loaded, so nothing flashes; each script, run again,
 * calls its old copy's destroy() first (CLAUDE.md, JS), in list order. The runtime stays: features
 * hold it. Other client windows follow through the storage event (the loader's listener).
 */
(() => {
  // A short note at the window's foot-left that the reload ran; shadow DOM, so no style reaches it
  let badge = null;
  const showBadge = (text) => {
    badge?.remove();
    const host = (badge = document.createElement('div'));
    host.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;pointer-events:none';
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<span style="display:inline-block;padding:5px 10px;border-radius:999px;background:rgba(16,18,23,.88);' +
      'box-shadow:inset 0 0 0 1px #7cc4ff;color:#fff;font:700 11px/1 var(--se-font,sans-serif)"></span>';
    host.shadowRoot.firstChild.textContent = text;
    (document.body ?? document.documentElement).append(host);
    setTimeout(() => {
      host.remove();
      if (badge === host) badge = null;
    }, 1500);
  };

  /**
   * loader: { stamp(value), sheets, asset(file), sheetImports(), head, applyOptions(), added,
   * RUNTIME, addScript(file) }, client/loader.js's own parts.
   */
  window.__seDevReload = (loader, scripts = false) => {
    loader.stamp(String(Date.now()));
    for (const file of loader.sheets.keys()) loader.sheets.set(file, loader.asset(file));
    const old = document.getElementById('se-sheets');
    const style = document.createElement('style');
    style.textContent = loader.sheetImports();
    const swap = () => {
      old?.remove();
      style.id = 'se-sheets';
    };
    style.addEventListener('load', swap, { once: true });
    style.addEventListener('error', swap, { once: true });
    if (old) old.after(style);
    else loader.head.append(style);
    loader.applyOptions();
    if (scripts) {
      for (const file of loader.added) {
        if (!file.endsWith('.js') || loader.RUNTIME.includes(file)) continue;
        loader.head.querySelector(`script[data-se-file="${file}"]`)?.remove();
        loader.addScript(file);
      }
    }
    showBadge(scripts ? 'CSS and JS reloaded' : 'CSS reloaded');
  };
})();
