/*
 * The update pass: decorates the visible page once per frame when scheduled.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { C } = SE;
  const { COPY, PAGE_SELECTOR, appIdFromArt, enableNativeLibrary, mountedNodes, rbdHandles, setAttr, syncBackdrop, syncGrips, syncHero, syncLibrary, tagActions } = ns;
  const { live } = ns;

  // Only the visible page is decorated: a mounted but hidden one keeps its last state
  const update = () => {
    if (live.frame) cancelAnimationFrame(live.frame);
    live.frame = 0;
    for (const node of mountedNodes) {
      if (!node.isConnected) mountedNodes.delete(node);
    }
    for (const el of rbdHandles.keys()) {
      if (!el.isConnected) rbdHandles.delete(el);
    }
    const page = [...document.querySelectorAll(PAGE_SELECTOR)].find((candidate) => candidate.getClientRects().length);
    if (page) enableNativeLibrary(page);
    syncLibrary(page?.closest('.se-dl-native-layout') ? null : page);
    if (!page) return;
    ns.loadThemeVersion();

    setAttr(page, 'data-se-dl-title', COPY.title);
    // One transfer is in progress at a time: the first active item is the hero
    const item = page.querySelector(`.${C.DownloadSectionActiveItem}`);
    const active = !!item?.querySelector('[role="progressbar"]');
    // Absolute URL: a relative one in a custom property resolves against the theme's
    // stylesheet, not the page, and the backdrop would load nothing
    const heroImage = item?.querySelector(`.${C.HeaderImage} img`);
    const pageArt = heroImage?.currentSrc || heroImage?.src || '';

    syncHero(page, item, appIdFromArt(pageArt), active);
    syncBackdrop(page, pageArt);
    tagActions(page);
    if (!live.drag) syncGrips(page);

    for (const countNode of page.querySelectorAll(`.${C.Count}`)) {
      const match = /\(\s*(\d+)\s*\)/.exec(countNode.textContent);
      setAttr(countNode, 'data-se-count', match ? match[1] : '');
    }
  };

  const schedule = () => {
    if (!live.frame) live.frame = requestAnimationFrame(update);
  };

  Object.assign(ns, { schedule, update });
})(window.__se);
