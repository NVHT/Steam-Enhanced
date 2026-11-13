/*
 * Game page buy area (/app/<id>/...), under About: Steam's purchase boxes as flat rows on the
 * left, "Content for this game" under them, and the system requirements as a column on the
 * right. Styles: app/purchase.css.
 *
 * Read from Steam's page, which then hides the originals ([data-se-buy-source]):
 *   buy    #game_area_purchase .game_area_purchase_game: a title (h1/h2), platform icons
 *          (.platform_img.win/.mac/.linux), the in-library flag (.package_in_library_flag),
 *          bundle contents (.package_contents; a bundle's wrapper also carries data-ds-bundleid
 *          and data-ds-bundle-data, whose m_rgItems list each package's apps), and
 *          .game_purchase_action: price
 *          (.game_purchase_price, or .discount_pct / .discount_original_price /
 *          .discount_final_price) and buttons (a.btn_*steamui). Each row's buttons click
 *          Steam's own, so cart, gifting and bundle pages stay Steam's.
 *   dlc    #gameAreaDLCSection (inside #game_area_purchase): its h2 title with "Browse all
 *          (N)" (.note a), a.game_area_dlc_row per item (.game_area_dlc_name, a price or
 *          discount block in .game_area_dlc_price, data-ds-appid for the capsule art), and
 *          #dlc_purchase_action (total + "Add all DLC to Cart", clicked through).
 *   specs  .sysreq_contents .game_area_sys_req[data-os] (one per platform, tabs in
 *          .sysreq_tab[data-os]): minimum in .game_area_sys_req_leftCol (or _full), recommended
 *          in _rightCol, each a list of "<strong>Label:</strong> value" items.
 *
 * Bundles show their games as a set (art per game, owned ones dimmed, from the user's
 * /dynamicstore/userdata/); the bundle that completes a started set goes first with the one
 * green button. Editions and packages are slim rows with art.
 *
 * Nothing of Steam's moves: the page column (.leftcol) becomes a two-column grid
 * ([data-se-buy-grid]) that places the buy rows and DLC capsules on the left and the specs on
 * the right; everything else in the column spans both, below.
 */
const ROOT_FLAG = 'se-app-purchase-on';
const SOURCE = 'data-se-buy-source';
const GRID = 'data-se-buy-grid';
const CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';
/** Capsules shown before "Browse all": two rows of three. */
const DLC_SHOWN = 6;
const BUTTONS = '.game_purchase_action a[class*="btn_"][class*="steamui"]';
const PLATFORMS = { win: 'Windows', mac: 'macOS', linux: 'SteamOS + Linux' };

