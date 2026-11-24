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
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROOT_FLAG = 'se-app-summary-on';

  web.define(async (dom) => {
    const { el, squash, ready, scope } = dom;
    const [{ createViewer }, { readTrailers, readTrailerMedia, openTrailer }, { createPlayer }, { createHighlights }, { createDetails }] = await Promise.all([
      Promise.resolve(web.parts.viewer),
      Promise.resolve(web.parts.trailers),
      Promise.resolve(web.parts.player),
      Promise.resolve(web.parts.highlights),
      Promise.resolve(web.parts.appDetails),
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


    /** Rebuild `target` from `build()` only when `key` changed since last time. */
    const keys = new WeakMap();
    const render = (target, key, build) => {
      if (keys.get(target) === key) return;
      keys.set(target, key);
      target.replaceChildren(...(key ? build() : []));
      target.hidden = !key;
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

    /*
     * The details row under the tags (relevance · features · languages: app/details.js), cut to
     * the room the screenshots and trailers leave beside it.
     */
    /** The room beside the media: from the columns' top to the media's last row, or null. */
    const ROOM_FLOOR = 120; // beside the media: less room than this and the row is left as is
    const roomBesideMedia = (columns) => {
      if (middleCell.hidden || middleCell.offsetTop !== leftCell.offsetTop) return null;
      const last = [...middleCell.children].filter((child) => !child.hidden).at(-1);
      if (!last) return null;
      const room = Math.floor(last.getBoundingClientRect().bottom - columns[0].getBoundingClientRect().top);
      return room >= ROOM_FLOOR ? room : null;
    };

    const detailsRow = createDetails(dom, { render, text, roomBesideMedia });

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
      ['relevance', detailsRow.syncRelevance],
      ['features', detailsRow.syncFeatures],
      ['languages', detailsRow.syncLanguages],
      ['details', detailsRow.syncRow],
      ['balance', detailsRow.balance],
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

    leftCell.append(detailsRow.node);
    const strip = el('div', { class: 'se-app-summary__strip', 'data-se-cols': '1' }, [leftCell, middleCell]);
    const section = el('section', { class: 'se-app-summary', 'aria-label': 'Summary' }, [strip]);
    media.before(section);
    document.documentElement.classList.add(ROOT_FLAG);

    sync();
    life.observe(sync);

    // Re-balance when the row or the media beside it resizes (window, fonts, images).
    const balance = new ResizeObserver(() => requestAnimationFrame(detailsRow.balance));
    balance.observe(detailsRow.node);
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

      // Steam spaces each label from its icon with &nbsp;s ("View Your Queue&nbsp;&nbsp;&nbsp;"),
      // which CSS can't collapse: with the icons hidden they pushed the words off centre
      const trimmed = [];
      for (const label of actions.querySelectorAll('#queueActionsCtn .btnv6_blue_hoverfade > span')) {
        for (const node of label.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || node.data.trim() === node.data) continue;
          trimmed.push([node, node.data]);
          node.data = node.data.trim();
        }
      }
      life.add(() => {
        for (const [node, data] of trimmed) node.data = data;
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
  });
})();
