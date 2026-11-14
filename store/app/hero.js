/*
 * Game page hero (/app/<id>/...): the top of the store page as one centred title card over
 * the game's hero art: the developer line, the name set in two lines (the second in spaced
 * gold capitals), and two rows of chips: the top tags, then the game's standing (the overall
 * user reviews, Metacritic, Steam Deck support, achievements, the Points Shop and the age
 * rating).
 *
 * Everything is read from Steam's own page, so the hero never fetches page data:
 *   name        #appHubAppName
 *   credits     #developers_list / #genresAndManufacturer .dev_row (by position, so any language)
 *   released    .release_date .date
 *   reviews     the .user_reviews_summary_row carrying the aggregate rating
 *   tags        .glance_tags.popular_tags a.app_tag
 *   Steam Deck  app/deck.js (the React compatibility block, which renders after load)
 * The Deck block (and sometimes the glance) arrives late, so the hero re-syncs on page changes
 * and only rewrites what differs.
 *
 * Title: the name is set on one line, or on a big line and a gold line (with a maker's
 * possessive, "Sid Meier's", as a small line above), by splitTitle() below; per-game
 * exceptions live in TITLE_OVERRIDES (below).
 *
 * The franchise banner ("the entire <name> collection") is a chip on its own row above the tags.
 *
 * Also over the art: Steam's Share / Embed / Report buttons as round glass icons beside
 * Community Hub (they click Steam's own, which stay hidden in the right column), and the age
 * rating, Metacritic score, achievements and Points Shop as chips (Steam's own boxes for
 * them are hidden).
 *
 * Art: the library hero image (store CDN), else Steam's generated page background, else the
 * header capsule blurred. Steam's title row stays in the DOM: html.se-app-hero-on hides its
 * name and floats its breadcrumbs and Community Hub button over the art (app/hero.css).
 */
const CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';
const ROOT_FLAG = 'se-app-hero-on';
const MAX_TAGS = 3;

/*
 * Title split (splitTitle below). Tuned against every game name on Steam (~197k): one line
 * when the name fits, a meaningful split (subtitle, edition, genre word, sequel number) when
 * it doesn't, one slightly scaled line when it nearly fits, else a balanced split by width.
 */
const LONG_TAIL = 14;
const NUMBER = '(?:[IVX]{1,4}|\\d{1,4})';
const SUBTITLE = /^(.+?)(?::\s+|\s+[-–—|]\s+)(.+)$/;
const SEQUEL = new RegExp(`^(.+?)\\s+(${NUMBER})$`);
const EDITION = new RegExp(
  "^(.+?)\\s+((?:Game of the Year|GOTY|Definitive|Special|Complete|Deluxe|Digital Deluxe|Anniversary|Enhanced|Ultimate|Gold|Royal|Legendary|Standard|Premium|Steam|Collector['’]s|Champion['’]s|Director['’]s)\\s+Edition|Enhanced|Remastered|Remake|Director['’]s Cut|Reloaded|Redux|Reforged|Reimagined|Revisited)$",
  'i',
);
/*
 * A trailing genre, format or series word (with its number, if any) reads as the name's
 * tagline: "TCG Card Shop | Simulator", "Euro Truck | Simulator 2", "Ancient Planet | Tower
 * Defense", "Zombie Solitaire 2 | Chapter 3". The list is the most frequent last words and
 * word pairs across Steam's catalogue.
 */
