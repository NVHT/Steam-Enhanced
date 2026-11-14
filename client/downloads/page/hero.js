/*
 * The hero: building it, the speed graph, stats, links and logo, and syncing it each pass.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { COPY, ICON, ROW, SEL, STAT_ICON, findPause, logoURLs, mountedNodes, readTransfer, round, setAttr, setHidden, setText, textOf } = ns;

  let heroCount = 0;

  function buildHero() {
    const gradientId = `se-dlh-fill-${++heroCount}`;
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
            <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity=".3"/>
              <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
            </linearGradient></defs>
            <g class="se-dlh-grid"><line x1="0" y1="33.3" x2="1000" y2="33.3"/><line x1="0" y1="66.6" x2="1000" y2="66.6"/></g>
            <path class="se-dlh-area" fill="url(#${gradientId})"/>
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
    refs.pause.addEventListener('click', () => ns.togglePause(refs));
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
  // wrapper); an empty bar sits on the floor. The fill found is remembered, so later frames
  // measure one box per bar instead of its whole subtree.
  const barFills = new WeakMap();

  function barTop(bar, box) {
    const fill = barFills.get(bar);
    if (fill && bar.contains(fill)) {
      const r = fill.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r.top;
    }
    let top = box.bottom;
    let found = null;
    for (const el of [bar, ...bar.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (!found || r.top > top) {
        top = r.top;
        found = el;
      }
    }
    if (found && found !== bar) barFills.set(bar, found);
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

  function renderGraph(refs, series) {
    const network = series?.network || [];
    if (network.length >= 2) {
      const line = smoothPath(network);
      const first = network[0];
      const last = network[network.length - 1];
      SE.attr(refs.line, 'd', line);
      SE.attr(refs.area, 'd', `${line} L${round(last[0])},100 L${round(first[0])},100 Z`);
      SE.cssVar(refs.dot, 'left', `${round(last[0] / 10)}%`);
      SE.cssVar(refs.dot, 'top', `${round(last[1])}%`);
      setHidden(refs.dot, false);
    } else {
      SE.attr(refs.line, 'd', null);
      SE.attr(refs.area, 'd', null);
      setHidden(refs.dot, true);
    }
    SE.attr(refs.disk, 'd', series?.disk.length >= 2 ? smoothPath(series.disk) : null);
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

  const heroes = new WeakMap();

  // Steam's own block feeds the hero: kept laid out (its graph is measured) but out of sight
  // and unread. A row that stops being the source gets its own state back.
  function claimSource(refs, row) {
    if (refs.row && refs.row !== row) {
      SE.unmark(refs.row, 'data-se-dlh-source');
      SE.unmark(refs.row, 'aria-hidden');
    }
    refs.row = row;
    setAttr(row, 'data-se-dlh-source', '1');
    setAttr(row, 'aria-hidden', 'true');
  }

  function syncHero(page, item, appid, active) {
    const scroller = page.querySelector(SEL.scroller);
    let refs = heroes.get(page);
    if (!item || !scroller) {
      if (refs) {
        refs.hero.remove();
        claimSource(refs, null);
      }
      setAttr(page, 'data-se-dlh', null);
      return;
    }
    if (!refs) {
      refs = buildHero();
      heroes.set(page, refs);
    }
    // Claimed before reading, so the graph is measured at the source's fixed width
    const row = item.closest(ROW) || item;
    claimSource(refs, row);

    // Reads first (Steam's block and its graph), writes after: one layout per frame.
    // The whole source row is searched: some builds put Pause beside the transfer block.
    const data = readTransfer(item);
    data.button ||= findPause(row);
    const series = readSeries(data.graph);
    const canPause = !!(data.button || ns.steamDownloads() || ns.findPauseHandler(row));

    if (refs.hero.parentElement !== scroller || scroller.firstElementChild !== refs.hero) {
      scroller.prepend(refs.hero);
      mountedNodes.add(refs.hero);
    }
    setAttr(page, 'data-se-dlh', '1');
    refs.source = data;
    refs.appid = appid;
    const overview = ns.downloadOverview();
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
    SE.cssVar(refs.fill, 'width', clamp(pct));
    setHidden(refs.installBar, data.install?.value == null);
    if (data.install?.value != null) SE.cssVar(refs.installFill, 'width', clamp(data.install.value));
    setText(refs.pct, pct == null ? '' : `${Math.round(pct)}%`);

    setHidden(refs.pause, !canPause);
    const pauseLabel = active ? 'Pause' : 'Resume';
    if (refs.pauseLabel.textContent !== pauseLabel) {
      refs.pauseLabel.textContent = pauseLabel;
      refs.pauseIcon.innerHTML = active ? ICON.pause : ICON.resume;
    }

    renderStats(refs, data.stats);
    renderGraph(refs, series);
    renderLinks(refs, data.links);
  }

  Object.assign(ns, { syncHero });
})(window.__se);
