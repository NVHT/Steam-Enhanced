/*
 * Game page summary strip (/app/<id>/...), right under the hero: one band of two columns
 * (the short description and popular tags, then a row of three details under them:
 * "Is this game relevant to you?", the game's features and its languages; six screenshots)
 * over a centred row of Steam's own Wishlist, Follow, Ignore and View Your
 * Queue buttons. The review score, Deck status, credits and release date live in the hero, so
 * the strip doesn't repeat them.
 *
 * Read from Steam's page, which then hides the originals:
 *   description         the glance block (.glance_ctn); its tags show as the hero's chips, and
 *                       the "+" beside the Overview heading opens Steam's tag dialog
 *   trailers            Steam's media carousel (app/trailers.js): tiles under the screenshots
 *                       that open Steam's own fullscreen player on that trailer
 *   buy                 #game_area_purchase: a Buy button with the first offer's price joins
 *                       Steam's buttons and scrolls down to the purchase boxes; for an owned
 *                       game it becomes Steam's "Play Now" / "Install" and clicks that link
 *   screenshots         the highlight player (it stays; the tiles open app/viewer.js)
 *   relevance           .game_meta_data: a .block.heading over .recommendation_reasons (p.reason
 *                       .for / .against / .info lines, links kept, similar-game capsules) or,
 *                       with nothing to go on, .recommendation_noinfo
 *   features            #category_block: the classic feature rows (icon + label), then two React
 *                       blocks that render after load: Accessibility Features (a <details>) and
 *                       controller support (a heading over icon rows)
 *   languages           #languageTable: a name column and Interface / Full Audio / Subtitles
 *                       check columns; Steam shows the first few and hides the rest
 *   news, curators      under the overview: the latest event and a curator you follow
 *                       (app/highlights.js)
 * Late parts fill in when they arrive; each part is rebuilt only when its content changes.
 * The buttons stay where Steam put them (.queue_and_playtime): Steam places their menus from
 * their own ancestors, so moving them misplaces the menus. app/summary.css reorders the page
 * instead (hero with the buttons at its foot, strip, media) and styles them; the row's height
 * is measured here (--se-app-actions-h) so the hero makes room for it.
 */
const ROOT_FLAG = 'se-app-summary-on';

