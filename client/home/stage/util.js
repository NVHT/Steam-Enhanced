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
   * Art works through its copies (local first, then the CDN): the ones still to try ride in
   * data-urls. Until one has loaded the image is marked data-se-art-wait and drawn as nothing
   * (core/images.css), so a failed copy never shows the broken-image icon. One chain for
   * both kinds of image: built ones listen themselves (they can fail before they're attached),
   * innerHTML-built ones are caught by their panel's capture listeners.
   */
  const ART_WAIT = 'data-se-art-wait';
  const artFailed = new WeakMap(); // img → called once its last copy has failed

  /* load doesn't bubble: caught on the way down, beside onImgError */
  function onImgLoad(e) {
    if (e.target instanceof HTMLImageElement) e.target.removeAttribute(ART_WAIT);
  }

  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.urls) return;
    const rest = JSON.parse(img.dataset.urls);
    if (rest.length) {
      img.dataset.urls = JSON.stringify(rest.slice(1));
      img.src = rest[0];
    } else {
      delete img.dataset.urls;
      img.hidden = true;
      artFailed.get(img)?.();
    }
  }

  function artImg(urls, cls, onFail) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.setAttribute(ART_WAIT, '');
    img.dataset.urls = JSON.stringify(urls.slice(1));
    img.addEventListener('load', onImgLoad);
    img.addEventListener('error', onImgError);
    if (onFail) artFailed.set(img, onFail);
    img.src = urls[0];
    return img;
  }

  const imgTag = (urls, cls) =>
    `<img class="${cls}" alt="" draggable="false" loading="lazy" ${ART_WAIT} src="${SE.esc(urls[0])}" data-urls="${SE.esc(JSON.stringify(urls.slice(1)))}">`;

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
    hours, imgTag, NARROW_AT, onImgError, onImgLoad, partnerEventStore,
    reducedMotion, schedule, setHTML, setPass, when,
  });
})(window.__se);
