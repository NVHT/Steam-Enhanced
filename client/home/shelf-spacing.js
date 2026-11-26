/*
 * One spacing for every Home shelf: a collection shelf's grid spreads its covers across the row
 * (Steam's ShowcaseGrid, justify-content: space-between), so its gap follows the window; Recent
 * Games and Play Next keep a fixed 16 px between items (their margins). The grid's gap is read
 * from its first two covers and given to them as --se-shelf-gap on Home's own root (.LibraryHome,
 * so only Home restyles; client/home/home-shelves.css). Read in the ResizeObserver's callback,
 * once layout is done (no forced layout while Home is still building), and only when the grid
 * changes width.
 */
((SE) => {
  window.__seShelfSpacing?.destroy();
  const { C } = SE;

  const GRID = `.${C.Showcase} .${C.ShowcaseGrid}`;
  const BOX = `.${C.LibraryItemBox}`;
  let observed = null; // the grid whose width is watched
  let host = null; // the element holding --se-shelf-gap

  // The gap between the grid's first two covers, while no cover is open (a hover card moves them)
  const measure = () => {
    if (!observed?.isConnected || document.querySelector('[data-se-peek]')) return;
    const [a, b] = observed.querySelectorAll(BOX);
    if (!a || !b) return;
    const first = a.getBoundingClientRect();
    const second = b.getBoundingClientRect();
    if (Math.abs(first.top - second.top) > 1) return;
    const next = observed.closest('.LibraryHome') || document.documentElement;
    if (host && host !== next) host.style.removeProperty('--se-shelf-gap');
    host = next;
    SE.cssVar(host, '--se-shelf-gap', `${Math.round(second.left - first.right)}px`);
  };

  const resize = new ResizeObserver(measure);

  // The first collection shelf's grid, watched as Home draws it again
  const track = () => {
    const grid = document.querySelector(GRID);
    if (grid === observed) return;
    if (observed) resize.unobserve(observed);
    observed = grid;
    if (grid) resize.observe(grid);
  };

  const watcher = SE.watch(track);
  track();

  window.__seShelfSpacing = {
    destroy() {
      watcher.disconnect();
      resize.disconnect();
      host?.style.removeProperty('--se-shelf-gap');
      delete window.__seShelfSpacing;
    },
  };
})(window.__se);
