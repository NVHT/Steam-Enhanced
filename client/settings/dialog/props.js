/*
 * Steam Settings, Game Properties and Millennium Settings: the Game Properties page pass, cover and
 * sidebar.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSettingsParts;
  if (!ns) return;
  const { C, fromProps, attr: setAttr } = SE;
  const {
    ACTIVE, FIELD, ITEM, P, PROPS_BLOCK, PROPS_NAMES, ROW_FOR, TITLE, norm, pageNameOf,
    propsFilesPage, propsGeneralPage, propsUpdatesPage, propsWorkshopPage, text,
  } = ns;

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
    ];
    const key =
      markers.find(([, sel]) => content.querySelector(sel))?.[0] ||
      PROPS_NAMES[norm(active ? pageNameOf(active) : '')]?.[1] ||
      null;
    const header = content.querySelector('.DialogHeader');
    let sub = null;
    const fields = [...content.querySelectorAll(`${FIELD}`)].filter((f) => !f.parentElement.closest(FIELD));

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
      sub = `${n} DLC · ${on} installed`;
    }
    if (key === 'custom') sub = 'Artwork for this game in your library';
    if (key === 'workshop') propsWorkshopPage(content);
    if (key === 'rec') {
      const first = fields[0];
      const off = fields.some((f) => f.matches(`.${C.Disabled}`)) || fields.length === 1;
      fields.forEach((f, i) => setAttr(f, 'data-se-notice', i === 0 ? (off ? 'off' : 'on') : null));
      if (first) ROW_FOR.set(first, 'rec');
    }
    if (key === 'privacy') {
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

    const isText = (el) =>
      el.tagName === 'DIV' &&
      !el.closest('[data-se-pfirst] > *') &&
      [...el.children].every((c) => /^(SPAN|A|B|I|BR)$/.test(c.tagName) && !c.children.length) &&
      text(el).length > 0;

    const firstBlock = [...body.querySelectorAll(`${PROPS_BLOCK}, div`)].find(
      (el) =>
        el.getClientRects().length &&
        !el.parentElement.closest(PROPS_BLOCK) &&
        (el.matches(PROPS_BLOCK) || isText(el))
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

  let propsCover;
  let propsApp = null;

  function clearPropsCover() {
    if (!propsCover) return;
    const { title, image } = propsCover;
    image.onload = image.onerror = null;
    title.removeAttribute('data-se-cover');
    title.style.removeProperty('--se-props-cover');
    propsCover = null;
  }

  function resetProps() {
    clearPropsCover();
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

  function propsSidebar(list, content) {
    list.querySelectorAll(ITEM).forEach((item) =>
      setAttr(item, 'data-se-icon', PROPS_NAMES[norm(pageNameOf(item))]?.[0] || null)
    );
    const title = document.querySelector(TITLE);
    if (!title) return;
    setAttr(title, 'data-se-ptitle', '');

    const { appid, store, app } = propsTarget(title, content);
    if (!appid) {
      clearPropsCover();
      return;
    }
    const urls = SE.coverURLs(app || { appid }, store);
    const filename = app?.library_capsule_filename;
    if (filename) {
      const path = filename.split('/').map(encodeURIComponent).join('/');
      urls.push(`https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}/${path}`);
    }
    const portrait = app && SE.run(() => store?.GetPregeneratedVerticalCapsuleForApp(app));
    if (portrait) urls.push(portrait);
    const sources = [...new Set(urls.map((url) => /^\/(assets|customimages)\//.test(url)
      ? `https://steamloopback.host${url}`
      : url))];
    const key = sources.join('\n');
    if (propsCover?.title === title && propsCover.key === key) return;

    clearPropsCover();
    const image = new Image();
    const cover = { title, image, key };
    propsCover = cover;
    let next = 0;
    const loadNext = () => {
      if (propsCover === cover && next < sources.length) image.src = sources[next++];
    };
    image.onerror = loadNext;
    image.onload = () => {
      if (propsCover !== cover) return;
      title.style.setProperty('--se-props-cover', `url(${JSON.stringify(image.src)})`);
      setAttr(title, 'data-se-cover', '');
    };
    loadNext();
  }
  Object.assign(ns, { propsPage, propsSidebar, resetProps });
});
