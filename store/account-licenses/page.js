/*
 * Licenses and product key activations (/account/licenses/): a paginator ("Showing licenses
 * 1-100 of 7283", Prev/Next page loads) over .account_table, whose header is a <tr> of <th>s
 * at the top of the body. Rebuilt as:
 *
 *   - the account tables' toolbar and sticky header (account/table.js): search over this page's
 *     items, dates and methods, a chip per acquisition method ("Steam Store", "Retail",
 *     "Complimentary" ...), and a count
 *   - the paginator as a bar: Steam's own count, Prev and Next as round buttons
 *
 * Methods are the rows' own words, so the chips are in the page's language. Nothing of Steam's
 * moves; destroy() takes the theme's parts and marks back off.
 */

/* The shared table module, requested with this build's version like every theme file */
const tables = () => {
  const url = new URL('../account/table.js', import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};

export default async (dom) => {
  const [{ mountTable }] = await Promise.all([tables(), dom.ready()]);
  const table = document.querySelector('#main_content table.account_table');
  const body = table?.tBodies[0];
  if (!body) return () => {};

  const $ = dom.scope();
  const marks = [];
  const mark = (node, name, value = '') => {
    dom.mark(node, name, value);
    marks.push([node, name]);
  };

  const head = [...body.rows].find((row) => row.cells.length && [...row.cells].every((cell) => cell.matches('th')));
  const view = mountTable(dom, $, {
    table,
    head,
    rows: () => [...body.rows].filter((row) => row !== head && row.querySelector(':scope > td')),
    typeOf: (row) => dom.squash(row.querySelector('td.license_acquisition_col')?.textContent) || null,
    onRow: (row) => {
      // The item cell: the name, then Steam's "Remove" link on free licenses
      const item = [...row.cells].find((cell) => !cell.matches('.license_date_col, .license_acquisition_col'));
      if (item) mark(item, 'data-se-licenses-item');
    },
    placeholder: 'Search this page',
    searchLabel: 'Search licenses on this page',
    typesLabel: 'Acquisition method',
    emptyText: 'No licenses on this page match.',
    countText: (total) => `${total} on this page`,
  });

  // The paginator: Steam's text stays; its arrow images give way to the theme's chevrons
  for (const link of document.querySelectorAll('.license_paginator_ctn a')) {
    mark(link, 'data-se-licenses-page', /prev/i.test(link.className) ? 'prev' : 'next');
  }

  mark(document.documentElement, 'data-se-licenses-ready');

  return () => {
    $.destroy();
    view.destroy();
    for (const [node, name] of marks.reverse()) dom.unmark(node, name);
  };
};
