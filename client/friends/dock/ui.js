/*
 * Native list clicks, context menus, the hover flyout, and the per-frame sync pass.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { app, COPY, ctx, filterFly, flyHTML, moreFlyHTML, railModel, state, statusLabel, store } = ns;
  const { live } = ns;

  const { mainWindow, run } = SE;

  function onNativeFriendClick(event) {
    if (event.type === 'dblclick' || event.detail > 1) {
      if (
        event.target.closest?.('.friendsListContainer .friend, .friendlist .friend') ||
        (event.target.closest?.(
          '.friendsListContainer .ChatRoomListGroupItem_header, .friendlist .ChatRoomListGroupItem_header'
        ) &&
          !event.target.closest?.('.openGroupButton, .ContextMenuButton'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (event.button != null && event.button !== 0) return;

    const groupHeader = event.target.closest?.('.ChatRoomListGroupItem_header');
    if (
      groupHeader &&
      groupHeader.closest('.friendsListContainer, .friendlist') &&
      ns.steamHost.contains(groupHeader) &&
      !event.target.closest('.openGroupButton, .ContextMenuButton, button, a, input, textarea')
    ) {
      const group = ns.resolveGroupFromRow(groupHeader);
      const uid = group && ns.groupUniqueId(group);
      const justRouted =
        uid &&
        (live.lastNativeRoute?.id === uid || live.lastNativeRoute?.uid === uid) &&
        performance.now() - live.lastNativeRoute.at < 350;
      if (group && uid && (justRouted || ns.openDockChat(uid, undefined, group))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const row = event.target.closest?.('.friend');
    if (
      !row ||
      !row.closest('.friendsListContainer, .friendlist') ||
      !ns.steamHost.contains(row) ||
      row.closest('.currentUserContainer') ||
      event.target.closest('button, a, input, textarea')
    ) {
      return;
    }
    const friend = SE.fromProps?.(row, 20, (props) => (props.friend?.accountid != null ? props.friend : null));
    const fid = friend && String(friend.accountid);
    const fuid = fid ? `f${fid}` : '';
    const justRouted =
      friend &&
      (live.lastNativeRoute?.id === fid || live.lastNativeRoute?.uid === fuid) &&
      performance.now() - live.lastNativeRoute.at < 350;
    if (friend && ns.findFriend(friend.accountid) && (justRouted || ns.openDockChat(friend.accountid))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onNativeChannelClick(event) {
    if (event.button != null && event.button !== 0) return;
    const channel = event.target.closest?.(
      '.ChatRoomListGroupItemChatRooms .chatRoomVoiceChannel, .ChatRoomListGroupItemChatRooms .chatRoomTextChannel'
    );
    if (
      !channel ||
      !ns.steamHost.contains(channel) ||
      event.target.closest('.ContextMenuButton, button, a, input, textarea')
    ) {
      return;
    }
    const group = ns.resolveGroupFromRow(channel);
    const uid = group && ns.groupUniqueId(group);
    if (!group || !uid) return;
    const justRouted =
      (live.lastNativeRoute?.id === uid || live.lastNativeRoute?.uid === uid) &&
      performance.now() - live.lastNativeRoute.at < 350;
    if (!justRouted) {
      ns.openDockChat(uid, undefined, group);
    }
  }

  function openChat(id) {
    const a = app();
    const f = ns.findFriend(id);
    if (!a || !f) return;
    if (!ns.openDockChat(id)) {
      if (SE.railMode()) ns.reportChatError();
      else run(() => f.OpenChatDialog(ctx(a)));
    }
  }

  function openGroup(id) {
    const a = app();
    const g = ns.findGroup(id);
    if (!a || !g) return;
    const uid = ns.groupUniqueId(g);
    if (uid && ns.openDockChat(uid, ctx(a), g)) return;
    if (SE.railMode()) ns.reportChatError();
    else run(() => a.UIStore.ShowAndOrActivateChatRoomGroup(ctx(a), g, true));
  }

  const steamURL = (url) => run(() => window.SteamClient.URL.ExecuteSteamURL(url));

  function applyMode(m) {
    state.mode = m;
    hideFly(true);
    state.sig = '';
    ns.place();
    // The title bar's Friends & Chat button mirrors the dock's state (data-se-dock: open, rail, hidden)
    window.__seHeaderActions?.syncFriendsButton?.();
  }

  /*
   * Small windows (1400 px and under) fold the dock to its rail (client/shared/window-fold.js).
   * Expanding it there holds it open until the window crosses the breakpoint; the saved
   * choice is only changed on a big window, and comes back once the window grows again.
   */
  const DOCK_FOLD_AT = 1400;
  const savedMode = () => store.get('se-fdock', 'open');
  const foldedMode = () => (live.fold.held ? 'open' : 'rail');
  live.fold = SE.windowFold(DOCK_FOLD_AT, () => {
    if (!state.destroyed) applyMode(live.fold.small ? foldedMode() : savedMode());
  });
  if (live.fold.small) state.mode = foldedMode();

  function setMode(m) {
    if (live.fold.small) {
      if ((m === 'open') !== live.fold.held) live.fold.toggle();
    } else {
      store.set('se-fdock', m);
    }
    applyMode(m);
  }

  /*
   * The dock's menus (status, a friend's): the popup layer's menu (client/shared/popup-layer.js),
   * in the page on the Library, in a popup window above a Store or Community page. It handles
   * keys and outside clicks itself.
   */
  live.menu = null;
  // The dock's stylesheets, from the loader's list (its .css is in before any script runs): what a
  // popup window showing dock marks copies (here, chat-popup.js, friend-card.js)
  const DOCK_SHEETS = [...(window.__seClient?.sheets?.keys() || [])].filter((file) =>
    /^client\/friends\/friends-dock[^/]*\.css$/.test(file)
  );
  ns.dockSheets = DOCK_SHEETS;
  const menuOpen = () => Boolean(live.menu && !live.menu.released);

  function hideMenu() {
    live.menu?.release();
    live.menu = null;
  }

  // At (x, y), kept a margin inside the main window as the menu always has been.
  function showMenu(items, x, y, owner) {
    hideMenu();
    const margin = SE.px('--se-space-2');
    const spot = (w, h) => ({
      left: Math.max(margin, Math.min(x, innerWidth - w - margin)),
      top: Math.max(margin, Math.min(y, innerHeight - h - margin)),
    });
    live.menu = SE.layer?.menu(items, spot, { sheets: DOCK_SHEETS, owner }) || null;
  }

  const PERSONA = { online: 1, away: 3, invisible: 7 };

  function setStatus(st) {
    const a = app();
    const done =
      st === 'offline'
        ? run(() => (a.SignOutOfFriends ? (a.SignOutOfFriends(), true) : false))
        : run(() => (a.FriendStore.SetUserPersonaState(PERSONA[st]), true));
    if (!done) steamURL(`steam://friends/status/${st}`);
    clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
      state.statusTimer = 0;
      state.sig = '';
      ns.render();
    }, 300);
  }

  function statusMenu(btn) {
    if (menuOpen()) {
      hideMenu();
      return;
    }
    const r = btn.getBoundingClientRect();
    showMenu(
      ['online', 'away', 'invisible', 'offline'].map((st) => ({
        state: st,
        label: statusLabel(st),
        run: () => setStatus(st),
      })),
      r.left,
      r.bottom + 6,
      btn
    );
  }

  function friendMenu(id, x, y) {
    const f = ns.findFriend(id);
    if (!f) return;
    const appid = run(() => f.persona.m_unGamePlayedAppID) || 0;
    const items = [
      // Glyphs and hints as the friend menu's rows (client/friends/friend-menu.css, friend-menu.js)
      { label: COPY.message, icon: '--se-icon-bubble', hint: COPY.messageHint, run: () => openChat(id) },
      {
        label: COPY.profile,
        icon: '--se-icon-user',
        hint: COPY.profileHint,
        run: () => {
          const u =
            run(() => f.persona.GetCommunityProfileURL?.()) ||
            run(() => f.GetCommunityProfileURL?.()) ||
            `https://steamcommunity.com/profiles/${run(() => f.persona.GetSteamIDAsString())}/`;
          steamURL(`steam://openurl/${u}`);
        },
      },
    ];
    if (appid) {
      items.push({
        label: COPY.viewGame(run(() => f.persona.GetCurrentGameName()) || ''),
        icon: '--se-icon-library',
        hint: COPY.viewGameHint,
        run: () => {
          const m = mainWindow();
          run(() => m.Navigate(`/library/app/${appid}`));
        },
      });
    }
    showMenu(items, x, y);
  }

  // Steam's leave-a-group function (asks first: "Leave … ?"), found once in its bundle by the confirm it shows
  const leaveGroupFn = () =>
    SE.findModule('friends-dock:leave-group', (src, id, req) => {
      if (!src.includes('#Chat_Actions_LeaveChatRoomGroup_Confirm')) return null;
      return Object.values(run(() => req(id)) || {}).find(
        (v) => typeof v === 'function' && Function.prototype.toString.call(v).includes('LeaveChatRoomGroup_Confirm')
      ) || null;
    });

  /*
   * A group chat's menu: Open, Favorite or Unfavorite (Steam's favorites, { chat }), Leave in red
   * through Steam's own confirm (no row when that can't be found: a group is never left unasked)
   */
  function groupMenu(id, x, y) {
    const a = app();
    const g = ns.findGroup(id);
    if (!a || !g) return;
    const favorites = run(() => a.FriendStore.FavoritesStore);
    const favorite = Boolean(run(() => favorites.BIsFavorited({ chat: g })));
    const items = [
      { label: COPY.openGroup, icon: '--se-icon-bubble', hint: COPY.openGroupHint, run: () => openGroup(id) },
      {
        label: favorite ? COPY.unfavorite : COPY.favorite,
        icon: '--se-icon-heart',
        hint: favorite ? COPY.unfavoriteHint : COPY.favoriteHint,
        run: () => run(() => (favorite ? favorites.RemoveFromFavorites({ chat: g }) : favorites.AddToFavorites({ chat: g }))),
      },
    ];
    const leave = leaveGroupFn();
    if (leave) {
      items.push(
        { separator: true },
        // Steam's function takes the DOM window its confirm opens over (the dock's: the main window)
        { label: COPY.leaveGroup, icon: '--se-icon-sign-out', hint: COPY.leaveGroupHint, danger: true, run: () => run(leave, window, g) }
      );
    }
    showMenu(items, x, y);
  }

  // A right-click on a friend or a group: its menu at (x, y), main-window pixels
  function rowMenu(row, x, y) {
    if (row.dataset.friend) friendMenu(row.dataset.friend, x, y);
    else groupMenu(row.dataset.group, x, y);
  }

  // Rows are divs with role=button: Enter and Space press them, as on a button.
  function pressRow(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
      e.preventDefault();
      e.target.click();
    }
  }

  /*
   * Over a browser page the flyout is drawn for real in a popup window (a popup-layer panel,
   * client/shared/popup-layer.js): the dock's own element, in the main window, would sit under the
   * page's browser view. Same markup and listeners as the dock's own. Returns false when no
   * window could open, and the dock's element shows instead.
   */
  live.flyPanel = null;

  function showFlyPanel(key, html, tile) {
    let entry = live.flyPanel;
    if (entry && !entry.panel.released && entry.key === key && entry.html === html) return true;
    if (!entry || entry.panel.released) {
      const panel = SE.layer?.panel({ sheets: DOCK_SHEETS });
      if (!panel) return false;
      entry = live.flyPanel = { panel, key: '', html: '' };
    }
    entry.key = key;
    entry.html = html;
    const refocus = flySearchFocused();
    ns.friendCard?.leaveFly();
    ns.fly.classList.remove('se-fd-show');
    const right = ns.dock.getBoundingClientRect().left - SE.px('--se-space-3');
    const top = tile.getBoundingClientRect().top - SE.px('--se-fd-fly-lift');
    entry.panel.show({ right, top }, (container) => {
      container.insertAdjacentHTML('beforeend', `<div class="se-fd-fly se-fd-show">${html}</div>`);
      const card = container.lastElementChild;
      entry.card = card;
      wireFlySearch(card);
      restoreFlySearch(card, refocus);
      for (const type of ns.interactionEvents) card.addEventListener(type, ns.markDockInteraction, true);
      card.addEventListener('keydown', pressRow);
      card.addEventListener('mouseenter', () => clearTimeout(state.flyTimer));
      card.addEventListener('mouseleave', () => hideFly());
      card.addEventListener('click', openFlyRow);
      card.addEventListener('contextmenu', (event) => {
        const row = event.target.closest('[data-friend], [data-group]');
        if (!row) return;
        event.preventDefault();
        // Menus are placed in main-window pixels: the card's corner there, plus the point in it.
        const box = card.getBoundingClientRect();
        rowMenu(row, right - box.width + event.clientX - box.left, top + event.clientY - box.top);
      });
    });
    return true;
  }

  /*
   * The "+N" flyout's search, in the dock's flyout or a popup card: it filters as you type,
   * Escape closes, and the flyout stays open while the search has the focus or the pointer is
   * over it. Rebuilt markup (the list changed) gets the text back and, if it had it, the focus.
   */
  const flyRoot = () => live.flyPanel?.card || ns.fly;

  function flySearchFocused() {
    const root = flyRoot();
    const active = root.ownerDocument.activeElement;
    return Boolean(active?.matches?.('.se-fd-flysearch input') && root.contains(active));
  }

  function restoreFlySearch(root, refocus) {
    const input = root.querySelector('.se-fd-flysearch input');
    if (!input) return;
    input.value = state.flyQuery;
    filterFly(root, state.flyQuery);
    if (refocus) input.focus();
  }

  function wireFlySearch(el) {
    el.addEventListener('input', (event) => {
      if (!event.target.matches('.se-fd-flysearch input')) return;
      state.flyQuery = event.target.value;
      filterFly(el, state.flyQuery);
    });
    el.addEventListener('keydown', (event) => {
      if (!event.target.matches('.se-fd-flysearch input')) return;
      event.stopPropagation();
      if (event.key === 'Escape') hideFly(true);
    });
    el.addEventListener('focusout', (event) => {
      if (!el.contains(event.relatedTarget)) hideFly();
    });
  }

  // A flyout's row: a friend's chat or a group's
  function openFlyRow(event) {
    const row = event.target.closest('[data-friend], [data-group]');
    if (!row) return;
    event.stopPropagation();
    ns.friendCard?.leaveFly();
    if (row.dataset.friend) openChat(row.dataset.friend);
    else openGroup(row.dataset.group);
  }

  // A rail tile's flyout (data-fly): a game's players, or a "+N" tile's rest ("more:<section>")
  function flyFor(key) {
    if (!state.data) return '';
    if (key.startsWith('more:')) {
      const sec = railModel(state.data).find((s) => s.key === key.slice(5));
      return sec?.rest.length ? moreFlyHTML(sec) : '';
    }
    const g = state.data.games.find((x) => x.key === key);
    return g ? flyHTML(g) : '';
  }

  function showFly(key, keep) {
    const html = flyFor(key);
    const tile = ns.dock.querySelector(`[data-fly="${CSS.escape(key)}"]`);
    if (!html || !tile) return hideFly(true);
    clearTimeout(state.flyTimer);
    if (key !== state.flyKey) state.flyQuery = '';
    state.flyKey = key;
    if (SE.browserShown() && showFlyPanel(key, html, tile)) return undefined;
    live.flyPanel?.panel.release();
    live.flyPanel = null;
    if (!keep || ns.fly.dataset.key !== key || ns.fly.dataset.html !== html) {
      const refocus = flySearchFocused();
      ns.friendCard?.leaveFly();
      ns.fly.innerHTML = html;
      ns.fly.dataset.key = key;
      ns.fly.dataset.html = html;
      restoreFlySearch(ns.fly, refocus);
    }
    // Reads first (the tile, the card's height, the tokens), then the one write.
    const r = tile.getBoundingClientRect();
    const margin = SE.px('--se-space-2');
    const top = Math.max(margin, Math.min(r.top - SE.px('--se-fd-fly-lift'), innerHeight - ns.fly.offsetHeight - margin));
    ns.fly.style.top = `${top}px`;
    ns.fly.classList.add('se-fd-show');
    return undefined;
  }

  function hideFly(now) {
    if (!now && (flySearchFocused() || flyRoot().matches(':hover'))) return;
    clearTimeout(state.flyTimer);
    const go = () => {
      ns.friendCard?.leaveFly();
      state.flyKey = null;
      ns.fly.classList.remove('se-fd-show');
      live.flyPanel?.panel.release();
      live.flyPanel = null;
    };
    if (now) go();
    else state.flyTimer = setTimeout(go, 220);
  }

  // A click that navigates (a page icon, a store or community link): the open chat stays put.
  function noteNavigation(e) {
    const navigation = e.target.closest?.('.se-menu-icon, a[href]');
    const href = navigation?.getAttribute('href') || navigation?.dataset?.url || '';
    if (
      navigation &&
      (navigation.matches('.se-menu-icon') ||
        /^(?:https?:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)|steam:\/\/(?:store|openurl)\/|\/(?:library|store|community)\b)/i.test(
          href
        ))
    ) {
      state.chatNavigationUntil = performance.now() + 1500;
    }
  }

  function onContext(e) {
    const row = e.target.closest?.('[data-friend], [data-group]');
    if (!row || ns.steamHost.contains(row) || !(ns.dock.contains(row) || ns.fly.contains(row))) return;
    e.preventDefault();
    e.stopPropagation();
    rowMenu(row, e.clientX, e.clientY);
  }

  live.frame = 0;

  function sync() {
    if (live.frame) cancelAnimationFrame(live.frame);
    live.frame = 0;
    if (state.destroyed) return;
    ns.syncChatTabs();
    ns.keepLibraryManagers();
    ns.resumeOverlayChat();
    ns.place();
  }

  // For callers outside the observer (navigation, focus, native events): one pass next frame.
  function schedule() {
    if (!state.destroyed && !live.frame) live.frame = requestAnimationFrame(sync);
  }

  Object.assign(ns, {
    noteNavigation, hideFly, hideMenu, onContext, onNativeChannelClick,
    onNativeFriendClick, openChat, openFlyRow, openGroup, wireFlySearch, pressRow, schedule, setMode, showFly, statusMenu,
    steamURL, sync,
  });
})(window.__se);
