/*
 * Age check (/agecheck/...): the game's art blurred behind the gate (agecheck/page.css).
 *
 * For an app, its library hero from Steam's CDN (two hosts, in order); for a package or bundle,
 * or an app without one, the capsule the gate already shows. Set on the root
 * (--se-agecheck-art, [data-se-agecheck-art]) rather than on Steam's React nodes, which can
 * re-render, and only once the image has loaded.
 *
 * Date lists: each dropdown's open list is a fixed popover (floating-ui places it), so CSS
 * can't size it from its pill. When one opens it gets its pill's width (--se-agecheck-drop-w);
 * floating-ui re-places it on the resize.
 *
 * Parts: every hashed class the gate's styles need is in the map below and tagged by part
 * ([data-se-age~="<part>"]), so agecheck/page.css never names a hash.
 *
 * destroy() removes the art, the widths, the tags and the observers.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  /*
   * Every hashed class of the gate the page depends on, by part: this map is their only home.
   * The page tags each part ([data-se-age~="<part>"]) and agecheck/page.css styles the parts.
   */
  const ROLE = 'data-se-age';
  const PARTS = [
    ['stage', '.jGMVnjZbmZM-'],
    ['gate', '.K5-xYYRk2fI-'],
    ['card', '.-BS81QkqCE4-'],
    ['column', '.uX2L6rln4Xo-'],
    ['actions-pane', '.pKMs0KjcQSg-'],
    ['capsule', '.GoZhmz8i6LU-'],
    ['description', '.xhBUZ1iq97U-'],
    ['description-label', '.UEx0MpggIp8-'],
    ['description-text', '.E-F5JVsCXEo-'],
    ['birth', '.wKqhKmTFfX0-'],
    ['prompt', '.LLpupFpyur0-'],
    ['dates', '.GLhJR1fY-7E-'],
    ['actions', '.ECFvNEwp5uM-'],
    ['notes', '.XMtwFQVfxiI-'],
  ];
  const SEL = Object.fromEntries(PARTS);
  const CAPSULE = `${SEL.stage} ${SEL.capsule} img`;
  const DATE_ROW = SEL.dates;
  const LIST = ':scope > [role="listbox"]';

  /** The pill a list belongs to: the one that names it, else the open one, else the one before. */
  const pillOf = (list, row) =>
    (list.id && row.querySelector(`[aria-controls="${CSS.escape(list.id)}"]`)) ||
    row.querySelector(':scope > [aria-expanded="true"]') ||
    list.previousElementSibling;

  web.define(async (dom) => {
    const $ = dom.scope();
    const root = document.documentElement;
    const appid = location.pathname.match(/^\/agecheck\/app\/(\d+)/i)?.[1];

    await dom.ready();
    const capsule = document.querySelector(CAPSULE);
    const candidates = [...(appid ? dom.heroURLs(appid) : []), capsule?.currentSrc || capsule?.src].filter(Boolean);

    dom.firstLoaded(candidates).then((url) => {
      if (!$.alive || !url) return;
      dom.setVar(root, '--se-agecheck-art', `url("${url}")`);
      $.mark(root, 'data-se-agecheck-art');
    });

    $.add(() => root.style.removeProperty('--se-agecheck-art'));

    // Parts: read every match first, then write the tags.
    const tagged = new Set();
    const tagParts = () => {
      const parts = new Map();
      for (const [part, selector] of PARTS) {
        for (const node of document.querySelectorAll(selector)) parts.set(node, [...(parts.get(node) || []), part]);
      }
      for (const [node, names] of parts) {
        dom.mark(node, ROLE, names.join(' '));
        tagged.add(node);
      }
      for (const node of tagged) if (!node.isConnected) tagged.delete(node);
    };
    tagParts();
    $.observe(tagParts);
    $.add(() => {
      for (const node of tagged) node.removeAttribute(ROLE);
      tagged.clear();
    });

    const sized = new Set();
    const sizeLists = () => {
      for (const row of document.querySelectorAll(DATE_ROW)) {
        for (const list of row.querySelectorAll(LIST)) {
          const pill = pillOf(list, row);
          if (!pill || pill.matches('[role="listbox"]')) continue;
          dom.setVar(list, '--se-agecheck-drop-w', `${pill.getBoundingClientRect().width}px`);
          sized.add(list);
        }
      }
      for (const list of sized) if (!list.isConnected) sized.delete(list);
    };
    sizeLists();
    $.observe(sizeLists, { filter: (record) => Boolean(record.target.closest?.(DATE_ROW)) });
    $.add(() => {
      for (const list of sized) list.style.removeProperty('--se-agecheck-drop-w');
      sized.clear();
    });
    return () => $.destroy();
  });
})();
