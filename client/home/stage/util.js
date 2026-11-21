/*
 * Library Home: what every part shares: Steam's stores, theme art images, formatters and icons, and the frame pass (main.js).
 */
((SE) => {
  const ns = (window.__seHomeStageParts = { live: {} });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const appStore = () => SE.global('appStore', (s) => !!s.allApps);
  const collectionStore = () => SE.global('collectionStore');
  const partnerEventStore = () => SE.global('partnerEventStore');
  const client = () => SE.global('SteamClient', (sc) => !!sc.Apps) || window.SteamClient;

  /*
   * Steam's own source for a game's library art (GetHeaderImages, GetHeroImages, GetLogoImages:
   * the custom art, the cached copy, then the CDN, by the file names Steam keeps for the game),
   * found once by its methods.
   */
  const libraryArt = () =>
    SE.findModule('home:library-art', (src, id, req) => {
      if (!src.includes('GetHeaderImagesForAppId') || !src.includes('BHasRecentlyLaunched')) return null;
      for (const value of Object.values(SE.run(() => req(id)) || {})) {
        if (typeof value?.GetHeaderImages === 'function') return value;
      }
      return null;
    });

  // The art fallback chain (core/runtime.js SE.art)
  const { img: artImg, tag: imgTag, onLoad: onImgLoad, onError: onImgError } = SE.art;

  // innerHTML only when the markup changed (compared with what was last written, not with the
  // browser's serialisation of it, which never matches attribute-only or SVG markup).
  const written = new WeakMap();
  function setHTML(el, html) {
    if (written.get(el) === html) return;
    written.set(el, html);
    el.innerHTML = html;
  }

  const compact = (n) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  function hours(minutes) {
    const h = (minutes || 0) / 60;
    return h < 100 ? String(Math.round(h * 10) / 10) : Math.round(h).toLocaleString();
  }

  function relativeDate(t, weekdayForWeek) {
    if (!t) return '';
    const d = new Date(t * 1000);
    const now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((day(now) - day(d)) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return weekdayForWeek ? d.toLocaleDateString(undefined, { weekday: 'long' }) : `${days} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const when = (t) => relativeDate(t, false);
  const dayLabel = (t) => relativeDate(t, true);

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" fill-opacity=".32" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"></path></svg>';
  const ICON_INSTALL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
  const ICON_FILTER = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" fill-opacity=".32" stroke="none"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"></path></g><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"></path></svg>';
  const ICON_PICK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';

  const ICON_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

  /** A panel's ⋯ button: its settings (stage/board.js opens the menu). */
  const panelMenuButton = (name) =>
    `<button type="button" class="se-hs-pickbtn" data-panel-menu aria-label="${SE.esc(name)} settings" title="Settings" aria-haspopup="dialog" aria-expanded="false">${ICON_DOTS}</button>`;

  // The stage goes narrow at this width of its own (not the window's: the game list and the
  // Friends dock take a share of it). stage.js reads the Home's width each pass.
  const NARROW_AT = 1100;

  /*
   * One layout pass per frame. Parts ask for one with schedule(); index.js sets what a pass runs
   * (setPass) and cancels a pending one when it runs a pass itself (cancelPass).
   */
  let frame = 0;
  let pass = () => {};
  const setPass = (fn) => {
    pass = fn;
  };
  function cancelPass() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      pass();
    });
  }

  Object.assign(ns, {
    ICON_FILTER, ICON_INSTALL, ICON_PICK, ICON_PLAY, appStore,
    panelMenuButton, artImg, cancelPass, client, collectionStore, compact, dayLabel,
    hours, imgTag, libraryArt, NARROW_AT, onImgError, onImgLoad, partnerEventStore,
    reducedMotion, schedule, setHTML, setPass, when,
  });
})(window.__se);
