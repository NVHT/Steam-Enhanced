/*
 * Uninstall, rebuilt: the game's hero art bleeds in behind the top under its capsule and name
 * (Steam's confirmation stays as the subtitle), and a drive card shows what the uninstall frees:
 * the space, the drive and folder, and a capacity bar with this game's share marked against the
 * rest of the drive.
 *
 * Steam renders the dialog from module 19731 (CSS module 3867): a ModalDialog whose content is
 * UninstallDialog, holding DialogHeader "Uninstall", then DialogBody with DialogBodyText (one
 * div, the confirmation) and the footer's ConfirmButtons (Uninstall, Cancel). The error variant
 * (UninstallError under the message) has no apps to read and keeps the baseline look.
 *
 * Every native node stays mounted and React keeps owning it. The theme reads { rgApps } from the
 * live fibers, the drive from SteamClient.InstallFolder and the size from the app's library entry
 * (or its details), marks the dialog ([data-se-uninst])
 * and adds its own nodes only at the ends of child lists React never changes (DialogBodyText,
 * DialogContent). Uninstalling is still Steam's button.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seUninstall?.destroy();

  /* UninstallDialog CSS module (3867) */
  const C = {
    root: '._7au1m_-ZIF7Hx_rCvrDfI',
    error: '._2n_P7MWsN2y6PwS2a957_c',
  };

  const OURS = 'se-uninst';
  const ROOT = 'data-se-uninst';
  const MAX_DEPTH = 12;
  const MAX_CAPSULES = 3;

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-uninst svg .d) */
  const ICONS = {
    drive: '<rect class="d" x="3" y="13" width="18" height="7" rx="2"/><path d="M3 15l2.6-9.2A2.5 2.5 0 0 1 8 4h8a2.5 2.5 0 0 1 2.4 1.8L21 15"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M10.5 16.5h3"/>',
  };

  /* ---------- Helpers ---------- */

  const attempt = SE.attempt('Uninstall');

  const { el } = SE;

  const { icon } = SE.icons(ICONS);

  const isOurs = SE.inside(`.${OURS}`);

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  /* Bytes as Steam shows them: binary units, two decimals from GB up */
  const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = (value) => {
    let n = Math.max(0, value);
    let unit = 0;
    while (n >= 1024 && unit < UNITS.length - 1) {
      n /= 1024;
      unit++;
    }
    const digits = unit >= 3 ? 2 : unit >= 1 ? 1 : 0;
    return `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${UNITS[unit]}`;
  };

  const pct = (part, whole) => `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(3)}%`;

  /* Tries each URL in turn; drops the image (and calls onFail) when none loads */
  const loadFirst = (img, urls, onLoad, onFail) => {
    let index = 0;
    const next = () => {
      if (index < urls.length) img.src = urls[index++];
      else onFail();
    };
    img.addEventListener('load', onLoad);
    img.addEventListener('error', next);
    next();
  };

  /* ---------- Reading Steam's state ---------- */

  const readApps = (node) => {
    let fiber = SE.liveFiber?.(node);
    for (let depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      const apps = fiber.memoizedProps?.rgApps;
      if (Array.isArray(apps) && apps.length) return apps.map(Number).filter(id => id > 0);
    }
    return [];
  };

  const overview = (appid) => attempt(() => SE.appStore?.()?.GetAppOverviewByAppID(appid), null);

  /* Steam's own label (module 88769 Cj): "Windows (C:)", else the drive, else the folder */
  const driveName = (folder) => {
    const drive = folder.strDriveName || '';
    if (folder.strUserLabel) return drive.length > 1 && drive.length < 4 ? `${folder.strUserLabel} (${drive})` : folder.strUserLabel;
    return drive || folder.strFolderPath || '';
  };

  const FOLDERS_TIMEOUT = 3000;

  /*
   * Library folders from SteamClient.InstallFolder.GetInstallFolders(). Every Steam window that
   * has it is asked at once and the first non-empty answer wins: a popup's SteamClient can leave
   * the call unanswered, so no single window is waited on, and nothing past the timeout.
   */
  const readFolders = () => {
    const calls = [];
    for (const win of SE.owners?.() ?? [window]) {
      const call = attempt(() => win.SteamClient?.InstallFolder?.GetInstallFolders?.(), null);
      if (call && typeof call.then === 'function') {
        calls.push(Promise.resolve(call).then(folders => (Array.isArray(folders) && folders.length ? folders : Promise.reject())));
      }
    }
    if (!calls.length) return Promise.resolve([]);
    const timeout = new Promise(resolve => setTimeout(() => resolve([]), FOLDERS_TIMEOUT));
    return Promise.race([Promise.any(calls).catch(() => []), timeout]);
  };

  /* Steam's per-app details (what the game page's Storage section shows), when loaded */
  const details = (appid) =>
    attempt(() => SE.global?.('appDetailsStore', (store) => typeof store.GetAppDetails === 'function')?.GetAppDetails(appid), null);

  /*
   * The first positive number among an object's size fields: the named ones in order, then any
   * other key that mentions "size" (the raw InstallFolder API and Steam's stores name them
   * differently: nUsedSize, lAppSize, strAppSize, size_on_disk, ...).
   */
  const sizeIn = (obj, names) => {
    if (!obj || typeof obj !== 'object') return 0;
    for (const name of names) {
      const value = num(obj[name]);
      if (value) return value;
    }
    for (const key of Object.keys(obj)) {
      if (!/size/i.test(key) || /download|staged|workshop|dlc|required/i.test(key)) continue;
      const value = num(obj[key]);
      if (value) return value;
    }
    return 0;
  };

  const ENTRY_SIZES = ['nUsedSize', 'lAppSize', 'nAppSize', 'strAppSize', 'strUsedSize'];
  const DETAIL_SIZES = ['lDiskUsageBytes', 'nDiskUsageBytes'];
  const OVERVIEW_SIZES = ['size_on_disk'];

  /* An app's overview, plus each client's data (per_client_data) where Steam keeps its install size */
  const overviewSize = (appid) => {
    const app = overview(appid);
    const direct = sizeIn(app, OVERVIEW_SIZES);
    if (direct) return direct;
    for (const client of attempt(() => [...(app?.per_client_data ?? [])], [])) {
      const value = sizeIn(client, OVERVIEW_SIZES);
      if (value) return value;
    }
    return 0;
  };

  /* An app's size on disk: its library entry, else its details, else its overview */
  const sizeOf = (appid, entry) =>
    sizeIn(entry, ENTRY_SIZES) || sizeIn(details(appid), DETAIL_SIZES) || overviewSize(appid);

  /*
   * { folder, size }: the library folder holding the first app (or null if none answers), with
   * the apps' sizes summed. The folder comes from its app list, else from the app's details.
   */
  const readDisk = async (appids) => {
    const folders = await readFolders();
    const entries = new Map();
    let home = null;
    for (const folder of folders) {
      for (const app of folder.vecApps ?? []) {
        const id = Number(app.nAppID);
        if (!appids.includes(id) || entries.has(id)) continue;
        entries.set(id, app);
        home ??= folder;
      }
    }
    if (!home) {
      const index = details(appids[0])?.iInstallFolder;
      home = folders.find(folder => folder.nFolderIndex === index) ?? null;
    }
    const size = appids.reduce((sum, id) => sum + sizeOf(id, entries.get(id)), 0);
    return { folder: home, size };
  };

  /* ---------- Header: hero art, capsules, name ---------- */

  const buildArt = (host, appid) => {
    const art = el('div', `${OURS} ${OURS}-art se-dialog-art`);
    art.setAttribute('aria-hidden', 'true');
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    art.append(img);
    loadFirst(img, attempt(() => SE.heroURLs(appid), []) ?? [], () => SE.mark(art, 'data-ready'), () => art.remove());
    host.append(art);
    return art;
  };

  const buildGame = (body, appids) => {
    const game = el('div', `${OURS} ${OURS}-game`);
    const stack = el('div', `${OURS}-capsules`);
    for (const appid of appids.slice(0, MAX_CAPSULES)) {
      const capsule = el('div', `${OURS}-capsule`);
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      capsule.append(img);
      stack.append(capsule);
      const cdn = `https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}`;
      loadFirst(img, [`/assets/${appid}/header.jpg`, `${cdn}/header.jpg`], () => SE.mark(capsule, 'data-ready'), () => capsule.remove());
    }
    const single = appids.length === 1;
    const name = el('div', `${OURS}-name`, single ? overview(appids[0])?.display_name ?? '' : `${appids.length} games`);
    game.append(stack, name);
    body.prepend(game);
    return game;
  };

  /* ---------- Drive card ---------- */

  const buildDisk = (body, appids) => {
    const card = el('div', `${OURS} ${OURS}-disk`);
    SE.attr(card, 'hidden', '');
    const glyph = el('div', `${OURS}-glyph`);
    glyph.append(icon('drive'));
    const head = el('div', `${OURS}-disk-head`);
    const frees = el('span', `${OURS}-frees`);
    const drive = el('span', `${OURS}-drive`);
    head.append(frees, drive);
    const path = el('div', `${OURS}-path`);
    const bar = el('div', `${OURS}-bar`);
    bar.setAttribute('role', 'img');
    const other = el('i', `${OURS}-bar-other`);
    const game = el('i', `${OURS}-bar-game`);
    bar.append(other, game);
    const caption = el('div', `${OURS}-caption`);
    const used = el('span');
    const after = el('span', `${OURS}-after`);
    caption.append(used, after);
    card.append(glyph, head, path, bar, caption);
    body.append(card);

    attempt(() =>
      readDisk(appids)
        .then(({ folder, size }) => {
          if (!size || !card.isConnected) return;
          frees.textContent = `Frees ${bytes(size)}`;

          const name = folder ? driveName(folder) : '';
          drive.textContent = name ? `on ${name}` : '';
          path.textContent = folder?.strFolderPath ?? '';
          path.title = folder?.strFolderPath ?? '';
          SE.attr(path, 'hidden', folder?.strFolderPath ? null : '');

          const free = num(folder?.nFreeSpace);
          const capacity = num(folder?.nCapacity);
          if (capacity && free != null && capacity >= free) {
            const taken = capacity - free;
            other.style.setProperty('--w', pct(Math.max(0, taken - size), capacity));
            game.style.setProperty('--w', pct(Math.min(size, taken), capacity));
            bar.setAttribute('aria-label', `${bytes(taken)} of ${bytes(capacity)} used, ${bytes(size)} of it this install`);
            used.textContent = `${bytes(taken)} of ${bytes(capacity)} used`;
          } else {
            SE.attr(bar, 'hidden', '');
          }
          after.textContent = free != null ? `${bytes(free + size)} free after` : '';
          SE.attr(caption, 'hidden', used.textContent || after.textContent ? null : '');
          SE.attr(card, 'hidden', null);
        })
        .catch(err => console.warn('[Steam Enhanced] Uninstall: drive info', err))
    );
    return card;
  };

  /* ---------- View ---------- */

  const createView = (root) => {
    const nodes = [];
    let built = false;

    const sync = () => {
      if (!root.isConnected || built) return;
      const body = root.querySelector('.DialogBodyText');
      if (!body || root.querySelector(C.error)) return;
      const appids = attempt(() => readApps(body), []);
      if (!appids.length) return;
      built = true;
      change.disconnect();

      const host = root.closest('.DialogContent');
      if (host) nodes.push(attempt(() => buildArt(host, appids[0]), null));
      nodes.push(attempt(() => buildGame(body, appids), null), attempt(() => buildDisk(body, appids), null));
      SE.attr(root, ROOT, '');
    };

    /* The body mounts after the frame on some opens */
    const change = SE.onChange(root, sync, { ignore: isOurs });

    sync();

    return {
      root,
      destroy() {
        change.disconnect();
        for (const node of nodes) node?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const mounted = SE.mount(
    'Uninstall',
    () => [...document.querySelectorAll(C.root)].filter(root => !root.closest('.GamepadMode')),
    createView,
    { throttle: 120, scope: C.root, ignore: isOurs }
  );

  window.__seUninstall = {
    destroy() {
      mounted.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__seUninstall;
    },
  };
})(window.__se);
