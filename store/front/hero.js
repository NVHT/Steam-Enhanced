/*
 * Store front page: "Cinema" redesign (front/hero.css).
 *
 * Builds a full-bleed hero carousel from Steam's own Featured & Recommended capsules
 * (#home_maincap_v7), led by the page's takeover game when there is one. Steam's original
 * carousel stays in the DOM, hidden, so its own scripts (microtrailers, impression tracking)
 * keep working.
 *
 * Autoplay is one Web Animation on the active tab's progress bar: its end moves to the next
 * slide, so no script runs between slide changes. It holds while the page is hidden, the hero
 * is scrolled away, keyboard focus is inside it, or reduced motion is on; it keeps running
 * under the pointer, where hovering screenshots previews them.
 */
export default (dom) => {
  const { el, scope, squash } = dom;
  const life = scope();

  const AUTOPLAY_MS = 7000;
  const MAX_SLIDES = 10;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Data: read Steam's featured capsules ---------- */

  /**
   * Steam's reason block comes in a few shapes (.main.default/.bytags/.creator/.curator).
   * Normalised to { kind, badge, lead, entity, tags }:
   *   top seller  → badge "Top Seller", lead "Ranked #7 in your region"
   *   by tags     → lead "Because you play", tags [...]
   *   by creator  → lead "Published by", entity "Electronic Arts" (also curators, friends)
   */
  const readReason = (capsule) => {
    const main = capsule.querySelector('.reason .main');
    if (!main) return null;

    const topSeller = main.querySelector('.topseller_title');
    if (topSeller) {
      return {
        kind: 'topseller',
        badge: squash(topSeller.textContent),
        lead: squash(main.querySelector('.topseller_subtext')?.textContent),
      };
    }

    const tags = [...main.querySelectorAll('.tags > *')].map((node) => squash(node.textContent)).filter(Boolean);
    if (tags.length) return { kind: 'tags', lead: 'Because you play', tags };

    const clone = main.cloneNode(true);
    clone.querySelectorAll('img').forEach((node) => node.remove());
    clone.querySelectorAll('br').forEach((node) => node.replaceWith(' '));
    const entityNode = [...clone.children].filter((node) => node.tagName === 'SPAN').pop();
    const entity = squash(entityNode?.textContent);
    entityNode?.remove();
    const lead = squash(clone.textContent).replace(/[,:]\s*$/, '');
    // A reason names who recommends it ("Published by EA"). Lines with no one named are event
    // notes ("Play for free until Nov 9 @ 11:00am"): skipped.
    return entity ? { kind: 'by', lead, entity } : null;
  };

  /** Steam's discount block → { pct, original, final } (all display strings). */
  const readPrice = (capsule) => {
    const block = capsule.querySelector('.discount_block');
    const final = squash(block?.querySelector('.discount_final_price')?.textContent);
    if (!final) return null;
    return {
      pct: squash(block.querySelector('.discount_pct')?.textContent),
      original: squash(block.querySelector('.discount_original_price')?.textContent),
      final,
    };
  };

  /*
   * Asset folders for an app. Older art lives at apps/<id>/<file>; newer uploads at
   * apps/<id>/<hash>/<file>. Logos aren't in any store API and newer ones sit under their own
   * per-file hash, so only older games resolve here; the rest come from the library art lookup
   * or fall back to the store capsule, which carries the game's logo.
   */
  const ASSET_PATH = /^(https:\/\/[^/]+\/store_item_assets\/steam\/apps\/\d+\/)([0-9a-f]{16,}\/)?/i;

  const assetFolders = (...urls) => {
    const folders = new Set();
    for (const url of urls) {
      const match = ASSET_PATH.exec(url ?? '');
      if (!match) continue;
      folders.add(match[1]);
      if (match[2]) folders.add(match[1] + match[2]);
    }
    return [...folders];
  };

  /* ---------- Remote data, cached per app ---------- */

  /*
   * Logos and library heroes sit under per-file hashes that only the app's PICS info lists
   * (common.library_assets_full); api.steamcmd.net serves that publicly with open CORS. Short
   * descriptions and full screenshot lists come from the store's own /api/appdetails. Both are
   * cached in localStorage: hits for a week, misses for a day. Fetched only for the slide on
   * screen and the next one.
   */
  const APPINFO_URL = 'https://api.steamcmd.net/v1/info/';
  const ASSET_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/';
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MISS_TTL_MS = 24 * 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 6000;

  const createCache = (key, isHit) => {
    let entries = {};
    try {
      entries = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
    } catch (_) {}
    const now = Date.now();
    for (const [appid, entry] of Object.entries(entries)) {
      if (!entry || now - entry.at > (isHit(entry) ? TTL_MS : MISS_TTL_MS)) delete entries[appid];
    }
    return {
      get: (appid) => entries[appid],
      set(appid, entry) {
        entries[appid] = { ...entry, at: Date.now() };
        try {
          localStorage.setItem(key, JSON.stringify(entries));
        } catch (_) {} // private mode / quota: the in-memory copy still serves this visit
      },
    };
  };

  /** Steam's language name for this page (e.g. "english"). */
  const pageLanguage = /(?:^|;\s*)Steam_Language=([a-z]+)/.exec(document.cookie)?.[1] ?? 'english';

  const pickLocalized = (map) => {
    if (!map || typeof map !== 'object') return null;
    return map[pageLanguage] ?? map.english ?? Object.values(map).find((value) => typeof value === 'string') ?? null;
  };

  const fetchJson = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const artCache = createCache('se-store-library-art-v1', (entry) => Boolean(entry.logo || entry.hero));
  const detailsCache = createCache(`se-store-details-v1-${pageLanguage}`, (entry) => Boolean(entry.description || entry.shots?.length));

  const fetchLibraryArt = async (appid) => {
    try {
      const assets = (await fetchJson(`${APPINFO_URL}${appid}`))?.data?.[appid]?.common?.library_assets_full;
      const file = (asset) => pickLocalized(asset?.image2x) ?? pickLocalized(asset?.image);
      const url = (name) => (name ? `${ASSET_BASE}${appid}/${name}` : null);
      const art = { logo: url(file(assets?.library_logo)), hero: url(file(assets?.library_hero)) };
      artCache.set(appid, art);
      return art;
    } catch (_) {
      return {}; // network/CSP failure: not cached, so the next visit retries
    }
  };

  const decodeHtml = (html) => new DOMParser().parseFromString(html ?? '', 'text/html').body.textContent.trim();

  const fetchStoreDetails = async (appid) => {
    try {
      const url = `/api/appdetails?appids=${appid}&l=${encodeURIComponent(pageLanguage)}`;
      const data = (await fetchJson(url, { credentials: 'same-origin' }))?.[appid]?.data;
      const details = {
        description: decodeHtml(data?.short_description),
        shots: (data?.screenshots ?? []).slice(0, 4).map((shot) => ({ thumb: shot.path_thumbnail, full: shot.path_full })),
      };
      detailsCache.set(appid, details);
      return details;
    } catch (_) {
      return {};
    }
  };

  /** Fill a slide's description and top up its screenshots to four; true if anything changed. */
  const applyStoreDetails = (slide, details) => {
    let changed = false;
    if (details?.description && slide.description !== details.description) {
      slide.description = details.description;
      changed = true;
    }
    for (const shot of details?.shots ?? []) {
      if (slide.shots.length >= 4) break;
      if (!shot.thumb || slide.shots.some((have) => have.thumb === shot.thumb)) continue;
      slide.shots.push({ thumb: shot.thumb, art: [shot.full, shot.thumb].filter(Boolean) });
      changed = true;
    }
    return changed;
  };

  /** Put fetched library art first in a slide's candidate lists; true if anything changed. */
  const applyLibraryArt = (slide, art) => {
    let changed = false;
    if (art?.logo && !slide.logo.includes(art.logo)) {
      slide.logo.unshift(art.logo);
      changed = true;
    }
    if (art?.hero && !slide.art.includes(art.hero)) {
      slide.art.unshift(art.hero);
      changed = true;
    }
    return changed;
  };

  const readSlide = (capsule) => {
    const appid = capsule.dataset.dsAppid?.split(',')[0] ?? null;
    const mainCapsule = capsule.querySelector('.main_capsule');
    const thumb = mainCapsule?.dataset.backgroundImageUrl ?? '';
    const thumb2x = mainCapsule?.dataset.backgroundImage2xUrl ?? '';
    const shots = [...capsule.querySelectorAll('.screenshots > div')]
      .map((node) => node.dataset.backgroundImageUrl || /url\(["']?([^"')]+)/.exec(node.style.backgroundImage)?.[1])
      .filter(Boolean);
    const folders = assetFolders(thumb, shots[0]);
    const full = (url) => url?.replace(/\.\d+x\d+\.jpg/, '.1920x1080.jpg');
    const slide = {
      appid,
      href: capsule.href,
      title: squash(capsule.querySelector('.app_name')?.textContent),
      reason: readReason(capsule),
      review: capsule.querySelector('.game_review_summary'),
      reviewCount: squash(capsule.querySelector('.review_count')?.textContent),
      price: readPrice(capsule),
      shots: shots.slice(0, 4).map((url) => ({ thumb: url, art: [full(url), url] })),
      description: '',
      // Best art first; each candidate is tried in order on load error.
      art: [...folders.map((folder) => `${folder}library_hero.jpg`), full(shots[0]), shots[0], thumb].filter(Boolean),
      logo: folders.map((folder) => `${folder}logo.png`),
      capsule: [thumb2x, thumb].filter(Boolean),
      requested: false,
    };
    // Cached data applies before the first paint.
    if (appid) {
      applyLibraryArt(slide, artCache.get(appid));
      applyStoreDetails(slide, detailsCache.get(appid));
    }
    return slide;
  };

  /* ---------- Hero ---------- */

  /*
   * Load the first candidate that works into an image. A newer call on the same image settles
   * the older one (false) instead of leaving it pending.
   */
  const pending = new WeakMap();
  const loadFirst = (img, candidates) => {
    pending.get(img)?.(false);
    return new Promise((resolve) => {
      const settle = (ok) => {
        if (pending.get(img) !== settle) return;
        pending.delete(img);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      pending.set(img, settle);
      const queue = [...candidates];
      const next = () => {
        const src = queue.shift();
        if (!src) return settle(false);
        img.onload = () => settle(true);
        img.onerror = next;
        img.src = src;
      };
      next();
    });
  };

  const renderReview = (slide) => {
    if (!slide.review) return null;
    const tone = ['positive', 'mixed', 'negative'].find((name) => slide.review.classList.contains(name)) ?? 'neutral';
    const count = slide.reviewCount.replace(/[()]/g, '').replace(/\s*Reviews?$/i, '');
    return el('span', { class: `se-chip se-chip--review is-${tone}` }, [
      el('span', { class: 'se-chip__dot', 'aria-hidden': 'true' }),
      squash(slide.review.textContent),
      count && el('span', { class: 'se-chip__muted', text: `${count} reviews` }),
    ]);
  };

  const renderPrice = (node, price) => {
    node.hidden = !price;
    if (!price) return node.replaceChildren();
    node.classList.toggle('is-discounted', Boolean(price.pct));
    node.replaceChildren(...[
      price.pct && el('span', { class: 'se-cinema__pct', text: price.pct }),
      el('span', { class: 'se-cinema__amounts' }, [
        price.original && el('s', { class: 'se-cinema__was', text: price.original }),
        el('span', { class: 'se-cinema__now', text: price.final }),
      ]),
    ].filter(Boolean));
  };

  /*
   * Wishlist, through the endpoints the store's own AddToWishlist/RemoveFromWishlist use
   * (store main.js): POST /api/addtowishlist | /api/removefromwishlist { sessionid, appid }.
   */
  const wishlist = {
    available: () => Boolean(window.g_AccountID && window.g_sessionID),
    has: (appid) => Boolean(window.GDynamicStore?.BIsAppOnWishlist?.(Number(appid))),
    async set(appid, on) {
      const body = new URLSearchParams({ sessionid: window.g_sessionID, appid: String(appid) });
      const response = await fetch(`/api/${on ? 'addtowishlist' : 'removefromwishlist'}`, {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error('Wishlist update failed');
      window.UpdateWishlistCount?.(data.wishlistCount);
      window.GDynamicStore?.InvalidateCache?.();
    },
  };

  const buildHero = (slides) => {
    const artA = el('img', { class: 'se-cinema__art', alt: '', decoding: 'async' });
    const artB = el('img', { class: 'se-cinema__art', alt: '', decoding: 'async' });

    /* Top: one tab per game, each with its own progress track. */
    const tabs = slides.map((slide, index) =>
      el('button', { type: 'button', class: 'se-cinema__tab', 'data-index': String(index), title: slide.title }, [
        el('span', { class: 'se-cinema__track', 'aria-hidden': 'true' }),
        el('span', { class: 'se-cinema__tab-name', text: slide.title }),
      ]),
    );
    const tabBar = el('nav', { class: 'se-cinema__tabs', 'aria-label': 'Featured games' }, tabs);
    const counter = el('span', { class: 'se-cinema__count' });
    const label = el('div', { class: 'se-cinema__label' }, ['Featured & Recommended', counter]);
    const top = el('div', { class: 'se-cinema__top' }, [label, tabBar]);
    // Lives inside the active tab's track; moved on every slide change.
    const progress = el('span', { class: 'se-cinema__progress', 'aria-hidden': 'true' });

    /* Lower left, on the art: the logo (or capsule, or title). */
    const logo = el('img', { class: 'se-cinema__logo', alt: '', decoding: 'async' });
    const capsuleArt = el('img', { class: 'se-cinema__capsule', alt: '', decoding: 'async' });
    const title = el('h2', { class: 'se-cinema__title' });
    const head = el('div', { class: 'se-cinema__head' }, [logo, capsuleArt, title]);

    /* Bottom: one glass bar with facts, screenshots and the buy controls. */
    const meta = el('div', { class: 'se-cinema__meta' });
    const description = el('p', { class: 'se-cinema__desc' });
    const shots = el('div', { class: 'se-cinema__shots', role: 'group', 'aria-label': 'Screenshots' });
    const price = el('div', { class: 'se-cinema__price' });
    const cta = el('a', { class: 'se-cinema__cta' }, [
      el('span', { text: 'View in store' }),
      el('span', { class: 'se-arrow-icon', 'aria-hidden': 'true' }),
    ]);
    const heart = el('button', { type: 'button', class: 'se-cinema__wish', 'aria-pressed': 'false', hidden: !wishlist.available() });
    const bar = el('div', { class: 'se-cinema__bar' }, [
      meta,
      description,
      shots,
      el('div', { class: 'se-cinema__buy' }, [price, cta, heart]),
    ]);

    const hero = el('section', {
      class: 'se-cinema',
      'aria-roledescription': 'carousel',
      'aria-label': 'Featured & Recommended',
      tabIndex: 0,
    }, [artA, artB, el('div', { class: 'se-cinema__scrim' }), top, head, bar]);

    let current = -1;
    let front = artA;
    let token = 0;

    /* Crossfade to the first loadable candidate; a newer request wins. */
    let artTicket = 0;
    const swapArt = async (candidates, slideTicket) => {
      const ticket = ++artTicket;
      const back = front === artA ? artB : artA;
      const ok = await loadFirst(back, candidates);
      if (ticket !== artTicket || slideTicket !== token) return;
      back.classList.toggle('is-missing', !ok);
      back.classList.add('is-front');
      front.classList.remove('is-front');
      front = back;
    };

    /* Hovering or focusing a screenshot previews it as the hero art. */
    let previewing = false;
    const previewShot = (event) => {
      const link = event.target.closest?.('.se-cinema__shot');
      if (!link) return;
      previewing = true;
      shots.querySelectorAll('.se-cinema__shot').forEach((node) => node.toggleAttribute('data-active', node === link));
      swapArt(slides[current].shots[Number(link.dataset.shot)].art, token);
    };
    const endPreview = (event) => {
      if (!previewing || shots.contains(event.relatedTarget)) return;
      previewing = false;
      shots.querySelectorAll('[data-active]').forEach((node) => node.removeAttribute('data-active'));
      swapArt(slides[current].art, token);
    };
    life.listen(shots, 'pointerover', previewShot);
    life.listen(shots, 'focusin', previewShot);
    life.listen(shots, 'pointerout', endPreview);
    life.listen(shots, 'focusout', endPreview);

    const wished = new Map(); // appid → boolean, optimistic local state
    const renderWish = (slide) => {
      const canWish = wishlist.available() && Boolean(slide.appid);
      heart.hidden = !canWish;
      if (!canWish) return;
      const on = wished.get(slide.appid) ?? wishlist.has(slide.appid);
      heart.setAttribute('aria-pressed', String(on));
      heart.setAttribute('aria-label', on ? `Remove ${slide.title} from wishlist` : `Add ${slide.title} to wishlist`);
    };
    life.listen(heart, 'click', async () => {
      const slide = slides[current];
      if (!slide?.appid || heart.disabled) return;
      const next = heart.getAttribute('aria-pressed') !== 'true';
      heart.disabled = true;
      wished.set(slide.appid, next);
      renderWish(slide);
      try {
        await wishlist.set(slide.appid, next);
      } catch (_) {
        wished.set(slide.appid, !next); // roll back
      } finally {
        heart.disabled = false;
        if (slides[current] === slide) renderWish(slide);
      }
    });

    /*
     * One tile per screenshot. A thumbnail that won't load tries the full-size file, then its
     * tile is removed (and the shot dropped from the slide) so no empty box is left behind.
     */
    const renderShots = (slide, slideTicket) => {
      const tiles = slide.shots.map((shot, i) => {
        const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
        const tile = el('a', {
          class: 'se-cinema__shot',
          href: slide.href,
          'data-shot': String(i),
          'aria-label': `${slide.title} screenshot ${i + 1}`,
        }, img);
        loadFirst(img, [shot.thumb, ...shot.art.filter((url) => url !== shot.thumb)]).then((ok) => {
          if (ok || slideTicket !== token) return;
          const at = slide.shots.indexOf(shot);
          if (at >= 0) slide.shots.splice(at, 1);
          tile.remove();
          shots.querySelectorAll('.se-cinema__shot').forEach((node, k) => {
            node.dataset.shot = String(k);
            node.setAttribute('aria-label', `${slide.title} screenshot ${k + 1}`);
          });
          shots.hidden = !slide.shots.length;
        });
        return tile;
      });
      shots.replaceChildren(...tiles);
      shots.hidden = !tiles.length;
    };

    const show = (index) => {
      const target = (index + slides.length) % slides.length;
      if (target === current) return;
      current = target;
      previewing = false;
      const slide = slides[target];
      const ticket = ++token;

      tabs.forEach((tab, i) => {
        if (i === target) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
        tab.toggleAttribute('data-done', i < target);
      });
      tabs[target].firstChild.append(progress);
      counter.textContent = `${target + 1} / ${slides.length}`;
      title.textContent = slide.title;
      description.textContent = slide.description;
      description.hidden = !slide.description;
      cta.href = slide.href;
      cta.setAttribute('aria-label', `View ${slide.title} in store`);

      meta.replaceChildren(...[
        renderReview(slide),
        slide.reason?.badge && el('span', { class: 'se-cinema__badge', text: slide.reason.badge }),
      ].filter(Boolean));
      renderPrice(price, slide.price);
      renderWish(slide);
      renderShots(slide, ticket);

      hero.classList.remove('has-logo', 'has-capsule');
      hero.classList.add('is-art-pending');
      hero.classList.toggle('is-long-title', slide.title.length > 28);
      loadFirst(logo, slide.logo).then(async (ok) => {
        if (ticket !== token) return;
        if (ok) hero.classList.add('has-logo');
        else if (await loadFirst(capsuleArt, slide.capsule) && ticket === token) hero.classList.add('has-capsule');
        if (ticket === token) hero.classList.remove('is-art-pending');
      });

      swapArt(slide.art, ticket);
      // This slide's and the next one's remote data, so the next change has it ready.
      request(slide);
      request(slides[(target + 1) % slides.length]);
    };

    /** Re-render the slide in place if it is on screen (its data changed); autoplay continues. */
    const refresh = (slide) => {
      if (slides[current] !== slide) return;
      const index = current;
      current = -1;
      show(index);
    };

    const request = (slide) => {
      if (slide.requested || !slide.appid) return;
      slide.requested = true;
      const done = (changed) => {
        if (life.alive && changed) refresh(slide);
      };
      if (!artCache.get(slide.appid)) fetchLibraryArt(slide.appid).then((art) => done(applyLibraryArt(slide, art)));
      if (!detailsCache.get(slide.appid)) fetchStoreDetails(slide.appid).then((details) => done(applyStoreDetails(slide, details)));
    };

    /* ---------- Autoplay ---------- */

    const holds = new Set();
    let timer = null;
    const syncHold = () => {
      if (!timer) return;
      if (holds.size || reducedMotion.matches) timer.pause();
      else timer.play();
    };
    const hold = (key, on) => {
      if (on) holds.add(key);
      else holds.delete(key);
      syncHold();
    };
    const go = (index) => {
      show(index);
      timer?.cancel();
      timer = progress.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        duration: AUTOPLAY_MS,
        easing: 'linear',
        fill: 'forwards',
      });
      timer.onfinish = () => go(current + 1);
      syncHold();
    };
    life.add(() => timer?.cancel());

    life.listen(tabBar, 'click', (event) => {
      const tab = event.target.closest('.se-cinema__tab');
      if (tab) go(Number(tab.dataset.index));
    });
    life.listen(hero, 'keydown', (event) => {
      if (event.key === 'ArrowRight') go(current + 1);
      else if (event.key === 'ArrowLeft') go(current - 1);
      else return;
      event.preventDefault();
    });
    life.listen(hero, 'focusin', (event) => hold('focus', event.target.matches(':focus-visible')));
    life.listen(hero, 'focusout', (event) => {
      if (!hero.contains(event.relatedTarget)) hold('focus', false);
    });
    life.listen(document, 'visibilitychange', () => hold('hidden', document.hidden));
    life.listen(reducedMotion, 'change', syncHold);
    const seen = new IntersectionObserver(([entry]) => hold('offscreen', !entry.isIntersecting));
    seen.observe(hero);
    life.add(() => seen.disconnect());

    return { element: hero, start: () => go(0) };
  };

  /* ---------- Mount ---------- */

  const CAPSULE_SELECTOR = '#home_maincap_v7 .carousel_items > a.store_main_capsule';
  const WAIT_TIMEOUT_MS = 20000;
  const SETTLE_MS = 250;

  const readCapsules = () => [...document.querySelectorAll(CAPSULE_SELECTOR)].slice(0, MAX_SLIDES);

  /*
   * Steam's takeover: a full-width sponsored band above the carousel (.home_page_takeover_link),
   * an empty link over the page's background art. Its only data is the appid, the store link
   * and an aria-label of "<Title>. <Tagline>." It becomes the hero's first slide; the art,
   * logo, description and screenshots come from the same remote lookups as every other slide.
   * The title may contain periods ("S.T.A.L.K.E.R. 2"), so the tagline is the last sentence.
   */
  const TAKEOVER_SELECTOR = '.home_page_takeover_link a.home_page_takeover_sizer[data-ds-appid]';
  const TAKEOVER_LABEL = /^(.+?)\.\s+([^.]+?)\.?$/s;

  const readTakeover = () => {
    const link = document.querySelector(TAKEOVER_SELECTOR);
    const appid = link?.dataset.dsAppid?.split(',')[0];
    if (!appid) return null;
    const label = squash(link.getAttribute('aria-label'));
    const [, name, tagline] = TAKEOVER_LABEL.exec(label) ?? [null, label.replace(/\.$/, ''), ''];
    if (!name) return null;
    const folder = `${ASSET_BASE}${appid}/`;
    const slide = {
      appid,
      href: link.href,
      title: name,
      reason: tagline ? { kind: 'takeover', badge: tagline } : null,
      review: null,
      reviewCount: '',
      price: null,
      shots: [],
      description: '',
      art: [`${folder}library_hero.jpg`, `${folder}page_bg_raw.jpg`, `${folder}header.jpg`],
      logo: [`${folder}logo.png`],
      capsule: [`${folder}capsule_616x353.jpg`, `${folder}header.jpg`],
      requested: false,
    };
    applyLibraryArt(slide, artCache.get(appid));
    applyStoreDetails(slide, detailsCache.get(appid));
    return slide;
  };

  /**
   * Resolve once Steam's Featured carousel (rendered by script after load) has stopped growing
   * for SETTLE_MS, or after WAIT_TIMEOUT_MS.
   */
  const waitForCapsules = () =>
    new Promise((resolve) => {
      const waiting = scope();
      let lastCount = -1;
      const finish = () => {
        waiting.destroy();
        resolve(life.alive ? readCapsules() : []);
      };
      const check = () => {
        const count = readCapsules().length;
        if (!count || count === lastCount) return;
        lastCount = count;
        clearTimeout(settle);
        settle = setTimeout(finish, SETTLE_MS);
      };
      let settle = 0;
      waiting.add(() => clearTimeout(settle));
      waiting.observe(check);
      waiting.timeout(finish, WAIT_TIMEOUT_MS);
      life.add(finish);
      check();
    });

  /*
   * The takeover's page art isn't one known element: Steam ships it as a background holder, a
   * video, a menu strip, inline styles or pseudo-elements, and changes which per campaign. So
   * it is found by where it paints, as the page settles (Steam can inject the video late):
   *   - elements whose box covers the hero's gutters or sits behind it (by box, not hit-test,
   *     so pointer-events: none layers count) that aren't the hero's containers or the theme's
   *     own UI and paint art → data-se-takeover-art, hidden;
   *   - the hero's containers up to <html>, which never carry art of their own on this page
   *     (the theme only paints them with --se-bg): any background image on them or their
   *     ::before/::after → data-se-takeover-bg, image removed; any colour other than the
   *     page's → data-se-takeover-fill, colour removed.
   * front/hero.css holds the matching rules.
   */
  const TAKEOVER_ART = 'data-se-takeover-art';
  const TAKEOVER_BG = 'data-se-takeover-bg';
  const TAKEOVER_FILL = 'data-se-takeover-fill';
  const MEDIA = 'img, picture, video, canvas, iframe';
  const PROBE_DELAYS_MS = [0, 500, 2000];

  const isClear = (color) => /^(transparent|rgba\(.*,\s*0\))$/.test(color);
  const hasImage = (node) =>
    [null, '::before', '::after'].some((pseudo) => getComputedStyle(node, pseudo).backgroundImage !== 'none');
  const paintsArt = (node) => node.matches(MEDIA) || hasImage(node) || !isClear(getComputedStyle(node).backgroundColor);

  const hideTakeoverArt = (hero) => {
    const pageColor = () => getComputedStyle(document.querySelector('.responsive_page_template_content') ?? document.body).backgroundColor;

    const probeContainers = () => {
      const page = pageColor();
      for (let node = hero.parentElement; node; node = node.parentElement) {
        if (hasImage(node)) dom.mark(node, TAKEOVER_BG);
        if (node === document.body || node === document.documentElement) continue; // theme-painted
        const color = getComputedStyle(node).backgroundColor;
        if (!isClear(color) && color !== page) dom.mark(node, TAKEOVER_FILL);
      }
    };

    /*
     * Hit-testing (elementsFromPoint) skips pointer-events: none layers, which is how Steam
     * ships some takeover art, so every element's box is checked against the probe points.
     */
    const probeLayers = () => {
      const rect = hero.getBoundingClientRect();
      if (!rect.height) return;
      // A grid just outside each side of the hero (the takeover art is barely wider than it),
      // mid-gutter, and just inside its edges, at three heights: the art can be in pieces.
      const xs = [rect.left - 8, rect.right + 8, rect.left / 2, (rect.right + innerWidth) / 2, rect.left + 8, rect.right - 8]
        .map((x) => Math.min(innerWidth - 1, Math.max(1, x)));
      const ys = [rect.top + 16, rect.top + rect.height / 2, rect.top + rect.height * 0.7];
      for (const node of document.body.querySelectorAll('*')) {
        if (node.contains(hero) || hero.contains(node) || dom.isOwn(node) || node.closest('[data-se-nav]')) continue;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const covers = xs.some((x) => x >= box.left && x <= box.right) && ys.some((y) => y >= box.top && y <= box.bottom);
        if (!covers) continue;
        if (getComputedStyle(node).visibility === 'hidden') continue;
        if (paintsArt(node)) dom.mark(node, TAKEOVER_ART);
      }
    };

    /*
     * Takeover videos are stopped and unloaded, not just hidden: Chromium on Windows plays
     * video through a compositor overlay that can keep showing its last frame over the page
     * after the element is display: none. Sources are kept to put back on teardown.
     */
    const TAKEOVER_VIDEO = '.fullscreen-bg video, .page_background_holder video, #page_background_holder video, .home_page_takeover_link video, [data-se-takeover-art] video, video[data-se-takeover-art]';
    const unloaded = new Map(); // video → { src, sources }
    const unloadVideos = () => {
      for (const video of document.querySelectorAll(TAKEOVER_VIDEO)) {
        if (unloaded.has(video) || dom.isOwn(video)) continue;
        unloaded.set(video, { src: video.getAttribute('src'), sources: [...video.querySelectorAll('source')] });
        video.pause();
        video.removeAttribute('src');
        video.querySelectorAll('source').forEach((source) => source.remove());
        video.load(); // drops the decoder and its overlay
      }
    };
    life.add(() => {
      for (const [video, { src, sources }] of unloaded) {
        if (src !== null) video.setAttribute('src', src);
        video.append(...sources);
        video.load();
      }
      unloaded.clear();
    });

    const probe = () => {
      if (!life.alive) return;
      probeContainers();
      probeLayers();
      unloadVideos();
    };
    for (const delay of PROBE_DELAYS_MS) life.timeout(probe, delay);
    life.listen(window, 'load', probe, { once: true });
    life.add(() => {
      const marks = [TAKEOVER_ART, TAKEOVER_BG, TAKEOVER_FILL];
      for (const node of document.querySelectorAll(marks.map((name) => `[${name}]`).join(', '))) {
        marks.forEach((name) => node.removeAttribute(name));
      }
    });
  };

  const mount = (capsules) => {
    const source = document.getElementById('home_maincap_v7');
    const takeover = readTakeover();
    const featured = capsules.map(readSlide).filter((slide) => slide.title && slide.art.length);
    const slides = takeover
      ? [takeover, ...featured.filter((slide) => slide.appid !== takeover.appid)].slice(0, MAX_SLIDES)
      : featured;
    if (!source || !slides.length) return;
    const hero = buildHero(slides);
    source.before(hero.element);
    const root = document.documentElement;
    root.classList.add('se-cinema-on');
    root.classList.toggle('se-takeover', Boolean(takeover));
    life.add(() => {
      hero.element.remove();
      root.classList.remove('se-cinema-on', 'se-takeover');
    });
    if (takeover) hideTakeoverArt(hero.element);
    hero.start();
  };

  waitForCapsules().then((capsules) => {
    if (life.alive) mount(capsules);
  });

  return () => life.destroy();
};
