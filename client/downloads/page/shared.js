/*
 * Downloads page: syncs active-transfer telemetry into attributes, paints the downloading
 * game's art behind the page and its logo over it, and mounts the Library list beside it.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedDownloadsParts (values parts reassign live on its `live`):
 * - shared.js    copy, selectors and the attribute helper (this one; it also closes a
 *                previous Downloads and skips windows without a body)
 * - native.js    Steam's own Library list beside the page
 * - library.js   the theme's game list, when Steam's can't be shown
 * - backdrop.js  the game's art and logo
 * - read.js      reading Steam's transfer block
 * - hero.js      the hero: graph, stats, links, logo, and its sync
 * - transfer.js  Steam's download store and its controls
 * - queue.js     the queue rows' action buttons
 * - drag.js      reordering the queue
 * - pass.js      the update pass and its scheduling
 * - debug.js     support helpers
 * - main.js      the drag guards, Steam's overview subscription, the watchers, and the API
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  window.__steamEnhancedDownloads?.destroy();
  if (!document.body) return;
  const ns = (window.__steamEnhancedDownloadsParts = { live: {} });
  const { C } = SE;
  const { live } = ns;
  live.overviewSubscription = null;
  live.liveOverview = null;
  live.drag = null;
  live.matches = [];
  live.restoreLibraryRoute = undefined;
  live.frame = 0;


  const COPY = {
    title: 'Downloads',
    now: 'Now downloading',
    paused: 'Paused',
    of: 'of',
  };
  const PAGE_SELECTOR = `.${C.DownloadsPage}:not(.${C.BasicUI})`;
  const ROW = `.${C.SectionItem}`;
  const LINKS_ROW = `.${C.DetailsAndType}`;
  const setAttr = (el, name, val) => SE.attr(el, name, val || null);

  Object.assign(ns, { COPY, LINKS_ROW, PAGE_SELECTOR, ROW, setAttr });
});
