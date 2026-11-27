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
 *
 * The takeover's page art is found and hidden by front/hero-takeover.js (web.parts.takeover),
 * listed before this file.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  web.define((dom) => {
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
     * The game a slide is for: the app its link opens (store.steampowered.com/app/<id>), else
     * the first of its data-ds-appid. A promotion (the Steam Awards, a sale) links to its own page
     * and names app 0 or an advertising app (its store details' type, applyStoreDetails); a bundle
     * links to /bundle/: no game, so no game art, wishlist or lookups.
     */
    const appOf = (link) => {
      const id = /\/app\/(\d+)/.exec(link?.href ?? '')?.[1] ?? link?.dataset.dsAppid?.split(',')[0]?.trim();
      return id && /^[1-9]\d*$/.test(id) ? id : null;
    };

    /* ---------- Remote data, cached per app ---------- */

    /*
     * Art is never guessed from file names: newer games keep theirs under per-file hashes, and
     * the CDN answers some missing files with a 1×1 picture instead of an error. A slide starts
     * from the images its own capsule shows, then takes what Steam lists for the game: logos and
     * library heroes from the app's PICS info (common.library_assets_full; api.steamcmd.net
     * serves it publicly with open CORS), and the header, capsule, background, short description
     * and screenshots from the store's own /api/appdetails, and its type (a sale's advertising
     * app is a promotion). Both are cached in localStorage: hits for a week, misses for a day.
     * Fetched only for the slide on screen and the next one.
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
      } catch { /* storage unreadable: the default stands */ }
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
          } catch {} // private mode / quota: the in-memory copy still serves this visit
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
    const detailsCache = createCache(`se-store-details-v3-${pageLanguage}`, (entry) => Boolean(entry.description || entry.shots?.length || entry.header));
    // v2 had no type; its entries would keep a sale's slide drawn as a game for a week
    try {
      localStorage.removeItem(`se-store-details-v2-${pageLanguage}`);
    } catch { /* storage refused: the old entry stays, unused */ }

    const fetchLibraryArt = async (appid) => {
      try {
        const assets = (await fetchJson(`${APPINFO_URL}${appid}`))?.data?.[appid]?.common?.library_assets_full;
        const file = (asset) => pickLocalized(asset?.image2x) ?? pickLocalized(asset?.image);
        const url = (name) => (name ? `${ASSET_BASE}${appid}/${name}` : null);
        const art = { logo: url(file(assets?.library_logo)), hero: url(file(assets?.library_hero)) };
        artCache.set(appid, art);
        return art;
      } catch {
        return {}; // network/CSP failure: not cached, so the next visit retries
      }
    };

    const decodeHtml = (html) => new DOMParser().parseFromString(html ?? '', 'text/html').body.textContent.trim();

    const fetchStoreDetails = async (appid) => {
      try {
        const url = `/api/appdetails?appids=${appid}&l=${encodeURIComponent(pageLanguage)}`;
        const data = (await fetchJson(url, { credentials: 'same-origin' }))?.[appid]?.data;
        const details = {
          type: data?.type || '',
          description: decodeHtml(data?.short_description),
          shots: (data?.screenshots ?? []).slice(0, 4).map((shot) => ({ thumb: shot.path_thumbnail, full: shot.path_full })),
          header: data?.header_image || '',
          capsule: data?.capsule_imagev5 || data?.capsule_image || '',
          background: data?.background_raw || data?.background || '',
        };
        detailsCache.set(appid, details);
        return details;
      } catch {
        return {};
      }
    };

    /*
     * Fill a slide's description, top up its screenshots to four, and add the store's art after
     * what the slide has (background, then header, for the art; capsule and header for the
     * framed tile); true if anything changed. An advertising app (a sale's takeover) makes the
     * slide a promotion.
     */
    const applyStoreDetails = (slide, details) => {
      let changed = false;
      if (details?.type === 'advertising' && !slide.promo) {
        slide.promo = true;
        changed = true;
      }
      const add = (list, url) => {
        if (!url || list.includes(url)) return;
        list.push(url);
        changed = true;
      };
      add(slide.art, details?.background);
      add(slide.art, details?.header);
      add(slide.capsule, details?.capsule);
      add(slide.capsule, details?.header);
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
      const appid = appOf(capsule);
      const mainCapsule = capsule.querySelector('.main_capsule');
      const thumb = mainCapsule?.dataset.backgroundImageUrl ?? '';
      const thumb2x = mainCapsule?.dataset.backgroundImage2xUrl ?? '';
      const shots = [...capsule.querySelectorAll('.screenshots > div')]
        .map((node) => node.dataset.backgroundImageUrl || /url\(["']?([^"')]+)/.exec(node.style.backgroundImage)?.[1])
        .filter(Boolean);
      const full = (url) => url?.replace(/\.\d+x\d+\.jpg/, '.1920x1080.jpg');
      const slide = {
        appid,
        href: capsule.href,
        title: squash(capsule.querySelector('.app_name')?.textContent),
        reason: readReason(capsule),
        promo: false,
        review: capsule.querySelector('.game_review_summary'),
        reviewCount: squash(capsule.querySelector('.review_count')?.textContent),
        price: readPrice(capsule),
        shots: shots.slice(0, 4).map((url) => ({ thumb: url, art: [full(url), url] })),
        description: '',
        // Best art first; each candidate is tried in order on load error. The library hero and
        // logo join from the lookups.
        art: [full(shots[0]), shots[0], thumb].filter(Boolean),
        logo: [],
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
     * the older one (false) instead of leaving it pending. A picture of PLACEHOLDER_PX or less
     * counts as missing: the CDN answers some absent files with a 1×1 one.
     */
    const PLACEHOLDER_PX = 8;
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
          img.onload = () => (img.naturalWidth > PLACEHOLDER_PX && img.naturalHeight > PLACEHOLDER_PX ? settle(true) : next());
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
      // A heading by role, not an <h2>: Steam's store styles h2 small and grey, over the hero's own size
      const title = el('div', { class: 'se-cinema__title', role: 'heading', 'aria-level': '2' });
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
        const canWish = wishlist.available() && Boolean(slide.appid) && !slide.promo;
        heart.hidden = !canWish;
        if (!canWish) return;
        const on = wished.get(slide.appid) ?? wishlist.has(slide.appid);
        heart.setAttribute('aria-pressed', String(on));
        heart.setAttribute('aria-label', on ? `Remove ${slide.title} from wishlist` : `Add ${slide.title} to wishlist`);
      };
      life.listen(heart, 'click', async () => {
        const slide = slides[current];
        if (!slide?.appid || slide.promo || heart.disabled) return;
        const next = heart.getAttribute('aria-pressed') !== 'true';
        heart.disabled = true;
        wished.set(slide.appid, next);
        renderWish(slide);
        try {
          await wishlist.set(slide.appid, next);
        } catch {
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
        cta.href = slide.href;
        cta.setAttribute('aria-label', `View ${slide.title} in store`);

        if (slide.promo) {
          // A promotion's bar names the event over its line (the takeover's tagline, else the
          // store's description); with no line (Steam's generic "Featured Promotion") it is bare
          const line = slide.reason?.badge || slide.description;
          meta.replaceChildren(...(line ? [
            el('span', { class: 'se-cinema__event', text: slide.title }),
            el('span', { class: 'se-cinema__event-line', text: line }),
          ] : []));
          description.hidden = true;
          shots.replaceChildren();
          shots.hidden = true;
        } else {
          meta.replaceChildren(...[
            renderReview(slide),
            slide.reason?.badge && el('span', { class: 'se-cinema__badge', text: slide.reason.badge }),
          ].filter(Boolean));
          description.textContent = slide.description;
          description.hidden = !slide.description;
          renderShots(slide, ticket);
        }
        renderPrice(price, slide.promo ? null : slide.price);
        renderWish(slide);
        // Nothing for the bar (a promotion with no line): only its buy controls show (hero.css);
        // a refresh that brings anything redraws it full
        hero.classList.toggle('is-bare', !meta.childElementCount && description.hidden && shots.hidden && price.hidden);

        hero.classList.remove('has-logo', 'has-capsule');
        hero.classList.toggle('is-long-title', slide.title.length > 28);
        hero.classList.toggle('is-promo', Boolean(slide.promo));
        // A promotion's art names it: no logo or capsule repeating it
        hero.classList.toggle('is-art-pending', !slide.promo);
        if (!slide.promo) loadFirst(logo, slide.logo).then(async (ok) => {
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

      return { element: hero, start: () => go(0), refresh };
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
     * Its art is the takeover's own (front/hero-takeover.js), then what the lookups list; an
     * event's takeover (the Steam Awards, a sale) has no game behind it (appOf), so only its own
     * art, its title in the logo's place. One that links to a sale or event page, not a game's,
     * is a promotion even when it names an app (an advertising one).
     */
    const TAKEOVER_SELECTOR = '.home_page_takeover_link a.home_page_takeover_sizer[data-ds-appid]';
    const TAKEOVER_LABEL = /^(.+?)\.\s+([^.]+?)\.?$/s;

    const readTakeover = () => {
      const link = document.querySelector(TAKEOVER_SELECTOR);
      if (!link) return null;
      const appid = appOf(link);
      const label = squash(link.getAttribute('aria-label'));
      const [, name, tagline] = TAKEOVER_LABEL.exec(label) ?? [null, label.replace(/\.$/, ''), ''];
      if (!name) return null;
      const slide = {
        appid,
        href: link.href,
        title: name,
        reason: tagline ? { kind: 'takeover', badge: tagline } : null,
        // A promotion (no game behind it): its art names it; Steam's label is only "Featured Promotion"
        promo: !appid || !/\/app\/\d+/.test(link.href),
        review: null,
        reviewCount: '',
        price: null,
        shots: [],
        description: '',
        art: [],
        logo: [],
        capsule: [],
        requested: false,
      };
      if (!appid) return slide;
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

    const mount = (capsules, takeoverPart) => {
      const source = document.getElementById('home_maincap_v7');
      const takeover = readTakeover();
      const featured = capsules.map(readSlide).filter((slide) => slide.title && slide.art.length);
      const slides = takeover
        ? [takeover, ...featured.filter((slide) => !takeover.appid || slide.appid !== takeover.appid)].slice(0, MAX_SLIDES)
        : featured;
      if (!source || !slides.length) return;
      const hero = buildHero(slides);
      source.before(hero.element);
      const root = document.documentElement;
      life.add(() => {
        hero.element.remove();
        root.classList.remove('se-cinema-on', 'se-takeover');
      });
      // Before html.se-takeover: hideTakeoverArt reads the takeover's art while it still paints
      if (takeover && takeoverPart) {
        // The takeover's own art goes in after a library hero, before the store's background and
        // header (applyStoreDetails adds those last).
        takeoverPart.hideTakeoverArt(hero.element, life, (urls) => {
          const fresh = urls.filter((url) => !takeover.art.includes(url));
          if (!fresh.length) return;
          const at = takeover.art.findIndex((url) => !/library_hero/.test(url));
          takeover.art.splice(at < 0 ? takeover.art.length : at, 0, ...fresh);
          hero.refresh(takeover);
        });
      }
      root.classList.add('se-cinema-on');
      root.classList.toggle('se-takeover', Boolean(takeover));
      hero.start();
    };

    Promise.all([waitForCapsules(), Promise.resolve(web.parts.takeover)]).then(([capsules, takeoverPart]) => {
      if (life.alive) mount(capsules, takeoverPart);
    });

    return () => life.destroy();
  });
})();
