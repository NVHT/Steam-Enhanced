/*
 * Install, rebuilt: the game's hero art bleeds in behind the top of the dialog under a large
 * capsule and title, each drive becomes a card with its path, a capacity bar (used, this
 * install, free) and the space left after installing, the shortcuts become two toggle tiles,
 * and Steam's notice line becomes a callout when it has something to say.
 *
 * Steam renders the dialog from module 31627 (CSS module 58879) as InstallRequestModal. Its
 * disk-settings view (W) is DialogHeader "Install" and a DialogBody holding AppsToInstall
 * (one AppToInstall per app: AppLogo, AppName, AppSizeRequired), CreateShortcuts (two
 * DialogCheckbox), FolderSelector (Header + Manage Storage gear, one FolderOption per mounted
 * library folder), NoticeInstallFolder, and the footer's ConfirmButtons (Install, or Manage
 * Storage when the space doesn't fit).
 *
 * Every native node stays mounted and React keeps owning it. The theme reads installRequest
 * and each FolderOption's { folder, active, nSpaceRequired } from the live fibers, marks the
 * dialog ([data-se-inst]) and appends its own nodes only at the end of child lists React
 * never reorders (DialogContent, each FolderOption). Selecting a drive is still Steam's click.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedInstall?.destroy();

  /* InstallRequestModal CSS module (58879) */
  const C = {
    modal: '._3wtPUBfilFITcl1s4u6A7T',
    apps: '.Krg05lMwvNmhhVXhqdleu',
    app: '._3MJEANCb5PkduXTSJ6o3bq',
    selector: '.vaNI84b_TV6hw20mhGl_d',
    option: '.Oo5JPcEk_erKEYAzYp2nY',
    notice: '.WonjNtnAq8aOefGl_x2v4',
  };

  const OURS = 'se-inst';
  const ROOT = 'data-se-inst';
  const ACTION = 'data-se-inst-action';
  const FIT = 'data-se-inst-fit';
  const NOTICE = 'data-se-inst-notice';
  const MAX_DEPTH = 12;

  const views = new Set();
  const viewOf = new WeakMap();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] Install:', err);
      return fallback;
    }
  };

  const { el } = SE;

  const { setText } = SE;

  const setStyle = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  };

  const isOurs = SE.inside(`.${OURS}`);

  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  /* Bytes as Steam shows them: binary units, two decimals from GB up */
  const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = value => {
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

  /* ---------- Reading Steam's state ---------- */

  /* The nearest props on the live fiber chain that pass `test` */
  const propsUp = (node, test) => {
    let fiber = SE.liveFiber?.(node);
    for (let depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && test(props)) return props;
    }
    return null;
  };

  const readRequest = node => propsUp(node, p => p.installRequest && Array.isArray(p.installRequest.rgApps))?.installRequest ?? null;

  const readOption = node => propsUp(node, p => p.folder && typeof p.folder === 'object' && 'nSpaceRequired' in p);

  /* ---------- Hero art ---------- */

  const buildArt = (host, appid) => {
    const art = el('div', `${OURS} ${OURS}-art se-dialog-art`);
    art.setAttribute('aria-hidden', 'true');
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    art.append(img);

    const urls = attempt(() => SE.heroURLs(appid), []) ?? [];
    let index = 0;
    const next = () => {
      if (index >= urls.length) {
        art.remove();
        return;
      }
      img.src = urls[index++];
    };
    img.addEventListener('load', () => SE.mark(art, 'data-ready'));
    img.addEventListener('error', next);
    next();

    host.append(art);
    return art;
  };

  /* ---------- Drive cards ---------- */

  const buildDrive = option => {
    const usage = el('div', `${OURS} ${OURS}-usage`);
    const path = el('div', `${OURS}-path`);
    const bar = el('div', `${OURS}-bar`);
    const used = el('i', `${OURS}-bar-used`);
    const need = el('i', `${OURS}-bar-need`);
    bar.append(used, need);
    bar.setAttribute('role', 'img');
    const caption = el('div', `${OURS}-caption`);
    const captionUsed = el('span', `${OURS}-caption-used`);
    const captionAfter = el('span', `${OURS}-caption-after`);
    caption.append(captionUsed, captionAfter);
    usage.append(path, bar, caption);
    option.append(usage);

    const update = () => {
      const props = readOption(option);
      if (!props) return;
      const { folder } = props;
      const required = num(props.nSpaceRequired) ?? 0;
      const free = num(folder.nFreeSpace);
      const capacity = num(folder.nCapacity);
      const fits = free == null || required < free;

      SE.attr(option, FIT, fits ? 'yes' : 'no');
      setText(path, folder.strFolderPath ?? '');
      SE.attr(path, 'hidden', folder.strFolderPath ? null : '');
      if (folder.strFolderPath) path.title = folder.strFolderPath;

      if (capacity && free != null && capacity >= free) {
        const taken = capacity - free;
        SE.attr(bar, 'hidden', null);
        setStyle(used, '--w', pct(taken, capacity));
        setStyle(need, '--w', pct(Math.min(required, free), capacity));
        bar.setAttribute('aria-label', `${bytes(taken)} of ${bytes(capacity)} used`);
        setText(captionUsed, `${bytes(taken)} of ${bytes(capacity)} used`);
      } else {
        SE.attr(bar, 'hidden', '');
        setText(captionUsed, '');
      }

      if (free == null) setText(captionAfter, '');
      else if (fits) setText(captionAfter, `${bytes(free - required)} left after install`);
      else setText(captionAfter, `Needs ${bytes(required - free)} more`);
    };

    return {
      update,
      destroy() {
        usage.remove();
        SE.unmark(option, FIT);
      },
    };
  };

  /* ---------- View ---------- */

  const createView = root => {
    const cleanups = [];
    const drives = new Map();
    let art = null;
    let artApp = 0;
    let frame = 0;

    const sync = () => {
      frame = 0;
      if (!root.isConnected) return;
      const anchor = root.querySelector(C.apps) ?? root.querySelector(C.selector);
      const request = anchor && attempt(() => readRequest(anchor), null);
      SE.attr(root, ROOT, anchor ? '' : null);

      /* Hero art behind the top, from the first app */
      const appid = num(request?.rgApps?.[0]?.nAppID) ?? 0;
      const host = anchor?.closest('.DialogContent') ?? null;
      if (art && (!appid || appid !== artApp || !art.isConnected || art.parentElement !== host)) {
        art.remove();
        art = null;
      }
      if (!art && appid && host) {
        art = attempt(() => buildArt(host, appid), null);
        artApp = appid;
      }
      SE.attr(root, 'data-se-inst-art', art ? '' : null);

      /* The footer's action: Install when the space fits, else Steam swaps in Manage Storage */
      if (request) {
        const required = num(request.nDiskSpaceRequired) ?? 0;
        const available = num(request.nDiskSpaceAvailable) ?? 0;
        SE.attr(root, ACTION, required < available ? 'install' : 'storage');
      }

      /* Steam always mounts the notice; it only matters when it has text */
      const notice = root.querySelector(C.notice);
      const text = notice?.textContent.trim();
      SE.attr(root, NOTICE, text ? (notice.querySelector('.bhL5Q352pNmO44_JjKZTX') ? 'warning' : 'info') : null);

      /* Drive cards */
      const options = new Set(root.querySelectorAll(C.option));
      for (const [option, drive] of drives) {
        if (options.has(option)) continue;
        drive.destroy();
        drives.delete(option);
      }
      for (const option of options) {
        let drive = drives.get(option);
        if (!drive) {
          drive = attempt(() => buildDrive(option), null);
          if (!drive) continue;
          drives.set(option, drive);
        }
        attempt(drive.update);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    /* Drive picks flip FolderOption's Active class; free space and notices are text */
    const observer = new MutationObserver(records => {
      if (records.some(record => !isOurs(record.target) && ![...record.addedNodes, ...record.removedNodes].every(isOurs))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    cleanups.push(() => observer.disconnect());

    sync();

    return {
      root,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        for (const fn of cleanups.splice(0)) attempt(fn);
        for (const drive of drives.values()) attempt(drive.destroy);
        drives.clear();
        art?.remove();
        for (const name of [ROOT, ACTION, NOTICE, 'data-se-inst-art']) SE.unmark(root, name);
        views.delete(this);
        viewOf.delete(root);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const rootOf = node => node.closest(C.modal) ?? node.closest('.DialogContent');

  const scan = () => {
    for (const view of [...views]) if (!view.root.isConnected) view.destroy();
    for (const node of document.querySelectorAll(`${C.apps}, ${C.selector}`)) {
      if (node.closest('.GamepadMode')) continue;
      const root = rootOf(node);
      if (!root || viewOf.has(root)) continue;
      const view = attempt(() => createView(root), null);
      if (!view) continue;
      views.add(view);
      viewOf.set(root, view);
    }
  };

  const watcher = SE.watch(scan, { throttle: 120, ignore: isOurs });
  scan();

  window.__steamEnhancedInstall = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__steamEnhancedInstall;
    },
  };
});
