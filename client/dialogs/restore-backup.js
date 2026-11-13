/*
 * Restore From Backup, rebuilt: the read-only path field and Browse become one folder card (the
 * whole card opens the folder picker): a folder glyph, the chosen folder's name over its parent
 * path, or "No folder selected" over a hint at what to pick. Once Steam finds backups in the
 * folder, the games show as a list of chips under the card instead of one run-on sentence.
 *
 * Steam renders the dialog from sp.js (module 74412, class I; CSS module 32609 shared with the
 * Backup dialog): a GenericDialog titled #RestoreBackup_Title whose content carries
 * BackupAppsDialog, then DialogBodyText (#RestoreBackup_Info), a DialogBody holding
 * BackupAppsContent (BackupAppInput > read-only input, BackupAppsBrowse) and, once a folder with
 * backups is picked, a div > DialogBodyText.ExtraPadding ("#RestoreBackup_GameFound" + names),
 * then the footer. State lives on the class instance: { strFolder, strName }.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog
 * ([data-se-rb]), adds its card face inside BackupAppsContent and its chips inside the found
 * <div> (child lists React never changes), and opens the picker by clicking Steam's own Browse.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedRestoreBackup?.destroy();

  /* BackupAppsDialog CSS module (sp.js 32609) */
  const C = {
    root: '.YmQ9vcw08n7STkTEQLiYW',
    content: '.cBVQzUqhygc4rrsrAVaAf',
    input: '._3h_6VENNNeSv1LxRpIP263',
    browse: '.v71Rz05Rte4GxZMKzvwAO',
    found: '._3XJVQHmJH6TijvWtED4ula',
  };

  const OURS = 'se-rb';
  const MARK = 'data-se-rb';
  const PICKED = 'data-se-rb-picked';
  const MAX_DEPTH = 24;
  /* After the picker closes, Steam reads the folder asynchronously (GetBackupsInFolder) */
  const SETTLE_MS = [120, 400, 1000, 2000];

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-rb svg .d) */
  const ICONS = {
    folder:
      '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderEmpty:
      '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5"/>',
    game: '<rect class="d" x="3" y="7" width="18" height="11" rx="4"/><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
  };

  const views = new Set();
  const viewOf = new WeakMap();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] Restore From Backup:', err);
      return fallback;
    }
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
  };

  const setIcon = (svg, name) => {
    if (svg.dataset.icon === name) return;
    svg.dataset.icon = name;
    svg.innerHTML = ICONS[name];
  };

  const isOurs = node => !!(node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(`.${OURS}`);

  /* "D:\Backups\Portal 2\" to { name: "Portal 2", parent: "D:\Backups\" } */
  const splitFolder = path => {
    const bare = String(path ?? '').trim().replace(/[\\/]+$/, '');
    const cut = Math.max(bare.lastIndexOf('\\'), bare.lastIndexOf('/')) + 1;
    return { name: bare.slice(cut) || bare, parent: bare.slice(0, cut) };
  };

  /* ---------- Reading Steam's state ---------- */

  /* The dialog's class instance state ({ strFolder, strName }); null for the Backup dialog */
  const readState = root => {
    for (let fiber = SE.fiber?.(root), depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      const state = fiber.stateNode?.state;
      if (state && typeof state === 'object' && 'strFolder' in state && 'strName' in state) return state;
    }
    return null;
  };

  /* Game names from strName: an array, or a string Steam joined (one or several) */
  const gameNames = value => {
    const list = Array.isArray(value) ? value : String(value ?? '').split(/\s*[\n;]\s*/);
    return [...new Set(list.map(name => String(name ?? '').trim()).filter(Boolean))];
  };

  /* ---------- View ---------- */

  const createView = root => {
    const content = root.querySelector(C.content);
    const browse = content?.querySelector(`:scope > ${C.browse}`);
    if (!content || !browse) return null;

    const cleanups = [];
    const timers = new Set();
    let frame = 0;

    /* Card face: glyph, folder name over its parent path (or the empty state) */
    const face = el('div', `${OURS} ${OURS}-face`);
    const glyph = icon('folderEmpty');
    const text = el('div', `${OURS}-text`);
    const title = el('span', `${OURS}-title`);
    const sub = el('span', `${OURS}-sub`);
    text.append(title, sub);
    face.append(glyph, text);
    content.prepend(face);

    /* Games found, as chips (inside Steam's found <div> while it's mounted) */
    const games = el('div', `${OURS} ${OURS}-games`);
    games.setAttribute('role', 'list');

    const update = () => {
      frame = 0;
      const state = attempt(() => readState(root), null);
      const folder = state?.strFolder ?? '';
      SE.attr(root, PICKED, folder ? '' : null);
      SE.attr(content, 'title', folder || null);

      if (folder) {
        const { name, parent } = splitFolder(folder);
        setIcon(glyph, 'folder');
        setText(title, name);
        setText(sub, parent);
      } else {
        setIcon(glyph, 'folderEmpty');
        setText(title, 'No folder selected');
        setText(sub, 'Pick the folder that holds the backup’s sku.sis file');
      }

      const holder = root.querySelector(C.found)?.parentElement;
      const names = gameNames(state?.strName);
      if (holder && names.length) {
        if (games.parentElement !== holder) holder.append(games);
        const key = names.join('\n');
        if (games.dataset.key !== key) {
          games.dataset.key = key;
          games.replaceChildren(
            ...names.map(name => {
              const chip = el('span', `${OURS}-game`);
              chip.setAttribute('role', 'listitem');
              chip.append(icon('game'), el('span', null, name));
              return chip;
            }),
          );
        }
        SE.mark(root, MARK, 'found');
      } else {
        games.remove();
        SE.mark(root, MARK, '');
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    /* The picker is Steam's own: the whole card opens it */
    const onCardClick = event => {
      if (event.target.closest(C.browse) || browse.disabled) return;
      browse.click();
    };

    /* The picker is a native dialog; its result lands a moment after this window regains focus */
    const onFocus = () => {
      for (const ms of SETTLE_MS) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          schedule();
        }, ms);
        timers.add(timer);
      }
    };

    content.addEventListener('click', onCardClick);
    root.ownerDocument.defaultView.addEventListener('focus', onFocus);
    cleanups.push(() => {
      content.removeEventListener('click', onCardClick);
      root.ownerDocument.defaultView.removeEventListener('focus', onFocus);
    });

    // The found line mounts, and its names change, as Steam's state does
    const observer = new MutationObserver(records => {
      if (records.some(record => !isOurs(record.target) && ![...record.addedNodes, ...record.removedNodes].every(isOurs))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    cleanups.push(() => observer.disconnect());

    update();

    return {
      root,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        for (const timer of timers) clearTimeout(timer);
        for (const fn of cleanups.splice(0)) attempt(fn);
        face.remove();
        games.remove();
        SE.unmark(content, 'title');
        SE.unmark(root, MARK);
        SE.unmark(root, PICKED);
        views.delete(this);
        viewOf.delete(root);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const scan = () => {
    for (const view of [...views]) if (!view.root.isConnected) view.destroy();
    for (const root of document.querySelectorAll(C.root)) {
      if (viewOf.has(root) || root.closest('.GamepadMode')) continue;
      // Only the Restore dialog: the Backup dialog shares the module but not this state
      if (!attempt(() => readState(root), null)) continue;
      const view = attempt(() => createView(root), null);
      if (!view) continue;
      views.add(view);
      viewOf.set(root, view);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100, scope: C.root, ignore: isOurs });
  scan();

  window.__steamEnhancedRestoreBackup = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__steamEnhancedRestoreBackup;
    },
  };
});
