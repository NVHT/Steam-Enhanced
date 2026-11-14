/*
 * Backup Game Files and Restore From Backup, rebuilt. Both share one look:
 *
 *   - the read-only path field and Browse become one folder card (the whole card opens the
 *     picker): a folder glyph, the folder's name over its parent path, or "No folder selected"
 *     over a hint at what to pick;
 *   - Backup lists the games it will back up as chips (with their size on disk), shows progress
 *     as a bar with a percent, bytes done of total and "Game 2 of 3", then the result as a card;
 *   - Restore lists the games Steam found in the folder as chips instead of one sentence.
 *
 * Steam renders both from sp.js module 74412 (CSS module 32609, BackupAppsDialog on the dialog's
 * content). Backup is class M: props { apps }, state { iCurrentApp, strFolder, eStep, progress }
 * with eStep 0 choose, 1 backing up, 2 done, 3 failed; progress carries strBytesProcessed and
 * strBytesToProcess. Restore is class I: state { strFolder, strName }. The state is read from the
 * class instance, which also tells the two dialogs apart.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog
 * ([data-se-backup] = backup | restore, [data-se-backup-step]), adds its own nodes only inside
 * containers whose child lists React doesn't change while they're mounted, and opens the picker
 * by clicking Steam's own Browse.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialogs.
 */
