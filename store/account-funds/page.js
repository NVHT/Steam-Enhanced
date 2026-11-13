/*
 * Add funds to your Steam Wallet (/steamaccount/addfunds): a column of amount rows (price,
 * "Add funds" button, "Add $5.00" heading, a note) beside a "Your Steam Account" box. page.css
 * lays the amounts out as a grid of tiles beside a wallet card; this makes each tile one
 * button: a click anywhere on it runs Steam's own "Add funds" link, so the purchase goes
 * through Steam's script exactly as before.
 */
export default async (dom) => {
  await dom.ready();
  const list = document.getElementById('prices_user');
  if (!list) return () => {};

  const $ = dom.scope();
  const tiles = [...list.querySelectorAll(':scope > .addfunds_area_purchase_game')];
  for (const tile of tiles) dom.mark(tile, 'data-se-funds-tile');

  $.listen(list, 'click', (event) => {
    const tile = event.target.closest('[data-se-funds-tile]');
    if (!tile || event.target.closest('a, button, input, select')) return;
    tile.querySelector('.game_purchase_action a[href]')?.click();
  });

  return () => {
    $.destroy();
    for (const tile of tiles) dom.unmark(tile, 'data-se-funds-tile');
  };
};