const SUFFIX = new RegExp(
  `^(.+?)\\s+((?:(?:Tower|Base|Castle|Zombie) Defen[cs]e|Visual Novel|(?:Card|Board|Puzzle) Game|Escape Room|Battle Royale|The (?:Board )?Game|Simulator VR|VR|Prologue|Demo|(?:Chapter|Episode|Season|Part|Act|Volume|Vol\\.) ${NUMBER}|Simulator|Sim|Tycoon|Manager|Clicker|Idle|Survivors|Survival|Online|Defen[cs]e|Arena|Royale|Racing|Rally|Legends|Chronicles|Saga|Odyssey|Adventures?|Quest|Tactics|Party|Battlegrounds|Together|RPG|Roguelike|Classic|Legacy|Deluxe|HD|Origins|Reborn|Rebirth|Returns|Unleashed|Evolved|Anthology|Collection|Trilogy|Bundle)(?:\\s+${NUMBER})?(?:\\s+VR)?)$`,
  'i',
);
/*
 * A maker's or brand's possessive before the name moves above it, small: "Sid Meier's |
 * Civilization VII", "Tom Clancy's | Splinter Cell", "Marvel's | Spider-Man 2". A first and
 * last name (two capitalised words, neither a common word: not "No Man's Sky", "The Witch's
 * House", "Old Man's Journey") or a known brand; "Baldur's Gate", "Assassin's Creed" stay whole.
 */
