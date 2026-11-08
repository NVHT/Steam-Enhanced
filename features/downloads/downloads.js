/*
 * Downloads page: syncs active-transfer telemetry into attributes, paints the downloading
 * game's art behind the page and its logo over it, and mounts the Library list beside it.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedDownloads?.destroy();
  if (!document.body) return;

  const COPY = {
    title: 'Downloads',
    now: 'Now downloading',
    paused: 'Paused',
    of: 'of',
  };

  const CLS = {
    page: SE.C.DownloadsPage,
    basic: SE.C.BasicUI,
    active: SE.C.DownloadSectionActiveItem,
    networkBar: SE.C.Network,
    progressBar: SE.C.ProgressBar,
    count: SE.C.Count,
    state: SE.C.State,
    heroImage: SE.C.HeaderImage,
  };

  const PAGE_SELECTOR = `.${CLS.page}:not(.${CLS.basic})`;
  const setAttr = (el, name, val) => SE.attr(el, name, val || null);

  let restoreLibraryRoute;
  let nativeSwitch;

  function enableNativeLibrary(page) {
    if (restoreLibraryRoute) return;
    for (const require of SE.requires()) {
      const router = SE.run(() => require.m?.[49519] && require(49519));
      const React = SE.run(() => require.m?.[63696] && require(63696));
      const prototype = router?.dO?.prototype;
      const render = prototype?.render;
      if (typeof render !== 'function' || !React?.cloneElement || !router.qh) continue;

      function withLibrary() {
        const output = render.call(this);
        const routes = this.props.children;
        if (!Array.isArray(routes) || routes.length !== 2) return output;
        const [downloads, library] = routes;
        if (downloads?.props?.path !== '/library/downloads' ||
            library?.type !== router.qh || library.props.path !== '/library') return output;
        nativeSwitch = this;
        const location = this.props.location;
        const path = location?.pathname || SE.run(() => SE.mainWindow()?.LocationPathName);
        if (path !== '/library/downloads' && path !== '/library/downloads/') return output;

        return React.createElement('div', { className: 'se-dl-native-layout' },
          React.createElement('div', { className: 'se-dl-native-list' },
            React.cloneElement(library, {
              location,
              computedMatch: { path: '/library', url: '/library', isExact: false, params: {} },
            })
          ),
          React.createElement('div', { className: 'se-dl-native-content' }, output)
        );
      }

      prototype.render = withLibrary;
      restoreLibraryRoute = () => {
        if (prototype.render === withLibrary) {
          prototype.render = render;
          nativeSwitch?.forceUpdate();
        }
      };
      // Reloading the theme on Downloads needs one render of the mounted switch.
      for (let fiber = SE.liveFiber(page); fiber; fiber = fiber.return) {
        if (fiber.type === router.dO && fiber.stateNode?.props?.children?.[0]?.props?.path === '/library/downloads') {
          fiber.stateNode.forceUpdate();
          break;
        }
      }
      return;
    }
  }

  // Keep a searchable fallback for Steam builds whose native router differs.
  const BATCH_SIZE = 100;
  const library = document.createElement('aside');
  library.className = 'se-dl-library';
  library.setAttribute('aria-label', 'Game list');
  library.innerHTML = '<h2>Games</h2><input type="search" aria-label="Search games" placeholder="Search games">' +
    '<div class="se-dl-library-scroll"><div class="se-dl-library-rows"></div>' +
    '<p class="se-dl-library-empty" role="status"></p><button type="button">Show more games</button></div>';
  const libraryInput = library.querySelector('input');
  const libraryScroll = library.querySelector('.se-dl-library-scroll');
  const libraryRows = library.querySelector('.se-dl-library-rows');
  const libraryEmpty = library.querySelector('.se-dl-library-empty');
  const libraryMore = library.querySelector('button');
  let apps = [];
  let matches = [];
  let libraryHost;
  let nextRead = 0;

  function addGameRows() {
    const start = libraryRows.childElementCount;
    const fragment = document.createDocumentFragment();
    for (const app of matches.slice(start, start + BATCH_SIZE)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.appid = app.appid;
      row.dataset.installed = String(app.installed);
      row.title = app.name;
      const url = SE.run(() => app.store.GetIconURLForApp(app.nativeApp));
      if (url) {
        const icon = document.createElement('img');
        icon.loading = 'lazy';
        icon.alt = '';
        icon.src = url;
        row.append(icon);
      }
      const name = document.createElement('span');
      name.textContent = app.name;
      row.append(name);
      fragment.append(row);
    }
    libraryRows.append(fragment);
    libraryMore.hidden = libraryRows.childElementCount >= matches.length;
  }

  function filterGames() {
    const query = libraryInput.value.trim().toLocaleLowerCase();
    matches = apps.filter((app) => app.searchName.includes(query));
    libraryRows.replaceChildren();
    libraryScroll.scrollTop = 0;
    libraryEmpty.textContent = matches.length ? '' : query ? 'No matching games' : 'No games to show';
    addGameRows();
  }

  function searchGames(value) {
    if (libraryInput.value === value) return;
    libraryInput.value = value;
    filterGames();
  }

  function openGame(appid) {
    return appid ? SE.navigate(`/library/app/${appid}`) : false;
  }

  libraryInput.addEventListener('input', filterGames);
  libraryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && openGame(matches[0]?.appid)) event.preventDefault();
  });
  libraryRows.addEventListener('click', (event) => openGame(event.target.closest('button[data-appid]')?.dataset.appid));
  libraryMore.addEventListener('click', () => {
    const first = libraryRows.childElementCount;
    addGameRows();
    libraryRows.children[first]?.focus({ preventScroll: true });
  });
  const moreObserver = window.IntersectionObserver && new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !libraryMore.hidden) addGameRows();
  }, { root: libraryScroll, rootMargin: '120px 0px' });

  function syncLibrary(page) {
    const host = page?.parentElement;
    if (host !== libraryHost) {
      moreObserver?.disconnect();
      library.remove();
      libraryHost = host;
      nextRead = 0;
    }
    if (!host) return;
    if (library.nextElementSibling !== page) {
      page.before(library);
      moreObserver?.observe(libraryMore);
    }
    if (Date.now() < nextRead) return;
    nextRead = Date.now() + 5000;
    const owner = [...SE.owners()].find((win) => SE.run(() => win.appStore?.allApps));
    const store = owner?.appStore;
    const items = SE.run(() => store?.allApps) || [];
    const next = items.filter((app) =>
      (app.app_type === 1 || app.app_type === 1073741824) &&
      app.visible_in_game_list !== false && app.display_name &&
      !SE.run(() => owner.collectionStore?.BIsHidden(app.appid))
    ).map((app) => ({
      appid: app.appid,
      name: app.display_name,
      searchName: app.display_name.toLocaleLowerCase(),
      installed: SE.isInstalled(app),
      store,
      nativeApp: app,
    }));

    if (next.length === apps.length && next.every((app, index) => {
      const previous = apps[index];
      return app.appid === previous.appid && app.name === previous.name &&
        app.installed === previous.installed && app.store === previous.store;
    })) return;
    apps = next;
    filterGames();
  }

  filterGames();

  // Art backdrop and logo for the game downloading
  const STORE_CDN = 'https://shared.steamstatic.com/store_item_assets/steam/apps';
  const mountedNodes = new Set();

  // Steam's art URLs carry the app id: /assets/<appid>/… (cache), …/apps/<appid>/… (CDN),
  // /customimages/<appid>_… (artwork the user set).
  const ART_APPID = /\/(?:assets|apps)\/(\d+)(?:[/?]|$)|\/customimages\/(\d+)[._]/;
  const appIdFromArt = (src) => {
    const match = ART_APPID.exec(src || '');
    return match ? match[1] || match[2] : null;
  };

  function logoURLs(appid) {
    const store = [...SE.owners()].map((win) => SE.run(() => win.appStore)).find(Boolean);
    const app = store && SE.run(() => store.GetAppOverviewByAppID(Number(appid)));
    const urls = [];
    if (app?.rt_custom_image_mtime) {
      const custom = SE.run(() => store.GetCustomLogoImageURLs(app));
      if (Array.isArray(custom)) urls.push(...custom.filter(Boolean));
    }
    urls.push(`/assets/${appid}/logo.png`, `${STORE_CDN}/${appid}/logo.png`);
    return [...new Set(urls)];
  }

  function syncBackdrop(page, art) {
    let layer = page.querySelector(':scope > .se-dl-backdrop');
    if (!art) {
      layer?.remove();
      setAttr(page, 'data-se-dl-art', null);
      return;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'se-dl-backdrop';
      layer.setAttribute('aria-hidden', 'true');
      page.prepend(layer);
      mountedNodes.add(layer);
    }
    const value = `url("${art.replace(/["\\]/g, '\\$&')}")`;
    if (layer.style.getPropertyValue('--se-dl-art') !== value) layer.style.setProperty('--se-dl-art', value);
    setAttr(page, 'data-se-dl-art', '1');
  }

  // ---------------------------------------------------------------------------------------
  // Hero: the transfer in progress, drawn by the theme (Steam's own block stays mounted, out
  // of sight, as the data source; Pause and the links press Steam's own buttons).
  // ---------------------------------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SEL = {
    name: `.${SE.C.ActiveItemLiveRegion_Name}, ._35eOQ6EeVHNV5HGBrJ1-Vu`,
    tag: '._1IKbaHLvcciS-EMMYx1WVG .Rgy-7t7i1Yv97qhWQae7K',
    bar: '._1vMU1vG5ZtLihr3mfXUymR',
    installBar: '.HifZB5TP6WNuubp1dzyxS',
    barLabel: '._3a973VY2X3US_cZqA9ZgNF, ._2ns4wnmgr4XBzARpwn2NZ1',
    timeLeft: '._3nx-k9xXUVgejG1BIAc84r',
    stat: '._26UBk-6weCeV-VClfXNWJZ',
    statValue: '.eXF8xL2LUtzeWMbK-FSRz',
    statLabel: '._1iulCOMUxV6sBbqoKo_yXw',
    controls: '._1r3ouwFT2-tsTAcnXYZ6NU',
    // Steam's pause/resume: its action slot, its action-button class, or any button-like
    // element; class names and tags vary between builds
    pause: '._2ZfashhZu6uE9fCwyPS9mJ > *, ._3oavRVhIS9tC3vBsFT4Ggi, button, .DialogButton, [role="button"]',
    links: '.Bku7JSkuQ7NyWi6M4w1sl > *',
    graph: '._3GBFL10vEfhI28U95WaqMj',
    graphBar: '.gpPxCvNVctmdxo8yfyEAJ, .OS07NfYlp6v-Eh5oQ7dwn',
    diskLine: '._3H2JWLH8rucdSC1XVZ7Xdk',
    activeRow: '._1VNuYHM6BPBOJspC6zPf5r',
    scroller: '._373v1eWNyaPKhgnea9FZSt > ._3Mbhnlk1Go2j8yCdjthzc7',
  };
  // Dual-tone stat icons: a soft filled shape under a solid stroke, both in currentColor
  const STAT_ICON = {
    network: '<path class="tone" d="M7.5 19h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.4 9.9 4.6 4.6 0 0 0 7.5 19z"/>' +
      '<path d="M12 10.5v6.5m-3-3 3 3 3-3"/>',
    peak: '<path class="tone" d="M13.5 2.5 4.5 14h7l-1.2 7.5 9.2-12h-7.2z"/>' +
      '<path d="M13.5 2.5 4.5 14h7l-1.2 7.5 9.2-12h-7.2z"/>',
    disk: '<path class="tone" d="M3.5 13.5h17v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>' +
      '<path d="M3.5 13.5 6.2 5.5h11.6l2.7 8"/><path d="M16.5 16.75h.01M13.5 16.75h.01"/>',
  };

  const ICON = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  };

  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  // Each text node separated by a space: Steam splits labels and values into separate nodes
  // ("Paused" + "41%"), and textContent would glue them together
  const textOf = (el) => {
    if (!el) return '';
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('svg, .se-dl-label')) continue;
      const text = node.nodeValue.trim();
      if (text) parts.push(text);
    }
    return clean(parts.join(' '));
  };
  const round = (n) => Math.round(n * 10) / 10;
  const percentOf = (bar) => {
    const now = parseFloat(bar?.closest('[role="progressbar"]')?.getAttribute('aria-valuenow') ??
      bar?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ??
      bar?.getAttribute('aria-valuenow'));
    if (Number.isFinite(now)) return now;
    const width = parseFloat(bar?.querySelector(':scope > div')?.style.width);
    return Number.isFinite(width) ? width : null;
  };

  // Writes only on change: the update runs every tick and Steam's DOM is watched
  const setText = (el, value) => {
    if (el.textContent !== value) el.textContent = value;
  };
  const setHidden = (el, hidden) => {
    if (el.hidden !== hidden) el.hidden = hidden;
  };
  const setSvgAttr = (el, name, value) => {
    if (value == null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  };
  const setStyle = (el, prop, value) => {
    if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
  };

  // The outermost button-like element, outside the links row: nested matches are its parts
  function findPause(root) {
    if (!root) return null;
    const links = root.querySelector('.Bku7JSkuQ7NyWi6M4w1sl');
    return [...root.querySelectorAll(SEL.pause)].find((el) =>
      !links?.contains(el) && !el.parentElement.closest(SEL.pause) && (el.querySelector('svg') || textOf(el))
    ) || null;
  }

  function readTransfer(item) {
    const bars = [...item.querySelectorAll(SEL.bar)].map((bar) => {
      const host = bar.parentElement;
      const label = textOf(host?.querySelector(SEL.barLabel));
      const figures = clean(textOf(host).replace(label, '')
        .replace(/^(?:paused|queued|waiting|downloading|installing|updating)\b\s*/i, '')
        .replace(/^\d+(?:[.,]\d+)?\s*%$/, ''));
      return { install: bar.matches(SEL.installBar), label, figures, value: percentOf(bar) };
    });
    const download = bars.find((bar) => !bar.install) || null;
    const install = bars.find((bar) => bar.install) || null;
    const controls = item.querySelector(SEL.controls);
    return {
      name: textOf(item.querySelector(SEL.name)),
      tags: [...new Set([...item.querySelectorAll(SEL.tag)].map(textOf).filter(Boolean))],
      download,
      install,
      timeLeft: textOf(item.querySelector(SEL.timeLeft)),
      stats: [...item.querySelectorAll(SEL.stat)].slice(0, 3).map((stat) => ({
        value: textOf(stat.querySelector(SEL.statValue)),
        label: textOf(stat.querySelector(SEL.statLabel)),
      })),
      button: findPause(controls) || findPause(item),
      links: [...item.querySelectorAll(SEL.links)].filter((el) => textOf(el)),
      graph: item.querySelector(SEL.graph),
    };
  }

  function buildHero() {
    const hero = document.createElement('section');
    hero.className = 'se-dlh';
    hero.setAttribute('aria-label', 'Current download');
    hero.innerHTML = `
      <div class="se-dlh-eyebrow"><span class="se-dlh-state"></span><span class="se-dlh-tags"></span></div>
      <img class="se-dlh-logo" alt="" decoding="async" draggable="false" hidden>
      <h2 class="se-dlh-name"></h2>
      <p class="se-dlh-sub"></p>
      <div class="se-dlh-progress">
        <div class="se-dlh-bars">
          <div class="se-dlh-bar"><div class="se-dlh-fill"></div></div>
          <div class="se-dlh-bar se-dlh-bar-install" hidden><div class="se-dlh-fill"></div></div>
        </div>
        <span class="se-dlh-pct"></span>
        <button type="button" class="se-dlh-pause"><span class="se-dlh-pause-icon"></span><span class="se-dlh-pause-label"></span></button>
      </div>
      <div class="se-dlh-stats"></div>
      <div class="se-dlh-graph">
        <div class="se-dlh-graph-head">
          <span class="se-dlh-graph-title">Speed</span>
          <span class="se-dlh-key se-dlh-key-net">Network</span>
          <span class="se-dlh-key se-dlh-key-disk">Disk</span>
        </div>
        <div class="se-dlh-plot">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="se-dlh-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity=".3"/>
              <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
            </linearGradient></defs>
            <g class="se-dlh-grid"><line x1="0" y1="33.3" x2="1000" y2="33.3"/><line x1="0" y1="66.6" x2="1000" y2="66.6"/></g>
            <path class="se-dlh-area" fill="url(#se-dlh-fill)"/>
            <path class="se-dlh-disk" fill="none"/>
            <path class="se-dlh-line" fill="none"/>
          </svg>
          <span class="se-dlh-dot" hidden></span>
        </div>
      </div>
      <div class="se-dlh-links"></div>`;
    const q = (sel) => hero.querySelector(sel);
    const refs = {
      hero,
      state: q('.se-dlh-state'),
      tags: q('.se-dlh-tags'),
      logo: q('.se-dlh-logo'),
      name: q('.se-dlh-name'),
      sub: q('.se-dlh-sub'),
      fill: q('.se-dlh-bar .se-dlh-fill'),
      installBar: q('.se-dlh-bar-install'),
      installFill: q('.se-dlh-bar-install .se-dlh-fill'),
      pct: q('.se-dlh-pct'),
      pause: q('.se-dlh-pause'),
      pauseIcon: q('.se-dlh-pause-icon'),
      pauseLabel: q('.se-dlh-pause-label'),
      stats: q('.se-dlh-stats'),
      area: q('.se-dlh-area'),
      line: q('.se-dlh-line'),
      disk: q('.se-dlh-disk'),
      dot: q('.se-dlh-dot'),
      plot: q('.se-dlh-plot'),
      links: q('.se-dlh-links'),
      source: null,
      linkSources: [],
      logoQueue: [],
    };
    refs.pause.addEventListener('click', () => togglePause(refs));
    refs.links.addEventListener('click', (event) => {
      const index = Number(event.target.closest('button[data-index]')?.dataset.index);
      refs.linkSources[index]?.click();
    });
    refs.logo.addEventListener('load', () => {
      setHidden(refs.logo, false);
      setAttr(hero, 'data-logo', '1');
    });
    refs.logo.addEventListener('error', () => {
      const next = refs.logoQueue.shift();
      if (next) refs.logo.src = next;
    });
    return refs;
  }

  // Monotone cubic (Fritsch–Carlson): smooth, without overshooting between samples
  function smoothPath(points) {
    const n = points.length;
    const dx = [];
    const slope = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = points[i + 1][0] - points[i][0] || 1;
      slope[i] = (points[i + 1][1] - points[i][1]) / dx[i];
    }
    const tan = [slope[0]];
    for (let i = 1; i < n - 1; i++) {
      tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    }
    tan[n - 1] = slope[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (!slope[i]) {
        tan[i] = tan[i + 1] = 0;
        continue;
      }
      const a = tan[i] / slope[i];
      const b = tan[i + 1] / slope[i];
      const sum = a * a + b * b;
      if (sum > 9) {
        const k = 3 / Math.sqrt(sum);
        tan[i] = k * a * slope[i];
        tan[i + 1] = k * b * slope[i];
      }
    }
    let d = `M${round(points[0][0])},${round(points[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      d += ` C${round(x0 + h)},${round(y0 + tan[i] * h)} ${round(x1 - h)},${round(y1 - tan[i + 1] * h)} ${round(x1)},${round(y1)}`;
    }
    return d;
  }

  // A bar's value: the top of its lowest-reaching visible box (the fill, not a full-height
  // wrapper); an empty bar sits on the floor
  function barTop(bar, box) {
    let top = box.bottom;
    let found = false;
    for (const el of [bar, ...bar.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (!found || r.top > top) top = r.top;
      found = true;
    }
    return found ? top : box.bottom;
  }

  // Steam's graph, sampled into 0–1000 × 0–100 (y down): network from its bars, disk from
  // its dashed line
  function readSeries(graph) {
    const box = graph?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    const norm = (x, y) => [((x - box.left) / box.width) * 1000, Math.min(100, Math.max(3, ((y - box.top) / box.height) * 100))];
    const network = [];
    for (const bar of graph.querySelectorAll(SEL.graphBar)) {
      const r = bar.getBoundingClientRect();
      const point = norm(r.left + r.width / 2, barTop(bar, box));
      if (point[0] >= 0 && point[0] <= 1000) network.push(point);
    }
    network.sort((a, b) => a[0] - b[0]);
    const firstData = network.findIndex(([, y]) => y < 99.5);
    if (firstData > 1) network.splice(0, firstData - 1);

    const disk = [];
    const line = graph.querySelector(SEL.diskLine);
    const geometry = line instanceof SVGGeometryElement ? line : line?.querySelector('path, polyline, line');
    const matrix = SE.run(() => geometry.getScreenCTM());
    const length = SE.run(() => geometry.getTotalLength()) || 0;
    if (matrix && length) {
      const point = geometry.ownerSVGElement.createSVGPoint();
      for (let i = 0; i <= 80; i++) {
        const at = geometry.getPointAtLength((length * i) / 80);
        point.x = at.x;
        point.y = at.y;
        const screen = point.matrixTransform(matrix);
        disk.push(norm(screen.x, screen.y));
      }
      disk.sort((a, b) => a[0] - b[0]);
    }
    return { network, disk };
  }

  function renderGraph(refs, graph) {
    const series = readSeries(graph);
    const network = series?.network || [];
    if (network.length >= 2) {
      const line = smoothPath(network);
      const first = network[0];
      const last = network[network.length - 1];
      setSvgAttr(refs.line, 'd', line);
      setSvgAttr(refs.area, 'd', `${line} L${round(last[0])},100 L${round(first[0])},100 Z`);
      setStyle(refs.dot, 'left', `${round(last[0] / 10)}%`);
      setStyle(refs.dot, 'top', `${round(last[1])}%`);
      setHidden(refs.dot, false);
    } else {
      setSvgAttr(refs.line, 'd', null);
      setSvgAttr(refs.area, 'd', null);
      setHidden(refs.dot, true);
    }
    setSvgAttr(refs.disk, 'd', series?.disk.length >= 2 ? smoothPath(series.disk) : null);
  }

  function renderStats(refs, stats) {
    while (refs.stats.childElementCount > stats.length) refs.stats.lastElementChild.remove();
    stats.forEach((stat, index) => {
      let card = refs.stats.children[index];
      if (!card) {
        card = document.createElement('div');
        card.className = 'se-dlh-stat';
        card.innerHTML =
          '<span class="se-dlh-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span>' +
          '<span class="se-dlh-stat-text"><span class="se-dlh-stat-label"></span><span class="se-dlh-stat-value"></span></span>';
        refs.stats.append(card);
      }
      const kind = ['network', 'peak', 'disk'][index] || 'network';
      if (card.dataset.kind !== kind) {
        card.dataset.kind = kind;
        card.querySelector('svg').innerHTML = STAT_ICON[kind];
      }
      setText(card.querySelector('.se-dlh-stat-label'), stat.label);
      setText(card.querySelector('.se-dlh-stat-value'), stat.value);
    });
  }

  function renderLinks(refs, links) {
    refs.linkSources = links;
    const labels = links.map(textOf);
    const current = [...refs.links.children].map((el) => el.textContent);
    if (labels.join('\n') === current.join('\n')) return;
    refs.links.replaceChildren(...labels.map((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.textContent = label;
      return button;
    }));
  }

  function renderLogo(refs, appid, name) {
    if (refs.logo.dataset.appid === (appid || '')) return;
    refs.logo.dataset.appid = appid || '';
    setHidden(refs.logo, true);
    setAttr(refs.hero, 'data-logo', null);
    refs.logo.alt = name;
    if (!appid) return;
    refs.logoQueue = logoURLs(appid);
    refs.logo.src = refs.logoQueue.shift();
  }

  // Steam's download API (SteamClient.Downloads). The overview subscription is the source of
  // truth for "paused"; the store is read when the subscription is unavailable.
  const steamDownloads = () =>
    SE.run(() => window.SteamClient?.Downloads) ||
    [...SE.owners()].map((win) => SE.run(() => win.SteamClient?.Downloads)).find(Boolean);
  let liveOverview = null;
  let overviewSubscription = null;
  const downloadOverview = () =>
    liveOverview || [...SE.owners()].map((win) => SE.run(() => win.downloadsStore?.m_DownloadOverview)).find(Boolean);

  // The control Steam's handler is on: the button itself, not a wrapper around it
  const CLICKABLE = 'button, [role="button"], .DialogButton';
  const clickTarget = (el) => (el?.matches(CLICKABLE) ? el : el?.querySelector(CLICKABLE)) || el;

  // A real press: pointer and mouse events, then click (Steam's buttons listen to different ones)
  function press(el) {
    if (!el) return;
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
    }
    el.click();
  }

  // React's props on a DOM node (Steam's UI is React): the handler Steam itself runs on click
  const reactProps = (el) => {
    const key = el && Object.keys(el).find((name) => name.startsWith('__reactProps$'));
    return key ? el[key] : null;
  };
  const handlerOf = (el) => {
    const props = reactProps(el);
    return props?.onClick || props?.onActivate || props?.onOKButton || null;
  };

  // Steam's pause/resume control in its (hidden) transfer block: an element with an icon and a
  // click handler, outside the links, preferring the controls beside the time left; innermost wins
  function findPauseHandler(row) {
    if (!row) return null;
    const links = row.querySelector('.Bku7JSkuQ7NyWi6M4w1sl');
    const candidates = [row, ...row.querySelectorAll('*')].filter((el) =>
      handlerOf(el) && el.querySelector('svg') && !links?.contains(el) && !el.closest(SEL.graph)
    );
    candidates.sort((a, b) =>
      Number(!!b.closest(SEL.controls)) - Number(!!a.closest(SEL.controls)) ||
      a.querySelectorAll('*').length - b.querySelectorAll('*').length
    );
    const el = candidates[0];
    return el ? { el, handler: handlerOf(el) } : null;
  }

  // Pause/resume: Steam's own handler first (exactly what its button does), then a pressed
  // button, then the download API
  function togglePause(refs) {
    const resume = refs.paused;
    const own = findPauseHandler(refs.row);
    if (own) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      SE.run(() => own.handler({
        type: 'click', target: own.el, currentTarget: own.el, nativeEvent: event,
        preventDefault() {}, stopPropagation() {}, persist() {},
      }));
    } else if (refs.source?.button) {
      press(clickTarget(refs.source.button));
    } else {
      const api = steamDownloads();
      const appid = Number(refs.appid);
      const perApp = resume ? 'ResumeAppUpdate' : 'PauseAppUpdate';
      if (appid && typeof api?.[perApp] === 'function') SE.run(() => api[perApp](appid));
      else SE.run(() => api?.EnableAllDownloads(resume));
    }
    // Show the new state at once; Steam's state confirms it on the next update
    refs.paused = !resume;
    refs.optimistic = Date.now();
    schedule();
  }

  const heroes = new WeakMap();

  function syncHero(page, item, appid, active) {
    const scroller = page.querySelector(SEL.scroller);
    let refs = heroes.get(page);
    if (!item || !scroller) {
      refs?.hero.remove();
      setAttr(page, 'data-se-dlh', null);
      return;
    }
    if (!refs) {
      refs = buildHero();
      heroes.set(page, refs);
    }
    if (refs.hero.parentElement !== scroller || scroller.firstElementChild !== refs.hero) {
      scroller.prepend(refs.hero);
      mountedNodes.add(refs.hero);
    }
    // Steam's own block: kept laid out (the graph is measured) but out of sight and unread
    const row = item.closest(SEL.activeRow) || item;
    setAttr(row, 'data-se-dlh-source', '1');
    setAttr(row, 'aria-hidden', 'true');
    setAttr(page, 'data-se-dlh', '1');

    // Search the whole source row: Steam puts the pause button beside the transfer block in
    // some builds
    const data = readTransfer(item);
    data.button ||= findPause(row);
    refs.source = data;
    refs.row = row;
    refs.appid = appid;
    const overview = downloadOverview();
    if (refs.optimistic && Date.now() - refs.optimistic < 2500) active = !refs.paused;
    else if (typeof overview?.paused === 'boolean') active = !overview.paused;
    refs.paused = !active;
    const pct = data.download?.value;
    setText(refs.state, active ? COPY.now : COPY.paused);
    setAttr(refs.hero, 'data-state', active ? 'active' : 'waiting');
    setText(refs.tags, data.tags.length ? ` · ${data.tags.join(' · ')}` : '');
    setText(refs.name, data.name);
    renderLogo(refs, appid, data.name);

    const sub = [
      data.download?.figures.replace(/\s*\/\s*/, ` ${COPY.of} `),
      data.install?.value != null ? `${data.install.label || 'Installing'} ${Math.round(data.install.value)}%` : '',
      data.timeLeft,
    ].filter(Boolean).join(' · ');
    setText(refs.sub, sub);

    const clamp = (value) => `${round(Math.max(0, Math.min(100, value ?? 0)))}%`;
    setStyle(refs.fill, 'width', clamp(pct));
    setHidden(refs.installBar, data.install?.value == null);
    if (data.install?.value != null) setStyle(refs.installFill, 'width', clamp(data.install.value));
    setText(refs.pct, pct == null ? '' : `${Math.round(pct)}%`);

    setHidden(refs.pause, !data.button && !steamDownloads() && !findPauseHandler(row));
    const pauseLabel = active ? 'Pause' : 'Resume';
    if (refs.pauseLabel.textContent !== pauseLabel) {
      refs.pauseLabel.textContent = pauseLabel;
      refs.pauseIcon.innerHTML = active ? ICON.pause : ICON.resume;
    }

    renderStats(refs, data.stats);
    renderGraph(refs, data.graph);
    renderLinks(refs, data.links);
  }

  // Page buttons (settings, queue actions, section actions): tagged by role and given the
  // theme's dual-tone icon, so the CSS styles them as one tile set whatever classes Steam uses
  // A queue entry: Steam's draggable wrapper around the card (react-beautiful-dnd's handle)
  const ITEM = '._21P7c4MWmsU2QSZeL-uyZo';
  const RBD_HANDLE = 'data-rbd-drag-handle-context-id';
  const QUEUE_ROW_SELECTOR = '._1ugNiylO2vKXhirsGocAxa ._1VNuYHM6BPBOJspC6zPf5r';
  const SECTION_TITLE_SELECTOR = '.qq2xItSXjpCsNrcxyPJtO';
  const SETTINGS_SELECTOR = '.lzk4zNVWG2zPV5Mk_o5GL ._3Tfp8-wTAttW3WVa_X9JVC';
  const ACTION_ICON = {
    settings: '<path class="tone" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>' +
      '<path d="M10.3 3.5h3.4l.5 2.4 1.7 1 2.3-.8 1.7 2.9-1.8 1.7v1.9l1.8 1.7-1.7 2.9-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-2.9 1.8-1.7v-1.9L3.9 9l1.7-2.9 2.3.8 1.7-1z"/>' +
      '<circle cx="12" cy="12" r="3"/>',
    download: '<path class="tone" d="M4.5 15.5h15v3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/>' +
      '<path d="M12 4v10m-4-4 4 4 4-4M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
    remove: '<circle class="tone" cx="12" cy="12" r="8.5"/>' +
      '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/>',
    play: '<path class="tone" d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.3-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>' +
      '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.3-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>',
  };

  // "remove" before "play": a row's Play label never names removal, the reverse can
  function actionIcon(el) {
    const label = `${el.getAttribute('aria-label') || ''} ${el.title || ''} ${textOf(el)}`.toLowerCase();
    if (el.matches('._2xR-V97DWI7svSjgiCb3N-') || /remove|cancel|delete/.test(label)) return 'remove';
    if (el.matches('.sQZ70orTPi-ELUlaS-ywR') || /\bplay\b/.test(label)) return 'play';
    if (/clear/.test(label)) return 'clear';
    return 'download';
  }

  // Labelled section actions (Clear all) keep just their label; Download now gains one, like
  // Steam's Install button
  function tagAction(el, icon) {
    setAttr(el, 'data-se-dl-action', icon);
    let label = el.querySelector(':scope > .se-dl-label');
    if (icon === 'download' && !textOf(el)) {
      if (!label) {
        label = document.createElement('span');
        label.className = 'se-dl-label';
        label.textContent = 'Download';
        el.append(label);
        mountedNodes.add(label);
      }
    } else {
      label?.remove();
    }
    setAttr(el, 'data-se-dl-text', textOf(el) || el.querySelector(':scope > .se-dl-label') ? '1' : null);
    let svg = el.querySelector(':scope > svg.se-dl-icon');
    if (icon === 'clear') {
      svg?.remove();
      return;
    }
    if (svg?.dataset.icon === icon) return;
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'se-dl-icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      el.prepend(svg);
      mountedNodes.add(svg);
    }
    svg.dataset.icon = icon;
    svg.innerHTML = ACTION_ICON[icon];
  }

  // A control: a button-like element (tag, role, tab stop or Steam's button classes)
  const CONTROL = 'button, [role="button"], [tabindex], .DialogButton, ._3oavRVhIS9tC3vBsFT4Ggi, .sQZ70orTPi-ELUlaS-ywR';
  const ROW_NAME = '._35eOQ6EeVHNV5HGBrJ1-Vu';
  const ROW_ART = '._2pjdgFqp04LlhgtFS0rQn_';

  // A row's actions: each outermost control in the row that is not the row's own body (it
  // holds neither the name nor the art) and has a box. Steam draws some icons with CSS, so an
  // svg is not required.
  function rowControls(scope) {
    const controls = [];
    for (const el of scope.querySelectorAll(CONTROL)) {
      if (el.querySelector(ROW_NAME) || el.querySelector(ROW_ART) || el.closest(ROW_ART)) continue;
      if (el.closest('.Bku7JSkuQ7NyWi6M4w1sl, ._1vMU1vG5ZtLihr3mfXUymR, .se-dl-icon, .se-dl-grip')) continue;
      let outer = true;
      for (let up = el.parentElement; up && up !== scope; up = up.parentElement) {
        if (up.matches(CONTROL) && !up.querySelector(ROW_NAME)) {
          outer = false;
          break;
        }
      }
      if (outer && (el.hasAttribute('data-se-dl-action') || el.getClientRects().length)) controls.push(el);
    }
    return controls;
  }

  // The innermost box holding every action: pinned to the row's end, always shown
  function actionBar(controls, scope) {
    let bar = controls[0]?.parentElement;
    while (bar && bar !== scope && !controls.every((el) => bar.contains(el))) bar = bar.parentElement;
    return bar && bar !== scope ? bar : null;
  }

  function tagActions(page) {
    const settings = page.querySelector(SETTINGS_SELECTOR);
    if (settings) tagAction(settings, 'settings');
    for (const title of page.querySelectorAll(SECTION_TITLE_SELECTOR)) {
      for (const el of title.querySelectorAll(CONTROL)) {
        if (!el.parentElement.closest(CONTROL) && textOf(el)) tagAction(el, actionIcon(el));
      }
    }
    for (const row of page.querySelectorAll(QUEUE_ROW_SELECTOR)) {
      const scope = row.closest(ITEM) || row;
      const controls = rowControls(scope);
      // Unlabelled Steam icons: the last icon-only control is remove (✕ ends every row), the
      // others start the download now
      const iconOnly = controls.filter((el) => !textOf(el) && !el.querySelector(':scope > .se-dl-label'));
      for (const el of controls) {
        let icon = actionIcon(el);
        if (icon === 'download' && el === iconOnly[iconOnly.length - 1]) icon = 'remove';
        tagAction(el, icon);
      }
      for (const el of scope.querySelectorAll('[data-se-dl-bar]')) {
        if (!controls.some((control) => el.contains(control))) el.removeAttribute('data-se-dl-bar');
      }
      const bar = actionBar(controls, scope);
      if (bar) setAttr(bar, 'data-se-dl-bar', '1');
      // Room at the row's end for the bar, measured: the state text stops 20px short of it
      const width = bar ? Math.ceil(bar.getBoundingClientRect().width) + 20 : 0;
      setStyle(row, '--dl-actions-w', `${width}px`);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Queue reordering: a grip on each Up Next row. The row lifts and follows the pointer, the
  // others slide aside, a line marks the landing spot; dropping on the transfer at the top
  // downloads it now. Steam's own drag is held off on these rows so the two never fight.
  // ---------------------------------------------------------------------------------------
  const BUILD = '1.90.13';
  const SORT_SECTION = '._1ugNiylO2vKXhirsGocAxa ._3Mbhnlk1Go2j8yCdjthzc7:not(.Zh51LA1WZNKTkf1qlZabn)';
  const GRIP_ICON = '<svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="3" cy="4" r="1.6"/><circle cx="9" cy="4" r="1.6"/>' +
    '<circle cx="3" cy="10" r="1.6"/><circle cx="9" cy="10" r="1.6"/><circle cx="3" cy="16" r="1.6"/><circle cx="9" cy="16" r="1.6"/></svg>';
  let drag = null;
  const rbdHandles = new Map();

  const itemAppId = (item) => item.getAttribute('data-rbd-draggable-id') || appIdFromArt(item.querySelector(`${ROW_ART} img`)?.currentSrc || item.querySelector(`${ROW_ART} img`)?.src);

  function syncGrips(page) {
    for (const section of page.querySelectorAll(SORT_SECTION)) {
      const items = [...section.querySelectorAll(`:scope ${ITEM}`)].filter((item) => item.querySelector(QUEUE_ROW_SELECTOR.split(' ').pop()));
      const sortable = items.length > 1;
      for (const item of items) {
        const card = item.querySelector('._1VNuYHM6BPBOJspC6zPf5r');
        let grip = card?.querySelector(':scope > .se-dl-grip');
        if (!sortable || !card) {
          grip?.remove();
          setAttr(card, 'data-se-dl-sortable', null);
          continue;
        }
        if (!grip) {
          grip = document.createElement('button');
          grip.type = 'button';
          grip.className = 'se-dl-grip';
          grip.setAttribute('aria-label', 'Drag to reorder');
          grip.innerHTML = GRIP_ICON;
          grip.addEventListener('pointerdown', startDrag);
          grip.addEventListener('keydown', moveByKey);
          card.prepend(grip);
          mountedNodes.add(grip);
        }
        // A grip is never an action (an earlier build could tag it as one)
        if (grip.hasAttribute('data-se-dl-action')) {
          grip.removeAttribute('data-se-dl-action');
          grip.removeAttribute('data-se-dl-text');
          grip.querySelectorAll('.se-dl-icon, .se-dl-label').forEach((el) => el.remove());
        }
        setAttr(card, 'data-se-dl-sortable', '1');
        // Steam's own drag (react-beautiful-dnd) finds its handle by this attribute; without it
        // Steam never starts a drag of its own here. The value goes back on destroy.
        if (item.hasAttribute(RBD_HANDLE)) {
          rbdHandles.set(item, item.getAttribute(RBD_HANDLE));
          item.removeAttribute(RBD_HANDLE);
        }
      }
    }
  }

  // Steam's queue API: the first reorder call this build has
  // Steam moves a queued app one place at a time; a jump is that many single moves
  function moveInQueue(appid, from, to) {
    const api = steamDownloads();
    const name = to < from ? 'MoveAppUpdateUp' : 'MoveAppUpdateDown';
    if (!appid || from === to || typeof api?.[name] !== 'function') return false;
    for (let step = Math.abs(to - from); step > 0; step--) SE.run(() => api[name](Number(appid)));
    return true;
  }

  // "Download now": Steam's own handler on the row's Download button
  function downloadNow(item) {
    const button = item.querySelector('[data-se-dl-action="download"]');
    const handler = handlerOf(button) || handlerOf(clickTarget(button));
    if (handler) SE.run(() => handler({ type: 'click', target: button, currentTarget: button, preventDefault() {}, stopPropagation() {} }));
    else press(clickTarget(button));
  }

  // Keyboard: arrow keys move the row one place
  function moveByKey(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const item = event.currentTarget.closest(ITEM);
    const section = item?.closest(SORT_SECTION);
    const items = [...(section?.querySelectorAll(`:scope ${ITEM}`) || [])];
    const from = items.indexOf(item);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= items.length) return;
    event.preventDefault();
    moveInQueue(itemAppId(item), from, to);
  }

  // From the grip: lifts at once
  function startDrag(event) {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(event.currentTarget.closest(ITEM), event, event.currentTarget);
  }

  function beginDrag(item, event, captor) {
    const section = item?.closest(SORT_SECTION);
    const page = item?.closest(PAGE_SELECTOR);
    if (!section || !page || drag) return;
    const items = [...section.querySelectorAll(`:scope ${ITEM}`)];
    const rects = items.map((el) => el.getBoundingClientRect());
    const from = items.indexOf(item);
    const origin = rects[from];
    const gap = items.length > 1 ? Math.max(0, (rects[1].top - rects[0].bottom)) : 8;

    // The lifted card: a copy that floats above the page, so the scrolling queue cannot clip it
    // on its way to the transfer at the top. The original stays in the list as the landing slot.
    const ghost = item.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    for (const name of ghost.getAttributeNames()) if (name.startsWith('data-rbd-')) ghost.removeAttribute(name);
    ghost.removeAttribute('tabindex');
    ghost.removeAttribute('role');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-se-dl-ghost', '');
    Object.assign(ghost.style, { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px` });
    section.append(ghost);

    drag = {
      item, items, rects, from, to: from, step: origin.height + gap, section, page, ghost,
      startY: event.clientY, pointerId: event.pointerId, captor, now: false,
    };
    SE.run(() => captor.setPointerCapture(event.pointerId));
    setAttr(item, 'data-se-dl-dragging', '1');
    setAttr(section, 'data-se-dl-sorting', '1');
    addEventListener('pointermove', moveDrag, true);
    addEventListener('pointerup', endDrag, true);
    addEventListener('pointercancel', cancelDrag, true);
    addEventListener('keydown', escapeDrag, true);
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { item, items, rects, from, step, section, page, ghost } = drag;
    const dy = event.clientY - drag.startY;
    ghost.style.transform = `translateY(${dy}px)`;

    // Above the queue, over the transfer: download now
    const hero = page.querySelector('.se-dlh');
    const box = hero?.getBoundingClientRect();
    drag.now = !!box && event.clientY >= box.top && event.clientY < section.getBoundingClientRect().top;
    setAttr(hero, 'data-drop', drag.now ? '1' : null);
    setAttr(ghost, 'data-now', drag.now ? '1' : null);

    // Landing index: how many of the other cards' middles the lifted card's middle has passed
    const middle = rects[from].top + rects[from].height / 2 + dy;
    let to = 0;
    rects.forEach((rect, index) => {
      if (index !== from && middle > rect.top + rect.height / 2) to++;
    });
    drag.to = drag.now ? from : to;

    // The others slide aside; the slot moves to where the card will land
    items.forEach((el, index) => {
      let shift = 0;
      if (el === item) shift = (drag.to - from) * step;
      else if (index > from && index <= drag.to) shift = -step;
      else if (index < from && index >= drag.to) shift = step;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function finishDrag(commit) {
    if (!drag) return;
    const { item, items, section, page, ghost, from, to, now, captor, pointerId } = drag;
    drag = null;
    removeEventListener('pointermove', moveDrag, true);
    removeEventListener('pointerup', endDrag, true);
    removeEventListener('pointercancel', cancelDrag, true);
    removeEventListener('keydown', escapeDrag, true);
    SE.run(() => captor.releasePointerCapture(pointerId));
    ghost.remove();
    setAttr(page.querySelector('.se-dlh'), 'data-drop', null);
    if (commit && now) downloadNow(item);
    else if (commit && to !== from) moveInQueue(itemAppId(item), from, to);
    // Settle back; Steam re-renders the new order
    setAttr(item, 'data-se-dl-dragging', null);
    setAttr(section, 'data-se-dl-sorting', null);
    for (const el of items) el.style.transform = '';
  }

  const endDrag = (event) => drag && event.pointerId === drag.pointerId && finishDrag(true);
  const cancelDrag = () => finishDrag(false);
  const escapeDrag = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finishDrag(false);
    }
  };

  // The whole card drags too (past a few pixels, so a click is still a click). Steam's own drag
  // on queue cards stays off: it would run alongside this one and drop on targets this layout
  // hides. Listening on the window, in capture, gets ahead of Steam's handlers.
  const DRAG_SLOP = 5;
  let pending = null;
  const NATIVE_DRAG_EVENTS = ['dragstart', 'mousedown', 'pointerdown', 'touchstart'];

  const holdNativeDrag = (event) => {
    const target = event.target;
    const item = target instanceof Element && target.closest(`${SORT_SECTION} ${ITEM}`);
    if (!item || item.hasAttribute('data-se-dl-ghost')) return;
    if (target.closest('.se-dl-grip, [data-se-dl-action], [data-se-dl-bar]')) return;
    if (event.type === 'dragstart' || event.type === 'mousedown') event.preventDefault();
    event.stopPropagation();
    if (event.type === 'pointerdown' && event.button === 0 && !drag && item.querySelector('.se-dl-grip')) {
      pending = { item, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    }
  };

  const watchPending = (event) => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_SLOP) return;
    const { item, y } = pending;
    pending = null;
    beginDrag(item, { clientY: y, pointerId: event.pointerId }, item);
    moveDrag(event);
  };
  const dropPending = () => {
    pending = null;
  };

  for (const type of NATIVE_DRAG_EVENTS) addEventListener(type, holdNativeDrag, true);
  addEventListener('pointermove', watchPending, true);
  addEventListener('pointerup', dropPending, true);
  addEventListener('pointercancel', dropPending, true);

  let frame = 0;

  const update = () => {
    frame = 0;
    for (const node of mountedNodes) {
      if (!node.isConnected) mountedNodes.delete(node);
    }
    const pages = [...document.querySelectorAll(PAGE_SELECTOR)];
    const visiblePage = pages.find((page) => page.getClientRects().length);
    if (visiblePage) enableNativeLibrary(visiblePage);
    syncLibrary(visiblePage?.closest('.se-dl-native-layout') ? null : visiblePage);
    for (const page of pages) {
      setAttr(page, 'data-se-dl-title', COPY.title);
      // One transfer is in progress at a time: the first active item is the hero
      const item = page.querySelector(`.${CLS.active}`);
      const active = !!item?.querySelector(
        `.${CLS.progressBar}.${CLS.networkBar}[role="progressbar"], [role="progressbar"]`
      );
      // Absolute URL: a relative one in a custom property resolves against the theme's
      // stylesheet, not the page, and the backdrop would load nothing
      const heroImage = item?.querySelector(`.${CLS.heroImage} img`);
      const pageArt = heroImage?.currentSrc || heroImage?.src || '';

      syncBackdrop(page, pageArt);
      syncHero(page, item, appIdFromArt(pageArt), active);
      tagActions(page);
      if (!drag) syncGrips(page);

      for (const countNode of page.querySelectorAll(`.${CLS.count}`)) {
        const match = /\(\s*(\d+)\s*\)/.exec(countNode.textContent);
        setAttr(countNode, 'data-se-count', match ? match[1] : '');
      }
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  overviewSubscription = SE.run(() =>
    steamDownloads()?.RegisterForDownloadOverview?.((overview) => {
      liveOverview = overview;
      schedule();
    })
  );

  const watcher = SE.watch(schedule, { attributes: ['aria-valuenow'] });
  const timer = SE.poll(schedule, 1500, { active: () => SE.visible(PAGE_SELECTOR) });
  schedule();

  const TRACKED_ATTRS = [
    'data-se-dl-title',
    'data-se-count',
    'data-se-dl-art',
    'data-se-dlh',
    'data-se-dlh-source',
    'data-se-dl-action',
    'data-se-dl-text',
    'data-se-dl-bar',
    'data-se-dl-sortable',
    'data-se-dl-dragging',
    'data-se-dl-sorting',
    'data-drop',
    'data-now',
  ];

  // Clipboard: the async API when the page may use it, else a selected textarea
  function copyText(text) {
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(area);
      area.select();
      const ok = SE.run(() => document.execCommand('copy'));
      area.remove();
      return !!ok;
    };
    const writing = SE.run(() => navigator.clipboard.writeText(text));
    if (writing?.catch) writing.catch(fallback);
    else fallback();
  }

  // Ctrl+Shift+D on the Downloads page: copies the support report, no console needed
  function toast(message) {
    const note = document.createElement('div');
    note.className = 'se-dl-toast';
    note.textContent = message;
    document.body.append(note);
    mountedNodes.add(note);
    setTimeout(() => {
      note.remove();
      mountedNodes.delete(note);
    }, 2600);
  }

  const debugKey = (event) => {
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.code !== 'KeyD') return;
    if (!document.querySelector(PAGE_SELECTOR)) return;
    event.preventDefault();
    event.stopPropagation();
    window.__steamEnhancedDownloads?.debug();
    toast(`Steam Enhanced ${BUILD}: download info copied`);
  };
  addEventListener('keydown', debugKey, true);

  window.__steamEnhancedDownloads = {
    get library() { return library.isConnected ? library : null; },
    // Support: copies Steam's transfer block and queue markup, and lists the download API
    debug() {
      const page = document.querySelector(PAGE_SELECTOR);
      const row = page?.querySelector('[data-se-dlh-source]');
      const pause = findPauseHandler(row);
      const report = {
        build: BUILD,
        api: Object.keys(steamDownloads() || {}),
        sortSections: page?.querySelectorAll(SORT_SECTION).length ?? 0,
        items: page?.querySelectorAll(`${SORT_SECTION} ${ITEM}`).length ?? 0,
        grips: page?.querySelectorAll('.se-dl-grip').length ?? 0,
        draggable: [...(page?.querySelectorAll('[draggable]') || [])].map((el) => `${el.className}:${el.getAttribute('draggable')}`),
        overview: liveOverview,
        pause: pause ? pause.el.outerHTML.slice(0, 400) : null,
        transfer: row?.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 20000),
        queue: page?.querySelector('._1ugNiylO2vKXhirsGocAxa')?.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 20000),
      };
      copyText(JSON.stringify(report, null, 2));
      return report;
    },
    searchGames,
    openFirstGame: () => openGame(matches[0]?.appid),
    destroy() {
      watcher.disconnect();
      syncLibrary();
      restoreLibraryRoute?.();
      timer?.disconnect();
      SE.run(() => overviewSubscription?.unregister());
      finishDrag(false);
      for (const type of NATIVE_DRAG_EVENTS) removeEventListener(type, holdNativeDrag, true);
      removeEventListener('pointermove', watchPending, true);
      removeEventListener('pointerup', dropPending, true);
      removeEventListener('pointercancel', dropPending, true);
      removeEventListener('keydown', debugKey, true);
      for (const [el, value] of rbdHandles) el.setAttribute(RBD_HANDLE, value);
      rbdHandles.clear();
      if (frame) cancelAnimationFrame(frame);
      for (const node of mountedNodes) node.remove();
      mountedNodes.clear();
      for (const el of document.querySelectorAll('[data-se-dlh-source]')) el.removeAttribute('aria-hidden');
      for (const attrName of TRACKED_ATTRS) {
        for (const el of document.querySelectorAll(`${PAGE_SELECTOR} [${attrName}], ${PAGE_SELECTOR}[${attrName}]`)) {
          el.removeAttribute(attrName);
        }
      }
      delete window.__steamEnhancedDownloads;
    },
  };
});
