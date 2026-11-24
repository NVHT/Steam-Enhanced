/*
 * Steam Settings, Game Properties and Millennium Settings: the Game Properties page pass (row
 * icons, short DLC names, the header) and the sidebar.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
  if (!ns) return;
  const { C, fromProps, attr: setAttr } = SE;
  const {
    ACTIVE, FIELD, ITEM, P, PROPS_BLOCK, PROPS_NAMES, ROW_FOR, TITLE, norm, pageNameOf,
    propsFilesPage, propsGeneralPage, propsHeader, propsUpdatesPage, propsWorkshopPage, resetHeader, text,
  } = ns;

  /*
   * Every row gets an icon tile. Steam's labels are localized, so a page's top-level rows take
   * these in order; rows past the list take the page's own icon, and the page parts below
   * (cloud, files, recording) set theirs over these.
   */
  const PAGE_ROWS = {
    general: ['ingame', 'lang'],
    updates: ['dl', 'bgdl'],
    controller: ['controller'],
    // Workshop's advanced options: Load Order, Locally Enabled Items, Collections
    workshop: ['wsorder', 'wsenable', 'wscoll'],
    // Recording: Steam's global setting (a link to it), then this game's
    rec: ['recset', 'rec'],
    privacy: ['hide', 'private', 'pdlc', 'ingame'],
    custom: ['sortname'],
    shortcut: ['ingame', 'vr'],
  };
  const PAGE_ICON = Object.fromEntries(Object.values(PROPS_NAMES).map(([icon, key]) => [key, icon]));

  const DLC = {
    name: C.NameText,
    size: C.SizeDisk,
    art: C.DlcArt,
    inputHead: C.TopGap,
  };

  /*
   * A DLC list repeats its game's name on every row ("Game - Soundtrack"): what every name
   * shares, up to its last separator, is left out (data-se-short, drawn in its place).
   */
  const NAME_CUT = /^.*(?:\s[-–—|]\s|:\s)/;

  function shortNames(root) {
    const els = root ? [...root.querySelectorAll(`.${DLC.name}`)] : [];
    const names = els.map((el) => text(el));
    let cut = '';
    if (names.length >= 3) {
      const shared = names.reduce((a, b) => {
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        return a.slice(0, i);
      });
      cut = NAME_CUT.exec(shared)?.[0] || '';
      if (names.some((n) => n.length <= cut.length)) cut = '';
    }
    els.forEach((el, i) => setAttr(el, 'data-se-short', cut ? names[i].slice(cut.length) : null));
  }

  // DLC: the size Steam gives (only for DLC with files of their own) goes under the name.
  function dlcSizes(grid) {
    for (const cell of grid.querySelectorAll(`.${DLC.size}`)) {
      const name = cell.parentElement?.querySelector(`.${DLC.name}`);
      if (name) setAttr(name, 'data-se-dsize', text(cell) || null);
    }
  }

  // Section labels that end in a colon ("Steam Input Status:", "Filter:") lose it (data-se-nocolon).
  function noColon(els) {
    for (const el of els) {
      const t = text(el);
      setAttr(el, 'data-se-nocolon', /[:：]$/.test(t) ? t.replace(/\s*[:：]$/, '') : null);
    }
  }

  function rowIcons(key, fields) {
    // Art rows (Customization, Privacy's DLC) show their art; the Betas intro is plain text
    const plain = fields.filter((f) => !f.matches(P.noGap) && !f.querySelector(`${P.artwork}, .${DLC.art}`));
    const icons = PAGE_ROWS[key] || [];
    plain.forEach((f, i) => {
      const icon = icons[i] || PAGE_ICON[key];
      if (icon) ROW_FOR.set(f, icon);
    });
  }

  function propsPage(content, list) {
    const body = content.querySelector('.DialogBody') || content;
    const details =
      fromProps(body, 8, (p) => (p.details && p.details.unAppID ? p.details : undefined)) ||
      fromProps(content, 8, (p) => (p.details && p.details.unAppID ? p.details : undefined));
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    const markers = [
      ['updates', P.buildInfo],
      ['files', P.diskRow],
      ['betas', P.betas],
      ['controller', P.inputGrid],
      ['dlc', P.dlcGrid],
      ['workshop', P.wsTop],
      ['privacy', P.privDlc],
      ['custom', P.artwork],
      ['general', P.cloudUsage],
      ['shortcut', `.${C.ShortcutRow}`],
    ];
    const key =
      markers.find(([, sel]) => content.querySelector(sel))?.[0] ||
      PROPS_NAMES[norm(active ? pageNameOf(active) : '')]?.[1] ||
      null;
    const header = content.querySelector('.DialogHeader');
    let sub = null;
    const fields = [...content.querySelectorAll(`${FIELD}`)].filter((f) => !f.parentElement.closest(FIELD));

    rowIcons(key, fields);
    if (key === 'general') propsGeneralPage(content, details);
    if (key === 'updates') propsUpdatesPage(content);
    if (key === 'files') propsFilesPage(content, details);
    if (key === 'betas') {
      const intro = content.querySelector(`${FIELD}${P.noGap}`);
      if (intro) setAttr(intro, 'data-se-ptext', '');
    }
    if (key === 'dlc' && details?.vecDLC) {
      const n = details.vecDLC.length;
      const on = details.vecDLC.filter((d) => d.bEnabled).length;
      sub = `${on} of ${n} DLC installed`;
    }
    if (key === 'dlc') {
      const grid = content.querySelector(P.dlcGrid);
      shortNames(grid);
      if (grid) dlcSizes(grid);
    }
    if (key === 'controller') noColon(content.querySelectorAll(`.${DLC.inputHead}`));
    if (key === 'custom') sub = 'Artwork for this game in your library';
    if (key === 'workshop') {
      propsWorkshopPage(content);
      noColon(content.querySelectorAll(`${P.wsTop} label`));
    }
    if (key === 'rec') {
      const off = fields.some((f) => f.matches(`.${C.Disabled}`)) || fields.length === 1;
      fields.forEach((f, i) => setAttr(f, 'data-se-notice', i === 0 ? (off ? 'off' : 'on') : null));
    }
    if (key === 'privacy') {
      shortNames(content.querySelector(P.privDlc));
      const last = fields[fields.length - 1];
      content.querySelectorAll('[data-se-danger]').forEach((b) => {
        if (!last?.contains(b)) b.removeAttribute('data-se-danger');
      });
      const b = last?.querySelector('button.DialogButton');
      if (b && !last.querySelector('[role="checkbox"]')) setAttr(b, 'data-se-danger', '');
    }
    if (key === 'custom') {
      fields.forEach((f) => setAttr(f, 'data-se-art', f.querySelector(P.artwork) ? '' : null));
    }
    if (header) setAttr(header, 'data-se-sub', sub);
    const title = document.querySelector(TITLE);
    propsHeader(content, title ? propsTarget(title, content) : null);

    const isText = (el) =>
      el.tagName === 'DIV' &&
      !el.closest('[data-se-pfirst] > *') &&
      [...el.children].every((c) => /^(SPAN|A|B|I|BR)$/.test(c.tagName) && !c.children.length) &&
      text(el).length > 0;

    // The first shown block: checkVisibility() (a box at all) needs styles, not the layout
    // getClientRects() forced in this observer pass; checked last, on candidates only
    const firstBlock = [...body.querySelectorAll(`${PROPS_BLOCK}, div`)].find(
      (el) =>
        !el.parentElement.closest(PROPS_BLOCK) &&
        (el.matches(PROPS_BLOCK) || isText(el)) &&
        el.checkVisibility()
    );
    const isSub = (el) => el.matches('.SettingsDialogBodyText, [data-se-ptext]') || (!el.matches(PROPS_BLOCK) && isText(el));
    const subs = [];
    for (let el = firstBlock && isSub(firstBlock) ? firstBlock : null; el && isSub(el); el = el.nextElementSibling) {
      subs.push(el);
    }

    content.querySelectorAll('[data-se-pfirst]').forEach((el) => {
      if (el !== firstBlock) el.removeAttribute('data-se-pfirst');
    });
    content.querySelectorAll('[data-se-psub]').forEach((el) => {
      if (!subs.includes(el)) el.removeAttribute('data-se-psub');
    });
    if (firstBlock) setAttr(firstBlock, 'data-se-pfirst', subs.length ? 'sub' : '');
    subs.forEach((el) => {
      if (!el.hasAttribute('data-se-ptext')) setAttr(el, 'data-se-psub', '');
    });
  }

  let propsApp = null;
  // The sidebar cover: { title, key, img } (img loads off-page through SE.art; the title draws it)
  let cover = null;

  function clearCover() {
    if (!cover) return;
    cover.title.removeAttribute('data-se-cover');
    cover.title.style.removeProperty('--se-props-cover');
    cover = null;
  }

  function resetProps() {
    resetHeader();
    clearCover();
    propsApp = null;
  }

  /*
   * The game a Properties window is for, with the Library store that knows it. Resolving it
   * walks the fiber chain (and, without an id, every app's name), so the answer is kept for the
   * title element; a partial answer is retried every 2 s rather than on every mutation.
   */
  function propsTarget(title, content) {
    const name = text(title);
    const now = performance.now();
    if (propsApp?.title === title && propsApp.name === name && (propsApp.app || now < propsApp.retry)) {
      return propsApp;
    }
    // Properties is portaled into a separate document by the main Steam UI.
    // The React root can still reach the Library store when window.opener is absent.
    const windows = SE.owners();
    let appid;
    let overview;
    for (let fiber = SE.liveFiber(title); fiber; fiber = fiber.return) {
      const p = fiber.memoizedProps;
      if (!appid) appid = Number(p?.appId || p?.details?.unAppID);
      if (!overview && Array.isArray(p?.pages)) {
        overview = p.pages.find((page) => page?.content?.props?.overview?.appid)?.content.props.overview;
      }
      const container = fiber.stateNode?.containerInfo;
      const owner = container?.ownerDocument?.defaultView || container?.defaultView;
      if (owner) windows.add(owner);
    }
    const stores = [...windows].map((owner) => SE.run(() => owner.appStore)).filter(Boolean);
    const pageAppId = content && fromProps(content.querySelector('.DialogBody') || content, 12,
      (p) => p.details?.unAppID || p.overview?.appid);
    appid ||= Number(overview?.appid || pageAppId);
    if (!appid) {
      const matches = new Set(stores.flatMap((store) => SE.run(() =>
        store.allApps.filter((app) => app.display_name === name).map((app) => Number(app.appid))
      ) || []));
      if (matches.size === 1) [appid] = matches;
    }
    const valid = Number.isSafeInteger(appid) && appid > 0;
    const store = valid ? stores.find((candidate) => SE.run(() => candidate.GetAppOverviewByAppID(appid))) || stores[0] : null;
    const app = valid
      ? SE.run(() => store?.GetAppOverviewByAppID(appid)) || (Number(overview?.appid) === appid ? overview : null)
      : null;
    propsApp = { title, name, appid: valid ? appid : 0, store, app, retry: now + 2000 };
    return propsApp;
  }

  // The game's wide cover over its name: Steam's own copies first, then the store's
  function propsCover(title, content) {
    const { appid, store } = propsTarget(title, content);
    if (!appid) {
      clearCover();
      return;
    }
    const sources = [...new Set(SE.headerURLs(appid, store).map((url) =>
      /^\/(assets|customimages)\//.test(url) ? `https://steamloopback.host${url}` : url
    ))];
    const key = sources.join('\n');
    if (cover?.title === title && cover.key === key) return;
    clearCover();
    const mine = { title, key };
    mine.img = SE.art.img(sources, 'se-pcover', () => {
      if (cover === mine) clearCover();
    });
    mine.img.addEventListener('load', () => {
      if (cover !== mine) return;
      title.style.setProperty('--se-props-cover', `url(${JSON.stringify(mine.img.currentSrc || mine.img.src)})`);
      setAttr(title, 'data-se-cover', '');
    });
    cover = mine;
  }

  function propsSidebar(list, content) {
    list.querySelectorAll(ITEM).forEach((item) =>
      setAttr(item, 'data-se-icon', PROPS_NAMES[norm(pageNameOf(item))]?.[0] || null)
    );
    const title = document.querySelector(TITLE);
    if (!title) return;
    setAttr(title, 'data-se-ptitle', '');
    propsCover(title, content);
  }
  Object.assign(ns, { propsPage, propsSidebar, resetProps });
})(window.__se);
