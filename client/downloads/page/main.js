/*
 * Wires the page: the drag guards, Steam's overview subscription, the watcher and poll, the
 * debug hotkey, and the page's API (destroy()).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedDownloadsParts;
  if (!ns) return;
  const { ITEM, NATIVE_DRAG_EVENTS, PAGE_SELECTOR, QUEUE, RBD_HANDLE, ROW, SORT_SECTION, TRACKED_ATTRS, copyText, debugKey, dropPending, findPauseHandler, finishDrag, holdNativeDrag, library, loadThemeVersion, mountedNodes, openGame, rbdHandles, schedule, searchGames, steamDownloads, syncLibrary, update, watchPending } = ns;
  const { live } = ns;

  for (const type of NATIVE_DRAG_EVENTS) addEventListener(type, holdNativeDrag, true);
  addEventListener('pointermove', watchPending, true);
  addEventListener('pointerup', dropPending, true);
  addEventListener('pointercancel', dropPending, true);

  live.overviewSubscription = SE.run(() =>
    steamDownloads()?.RegisterForDownloadOverview?.((overview) => {
      live.liveOverview = overview;
      schedule();
    })
  );

  // The Library list mounted beside the page and the shell's chrome change all the time and
  // never affect the page
  const besidePage = SE.inside('.se-dl-native-list, .se-dl-library');
  const ignore = (node) => SE.inSide(node) || besidePage(node);
  const watcher = SE.watch(update, { attributes: ['aria-valuenow'], ignore });
  const timer = SE.poll(schedule, 1500, { active: () => SE.visible(PAGE_SELECTOR) });
  schedule();
  addEventListener('keydown', debugKey, true);

  window.__steamEnhancedDownloads = {
    get library() { return library.isConnected ? library : null; },
    // Support: copies Steam's transfer block and queue markup, and lists the download API
    async debug() {
      const build = await loadThemeVersion();
      const page = document.querySelector(PAGE_SELECTOR);
      const row = page?.querySelector('[data-se-dlh-source]');
      const pause = findPauseHandler(row);
      const report = {
        build,
        api: Object.keys(steamDownloads() || {}),
        sortSections: page?.querySelectorAll(SORT_SECTION).length ?? 0,
        items: page?.querySelectorAll(`${SORT_SECTION} ${ITEM}`).length ?? 0,
        grips: page?.querySelectorAll('.se-dl-grip').length ?? 0,
        draggable: [...(page?.querySelectorAll('[draggable]') || [])].map((el) => `${el.className}:${el.getAttribute('draggable')}`),
        overview: live.liveOverview,
        pause: pause ? pause.el.outerHTML.slice(0, 400) : null,
        transfer: row?.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 20000),
        queue: page?.querySelector(QUEUE)?.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 20000),
      };
      copyText(JSON.stringify(report, null, 2));
      return report;
    },
    searchGames,
    openFirstGame: () => openGame(live.matches[0]?.appid),
    destroy() {
      watcher.disconnect();
      syncLibrary();
      live.restoreLibraryRoute?.();
      timer?.disconnect();
      SE.run(() => live.overviewSubscription?.unregister());
      finishDrag(false);
      for (const type of NATIVE_DRAG_EVENTS) removeEventListener(type, holdNativeDrag, true);
      removeEventListener('pointermove', watchPending, true);
      removeEventListener('pointerup', dropPending, true);
      removeEventListener('pointercancel', dropPending, true);
      removeEventListener('keydown', debugKey, true);
      for (const [el, value] of rbdHandles) el.setAttribute(RBD_HANDLE, value);
      rbdHandles.clear();
      if (live.frame) cancelAnimationFrame(live.frame);
      for (const node of mountedNodes) node.remove();
      mountedNodes.clear();
      for (const el of document.querySelectorAll('[data-se-dlh-source]')) el.removeAttribute('aria-hidden');
      for (const el of document.querySelectorAll(`${PAGE_SELECTOR} ${ROW}`)) SE.cssVar(el, '--dl-actions-w', null);
      for (const attrName of TRACKED_ATTRS) {
        for (const el of document.querySelectorAll(`${PAGE_SELECTOR} [${attrName}], ${PAGE_SELECTOR}[${attrName}]`)) {
          el.removeAttribute(attrName);
        }
      }
      delete window.__steamEnhancedDownloads;
    },
  };
});
