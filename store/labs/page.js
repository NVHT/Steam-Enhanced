/*
 * Steam Labs (/labs/): groups the experiment capsules under each heading ("Active
 * Experiments", "Past Experiments") into a [data-se-labs-grid] wrapper, so labs/page.css lays
 * them out as a card grid instead of one long column. The page is server-rendered once, so the
 * pass runs once the document is parsed; destroy() unwraps the grids.
 */
export default async (dom) => {
  await dom.ready();
  const column = document.querySelector('.page_content_ctn.labs .left-column');

  // Each run of .capsule siblings after a heading moves into one grid; the headings and the
  // <br> spacers Steam puts between sections stay where they are.
  const grids = [];
  let grid = null;
  for (const node of column ? [...column.children] : []) {
    if (node.matches('.capsule')) {
      if (!grid) {
        grid = dom.el('div', { 'data-se-labs-grid': true });
        node.before(grid);
        grids.push(grid);
      }
      grid.append(node);
    } else if (node.matches('h1')) {
      grid = null;
    }
  }

  return () => {
    for (const wrapper of grids) wrapper.replaceWith(...wrapper.children);
  };
};
