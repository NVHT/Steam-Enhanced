/*
 * Store front page modules below the hero (front/sections.css).
 *
 * The take-under banner (the sponsored band under the hero: a link painted with one background
 * image) runs the page's full width at the image's own proportions. Steam draws it at the
 * image's pixel size, so on a wide page it stopped two-thirds across. The ratio is read from
 * the image once it loads; until then, and if it never does, Steam's own sizing stays.
 *   data-se-takeunder         a sized banner; --se-takeunder-ratio holds "w / h"
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  web.define((dom) => {
    const { scope, setVar } = dom;
    const life = scope();

    const BANNER = 'a.home_page_takeunder';
    const URL_IN_CSS = /url\(\s*["']?([^"')]+?)["']?\s*\)/;
    const seen = new WeakSet();

    const naturalSize = (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 1 ? img : null);
        img.onerror = () => resolve(null);
        img.src = url;
      });

    const fit = (link) => {
      if (seen.has(link)) return;
      const url = URL_IN_CSS.exec(getComputedStyle(link).backgroundImage)?.[1];
      if (!url) return; // its image may arrive with a later class or style change
      seen.add(link);
      naturalSize(url).then((img) => {
        if (!life.alive || !img) return;
        setVar(link, '--se-takeunder-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
        life.mark(link, 'data-se-takeunder');
      });
    };

    const update = () => document.querySelectorAll(BANNER).forEach(fit);

    life.observe(update, {
      attributes: ['class', 'style'],
      filter: (record) => record.type !== 'attributes' || record.target.matches?.(BANNER),
    });
    dom.ready().then(() => life.alive && update());

    return () => {
      life.destroy();
      document.querySelectorAll(BANNER).forEach((link) => link.style.removeProperty('--se-takeunder-ratio'));
    };
  });
})();
