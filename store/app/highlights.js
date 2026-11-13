/*
 * Summary strip highlights (app/summary.js): two cards under the overview, side by side:
 *
 *   news     the latest of Steam's "Recent Events & Announcements" (.early_access_announcements,
 *            a React block: each event is an a.OtherEvents_EventCtn linking to
 *            /news/app/<id>/view/...). Card: its image, type and date, title, and "+N more ·
 *            All news" to the game's news hub. Opens the event.
 *   curator  Steam's "What Your Curators Say" (.steam_curators_block): the selected curator
 *            (.steam_curator_selected: avatar, name in the image's tooltip, quote, verdict in
 *            .steam_curator_followed_text's class) and how many more of yours reviewed it.
 *            Opens the review list.
 *
 * Event cards have hashed classes, so their parts are read by position: the image, then a
 * text column of title, a row of type + date (the row holding a <span>), and the summary.
 * Each card shows only when Steam has its source; the row goes when neither does. Steam's own
 * sections are hidden ([data-se-highlights-source], app/summary.css) while their card shows.
 *
 *   const highlights = createHighlights(dom, appId);
 *   highlights.node      // the row, for the strip
 *   highlights.sync()    // re-read Steam's page (cheap when nothing changed)
 *   highlights.destroy()
 */
const SOURCE = 'data-se-highlights-source';

export const createHighlights = ({ el, squash, mark }, appId) => {
  const text = (node) => squash(node?.textContent);
  const node = el('div', { class: 'se-app-highlights', hidden: true });
  let key = '';

  /* ---------- Reading Steam's page ---------- */

  /** The outermost wrapper below the page column holding only this section. */
  const sectionOf = (inner) => {
    let box = inner;
    while (box.parentElement && !box.parentElement.matches('.leftcol, .page_content, body') && box.parentElement.childElementCount === 1) {
      box = box.parentElement;
    }
    return box;
  };

  const readNews = () => {
    const events = [...document.querySelectorAll('a.OtherEvents_EventCtn[href*="/news/app/"]')];
    if (!events.length) return null;
    const card = events[0];
    const image = card.querySelector('img[src]');
    const column = image?.closest('div')?.nextElementSibling ?? null;
    const row = column ? [...column.children].find((child) => child.querySelector(':scope > span')) : null;
    const title = text(column?.firstElementChild) || text(card.querySelector('div > div'));
    if (!title) return null;
    return {
      href: card.href,
      image: image?.getAttribute('src') ?? '',
      title,
      kind: text(row?.firstElementChild),
      date: text(row?.querySelector(':scope > span')),
      more: events.length - 1,
      hub: `https://store.steampowered.com/news/app/${appId}`,
      section: sectionOf(card.closest('.early_access_announcements') ?? card),
    };
  };

  const readCurator = () => {
    const block = document.querySelector('.steam_curators_block');
    const selected = block?.querySelector('.steam_curator_selected');
    const quoteBox = selected?.querySelector('.steam_curator_recommendation');
    if (!quoteBox) return null;
    // The quote is the box's own text; its read-more line and verdict are child elements.
    const quote = squash([...quoteBox.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent).join(' '));
    const avatar = selected.querySelector('.steam_curator_icon img');
    const verdictBox = selected.querySelector('.steam_curator_followed_text');
    const verdict = ['recommended', 'not_recommended', 'informational'].find((name) => verdictBox?.classList.contains(name)) ?? '';
    return {
      quote,
      name: avatar?.dataset.tooltipText ?? avatar?.alt ?? '',
      avatar: avatar?.getAttribute('src') ?? '',
      verdict,
      verdictText: text(verdictBox),
      others: block.querySelectorAll('.steam_curators_grid .steam_curator_icon').length,
      href: block.querySelector('.block_header a[href]')?.href ?? selected.querySelector('a[href]')?.href ?? '',
      section: block,
    };
  };

  /* ---------- Cards ---------- */

  const newsCard = (news) =>
    el('a', { class: 'se-app-highlight se-app-highlight--news', href: news.href }, [
      news.image ? el('img', { class: 'se-app-highlight__thumb', src: news.image, alt: '', loading: 'lazy' }) : null,
      el('span', { class: 'se-app-highlight__body' }, [
        el('span', { class: 'se-app-highlight__kicker', text: ['Latest news', news.date].filter(Boolean).join(' · ') }),
        el('span', { class: 'se-app-highlight__title', text: news.title }),
        el('span', { class: 'se-app-highlight__meta', text: [news.kind, news.more ? `+${news.more} more` : ''].filter(Boolean).join(' · ') }),
      ]),
    ]);

  const curatorCard = (curator) =>
    el('a', { class: 'se-app-highlight se-app-highlight--curator', href: curator.href || undefined, 'data-se-verdict': curator.verdict || undefined }, [
      curator.avatar ? el('img', { class: 'se-app-highlight__avatar', src: curator.avatar, alt: '', loading: 'lazy' }) : null,
      el('span', { class: 'se-app-highlight__body' }, [
        el('span', { class: 'se-app-highlight__kicker', text: ['Curator', curator.verdictText].filter(Boolean).join(' · ') }),
        el('span', { class: 'se-app-highlight__quote', text: curator.quote }),
        el('span', { class: 'se-app-highlight__meta', text: [curator.name, curator.others ? `+${curator.others} you follow` : ''].filter(Boolean).join(' · ') }),
      ]),
    ]);

  const unmarkAll = () => document.querySelectorAll(`[${SOURCE}]`).forEach((source) => source.removeAttribute(SOURCE));

  return {
    node,
    sync() {
      const news = readNews();
      const curator = readCurator();
      const sections = [news?.section, curator?.section].filter(Boolean);
      for (const source of document.querySelectorAll(`[${SOURCE}]`)) if (!sections.includes(source)) source.removeAttribute(SOURCE);
      sections.forEach((section) => mark(section, SOURCE));

      const next = JSON.stringify([news && { ...news, section: 0 }, curator && { ...curator, section: 0 }]);
      if (next === key) return;
      key = next;
      node.replaceChildren(...[news && newsCard(news), curator && curatorCard(curator)].filter(Boolean));
      node.hidden = !news && !curator;
      node.dataset.seCount = String(node.childElementCount);
    },
    destroy() {
      unmarkAll();
      node.remove();
    },
  };
};
