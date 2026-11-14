/*
 * Steam Settings, Game Properties and Millennium Settings: the update pass, watchers, start, and
 * the API (destroy()).
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
  if (!ns) return;
  const { fromProps, attr: setAttr } = SE;
  const {
    ACTIVE, BY_NAME, CONTENT, ITEM, LIST, MILL_BY_KEY, OWN, PRE_FOR, PROPS_ROOT, PROPS_SIZE, SIZE,
    TITLE, bytesOf, cards, fmtBytes, isSteamSettings, learn, millPageOf, norm, pageNameOf, pickers,
    preLabels, propsPage, propsSidebar, resetProps, revealHit, rows, scheduleScan, sections,
    sidebar, fillWindow, sizeWindow, unfillWindow,
  } = ns;
  const { live } = ns;

  /*
   * millennium-pages.js decorates Millennium's pages from inside this pass (hooks.before runs
   * ahead of the card steps, hooks.after once they are done), so its marks and ours are written
   * once per pass and never undo each other.
   */
  const millApi = {
    pre: (el, label) => (label ? PRE_FOR.set(el, label) : PRE_FOR.delete(el)),
    bytesOf,
    fmtBytes,
  };

  function millHook(name, content, key) {
    const fn = window.__seMillPages?.hooks?.[name];
    if (typeof fn !== 'function') return null;
    try {
      return fn(content, key, millApi);
    } catch (e) {
      console.warn('[Steam Enhanced] Millennium:', e);
      return null;
    }
  }

  function page(content, list, steam, mill) {
    const header = content.querySelector('.DialogHeader');
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    let sub = null;
    if (steam && header && active && !header.querySelector('button')) {
      sub = BY_NAME.get(pageNameOf(active).toLowerCase())?.[2] || null;
    }
    const millKey = mill && active ? millPageOf(active, [...list.querySelectorAll(ITEM)])?.[3] || null : null;
    if (mill) {
      setAttr(content, 'data-se-mill-page', millKey);
      if (header && !header.querySelector('button')) sub = MILL_BY_KEY.get(millKey)?.[2] || null;
      sub = millHook('before', content, millKey) || sub;
    }
    if (header && !document.documentElement.hasAttribute('data-se-props')) {
      setAttr(header, 'data-se-sub', sub);
    }
    for (const step of [pickers, sections, preLabels, cards, rows]) {
      try {
        step(content);
      } catch (e) {
        console.warn('[Steam Enhanced] settings:', step.name, e);
      }
    }
    if (mill) millHook('after', content, millKey);
    scheduleScan();
  }

  const PROPS_PAGES = ['installed files', 'local files', 'game versions & betas', 'betas', 'dlc', 'workshop', 'customization'];

  function isPropsDialog(items, content) {
    return (
      Boolean(document.querySelector(PROPS_ROOT)) ||
      items.filter((i) => PROPS_PAGES.includes(norm(pageNameOf(i)))).length >= 2 ||
      Boolean(content && fromProps(content.querySelector('.DialogBody') || content, 8, (p) => p.details?.unAppID))
    );
  }

  function update() {
    live.frame = 0;
    const list = document.querySelector(LIST);
    const root = document.documentElement;
    if (!list) {
      resetProps();
      setAttr(root, 'data-se-mill', null);
      return;
    }
    const items = [...list.querySelectorAll(ITEM)];
    const content = document.querySelector(CONTENT);
    const mill = Boolean(list.closest('.MillenniumSettings'));
    const isProps = !mill && isPropsDialog(items, content);
    const steam = !mill && !isProps && isSteamSettings(list, items);
    setAttr(root, 'data-se-settings', steam ? '' : null);
    setAttr(root, 'data-se-mill', mill ? '' : null);
    setAttr(root, 'data-se-props', isProps ? '' : null);
    live.observer?.takeRecords();
    sidebar(list, steam, mill);

    if (isProps) {
      propsSidebar(list, content);
    } else {
      resetProps();
    }
    if (content && isProps) {
      try {
        propsPage(content, list);
      } catch (e) {
        console.warn('[Steam Enhanced] properties:', e);
      }
    }
    if (content) page(content, list, steam, mill);
    fillWindow(content);
    if (content && steam) {
      try {
        learn(content, list);
        revealHit(content);
      } catch (e) {
        console.warn('[Steam Enhanced] settings search:', e);
      }
    }
    if ((steam || isProps) && live.sizedFor !== document.visibilityState && document.visibilityState === 'visible') {
      live.sizedFor = 'visible';
      sizeWindow(steam ? SIZE : PROPS_SIZE);
    }
    live.observer?.takeRecords();
  }

  function schedule() {
    if (!live.frame) live.frame = requestAnimationFrame(update);
  }

  let syncRuns = 0;
  let syncReset = 0;

  function onMutate() {
    if (syncRuns >= 4) {
      schedule();
      return;
    }
    syncRuns++;
    if (!syncReset) {
      syncReset = requestAnimationFrame(() => {
        syncRuns = 0;
        syncReset = 0;
      });
    }
    if (live.frame) {
      cancelAnimationFrame(live.frame);
      live.frame = 0;
    }
    try {
      update();
    } catch (e) {
      console.warn('[Steam Enhanced] settings:', e);
    }
  }

  function onResize() {
    unfillWindow();
    schedule();
  }

  function onVisibility() {
    if (document.visibilityState !== 'visible') live.sizedFor = null;
    else schedule();
  }

  function start() {
    // Sync: the cards and labels must be in place before Steam's re-render paints. Only the
    // dialog's own parts (page list, page, title) count, and their coming and going: the rest
    // of the window (the main window's Library, top bar, friends dock) never wakes it.
    live.observer = SE.watch(onMutate, {
      attributes: ['class'],
      sync: true,
      scope: `${LIST}, ${CONTENT}, ${TITLE}`,
      ignore: SE.inSide,
    });
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('resize', onResize);
    schedule();
  }

  // Everything update() marks lives in the dialog (or on <html>), so destroy() can undo it there
  // without touching other modules' marks of the same name elsewhere.
  const MARKS = [
    'art', 'big', 'c', 'cloud', 'cloudrow', 'count', 'cover', 'ctl', 'cur', 'danger', 'drive', 'family',
    'filtering', 'good', 'head', 'hit', 'icon', 'k', 'kbd', 'label', 'launch', 'licon', 'licon-el', 'mill-page',
    'miss', 'name', 'nickname-preview', 'notice', 'noxs', 'paccent', 'pfirst', 'pre', 'pre-text', 'primary',
    'psub', 'ptext', 'ptitle', 'rest', 'row', 'sec', 'secsub', 'seg', 'seglabel', 'size', 'sortlabel', 'sticky',
    'sub', 'sval', 'tile', 'title', 'v', 'v2', 'ws-empty',
  ].map((m) => `data-se-${m}`);
  const VARS = ['--se-seg-w', '--se-join'];

  function unmarkAll() {
    const sel = MARKS.map((m) => `[${m}]`).join(',');
    for (const root of document.querySelectorAll(`${LIST}, ${CONTENT}, ${TITLE}`)) {
      for (const el of [root, ...root.querySelectorAll(sel)]) {
        for (const m of MARKS) el.removeAttribute(m);
        for (const v of VARS) el.style.removeProperty(v);
      }
    }
    for (const m of ['data-se-settings', 'data-se-mill', 'data-se-props']) document.documentElement.removeAttribute(m);
  }

  window.__seSettings = {
    refresh: schedule,
    destroy() {
      live.observer?.disconnect();
      if (live.frame) cancelAnimationFrame(live.frame);
      if (syncReset) cancelAnimationFrame(syncReset);
      clearTimeout(live.scanTimer);
      live.search?.remove();
      live.results?.remove();
      resetProps();
      document.querySelectorAll(`[${OWN}="settings"]`).forEach((el) => el.remove());
      unmarkAll();
      unfillWindow();
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', onResize);
      delete window.__seSettings;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
  Object.assign(ns, { schedule });
})(window.__se);
