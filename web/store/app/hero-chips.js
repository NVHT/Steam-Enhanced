/*
 * Game page hero, continued (app/hero.js): the status chips' readers, a part
 * (web.parts.heroChips) listed before hero.js. Each reads one of Steam's blocks from the page
 * (the age rating, Metacritic, achievements, the Points Shop, Early Access, the developers'
 * disclosures); the last two open a copy of Steam's block in Steam's dialog (showCopy).
 *
 *   const chips = createChipReaders(dom, { appId, text });
 *   chips.readRating() / ratingTone(label) / readDescriptors(label) / ratingBox()
 *   chips.readMetacritic() / metaScore()
 *   chips.readAchievements() / readPoints() / blockOf(link)
 *   chips.readEarlyAccess() / openEarlyAccess()
 *   chips.readNotes() / openNote(index)
 * Nothing here listens or holds state: hero.js owns the chips and their teardown.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const createChipReaders = (dom, { appId, text }) => {
    const { el, squash } = dom;

    /* ---------- Age rating chip ---------- */

    /*
     * Steam's rating box: the agency's badge image (a .../game_ratings/<agency>/<rating>.png
     * style URL), its descriptors, and a line "Age rating for: ESRB". Found by the badge, since
     * the box's classes vary: any image under a ratings path, inside the page body. The chip
     * reads "<agency> <rating>": the agency from that line (or the badge's folder), the rating
     * from the badge's alt / title (or its file name, e.g. esrb_m -> M).
     */
    const RATING_FILE = /\/([a-z]+)\/([^/?#]+?)\.(?:png|svg|jpe?g|gif|webp)/i;
    const ratingBadge = () =>
      document.querySelector('.game_rating_icon img') ??
      [...document.querySelectorAll('.page_content_ctn img[src*="rating" i]')].find((img) => !dom.isOwn(img)) ??
      null;
    /** The rating's whole box: its outermost block below the page column (agency line included). */
    const ratingBox = () => {
      const badge = ratingBadge();
      let box = null;
      for (let node = badge?.parentElement; node && !node.matches('.leftcol, .rightcol, .game_meta_data, .page_content_ctn, body'); node = node.parentElement) {
        if (node.matches('.block, .game_rating_area, .shared_game_rating')) box = node;
      }
      return box ?? badge?.parentElement?.parentElement ?? null;
    };
    const readRating = () => {
      const badge = ratingBadge();
      const box = ratingBox();
      if (!badge || !box) return '';
      const file = RATING_FILE.exec(badge.getAttribute('src') ?? '');
      const line = [...box.querySelectorAll('*')].find((node) => !node.childElementCount && /:\s*\S/.test(node.textContent) && /rating/i.test(node.textContent));
      const agency = text(line).replace(/^.*:\s*/, '') || (file?.[1] && !/rating/i.test(file[1]) ? file[1].toUpperCase() : '');
      const fromFile = file?.[2]?.replace(new RegExp(`^${agency}[_-]?`, 'i'), '').replace(/[_-]+/g, ' ').toUpperCase() ?? '';
      const rating = squash(badge.alt || badge.title) || fromFile;
      // Steam's alt often repeats the agency ("ESRB: Mature"): say it once.
      const shown = agency && rating.toLowerCase().startsWith(agency.toLowerCase()) ? rating.slice(agency.length).replace(/^[\s:·-]+/, '') : rating;
      return squash(`${agency} ${shown}`);
    };
    /*
     * The rating's tone by the youngest age it allows, from the label in any agency's terms:
     * a number (PEGI 16, USK 12, CERO's ages...) or ESRB's letters. Everyone → green, 10+ →
     * blue, teens → gold, 16-17 → orange, adults only → red.
     */
    const ESRB_AGE = { EC: 3, E: 6, E10: 10, 'E10+': 10, T: 13, M: 17, AO: 18 };
    const ratingTone = (label) => {
      const words = label.toUpperCase().split(/\s+/);
      const number = Number(/(\d{1,2})\+?(?!.*\d)/.exec(label)?.[1]);
      const age = words.map((word) => ESRB_AGE[word]).find((value) => value != null) ?? (number || null);
      if (age == null) return undefined;
      if (age >= 18) return 'adult';
      if (age >= 16) return 'mature';
      if (age >= 12) return 'teen';
      if (age >= 10) return 'older';
      return 'everyone';
    };

    /** The box's descriptors (Blood and Gore, In-Game Purchases...), for the chip's tooltip. */
    const readDescriptors = (label) => {
      const box = ratingBox();
      if (!box) return '';
      const agency = label.split(' ')[0].toLowerCase();
      return [...box.querySelectorAll('*')]
        .filter((node) => !node.childElementCount && text(node) && !/rating/i.test(text(node)) && text(node).toLowerCase() !== agency)
        .map(text)
        .join('\n');
    };

    /* ---------- Metacritic chip ---------- */

    /*
     * Steam's Metacritic box (#game_area_metascore: the score; #game_area_metalink: "Read Critic
     * Reviews"). The chip shows "Metacritic 93" in the score's tone (Metacritic's own bands:
     * 75+ favourable, 50-74 mixed, below 50 unfavourable) and opens the critic reviews.
     */
    const metaScore = () => document.getElementById('game_area_metascore');
    const readMetacritic = () => {
      const score = Number(/\d+/.exec(text(metaScore()))?.[0]);
      if (!score) return null;
      const link = document.querySelector('#game_area_metalink a[href]');
      const tone = score >= 75 ? 'positive' : score >= 50 ? 'mixed' : 'negative';
      return { score, tone, href: link?.href ?? '' };
    };

    /* ---------- Achievements and Points Shop chips ---------- */

    /*
     * Steam's right-column blocks, found by their links so any layout or language works:
     *   Achievements  steamcommunity.com/achievements/<id> (React block) or the classic
     *                 /stats/<id>/achievements (#achievement_block). The count is the number in
     *                 the link's "View all 78" label, else the block's "Includes 78 ..." title.
     *   Points Shop   any store.steampowered.com/points/shop/app/<id> link; the chip opens the
     *                 game's shop page, not the item the link names.
     * Each chip opens its link. Steam's block is hidden while the chip shows: the outermost
     * wrapper that holds nothing but that block, below the column.
     */
    const COLUMN = '.rightcol, .leftcol, .game_meta_data, .page_content, body';
    const blockOf = (link) => {
      let box = link.closest('.block') ?? link;
      while (box.parentElement && !box.parentElement.matches(COLUMN) && box.parentElement.childElementCount === 1) box = box.parentElement;
      return box;
    };
    // Steam can render a block more than once (its responsive layout keeps a second copy), so
    // every copy is hidden; the first one supplies the chip.
    const steamLinks = (selector) => [...document.querySelectorAll(selector)].filter((node) => !dom.isOwn(node));
    const countIn = (value) => Number(/\d[\d.,\s]*/.exec(value ?? '')?.[0].replace(/\D/g, '')) || 0;

    const ACHIEVEMENTS_LINK = `a[href*="/achievements/${appId}"], a[href*="/stats/${appId}/achievements"]`;
    const readAchievements = () => {
      const links = steamLinks(ACHIEVEMENTS_LINK);
      const classic = document.getElementById('achievement_block');
      const boxes = [...new Set([...links.map(blockOf), classic].filter(Boolean))];
      if (!boxes.length) return null;
      const link = links[0];
      const count =
        links.map((node) => countIn(node.getAttribute('aria-label')) || countIn(text(node))).find(Boolean) ||
        countIn(text(classic?.querySelector('.block_title')));
      return { boxes, count, href: link?.href ?? `https://steamcommunity.com/stats/${appId}/achievements/` };
    };

    const POINTS_LINK = `a[href*="/points/shop/app/${appId}"]`;
    const readPoints = () => {
      const links = steamLinks(POINTS_LINK);
      // Steam's links open single items (.../app/<id>/reward/...); the chip opens the game's shop.
      return links.length ? { boxes: [...new Set(links.map(blockOf))], href: `https://store.steampowered.com/points/shop/app/${appId}` } : null;
    };

    /* ---------- Chips that open Steam's block in a dialog ---------- */

    /*
     * A copy of one of Steam's blocks in Steam's own dialog (ShowAlertDialog, shared_global.js;
     * its look: web/shared/modals.css, the copy's: app/hero.css .se-app-dialog), titled with the
     * block's heading, which the copy drops. Without the dialog function there is no chip and the
     * block stays.
     */
    const canDialog = () => typeof window.ShowAlertDialog === 'function';
    const showCopy = (title, box, drop, className, extra) => {
      const copy = box.cloneNode(true);
      copy.querySelectorAll(`${drop}, script`).forEach((node) => node.remove());
      // Ids would repeat Steam's; inline styles (a max-height cutting text short) go too
      for (const node of [copy, ...copy.querySelectorAll('[id], [style]')]) {
        node.removeAttribute('id');
        node.removeAttribute('style');
      }
      copy.className = `se-app-dialog ${className}`;
      if (extra) copy.append(extra);
      window.ShowAlertDialog(title, copy, 'Close');
    };

    /* ---------- Early Access chip ---------- */

    /*
     * Steam's Early Access block in the page column (#earlyAccessHeader: .heading with its h2,
     * "Early Access Game" or "Coming Soon To Early Access", a subtitle and a note; .devnotes with
     * "What the developers have to say" and their answers in #devnotes_expander, cut short by an
     * inline max-height until Read more). The chip, labelled with the h2, opens the block whole
     * (showCopy; app/hero.css .se-app-ea). Steam's block is hidden while the chip shows.
     * Steam's bug-report banner (div.early_access_banner: a bug picture, a p, and an a.btn_medium
     * to the discussion boards) goes too: its line and link end the dialog.
     */
    const readEarlyAccess = () => {
      const box = document.getElementById('earlyAccessHeader');
      const label = text(box?.querySelector('.heading h2'));
      const banner = document.querySelector('.early_access_banner');
      const report = banner?.querySelector('a[href]');
      return label && canDialog()
        ? { box, label, banner, report: report && { line: text(banner.querySelector('p')), link: text(report), href: report.href } }
        : null;
    };

    const openEarlyAccess = () => {
      const early = readEarlyAccess();
      if (!early) return;
      const { report } = early;
      const footer = report?.link
        ? el('div', { class: 'se-app-ea__report' }, [report.line, el('a', { href: report.href, text: report.link })].filter(Boolean))
        : null;
      showCopy(early.label, early.box, '.heading h2, #devnotes_more', 'se-app-ea', footer);
    };

    /* ---------- Disclosure chips ---------- */

    /*
     * The developers' disclosures (AI Generated Content, Mature Content Description), each a
     * div.game_area_description > h2, a p introducing it and a p > i with their words, alone in
     * a .game_page_autocollapse_ctn in the page column. Steam gives every one the same id
     * (game_area_content_descriptors), so all are read, not the first. A chip each, labelled
     * with its h2, opens it (showCopy; app/hero.css .se-app-note); its wrapper is hidden.
     */
    const readNotes = () =>
      canDialog()
        ? [...document.querySelectorAll('[id="game_area_content_descriptors"]')]
          .map((box) => ({ box, label: text(box.querySelector('h2')) }))
          .filter((note) => note.label)
        : [];

    const openNote = (index) => {
      const note = readNotes()[index];
      if (note) showCopy(note.label, note.box, 'h2', 'se-app-note');
    };

    return {
      ratingBox,
      readRating,
      ratingTone,
      readDescriptors,
      metaScore,
      readMetacritic,
      blockOf,
      readAchievements,
      readPoints,
      readEarlyAccess,
      openEarlyAccess,
      readNotes,
      openNote,
    };
  };

  web.parts.heroChips = { createChipReaders };
})();
