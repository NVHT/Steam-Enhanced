/* Mount custom loading spinners over SteamLogoThrobber and startup loader containers. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedSpinner?.destroy();
  if (!document.body) return;

  const KINDS = {
    sweep: { cards: 0 },
    deck: { cards: 3, next: 'card' },
    flip: { cards: 2, next: 'flip' },
    stack: { cards: 4, next: 'card' },
    ring: { cards: 0 },
  };

  const DEFAULT_KIND = 'sweep';
  const MIN_CARD_SPINNER_PX = 40;
  const BASE_BOX_HEIGHT = 84;
  const STARTUP_SELECTOR = `html[data-se-startup] .${SE.C.SpinnerLoaderContainer}`;
  const ART_STORAGE_KEY = 'se-startup-art';
  const FALLBACK_WALL = '/images/client_login_bg_grid.jpg';
  const WALL_CROPS = ['18% 22%', '78% 64%', '46% 88%', '8% 70%', '62% 12%', '92% 34%'];
  const docRoot = document.documentElement;

  const activeKind = () => {
    const val = getComputedStyle(docRoot).getPropertyValue('--se-spinner').trim().toLowerCase();
    return val === 'steam' || KINDS[val] ? val : DEFAULT_KIND;
  };

  let coverCache = { at: 0, list: [] };

  const resolveRecentCovers = () => {
    if (Date.now() - coverCache.at < 60000) return coverCache.list;
    let list = [];

    for (const win of SE.owners()) {
      let hostWin = null;
      try {
        hostWin = win.appStore?.allApps ? win : null;
      } catch (_) {}
      if (!hostWin) continue;

      const isHidden = appid => SE.run(() => hostWin.collectionStore.BIsHidden(appid)) || false;
      const recentApps =
        SE.run(() =>
          hostWin.appStore.allApps
            .filter(
              app =>
                app &&
                app.rt_last_time_played > 0 &&
                (app.app_type === 1 || app.app_type === 1073741824) &&
                app.visible_in_game_list !== false &&
                !isHidden(app.appid)
            )
            .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
            .slice(0, 8)
        ) || [];

      list = recentApps.map(app => SE.coverURLs(app, hostWin.appStore)).filter(urls => urls.length);
      break;
    }

    if (!list.length) {
      try {
        const cached = JSON.parse(localStorage.getItem(ART_STORAGE_KEY) || 'null');
        list = (cached?.games || []).map(g => g.cover).filter(urls => urls?.length);
      } catch (_) {
        list = [];
      }
    }

    coverCache = { at: Date.now(), list };
    return list;
  };

  const toCssUrl = url => `url("${String(url).replace(/["\\\n]/g, ch => encodeURIComponent(ch))}")`;

  // Stack candidate capsule URLs above a cropped slice of Steam's login grid as fallback.
  const applyCardBackground = (card, index) => {
    const covers = resolveRecentCovers();
    const urls = covers.length ? covers[index % covers.length] : [];
    card.style.backgroundImage = [...urls.map(toCssUrl), toCssUrl(FALLBACK_WALL)].join(', ');
    card.style.backgroundSize = [...urls.map(() => 'cover'), '900px auto'].join(', ');
    card.style.backgroundPosition = [
      ...urls.map(() => 'center'),
      WALL_CROPS[index % WALL_CROPS.length],
    ].join(', ');
  };

  const buildSpinner = kind => {
    const spec = KINDS[kind];
    const container = document.createElement('div');
    container.className = 'se-spinner';
    container.dataset.kind = kind;
    container.setAttribute('aria-hidden', 'true');

    const stage = document.createElement('div');
    stage.className = 'se-spin-stage';
    container.append(stage);

    let coverIndex = 0;
    for (let i = 0; i < spec.cards; i++) {
      const card = document.createElement('span');
      card.className = 'se-spin-card';
      applyCardBackground(card, coverIndex++);
      if (spec.next === 'card') {
        card.addEventListener('animationiteration', () => applyCardBackground(card, coverIndex++));
      }
      stage.append(card);
    }

    if (spec.next === 'flip') {
      let backFaceIndex = 0;
      stage.addEventListener('animationiteration', () => {
        applyCardBackground(stage.children[backFaceIndex], coverIndex++);
        backFaceIndex = 1 - backFaceIndex;
      });
    }

    const badge = document.createElement('span');
    badge.className = 'se-spin-badge';
    container.append(badge);
    return container;
  };

  const mountSpinner = holder => {
    let kind = activeKind();
    if (kind === 'steam') return;

    const isStartup = holder.matches(STARTUP_SELECTOR);
    // In-page sweep spinners are handled purely via CSS mask replacement on .SteamLogoThrobber.
    if (kind === 'sweep' && !isStartup) return;

    const firstChild = holder.firstElementChild;
    const height = isStartup
      ? BASE_BOX_HEIGHT
      : firstChild?.getBoundingClientRect().height || holder.getBoundingClientRect().height;
    if (!height) return;

    if (!isStartup && height < MIN_CARD_SPINNER_PX && KINDS[kind].cards) {
      kind = 'sweep';
    }

    const spinnerEl = buildSpinner(kind);
    spinnerEl.style.setProperty('--se-spin-scale', String(Math.min(3, height / BASE_BOX_HEIGHT)));
    spinnerEl.dataset.place = isStartup ? 'flow' : 'over';
    holder.append(spinnerEl);
    SE.mark(holder, 'data-se-spinner', kind);
  };

  const liveThrobbers = document.getElementsByClassName('SteamLogoThrobber');
  let lastKindCheck = -Infinity;
  let cachedKind = DEFAULT_KIND;

  const scan = () => {
    const now = performance.now();
    if (now - lastKindCheck > 2000) {
      lastKindCheck = now;
      cachedKind = activeKind();
    }
    SE.mark(docRoot, 'data-se-spinner-kind', cachedKind);

    const targets = [];
    for (const el of liveThrobbers) {
      if (!el.hasAttribute('data-se-spinner')) targets.push(el);
    }
    if (docRoot.hasAttribute('data-se-startup')) {
      targets.push(
        ...document.querySelectorAll(`.${SE.C.SpinnerLoaderContainer}:not([data-se-spinner])`)
      );
    }
    for (const holder of targets) mountSpinner(holder);
  };

  const watcher = SE.watch(scan);
  scan();

  window.__steamEnhancedSpinner = {
    destroy() {
      watcher?.disconnect();
      for (const el of document.querySelectorAll('.se-spinner')) {
        SE.unmark(el.parentNode, 'data-se-spinner');
        el.remove();
      }
    },
  };
});
