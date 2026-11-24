/*
 * The chat flyout: Steam's chat in a native popup window or a portal, its geometry and
 * navigation, and the minimized chat chip.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const {
    avatar, chatError, chatErrorText, closeGroupPanels, desktopChatFocused, disposeGroupFlyouts,
    dock, findEmbed, findFriend, findGroup, groupAvatar, interactionEvents,
    keepLibraryManagers, markDockInteraction, onStore, place, requestChatHandoff, schedule, state,
    STATE, usableAvatar,
  } = ns;
  const { live } = ns;

  const { C, mainWindow, run } = SE;

  const steamHost = document.createElement('div');

  const chatBack = document.createElement('button');

  const chatMinimize = document.createElement('button');

  const chatChip = document.createElement('button');

  const chipAvatar = document.createElement('span');
  const chipText = document.createElement('span');
  const chipName = document.createElement('span');
  const chipCount = document.createElement('span');
  const chipChevron = document.createElement('span');

  live.chatPopup = null;
  const layer = SE.layer;
  let popupFailure = false;
  // What the chat popup's window copies from the main window: the base tokens and icons, the
  // dock's files (friends-dock-chat*.css size the host and place its buttons), and every
  // stylesheet the loader adds from the Friends list's and the chat's folders.
  const CHAT_SHEETS = new Set([
    'core/tokens.css', 'core/icons-nav.css', 'core/icons-ui.css', 'core/scrollbars.css',
    ...ns.dockSheets,
  ]);
  const CHAT_FOLDERS = /^client\/friends\/(?:list|chat)\/[^/]+\.css$/;

  let portalTarget = null;
  let chatRenderer = null;
  const chatRoot = () => live.chatPopup?.chatHost || steamHost;

  function findChatAncestry(panel) {
    let chatFiber;
    let parent;
    let ownerContext;
    let modalContext;

    for (let fiber = panel && SE.fiber(panel); fiber; fiber = fiber.return) {
      const instance = fiber.stateNode;
      const props = fiber.memoizedProps;
      if (fiber.tag === 10 && props?.value?.ownerWindow && !ownerContext) {
        ownerContext = { Type: fiber.type, value: props.value };
      }
      if (!modalContext && props?.browserInfo && 'bUsePopups' in props && typeof fiber.type !== 'string') {
        modalContext = {
          Type: fiber.elementType || fiber.type,
          browserInfo: props.browserInfo,
          DialogWrapper: props.DialogWrapper,
          bUseDialogElement: props.bUseDialogElement,
        };
      }
      if (!chatFiber && typeof instance?.OnChatTabRef === 'function' && instance.props?.tabs) {
        chatFiber = fiber;
        continue;
      }
      if (
        chatFiber &&
        typeof instance?.forceUpdate === 'function' &&
        instance.props?.tabset === chatFiber.stateNode.props.tabs &&
        !parent
      ) {
        parent = instance;
      }
    }

    if (!chatFiber || !parent) {
      throw new Error(panel ? 'Chat component not found in React ancestry' : 'Chat panel has not mounted');
    }
    if (!ownerContext || !modalContext) {
      throw new Error('Steam popup context providers unavailable');
    }
    return { chatFiber, parent, ownerContext, modalContext };
  }

  function setChatPortal(target, runtime) {
    if (target && !chatRenderer) {
      const { chatFiber, parent, ownerContext, modalContext } = findChatAncestry(
        steamHost.querySelector('.multiChatDialog')
      );
      const jsx = findEmbed()?.jsx;
      if (!jsx) throw new Error('Steam JSX runtime unavailable');
      const type = chatFiber.type;
      const tabs = chatFiber.stateNode.props.tabs;
      const ref = parent.m_refChatDialog || chatFiber.ref;
      const patches = [];

      try {
        for (const name of ['jsx', 'jsxs']) {
          const ownDesc = Object.getOwnPropertyDescriptor(jsx, name);
          if (!ownDesc || typeof ownDesc.value !== 'function' || !ownDesc.writable) continue;
          const original = ownDesc.value;
          const wrapper = function (Type, props, ...rest) {
            const element = original.call(this, Type, props, ...rest);
            const matches = props?.tabs === tabs && (ref ? props.ref === ref : Type === type);
            if (!portalTarget || !matches) return element;
            chatRenderer.matches++;
            const ownerWindow = portalTarget.ownerDocument.defaultView;

            // Rebase Steam's window and manager context providers to the popup document
            // so dialogs/context menus spawned from chat do not target the Library window.
            const localManagers = runtime.React.createElement(
              modalContext.Type,
              {
                browserInfo: modalContext.browserInfo,
                DialogWrapper: modalContext.DialogWrapper,
                bUseDialogElement: modalContext.bUseDialogElement,
                bUsePopups: true,
                bOnlyPopups: true,
                bRenderOverlayAtRoot: false,
                bRegisterManagersWithWindow: true,
                refModalManager: live.chatPopup?.modalRef,
                refContextMenuManager: live.chatPopup?.menuRef,
              },
              element
            );
            const content = runtime.React.createElement(
              ownerContext.Type,
              { value: { ...ownerContext.value, ownerWindow } },
              localManagers
            );
            return runtime.createPortal(content, portalTarget, 'se-chat-flyout');
          };
          Object.defineProperty(jsx, name, { ...ownDesc, value: wrapper });
          patches.push({ name, own: ownDesc, wrapper });
        }
        if (!patches.length) throw new Error('Steam JSX runtime is read-only');
        chatRenderer = { parent, jsx, patches, matches: 0, flushSync: runtime.flushSync };
      } catch (error) {
        for (const patch of patches) Object.defineProperty(jsx, patch.name, patch.own);
        throw error;
      }
    }
    portalTarget = target;
    if (chatRenderer) chatRenderer.flushSync(() => chatRenderer.parent.forceUpdate());
  }

  function restoreChatRenderer() {
    portalTarget = null;
    if (!chatRenderer) return;
    const { jsx, patches } = chatRenderer;
    for (const patch of patches) {
      if (jsx[patch.name] === patch.wrapper) {
        Object.defineProperty(jsx, patch.name, patch.own);
      }
    }
    chatRenderer = null;
  }

  function returnChatHost(entry) {
    if (entry.restored) return;
    entry.restored = true;
    clearTimeout(entry.portalTimer);
    try {
      setChatPortal(null);
    } catch (error) {
      console.warn('[Steam Enhanced] return chat portal', error);
    } finally {
      run(restoreChatRenderer);
      for (const type of interactionEvents) {
        run(() => entry.chatHost?.removeEventListener(type, markDockInteraction, true));
      }
      run(() => entry.chatObserver?.disconnect());
      run(() => entry.detachChatEnhancements?.());
      run(disposeGroupFlyouts);
      run(() => dock.append(chatBack, chatMinimize, chatChip));
    }
  }

  function closeChatPopup() {
    const entry = live.chatPopup;
    if (!entry) return;
    live.chatPopup = null;
    returnChatHost(entry);
    layer?.finish(entry);
  }

  function chatGeometry(minimized) {
    const group =
      Boolean(chatRoot().querySelector('.MultiUserChat:not([data-activechat="false"])')) ||
      Boolean(run(() => state.dockTabs?.activeTab?.GetChatRoomGroup?.()) || run(() => state.dockTabs?.activeTab?.m_group)) ||
      Boolean(findGroup(state.activeChatFriend));
    const key = [innerWidth, innerHeight, minimized, group, dock.dataset.mode, dock.isConnected, dock.hidden].join('|');
    if (state.geometryCache?.key !== key) state.geometryCache = { key, value: measureChat(minimized, group) };
    return state.geometryCache.value;
  }

  function measureChat(minimized, group) {
    const style = getComputedStyle(dock);
    const pixels = (name) => parseFloat(style.getPropertyValue(name)) || 0;
    const edge = pixels('--se-chat-edge');
    const bottom = pixels('--se-chat-bottom');
    const rect = dock.getBoundingClientRect();
    const dockWidth = rect.width;
    const maximumWidth = pixels(minimized ? '--se-chat-chip-width' : group ? '--se-chat-group-width' : '--se-chat-width');
    const width = Math.max(1, Math.min(maximumWidth, innerWidth - dockWidth - edge * 2));
    const height = minimized
      ? pixels('--se-chat-chip-height')
      : Math.max(1, Math.min(pixels('--se-chat-max-height'), innerHeight - pixels('--se-chat-height-clearance')));
    const left = Math.max(edge, rect.left - edge - width);
    const top = Math.max(0, innerHeight - bottom - height);
    return { width, height, edge, bottom, left, top };
  }

  function resizeChatPopup(entry, minimized, geometry) {
    entry.minimized = minimized;
    entry.width = geometry.width;
    entry.height = geometry.height;
    entry.left = geometry.left;
    entry.top = geometry.top;

    // The host sizes itself from these (friends-dock.css .se-fd-popup-host); the window from
    // layer.place below. A window still mounting has no node yet: mountChatPopupDocument sizes it
    const node = entry.node;
    if (!node) return;
    node.style.setProperty('--se-chat-host-width', `${entry.width}px`);
    node.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    node.style.setProperty('--se-chat-height', `${entry.height}px`);

    if (minimized) node.dataset.chatMinimized = '1';
    else delete node.dataset.chatMinimized;

    const left = Math.max(geometry.edge, dock.getBoundingClientRect().left - geometry.edge - entry.width);
    const top = Math.max(0, innerHeight - geometry.bottom - entry.height);
    layer.place(entry, { left, top, width: entry.width, height: entry.height });
  }

  let restoringChat = false;
  let overlayWasEnabled = false;
  live.chatNavigation = null;
  let navigationFrame = 0;

  function cancelChatNavigation() {
    live.chatNavigation = null;
    if (navigationFrame) cancelAnimationFrame(navigationFrame);
    navigationFrame = 0;
  }

  function beginChatNavigation(kind, destination) {
    if (dock.dataset.chat !== '1') return;
    const saved = live.chatNavigation?.minimized ?? (dock.dataset.chatMinimized === '1');
    cancelChatNavigation();
    const transaction = (live.chatNavigation = {
      minimized: saved,
      kind,
      destination: typeof destination === 'string' ? destination : '',
      signature: '',
      stable: 0,
      deadline: performance.now() + 1200,
    });
    closeChatPopup();

    const settle = () => {
      navigationFrame = 0;
      if (state.destroyed || live.chatNavigation !== transaction || dock.dataset.chat !== '1') return;
      const path = run(() => mainWindow()?.LocationPathName) || '';
      let requested = '';
      let current = '';
      for (const owner of SE.owners()) {
        const manager = run(() => owner.MainWindowBrowserManager);
        requested ||= run(() => manager?.m_URLRequested) || '';
        current ||= run(() => manager?.m_URL) || '';
      }
      const browser = onStore();
      const ready =
        transaction.kind === 'route'
          ? !transaction.destination || path === transaction.destination || path.startsWith(`${transaction.destination}/`)
          : browser &&
            (!transaction.destination ||
              current === transaction.destination ||
              (!current && requested === transaction.destination));
      const sigStr = JSON.stringify([path, requested, current, browser]);
      transaction.stable = ready && sigStr === transaction.signature ? transaction.stable + 1 : 0;
      transaction.signature = sigStr;
      if (transaction.stable < 2 && performance.now() < transaction.deadline) {
        navigationFrame = requestAnimationFrame(settle);
        return;
      }
      live.chatNavigation = null;
      requestChatHandoff();
      if (transaction.minimized) {
        dock.dataset.chatMinimized = '1';
        chatChip.hidden = false;
        chatBack.hidden = true;
      } else {
        resetMinimized();
        chatBack.hidden = false;
      }
      restoringChat = true;
      try {
        place();
      } finally {
        restoringChat = false;
      }
    };
    navigationFrame = requestAnimationFrame(settle);
  }

  function mountChatPopupDocument(node, entry, runtime) {
    if (live.chatPopup !== entry || entry.restored) return;
    const doc = node.ownerDocument;

    // Copied even when a `.*` patch may already reach the popup: a duplicate href is skipped.
    // Picked by file from the loader's list, so a file added to those folders comes along.
    layer.copyStyles(doc, (file) => Boolean(file) && (CHAT_SHEETS.has(file) || CHAT_FOLDERS.test(file)));

    window.__seChat?.attachDocument(doc);
    entry.detachChatEnhancements = () => window.__seChat?.detachDocument(doc);

    node.className = 'se-fdock se-fd-popup-host';
    node.dataset.mode = 'rail';
    node.dataset.chat = '1';
    node.style.setProperty('--se-chat-host-width', `${entry.width}px`);
    node.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    node.style.setProperty('--se-chat-height', `${entry.height}px`);
    node.style.setProperty('--se-chat-right', '0px');
    node.style.setProperty('--se-chat-bottom', '0px');
    node.style.setProperty('--se-chat-edge', '0px');
    if (entry.minimized) node.dataset.chatMinimized = '1';
    node.append(chatChip);

    const shell = doc.createElement('div');
    shell.className = 'se-fd-steam friendsui-container client_chat_frame fullheight';
    shell.innerHTML = '<div class="chat_main"><div class="chat_main_flex"></div></div>';
    node.append(shell, chatBack, chatMinimize);
    entry.chatHost = shell;
    for (const type of interactionEvents) {
      shell.addEventListener(type, markDockInteraction, true);
    }
    // Own observer on purpose: the chat popup's own shell (its own window), while it is open
    entry.chatObserver = new MutationObserver(schedule);
    entry.chatObserver.observe(shell, { childList: true, subtree: true });

    let attempts = 0;
    const attach = () => {
      if (live.chatPopup !== entry || entry.restored || state.destroyed) return;
      try {
        setChatPortal(shell.querySelector('.chat_main_flex'), runtime);
        if (!shell.querySelector('.multiChatDialog')) {
          throw new Error(`Chat portal has not committed (${chatRenderer?.matches || 0} matches)`);
        }
      } catch (error) {
        if (++attempts < 20 && /not mounted|not found in React ancestry|has not committed/.test(error.message)) {
          entry.portalTimer = setTimeout(attach, attempts < 5 ? 16 : 50);
          return;
        }
        queueMicrotask(() => {
          if (live.chatPopup !== entry) return;
          closeChatPopup();
          popupFailure = true;
          chatErrorText.textContent = `Unable to separate chat: ${error.message}.`;
          chatError.hidden = false;
          console.warn('[Steam Enhanced] chat portal', error);
        });
      }
    };
    queueMicrotask(attach);

    resizeChatPopup(entry, entry.minimized, chatGeometry(entry.minimized));
  }

  function syncChatOverlay(enabled) {
    if (live.chatNavigation) return;
    const enteringBrowser = enabled && !overlayWasEnabled;
    if (enabled !== overlayWasEnabled && dock.dataset.chat === '1') {
      state.chatNavigationUntil = performance.now() + 1500;
    }
    overlayWasEnabled = enabled;
    const minimized = dock.dataset.chatMinimized === '1';

    if (!enabled || dock.dataset.chat !== '1') {
      closeChatPopup();
      popupFailure = false;
      return;
    }

    const geometry = chatGeometry(minimized);
    if (
      live.chatPopup &&
      live.chatPopup.minimized === minimized &&
      live.chatPopup.width === geometry.width &&
      live.chatPopup.height === geometry.height &&
      live.chatPopup.left === geometry.left &&
      live.chatPopup.top === geometry.top
    ) {
      return;
    }
    if (live.chatPopup?.node && !live.chatPopup.restored && live.chatPopup.handle?.visible) {
      resizeChatPopup(live.chatPopup, minimized, geometry);
      return;
    }
    if (
      !minimized &&
      !restoringChat &&
      !enteringBrowser &&
      performance.now() > state.chatNavigationUntil &&
      !desktopChatFocused()
    ) {
      return;
    }

    closeChatPopup();
    if (popupFailure) return;
    keepLibraryManagers();
    const runtime = layer?.runtime();
    if (!runtime) {
      popupFailure = true;
      chatErrorText.textContent = `Steam chat popup unavailable (${layer?.missing() || 'popup layer'}). Return to Library to use the flyout.`;
      chatError.hidden = false;
      return;
    }
    if (layer.menuOpen()) return;

    /*
     * The chat takes the popup layer's ready window (opened while the Store shows), so it
     * shows at once, and its state rides on that window's entry: one object for the window
     * and the chat (layer.place, the hide callback, flyouts.js's visibility check).
     */
    const { width, height, left, top } = geometry;
    let entry = null;
    const onClose = () => {
      if (live.chatPopup !== entry) return;
      live.chatPopup = null;
      returnChatHost(entry);
      layer.finish(entry);
      queueMicrotask(() => {
        if (state.destroyed || dock.dataset.chat !== '1') return;
        if (!live.chatPopup) place();
      });
    };
    entry = layer.take({
      // Steam can mount a new window inside take(): the chat goes in once it has its entry.
      mounted: () => entry && live.chatPopup === entry && mountChatPopupDocument(entry.node, entry, runtime),
      restyled() {},
      lost: onClose,
    });
    if (!entry) {
      popupFailure = true;
      chatErrorText.textContent = 'Unable to create the Steam chat popup. Return to Library to use the flyout.';
      chatError.hidden = false;
      return;
    }
    Object.assign(entry, {
      minimized,
      width,
      height,
      left,
      top,
      restored: false,
      modalRef: { current: null },
      menuRef: { current: null },
    });
    live.chatPopup = entry;
    // A ready window is up already; a new one mounts the chat when it comes up (mounted).
    if (entry.node) mountChatPopupDocument(entry.node, entry, runtime);
  }

  const TAB_NAME = ['.ChatTabName', '.chatTabName', C.ChatTabContent_ChatRoomName, C.playerName]
    .filter(Boolean)
    .map((cls) => (cls.startsWith('.') ? cls : `.${cls}`))
    .join(', ');

  let chipSignature = '';

  function resetMinimized() {
    delete dock.dataset.chatMinimized;
    chatChip.hidden = true;
    chipSignature = '';
  }

  function updateChatChip() {
    if (dock.dataset.chatMinimized !== '1' || !state.dockTabs) return;
    const count = state.dockTabs.tabCount;

    const active = chatRoot().querySelector(`.chatTab.active, .${C.ChatTab}.${C.ChatTab_Active}`);
    const friend = findFriend(state.activeChatFriend);
    const group = !friend ? findGroup(state.activeChatFriend) : null;
    const name =
      active
        ?.querySelector(TAB_NAME)
        ?.textContent?.trim() ||
      run(() => friend.display_name) ||
      run(() => group.name) ||
      chatRoot()
        .querySelector('.chatWindow.MultiUserChat:not([data-activechat="false"]) .chatRoomGroupHeaderName')
        ?.textContent.trim() ||
      'Chat';
    const url =
      active?.querySelector('.avatarHolder img, .ChatRoomGroupAvatar img')?.getAttribute('src') ||
      run(() => friend.persona.avatar_url_medium) ||
      run(() => group.avatar_url_medium) ||
      chatRoot()
        .querySelector('.chatWindow.MultiUserChat:not([data-activechat="false"]) .ChatRoomGroupAvatar img')
        ?.getAttribute('src') ||
      '';
    const isGroup = Boolean(group && !friend);
    const art = isGroup ? usableAvatar(url) : url;
    const status = friend ? STATE[run(() => friend.persona.m_ePersonaState)] || 'online' : 'online';
    const sigStr = JSON.stringify([name, art, status, isGroup, count]);
    if (sigStr === chipSignature) return;
    chipSignature = sigStr;
    chipName.textContent = name;
    chipCount.textContent = count === 1 ? '1 chat' : `${count} chats`;
    chipAvatar.innerHTML = isGroup ? groupAvatar(name, art) : avatar(art, status, 30);
    chatChip.setAttribute('aria-label', `Restore ${name}, ${chipCount.textContent}`);
  }

  function restoreChat() {
    if (dock.dataset.chat !== '1' || !state.dockTabs?.tabCount) return;
    resetMinimized();
    chatBack.hidden = false;
    restoringChat = true;
    try {
      place();
    } finally {
      restoringChat = false;
    }
    run(() => state.dockTabs.FocusTextInput?.());
  }

  function minimizeChat() {
    cancelChatNavigation();
    if (dock.dataset.chat !== '1' || dock.dataset.chatMinimized === '1' || !state.dockTabs?.tabCount) return;
    dock.dataset.chatMinimized = '1';
    chatBack.hidden = true;
    chatChip.hidden = false;
    closeGroupPanels();
    updateChatChip();
    place();
    if (steamHost.contains(document.activeElement)) {
      document.activeElement?.blur?.();
    }
  }

  Object.assign(ns, {
    beginChatNavigation, cancelChatNavigation, chatBack, chatChip, chatGeometry, chatMinimize,
    chatRoot, chipAvatar, chipChevron, chipCount, chipName, chipText, closeChatPopup, minimizeChat,
    resetMinimized, resizeChatPopup, restoreChat, restoreChatRenderer, steamHost,
    syncChatOverlay, updateChatChip,
  });
})(window.__se);
