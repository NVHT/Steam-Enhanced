/*
 * Community Hub, Guides tab (hub/guides.css styles it):
 *
 *  - Steam's dropdowns (the language filter, a browse view's time period) become the web's one
 *    dropdown (web/shared/select.js).
 *  - Browse views: the box Steam holds the results in differs from the home's, so the list is
 *    found from the guides themselves (the parent of their items) and marked
 *    [data-se-guide-list] for the two-column grid.
 *  - Paging: Steam writes the "..." as bare text between its buttons; it is wrapped
 *    (.se-page-gap) so the shared page buttons (shared/ui.css) can place it.
 *  - Summaries: runs of blank-looking filler characters some authors pad with collapse to a
 *    space, so the text starts at the left like the rest.
 *
 * destroy() removes every node, mark and listener.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const SELECTS = '#ig_bottom select';
  const PERIOD = '#ig_bottom div.dayselect';
  const PAGING = '#ig_bottom .workshopBrowsePagingControls';
  const GUIDE = '#ig_bottom a.workshopItemCollection';
  const SUMMARY = '#ig_bottom .workshopItemShortDesc';
  const LIST = 'data-se-guide-list';

  /** Wrap the paging's bare "..." (Steam writes it as text between its buttons); returns how to
      put it back. */
  const wrapPaging = (dom, controls) => {
    const undo = [];
    for (const node of [...controls.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE || !dom.squash(node.data)) continue;
      const span = dom.el('span', { class: 'se-page-gap', text: dom.squash(node.data) });
      node.replaceWith(span);
      undo.push(() => span.replaceWith(node));
    }
    return () => undo.forEach((fn) => fn());
  };

  // Blank-looking characters authors pad summaries with (Hangul fillers, braille blank, zero-width
  // space): runs of them pushed "hello everyone" to the middle of the line
  const FILLERS = /[\u115f\u1160\u3164\uffa0\u2800\u200b]+/g;

  /** Collapse filler runs in a summary to a space; returns how to put the text back. */
  const unpad = (desc) => {
    const undo = [];
    const walker = document.createTreeWalker(desc, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!FILLERS.test(node.data)) continue;
      FILLERS.lastIndex = 0;
      const original = node.data;
      node.data = original.replace(FILLERS, ' ').replace(/^\s+/, '');
      undo.push(() => {
        node.data = original;
      });
    }
    return () => undo.forEach((fn) => fn());
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    const [{ enhanceSelect, enhanceDivSelect, findList }] = await Promise.all([Promise.resolve(web.parts.select), dom.ready()]);
    if (!$.alive) return () => $.destroy();

    // Idempotent: enhanceSelect skips a select it has already done; paging and summaries are done once
    const wrapped = new WeakSet();
    const scan = () => {
      for (const select of document.querySelectorAll(SELECTS)) enhanceSelect(dom, $, select);
      for (const period of document.querySelectorAll(PERIOD)) {
        enhanceDivSelect(dom, $, period, findList(period, 'div.dayselect_options'), { option: 'div.option' });
      }
      for (const controls of document.querySelectorAll(PAGING)) {
        if (wrapped.has(controls)) continue;
        wrapped.add(controls);
        $.add(wrapPaging(dom, controls));
      }
      for (const desc of document.querySelectorAll(SUMMARY)) {
        if (wrapped.has(desc)) continue;
        wrapped.add(desc);
        $.add(unpad(desc));
      }
      for (const guide of document.querySelectorAll(GUIDE)) {
        const list = (guide.closest('.workshopItemCollectionContainer') ?? guide).parentElement;
        if (list && !list.matches('.guides_home_list_ctn') && !list.hasAttribute(LIST)) $.mark(list, LIST);
      }
    };

    scan();
    $.observe(scan, { filter: (record) => Boolean(record.target.closest?.('#ig_bottom')) });
    return () => $.destroy();
  });
})();
