/*
 * Community Hub (/app/<id>...): what hub/page.css can't do alone.
 *
 *  - Hero art: the game's library hero, preloaded from Steam's CDN (two hosts, in order) and
 *    set (--se-hub-art, [data-se-hub-art]) only once one has loaded, so a game without hero
 *    art keeps the plain card.
 *  - Masonry feed: the cards sit in a grid of thin rows (--se-hub-row); each card spans as
 *    many rows as its height needs (--se-hub-span), measured with a ResizeObserver so it
 *    follows image loads, window resizes and Steam's "See More Content" pages. The grid only
 *    switches to thin rows ([data-se-hub-grid]) once the measuring runs.
 *
 * destroy() removes every variable, mark and observer.
 */

const GRID = '#AppHubCards';
const CARD = '.apphub_Card';

/** Hero art behind the header. */
const buildArt = (dom, $) => {
  const appid = location.pathname.match(/^\/app\/(\d+)/)?.[1];
  if (!appid) return;
  let art = null;

  const apply = () => {
    const header = document.querySelector('.apphub_HomeHeader');
    if (!header || !art) return;
    dom.setVar(header, '--se-hub-art', `url("${art}")`);
    dom.mark(header, 'data-se-hub-art');
  };

  dom.firstLoaded(dom.heroURLs(appid)).then((url) => {
    if (!$.alive || !url) return;
    art = url;
    apply();
    $.observe(apply);
  });

  $.add(() => {
    const header = document.querySelector('.apphub_HomeHeader');
    header?.style.removeProperty('--se-hub-art');
    header?.removeAttribute('data-se-hub-art');
  });
};

/** Row spans for the masonry feed. */
const buildMasonry = (dom, $) => {
  const grid = document.querySelector(GRID);
  if (!grid) return;

  const style = getComputedStyle(grid);
  const row = Number.parseFloat(style.getPropertyValue('--se-hub-row')) || 4;
  const gap = Number.parseFloat(style.getPropertyValue('--se-hub-gap')) || 0;

  // The card's bottom margin is the gap, so the span covers height + gap.
  const size = (card, height) => {
    if (height > 0) dom.setVar(card, '--se-hub-span', String(Math.ceil((height + gap) / row)));
  };

  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) size(entry.target, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight);
  });

  const watched = new Set();
  const scan = () => {
    for (const card of grid.querySelectorAll(CARD)) {
      if (watched.has(card)) continue;
      watched.add(card);
      resize.observe(card);
    }
    for (const card of watched) {
      if (card.isConnected) continue;
      watched.delete(card);
      resize.unobserve(card);
    }
  };

  scan();
  $.mark(grid, 'data-se-hub-grid');
  $.observe(scan, { filter: (record) => grid.contains(record.target) });
  $.add(() => {
    resize.disconnect();
    for (const card of watched) card.style.removeProperty('--se-hub-span');
    watched.clear();
  });
};

export default async (dom) => {
  const $ = dom.scope();
  buildArt(dom, $);
  await dom.ready();
  if ($.alive) buildMasonry(dom, $);
  return () => $.destroy();
};
