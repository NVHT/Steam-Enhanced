/*
 * Steam Guides (/guides): what guides-home/page.css can't do alone.
 *
 *  - Sections: Steam writes each as a header and a body side by side in the page's column; each
 *    pair goes into one card (.se-guides-section), so a section reads as one block.
 *  - Lead text: a section opens with a bold half-sentence (.section_body_title) that its bare
 *    text then finishes, before the pictures. That run goes into one paragraph (.se-guides-lead),
 *    so it reads as one sentence at a readable line length.
 *
 * destroy() puts everything back.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  /** Each header with the body that follows it, in a card of the theme's own. Idempotent. */
  const wrapSections = (dom, $) => {
    for (const header of document.querySelectorAll('.main_content > .section_header')) {
      const body = header.nextElementSibling;
      if (!body?.matches('.section_body')) continue;
      const card = $.owned(dom.el('section', { class: 'se-guides-section' }));
      header.before(card);
      $.move(header, card);
      $.move(body, card);
    }
  };

  // The section text's own inline pieces; the first block ends the run
  const INLINE = 'span, a, b, i, u, strong, em, br';

  /** Each section's opening text (lead, bare text, links, breaks) as one paragraph. Idempotent. */
  const wrapLeads = (dom, $) => {
    for (const body of document.querySelectorAll('.main_content .section_body')) {
      if (body.querySelector(':scope > .se-guides-lead')) continue;
      const run = [];
      for (const node of body.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && !node.matches(INLINE)) break;
        run.push(node);
      }
      if (!run.some((node) => dom.squash(node.textContent))) continue;
      const lead = $.owned(dom.el('p', { class: 'se-guides-lead' }));
      body.prepend(lead);
      for (const node of run) $.move(node, lead);
    }
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();
    if (!$.alive) return () => $.destroy();
    wrapSections(dom, $);
    wrapLeads(dom, $);
    return () => $.destroy();
  });
})();
