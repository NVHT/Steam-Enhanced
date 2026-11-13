/*
 * Purchase History (/account/history/): one long .wallet_history_table, grown by Steam's
 * "Load More Transactions" button (rows arrive by AJAX in front of tr#more_history). Rebuilt as:
 *
 *   - the account tables' toolbar and sticky header (account/table.js): search over items,
 *     types, payments and dates, a chip per transaction type ("Purchase", "Market
 *     Transactions", "Refund" ...), and a count
 *   - long item lists folded after a few lines behind a "+N more" toggle
 *   - wallet changes tagged up or down, so credits and spends read at a glance
 *   - Steam's "Problem with a transaction?" hint with an icon, under the toolbar
 *
 * Types are the rows' own words, numbers stripped ("9 Market Transactions"). Nothing of
 * Steam's moves; destroy() takes the theme's parts and marks back off.
 */
const ITEMS_SHOWN = 4; // item lines before a row folds

const INFO = '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>';

const svg = (markup) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = markup;
  return node;
};

/* The shared table module, requested with this build's version like every theme file */
const tables = () => {
  const url = new URL('../account/table.js', import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};

export default async (dom) => {
  const [{ mountTable }] = await Promise.all([tables(), dom.ready()]);
  const table = document.querySelector('#main_content table.wallet_history_table');
  const body = table?.tBodies[0];
  if (!body) return () => {};

  const $ = dom.scope();
  const added = [];
  const marked = [];
  const mark = (node, name, value = '') => {
    dom.mark(node, name, value);
    marked.push([node, name]);
  };

  /* ---------- Rows ---------- */

  const foldItems = (row) => {
    const cell = row.querySelector('td.wht_items');
    const lines = cell ? [...cell.children].filter((child) => child.matches('div') && !child.hasAttribute(dom.OWN)) : [];
    if (lines.length <= ITEMS_SHOWN + 1) return; // folding one line away saves nothing
    const rest = lines.length - ITEMS_SHOWN;
    for (const line of lines.slice(ITEMS_SHOWN)) mark(line, 'data-se-history-extra');
    const more = dom.el('button', { class: 'se-history-more', type: 'button', 'aria-expanded': 'false', text: `+${rest} more` });
    more.addEventListener('click', (event) => {
      event.stopPropagation(); // rows open Steam's help page on click
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : `+${rest} more`;
      if (open) mark(cell, 'data-se-history-open');
      else dom.unmark(cell, 'data-se-history-open');
    });
    added.push(more);
    cell.append(more);
  };

  const tagChange = (row) => {
    const cell = row.querySelector('td.wht_wallet_change');
    const text = dom.squash(cell?.textContent);
    if (text) mark(cell, 'data-se-history-change', /^[+＋]/.test(text) ? 'up' : 'down');
  };

  const view = mountTable(dom, $, {
    table,
    head: table.tHead,
    rows: () => [...body.rows].filter((row) => row.matches('tr.wallet_table_row')),
    typeOf: (row) => {
      const label = row.querySelector('td.wht_type > div:not(.wth_payment)')?.textContent ?? '';
      return dom.squash(label.replace(/^[\d.,\s]+/, '')) || null;
    },
    onRow: (row) => {
      foldItems(row);
      tagChange(row);
    },
    watch: body, // "Load More Transactions" inserts rows in front of tr#more_history
    placeholder: 'Search items, types and payments',
    searchLabel: 'Search purchase history',
    typesLabel: 'Transaction type',
    emptyText: 'No transactions match.',
    countText: (total) => `${total} transactions`,
  });

  // Steam's hint ("Problem with a transaction? Select it below...") with an icon
  const hint = document.querySelector('#main_content > .wallet_history_click_hint');
  if (hint) {
    const icon = svg(INFO);
    added.push(icon);
    hint.prepend(icon);
  }

  mark(document.documentElement, 'data-se-history-ready');

  return () => {
    $.destroy();
    view.destroy();
    for (const [node, name] of marked.reverse()) dom.unmark(node, name);
    for (const node of added.reverse()) node.remove();
  };
};
