/*
 * Store front page, the Cinema hero's takeover art (front/hero.js uses it; its rules are in
 * front/hero.css). Publishes web.parts.takeover = { hideTakeoverArt(hero, life, onArt) }:
 * finds the art Steam's takeover paints around the hero, hands its URLs to onArt (the slide's
 * last-resort art), then hides it; life (the page's dom.scope()) undoes every mark.
 */
(() => {
  'use strict';
  const web = window.__seWeb;
  const { isOwn, mark } = web.dom;

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

  /*
   * The art the takeover paints is also the slide's last resort: a sale or event takeover
   * (a Fest) has no library hero, page background or header under its appid, so without it
   * the slide had no art at all. Read before it is hidden or stripped (the marks' rules
   * remove background images), from the takeover's own holders and the hero's containers.
   */
  const TAKEOVER_SOURCES = '.home_page_takeover_link, #page_background_holder, .page_background_holder, .fullscreen-bg, [data-se-takeover-art]';
  const URL_IN_CSS = /url\(\s*["']?([^"')]+?)["']?\s*\)/g;
  // An image inside the takeover counts as art only when it's a wide picture, not its logo or a
  // badge: loaded, at least this wide, and landscape (a later probe takes one still loading)
  const ART_MIN_W = 960;
  const isArtImage = (img) => img.naturalWidth >= ART_MIN_W && img.naturalWidth >= 1.5 * img.naturalHeight;

  const paintedURLs = (node) => {
    const urls = [];
    for (const pseudo of [null, '::before', '::after']) {
      for (const [, url] of getComputedStyle(node, pseudo).backgroundImage.matchAll(URL_IN_CSS)) urls.push(url);
    }
    if (node.matches('img') && isArtImage(node)) urls.push(node.currentSrc || node.src);
    if (node.matches('video')) urls.push(node.poster);
    return urls.filter((url) => /^https?:/.test(url));
  };

  const isClear = (color) => /^(transparent|rgba\(.*,\s*0\))$/.test(color);
  const hasImage = (node) =>
    [null, '::before', '::after'].some((pseudo) => getComputedStyle(node, pseudo).backgroundImage !== 'none');
  const paintsArt = (node) => node.matches(MEDIA) || hasImage(node) || !isClear(getComputedStyle(node).backgroundColor);

  const hideTakeoverArt = (hero, life, onArt) => {
    const found = new Set();
    const collectArt = () => {
      const before = found.size;
      const nodes = [];
      for (let node = hero.parentElement; node; node = node.parentElement) nodes.push(node);
      for (const holder of document.querySelectorAll(TAKEOVER_SOURCES)) nodes.push(holder, ...holder.querySelectorAll('*'));
      for (const node of nodes) {
        if (!isOwn(node)) paintedURLs(node).forEach((url) => found.add(url));
      }
      if (found.size > before) onArt([...found]);
    };

    const pageColor = () => getComputedStyle(document.querySelector('.responsive_page_template_content') ?? document.body).backgroundColor;

    // Reads only: the marks it finds are pushed to `marks` and written after every probe's reads
    const probeContainers = (marks) => {
      const page = pageColor();
      for (let node = hero.parentElement; node; node = node.parentElement) {
        if (hasImage(node)) marks.push([node, TAKEOVER_BG]);
        if (node === document.body || node === document.documentElement) continue; // theme-painted
        const color = getComputedStyle(node).backgroundColor;
        if (!isClear(color) && color !== page) marks.push([node, TAKEOVER_FILL]);
      }
    };

    /*
     * Hit-testing (elementsFromPoint) skips pointer-events: none layers, which is how Steam
     * ships some takeover art, so every element's box is checked against the probe points.
     */
    const probeLayers = (marks) => {
      const rect = hero.getBoundingClientRect();
      if (!rect.height) return;
      // A grid just outside each side of the hero (the takeover art is barely wider than it),
      // mid-gutter, and just inside its edges, at three heights: the art can be in pieces.
      const xs = [rect.left - 8, rect.right + 8, rect.left / 2, (rect.right + innerWidth) / 2, rect.left + 8, rect.right - 8]
        .map((x) => Math.min(innerWidth - 1, Math.max(1, x)));
      const ys = [rect.top + 16, rect.top + rect.height / 2, rect.top + rect.height * 0.7];
      for (const node of document.body.querySelectorAll('*')) {
        if (node.contains(hero) || hero.contains(node) || isOwn(node) || node.closest('[data-se-nav]')) continue;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const covers = xs.some((x) => x >= box.left && x <= box.right) && ys.some((y) => y >= box.top && y <= box.bottom);
        if (!covers) continue;
        if (getComputedStyle(node).visibility === 'hidden') continue;
        if (paintsArt(node)) marks.push([node, TAKEOVER_ART]);
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
        if (unloaded.has(video) || isOwn(video)) continue;
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

    // Every read first (a mark hides or strips a box, so marking mid-loop forced a layout per
    // mark), then the marks
    const probe = () => {
      if (!life.alive) return;
      collectArt();
      const marks = [];
      probeContainers(marks);
      probeLayers(marks);
      for (const [node, name] of marks) mark(node, name);
      unloadVideos();
    };
    // Now, before mount() sets html.se-takeover: its rules strip the takeover body's background
    collectArt();
    for (const delay of PROBE_DELAYS_MS) life.timeout(probe, delay);
    life.listen(window, 'load', probe, { once: true });
    life.add(() => {
      const marks = [TAKEOVER_ART, TAKEOVER_BG, TAKEOVER_FILL];
      for (const node of document.querySelectorAll(marks.map((name) => `[${name}]`).join(', '))) {
        marks.forEach((name) => node.removeAttribute(name));
      }
    });
  };

  web.parts.takeover = { hideTakeoverArt };
})();