export default async (dom) => {
  const { el, squash, ready, scope, mark } = dom;
  await ready();

  const life = scope();
  const column = document.querySelector('.page_content > .leftcol.game_description_column');
  if (!column) return () => life.destroy();

  const text = (node) => squash(node?.textContent);
  /** Only the node's own text: a title without its "BUNDLE" label or "(?)" tooltip. */
  const ownText = (node) => squash([...(node?.childNodes ?? [])].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent).join(' '));
  /** Readable text with Steam's ownership flags (ON WISHLIST, IN LIBRARY...) left out. */
  const plainText = (node) => {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[class*="flag"], script, style').forEach((flag) => flag.remove());
    const parts = [];
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.textContent);
    return squash(parts.join(' ')).replace(/\s+([.,!?])/g, '$1');
  };
  /** The column's child holding `node` (Steam nests its sections a few wrappers deep). */
  const blockOf = (node) => {
    let box = node;
    while (box && box.parentElement !== column) box = box.parentElement;
    return box;
  };

  /* ---------- Store art and ownership ---------- */

  const pageApp = /\/app\/(\d+)/.exec(location.pathname)?.[1] ?? '';

  /** Store app details (name, real header URL), one request per app, remembered for the page. */
  const details = new Map();
  const appDetails = (appid) => {
    if (!details.has(appid)) {
      details.set(appid, fetch(`/api/appdetails?appids=${appid}&filters=basic`, { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => data?.[appid]?.data ?? null)
        .catch(() => null));
    }
    return details.get(appid);
  };

  /*
   * Header art: the CDN's plain header path first; newer apps keep theirs under a hashed
   * folder, so on a miss the app details give the real URL.
   */
  const headerArt = (appid, className) => {
    const art = el('img', { class: className, alt: '', loading: 'lazy' });
    if (!appid) {
      art.toggleAttribute('data-se-missing', true);
      return art;
    }
    art.addEventListener('error', async () => {
      const url = (await appDetails(appid))?.header_image ?? '';
      if (url && art.src !== url) art.src = url;
      else art.toggleAttribute('data-se-missing', true);
    });
    art.src = `${CDN}/${appid}/header.jpg`;
    return art;
  };

  /** Apps the signed-in user owns (empty when signed out): Steam's dynamic store data. */
  let ownedApps = new Set(Object.keys(window.GDynamicStore?.s_rgOwnedApps ?? {}));
  const ownedLoaded = fetch('/dynamicstore/userdata/', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const apps = data?.rgOwnedApps;
      if (Array.isArray(apps)) ownedApps = new Set(apps.map(String));
    })
    .catch(() => {});

  /* ---------- Buy rows and bundle cards ---------- */

  const purchase = () => document.getElementById('game_area_purchase');
  const boxes = () => [...(purchase()?.querySelectorAll('.game_area_purchase_game') ?? [])].filter((box) => box.querySelector('.game_purchase_action'));
  const wrapperOf = (box) => box.closest('.game_area_purchase_game_wrapper') ?? box;
  /** A bundle's own page link ("Bundle info"): shown as a text link, not a button. */
  const isInfo = (link) => Boolean(link.closest('.btn_packageinfo')) || /\/(?:bundle|sub)\/\d+/.test(link.getAttribute('href') ?? '');

  /** Item names from "Includes N items: A, B, C" (the label is whatever precedes the colon). */
  const contentNames = (node) => {
    const line = plainText(node);
    const list = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    return list.split(/,\s+/).map(squash).filter(Boolean);
  };

  /**
   * A bundle's items, one per package: Steam's bundle data lists each package's apps; without
   * it, one item per app in the wrapper's data-ds-appid. Names come from the contents line when
   * its count matches (names with commas would not), else from the app details later.
   */
  const bundleItems = (wrapper, box) => {
    let data = null;
    try {
      data = JSON.parse(wrapper.dataset.dsBundleData ?? 'null');
    } catch {
      data = null;
    }
    const groups = (Array.isArray(data?.m_rgItems)
      ? data.m_rgItems.map((item) => (item.m_rgIncludedAppIDs ?? []).map(String))
      : (wrapper.dataset.dsAppid ?? '').split(',').filter(Boolean).map((appid) => [appid])
    ).filter((apps) => apps.length);
    const names = contentNames(box.querySelector('.package_contents'));
    return groups.map((apps, index) => ({
      appid: apps[0],
      name: names.length === groups.length ? names[index] : '',
      owned: apps.every((appid) => ownedApps.has(appid)),
    }));
  };

  const readBox = (box) => {
    const wrapper = wrapperOf(box);
    const title = box.querySelector('h1, h2, .title');
    const heading = ownText(title) || text(title);
    const action = box.querySelector('.game_purchase_action');
    const owned = wrapper.querySelector('.package_in_library_flag');
    const platforms = [...box.querySelectorAll('.game_area_purchase_platform .platform_img')]
      .map((icon) => Object.keys(PLATFORMS).find((os) => icon.classList.contains(os)))
      .filter(Boolean)
      .map((os) => PLATFORMS[os]);
    const links = [...action.querySelectorAll(BUTTONS)];
    const info = links.find(isInfo);
    const items = wrapper.hasAttribute('data-ds-bundleid') ? bundleItems(wrapper, box) : [];
    return {
      // English titles read "Buy <name>"; other languages keep Steam's wording.
      name: heading.replace(/^(?:Buy|Pre-Purchase|Pre-purchase)\s+/, '') || heading,
      note: items.length > 1 ? '' : plainText(box.querySelector('.package_contents')) || platforms.join(' · '),
      owned: owned ? text(owned) || 'In library' : '',
      art: (wrapper.dataset.dsAppid ?? '').split(',')[0] || pageApp,
      pct: text(action.querySelector('.discount_pct')),
      was: text(action.querySelector('.discount_original_price')),
      now: text(action.querySelector('.discount_final_price')) || text(action.querySelector('.game_purchase_price')),
      info: info ? { href: info.href, label: text(info) } : null,
      // `index` is the button's place among Steam's, for clicking it through.
      buttons: links.map((link, index) => ({
        index,
        label: text(link),
        primary: link.matches('.btn_green_steamui') || Boolean(link.closest('.btn_addtocart')),
      })).filter((button, index) => button.label && links[index] !== info),
      items: items.length > 1 ? items : [],
    };
  };

  /** Click Steam's own button: re-found at click time, since Steam can re-render the box. */
  const clickSteam = (boxIndex, buttonIndex) => boxes()[boxIndex]?.querySelectorAll(BUTTONS)[buttonIndex]?.click();

  const buyRows = el('div', { class: 'se-app-purchase__rows' });
  const buy = el('section', { class: 'se-app-purchase', 'aria-labelledby': 'se-app-purchase-title', hidden: true }, [
    el('h2', { class: 'se-app-purchase__title', id: 'se-app-purchase-title', text: 'Buy' }),
    buyRows,
  ]);

  const priceBlock = (row) =>
    el('span', { class: 'se-app-purchase__price' }, [
      row.pct || row.was
        ? el('span', { class: 'se-app-purchase__deal' }, [
          row.pct ? el('span', { class: 'se-app-purchase__pct', text: row.pct }) : null,
          row.was ? el('s', { class: 'se-app-purchase__was', text: row.was }) : null,
        ])
        : null,
      row.now ? el('span', { class: 'se-app-purchase__now', text: row.now }) : null,
    ]);

  /** The row's buttons; only the lead row's cart button is green. */
  const actions = (row, boxIndex, lead) => {
    const primary = lead ? Math.max(0, row.buttons.findIndex((button) => button.primary)) : -1;
    return el('span', { class: 'se-app-purchase__actions' }, row.buttons.map((button, place) => {
      const node = el('button', {
        class: 'se-app-purchase__button',
        type: 'button',
        text: button.label,
        'data-se-primary': place === primary ? '' : undefined,
      });
      node.addEventListener('click', () => clickSteam(boxIndex, button.index));
      return node;
    }));
  };

  /** Edition or package: slim row with art. */
  const buildRow = (row, boxIndex, lead) =>
    el('div', { class: 'se-app-purchase__row', 'data-se-owned': row.owned ? '' : undefined }, [
      el('span', { class: 'se-app-purchase__frame' }, [headerArt(row.art, 'se-app-purchase__art')]),
      el('span', { class: 'se-app-purchase__info' }, [
        el('span', { class: 'se-app-purchase__name', text: row.name }),
        row.note || row.owned
          ? el('span', { class: 'se-app-purchase__note', text: [row.owned, row.note].filter(Boolean).join(' · '), title: row.note || undefined })
          : null,
      ]),
      row.pct ? el('span', { class: 'se-app-purchase__pct', text: row.pct }) : null,
      el('span', { class: 'se-app-purchase__price' }, [
        row.was ? el('s', { class: 'se-app-purchase__was', text: row.was }) : null,
        row.now ? el('span', { class: 'se-app-purchase__now', text: row.now }) : null,
      ]),
      actions(row, boxIndex, lead),
    ]);

  /** Items shown in a bundle's set before a "+N more" tile. */
  const SET_SHOWN = 10;

  const setItem = (item) => {
    const name = el('span', { class: 'se-app-purchase__set-name', text: item.name });
    if (!item.name) appDetails(item.appid).then((data) => { name.textContent = data?.name ?? ''; });
    return el('a', { class: 'se-app-purchase__set-item', href: `/app/${item.appid}/`, 'data-se-owned': item.owned ? '' : undefined }, [
      el('span', { class: 'se-app-purchase__set-bar', 'aria-hidden': 'true' }),
      el('span', { class: 'se-app-purchase__set-frame' }, [headerArt(item.appid, 'se-app-purchase__set-art')]),
      name,
      el('span', { class: 'se-app-purchase__set-state', text: item.owned ? 'Owned' : 'In this purchase' }),
    ]);
  };

  /** Progress line: how much of the set is already owned. */
  const progress = (have, total) => {
    if (!have) return '';
    if (have === total) return `You own all ${total}.`;
    const left = total - have;
    return `You have ${have} of ${total}. ${left === 1 ? 'One more finishes it.' : `${left} more finish it.`}`;
  };

  /** Bundle: its games as a set, each a segment of the owned bar with its art under it. */
  const buildBundle = (row, boxIndex, lead) => {
    const total = row.items.length;
    const have = row.items.filter((item) => item.owned).length;
    const line = progress(have, total);
    const more = total - SET_SHOWN;
    const shown = row.items.slice(0, more > 0 ? SET_SHOWN - 1 : SET_SHOWN).map(setItem);
    if (more > 0) {
      const rest = total - shown.length;
      shown.push(row.info
        ? el('a', { class: 'se-app-purchase__set-more', href: row.info.href, text: `+${rest} more` })
        : el('span', { class: 'se-app-purchase__set-more', text: `+${rest} more` }));
    }
    return el('article', { class: 'se-app-purchase__bundle', 'data-se-featured': lead && have ? '' : undefined, 'data-se-owned': row.owned ? '' : undefined }, [
      el('div', { class: 'se-app-purchase__bundle-head' }, [
        el('span', { class: 'se-app-purchase__info' }, [
          el('span', { class: 'se-app-purchase__kicker', text: have && have < total ? 'Complete the set' : `Bundle · ${total} items` }),
          el('span', { class: 'se-app-purchase__name', text: row.name }),
          line || row.info || row.owned
            ? el('span', { class: 'se-app-purchase__note' }, [
              [row.owned, line].filter(Boolean).join(' · '),
              row.info ? el('a', { class: 'se-app-purchase__link', href: row.info.href, text: row.info.label }) : null,
            ])
            : null,
        ]),
        priceBlock(row),
        actions(row, boxIndex, lead),
      ]),
      el('div', { class: 'se-app-purchase__set' }, shown),
    ]);
  };

  /*
   * One green button: on the bundle that completes a set the user has started (it is also
   * moved to the top), else on the first box not already owned.
   */
  const leadOf = (rows) => {
    const started = rows.findIndex((row) => !row.owned && row.items.some((item) => item.owned) && row.items.some((item) => !item.owned));
    return started >= 0 ? started : rows.findIndex((row) => !row.owned);
  };

  let buyKey = '';
  const syncBuy = () => {
    const rows = boxes().map(readBox);
    const key = JSON.stringify(rows);
    if (key === buyKey) return rows.length;
    buyKey = key;
    const lead = leadOf(rows);
    const built = rows.map((row, index) => (row.items.length ? buildBundle : buildRow)(row, index, index === lead));
    if (lead > 0 && rows[lead].items.length) built.unshift(...built.splice(lead, 1));
    buyRows.replaceChildren(...built);
    buy.hidden = !rows.length;
    return rows.length;
  };

  /* ---------- DLC capsules ---------- */

  const readDlc = () => {
    const section = document.getElementById('gameAreaDLCSection');
    if (!section) return null;
    const heading = section.querySelector('h2');
    const browse = heading?.querySelector('.note a');
    const all = section.querySelector('#dlc_purchase_action');
    const items = [...section.querySelectorAll('a.game_area_dlc_row')].map((row) => ({
      href: row.href,
      appid: row.dataset.dsAppid ?? /^dlc_row_(\d+)$/.exec(row.id)?.[1] ?? '',
      name: text(row.querySelector('.game_area_dlc_name')),
      pct: text(row.querySelector('.discount_pct')),
      was: text(row.querySelector('.discount_original_price')),
      now: text(row.querySelector('.discount_final_price')) || text(row.querySelector('.game_area_dlc_price')),
    })).filter((item) => item.name);
    if (!items.length) return null;
    return {
      // The heading's own text, without its "Browse all (N)" link.
      title: squash([...(heading?.childNodes ?? [])].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ')),
      browse: browse ? { href: browse.href, label: text(browse) } : null,
      total: text(all?.querySelector('.discount_final_price')) || text(all?.querySelector('.game_purchase_price')),
      addAll: text(all?.querySelector('.btn_addtocart a')),
      items,
    };
  };

  const dlcTitle = el('h2', { class: 'se-app-dlc__title', id: 'se-app-dlc-title' });
  const dlcTools = el('div', { class: 'se-app-dlc__tools' });
  const dlcGrid = el('div', { class: 'se-app-dlc__grid' });
  const dlc = el('section', { class: 'se-app-dlc', 'aria-labelledby': 'se-app-dlc-title', hidden: true }, [
    el('div', { class: 'se-app-dlc__head' }, [dlcTitle, dlcTools]),
    dlcGrid,
  ]);

  const capsule = (item) => {
    const art = headerArt(item.appid, 'se-app-dlc__art');
    const free = !item.was && !/\d/.test(item.now);
    return el('a', { class: 'se-app-dlc__item', href: item.href }, [
      el('span', { class: 'se-app-dlc__frame' }, [art]),
      el('span', { class: 'se-app-dlc__meta' }, [
        el('span', { class: 'se-app-dlc__name', text: item.name }),
        el('span', { class: 'se-app-dlc__price', 'data-se-free': free ? '' : undefined }, [
          item.pct ? el('span', { class: 'se-app-dlc__pct', text: item.pct }) : null,
          el('span', { text: item.now }),
        ]),
      ]),
    ]);
  };

  let dlcKey = '';
  const syncDlc = () => {
    const data = readDlc();
    const key = JSON.stringify(data);
    if (key === dlcKey) return Boolean(data);
    dlcKey = key;
    dlc.hidden = !data;
    if (!data) return false;
    dlcTitle.textContent = data.title || 'Content for this game';
    const tools = [];
    if (data.browse) tools.push(el('a', { class: 'se-app-dlc__browse', href: data.browse.href, text: data.browse.label }));
    if (data.addAll) {
      const addAll = el('button', { class: 'se-app-dlc__all', type: 'button', text: [data.addAll, data.total].filter(Boolean).join(' · ') });
      addAll.addEventListener('click', () => document.querySelector('#dlc_purchase_action .btn_addtocart a')?.click());
      tools.push(addAll);
    }
    dlcTools.replaceChildren(...tools);
    dlcGrid.replaceChildren(...data.items.slice(0, DLC_SHOWN).map(capsule));
    return true;
  };

  /* ---------- System requirements ---------- */

  const readSpecs = () =>
    [...document.querySelectorAll('.sysreq_contents .game_area_sys_req')].map((block) => {
      const os = block.dataset.os ?? '';
      const items = (selector) =>
        [...block.querySelectorAll(`${selector} li`)].map((item) => {
          const label = text(item.querySelector('strong'));
          return label
            ? { key: label.replace(/:\s*$/, ''), value: squash(text(item).slice(label.length)) }
            : { key: '', value: text(item) };
        }).filter((item) => item.value);
      const left = block.querySelector('.game_area_sys_req_leftCol') ? '.game_area_sys_req_leftCol' : '.game_area_sys_req_full';
      const heading = (selector) => text(block.querySelector(`${selector} > ul > strong, ${selector} > strong`)).replace(/:\s*$/, '');
      return {
        os,
        label: text(document.querySelector(`.sysreq_tab[data-os="${os}"]`)) || PLATFORMS[os] || os,
        minLabel: heading(left),
        recLabel: heading('.game_area_sys_req_rightCol') || 'Recommended',
        min: items(left),
        rec: items('.game_area_sys_req_rightCol'),
      };
    }).filter((platform) => platform.min.length || platform.rec.length);

  /**
   * One row per part, in the minimum list's order: the minimum value, then the recommended one
   * under it when it differs. Lines without a label ("Requires a 64-bit processor...") and
   * long notes go to the foot.
   */
  const specRows = (platform) => {
    const rec = new Map(platform.rec.filter((item) => item.key).map((item) => [item.key, item.value]));
    const keys = [...new Set([...platform.min, ...platform.rec].filter((item) => item.key).map((item) => item.key))];
    const sentence = (value) => value.replace(/[.\s]+$/, '');
    const notes = [...new Set([...platform.min, ...platform.rec].filter((item) => !item.key || item.value.length > 120).map((item) => sentence(item.value)))]
      .map((note) => `${note}.`);
    const rows = keys
      .map((key) => ({ key, min: platform.min.find((item) => item.key === key)?.value ?? '', rec: rec.get(key) ?? '' }))
      .filter((row) => (row.min || row.rec).length <= 120);
    return { rows, notes };
  };

  const specsTitle = () => text(document.querySelector('.sys_req h2')) || 'System requirements';
  const specsSwitch = el('div', { class: 'se-app-specs__switch', role: 'tablist', 'aria-label': 'Platform' });
  const specsBody = el('div', { class: 'se-app-specs__body' });
  const specsHeading = el('h2', { class: 'se-app-specs__title', id: 'se-app-specs-title' });
  const specs = el('aside', { class: 'se-app-specs', 'aria-labelledby': 'se-app-specs-title', hidden: true }, [specsHeading, specsSwitch, specsBody]);

  let platforms = [];
  let currentOs = '';

  const setTitle = () => {
    const title = specsTitle();
    if (specsHeading.textContent !== title) specsHeading.textContent = title;
  };

  const renderSpecs = () => {
    const platform = platforms.find((item) => item.os === currentOs) ?? platforms[0];
    if (!platform) return;
    currentOs = platform.os;
    for (const tab of specsSwitch.children) tab.setAttribute('aria-selected', String(tab.dataset.os === currentOs));

    const { rows, notes } = specRows(platform);
    specsBody.replaceChildren(
      ...rows.map((row) =>
        el('div', { class: 'se-app-specs__row' }, [
          el('span', { class: 'se-app-specs__key', text: row.key }),
          row.min ? el('span', { class: 'se-app-specs__min', text: row.min }) : null,
          row.rec && row.rec !== row.min
            ? el('span', { class: 'se-app-specs__rec' }, [el('span', { class: 'se-app-specs__rec-label', text: platform.recLabel }), ` ${row.rec}`])
            : null,
        ]),
      ),
      notes.length ? el('p', { class: 'se-app-specs__notes', text: notes.join(' ') }) : null,
    );
  };

  let specsKey = '';
  const syncSpecs = () => {
    platforms = readSpecs();
    const key = JSON.stringify(platforms);
    if (key === specsKey) return platforms.length;
    specsKey = key;
    setTitle();
    specsSwitch.replaceChildren(...(platforms.length > 1 ? platforms : []).map((platform) => {
      const tab = el('button', { class: 'se-app-specs__tab', type: 'button', role: 'tab', text: platform.label, 'data-os': platform.os });
      tab.addEventListener('click', () => {
        currentOs = platform.os;
        renderSpecs();
      });
      return tab;
    }));
    specsSwitch.hidden = platforms.length < 2;
    renderSpecs();
    specs.hidden = !platforms.length;
    return platforms.length;
  };

  /* ---------- Layout ---------- */

  column.prepend(specs);
  column.prepend(dlc);
  column.prepend(buy);
  mark(column, GRID);
  document.documentElement.classList.add(ROOT_FLAG);

  /** Steam's purchase area (boxes and DLC) and requirements go while ours show them. */
  const syncSources = (shownBuy, shownSpecs) => {
    const area = purchase();
    const sysreq = document.querySelector('.sysreq_contents');
    const sources = [shownBuy && area ? blockOf(area) : null, shownSpecs && sysreq ? blockOf(sysreq) : null].filter(Boolean);
    for (const node of column.querySelectorAll(`[${SOURCE}]`)) if (!sources.includes(node)) node.removeAttribute(SOURCE);
    sources.forEach((node) => mark(node, SOURCE));
  };

  const sync = () => {
    const rows = syncBuy();
    const hasDlc = syncDlc();
    const hasSpecs = syncSpecs() > 0;
    // The purchase area holds both the boxes and the DLC: hidden once everything in it shows here.
    const dlcInArea = Boolean(purchase()?.querySelector('#gameAreaDLCSection'));
    syncSources(rows > 0 && (hasDlc || !dlcInArea), hasSpecs);
  };
  sync();
  life.observe(sync);
  let alive = true;
  ownedLoaded.then(() => alive && sync());

  return () => {
    alive = false;
    life.destroy();
    buy.remove();
    dlc.remove();
    specs.remove();
    column.removeAttribute(GRID);
    document.querySelectorAll(`[${SOURCE}]`).forEach((node) => node.removeAttribute(SOURCE));
    document.documentElement.classList.remove(ROOT_FLAG);
  };
};
