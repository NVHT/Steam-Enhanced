/*
 * A user's review (/id/<name>/recommended/<appid>, and the hub's review popup): the parts CSS
 * can't do alone. review/page.css lays the page out.
 *
 *   - Verdict hero: Steam's verdict block (#ReviewTitle: thumb, "Recommended" / "Not
 *     Recommended", hours) moves into the profile header card, under the persona and game title,
 *     with the posted date and the helpful count (.ratingBar) as a meta line under it; the game's
 *     hero art goes behind the whole card. The verdict block carries the verdict
 *     (data-se-verdict="up" | "down") for its colour. Without the header card it heads the page.
 *     The awards (.review_award_ctn, inside Steam's helpful line) get a row of their own under it.
 *   - Sidebar links: Store Page, Community Hub and Find More Like This are told apart by their
 *     address (data-se-review-link), so each gets its own icon.
 *
 * Steam's nodes are moved, never copied: its scripts keep finding them by id.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const CONTENT = '.review_page_content';

  /** "store" | "hub" | "more" for a sidebar link, from where it goes. */
  const linkKind = (link) => {
    let url;
    try {
      url = new URL(link.href);
    } catch {
      return null;
    }
    if (/^\/app\/\d+/.test(url.pathname)) return /steamcommunity\.com$/i.test(url.hostname) ? 'hub' : 'store';
    return 'more';
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    const { el } = dom;
    const appid = location.pathname.match(/\/recommended\/(\d+)/i)?.[1];
    let hero = null;

    /* ---------- Verdict hero ---------- */

    const buildHero = () => {
      const content = document.querySelector(CONTENT);
      const verdict = content?.querySelector('#ReviewTitle');
      if (!verdict || hero?.isConnected) return;

      const thumb = verdict.querySelector('img[src*="thumbs" i]')?.getAttribute('src') ?? '';
      const tone = /thumbsup/i.test(thumb) ? 'up' : /thumbsdown/i.test(thumb) ? 'down' : null;
      const meta = el('div', { class: 'se-review-meta' });
      hero = $.owned(el('section', { class: 'se-review-hero', 'data-se-verdict': tone }, [meta]));
      const card = document.querySelector('.profile_small_header_bg');
      if (card) card.append(hero);
      else content.prepend(hero);
      $.move(verdict, hero, meta);
      const rating = content.querySelector('.ratingBar');
      for (const node of [verdict.querySelector('.recommendation_date'), rating]) {
        if (node) $.move(node, meta);
      }
      // Steam puts the awards inside the helpful line: they become their own row of chips
      const awards = rating?.querySelector('.review_award_ctn');
      if (awards) $.move(awards, hero);

      if (!appid) return;
      const backdrop = card ?? hero;
      dom.firstLoaded(dom.heroURLs(appid)).then((url) => {
        if (!$.alive || !url) return;
        dom.setVar(backdrop, '--se-review-art', `url("${url}")`);
        $.mark(backdrop, 'data-se-review-art');
        $.add(() => backdrop.style.removeProperty('--se-review-art'));
      });
    };

    /* ---------- Sidebar links ---------- */

    const markLinks = () => {
      for (const link of document.querySelectorAll(`${CONTENT} .review_app_actions a.general_btn`)) {
        const kind = linkKind(link);
        if (kind && link.getAttribute('data-se-review-link') !== kind) $.mark(link, 'data-se-review-link', kind);
      }
    };

    /* ---------- Run ---------- */

    const scan = () => {
      buildHero();
      markLinks();
    };

    await dom.ready();
    if (!$.alive) return () => {};
    scan();
    $.observe(scan, { filter: (record) => Boolean(record.target.closest?.(CONTENT)) });

    return () => {
      hero = null;
      $.destroy();
    };
  });
})();
