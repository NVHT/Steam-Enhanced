/*
 * Community Hub announcements (hub/news.css styles them).
 *
 *  - Cards (every tab): the post's first picture as a cover and a short plain-text summary
 *    stand in for the full post, which stays in the card, hidden ([data-se-news]).
 *  - News tab ([data-se-hub-news] on the feed: every card an announcement): in a wide window
 *    the feed is a date-ordered list beside a reader. Choosing a post (click, Enter or Space)
 *    shows it whole in the reader instead of Steam's popup; the first post is shown on arrival.
 *    The reader's "Open on Steam" runs Steam's own click. In a narrow window clicks go to Steam
 *    as before.
 *
 * destroy() removes every node, mark, listener and observer.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const GRID = '#AppHubCards';
  const CARD = '.apphub_Card';
  const NEWS_CARD = '.Announcement_Card';
  const NEWS_POST = '.apphub_CardContentNewsDesc';
  // The width the reader needs; matches hub/news.css
  const WIDE = '(min-width: 1100px)';
  // The card's own controls (votes) keep working inside a list row
  const CONTROLS = '.apphub_CardControls, .apphub_NewsCardStats, button, input, select, textarea';

  // Enough text for a few lines of summary; the CSS clamps it
  const SUMMARY_CHARS = 400;
  const BLOCKS = 'p, li, div, blockquote, td';
  const HEADINGS = 'h1, h2, h3, h4, h5, h6, [class^="bb_h"]';

  /** The post's prose as plain text, up to SUMMARY_CHARS: headings left out, words across blocks
      and line breaks given a space (textContent glues them: "live!Every step"). Stops reading once
      it has enough. */
  const plainText = (dom, post) => {
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let text = '';
    let block = null;
    for (let node = walker.nextNode(); node && text.length < SUMMARY_CHARS; node = walker.nextNode()) {
      if (node.parentElement?.closest(HEADINGS)) continue; // "Gameplay" read as part of the prose
      const owner = node.parentElement?.closest(BLOCKS) ?? null;
      if (owner !== block || node.previousSibling?.nodeName === 'BR') text += ' ';
      block = owner;
      text += node.data;
    }
    return dom.squash(text).slice(0, SUMMARY_CHARS);
  };

  /** The post's first real picture (not an emoticon), as a URL. */
  const firstPicture = (post) => {
    for (const img of post.querySelectorAll('img:not(.emoticon)')) {
      const src = img.getAttribute('src') || img.dataset.src;
      if (src && !src.startsWith('data:')) return src;
    }
    return null;
  };

  const cover = (dom, src, className) =>
    dom.el('div', { class: className }, [dom.el('img', { src, alt: '', loading: 'lazy', decoding: 'async' })]);

  /** The element Steam's click handler sits on: the card or a wrapper inside it. */
  const clickTarget = (card) => (card.matches('[onclick]') ? card : card.querySelector('[onclick]') ?? card);

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();
    const grid = document.querySelector(GRID);
    if (!$.alive || !grid) return () => $.destroy();

    const wide = matchMedia(WIDE);
    const built = new Set();
    let newsTab = false;
    let reader = null;
    let current = null;
    let passThrough = false; // set while "Open on Steam" replays Steam's own click

    /* ---------- Cards ---------- */

    const build = (card) => {
      const post = card.querySelector(NEWS_POST);
      if (!post) return;
      built.add(card);
      const text = plainText(dom, post);
      if (text) post.after($.owned(dom.el('p', { class: 'se-hub-news-summary', text })));
      const src = firstPicture(post);
      if (src) card.prepend($.owned(cover(dom, src, 'se-hub-news-cover')));
      dom.mark(card, 'data-se-news');
    };

    /* ---------- Reader ---------- */

    const parts = {};

    const makeReader = () => {
      parts.cover = dom.el('div', { class: 'se-hub-reader__cover', hidden: true });
      parts.date = dom.el('p', { class: 'se-hub-reader__date' });
      parts.title = dom.el('h2', { class: 'se-hub-reader__title', id: 'se-hub-reader-title' });
      parts.open = dom.el('button', { class: 'se-hub-reader__open', type: 'button', text: 'Open on Steam' });
      parts.body = dom.el('div', { class: 'se-hub-reader__body' });
      parts.panel = dom.el('article', { class: 'se-hub-reader__panel', 'aria-labelledby': 'se-hub-reader-title' }, [
        parts.cover,
        dom.el('header', { class: 'se-hub-reader__head' }, [parts.date, parts.title, parts.open]),
        parts.body,
      ]);
      reader = dom.el('aside', { class: 'se-hub-reader', id: 'se-hub-reader' }, [parts.panel]);
      grid.append($.owned(reader));
    };

    const show = (card) => {
      if (!reader || card === current) return;
      if (current) dom.unmark(current, 'aria-current');
      current = card;
      dom.mark(card, 'aria-current', 'true');

      const src = card.querySelector('.se-hub-news-cover > img')?.getAttribute('src');
      parts.cover.replaceChildren(...(src ? [dom.el('img', { src, alt: '', decoding: 'async' })] : []));
      parts.cover.hidden = !src;
      dom.setText(parts.date, dom.squash(card.querySelector('.apphub_CardContentNewsDate')?.textContent));
      dom.setText(parts.title, dom.squash(card.querySelector('.apphub_CardContentNewsTitle')?.textContent));

      // Steam's post, copied: its own classes keep the post styles (hub/page.css); ids would clash
      const post = card.querySelector(NEWS_POST)?.cloneNode(true);
      if (post) {
        post.removeAttribute('id');
        for (const node of post.querySelectorAll('[id]')) node.removeAttribute('id');
      }
      parts.body.replaceChildren(...(post ? [post] : []));
      parts.panel.scrollTop = 0;
      // Restart the change's fade (hub/news.css)
      dom.unmark(parts.panel, 'data-se-shown');
      requestAnimationFrame(() => dom.mark(parts.panel, 'data-se-shown'));
    };

    const readerOn = () => newsTab && wide.matches && Boolean(reader);

    /* ---------- Feed ---------- */

    const scan = () => {
      const news = grid.querySelectorAll(NEWS_CARD);
      for (const card of news) if (!built.has(card)) build(card);
      newsTab = news.length > 0 && news.length === grid.querySelectorAll(CARD).length;
      if (!newsTab) {
        dom.unmark(grid, 'data-se-hub-news');
        return;
      }
      dom.mark(grid, 'data-se-hub-news');
      if (!reader) makeReader();
      for (const card of news) {
        dom.mark(card, 'tabindex', '0');
        dom.mark(card, 'aria-controls', 'se-hub-reader');
      }
      if (!current?.isConnected) {
        current = null;
        if (news[0]) show(news[0]);
      }
    };

    // Choosing a post: caught on the way down, before Steam's own handler on the card
    $.listen(grid, 'click', (event) => {
      if (passThrough || !readerOn()) return;
      const card = event.target.closest?.(NEWS_CARD);
      if (!card || event.target.closest(CONTROLS)) return;
      event.preventDefault();
      event.stopPropagation();
      show(card);
    }, true);

    $.listen(grid, 'keydown', (event) => {
      if (!readerOn() || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (!event.target.matches?.(NEWS_CARD)) return;
      event.preventDefault();
      show(event.target);
    });

    $.listen(grid, 'click', (event) => {
      if (!current || !event.target.closest?.('.se-hub-reader__open')) return;
      passThrough = true;
      try {
        clickTarget(current).click();
      } finally {
        passThrough = false;
      }
    });

    // A cover whose picture fails to load is dropped (error doesn't bubble: caught on the way down)
    $.listen(grid, 'error', (event) => {
      if (!event.target.matches?.('.se-hub-news-cover > img, .se-hub-reader__cover > img')) return;
      const box = event.target.parentElement;
      if (box.classList.contains('se-hub-reader__cover')) box.hidden = true;
      else box.remove();
    }, true);

    scan();
    $.observe(scan, { filter: (record) => grid.contains(record.target) });
    $.add(() => {
      dom.unmark(grid, 'data-se-hub-news');
      for (const card of built) {
        for (const name of ['data-se-news', 'aria-current', 'tabindex', 'aria-controls']) dom.unmark(card, name);
      }
      built.clear();
      current = null;
    });
    return () => $.destroy();
  });
})();
