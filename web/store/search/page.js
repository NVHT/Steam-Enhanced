/*
 * Search (/search/):
 *  - The term field takes the shared search field look (web/shared/search-field.css).
 *  - Tags each result's price (.discount_block) for the shared price chip ([data-se-price]).
 *  - Writes each review summary's words ("Very Positive") inside it, from the first line of
 *    the tooltip Steam keeps on it (data-tooltip-html), so the row says it without hovering.
 *    The words are ours ([data-se-own]); Steam's span and its tooltip stay.
 * Results arrive in pages as you scroll (Steam's infinite scroll appends rows), so this reruns
 * on every change, writing only on change. destroy() untags and removes what it added.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROWS = '#search_resultsRows';
  // Sorting and filtering replace the rows' container's contents: watch the whole results block.
  const RESULTS = '#search_results';
  const PRICE = '.search_result_row .discount_block:not(.empty)';
  const REVIEW = '.search_result_row .search_review_summary[data-tooltip-html]';
  const WORDS = 'se-search-review';

  /** "Very Positive<br>95% of the 1,234 user reviews…" → "Very Positive". */
  const wordsOf = (summary) => {
    const first = (summary.getAttribute('data-tooltip-html') ?? '').split(/<br\s*\/?>/i)[0];
    return new DOMParser().parseFromString(first, 'text/html').body.textContent.trim();
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();

    const priced = new Set();
    // Each summary's tooltip as last read: rows already written are skipped on later passes.
    const read = new WeakMap();

    const tag = () => {
      const rows = document.querySelector(ROWS);
      if (!rows) return;
      for (const price of rows.querySelectorAll(PRICE)) {
        if (priced.has(price)) continue;
        dom.tagPrice(price);
        priced.add(price);
      }
      for (const price of priced) if (!price.isConnected) priced.delete(price);

      for (const summary of rows.querySelectorAll(REVIEW)) {
        const html = summary.getAttribute('data-tooltip-html');
        if (read.get(summary) === html && summary.querySelector(`:scope > .${WORDS}`)) continue;
        read.set(summary, html);
        const text = wordsOf(summary);
        const words = summary.querySelector(`:scope > .${WORDS}`);
        if (words) dom.setText(words, text);
        else if (text) summary.append(dom.el('span', { class: WORDS, text }));
      }
    };

    // The term field: the shared search field, its magnifier on the field's wrapper
    const term = document.getElementById('term');
    $.search(term, term?.closest('.searchbar_left'));

    tag();
    $.observe(tag, { filter: (record) => Boolean(record.target.closest?.(RESULTS)) });
    $.add(() => {
      for (const words of document.querySelectorAll(`.${WORDS}`)) words.remove();
      for (const price of priced) dom.untagPrice(price);
      priced.clear();
    });

    return () => $.destroy();
  });
})();
