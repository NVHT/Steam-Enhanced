/*
 * Individual Collection and All Collections views.
 *
 * Augments Steam's collection headers with blurred cover artwork, aggregate library
 * stats, and a Grid / List view toggle. In Grid mode, appends metadata strips and
 * installation/friend badges to native cover cards; in List mode, renders a sortable
 * table alongside the hidden native grid.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, run, isInstalled, navigate, findDown, coverURLs } = SE;
  /* A grid's games are re-read at most this often (friends playing, install state) */
  const GAMES_TTL = 3500;
  window.__steamEnhancedCollections?.destroy();

  const PAGE = C.OuterContainer_Container;
  const HEADER = C.OuterContainer_Header;
  const GRIDCTL = C.GridWithControls;
  const ALL = C.ScrollContainer;
  const ALLHEADER = C.ScrollContainer_Header;
  const TILE = C.Collection;
  const NEWTILE = C.NewCollection;
  const BOX = C.LibraryItemBox;
  const SUBSCRIPT = C.LibraryItemBoxSubscript;
  const MC = {
    [C.MCGreen]: 'good',
    [C.MCOrange]: 'mixed',
    [C.MCRed]: 'bad',
  };
  const INCOLL = C.InCollection;

  const COPY = {
    collection: 'Collection',
    dynamic: 'Dynamic collection',
    library: 'Library',
    games: 'Games',
    installed: 'Installed',
    hours: 'Hours',
    friends: 'Friends playing',
    collections: 'Collections',
    name: 'Name',
    lastPlayed: 'Last played',
    size: 'Size',
    coll: 'Collection',
    play: 'Play',
    install: 'Install',
    open: 'Open',
    newColl: 'New collection',
    filter: 'Filter',
    notInstalled: 'Not installed',
    friendsSub: (n) => `${n} friend${n === 1 ? '' : 's'} playing`,
    gamesSub: (n) => `${n} game${n === 1 ? '' : 's'}`,
    today: 'Today',
    yesterday: 'Yesterday',
    az: 'A–Z',
    bySize: 'Size',
    recent: 'Recent',
    grid: 'Grid',
    list: 'List',
    none: 'Nothing here yet',
    min: 'min',
    sAch: 'Achievements',
    sRelease: 'Released',
    sAdded: 'Added',
    sMeta: 'Metacritic',
    sFriends: 'Friends',
  };

  const collectionStore = () => SE.global('collectionStore');

  /*
   * The grid's games, read from its props. The fiber search is cheap next to reading every
   * game, so the games are cached per childSections array (Steam replaces it on change) and
   * refreshed after GAMES_TTL for the live values (friends playing, achievements).
   */
  const gamesCache = new WeakMap();

  function gridGames(page) {
    const ctl = page.querySelector(`.${GRIDCTL}`);
    if (!ctl) return null;
    const p = findDown(ctl, (q) => Array.isArray(q.childSections), 4000);
    if (p) {
      const cached = gamesCache.get(p.childSections);
      if (cached && cached.sort === p.eSortBy && performance.now() - cached.at < GAMES_TTL) return cached;
      const grid = {
        at: performance.now(),
        sort: p.eSortBy,
        games: p.childSections.flatMap((sec) =>
          (sec.children || [])
            .filter((c) => c?.m_overview)
            .map((c) => ({
              app: c.m_overview,
              section: sec.subSectionName || '',
              friends: run(() => c.GetFriendsPlaying()) || 0,
              ach: run(() => c.GetAchievementPercentage()),
            }))
        ),
      };
      grid.sig = signature(grid.sort, grid.games);
      gamesCache.set(p.childSections, grid);
      return grid;
    }
    const up = SE.fromProps(ctl, 12, (q) => (Array.isArray(q.appOverviews) ? q.appOverviews : null));
    return up ? { sort: 0, games: up.map((app) => ({ app, friends: 0, section: '' })) } : null;
  }

  /* Steam's eSortBy values that get a column of their own in the list */
  const SORT = {
    achievements: 2,
    release: 6,
    added: 7,
    metacritic: 9,
    friends: 10,
  };

  const signature = (sort, games) =>
    `${sort}|` +
    games
      .map(
        (g) =>
          `${g.app.appid}:${g.section}:${isInstalled(g.app) ? 1 : 0}:${g.app.minutes_playtime_forever || 0}:${g.app.rt_last_time_played || 0}:${g.friends}:${g.ach}`
      )
      .join(',');

  const fullDate = (t) =>
    t
      ? new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

  const mcClass = (n) => (n >= 70 ? 'good' : n >= 50 ? 'mixed' : 'bad');

  function sortCell(sort, g) {
    const a = g.app;
    switch (sort) {
      case SORT.achievements:
        return g.ach == null || g.ach < 0 ? '—' : `${g.ach}%`;
      case SORT.release:
        return fullDate(
          run(() => a.GetCanonicalReleaseDate()) || a.rt_original_release_date || a.rt_steam_release_date
        );
      case SORT.added:
        return fullDate(a.rt_purchased_time);
      case SORT.metacritic: {
        if (!a.metacritic_score) return '—';
        const pill = el('span', 'se-cl-mc', String(a.metacritic_score));
        pill.dataset.mc = mcClass(a.metacritic_score);
        return pill;
      }
      case SORT.friends:
        return g.friends ? num(g.friends) : '—';
      default:
        return null;
    }
  }

  function collectionOf(page) {
    const id = SE.fromProps(page, 12, (q) => (typeof q.strCollectionId === 'string' ? q.strCollectionId : null));
    const store = id && collectionStore();
    return { id, coll: store ? run(() => store.GetCollection(id)) : null };
  }

  function userCollections() {
    const list = run(() => collectionStore().userCollections) || [];
    return list.filter((c) => c && c.id !== 'uncategorized' && (c.bIsEditable || (c.visibleApps || []).length));
  }

  /*
   * Covers try a local copy first, then the CDN. Until one has loaded the image is marked
   * data-se-art-wait and drawn as nothing (core/images.css), so neither a failed copy nor
   * the wait for the next one shows the browser's broken-image icon.
   */
  function coverImg(app, cls) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.setAttribute('data-se-art-wait', '');
    img.addEventListener('load', () => img.removeAttribute('data-se-art-wait'));
    const urls = coverURLs(app);
    let i = 0;
    img.onerror = () => {
      if (i < urls.length) {
        img.src = urls[i++];
      } else {
        img.onerror = null;
        img.style.visibility = 'hidden';
      }
    };
    img.src = urls[i++];
    return img;
  }

  const isApp = (v) => v && typeof v === 'object' && typeof v.appid === 'number' && 'display_name' in v;

  const appOf = (box) =>
    SE.fromProps(box, 16, (q) => {
      for (const k of ['app', 'overview', 'appOverview']) {
        if (isApp(q[k])) return q[k];
      }
      for (const v of Object.values(q)) {
        if (isApp(v)) return v;
      }
      return null;
    });

  const mostPlayed = (apps, n) =>
    apps
      .slice()
      .sort((a, b) => (b.minutes_playtime_forever || 0) - (a.minutes_playtime_forever || 0))
      .slice(0, n);

  const num = (n) => Number(n || 0).toLocaleString();
  const hoursOf = (app) => Math.round((app.minutes_playtime_forever || 0) / 60);

  function hoursText(app) {
    const m = app.minutes_playtime_forever || 0;
    if (m === 0) return '—';
    if (m < 60) return `${m} ${COPY.min}`;
    return `${num(hoursOf(app))} h`;
  }

  function dateText(t) {
    if (!t) return '—';
    const d = new Date(t * 1000);
    const now = new Date();
    const day = (x) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()) / 864e5);
    const diff = day(now) - day(d);
    if (diff === 0) return COPY.today;
    if (diff === 1) return COPY.yesterday;
    return d.toLocaleDateString(
      undefined,
      d.getFullYear() === now.getFullYear()
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' }
    );
  }

  function sizeText(app) {
    const b = Number(app.size_on_disk || 0);
    if (!b) return '—';
    if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    return `${Math.max(1, Math.round(b / 1e6))} MB`;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setText(e, t) {
    if (e && e.textContent !== t) e.textContent = t;
  }

  function own(parent, cls, make, before) {
    let e = parent.querySelector(`:scope > .${cls}`);
    if (!e) {
      e = make();
      if (before) parent.insertBefore(e, before);
      else parent.appendChild(e);
    }
    return e;
  }

  const viewKey = (kind) => `se-view-${kind}`;
  /* View forced for a moment (New collection needs the grid's tile), by kind */
  const forcedView = new Map();

  function getView(kind) {
    if (forcedView.has(kind)) return forcedView.get(kind);
    try {
      return localStorage.getItem(viewKey(kind)) === 'list' ? 'list' : 'grid';
    } catch (_) {
      return 'grid';
    }
  }

  function setView(kind, v) {
    try {
      localStorage.setItem(viewKey(kind), v);
    } catch (_) {}
    schedule();
  }

  const ICONS = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" fill-opacity=".32"/><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    stack: '<rect x="6" y="3" width="12" height="15" rx="2" fill="currentColor" fill-opacity=".32"/><rect x="6" y="3" width="12" height="15" rx="2"/><path d="M4 7v11a3 3 0 0 0 3 3h9"/>',
    dynamic: '<path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor" fill-opacity=".32"/><path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    grid: '<g fill="currentColor" fill-opacity=".32" stroke="none"><rect x="4" y="4" width="7" height="7" rx="1.5"/></g><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
    dl: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".32" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M12 7v7M8.5 11l3.5 3.5 3.5-3.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  };

  const icon = (name, size = 16) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  function banner(header, kind, { eyebrow, iconName, stats, artApps }) {
    SE.mark(header, 'data-se-cbanner', kind);
    const art = own(header, 'se-cb-art', () => el('div', 'se-cb-art'), header.firstChild);
    const artKey = artApps.map((a) => a.appid).join(',');
    if (art.dataset.key !== artKey) {
      art.dataset.key = artKey;
      art.textContent = '';
      const blur = el('div', 'se-cb-blur');
      for (const app of artApps) blur.appendChild(coverImg(app, 'se-cb-blurimg'));
      art.appendChild(blur);
    }

    const tile = own(header, 'se-cb-icon', () => el('div', 'se-cb-icon'));
    if (tile.dataset.icon !== iconName) {
      tile.dataset.icon = iconName;
      tile.innerHTML = icon(iconName, 40);
    }

    setText(own(header, 'se-cb-eyebrow', () => el('div', 'se-cb-eyebrow')), eyebrow);

    const box = own(header, 'se-cb-stats', () => el('div', 'se-cb-stats'));
    const key = JSON.stringify(stats);
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.textContent = '';
      for (const [label, value] of stats) {
        const s = el('div', 'se-cb-stat');
        s.append(el('span', 'se-cb-value', value), el('span', 'se-cb-label', label));
        box.appendChild(s);
      }
    }
    return own(header, 'se-cb-ctrl', () => el('div', 'se-cb-ctrl'));
  }

  function viewSwitch(ctrl, kind) {
    const seg = own(ctrl, 'se-cb-view', () => {
      const s = el('div', 'se-seg se-cb-view');
      s.setAttribute('role', 'radiogroup');
      for (const v of ['grid', 'list']) {
        const b = el('button', 'se-seg-btn');
        b.type = 'button';
        b.dataset.view = v;
        b.innerHTML = icon(v);
        b.setAttribute('role', 'radio');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          setView(kind, v);
        });
        s.appendChild(b);
      }
      return s;
    });

    const now = getView(kind);
    for (const b of seg.children) {
      SE.mark(b, 'aria-checked', String(b.dataset.view === now));
      SE.mark(b, 'title', COPY[b.dataset.view]);
      SE.mark(b, 'aria-label', COPY[b.dataset.view]);
    }
    return seg;
  }

  function table(anchor, kind, cols, rows, sig) {
    let list = anchor.parentElement.querySelector(`:scope > .se-clist[data-kind="${kind}"]`);
    if (!list) {
      list = el('div', 'se-clist');
      list.dataset.kind = kind;
      list.addEventListener('click', onListClick);
      list.addEventListener('keydown', onListKey);
      anchor.insertAdjacentElement('afterend', list);
    } else if (list.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', list);
    }
    if (list.dataset.sig === sig) return list;
    list.dataset.sig = sig;
    list.textContent = '';

    const head = el('div', 'se-clist-head');
    for (const [cls, label] of cols) head.appendChild(el('div', `se-cl-${cls}`, label));
    list.appendChild(head);

    if (!rows.length) list.appendChild(el('div', 'se-clist-empty', COPY.none));
    for (const r of rows) {
      r.tabIndex = 0;
      r.setAttribute('role', 'button');
      list.appendChild(r);
    }
    return list;
  }

  function cell(cls, child) {
    const c = el('div', `se-cl-${cls}`);
    if (typeof child === 'string') c.textContent = child;
    else if (child) c.appendChild(child);
    return c;
  }

  function nameCell(name, sub, subCls) {
    const c = el('div', 'se-cl-main');
    c.append(el('div', 'se-cl-name', name), el('div', `se-cl-sub${subCls ? ` ${subCls}` : ''}`, sub));
    return c;
  }

  function button(cls, iconName, label, data) {
    const b = el('button', `se-cl-btn ${cls}`);
    b.type = 'button';
    b.innerHTML = `${iconName ? icon(iconName, 14) : ''}<span></span>`;
    b.lastChild.textContent = label;
    Object.assign(b.dataset, data);
    if (iconName === 'chev') b.appendChild(b.firstChild);
    return b;
  }

  /* Rows act like buttons: Enter or Space on the row itself opens it (its buttons handle their own) */
  function onListKey(e) {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.classList.contains('se-clist-row')) return;
    e.preventDefault();
    onListClick(e);
  }

  function onListClick(e) {
    const btn = e.target.closest('.se-cl-btn');
    const row = e.target.closest('.se-clist-row');
    if (!row) return;
    e.stopPropagation();
    const w = window.SteamClient;
    if (btn?.dataset.act === 'play') {
      run(() => w.Apps.RunGame(btn.dataset.gameid, '', -1, 100));
      return;
    }
    if (btn?.dataset.act === 'install') {
      run(() => w.URL.ExecuteSteamURL(`steam://install/${btn.dataset.appid}`));
      return;
    }
    if (row.dataset.app) navigate(`/library/app/${row.dataset.app}`);
    else if (row.dataset.coll) navigate(`/library/collection/${encodeURIComponent(row.dataset.coll)}`);
  }

  /* The theme's controls width, for Steam's sort bar beside it; measured after layout, never in update() */
  const ctrlWidths = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      SE.cssVar(target.closest(`.${PAGE}`), '--se-cb-ctrl-w', `${Math.round(contentRect.width)}px`);
    }
  });
  const observedCtrls = new Set();

  function observeCtrlWidth(ctrl) {
    if (observedCtrls.has(ctrl)) return;
    for (const old of observedCtrls) {
      if (!old.isConnected) {
        ctrlWidths.unobserve(old);
        observedCtrls.delete(old);
      }
    }
    observedCtrls.add(ctrl);
    ctrlWidths.observe(ctrl);
  }

  function decorateCollectionCards(page, games) {
    const friendsOf = new Map(games.map((g) => [g.app.appid, g.friends]));
    for (const box of page.querySelectorAll(`.${BOX}.${INCOLL}`)) {
      const app = appOf(box);
      if (!app) continue;
      const strip = own(box, 'se-cc-strip', () => {
        const s = el('div', 'se-cc-strip');
        s.append(el('span', 'se-cc-name'), el('span', 'se-cc-hours'));
        return s;
      });
      setText(strip.firstChild, app.display_name || '');
      const note = [...box.parentElement.children].find((e) => e.classList.contains(SUBSCRIPT));
      const noteText = note?.textContent.trim() || '';
      setText(strip.lastChild, noteText || hoursText(app));
      const mc = note && [...note.classList].map((c) => MC[c]).find(Boolean);
      SE.attr(strip.lastChild, 'data-mc', mc || null);
      if (noteText) SE.mark(box, 'data-se-note');
      else SE.unmark(box, 'data-se-note');

      const inst = isInstalled(app);
      const fr = friendsOf.get(app.appid) || 0;
      const badges = own(box, 'se-cc-badges', () => el('div', 'se-cc-badges'));
      const key = `${inst}|${fr}`;
      if (badges.dataset.key !== key) {
        badges.dataset.key = key;
        badges.textContent = '';
        if (!inst) badges.appendChild(el('span', 'se-cc-chip', COPY.notInstalled));
        if (fr) {
          const d = el('span', 'se-friends-pill');
          d.append(el('i'), el('b', '', num(fr)));
          d.title = COPY.friendsSub(fr);
          badges.appendChild(d);
        }
      }
    }
  }

  function updateCollection(page) {
    const header = page.querySelector(`:scope > .${HEADER}`);
    if (!header) return;
    const { id, coll } = collectionOf(page);
    const grid = gridGames(page);
    const games = grid?.games || (coll?.visibleApps || []).map((app) => ({ app, friends: 0, section: '' }));
    const sort = grid?.sort || 0;
    const apps = games.map((g) => g.app);
    const view = getView('collection');

    SE.mark(page, 'data-se-cpage', 'collection');
    SE.mark(page, 'data-se-view', view);

    const friends = games.reduce((n, g) => n + (g.friends || 0), 0);
    const stats = [
      [COPY.games, num(apps.length)],
      [COPY.installed, num(apps.filter(isInstalled).length)],
      [COPY.hours, num(Math.round(apps.reduce((n, a) => n + (a.minutes_playtime_forever || 0), 0) / 60))],
    ];
    if (friends) stats.push([COPY.friends, num(friends)]);

    const ctrl = banner(header, 'collection', {
      eyebrow: coll?.bIsDynamic ? COPY.dynamic : COPY.collection,
      iconName: id === 'favorite' ? 'heart' : coll?.bIsDynamic ? 'dynamic' : 'stack',
      stats,
      artApps: mostPlayed(apps, 1),
    });
    viewSwitch(ctrl, 'collection');
    observeCtrlWidth(ctrl);

    /* The cards are hidden in List view */
    if (view !== 'list') decorateCollectionCards(page, games);

    const ctl = page.querySelector(`.${GRIDCTL}`);
    if (!ctl) return;
    const existing = page.querySelector(':scope > .se-clist');
    if (view !== 'list') {
      existing?.remove();
      return;
    }

    const extra =
      sortCell(sort, games[0] || { app: {} }) !== null && games.length
        ? {
            [SORT.achievements]: COPY.sAch,
            [SORT.release]: COPY.sRelease,
            [SORT.added]: COPY.sAdded,
            [SORT.metacritic]: COPY.sMeta,
            [SORT.friends]: COPY.sFriends,
          }[sort]
        : null;

    const sig = grid?.sig || signature(sort, games);

    if (existing && existing.dataset.sig === sig && existing.previousElementSibling === ctl) return;

    const rows = [];
    let lastSection = null;
    for (const g of games) {
      if (g.section && g.section !== lastSection) {
        rows.push(el('div', 'se-clist-group', g.section));
      }
      lastSection = g.section;
      const { app, friends: fr } = g;
      const inst = isInstalled(app);
      const r = el('div', 'se-clist-row');
      r.dataset.app = app.appid;
      SE.mark(r, 'data-installed', String(inst));
      const sub = fr ? COPY.friendsSub(fr) : inst ? COPY.installed : COPY.notInstalled;
      r.append(
        cell('thumb', coverImg(app, 'se-cl-cover')),
        nameCell(app.display_name || '', sub, fr ? 'se-cl-friends' : '')
      );
      if (extra) r.append(cell('sort', sortCell(sort, g)));
      r.append(
        cell('hours', hoursText(app)),
        cell('date', dateText(app.rt_last_time_played)),
        cell('size', inst ? sizeText(app) : '—'),
        cell(
          'act',
          inst
            ? button('se-cl-play', 'play', COPY.play, { act: 'play', gameid: String(app.gameid || app.appid) })
            : button('se-cl-install', 'dl', COPY.install, { act: 'install', appid: String(app.appid) })
        )
      );
      rows.push(r);
    }

    const cols = [
      ['thumb', ''],
      ['main', COPY.name],
    ];
    if (extra) cols.push(['sort', extra]);
    cols.push(['hours', COPY.hours], ['date', COPY.lastPlayed], ['size', COPY.size], ['act', '']);
    table(ctl, 'collection', cols, rows, sig);
  }

  const allState = { sort: 'az', filter: '' };

  function buildAllControls(ctrl) {
    const filter = own(ctrl, 'se-cb-filter', () => {
      const f = el('label', 'se-cb-filter');
      f.innerHTML = icon('search', 14);
      const input = el('input');
      input.type = 'search';
      input.spellcheck = false;
      input.addEventListener('input', () => {
        allState.filter = input.value;
        schedule();
      });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      f.appendChild(input);
      return f;
    });
    SE.mark(filter.querySelector('input'), 'placeholder', COPY.filter);

    const sort = own(ctrl, 'se-cb-sort', () => {
      const s = el('div', 'se-seg se-cb-sort');
      s.setAttribute('role', 'radiogroup');
      for (const k of ['az', 'size', 'recent']) {
        const b = el('button', 'se-seg-btn');
        b.type = 'button';
        b.dataset.sort = k;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          allState.sort = k;
          schedule();
        });
        s.appendChild(b);
      }
      return s;
    });
    for (const b of sort.children) {
      setText(b, { az: COPY.az, size: COPY.bySize, recent: COPY.recent }[b.dataset.sort]);
      SE.mark(b, 'aria-checked', String(b.dataset.sort === allState.sort));
    }

    viewSwitch(ctrl, 'collections');

    const add = own(ctrl, 'se-cb-new', () => {
      const b = el('button', 'se-cb-new');
      b.type = 'button';
      b.innerHTML = `${icon('plus', 14)}<span></span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        newCollection();
      });
      return b;
    });
    setText(add.lastChild, COPY.newColl);
  }

  function updateAll(scroll) {
    const header = scroll.querySelector(`:scope > .${ALLHEADER}`);
    if (!header) return;
    const view = getView('collections');
    SE.mark(scroll, 'data-se-cpage', 'all');
    SE.mark(scroll, 'data-se-view', view);

    const colls = userCollections();
    const seen = new Map();
    for (const c of colls) {
      for (const a of c.visibleApps || []) seen.set(a.appid, a);
    }
    const apps = [...seen.values()];

    const ctrl = banner(header, 'all', {
      eyebrow: COPY.library,
      iconName: 'grid',
      stats: [
        [COPY.collections, num(colls.length)],
        [COPY.games, num(apps.length)],
        [COPY.installed, num(apps.filter(isInstalled).length)],
      ],
      artApps: mostPlayed(apps, 8),
    });
    buildAllControls(ctrl);

    for (const tile of scroll.querySelectorAll(`.${TILE}:not(.${NEWTILE})`)) {
      const c = SE.fromProps(tile, 6, (q) => (q.collection?.id ? q.collection : null));
      if (c) SE.mark(tile, 'data-se-coll', c.id);
    }

    const grid = [...scroll.children].reverse().find((e) => e !== header && !e.classList.contains('se-clist'));
    const existing = scroll.querySelector(':scope > .se-clist');
    if (view !== 'list' || !grid) {
      existing?.remove();
      return;
    }

    const q = allState.filter.trim().toLowerCase();
    const info = colls
      .filter((c) => !q || (c.displayName || '').toLowerCase().includes(q))
      .map((c) => {
        const list = c.visibleApps || [];
        return {
          c,
          games: list.length,
          installed: list.filter(isInstalled).length,
          last: list.reduce((m, a) => Math.max(m, a.rt_last_time_played || 0), 0),
          top: mostPlayed(list, 2),
        };
      });

    const cmp = {
      az: (a, b) => (a.c.displayName || '').localeCompare(b.c.displayName || ''),
      size: (a, b) => b.games - a.games,
      recent: (a, b) => b.last - a.last,
    }[allState.sort];
    info.sort((a, b) => (b.c.id === 'favorite') - (a.c.id === 'favorite') || cmp(a, b));

    const sig = info.map((i) => `${i.c.id}:${i.games}:${i.installed}:${i.last}`).join(',');
    if (existing && existing.dataset.sig === sig && existing.previousElementSibling === grid) return;

    const rows = info.map(({ c, games, installed, last, top }) => {
      const r = el('div', 'se-clist-row');
      r.dataset.coll = c.id;
      const stack = el('div', 'se-cl-stack');
      for (const app of top.slice().reverse()) {
        stack.appendChild(coverImg(app, 'se-cl-cover'));
      }
      const name = nameCell(c.displayName || '', c.bIsDynamic ? COPY.dynamic : COPY.gamesSub(games));
      if (c.id === 'favorite') {
        name.firstChild.insertAdjacentHTML('afterbegin', `<span class="se-cl-fav">${icon('heart', 14)}</span>`);
      }
      r.append(
        cell('thumb', stack),
        name,
        cell('games', num(games)),
        cell('inst', num(installed)),
        cell('date', dateText(last)),
        cell('act', button('se-cl-open', 'chev', COPY.open, {}))
      );
      return r;
    });

    table(
      grid,
      'collections',
      [
        ['thumb', ''],
        ['main', COPY.coll],
        ['games', COPY.games],
        ['inst', COPY.installed],
        ['date', COPY.lastPlayed],
        ['act', ''],
      ],
      rows,
      sig
    );
  }

  function newCollection() {
    const scroll = document.querySelector(`.${ALL}`);
    if (!scroll) return;
    const click = () => {
      const tile = scroll.querySelector(`.${NEWTILE}`);
      if (tile) {
        tile.click();
        return true;
      }
      return false;
    };
    if (getView('collections') !== 'list' || click()) return;
    /* Held in Grid until the tile is clicked, so an update in between can't switch back */
    forcedView.set('collections', 'grid');
    SE.mark(scroll, 'data-se-view', 'grid');
    let tries = 0;
    const again = () => {
      if (click() || ++tries > 20) {
        forcedView.delete('collections');
        SE.mark(scroll, 'data-se-view', getView('collections'));
        return;
      }
      requestAnimationFrame(again);
    };
    requestAnimationFrame(again);
  }

  let frame = 0;
  let watcher = null;

  function update() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    try {
      for (const page of document.querySelectorAll(`.${PAGE}`)) updateCollection(page);
      for (const scroll of document.querySelectorAll(`.${ALL}`)) updateAll(scroll);
    } catch (e) {
      console.warn('[Steam Enhanced] collections', e);
    }
    watcher?.takeRecords();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  /* Core batches to a frame; throttled, as a collection grid re-renders often */
  watcher = SE.watch(update, { ignore: SE.inSide, throttle: 250 });
  const timer = SE.poll(schedule, 4000, { active: () => SE.visible('[data-se-view="list"]') });
  schedule();

  window.__steamEnhancedCollections = {
    destroy() {
      watcher?.disconnect();
      timer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      ctrlWidths.disconnect();
      observedCtrls.clear();
      forcedView.clear();
      for (const page of document.querySelectorAll(`.${PAGE}`)) SE.cssVar(page, '--se-cb-ctrl-w', null);
      document
        .querySelectorAll(
          '.se-cb-art, .se-cb-icon, .se-cb-eyebrow, .se-cb-stats, .se-cb-ctrl, .se-clist, .se-cc-strip, .se-cc-badges'
        )
        .forEach((e) => e.remove());
      for (const a of ['data-se-cbanner', 'data-se-cpage', 'data-se-view', 'data-se-coll']) {
        document.querySelectorAll(`[${a}]`).forEach((e) => e.removeAttribute(a));
      }
    },
  };
});
