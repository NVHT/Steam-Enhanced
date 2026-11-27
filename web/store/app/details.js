/*
 * Game page details row (a part: web.parts.appDetails, used by app/summary.js): three columns
 * under the overview's tags, read from Steam's page, which then hides the originals:
 *   relevance   "Is this game relevant to you?" (.game_meta_data's reasons or no-info note)
 *   features    #category_block: the feature rows, Accessibility Features, controller support
 *   languages   #languageTable, as a grid with "Show all N languages"
 * A column taller than the room beside the media (or than the next tallest, alone) is cut over
 * a "Show all".
 *
 *   const row = createDetails(dom, { render, text, roomBesideMedia });
 *   row.node                                         the row, for the strip's left cell
 *   row.syncRelevance / syncFeatures / syncLanguages  re-read Steam's page (cheap when unchanged)
 *   row.syncRow()                                    show the columns that have content
 *   row.balance()                                    cut the columns to the room
 *   row.destroy()                                    cancel a pending re-balance
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  /**
   * render(target, key, build): rebuild target only when key changed (shared with the strip);
   * text(node): a node's squashed text; roomBesideMedia(columns): the room beside the media, or null.
   */
  const createDetails = (dom, { render, text, roomBesideMedia }) => {
    const { el, squash } = dom;

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
    const LANGUAGE_COLUMNS = ['interface', 'audio', 'subtitles'];
    /** The built table's row control ({ total, show(n), open(), tops() }), or null. */
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
          // Steam's order is fixed: a narrow column shows these as icons (summary-details.css)
          ...columns.map((column, k) =>
            el('span', { role: 'columnheader', title: column, 'data-se-lang-col': LANGUAGE_COLUMNS[k] ?? null, text: column }),
          ),
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
        rebalance();
      });

      languageView = {
        total: rows.length,
        open: () => grid.hasAttribute('data-se-open'),
        /** Show the first `count` rows; the rest wait behind "Show all". */
        show(count) {
          rowNodes.forEach((node, i) => node.toggleAttribute('data-se-extra', i >= count));
          more.hidden = count >= rows.length;
        },
        /**
         * Each row's top in the grid (read with every row shown), from its name cell: a row is
         * display: contents (summary-details.css), which has no box and an offsetTop of 0.
         */
        tops: () => rowNodes.map((node) => node.firstElementChild.offsetTop),
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


    /** A duotone icon (masks in app/summary-actions.css and summary-details.css), aria-hidden: the label says what it is. */
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
    // Steam colours the controllers you own green; that colour marks our row as yours. Kept per
    // node, read again only when its class or style, or its parent's class, changes (what a
    // recolour would change): read on every pass, the computed colour paid the style pass of the
    // page still being drawn.
    const greens = new WeakMap(); // node → { key, green }
    const isGreen = (node) => {
      const key = `${node.getAttribute('class')}|${node.getAttribute('style')}|${node.parentElement?.getAttribute('class')}`;
      const kept = greens.get(node);
      if (kept?.key === key) return kept.green;
      const [r, g, b] = (getComputedStyle(node).color.match(/\d+/g) ?? []).map(Number);
      const green = g > r + 40 && g > b + 40;
      greens.set(node, { key, green });
      return green;
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


    /**
     * Languages keeps its own "Show all N languages", so it is never cut: beside the media it
     * shows as many rows as fit the room instead (fewest LANGUAGE_ROWS_MIN), else LANGUAGE_ROWS.
     */
    // Two reads, not one per row: every row shown (its height, and each row's top), then the
    // fewest rows (the height with "Show all" under them); each row more adds its step.
    const fitLanguages = (room) => {
      const view = languageView;
      if (!view || languages.hidden) return;
      if (!room || view.open()) return view.show(LANGUAGE_ROWS);
      view.show(view.total);
      if (view.total <= LANGUAGE_ROWS_MIN || languages.scrollHeight <= room) return;
      const tops = view.tops();
      view.show(LANGUAGE_ROWS_MIN);
      let height = languages.scrollHeight;
      let count = LANGUAGE_ROWS_MIN;
      while (count < view.total - 1 && height + tops[count + 1] - tops[count] <= room) {
        height += tops[count + 1] - tops[count];
        count++;
      }
      view.show(count);
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

    // The language toggle's re-balance, a frame after the grid opens or closes
    const rebalance = dom.perFrame(balanceDetails);

    const details = el('div', { class: 'se-app-summary__details' }, [relevance, features, languages]);
    for (const column of [relevance, features, languages]) column.append(columnToggle(column));

    return {
      node: details,
      syncRelevance,
      syncFeatures: syncFeatureColumn,
      syncLanguages,
      syncRow: syncDetails,
      balance: balanceDetails,
      destroy: rebalance.cancel,
    };
  };

  web.parts.appDetails = { createDetails };
})();
