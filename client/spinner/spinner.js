/*
 * Mount custom loading spinners over SteamLogoThrobber and startup loader containers.
 */
((SE) => {
  window.__seSpinner?.destroy();
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
  const FALLBACK_WALL = '/images/client_login_bg_grid.jpg';
  const docRoot = document.documentElement;

  const activeKind = () => {
    const val = getComputedStyle(docRoot).getPropertyValue('--se-spinner').trim().toLowerCase();
    return val === 'steam' || KINDS[val] ? val : DEFAULT_KIND;
  };

  // Recent covers and the wall crops come from startup.js (loaded before this file, same windows).
  const startupArt = () => window.__seStartup?.art;
  const toCssUrl = (url) => startupArt()?.cssUrl(url) ?? `url("${url}")`;

  let coverCache = { at: 0, list: [] };

  const recentCovers = () => {
    if (Date.now() - coverCache.at < 60000) return coverCache.list;
    const games = startupArt()?.recentGames() || [];
    coverCache = { at: Date.now(), list: games.map(g => g.cover).filter(urls => urls?.length) };
    return coverCache.list;
  };

  // Stack candidate capsule URLs above a cropped slice of Steam's login grid as fallback.
  const applyCardBackground = (card, index) => {
    const covers = recentCovers();
    const urls = covers.length ? covers[index % covers.length] : [];
    const crops = startupArt()?.WALL_CROPS || ['center'];
    card.style.backgroundImage = [...urls.map(toCssUrl), toCssUrl(FALLBACK_WALL)].join(', ');
    card.style.backgroundSize = [...urls.map(() => 'cover'), '900px auto'].join(', ');
    card.style.backgroundPosition = [...urls.map(() => 'center'), crops[index % crops.length]].join(', ');
  };

  const buildSpinner = (kind) => {
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

  const mountSpinner = (holder, isStartup) => {
    let kind = cachedKind;

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
    if (cachedKind === 'steam') return;

    if (docRoot.hasAttribute('data-se-startup')) {
      for (const holder of document.querySelectorAll(`${STARTUP_SELECTOR}:not([data-se-spinner])`)) {
        mountSpinner(holder, true);
      }
    }
    // In-page sweep spinners are drawn by CSS alone (spinner.css) and never need a node.
    if (cachedKind === 'sweep') return;
    for (const el of [...liveThrobbers]) {
      if (!el.hasAttribute('data-se-spinner') && !el.matches(STARTUP_SELECTOR)) mountSpinner(el, false);
    }
  };

  const watcher = SE.watch(scan);
  scan();

  window.__seSpinner = {
    destroy() {
      watcher?.disconnect();
      for (const el of document.querySelectorAll('.se-spinner')) {
        SE.unmark(el.parentNode, 'data-se-spinner');
        el.remove();
      }
      SE.unmark(docRoot, 'data-se-spinner-kind');
    },
  };
})(window.__se);
