/*
 * Game page (/app/<id>/...): Steam's sections still shown in the page column (a review quotes
 * block, a developer's promo with big images...) are hidden behind one "Read more", which
 * shows them all in place. Styles: app/sections.css.
 *
 * A section is either wrapped, .game_page_autocollapse_ctn > .game_page_autocollapse (game.js
 * InitAutocollapse, with its own fade and READ MORE, hidden: the theme's button stands in), or
 * bare, a .game_area_description straight in the column (#game_area_reviews). Sections the
 * theme rebuilds elsewhere (About, Early Access, the disclosures, the system requirements) are
 * already hidden: they measure 0 and are left out, and with nothing else there is no button.
 *
 * Heights are read in a ResizeObserver callback only (after layout, no forced layout). A folded
 * section is hidden and keeps counting.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROOT_FLAG = 'se-app-sections-on';
  const FOLDED = 'data-se-folded';

  web.define(async (dom) => {
    const { el, ready, scope } = dom;
    await ready();

    const life = scope();
    const column = document.querySelector('.page_content > .leftcol.game_description_column');
    if (!column) return () => life.destroy();

    // { box, content, shown }, in page order: box is the column's child (folded), content what
    // is measured (a wrapped section's .game_page_autocollapse, else the box itself)
    const sections = [];
    const known = new Set();
    let opened = false;

    const more = el('button', { class: 'se-app-section-more', type: 'button', text: 'Read more' });
    const holder = el('div', { class: 'se-app-sections' }, [more]);

    const apply = () => {
      const fold = opened ? [] : sections.filter((section) => section.shown);
      for (const section of sections) section.box.toggleAttribute(FOLDED, fold.includes(section));
      // In the first folded section's place
      const first = fold[0]?.box;
      if (first) {
        if (holder.nextElementSibling !== first) first.before(holder);
      } else holder.remove();
    };

    more.addEventListener('click', () => {
      opened = true;
      apply();
    });

    const sizes = new ResizeObserver(() => {
      // Every read first (a folded section is hidden by us: it still counts), then the writes
      for (const section of sections) {
        if (!section.box.hasAttribute(FOLDED)) section.shown = section.content.scrollHeight > 0;
      }
      apply();
    });
    life.add(() => sizes.disconnect());

    const scan = () => {
      let added = false;
      for (const box of column.querySelectorAll('.game_page_autocollapse_ctn, :scope > .game_area_description')) {
        if (known.has(box)) continue;
        const content = box.matches('.game_area_description') ? box : box.querySelector(':scope > .game_page_autocollapse');
        if (!content) continue;
        known.add(box);
        sections.push({ box, content, shown: false });
        sizes.observe(content);
        added = true;
      }
      // Late sections can land between others
      if (added) sections.sort((a, b) => (a.box.compareDocumentPosition(b.box) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    };
    scan();
    life.observe(scan);
    document.documentElement.classList.add(ROOT_FLAG);

    return () => {
      life.destroy();
      opened = true;
      apply();
      document.documentElement.classList.remove(ROOT_FLAG);
    };
  });
})();
