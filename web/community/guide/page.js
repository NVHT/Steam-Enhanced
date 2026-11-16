/*
 * A guide (/sharedfiles/filedetails/?id=<id>, the page with a .guideTop): what guide/page.css
 * can't do alone. The header card above it is the hub's (hub/page.css, hub/page.js).
 *
 *  - Index: Steam's "Guide Index" (#GuideTableOfContents) sits in the right column, among the
 *    details. It moves into #ig_bottom itself, where guide/page.css gives it the left column,
 *    sticky beside the guide. Without this script it stays on the right.
 *  - Current section: the index row of the section being read is marked (data-se-current) as
 *    the page scrolls, so the index follows the reader. Steam's own .selected only marks the
 *    row last clicked. A row Steam leaves blank gets its section's title (labelBlankRows).
 *
 * destroy() puts the index back and drops the mark.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROOT = '#ig_bottom';
  const INDEX = '#GuideTableOfContents';
  const OPTION_PREFIX = 'guideSectionSelection_';
  const CURRENT = 'data-se-current';

  /** The guide's root, or null on other shared items (screenshots, workshop items...). */
  const guideRoot = () => {
    const root = document.querySelector(ROOT);
    return root?.querySelector(':scope > .guideTop') ? root : null;
  };

  /** The index, out of the right column into the guide's grid (its last child: on narrow
      windows, where the grid is off, it reads after the guide). */
  const placeIndex = ($, root) => {
    const index = document.querySelector(INDEX);
    if (index && index.parentNode !== root) $.move(index, root);
    return index;
  };

  /** Each index row's section: Overview is the title card, Comments is Steam's #-1 block. */
  const sectionsOf = (index) => {
    const map = new Map();
    for (const option of index.querySelectorAll(`[id^="${OPTION_PREFIX}"]`)) {
      const id = option.id.slice(OPTION_PREFIX.length);
      const section = id === '0' ? document.querySelector(`${ROOT} > .guideTop`) : document.getElementById(id);
      if (section) map.set(section, option);
    }
    return map;
  };

  /**
   * Steam leaves a row blank when its section's title is only markup it strips (an emoji picture,
   * a rule): the row gets the title as the page shows it, else "Untitled section", drawn by
   * guide/page.css from data-se-label so Steam's link is left as it is.
   */
  const labelBlankRows = (dom, $, sections) => {
    for (const [section, option] of sections) {
      const link = option.querySelector('a');
      if (!link || dom.squash(link.textContent)) continue;
      const title = dom.squash(section.querySelector(':scope > .subSectionTitle')?.textContent);
      $.mark(link, 'data-se-label', title || 'Untitled section');
    }
  };

  /** Scroll the index (not the page) so a row is in view. */
  const keepInView = (index, option) => {
    const box = index.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < box.top) index.scrollTop -= box.top - row.top;
    else if (row.bottom > box.bottom) index.scrollTop += row.bottom - box.bottom;
  };

  /**
   * The section being read: the first one in page order that reaches the top 40% of the window.
   * A long section still counts while it spans that band, so the mark never drops between two
   * headings.
   */
  const followSections = (dom, $, index) => {
    const sections = sectionsOf(index);
    if (!sections.size) return;
    labelBlankRows(dom, $, sections);
    const order = [...sections.keys()];
    const visible = new Set();
    let current = null;

    const show = dom.perFrame(() => {
      const section = order.find((node) => visible.has(node));
      const option = section ? sections.get(section) : null;
      if (!option || option === current) return;
      current?.removeAttribute(CURRENT);
      option.setAttribute(CURRENT, '');
      current = option;
      keepInView(index, option);
    });

    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      show();
    }, { rootMargin: '0px 0px -60% 0px' });

    for (const section of order) watcher.observe(section);
    $.add(() => {
      watcher.disconnect();
      show.cancel();
      current?.removeAttribute(CURRENT);
      current = null;
    });
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();
    const root = $.alive ? guideRoot() : null;
    if (!root) return () => $.destroy();
    const index = placeIndex($, root);
    if (index) followSections(dom, $, index);
    return () => $.destroy();
  });
})();