export default async (dom) => {
  const { el, squash, ready, scope } = dom;
  const [{ createViewer }, { readTrailers, readTrailerMedia, openTrailer }, { createPlayer }, { createHighlights }] = await Promise.all([
    dom.importNear(import.meta.url, './viewer.js'),
    dom.importNear(import.meta.url, './trailers.js'),
    dom.importNear(import.meta.url, './player.js'),
    dom.importNear(import.meta.url, './highlights.js'),
    ready(),
  ]);

  const life = scope();
  const media = document.querySelector('.page_top_area .game_media_and_summary_ctn');
  const glance = document.querySelector('.glance_ctn');
  if (!media || !glance) return () => life.destroy();

  const text = (node) => squash(node?.textContent);
  // Steam hides overflow tags with inline styles; computed display ignores our hiding of the glance.
  const shown = (node) => getComputedStyle(node).display !== 'none';

  /* ---------- Left: overview ---------- */

  const description = text(glance.querySelector('.game_description_snippet'));

  /*
   * The tags show as the hero's chips, so the overview drops its own list; the "+" beside its
   * heading clicks Steam's own, which opens the tag dialog (see all tags, add your own).
   */
  const steamPlus = glance.querySelector('.glance_tags .app_tag.add_button');
  const tagButton = steamPlus
    ? el('button', { class: 'se-app-summary__tag se-app-summary__tag--more', type: 'button', text: '+', 'aria-label': 'Tags', title: 'Tags' })
    : null;
  if (tagButton) life.listen(tagButton, 'click', () => steamPlus.click());

  // "About this game" is the description section further down (app/about.js), so this is the overview.
  const leftCell = el('div', { class: 'se-app-summary__cell' }, [
    description || tagButton
      ? el('div', { class: 'se-app-summary__head' }, [el('h2', { class: 'se-app-summary__heading', text: 'Overview' }), tagButton])
      : null,
    description ? el('p', { class: 'se-app-summary__desc', text: description }) : null,
  ]);

  /* Under the overview: the latest news and a curator you follow (app/highlights.js). */
  const appId = /^\/app\/(\d+)/i.exec(location.pathname)?.[1] ?? '';
  const highlights = createHighlights(dom, appId);
  life.add(() => highlights.destroy());
  leftCell.append(highlights.node);

  /* ---------- Middle: screenshots ---------- */

  // The first SHOTS screenshots; with more, the last tile reads "+N". Re-read on every page change.
  const SHOTS = 6;
  // Every Steam screenshot URL names its file ss_<hex>[.<w>x<h>].jpg, whatever markup carries it.
  const SHOT_FILE = /(ss_[0-9a-f]{8,})(?:\.\d+x\d+)?\.jpg/i;

  /**
   * Steam's screenshots in page order, one per ss_ id, read from any link or image in the media
   * block (player links, strip thumbnails, React or classic). From the same file: the 1920×1080
   * size for the viewer and the 600×338 size for tiles (Steam's CDN serves both beside it).
   */
  const readShots = () => {
    const found = new Map();
    // app/about.js moves Steam's player area out of the media block into its band.
    const roots = [document.getElementById('highlight_player_area'), media].filter(Boolean);
    const nodes = roots.flatMap((root) => [...root.querySelectorAll('a[href*="ss_"], img[src*="ss_"]')]);
    for (const node of nodes) {
      const url = node.href || node.src;
      const match = SHOT_FILE.exec(url);
      if (!match || found.has(match[1].toLowerCase())) continue;
      found.set(match[1].toLowerCase(), {
        id: match[1],
        full: url.replace(SHOT_FILE, `${match[1]}.1920x1080.jpg`),
        tile: url.replace(SHOT_FILE, `${match[1]}.600x338.jpg`),
      });
    }
    return [...found.values()];
  };

  const viewer = createViewer(dom, { createPlayer });
  let shotList = [];
  const shots = el('div', { class: 'se-app-summary__shots', role: 'list', 'aria-label': 'Screenshots' });
  /* ---------- Middle, under the screenshots: trailers ---------- */

  /*
   * Trailer tiles set like the screenshots (app/trailers.js reads Steam's media carousel): the
   * first TRAILERS, the last reading "+N" when there are more. A tile opens the viewer on that
   * trailer, playing in the theme's player (app/player.js) with every trailer in its rail.
   * A trailer it can't play (no sources found, or no HLS support: see app/player.js) opens in
   * Steam's own fullscreen player instead.
   */
  const playTrailer = async (i) => {
    const media = await readTrailerMedia();
    if (!media[i]?.hls && !media[i]?.mp4) {
      openTrailer(i);
      return;
    }
    const items = media.map((trailer) => ({
      tile: trailer.thumb,
      full: trailer.thumb,
      title: trailer.title,
      // A trailer without sources still goes to the player, which fails it over to Steam's.
      video: { hls: trailer.hls, mp4: trailer.mp4 },
    }));
    viewer.open(items, i, {
      noun: 'Trailer',
      onFail: (at) => {
        viewer.close();
        openTrailer(at);
      },
    });
  };
  const TRAILERS = 3;
  const trailerTiles = el('div', { class: 'se-app-summary__shots se-app-summary__shots--trailers', role: 'list', 'aria-label': 'Trailers' });
  const trailersCount = el('span', { class: 'se-app-summary__count' });
  const trailerGroup = el('div', { class: 'se-app-summary__group', role: 'region', 'aria-labelledby': 'se-app-trailers-title' }, [
    el('div', { class: 'se-app-summary__head' }, [
      el('h2', { class: 'se-app-summary__heading', id: 'se-app-trailers-title', text: 'Trailers' }),
      trailersCount,
    ]),
    trailerTiles,
  ]);

  // Screenshots under a heading like the other sections, with the count beside it.
  const shotsCount = el('span', { class: 'se-app-summary__count' });
  const gallery = el('div', { class: 'se-app-summary__group', role: 'region', 'aria-labelledby': 'se-app-shots-title' }, [
    el('div', { class: 'se-app-summary__head' }, [
      el('h2', { class: 'se-app-summary__heading', id: 'se-app-shots-title', text: 'Screenshots' }),
      shotsCount,
    ]),
    shots,
  ]);
  const middleCell = el('div', { class: 'se-app-summary__cell' }, [gallery, trailerGroup]);

  const syncTrailers = () => {
    const list = readTrailers();
    render(trailerTiles, list.map((trailer) => `${trailer.title}|${trailer.thumb}`).join('\n'), () =>
      list.slice(0, TRAILERS).map((trailer, i) => {
        const more = i === TRAILERS - 1 && list.length > TRAILERS ? list.length - TRAILERS + 1 : 0;
        const tile = el('button', {
          class: 'se-app-summary__shot se-app-summary__trailer',
          type: 'button',
          role: 'listitem',
          title: trailer.title,
          'aria-label': more ? `Play ${trailer.title}, and ${more - 1} more trailers` : `Play ${trailer.title}`,
        }, [
          el('img', { src: trailer.thumb, alt: '', loading: 'lazy', decoding: 'async' }),
          more
            ? el('span', { class: 'se-app-summary__shot-more', text: `+${more}`, 'aria-hidden': 'true' })
            : el('span', { class: 'se-app-summary__trailer-play', 'aria-hidden': 'true' }),
          more ? null : el('span', { class: 'se-app-summary__trailer-title', text: trailer.title, 'aria-hidden': 'true' }),
        ]);
        tile.addEventListener('click', () => playTrailer(i));
        return tile;
      }),
    );
    trailersCount.textContent = list.length > 1 ? String(list.length) : '';
    trailerGroup.hidden = trailerTiles.hidden;
    syncMiddle();
  };

  /** The middle column shows when it has screenshots or trailers; the strip is one or two columns. */
  const syncMiddle = () => {
    gallery.hidden = shots.hidden;
    shotsCount.textContent = shotList.length > 1 ? String(shotList.length) : '';
    middleCell.hidden = gallery.hidden && trailerGroup.hidden;
    strip.dataset.seCols = middleCell.hidden ? '1' : '2';
  };


  /* ---------- Details row (left, under the tags): relevance · features · languages ---------- */

  /* "Is this game relevant to you?" */

  const relevanceTitle = el('h2', { class: 'se-app-summary__heading', id: 'se-app-relevance-title' });
  const relevanceBody = el('div', { class: 'se-app-summary__relevance' });
  const relevance = el('div', { class: 'se-app-summary__group', role: 'region', 'aria-labelledby': 'se-app-relevance-title' }, [
    relevanceTitle,
    relevanceBody,
  ]);

  /** Steam's relevance block and its heading (the .block.heading just before it). */
  const steamRelevance = () => {
    const block = document.querySelector('.game_meta_data :is(.recommendation_reasons, .recommendation_noinfo)');
    const heading = block?.previousElementSibling?.matches('.block.heading') ? block.previousElementSibling : null;
    return block ? { block, heading } : null;
  };

  /** A copy of a Steam node (element or text) with ids dropped, so Steam's own stay unique. */
  const copyOf = (node) => {
    const clone = node.cloneNode(true);
    if (clone.nodeType === Node.ELEMENT_NODE) {
      for (const withId of [clone, ...clone.querySelectorAll('[id]')]) withId.removeAttribute('id');
    }
    return clone;
  };

  const TONES = ['for', 'against', 'info'];

  /*
   * Reasons become rows: a tone icon (check / cross / info) and Steam's own text with its links.
   * Similar-games capsules become a thumbnail row; Steam's <hr> separators go (the rows are
   * spaced instead). Reasons are found at any depth, since Steam wraps them differently by
   * page; anything else with text is kept as a note, and a block with no recognisable parts is
   * copied whole, so nothing Steam says is lost. The no-info variant is copied as is.
   */
  const reasonRow = (node) => {
    const tone = TONES.find((name) => node.classList.contains(name)) ?? 'info';
    return el('div', { class: 'se-app-summary__reason', 'data-se-tone': tone }, [
      el('span', { class: 'se-app-summary__reason-icon', 'aria-hidden': 'true' }),
      el('span', { class: 'se-app-summary__reason-text' }, [...node.childNodes].map(copyOf)),
    ]);
  };

  const similarRow = (node) => {
    const games = [...node.querySelectorAll('a[href]')].filter((link) => link.querySelector('img'));
    if (!games.length) return null;
    return el('div', { class: 'se-app-summary__similar' }, games.map((link) => {
      const img = link.querySelector('img');
      return el('a', { class: 'se-app-summary__similar-game', href: link.href, title: img.alt || squash(link.title) }, [
        el('img', { src: img.currentSrc || img.src, alt: img.alt || '', loading: 'lazy', decoding: 'async' }),
      ]);
    }));
  };

  const buildRelevance = (block) => {
    if (block.matches('.recommendation_noinfo')) {
      return [el('div', { class: 'se-app-summary__noinfo' }, [...block.childNodes].map(copyOf))];
    }
    const parts = [];
    const walk = (parent) => {
      for (const child of parent.children) {
        if (child.matches('hr, script, style')) continue;
        if (child.matches('.reason')) parts.push(reasonRow(child));
        else if (child.matches('.similar_recent_apps_container')) parts.push(similarRow(child));
        else if (child.querySelector('.reason, .similar_recent_apps_container')) walk(child);
        else if (text(child)) parts.push(el('div', { class: 'se-app-summary__reason-note' }, [copyOf(child)]));
      }
    };
    walk(block);
    const built = parts.filter(Boolean);
    if (built.length || !text(block)) return built;
    return [el('div', { class: 'se-app-summary__reason-note' }, [...block.childNodes].map(copyOf))];
  };

  const syncRelevance = () => {
    const found = steamRelevance();
    relevanceTitle.textContent = text(found?.heading) || 'Is this game relevant to you?';
    render(relevanceBody, found ? found.block.innerHTML : '', () => buildRelevance(found.block));
    if (found) {
      found.block.setAttribute('data-se-relevance-source', '');
      found.heading?.setAttribute('data-se-relevance-source', '');
    }
    relevance.hidden = relevanceBody.hidden || !relevanceBody.childElementCount;
  };

  /* Features */

  const featureList = el('ul', { class: 'se-app-summary__features se-app-summary__features--single', 'aria-label': 'Features' });
  const access = el('div', { class: 'se-app-summary__group' });
  const controller = el('div', { class: 'se-app-summary__group' });
  const features = el('div', { class: 'se-app-summary__group', role: 'region', 'aria-labelledby': 'se-app-features-title' }, [
    el('h2', { class: 'se-app-summary__heading', id: 'se-app-features-title', text: 'Features' }),
    featureList,
    access,
    controller,
  ]);

  const steamFeatures = () => document.getElementById('category_block');

  /* Languages */

  /**
   * Rows shown before "Show all": about as many as Steam's own table shows, or, beside the
   * media, as many as fit above the trailers' bottom (balanceDetails), never fewer than
   * LANGUAGE_ROWS_MIN.
   */
  const LANGUAGE_ROWS = 6;
  const LANGUAGE_ROWS_MIN = 2;
  /** The built table's row control ({ total, show(n), open() }), or null. */
  let languageView = null;

  const languagesTitle = el('h2', { class: 'se-app-summary__heading', id: 'se-app-languages-title' });
  const languageTable = el('div', { class: 'se-app-summary__languages' });
  const languages = el('div', { class: 'se-app-summary__group', role: 'region', 'aria-labelledby': 'se-app-languages-title' }, [
    languagesTitle,
    languageTable,
  ]);

  /**
   * Steam's language table -> { columns: ['Interface', 'Full Audio', 'Subtitles'], rows:
   * [{ name, marks: [true, false, true] }] }. A mark is any text in the cell (Steam's check);
   * rows without one cell per column (Steam's "not supported" notes) are dropped.
   */
  const readLanguages = (table) => {
    const [head, ...body] = [...table.rows];
    const columns = [...(head?.cells ?? [])].slice(1).map(text);
    const rows = body
      .filter((row) => row.cells.length === columns.length + 1)
      .map((row) => ({ name: text(row.cells[0]), marks: [...row.cells].slice(1).map((cell) => Boolean(text(cell))) }))
      .filter((row) => row.name);
    return { columns, rows };
  };

  const buildLanguages = ({ columns, rows }) => {
    const rowNodes = rows.map((row) =>
      el('div', { class: 'se-app-summary__lang-row', role: 'row' }, [
        el('span', { class: 'se-app-summary__lang-name', role: 'rowheader', text: row.name }),
        ...row.marks.map((on, k) =>
          el('span', {
            class: 'se-app-summary__lang-mark',
            role: 'cell',
            'data-se-on': on ? '' : null,
            'aria-label': `${columns[k]}: ${on ? 'yes' : 'no'}`,
          }),
        ),
      ]),
    );
    const grid = el('div', { class: 'se-app-summary__lang-grid', role: 'table', 'aria-labelledby': 'se-app-languages-title' }, [
      el('div', { class: 'se-app-summary__lang-row se-app-summary__lang-row--head', role: 'row' }, [
        el('span', { role: 'columnheader' }),
        ...columns.map((column) => el('span', { role: 'columnheader', text: column })),
      ]),
      ...rowNodes,
    ]);
    const label = (open) => (open ? 'Show fewer' : `Show all ${rows.length} languages`);
    const more = el('button', { class: 'se-app-summary__lang-more', type: 'button', 'aria-expanded': 'false', text: label(false) });
    more.addEventListener('click', () => {
      const open = !grid.hasAttribute('data-se-open');
      grid.toggleAttribute('data-se-open', open);
      more.setAttribute('aria-expanded', String(open));
      more.textContent = label(open);
      requestAnimationFrame(balanceDetails);
    });

    languageView = {
      total: rows.length,
      open: () => grid.hasAttribute('data-se-open'),
      /** Show the first `count` rows; the rest wait behind "Show all". */
      show(count) {
        rowNodes.forEach((node, i) => node.toggleAttribute('data-se-extra', i >= count));
        more.hidden = count >= rows.length;
      },
    };
    languageView.show(LANGUAGE_ROWS);
    return [grid, more];
  };

  /**
   * Steam's languages section: #languageTable and its "Languages:" title, which sits beside the
   * table in their shared .block (the box itself). The whole box goes when it holds nothing
   * else; otherwise just the table and the title.
   */
  const steamLanguages = () => {
    const table = document.getElementById('languageTable');
    const box = table?.parentElement;
    if (!box) return null;
    const title = box.querySelector(':scope > .block_title') ?? table.querySelector('.block_title');
    // Steam's "See all N supported languages" link can sit outside the table; ours replaces it.
    const more = box.querySelector(':scope > .all_languages');
    const parts = [table, title, more].filter(Boolean);
    const extra = [...box.children].some((child) => !parts.includes(child) && text(child));
    const own = !extra && !box.matches('.game_meta_data, .rightcol, .leftcol');
    return { table, title, hide: own ? [box] : parts };
  };

  const syncLanguages = () => {
    const found = steamLanguages();
    const table = found?.table.querySelector('table');
    const data = table ? readLanguages(table) : null;
    languagesTitle.textContent = text(found?.title).replace(/:\s*$/, '') || 'Languages';
    if (!data?.rows.length) languageView = null;
    render(languageTable, data?.rows.length ? JSON.stringify(data) : '', () => buildLanguages(data));
    if (data?.rows.length) found.hide.forEach((node) => node.setAttribute('data-se-languages-source', ''));
    languages.hidden = languageTable.hidden;
  };

  /** Rebuild `target` from `build()` only when `key` changed since last time. */
  const keys = new WeakMap();
  const render = (target, key, build) => {
    if (keys.get(target) === key) return;
    keys.set(target, key);
    target.replaceChildren(...(key ? build() : []));
    target.hidden = !key;
  };

  /** A duotone icon (app/summary.css masks), aria-hidden: the label says what it is. */
  const icon = (key) => el('span', { class: 'se-app-summary__feature-icon', 'data-se-icon': key, 'aria-hidden': 'true' });

  /**
   * Feature -> icon key, from Steam's icon file name (ico_singlePlayer.png, ico_cloud.png...),
   * which doesn't change with the store language. First match wins; unknown files get 'spark'.
   */
  const ICONS = [
    [/pvp|versus/, 'versus'],
    [/co_?op/, 'coop'],
    [/single/, 'single'],
    [/multi/, 'multi'],
    [/shared|split/, 'screen'],
    [/achievement/, 'trophy'],
    [/leaderboard/, 'podium'],
    [/card/, 'cards'],
    [/cloud/, 'cloud'],
    [/stat/, 'stats'],
    [/remote/, 'remote'],
    [/family/, 'family'],
    [/controller|gamepad/, 'gamepad'],
    [/vr/, 'vr'],
    [/workshop|editor|mod/, 'workshop'],
    [/hdr/, 'hdr'],
    [/vac|cheat/, 'shield'],
    [/cart|purchase/, 'cart'],
    [/caption|commentary|subtitle/, 'captions'],
    [/lan/, 'lan'],
  ];
  const iconFor = (src) => {
    const file = (src.split('/').pop() ?? '').toLowerCase();
    return ICONS.find(([pattern]) => pattern.test(file))?.[1] ?? 'spark';
  };

  // Classic rows: <a.game_area_details_specs_ctn><div.icon><img></div><div.label>Single-player</div></a>
  const syncFeatures = (block) => {
    const rows = [...block.querySelectorAll('.game_area_features_list_ctn > a.game_area_details_specs_ctn')]
      .map((row) => ({ href: row.href, icon: iconFor(row.querySelector('.icon img')?.src ?? ''), label: text(row.querySelector('.label')) }))
      .filter((row) => row.label);
    render(featureList, JSON.stringify(rows), () =>
      rows.map((row) =>
        el('li', {}, [el('a', { class: 'se-app-summary__feature', href: row.href }, [icon(row.icon), el('span', { text: row.label })])]),
      ),
    );
  };

  // React: <details><summary>…Accessibility Features (6) ?</summary><ul><li>Visual<ul><li><a>…
  const syncAccess = (block) => {
    const details = block.querySelector('details');
    const title = text(details?.querySelector('summary')).replace(/\s*\?$/, '');
    const items = [...(details?.querySelectorAll('li li a, li a') ?? [])]
      .map((link) => ({ href: link.href, label: text(link) }))
      .filter((item, i, all) => item.label && all.findIndex((other) => other.label === item.label) === i);
    render(access, title ? JSON.stringify([title, items]) : '', () => [
      el('details', { class: 'se-app-summary__access' }, [
        el('summary', {}, [icon('access'), el('span', { text: title })]),
        el('div', { class: 'se-app-summary__access-list' },
          items.map((item) => el('a', { class: 'se-app-summary__tag', href: item.href, text: item.label })),
        ),
      ]),
    ]);
  };

  // React: a heading ("Full Controller Support") over <a> rows, each an SVG icon and a label.
  // Steam colours the controllers you own green; that colour marks our row as yours.
  const isGreen = (node) => {
    const [r, g, b] = (getComputedStyle(node).color.match(/\d+/g) ?? []).map(Number);
    return g > r + 40 && g > b + 40;
  };

  const syncController = (block) => {
    const host = [...block.children].find((child) => !child.matches('.game_area_features_list_ctn') && child.querySelector('a svg'));
    const links = [...(host?.querySelectorAll('a') ?? [])].filter((link) => text(link));
    const heading = host ? [...host.querySelectorAll('div')].find((node) => !node.querySelector('a') && text(node) && !node.closest('a')) : null;
    const rows = links.map((link) => ({ href: link.href, label: text(link), yours: isGreen(link.lastElementChild ?? link) }));
    render(controller, rows.length ? JSON.stringify([text(heading), rows]) : '', () => [
      el('span', { class: 'se-app-summary__subhead', text: text(heading) }),
      el('ul', { class: 'se-app-summary__features se-app-summary__features--single' },
        rows.map((row) =>
          el('li', {}, [
            el('a', { class: 'se-app-summary__feature', href: row.href, 'data-se-yours': row.yours || null }, [icon('gamepad'), el('span', { text: row.label })]),
          ]),
        ),
      ),
    ]);
  };

  const syncShots = () => {
    const list = readShots();
    shotList = list;
    // Rebuild only when the set of ids changes; every tile opens the viewer on the full list.
    render(shots, list.map((shot) => shot.id).join(','), () =>
      list.slice(0, SHOTS).map((shot, i) => {
        const more = i === SHOTS - 1 && list.length > SHOTS ? list.length - SHOTS + 1 : 0;
        const tile = el('button', {
          class: 'se-app-summary__shot',
          type: 'button',
          role: 'listitem',
          'aria-label': more ? `Screenshot ${i + 1}, and ${more - 1} more` : `Screenshot ${i + 1} of ${list.length}`,
        }, [
          el('img', { src: shot.tile, alt: '', loading: 'lazy', decoding: 'async' }),
          more ? el('span', { class: 'se-app-summary__shot-more', text: `+${more}`, 'aria-hidden': 'true' }) : null,
        ]);
        tile.addEventListener('click', () => viewer.open(shotList, i));
        return tile;
      }),
    );
    syncMiddle();
  };

  const syncFeatureColumn = () => {
    const block = steamFeatures();
    if (block) {
      syncFeatures(block);
      syncAccess(block);
      syncController(block);
    }
    features.hidden = !block || (featureList.hidden && access.hidden && controller.hidden);
  };

  /** The row shows whichever of its three columns have content, and goes when none do. */
  const syncDetails = () => {
    const shown = [relevance, features, languages].filter((column) => !column.hidden).length;
    details.hidden = !shown;
    details.dataset.seCount = String(shown);
  };

  /*
   * Column heights. Beside the screenshots and trailers, the row ends where they end: any
   * column taller than the room left under the overview is cut to it (Languages instead shows
   * fewer rows, fitLanguages). Alone (no media, or the
   * strip stacked on narrow windows), the tallest is cut to the next tallest. A cut column
   * fades out over a "Show all" that opens it in full ("Show less" closes it). Measured from
   * the content's own height (scrollHeight), so cutting a column never changes what it measures.
   */
  const CUT_SLACK = 48; // equal columns: a column only this much taller is left alone
  const CUT_FLOOR = 260; // equal columns: never cut shorter than this
  const ROOM_FLOOR = 120; // beside the media: less room than this and the row is left as is
  const opened = new WeakSet();

  const columnToggle = (column) => {
    const toggle = el('button', { class: 'se-app-summary__more', type: 'button', text: 'Show all', 'aria-expanded': 'false' });
    toggle.hidden = true;
    toggle.addEventListener('click', () => {
      if (opened.has(column)) opened.delete(column);
      else opened.add(column);
      balanceDetails();
    });
    return toggle;
  };

  /** The room beside the media: from the columns' top to the media's last row, or null. */
  const roomBesideMedia = (columns) => {
    if (middleCell.hidden || middleCell.offsetTop !== leftCell.offsetTop) return null;
    const last = [...middleCell.children].filter((child) => !child.hidden).at(-1);
    if (!last) return null;
    const room = Math.floor(last.getBoundingClientRect().bottom - columns[0].getBoundingClientRect().top);
    return room >= ROOM_FLOOR ? room : null;
  };

  /**
   * Languages keeps its own "Show all N languages", so it is never cut: beside the media it
   * shows as many rows as fit the room instead (fewest LANGUAGE_ROWS_MIN), else LANGUAGE_ROWS.
   */
  const fitLanguages = (room) => {
    const view = languageView;
    if (!view || languages.hidden) return;
    if (!room || view.open()) return view.show(LANGUAGE_ROWS);
    let count = view.total;
    view.show(count);
    while (count > LANGUAGE_ROWS_MIN && languages.scrollHeight > room) view.show(--count);
  };

  const balanceDetails = () => {
    const columns = [relevance, features, languages].filter((column) => !column.hidden);
    if (!columns.length) return;
    for (const column of columns) {
      column.style.removeProperty('--se-cut');
      column.style.removeProperty('min-height');
    }
    const room = roomBesideMedia(columns);
    fitLanguages(room);
    const heights = columns.map((column) => column.scrollHeight);
    const target = room ?? (columns.length > 1 ? Math.max([...heights].sort((a, b) => b - a)[1], CUT_FLOOR) : Infinity);
    const slack = room ? 0 : CUT_SLACK;
    columns.forEach((column, i) => {
      const toggle = column.lastElementChild;
      const tall = (column !== languages || !languageView) && heights[i] > target + slack;
      const cut = tall && !opened.has(column);
      column.toggleAttribute('data-se-cut', cut);
      if (cut) column.style.setProperty('--se-cut', `${target}px`);
      toggle.hidden = !tall;
      toggle.textContent = cut ? 'Show all' : 'Show less';
      toggle.setAttribute('aria-expanded', String(!cut));
    });
    alignColumns(columns);
  };

  /*
   * Every column takes the row's height, so their "Show all" buttons (pinned to the foot by
   * app/summary.css) line up. The row is the tallest column not opened by the viewer: one
   * opened in full never pulls the others' buttons down with it.
   */
  const alignColumns = (columns) => {
    const closed = columns.filter((column) => !opened.has(column) && !(column === languages && languageView?.open()));
    const row = Math.max(0, ...closed.map((column) => column.offsetHeight));
    for (const column of columns) column.style.setProperty('min-height', `${row}px`);
  };

  /* ---------- Buy: joins Steam's buttons, scrolls to the purchase boxes ---------- */

  /*
   * The first offer's price (the game itself; Steam lists demos and free weekends above it in
   * their own boxes): "-20% $23.99", "$29.99", or Steam's own words for free games ("Free to
   * Play"). With no purchase area (unreleased, delisted) there is no Buy button.
   */
  const buyButton = el('button', { class: 'se-app-buy', type: 'button' });
  buyButton.addEventListener('click', () => {
    if (buyButton.dataset.seMode === 'play') findPlay()?.click();
    // The buy rows (app/purchase.js) stand in for Steam's purchase boxes when they show.
    else (document.querySelector('.se-app-purchase:not([hidden])') ?? document.getElementById('game_area_purchase'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const readOffer = () => {
    const box = document.querySelector('#game_area_purchase .game_area_purchase_game:not(.demo_above_purchase):not(.free_weekend)');
    const action = box?.querySelector('.game_purchase_action');
    if (!action) return null;
    return {
      pct: text(action.querySelector('.discount_pct')),
      price: text(action.querySelector('.discount_final_price')) || text(action.querySelector('.game_purchase_price')),
    };
  };

  /** An owned game's launch / install link (Steam's "Play Now" / "Install"), if the page has one. */
  const findPlay = () =>
    document.querySelector('.queue_and_playtime a[href^="steam://run/"], .queue_and_playtime a[href^="steam://install/"], .queue_and_playtime a[href^="steam://launch/"]') ??
    document.querySelector('.game_area_already_owned_btn a[href]');

  const syncBuy = () => {
    const purchase = document.getElementById('game_area_purchase');
    const row = document.getElementById('queueActionsCtn');
    const play = findPlay();

    // Owned: the button plays (or installs) through Steam's own link instead of buying.
    if (play && row) {
      const label = text(play) || 'Play';
      const key = `play:${label}`;
      if (buyButton.dataset.seKey !== key) {
        buyButton.dataset.seKey = key;
        buyButton.replaceChildren(el('span', { class: 'se-app-buy__label', text: label }));
        buyButton.setAttribute('aria-label', label);
      }
      buyButton.dataset.seMode = 'play';
      if (row.firstElementChild !== buyButton) row.prepend(buyButton);
      document.documentElement.classList.add('se-app-has-buy', 'se-app-owned');
      return;
    }
    delete buyButton.dataset.seMode;
    document.documentElement.classList.remove('se-app-owned');

    const offer = purchase ? readOffer() : null;
    if (!purchase || !row) {
      buyButton.remove();
      document.documentElement.classList.remove('se-app-has-buy');
      return;
    }
    const priced = /\d/.test(offer?.price ?? '');
    const key = JSON.stringify(offer);
    if (buyButton.dataset.seKey !== key) {
      buyButton.dataset.seKey = key;
      buyButton.replaceChildren(
        ...[
          el('span', { class: 'se-app-buy__label', text: priced || !offer?.price ? 'Buy' : offer.price }),
          priced && offer.pct ? el('span', { class: 'se-app-buy__pct', text: offer.pct }) : null,
          priced ? el('span', { class: 'se-app-buy__price', text: offer.price }) : null,
        ].filter(Boolean),
      );
      buyButton.setAttribute('aria-label', priced ? `Buy, ${offer.price}` : buyButton.textContent);
    }
    if (row.firstElementChild !== buyButton) row.prepend(buyButton);
    document.documentElement.classList.add('se-app-has-buy');
  };


  /** Each part syncs on its own: one failing (Steam changed its markup) leaves the rest working. */
  const PARTS = [
    ['highlights', () => highlights.sync()],
    ['screenshots', syncShots],
    ['trailers', syncTrailers],
    ['buy', syncBuy],
    ['relevance', syncRelevance],
    ['features', syncFeatureColumn],
    ['languages', syncLanguages],
    ['details', syncDetails],
    ['balance', balanceDetails],
  ];
  const sync = () => {
    for (const [name, part] of PARTS) {
      try {
        part();
      } catch (error) {
        console.error(`[Steam Enhanced] app/summary.js ${name}:`, error);
      }
    }
  };

  /* ---------- Assemble ---------- */

  const details = el('div', { class: 'se-app-summary__details' }, [relevance, features, languages]);
  leftCell.append(details);
  for (const column of [relevance, features, languages]) column.append(columnToggle(column));
  const strip = el('div', { class: 'se-app-summary__strip', 'data-se-cols': '1' }, [leftCell, middleCell]);
  const section = el('section', { class: 'se-app-summary', 'aria-label': 'Summary' }, [strip]);
  media.before(section);
  document.documentElement.classList.add(ROOT_FLAG);

  sync();
  life.observe(sync);

  // Re-balance when the row or the media beside it resizes (window, fonts, images).
  const balance = new ResizeObserver(() => requestAnimationFrame(balanceDetails));
  balance.observe(details);
  balance.observe(middleCell); // the room beside the media follows its height
  balance.observe(highlights.node); // the cards above the row move it down as they fill in
  life.add(() => balance.disconnect());

  /*
   * The buttons' own wrapper in .queue_and_playtime (which also holds an owned game's library
   * banner and review form): tagged so app/summary.css moves only it into the hero, and its
   * height measured so the hero makes room for it.
   */
  const actions = document.getElementById('queueCtn')?.closest('.queue_and_playtime > *');
  if (actions) {
    actions.setAttribute('data-se-actions', '');
    life.add(() => actions.removeAttribute('data-se-actions'));
    const root = document.documentElement;
    const measure = new ResizeObserver(() => root.style.setProperty('--se-app-actions-h', `${Math.ceil(actions.offsetHeight)}px`));
    measure.observe(actions);
    life.add(() => {
      measure.disconnect();
      root.style.removeProperty('--se-app-actions-h');
    });
  }

  /*
   * An owned game's library banner, Play / stats and review form share .queue_and_playtime
   * with the buttons. They go to the top of the user reviews section (#app_reviews_hash), each
   * tagged [data-se-owned-part] for app/summary.css, and back to their places on teardown.
   * Steam's review form is plain markup bound by id, so moving it keeps it working.
   */
  const ownedHome = actions?.parentElement;
  const ownedParts = ownedHome
    ? [...ownedHome.children].filter((child) => child !== actions && !child.matches('.game_background_lighten, script, style'))
    : [];
  const reviewsAnchor = document.getElementById('app_reviews_hash');
  const ownedSlots = ownedParts.map((part) => ({ part, next: part.nextSibling }));
  for (const part of ownedParts) {
    part.setAttribute('data-se-owned-part', '');
    if (reviewsAnchor) reviewsAnchor.before(part);
  }
  life.add(() => {
    for (const { part, next } of ownedSlots.reverse()) {
      part.removeAttribute('data-se-owned-part');
      if (reviewsAnchor && ownedHome) ownedHome.insertBefore(part, next?.parentNode === ownedHome ? next : null);
    }
  });

  return () => {
    life.destroy();
    viewer.destroy();
    section.remove();
    buyButton.remove();
    document.documentElement.classList.remove('se-app-has-buy', 'se-app-owned');
    const sources = ['data-se-relevance-source', 'data-se-languages-source'];
    for (const node of document.querySelectorAll(sources.map((name) => `[${name}]`).join(', '))) {
      sources.forEach((name) => node.removeAttribute(name));
    }
    document.documentElement.classList.remove(ROOT_FLAG);
  };
};
