/*
 * Scroll to top, on every Store and Community page: the library game page's button
 * (client/game-page/activity.css) brought to the web. A 48px round dark button in the bottom-right corner
 * with an arrow, ringed in the accent colour by how far down the page you are. It rises in
 * once you've scrolled past the first screen and drops away again near the top.
 *
 * Both sites scroll the window on every page (the store's client-side navigations included),
 * so one button lives for the whole page; its progress is --se-scroll (0..1) on the button.
 * Steam's own (the hub's "Back to top") is hidden where the theme's stands in.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const SHOW_AFTER = 0.6; // of the window's height

  web.define((dom) => {
    const $ = dom.scope();

    const button = dom.el('button', { class: 'se-top', type: 'button', 'aria-label': 'Scroll to top', title: 'Scroll to top' }, dom.el('span', { class: 'se-top-face' }));
    $.listen(button, 'click', () => {
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    });

    /*
     * The page's height comes with <body>'s ResizeObserver entries (pages grow after load: rows,
     * React routes), never a read: read in a frame callback, or even right after layout once
     * Steam's own ResizeObserver callbacks had redrawn, it paid the style pass of a page still
     * being drawn on every growth. The scroll position is read in its scroll event (where the
     * page is laid out), not on a growth; the ring is written after the next layout.
     */
    let pageH = 0;
    let y = 0;
    const update = dom.afterLayout(() => {
      const range = pageH - innerHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, y / range)) : 0;
      dom.setVar(button, '--se-scroll', progress.toFixed(4));
      button.toggleAttribute('data-shown', y > innerHeight * SHOW_AFTER);
    });
    $.listen(window, 'scroll', () => {
      y = scrollY;
      update();
    }, { passive: true });
    $.listen(window, 'resize', update, { passive: true });
    $.add(update.cancel);

    (document.body ?? document.documentElement).append(button);
    $.add(() => button.remove());
    const page = document.body ?? document.documentElement;
    // The page scrolls <body>'s box and its margins: those read once, in the first entry (right
    // after a layout), as no site changes them later
    let margins = null;
    const resize = new ResizeObserver(([entry]) => {
      if (margins === null) {
        const style = getComputedStyle(page);
        margins = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
      }
      pageH = (entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height) + margins;
      update();
    });
    resize.observe(page);
    $.add(() => resize.disconnect());

    return () => $.destroy();
  });
})();
