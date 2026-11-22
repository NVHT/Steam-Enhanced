/*
 * The tray menu (Steam's icon in the Windows tray, its "jump list"), status first: you (avatar,
 * name, Online / Away / Invisible), the download in progress, your recent games with when you
 * last played them, Steam's pages as a row of icon tiles, its modes side by side, Exit Steam.
 *
 * Steam's rows stay (each runs its own steam:// URL or action) and are marked by the option they
 * run, read from their React props, never their localized text: data-se-tray = game, nav, mode,
 * exit or status (Steam's status rows, hidden: the header has the status). The header and the
 * download are the theme's, built before first paint. Styled by client/tray/tray.css.
 *
 * Steam keeps this window (bRetainOnHide) and resizes it to the menu on every change inside
 * the menu, these included (tray.css says how the width follows).
 */
((SE) => {
  window.__seTray?.destroy();
  const { C, run, el, setText, attr } = SE;

  const KIND = {
    Store: 'nav', MyGames: 'nav', Community: 'nav', FriendActivity: 'nav', Friends: 'nav',
    Screenshots: 'nav', Servers: 'nav', Settings: 'nav',
    BigPicture: 'mode', CloseBigPicture: 'mode', VR: 'mode', StopStreaming: 'mode', Console: 'mode',
    Exit: 'exit', AlwaysExit: 'exit',
    Online: 'status', Away: 'status', Invisible: 'status', Offline: 'status',
  };
  // Persona states (EPersonaState) and the ones the header offers
  const STATE = { 0: 'offline', 1: 'online', 2: 'online', 3: 'away', 4: 'away', 5: 'online', 6: 'online', 7: 'invisible' };
  const CHOICES = [['online', 1, 'Online'], ['away', 3, 'Away'], ['invisible', 7, 'Invisible']];
  const LABEL = { online: 'Online', away: 'Away', invisible: 'Invisible', offline: 'Offline' };
  const DEFAULT_AVATAR = /fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb/i;

  const friends = () => SE.global('g_FriendsUIApp', (app) => app.FriendStore)?.FriendStore || null;
  const client = () => SE.global('SteamClient', (value) => value.Downloads);
  const appName = (appid) => run(() => SE.global('appStore')?.GetAppOverviewByAppID(appid)?.display_name) || '';

  const optionOf = (row) => SE.fromProps(row, 6, (p) => (typeof p.option === 'string' ? p.option : undefined));
  const overviewOf = (row) => SE.fromProps(row, 6, (p) => (p.overview?.appid ? p.overview : undefined));

  /* ---------- Steam's rows ---------- */

  // Marks each row by what it runs, and each separator the new layout no longer needs
  function markRows(root) {
    const rows = [...root.children].filter((node) => !node.matches('.se-tray-head, .se-tray-dl'));
    const kinds = rows.map((row) => {
      if (row.classList.contains(C.contextMenuItem)) {
        const overview = overviewOf(row);
        if (overview) {
          markGame(row, overview);
          return 'game';
        }
        const option = optionOf(row);
        const kind = KIND[option] || 'other';
        attr(row, 'data-se-tray', kind);
        const label = row.textContent.trim();
        attr(row, 'data-se-tray-option', option || null);
        attr(row, 'title', kind === 'nav' ? label : null);
        attr(row, 'aria-label', kind === 'nav' ? label : null);
        return kind;
      }
      return 'sep';
    });
    // A separator stays only between two different groups of shown rows (the first of a run)
    const kept = new Set();
    let previous = null;
    let pending = null;
    rows.forEach((row, i) => {
      const kind = kinds[i];
      if (kind === 'status') return;
      if (kind === 'sep') {
        if (previous && !pending) pending = row;
        return;
      }
      if (pending && kind !== previous) kept.add(pending);
      pending = null;
      previous = kind;
    });
    rows.forEach((row, i) => {
      if (kinds[i] === 'sep') attr(row, 'data-se-tray-hide', kept.has(row) ? null : '');
    });
    // A mode alone on its line takes the whole line
    const modes = rows.filter((row, i) => kinds[i] === 'mode');
    modes.forEach((row, i) => attr(row, 'data-se-tray-wide', i === modes.length - 1 && modes.length % 2 ? '' : null));
  }

  // A recent game: its name, then when you last played it (or that it is running)
  function markGame(row, overview) {
    attr(row, 'data-se-tray', 'game');
    const name = row.querySelector('.JumpListGameName');
    if (!name) return;
    let hint = row.querySelector('.se-tray-when');
    if (!hint) {
      hint = el('span', 'se-tray-when');
      name.after(hint);
    }
    const running = SE.isRunning(overview.appid);
    attr(hint, 'data-running', running ? '' : null);
    const when = SE.ago(Number(overview.rt_last_time_played) || 0);
    setText(hint, running ? 'Running' : when ? `Played ${when}` : 'Not played yet');
  }

  /* ---------- You ---------- */

  function buildHead() {
    const head = el('div', 'se-tray-head');
    const me = el('div', 'se-tray-me');
    const avatar = el('span', 'se-tray-avatar');
    avatar.append(el('img'));
    const who = el('div', 'se-tray-who');
    who.append(el('div', 'se-tray-name'), el('div', 'se-tray-state'));
    me.append(avatar, who);
    const seg = el('div', 'se-seg se-tray-status');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Status');
    for (const [state, , label] of CHOICES) {
      const button = el('button', '', label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.state = state;
      seg.append(button);
    }
    head.append(me, seg);
    return head;
  }

  function renderHead(head) {
    const persona = run(() => friends().self.persona);
    const state = STATE[run(() => persona.m_ePersonaState)] || 'offline';
    const name = run(() => friends().self.display_name) || run(() => persona.m_strPlayerName) || '';
    const url = run(() => persona.avatar_url_medium) || '';
    const avatar = head.querySelector('.se-tray-avatar');
    const img = avatar.firstChild;
    const picture = url && !DEFAULT_AVATAR.test(url) ? url : '';
    if (picture && img.getAttribute('src') !== picture) img.src = picture;
    if (!picture) img.removeAttribute('src');
    attr(avatar, 'data-initial', picture ? null : (name.trim()[0] || '?').toUpperCase());
    attr(avatar, 'data-state', state);
    setText(head.querySelector('.se-tray-name'), name);
    const line = head.querySelector('.se-tray-state');
    setText(line, LABEL[state]);
    attr(line, 'data-state', state);
    for (const button of head.querySelectorAll('.se-tray-status button')) {
      attr(button, 'aria-checked', String(button.dataset.state === state));
    }
  }

  /* ---------- The download ---------- */

  function buildDownload() {
    const box = el('div', 'se-tray-dl');
    box.hidden = true;
    const top = el('div', 'se-tray-dl-top');
    top.append(el('span', 'se-tray-dl-game'), el('span', 'se-tray-dl-pct'));
    const bar = el('div', 'se-tray-dl-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.append(el('span'));
    box.append(top, bar);
    return box;
  }

  function renderDownload(box, overview) {
    const appid = Number(overview?.update_appid) || 0;
    box.hidden = !appid;
    if (!appid) return;
    const percent = Math.max(0, Math.min(100, Number(overview.overall_percent_complete) || 0));
    const paused = Boolean(overview.paused);
    setText(box.querySelector('.se-tray-dl-game'), `${paused ? 'Paused' : 'Downloading'} ${appName(appid) || `App ${appid}`}`);
    setText(box.querySelector('.se-tray-dl-pct'), `${Math.floor(percent)}%`);
    const bar = box.querySelector('.se-tray-dl-bar');
    attr(bar, 'aria-valuenow', Math.round(percent));
    attr(box, 'data-paused', paused ? '' : null);
    bar.firstChild.style.transform = `scaleX(${(percent / 100).toFixed(3)})`;
  }

  /* ---------- The menu ---------- */

  function create(root) {
    if (!root.querySelector('.JumpListGameName, .JumpListItemText')) return null;
    const html = document.documentElement;
    attr(html, 'data-se-tray', '');
    const head = buildHead();
    const download = buildDownload();
    root.prepend(head, download);

    // Steam's download feed (what its Downloads page reads): the store's copy can sit stale
    let overview = run(() => SE.global('downloadsStore', (value) => value.m_DownloadOverview !== undefined).m_DownloadOverview) || null;
    const feed = run(() => client().Downloads.RegisterForDownloadOverview((next) => {
      overview = next;
      renderDownload(download, overview);
    }));

    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      renderHead(head);
      renderDownload(download, overview);
      markRows(root);
    };

    let reread = 0;
    const onStatus = (event) => {
      const button = event.target.closest('.se-tray-status button');
      if (!button) return;
      event.stopPropagation();
      const choice = CHOICES.find(([state]) => state === button.dataset.state);
      const store = friends();
      if (choice && store) run(() => store.SetUserPersonaState(choice[1]));
      else if (choice) run(() => client().URL.ExecuteSteamURL(`steam://friends/status/${choice[0]}`));
      // The persona updates a moment later; the button shows the choice now
      for (const other of head.querySelectorAll('.se-tray-status button')) attr(other, 'aria-checked', String(other === button));
      clearTimeout(reread);
      reread = setTimeout(() => renderHead(head), 300);
    };
    head.addEventListener('click', onStatus);
    // Steam shows the kept window again on each open (and focuses it): read you and the rows anew
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    // Steam re-renders its rows on open (the recent games change): marked before they paint
    const rows = SE.watch(() => markRows(root), { sync: true, ignore: (node) => !root.contains(node) || !!node.closest?.('.se-tray-head, .se-tray-dl, .se-tray-when') });
    refresh();

    return {
      destroy() {
        rows.disconnect();
        clearTimeout(reread);
        head.removeEventListener('click', onStatus);
        document.removeEventListener('visibilitychange', refresh);
        window.removeEventListener('focus', refresh);
        run(() => feed.unregister());
        head.remove();
        download.remove();
        for (const node of root.querySelectorAll('.se-tray-when')) node.remove();
        for (const node of root.querySelectorAll('[data-se-tray], [data-se-tray-hide], [data-se-tray-wide]')) {
          for (const name of ['data-se-tray', 'data-se-tray-option', 'data-se-tray-hide', 'data-se-tray-wide', 'title', 'aria-label']) {
            node.removeAttribute(name);
          }
        }
        html.removeAttribute('data-se-tray');
      },
    };
  }

  const view = SE.mount('Tray menu', () => document.querySelectorAll(`.${C.contextMenuContents}`), create, { sync: true });

  window.__seTray = {
    destroy() {
      view.destroy();
      delete window.__seTray;
    },
  };
})(window.__se);
