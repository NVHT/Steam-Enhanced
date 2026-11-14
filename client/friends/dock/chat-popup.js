/*
 * The chat flyout: Steam's chat in a native popup window or a portal, its geometry and
 * navigation, and the minimized chat chip.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedFriendsDockParts;
  if (!ns) return;
  const {
    avatar, chatError, chatErrorText, closeGroupPanels, desktopChatFocused, disposeGroupFlyouts,
    dock, findEmbed, findFriend, findGroup, groupAvatar, importOf, interactionEvents,
    keepLibraryManagers, markDockInteraction, onStore, place, requestChatHandoff, schedule, state,
    STATE, usableAvatar,
  } = ns;
  const { live } = ns;

  const { C, mainWindow, run } = SE;

  const steamHost = document.createElement('div');
  const steamBar = document.createElement('div');

  const chatBack = document.createElement('button');

  const chatMinimize = document.createElement('button');

  const chatChip = document.createElement('button');

  const chipAvatar = document.createElement('span');
  const chipText = document.createElement('span');
  const chipName = document.createElement('span');
  const chipCount = document.createElement('span');
  const chipChevron = document.createElement('span');

  live.chatPopup = null;
  let popupRuntime = null;
  let popupFailure = false;
  let popupRuntimeFailure = '';

  // React, the window's context-menu manager and ReactDOM's createPortal/flushSync, for the Store popup.
  function findChatPopupRuntime() {
    if (popupRuntime) return popupRuntime;
    const found = {};
    const complete = () =>
      found.React && found.manager && found.createPortal && found.flushSync ? { ...found } : null;
    const inspect = (exp) => {
      const values = [exp];
      try {
        values.push(...Object.values(exp || {}));
      } catch (_) {}
      for (const value of values) {
        if (typeof value?.createPortal === 'function') found.createPortal ||= value.createPortal;
        if (typeof value?.flushSync === 'function') found.flushSync ||= value.flushSync;
        if (!found.React && typeof value?.createElement === 'function' && typeof value?.useState === 'function') {
          found.React = value;
        }
        if (!found.manager) {
          const candidate = run(() => value?.m_mapManagers?.get(window));
          if (typeof candidate?.CreateContextMenuInstance === 'function') found.manager = candidate;
        }
      }
    };

    for (const req of SE.requires()) {
      for (const module of Object.values(req.c || {})) inspect(module?.exports);
    }
    popupRuntime =
      complete() ||
      SE.findModule('friends-dock:popup-runtime', (source, id, req) => {
        if (
          (!found.manager && source.includes('GetContextMenuManagerFromWindow') && source.includes('m_mapManagers')) ||
          (!found.React && source.includes('createElement') && source.includes('useState') && source.includes('Fragment'))
        ) {
          run(() => inspect(req(id)));
        }
        if ((!found.createPortal || !found.flushSync) && source.includes('.createPortal')) {
          for (const call of source.matchAll(/([\w$]+)\.createPortal\b/g)) {
            inspect(importOf(source, call[1], req));
            if (found.createPortal && found.flushSync) break;
          }
          if (!found.createPortal || !found.flushSync) run(() => inspect(req(id)));
        }
        return complete();
      });

    popupRuntimeFailure = popupRuntime
      ? ''
      : [
          !found.React && 'React',
          !found.manager && 'context-menu manager',
          !found.createPortal && 'ReactDOM portal',
          !found.flushSync && 'ReactDOM synchronous commit',
        ]
          .filter(Boolean)
          .join(', ');
    return popupRuntime;
  }

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
    run(() => entry.restorePositioner?.());
    clearTimeout(entry.portalTimer);
    run(() => entry.doc?.defaultView?.removeEventListener('beforeunload', entry.onClose));
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
    run(() => entry.handle?.Hide());
    run(() => entry.manager?.ReleaseHiddenMenu?.(entry.handle));
    entry.anchor?.remove();
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

  function positionChatPopup(entry) {
    if (entry.restored || live.chatPopup !== entry) return;
    const nativeWindow = entry.doc?.defaultView?.SteamClient?.Window;
    if (typeof nativeWindow?.PositionWindowRelative !== 'function') return;
    entry.restoreDetails ||= Promise.resolve().then(() => window.SteamClient.Window.GetWindowRestoreDetails());
    entry.restoreDetails
      .then((details) => {
        entry.restoreDetails = null;
        if (entry.restored || live.chatPopup !== entry) return;
        const geometry = chatGeometry(entry.minimized);
        const left = Math.max(geometry.edge, dock.getBoundingClientRect().left - geometry.edge - entry.width);
        const top = Math.max(0, innerHeight - geometry.bottom - entry.height);
        nativeWindow.PositionWindowRelative(details, left, top, entry.width, entry.height);
      })
      .catch(() => {
        entry.restoreDetails = null;
      });
  }

  function resizeChatPopup(entry, minimized, geometry) {
    entry.minimized = minimized;
    entry.width = geometry.width;
    entry.height = geometry.height;
    entry.left = geometry.left;
    entry.top = geometry.top;

    const node = entry.node;
    const root = entry.doc.documentElement;
    if (!entry.restorePositioner) {
      for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
        const instance = fiber.stateNode;
        if (typeof instance?.PositionMenu !== 'function' || typeof instance?.PositionPopupWindow !== 'function') {
          continue;
        }
        const ownDesc = Object.getOwnPropertyDescriptor(instance, 'PositionPopupWindow');
        if (ownDesc && !ownDesc.configurable) break;
        const position = () => positionChatPopup(entry);
        Object.defineProperty(instance, 'PositionPopupWindow', {
          configurable: true,
          writable: true,
          value: position,
        });
        entry.restorePositioner = () => {
          if (instance.PositionPopupWindow !== position) return;
          if (ownDesc) Object.defineProperty(instance, 'PositionPopupWindow', ownDesc);
          else delete instance.PositionPopupWindow;
        };
        break;
      }
    }

    for (const element of [node, root]) {
      element.style.setProperty('--se-chat-host-width', `${entry.width}px`);
      element.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    }
    node.style.setProperty('--se-chat-height', `${entry.height}px`);

    const menuElement = entry.handle?.m_element;
    if (menuElement?.style) {
      menuElement.style.setProperty('width', `${entry.width}px`, 'important');
      menuElement.style.setProperty('height', `${entry.height}px`, 'important');
      menuElement.style.setProperty('min-width', '0px', 'important');
      menuElement.style.setProperty('min-height', '0px', 'important');
    }

    if (minimized) {
      node.dataset.chatMinimized = '1';
      root.dataset.seChatMinimized = '1';
    } else {
      delete node.dataset.chatMinimized;
      delete root.dataset.seChatMinimized;
    }

    entry.sizeSignal.replaceChildren(entry.doc.createTextNode(''));
    positionChatPopup(entry);
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
    if (!node || live.chatPopup !== entry || entry.restored || entry.doc) return;
    const doc = node.ownerDocument;
    entry.doc = doc;
    entry.node = node;

    // Copied even when a `.*` patch may already reach the popup: a duplicate href is skipped below.
    for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (!/(?:core\/(?:tokens|icons|scrollbars)|client\/friends\/(?:friends|friends-dock|chat\/[a-z-]+))\.css(?:[?#]|$)/.test(sheet.href)) {
        continue;
      }
      if ([...doc.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === sheet.href)) continue;
      const copy = sheet.cloneNode(true);
      copy.href = sheet.href;
      doc.head.appendChild(copy);
    }

    doc.documentElement.classList.add('se-chat-popup-document');
    delete doc.documentElement.dataset.seChatMinimized;
    doc.documentElement.style.removeProperty('--se-chat-host-width');
    doc.documentElement.style.removeProperty('--se-chat-host-height');
    if (entry.minimized) {
      doc.documentElement.dataset.seChatMinimized = '1';
      doc.documentElement.style.setProperty('--se-chat-host-width', `${entry.width}px`);
      doc.documentElement.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    }

    window.__steamEnhancedChat?.attachDocument(doc);
    entry.detachChatEnhancements = () => window.__steamEnhancedChat?.detachDocument(doc);

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

    entry.sizeSignal = doc.createElement('span');
    entry.sizeSignal.hidden = true;
    node.append(entry.sizeSignal);
    resizeChatPopup(entry, entry.minimized, entry);
    doc.defaultView.addEventListener('beforeunload', entry.onClose);
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
    const runtime = findChatPopupRuntime();
    if (!runtime) {
      popupFailure = true;
      chatErrorText.textContent = `Steam chat popup unavailable (${popupRuntimeFailure}). Return to Library to use the flyout.`;
      chatError.hidden = false;
      return;
    }
    if (runtime.manager.ActiveMenu?.visible) return;

    const { width, height, edge, bottom, left, top } = geometry;
    const anchor = document.createElement('span');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0';
    anchor.getBoundingClientRect = () => {
      const anchorLeft = dock.getBoundingClientRect().left - edge;
      return new DOMRect(Math.max(edge, anchorLeft), Math.max(0, innerHeight - bottom), 0, 0);
    };
    document.body.appendChild(anchor);

    const entry = {
      minimized,
      width,
      height,
      left,
      top,
      anchor,
      manager: runtime.manager,
      handle: null,
      restored: false,
      doc: null,
      modalRef: { current: null },
      menuRef: { current: null },
    };

    entry.onClose = () => {
      if (live.chatPopup !== entry) return;
      live.chatPopup = null;
      returnChatHost(entry);
      entry.anchor.remove();
      queueMicrotask(() => run(() => entry.manager.ReleaseHiddenMenu?.(entry.handle)));
      queueMicrotask(() => {
        if (state.destroyed || dock.dataset.chat !== '1') return;
        if (!live.chatPopup) place();
      });
    };

    const mount = (node) => mountChatPopupDocument(node, entry, runtime);
    try {
      live.chatPopup = entry;
      entry.handle = runtime.manager.CreateContextMenuInstance(
        runtime.React.createElement('div', { ref: mount }),
        anchor,
        undefined,
        undefined,
        {
          bForcePopup: true,
          bStandalone: true,
          bDisableMouseOverlay: true,
          bOverlapHorizontal: false,
          bOverlapVertical: true,
          bPreferPopLeft: true,
          bPreferPopTop: true,
          bFitToWindow: true,
          bShiftToFitWindow: true,
          bGrowToElementWidth: false,
          bSkipFocusWhenReady: true,
          bNoFocusWhenShown: true,
          strClassName: 'se-chat-context-popup',
          title: 'Steam Enhanced Chat Flyout Menu',
        }
      );
      if (
        typeof entry.handle?.Show !== 'function' ||
        typeof entry.handle?.Hide !== 'function' ||
        typeof entry.handle?.SetOnHideCallback !== 'function'
      ) {
        throw new Error('No native context-popup handle');
      }
      entry.handle.TakeFocus = () => {};
      const cancel = entry.handle.OnCancel;
      if (typeof cancel === 'function') {
        entry.handle.OnCancel = function (...args) {
          if (live.chatPopup === entry) return undefined;
          return cancel.apply(this, args);
        };
      }
      entry.handle.SetOnHideCallback(entry.onClose);
      entry.handle.Show();
    } catch (error) {
      closeChatPopup();
      popupFailure = true;
      chatErrorText.textContent = 'Unable to create the Steam chat popup. Return to Library to use the flyout.';
      chatError.hidden = false;
      console.warn('[Steam Enhanced] native chat popup', error);
    }
  }

  const TAB_NAME = ['.ChatTabName', '.chatTabName', C.ChatTabContent_ChatRoomName, C.playerName]
    .filter(Boolean)
    .map((cls) => (cls.startsWith('.') ? cls : `.${cls}`))
    .join(', ');

  let chipSignature = '';
  let chipCountSeen = -1;

  function resetMinimized() {
    delete dock.dataset.chatMinimized;
    chatChip.hidden = true;
    chipSignature = '';
    chipCountSeen = -1;
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
    chipCountSeen = count;
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
    resetMinimized, resizeChatPopup, restoreChat, restoreChatRenderer, steamBar, steamHost,
    syncChatOverlay, updateChatChip,
  });
});
