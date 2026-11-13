/*
 * The Steam Awards Archive (/steamawards/archive): labels each year's banner for the grid in
 * steam-awards-archive/page.css with a glass chip reading the year, and marks the newest
 * year's row [data-se-award-latest] ("Latest · 2025"). Steam's sale renderer draws the links
 * after load and may redraw them, so the pass re-runs after each render.
 */
export default (dom) => {
  const { el, setText, scope } = dom;
  const life = scope();
  const LINK = '.SaleOuterContainer .SaleSectionCtn.links a[href*="/steamawards/"]';
  const YEAR = /\/steamawards\/(\d{4})(?:[/?#]|$)/i;

  const sync = () => {
    const tiles = [];
    for (const link of document.querySelectorAll(LINK)) {
      const year = Number(YEAR.exec(new URL(link.href, location.href).pathname)?.[1]);
      const tile = link.firstElementChild;
      if (year && tile) tiles.push({ link, tile, year });
    }
    if (!tiles.length) return;
    const newest = Math.max(...tiles.map(({ year }) => year));

    for (const { link, tile, year } of tiles) {
      const latest = year === newest;
      (link.closest('.SaleSectionContainer') ?? link).toggleAttribute('data-se-award-latest', latest);
      let chip = tile.querySelector(':scope > [data-se-award-chip]');
      if (!chip) {
        chip = el('span', { 'data-se-award-chip': true, 'aria-hidden': 'true' });
        tile.append(chip);
      }
      setText(chip, latest ? `Latest · ${year}` : String(year));
    }
  };

  sync();
  life.observe(sync);

  return () => {
    life.destroy();
    document.querySelectorAll('[data-se-award-chip]').forEach((chip) => chip.remove());
    document.querySelectorAll('[data-se-award-latest]').forEach((node) => node.removeAttribute('data-se-award-latest'));
  };
};
