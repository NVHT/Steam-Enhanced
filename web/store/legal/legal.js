/*
 * Legal Info (/legal/) and Video Policy (/video_policy): one #legal_box of loose text, <h2>
 * headings, links and <br> spacers. Rebuilt as the Subscriber Agreement's look: the page title
 * as the store's display heading with a count under it, and each heading's part as a card with
 * an icon chip, laid out in a grid. Links stay plain accent links. A page with one heading
 * (Video Policy) is one full-width card and gets no section count.
 *
 * The page is server-rendered once, so nodes (text included) move into the theme's cards;
 * destroy() puts every one back.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  /* English headings to core icons (--se-icon-*); others get the order's icon, then a plain one */
  const ICON_BY_TITLE = [
    [/infringement|claim|dmca/i, 'shield'],
    [/copyright/i, 'copyright'],
    [/video/i, 'video'],
    [/third.?party|notice/i, 'report'],
  ];
  const ICON_BY_ORDER = ['copyright', 'video', 'report', 'shield'];

  /** A core icon mask as --se-legal-glyph (legal.css); its holder sets the size and tone. */
  const glyph = (name) => {
    const node = web.dom.el('span', { class: 'se-legal-glyph', 'aria-hidden': 'true' });
    node.style.setProperty('--se-legal-glyph', `var(--se-icon-${name})`);
    return node;
  };

  const isBlank = (node) => node.nodeType === Node.TEXT_NODE && !node.textContent.trim();

  web.define(async (dom) => {
    await dom.ready();
    const box = document.getElementById('legal_box');
    if (!box || !box.querySelector(':scope > h2')) return () => {};

    const $ = dom.scope();
    const { mark, move } = $;

    /* ---------- Cut the box at its headings ---------- */

    const parts = [];
    let current = { heading: null, nodes: [] };
    for (const node of [...box.childNodes]) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('h2')) {
        if (current.heading || current.nodes.some((n) => !isBlank(n))) parts.push(current);
        current = { heading: node, nodes: [] };
      } else {
        current.nodes.push(node);
      }
    }
    parts.push(current);

    const grid = dom.el('div', { class: 'se-legal-grid', 'data-se-legal': 'grid' });
    let titled = 0;
    for (const part of parts) {
      if (!part.heading && !part.nodes.some((n) => !isBlank(n) && !(n.nodeType === Node.ELEMENT_NODE && n.matches('br')))) continue;
      const title = dom.squash(part.heading?.textContent);
      const icon = part.heading
        ? ICON_BY_TITLE.find(([test]) => test.test(title))?.[1] ?? ICON_BY_ORDER[titled] ?? 'info'
        : 'info';
      if (part.heading) titled++;

      const card = dom.el('section', { class: 'se-legal-card', 'data-se-legal': 'card' });
      if (part.heading) {
        const head = dom.el('header', { class: 'se-legal-head' }, dom.el('span', { class: 'se-legal-icon' }, glyph(icon)));
        card.append(head);
        move(part.heading, head);
      }
      const body = dom.el('div', { class: 'se-legal-body' });
      for (const node of part.nodes) move(node, body);
      card.append(body);
      grid.append(card);
    }
    grid.dataset.count = String(grid.childElementCount);
    box.append(grid);
    mark(document.documentElement, 'data-se-legal-ready');

    /* ---------- Header: section count ---------- */

    const header = document.querySelector('.page_header_ctn .page_content');
    const meta = header && titled > 1
      ? dom.el('div', { class: 'se-legal-meta', 'data-se-legal': 'meta' }, [glyph('report'), dom.el('span', { text: `${titled} sections` })])
      : null;
    if (meta) header.append(meta);

    return () => {
      $.destroy();
      meta?.remove();
      grid.remove();
    };
  });
})();
