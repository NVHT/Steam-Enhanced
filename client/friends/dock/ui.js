/*
 * Native list clicks, context menus, the hover flyout, and the per-frame sync pass.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { app, COPY, ctx, flyHTML, state, statusLabel, store } = ns;
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

  function setMode(m) {
    state.mode = m;
    store.set('se-fdock', m);
    hideFly(true);
    state.sig = '';
    ns.place();
  }

  const menu = document.createElement('div');

  function hideMenu() {
    menu.remove();
    menu.textContent = '';
  }

  function showMenu(items, x, y) {
    menu.textContent = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.state) b.dataset.state = it.state;
      b.innerHTML = `${it.state ? '<i></i>' : ''}<span></span>`;
      b.lastChild.textContent = it.label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideMenu();
        it.run();
      });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - h - 8))}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
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
    if (menu.isConnected) {
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
      r.bottom + 6
    );
  }

  function friendMenu(id, x, y) {
    const f = ns.findFriend(id);
    if (!f) return;
    const appid = run(() => f.persona.m_unGamePlayedAppID) || 0;
    const items = [
      { label: COPY.message, run: () => openChat(id) },
      {
        label: COPY.profile,
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
        run: () => {
          const m = mainWindow();
          run(() => m.Navigate(`/library/app/${appid}`));
        },
      });
    }
    showMenu(items, x, y);
  }

  // Rows are divs with role=button: Enter and Space press them, as on a button.
  function pressRow(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
      e.preventDefault();
      e.target.click();
    }
  }

  function showFly(key, keep) {
    const g = state.data?.games.find((x) => x.key === key);
    const tile = ns.dock.querySelector(`.se-fd-railgame[data-game="${CSS.escape(key)}"]`);
    if (!g || !tile) return hideFly(true);
    clearTimeout(state.flyTimer);
    state.flyGame = key;
    const html = flyHTML(g);
    if (!keep || ns.fly.dataset.key !== key || ns.fly.dataset.html !== html) {
      ns.fly.innerHTML = html;
      ns.fly.dataset.key = key;
      ns.fly.dataset.html = html;
    }
    const r = tile.getBoundingClientRect();
    ns.fly.style.top = `${Math.max(8, Math.min(r.top - 6, innerHeight - ns.fly.offsetHeight - 8))}px`;
    ns.fly.classList.add('se-fd-show');
    return undefined;
  }

  function hideFly(now) {
    clearTimeout(state.flyTimer);
    const go = () => {
      state.flyGame = null;
      ns.fly.classList.remove('se-fd-show');
    };
    if (now) go();
    else state.flyTimer = setTimeout(go, 220);
  }

  function closeMenu(e) {
    if (!e.target.closest?.('.se-fd-menu, [data-act="status"]')) hideMenu();

    const navigation = e.target.closest?.('.se-menu-icon, .se-rail-extra, a[href]');
    const href = navigation?.getAttribute('href') || navigation?.dataset?.url || '';
    if (
      navigation &&
      (navigation.matches('.se-menu-icon, .se-rail-extra') ||
        /^(?:https?:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)|steam:\/\/(?:store|openurl)\/|\/(?:library|store|community)\b)/i.test(
          href
        ))
    ) {
      state.chatNavigationUntil = performance.now() + 1500;
      return;
    }

  }

  function onContext(e) {
    const row = e.target.closest?.('[data-friend]');
    if (!row || ns.steamHost.contains(row) || !(ns.dock.contains(row) || ns.fly.contains(row))) return;
    e.preventDefault();
    e.stopPropagation();
    friendMenu(row.dataset.friend, e.clientX, e.clientY);
  }

  function onKeyMenu(event) {
    if (event.key === 'Escape' && menu.isConnected) hideMenu();
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
    closeMenu, hideFly, hideMenu, menu, onContext, onKeyMenu, onNativeChannelClick,
    onNativeFriendClick, openChat, openGroup, pressRow, schedule, setMode, showFly, statusMenu,
    steamURL, sync,
  });
})(window.__se);