const BRAND = /^((?:Marvel|Disney|Pixar|DreamWorks|LEGO|Nickelodeon)['’]s)\s+(\S.*)$/;
const PERSON = /^([A-Z][a-z][\w.-]*\s+[A-Z][\w.-]*['’]s)\s+(\S.*)$/;
const NOT_A_NAME = new Set(
  `the a an no new old dead blind one man men year years day night mother father world god king queen devil hero
   cat dog witch farmer death hell heaven knight fool hunter wizard demon dragon kingdom pirate dealer vampire santa
   let it there where what that who here he she my your our his her its their this lady lord uncle aunt grandma
   grandpa mommy daddy baby little big ghost doctor monster player kid kids girl boy true beyond dark super crazy
   how at greedy grand director developer lover arm elf mutated mahjong valentine angel mirror beat lucky sensei
   gamer engineering interactive studio studios games bear frog`.split(/\s+/),
);
/** Trademark-style marks: noise at title size. */
const MARKS = /[™®©℠]/g;
/** A trailing (bracketed) note, e.g. "(2024)", "[Early Access]": it goes on the gold line. */
const BRACKETED = /^(.*\S)\s*[([]([^)\]]+)[)\]]$/;
/** A gold line this many times wider than the big line is lopsided: the rule is skipped. */
const LOPSIDED = 2.6;
/** A name that fits at this scale or more stays on one line rather than splitting blindly. */
const NEAR_FIT = 0.82;
/** Neither line is scaled below this fraction of its size to fit the hero. */
const MIN_SCALE = 0.55;
/** Words a big line must not end on ("Blades of the | Righteous"). */
const FUNCTION_WORDS = new Set(['the', 'a', 'an', 'of', 'and', '&', 'to', 'in', 'for', 'on', 'at', 'with', 'from', 'is', 'or', 'vs', 'vs.', 'by', 'into', 'under', 'over']);
const endsLoose = (text) => FUNCTION_WORDS.has(text.split(' ').pop().toLowerCase());

const readPrefix = (name) => {
  const brand = BRAND.exec(name);
  if (brand) return brand;
  const person = PERSON.exec(name);
  const words = person?.[1].replace(/['’]s$/, '').split(/\s+/) ?? [];
  return person && !words.some((word) => NOT_A_NAME.has(word.toLowerCase().replace(/\.$/, ''))) ? person : null;
};

/*
 * Title overrides: how a game's name is set when the automatic split gets it wrong. Keyed by
 * Steam app ID (the number in the store URL, /app/<id>/).
 *
 *   'First line | Second line'   split exactly at the bar (the second line is the gold one)
 *   'Whole Name'                 no bar: one line, never split
 *
 * The text you write is what shows (capitalised by the hero), so it can also tidy a name,
 * e.g. drop a trademark sign. Spaces around the bar don't matter.
 */
const TITLE_OVERRIDES = {};

export default async (dom) => {
  const { el, setText, mark, squash, ready, scope } = dom;
  const overrides = TITLE_OVERRIDES;
  const [{ readDeck, findDeckBlock, findLearnMore }] = await Promise.all([
    dom.importNear(import.meta.url, './deck.js'),
    ready(),
  ]);

  const life = scope();
  const appId = /^\/app\/(\d+)/i.exec(location.pathname)?.[1];
  const top = document.querySelector('.page_top_area');
  if (!appId || !top) return () => life.destroy();

  const text = (node) => squash(node?.textContent);

  /* ---------- Reading Steam's page ---------- */

  const readName = () =>
    text(document.getElementById('appHubAppName')) ||
    squash(document.title.replace(/^Save \d+% on /i, '').replace(/ on Steam$/i, ''));

  const links = (row) => [...(row?.querySelectorAll('a') ?? [])].map(text).filter(Boolean);

  const readCredits = () => {
    const rows = document.querySelectorAll('#genresAndManufacturer .dev_row');
    const developers = links(document.getElementById('developers_list')).length
      ? links(document.getElementById('developers_list'))
      : links(rows[0]);
    const publishers = links(rows[1]);
    return { developer: developers[0] ?? '', publisher: publishers[0] ?? '' };
  };

  /**
   * Total review count, from the first source the page has: the schema.org reviewCount meta
   * (all languages), the row's "(20,898)", or its tooltip ("...of the 20,898 user reviews...").
   */
  const readCount = (row) => {
    const meta = Number(document.querySelector('meta[itemprop="reviewCount"]')?.content);
    if (meta > 0) return meta.toLocaleString();
    const shown = /[\d][\d,.\s]*/.exec(text(row?.querySelector('.responsive_hidden')))?.[0]?.trim();
    if (shown) return shown;
    const tip = row?.querySelector('[data-tooltip-html]')?.getAttribute('data-tooltip-html') ?? '';
    return /([\d][\d,.]*)\s+user reviews/i.exec(tip)?.[1] ?? '';
  };

  const readReviews = () => {
    const rows = [...document.querySelectorAll('.user_reviews_summary_row')];
    const row =
      document.querySelector('.user_reviews_summary_row [itemprop="aggregateRating"]')?.closest('.user_reviews_summary_row') ??
      rows.findLast((candidate) => text(candidate.querySelector('.game_review_summary')));
    const badge = row?.querySelector('.game_review_summary') ?? document.querySelector('.game_review_summary');
    const summary = text(badge);
    if (!summary) return null;
    const tone = ['positive', 'mixed', 'negative'].find((name) => badge.classList.contains(name)) ?? 'neutral';
    return { summary, count: readCount(row), tone };
  };

  const readTags = () =>
    [...document.querySelectorAll('.glance_tags.popular_tags a.app_tag')]
      .slice(0, MAX_TAGS)
      .map((tag) => ({ label: text(tag), href: tag.href }))
      .filter((tag) => tag.label);

  /* ---------- Building the hero ---------- */

  const art = el('div', { class: 'se-app-hero__art', 'aria-hidden': 'true' });
  const meta = el('p', { class: 'se-app-hero__meta' });
  const prefixLine = el('span', { class: 'se-app-hero__prefix' });
  const lead = el('span', { class: 'se-app-hero__lead' });
  const tail = el('span', { class: 'se-app-hero__tail' });
  const title = el('h1', { class: 'se-app-hero__title', id: 'se-app-hero-title' }, [prefixLine, lead, tail]);
  const franchiseRow = el('div', { class: 'se-app-hero__chip-row', hidden: true });
  const tagRow = el('div', { class: 'se-app-hero__chip-row', role: 'list', 'aria-label': 'Top tags' });
  const statusRow = el('div', { class: 'se-app-hero__chip-row' });
  const chips = el('div', { class: 'se-app-hero__chips' }, [franchiseRow, tagRow, statusRow]);
  const hero = el('section', { class: 'se-app-hero', 'aria-labelledby': 'se-app-hero-title' }, [art, meta, title, chips]);

  top.prepend(hero);
  document.documentElement.classList.add(ROOT_FLAG);

  /*
   * Title layout. The name is set as an optional small prefix line, a big line and a gold line.
   * Widths are measured in the lines' real fonts (a canvas, so trying splits costs no layout),
   * and each line is scaled down, never below MIN_SCALE, if it is still wider than the hero.
   */
  const measureCanvas = document.createElement('canvas').getContext('2d');
  const measure = (text, node) => {
    if (!text) return 0;
    const style = getComputedStyle(node);
    measureCanvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing) || 0;
    return measureCanvas.measureText(text.toUpperCase()).width + spacing * text.length;
  };

  /*
   * The best split of `name` at a word boundary, by cost (lower is better): either line
   * wider than the hero, a gold line wider than the big one, a big line ending on "of" /
   * "the", a lone first word over a long rest, or a lone function word left over. A fuller
   * big line is preferred among the rest, so the name, not its tail, carries the size.
   */
  const balancedSplit = (name, room) => {
    const words = name.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i += 1) {
      const big = words.slice(0, i).join(' ');
      const gold = words.slice(i).join(' ');
      const bigWidth = measure(big, lead);
      const goldWidth = measure(gold, tail);
      let cost =
        Math.max(0, bigWidth / room - 1) * 4 +
        Math.max(0, goldWidth / room - 1) * 4 +
        (Math.max(0, goldWidth - bigWidth) / room) * 2 -
        (Math.min(bigWidth, room) / room) * 0.5;
      if (FUNCTION_WORDS.has(words[i - 1].toLowerCase())) cost += 3;
      if (i === 1 && words.length >= 3 && !FUNCTION_WORDS.has(words[1].toLowerCase())) cost += 0.6;
      if (i === words.length - 1 && FUNCTION_WORDS.has(words[i].toLowerCase())) cost += 3;
      if (!best || cost < best.cost) best = { cost, big, gold };
    }
    return [best.big, best.gold];
  };

  /**
   * Name -> { prefix, big, gold }. In order:
   *   1. an override in TITLE_OVERRIDES ('First | Second', or no bar for one line), as written
   *   2. clean-up: trademark marks go; a trailing (bracketed) note is kept for the gold line
   *   3. a maker's possessive ("Sid Meier's") becomes the prefix line above
   *   4. names that fit the hero, single words and unspaced scripts (CJK) stay on one line
   *   5. a subtitle after ": " / " - ", an edition, a genre / series word, or a sequel number
   *      goes on the gold line, unless it would dwarf the big line or leave it ending on "of"
   *   6. names that fit at NEAR_FIT scale stay on one line, slightly smaller
   *   7. otherwise the balanced split by measured width
   */
  const splitTitle = (rawName) => {
    const override = overrides[appId];
    if (typeof override === 'string') {
      const [first, ...rest] = override.split('|').map(squash);
      return { prefix: '', big: first, gold: rest.join(' ') };
    }

    let name = squash(rawName.replace(MARKS, ''));
    let note = '';
    const bracketed = BRACKETED.exec(name);
    if (bracketed) [, name, note] = bracketed;
    const withNote = (gold) => squash(`${gold} ${note}`);

    let prefix = '';
    const owned = readPrefix(name);
    if (owned) [, prefix, name] = owned;

    const room = title.clientWidth || hero.clientWidth;
    const width = measure(name, lead);
    if (!room || width <= room || !/\s/.test(name)) return { prefix, big: name, gold: note };

    for (const rule of [SUBTITLE, EDITION, SUFFIX, SEQUEL]) {
      const match = rule.exec(name);
      if (match && !endsLoose(match[1]) && measure(match[2], tail) <= LOPSIDED * measure(match[1], lead)) {
        return { prefix, big: match[1], gold: withNote(match[2]) };
      }
    }
    if (width * NEAR_FIT <= room) return { prefix, big: name, gold: note };
    const [big, gold] = balancedSplit(name, room);
    return { prefix, big, gold: withNote(gold) };
  };

  /** Scale a line down (CSS --se-fit) when it is wider than the hero's text column. */
  const fitLine = (node) => {
    node.style.removeProperty('--se-fit');
    if (node.hidden || !node.textContent) return;
    const room = title.clientWidth;
    const width = node.scrollWidth;
    if (room > 0 && width > room) node.style.setProperty('--se-fit', String(Math.max(MIN_SCALE, room / width)));
  };
  const fitTitle = () => [prefixLine, lead, tail].forEach(fitLine);

  let titleKey = '';
  const syncTitle = () => {
    const name = readName();
    const key = `${name}|${hero.clientWidth}`;
    if (key === titleKey) return;
    titleKey = key;
    const { prefix, big, gold } = splitTitle(name);
    setText(prefixLine, prefix);
    prefixLine.hidden = !prefix;
    setText(lead, big);
    setText(tail, gold);
    tail.hidden = !gold;
    tail.toggleAttribute('data-se-long', gold.length > LONG_TAIL);
    title.setAttribute('aria-label', name);
    fitTitle();
  };

  // Widths change with the window and once the hero's font has loaded.
  const titleSize = new ResizeObserver(() => syncTitle());
  titleSize.observe(hero);
  life.add(() => titleSize.disconnect());
  document.fonts?.ready.then(() => {
    if (!life.alive) return;
    titleKey = '';
    syncTitle();
  });


  const chip = (label, { href, tone, kind, onClick } = {}) => {
    const node = el(href ? 'a' : onClick ? 'button' : 'span', {
      class: 'se-app-hero__chip',
      text: label,
      href,
      type: onClick ? 'button' : undefined,
      'data-se-tone': tone,
      'data-se-kind': kind,
    });
    if (onClick) node.addEventListener('click', onClick);
    return node;
  };

  /*
   * Steam's Deck section is hidden once the chip shows its status (app/hero.css); the chip then
   * opens Steam's compatibility details by clicking the section's own "Learn more", which
   * stays in the DOM.
   */
  const DECK_SOURCE = 'data-se-deck-source';
  const openDeckDetails = () => findLearnMore()?.click();
  const syncDeckSource = (shown) => {
    const block = shown ? findDeckBlock() : null;
    for (const node of document.querySelectorAll(`[${DECK_SOURCE}]`)) if (node !== block) node.removeAttribute(DECK_SOURCE);
    if (block) mark(block, DECK_SOURCE);
  };
  life.add(() => syncDeckSource(false));

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

  /* ---------- Franchise chip ---------- */

  /*
   * Steam's franchise banner ("Check out the entire Call of Duty collection on Steam"): a link
   * to /franchise/<name>. The chip sits on its own row above the tags and opens that page; its
   * label is the franchise and "collection" when Steam's English wording gives the name, else
   * Steam's whole line.
   */
  const readFranchise = () => {
    const link = [...document.querySelectorAll('a[href*="/franchise/"]')].find((node) => !dom.isOwn(node));
    if (!link) return null;
    // The link can hold the name and a "Franchise" label as separate nodes that repeat the word
    // ("Borderlands Franchise Franchise"): a word repeated back to back is said once.
    const line = (text(link) || text(link.closest('.franchise_notice'))).replace(/\b(\S+)(?:\s+\1\b)+/gi, '$1');
    const name = /entire (.+?) collection/i.exec(line)?.[1];
    return {
      label: name ? `${name} collection` : line,
      href: link.href,
      box: link.closest('.franchise_notice') ?? blockOf(link),
    };
  };

  /*
   * Steam's own rating and Metacritic boxes are hidden once their chips show (app/hero.css);
   * they stay in the DOM, which the chips read.
   */
  const CHIP_SOURCE = 'data-se-chip-source';
  const syncChipSources = (boxes) => {
    for (const node of document.querySelectorAll(`[${CHIP_SOURCE}]`)) if (!boxes.includes(node)) node.removeAttribute(CHIP_SOURCE);
    for (const box of boxes) mark(box, CHIP_SOURCE);
  };
  life.add(() => syncChipSources([]));

  let chipsKey = '';

  const sync = () => {
    syncTitle();

    const { developer, publisher } = readCredits();
    const date = text(document.querySelector('.release_date .date'));
    const credits = [developer, publisher !== developer ? publisher : '', date].filter(Boolean);
    setText(meta, credits.join(' · '));
    meta.hidden = !credits.length;

    const reviews = readReviews();
    const tags = readTags();
    const deck = readDeck();
    syncDeckSource(Boolean(deck));
    const canOpen = Boolean(deck && findLearnMore());
    const rating = readRating();
    const descriptors = rating ? readDescriptors(rating) : '';
    const metacritic = readMetacritic();
    const achievements = readAchievements();
    const points = readPoints();
    const franchise = readFranchise();
    syncChipSources([
      rating ? ratingBox() : null,
      metacritic ? metaScore().closest('.block') ?? metaScore() : null,
      franchise?.box,
      ...(achievements?.boxes ?? []),
      ...(points?.boxes ?? []),
    ].filter(Boolean));
    syncTools();
    const key = JSON.stringify([reviews, tags, deck, canOpen, rating, descriptors, metacritic, achievements && [achievements.count, achievements.href], points?.href, franchise && [franchise.label, franchise.href]]);
    if (key === chipsKey) return;
    chipsKey = key;

    const tagNodes = tags.map((tag) => chip(tag.label, { href: tag.href }));
    tagNodes.forEach((node) => node.setAttribute('role', 'listitem'));
    const nodes = [];
    if (reviews) {
      const label = reviews.count ? `${reviews.summary} · ${reviews.count}` : reviews.summary;
      const target = document.getElementById('app_reviews_hash') ? '#app_reviews_hash' : undefined;
      nodes.push(chip(label, { href: target, tone: reviews.tone, kind: 'reviews' }));
    }
    if (metacritic) {
      const node = chip(`Metacritic ${metacritic.score}`, { href: metacritic.href || undefined, tone: metacritic.tone, kind: 'metacritic' });
      if (metacritic.href) Object.assign(node, { target: '_blank', rel: 'noopener' });
      nodes.push(node);
    }
    if (deck) {
      nodes.push(chip(`Deck ${deck}`, {
        tone: deck.toLowerCase(),
        kind: 'deck',
        onClick: canOpen ? openDeckDetails : undefined,
      }));
    }
    if (achievements) {
      // Same shape as the reviews chip: "Very Positive · 12,345".
      const label = achievements.count ? `Achievements · ${achievements.count.toLocaleString()}` : 'Achievements';
      nodes.push(chip(label, { href: achievements.href, tone: 'achievements', kind: 'achievements' }));
    }
    if (points) {
      nodes.push(chip('Points Shop', { href: points.href, tone: 'points', kind: 'points' }));
    }
    if (rating) {
      const node = chip(rating, { kind: 'rating', tone: ratingTone(rating) });
      if (descriptors) node.title = descriptors;
      nodes.push(node);
    }
    franchiseRow.replaceChildren(...(franchise ? [chip(franchise.label, { href: franchise.href, kind: 'franchise' })] : []));
    franchiseRow.hidden = !franchise;
    tagRow.replaceChildren(...tagNodes);
    tagRow.hidden = !tagNodes.length;
    statusRow.replaceChildren(...nodes);
    statusRow.hidden = !nodes.length;
    chips.hidden = franchiseRow.hidden && tagRow.hidden && statusRow.hidden;
  };

  /* ---------- Share / Embed / Report, beside Community Hub ---------- */

  /*
   * Steam's buttons call its own dialogs (ShowShareDialog, ShowEmbedWidget, the report
   * dialog) from href or onclick, so ours click them rather than re-implement them. Steam's
   * row is hidden only while ours shows.
   */
  const TOOLS_SOURCE = 'data-se-tools-source';
  const TOOLS = [
    { kind: 'share', label: 'Share', find: () => document.querySelector('a[href*="ShowShareDialog"], a[onclick*="ShowShareDialog"]') },
    { kind: 'embed', label: 'Embed', find: () => document.querySelector('a[href*="ShowEmbedWidget"], a[onclick*="ShowEmbedWidget"]') },
    { kind: 'report', label: 'Report', find: () => document.getElementById('ReportAppBtn') },
  ];
  const tools = el('div', { class: 'se-app-hero__tools', role: 'group', 'aria-label': 'Share and report' });
  life.add(() => tools.remove());

  let toolsKey = '';
  const syncTools = () => {
    const found = TOOLS.map((tool) => ({ ...tool, node: tool.find() })).filter((tool) => tool.node);
    const hub = document.querySelector('.page_title_area .apphub_OtherSiteInfo');
    const key = found.map((tool) => tool.kind).join(',');
    if (key !== toolsKey) {
      toolsKey = key;
      tools.replaceChildren(
        ...found.map((tool) => {
          const label = text(tool.node) || tool.node.title || tool.label;
          const button = el('button', { class: 'se-app-hero__tool', type: 'button', title: label, 'aria-label': label, 'data-se-kind': tool.kind });
          button.addEventListener('click', () => tool.find()?.click());
          return button;
        }),
      );
    }
    tools.hidden = !found.length;
    if (hub && found.length && tools.parentElement !== hub) hub.prepend(tools);

    // Hide Steam's row: their shared parent when it holds nothing else, else each button.
    const nodes = found.map((tool) => tool.node);
    const row = nodes[0]?.parentElement;
    const alone = row && [...row.children].every((child) => nodes.includes(child) || !text(child) && !child.querySelector('img, svg'));
    for (const node of document.querySelectorAll(`[${TOOLS_SOURCE}]`)) node.removeAttribute(TOOLS_SOURCE);
    if (tools.isConnected) (alone && !row.matches('.game_meta_data, .rightcol') ? [row] : nodes).forEach((node) => mark(node, TOOLS_SOURCE));
  };
  life.add(() => document.querySelectorAll(`[${TOOLS_SOURCE}]`).forEach((node) => node.removeAttribute(TOOLS_SOURCE)));

  sync();
  // Steam's later renders (the Deck block, a late glance) re-run the pass; the hero's own
  // writes carry [data-se-own] and never wake it.
  life.observe(sync);

  /* ---------- Art ---------- */

  const probe = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(false);
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0);
      image.onerror = () => resolve(false);
      image.src = src;
    });

  const inlineBackground = (node) => /url\(["']?([^"')]+)["']?\)/.exec(node?.style.backgroundImage ?? '')?.[1];

  const sources = [
    { src: `${CDN}/${appId}/library_hero.jpg`, soft: false },
    { src: top.querySelector('.game_page_background_ctn img.gameColor')?.src, soft: false },
    { src: inlineBackground(document.querySelector('.game_page_background')), soft: false },
    { src: document.querySelector('meta[property="og:image"]')?.content, soft: true },
  ];

  // First source that loads wins; runs in the background so the hero is live at once.
  (async () => {
    for (const { src, soft } of sources) {
      if (!(await probe(src))) continue;
      if (!life.alive) return;
      art.style.backgroundImage = `url(${JSON.stringify(src)})`;
      if (soft) mark(art, 'data-se-soft');
      // Next frame, so the fade-in runs from the empty state.
      const frame = requestAnimationFrame(() => mark(art, 'data-se-loaded'));
      life.add(() => cancelAnimationFrame(frame));
      return;
    }
  })();

  return () => {
    life.destroy();
    hero.remove();
    document.documentElement.classList.remove(ROOT_FLAG);
  };
};