((SE) => {
  window.__seBackups?.destroy();
  window.__seRestoreBackup?.destroy(); // the Restore-only module this replaces

  /* BackupAppsDialog CSS module (sp.js 32609) */
  const C = {
    root: '.YmQ9vcw08n7STkTEQLiYW',
    content: '.cBVQzUqhygc4rrsrAVaAf',
    input: '._3h_6VENNNeSv1LxRpIP263',
    browse: '.v71Rz05Rte4GxZMKzvwAO',
    indicator: '._24O5i9aa5PKJmbP0tL_Jbf',
    found: '._3XJVQHmJH6TijvWtED4ula',
    text: '._2Nmi6ONpGvLOgRE87Ky2MA',
  };

  const OURS = 'se-bk';
  const KIND = 'data-se-backup';
  const STEP = 'data-se-backup-step';
  const PICKED = 'data-se-backup-picked';
  const MAX_DEPTH = 24;
  /* After the picker closes, Steam reads the folder asynchronously */
  const SETTLE_MS = [120, 400, 1000, 2000];
  const STEPS = ['choose', 'progress', 'done', 'failed'];

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-bk svg .d) */
  const ICONS = {
    folder:
      '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderEmpty:
      '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5"/>',
    game: '<rect class="d" x="3" y="7" width="18" height="11" rx="4"/><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
  };

  /* ---------- Helpers ---------- */

  const attempt = SE.attempt('Backups');

  const { el } = SE;

  const { setText } = SE;

  const { icon, setIcon } = SE.icons(ICONS);


  const isOurs = SE.inside(`.${OURS}`);

  /* "D:\Backups\Portal 2\" to { name: "Portal 2", parent: "D:\Backups\" } */
  const splitFolder = (path) => {
    const bare = String(path ?? '').trim().replace(/[\\/]+$/, '');
    const cut = Math.max(bare.lastIndexOf('\\'), bare.lastIndexOf('/')) + 1;
    return { name: bare.slice(cut) || bare, parent: bare.slice(0, cut) };
  };

  /* Bytes as Steam shows sizes: 1 decimal from GB down, none for bytes */
  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${unit ? size.toFixed(size >= 100 ? 0 : 1) : Math.round(size)} ${units[unit]}`;
  };

  const chip = (name, meta) => {
    const node = el('span', `${OURS}-game`);
    node.setAttribute('role', 'listitem');
    node.append(icon('game'), el('span', `${OURS}-game-name`, name));
    if (meta) node.append(el('span', `${OURS}-game-meta`, meta));
    return node;
  };

  /* Replaces a list's chips only when what they show changes */
  const fillChips = (list, entries) => {
    const key = entries.map(e => `${e.name}\u0000${e.meta ?? ''}`).join('\n');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...entries.map(e => chip(e.name, e.meta)));
  };

  /* ---------- Reading Steam's state ---------- */

  /* The dialog's class instance ({ state, props }) and which dialog it is */
  const readInstance = (root) => {
    for (let fiber = SE.fiber?.(root), depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      const instance = fiber.stateNode;
      const state = instance?.state;
      if (!state || typeof state !== 'object' || !('strFolder' in state)) continue;
      if ('eStep' in state) return { kind: 'backup', instance };
      if ('strName' in state) return { kind: 'restore', instance };
    }
    return null;
  };

  /* The window that owns Steam's stores (the main window) */
  const storeWindow = () => {
    for (const win of SE.owners?.() ?? [window]) {
      try {
        if (win.appStore?.GetAppOverviewByAppID) return win;
      } catch {}
    }
    return null;
  };

  const overviewOf = (appid) => attempt(() => storeWindow()?.appStore.GetAppOverviewByAppID(appid), null);

  const appName = (appid) => overviewOf(appid)?.display_name || `App ${appid}`;

  /* Game names from Restore's strName: an array, or a string Steam joined */
  const gameNames = (value) => {
    const list = Array.isArray(value) ? value : String(value ?? '').split(/\s*[\n;]\s*/);
    return [...new Set(list.map(name => String(name ?? '').trim()).filter(Boolean))];
  };

  /* ---------- Folder card ---------- */

  /*
   * The card face inside BackupAppsContent, before the hidden field. `hint` is the empty state's
   * second line. Returns { update(folder), destroy() }.
   */
  const folderCard = (root, content, hint, schedule) => {
    const browse = content.querySelector(`:scope > ${C.browse}`);
    const face = el('div', `${OURS} ${OURS}-face`);
    const glyph = icon('folderEmpty');
    const text = el('div', `${OURS}-text`);
    const title = el('span', `${OURS}-title`);
    const sub = el('span', `${OURS}-sub`);
    text.append(title, sub);
    face.append(glyph, text);
    content.prepend(face);

    const onClick = (event) => {
      if (!browse || event.target.closest(C.browse) || browse.disabled) return;
      browse.click();
    };

    /* The picker is a native dialog; its result lands a moment after this window regains focus */
    const timers = new Set();
    const win = root.ownerDocument.defaultView;
    const onFocus = () => {
      for (const ms of SETTLE_MS) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          schedule();
        }, ms);
        timers.add(timer);
      }
    };

    content.addEventListener('click', onClick);
    win.addEventListener('focus', onFocus);

    return {
      content,
      update(folder) {
        SE.attr(content, 'title', folder || null);
        if (folder) {
          const { name, parent } = splitFolder(folder);
          setIcon(glyph, 'folder');
          setText(title, name);
          setText(sub, parent);
        } else {
          setIcon(glyph, 'folderEmpty');
          setText(title, 'No folder selected');
          setText(sub, hint);
        }
      },
      destroy() {
        for (const timer of timers) clearTimeout(timer);
        content.removeEventListener('click', onClick);
        win.removeEventListener('focus', onFocus);
        face.remove();
        SE.unmark(content, 'title');
      },
    };
  };

  /* ---------- Views ---------- */

  const createView = (root, kind) => {
    const cleanups = [];
    const nodes = [];
    let card = null;

    // Steps swap child lists; progress moves the bar's inline width; names change as text
    const change = SE.onChange(root, update, { attributes: ['style'], characterData: true, ignore: isOurs });
    const { schedule } = change;
    cleanups.push(change.disconnect);

    const syncCard = (hint, folder) => {
      const content = root.querySelector(C.content);
      if (card && card.content !== content) {
        card.destroy();
        card = null;
      }
      if (!card && content) card = folderCard(root, content, hint, schedule);
      card?.update(folder);
    };

    /* Backup: the games it covers, before the folder label */
    const apps = el('div', `${OURS} ${OURS}-games ${OURS}-apps`);
    apps.setAttribute('role', 'list');
    apps.setAttribute('aria-label', 'Games');

    /* Backup: progress line under Steam's bar */
    const meta = el('div', `${OURS} ${OURS}-progress`);
    const percent = el('span', `${OURS}-percent`);
    const bytes = el('span', `${OURS}-bytes`);
    const count = el('span', `${OURS}-count`);
    meta.append(percent, bytes, count);

    /* Restore: the games found in the folder */
    const found = el('div', `${OURS} ${OURS}-games ${OURS}-found`);
    found.setAttribute('role', 'list');

    nodes.push(apps, meta, found);

    const updateBackup = (instance) => {
      const { state, props } = instance;
      const step = STEPS[state.eStep] ?? 'choose';
      SE.attr(root, STEP, step);
      SE.attr(root, PICKED, state.strFolder ? '' : null);

      syncCard('Steam creates the backup files in this folder', state.strFolder);

      const ids = Array.isArray(props?.apps) ? props.apps : [];
      // "Choose a directory…", the folder card's sibling while the card is mounted
      const label = root.querySelector(C.content)?.parentElement?.querySelector(`:scope > ${C.text}`);
      if (step === 'choose' && ids.length && label) {
        if (apps.parentElement !== label.parentElement) label.before(apps);
        fillChips(
          apps,
          ids.map(id => {
            const size = formatBytes(overviewOf(id)?.size_on_disk);
            return { name: appName(id), meta: size && size !== '0 B' ? size : '' };
          }),
        );
      } else {
        apps.remove();
      }

      const bar = root.querySelector(C.indicator);
      const holder = bar?.parentElement;
      if (step === 'progress' && holder) {
        if (meta.parentElement !== holder) holder.append(meta);
        const done = Number(state.progress?.strBytesProcessed) || 0;
        const total = Number(state.progress?.strBytesToProcess) || 0;
        setText(percent, total > 0 ? `${Math.floor((done * 100) / total)}%` : 'Preparing…');
        setText(bytes, total > 0 ? `${formatBytes(done)} of ${formatBytes(total)}` : '');
        setText(count, ids.length > 1 ? `Game ${Math.min(state.iCurrentApp + 1, ids.length)} of ${ids.length}` : '');
      } else {
        meta.remove();
      }
    };

    const updateRestore = (instance) => {
      const { state } = instance;
      SE.attr(root, PICKED, state.strFolder ? '' : null);
      syncCard('Pick the folder that holds the backup’s sku.sis file', state.strFolder);

      const holder = root.querySelector(C.found)?.parentElement;
      const names = gameNames(state.strName);
      if (holder && names.length) {
        if (found.parentElement !== holder) holder.append(found);
        fillChips(found, names.map(name => ({ name })));
        SE.attr(root, STEP, 'found');
      } else {
        found.remove();
        SE.attr(root, STEP, 'choose');
      }
    };

    function update() {
      const current = attempt(() => readInstance(root), null);
      if (!current) return;
      if (kind === 'backup') attempt(() => updateBackup(current.instance));
      else attempt(() => updateRestore(current.instance));
    }

    SE.mark(root, KIND, kind);
    update();

    return {
      root,
      destroy() {
        for (const fn of cleanups.splice(0)) attempt(fn);
        card?.destroy();
        for (const node of nodes) node.remove();
        for (const name of [KIND, STEP, PICKED]) SE.unmark(root, name);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const mounted = SE.mount(
    'Backups',
    () => [...document.querySelectorAll(C.root)].filter(root => !root.closest('.GamepadMode')),
    (root) => {
      const found = attempt(() => readInstance(root), null);
      return found ? createView(root, found.kind) : null;
    },
    { throttle: 100, scope: C.root, ignore: isOurs }
  );

  window.__seBackups = {
    destroy() {
      mounted.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__seBackups;
    },
  };
})(window.__se);
