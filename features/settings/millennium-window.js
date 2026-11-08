/*
 * Standalone Millennium Settings popup host.
 *
 * Mounts Millennium's registered settings route inside a detached Steam legacy
 * popup modal instead of navigating the main Library viewport, and exposes an
 * FFI / Library Manager bridge (`__seMillBridge`) to the popup window.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C } = SE;
  const SETTINGS_ROUTE = '/millennium/settings';
  const isSettingsRoute = (route) =>
    /^\/millennium\/settings(?:[/?#]|$)/.test(typeof route === 'string' ? route : route?.pathname || '');
  window.__seMillenniumWindow?.destroy();

  let popup;
  let popupScan;
  let pendingManager = false;
  let failure = '';
  let errorNotice = null;

  const popupDocuments = new Set();
  const managerEmbeds = new Map();
  const dialogHosts = new Map();
  let popupModalManagers = null;
  const guardedRoutes = new Map();
  const guardedNavigation = new Map();
  let redirectPending = false;
  let leaveRoute = false;
  let destroyed = false;

  function showError() {
    errorNotice?.remove();
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;top:70px;right:24px;z-index:2147483647;max-width:480px;padding:18px;border:1px solid #738599;border-radius:12px;background:#202833;color:#fff;font:14px/1.5 Arial,sans-serif';
    const text = document.createElement('div');
    text.textContent = `Millennium popup: ${failure || 'Popup runtime unavailable.'}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Dismiss';
    close.style.marginTop = '12px';
    close.addEventListener('click', () => {
      box.remove();
      if (errorNotice === box) errorNotice = null;
    });
    box.append(text, close);
    document.body.append(box);
    errorNotice = box;
  }

  function getManagerContext() {
    for (const owner of SE.owners()) {
      try {
        const manager = owner.document?.querySelector('.MillenniumDesktopSidebar');
        for (let fiber = SE.liveFiber(manager); fiber; fiber = fiber.return) {
          const value = fiber.memoizedProps?.value;
          if (
            fiber.type &&
            value &&
            typeof value.setFocusedItem === 'function' &&
            typeof value.openMenu === 'function' &&
            'plugins' in value &&
            'themes' in value
          ) {
            return value;
          }
        }
      } catch (_) {}
    }
    return null;
  }

  function installManagerTab(doc) {
    if (managerEmbeds.has(doc)) return;
    const root = doc.querySelector('.MillenniumSettings');
    const list = root?.querySelector(`.${C.PagedSettingsDialog_PageList}`);
    const page = root?.querySelector(`.${C.PagedSettingsDialog_PageContent}`);
    if (!list || !page) return;
    if (list.querySelector('.se-mill-label[data-se-label="Extend"]')) return;

    const pages = [...list.querySelectorAll(`.${C.PagedSettingsDialog_PageListItem}`)];
    const plugins = pages.length === 6 ? pages[3] : null;
    const extend = doc.createElement('div');
    extend.className = `${C.PageListSeparator} se-mill-label`;
    extend.setAttribute('data-se-label', 'Extend');
    if (plugins) plugins.before(extend);
    managerEmbeds.set(doc, () => {
      extend.remove();
    });
  }

  function onPopupTabClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const root = target.closest('.MillenniumSettings');
    const item = target.closest(`.${C.PagedSettingsDialog_PageListItem}, .PageListItem`);
    if (!root || !item || !root.contains(item)) return;

    const titleEl = item.querySelector(`.${C.PageListItem_Title}, .PageListItem_Title`);
    const label = (titleEl?.textContent || item.textContent || '').trim();
    if (!label) return;

    let selection = null;
    for (let fiber = SE.fiber(item), depth = 0; fiber && depth < 40; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (!Array.isArray(props?.pages) || typeof props.onPageRequested !== 'function') continue;
      const page = props.pages.find(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.route === 'string' &&
          typeof entry.title === 'string' &&
          entry.title.trim() === label &&
          isSettingsRoute(entry.route)
      );
      if (page) selection = { callback: props.onPageRequested, route: page.route };
    }
    if (!selection) return;

    // Invoke the outermost callback owned by MillenniumSettings so inner
    // SidebarNavigation wrappers do not navigate the main Steam window.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    selection.callback(selection.route);
  }

  function releasePopupDocument(doc) {
    const dispose = managerEmbeds.get(doc);
    managerEmbeds.delete(doc);
    popupDocuments.delete(doc);
    try {
      dispose?.();
    } catch (_) {}
    try {
      doc.removeEventListener('click', onPopupTabClick, true);
    } catch (_) {}
  }

  const millBridge = {
    windows() {
      const out = [window, ...SE.owners()];
      const root = document.querySelector('#root, [data-reactroot]') || document.body.firstElementChild;
      for (let f = SE.fiber(root), n = 0; f && n < 4000; f = f.return, n++) {
        try {
          if ((f.tag === 3 || f.tag === 4) && f.stateNode?.containerInfo) {
            const w = f.stateNode.containerInfo.ownerDocument?.defaultView;
            if (w && !out.includes(w)) out.push(w);
          }
        } catch (_) {}
      }
      for (let i = 0; i < out.length && out.length < 16; i++) {
        for (const k of ['opener', 'parent', 'top']) {
          try {
            const n = out[i][k];
            if (n && !out.includes(n)) out.push(n);
          } catch (_) {}
        }
      }
      return out;
    },
    ffi(name, args = []) {
      for (const o of millBridge.windows()) {
        try {
          const binder = o.MILLENNIUM_PRIVATE_INTERNAL_FOREIGN_FUNCTION_INTERFACE_DO_NOT_USE;
          if (
            binder &&
            typeof binder.call === 'function' &&
            typeof o.__private_millennium_ffi_do_not_use__ === 'function'
          ) {
            return binder.call(0, 'core', name, args, undefined, true);
          }
        } catch (_) {}
      }
      return Promise.reject(new Error('Millennium is not reachable'));
    },
    openLibraryManager(target) {
      const v = getManagerContext();
      if (typeof v?.openMenu === 'function') {
        v.openMenu(target?.theme ? { theme: target.theme } : undefined);
      } else {
        try {
          document.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: '2',
              code: 'Digit2',
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            })
          );
        } catch (_) {}
      }
      try {
        window.focus();
      } catch (_) {}
      try {
        SE.mainWindow()?.BringToFront?.();
      } catch (_) {}
    },
    core() {
      for (const o of millBridge.windows()) {
        try {
          const c = o.PLUGIN_LIST?.core;
          if (c) return c;
        } catch (_) {}
      }
      return null;
    },
  };

  function popupDialogParent() {
    for (const doc of popupDocuments) {
      const win = doc.defaultView;
      if (!win || win.closed) continue;
      const manager = popupModalManagers?.get(win);
      if (typeof manager?.ShowModal !== 'function' || manager.BOnlyPopups?.()) continue;

      // The DOM event covers synchronous commands, including plugin controls.
      // Core continuations can also open dialogs after the event has returned.
      const target = win.event?.target;
      if (target?.ownerDocument === doc) return win;
      if (doc.hasFocus() && /\bmillennium-frontend\.js(?=[:?#])/.test(new Error().stack || '')) return win;
    }
    return null;
  }

  function installDialogHosts() {
    for (const owner of millBridge.windows()) {
      try {
        const api = owner.MILLENNIUM_API;
        const original = api?.showModal;
        if (typeof original !== 'function' || dialogHosts.get(api)?.wrapped === original) continue;
        const descriptor = Object.getOwnPropertyDescriptor(api, 'showModal');
        function wrapped(element, parent, options) {
          const main = owner.PLUGIN_LIST?.core?.mainWindow;
          const popupParent = parent && (parent === window || parent === main) && !options?.bForcePopOut
            ? popupDialogParent()
            : null;
          if (!popupParent) return original.apply(this, arguments);

          // Steam's native helper uses the legacy popout path when given a title.
          // The dialog's visible heading belongs to its element and is preserved.
          return original.call(this, element, popupParent, {
            ...options,
            strTitle: undefined,
            browserContext: popupParent.browserInfo,
            bNeverPopOut: true,
            bHideMainWindowForPopouts: false,
          });
        }
        api.showModal = wrapped;
        if (api.showModal === wrapped) dialogHosts.set(api, { wrapped, descriptor });
      } catch (_) {}
    }
  }

  function removeDialogHosts() {
    for (const [api, { wrapped, descriptor }] of dialogHosts) {
      try {
        if (api.showModal !== wrapped) continue;
        if (descriptor) Object.defineProperty(api, 'showModal', descriptor);
        else delete api.showModal;
      } catch (_) {}
    }
    dialogHosts.clear();
  }

  function scanPopupDocuments() {
    for (const doc of new Set([...popupDocuments, ...managerEmbeds.keys()])) {
      if (!doc.defaultView || doc.defaultView.closed) releasePopupDocument(doc);
    }
    for (const owner of SE.owners()) {
      try {
        const popups = owner.g_PopupManager?.m_mapPopups;
        if (!popups?.values) continue;
        for (const entry of popups.values()) {
          const doc = entry.window?.document;
          if (!doc || doc === document || !doc.defaultView || doc.defaultView.closed || !doc.querySelector('.MillenniumSettings')) {
            continue;
          }
          try {
            doc.defaultView.__seMillBridge = millBridge;
          } catch (_) {}
          if (popupDocuments.has(doc)) continue;
          popupDocuments.add(doc);
          try {
            installManagerTab(doc);
          } catch (error) {
            console.warn('[Steam Enhanced] Library Manager tab:', error);
          }
          doc.addEventListener('click', onPopupTabClick, true);
        }
      } catch (_) {}
    }
    if (popupDocuments.size) {
      if (!dialogHosts.size) installDialogHosts();
      releasePopupNavigation();
    }
    if (pendingManager) {
      pendingManager = false;
      millBridge.openLibraryManager();
    }
  }

  function stopPopupTracking() {
    clearInterval(popupScan);
    popupScan = null;
    removeDialogHosts();
    popupModalManagers = null;
    for (const doc of new Set([...popupDocuments, ...managerEmbeds.keys()])) {
      releasePopupDocument(doc);
    }
  }

  function releasePopupNavigation() {
    // Millennium's Settings mount effect writes session flags assuming an in-client
    // navigation; clear those flags so a detached popup does not alter start_page.
    const owners = [...SE.owners()];
    for (const owner of owners) {
      try {
        const storage = owner.sessionStorage;
        if (!storage) continue;
        storage.removeItem('millennium-return-to-settings');
        const original = storage.getItem('millennium-original-start-page');
        if (original === null) continue;
        const store =
          owner.settingsStore?.m_ClientSettings ||
          owners
            .map((candidate) => {
              try {
                return candidate.settingsStore?.m_ClientSettings;
              } catch (_) {
                return null;
              }
            })
            .find(Boolean);
        if (store) {
          store.start_page = original;
          storage.removeItem('millennium-original-start-page');
        }
      } catch (_) {}
    }
  }

  function settingsRoutes(owner) {
    const state = owner.__ROUTER_HOOK_INSTANCE?.routerState;
    return state?._routes?.has?.(SETTINGS_ROUTE) ? state._routes : state?.publicState?.().routes;
  }

  function settingsComponent() {
    for (const owner of SE.owners()) {
      try {
        const entry = settingsRoutes(owner)?.get(SETTINGS_ROUTE);
        const component = entry?.component === PopupOnlySettings
          ? guardedRoutes.get(entry)
          : entry?.component;
        if (typeof component === 'function' || component?.$$typeof) return component;
      } catch (_) {}
    }
    return null;
  }

  function redirectToPopup(fromRoute = false) {
    leaveRoute ||= fromRoute;
    if (redirectPending) return;
    redirectPending = true;
    queueMicrotask(() => {
      redirectPending = false;
      if (destroyed) return;
      if (leaveRoute) {
        leaveRoute = false;
        SE.navigate('/library/home');
      }
      if (!openDirect()) showError();
    });
  }

  function redirectMountedRoute(node) {
    if (node) redirectToPopup(true);
  }

  function PopupOnlySettings() {
    const React = findRuntime(false)?.React;
    return React?.createElement('span', { hidden: true, ref: redirectMountedRoute }) ?? null;
  }

  function guardNavigation(store) {
    const original = store?.Navigate;
    if (typeof original !== 'function' || guardedNavigation.get(store)?.wrapped === original) return;
    const descriptor = Object.getOwnPropertyDescriptor(store, 'Navigate');
    function wrapped(route, ...args) {
      if (isSettingsRoute(route)) {
        redirectToPopup();
        return;
      }
      return original.call(this, route, ...args);
    }
    store.Navigate = wrapped;
    if (store.Navigate === wrapped) guardedNavigation.set(store, { wrapped, descriptor });
  }

  function installRouteGuards() {
    for (const owner of SE.owners()) {
      try {
        const entry = settingsRoutes(owner)?.get(SETTINGS_ROUTE);
        const component = entry?.component;
        if (component !== PopupOnlySettings && (typeof component === 'function' || component?.$$typeof)) {
          entry.component = PopupOnlySettings;
          if (entry.component === PopupOnlySettings) guardedRoutes.set(entry, component);
        }
      } catch (_) {}
      for (const getStore of [
        () => owner.SteamUIStore,
        () => owner.SteamUIStore?.WindowStore?.MainWindowInstance,
      ]) {
        try {
          guardNavigation(getStore());
        } catch (_) {}
      }
    }
  }

  function removeRouteGuards() {
    for (const [entry, component] of guardedRoutes) {
      try {
        if (entry.component === PopupOnlySettings) entry.component = component;
      } catch (_) {}
    }
    for (const [store, { wrapped, descriptor }] of guardedNavigation) {
      try {
        if (store.Navigate !== wrapped) continue;
        if (descriptor) Object.defineProperty(store, 'Navigate', descriptor);
        else delete store.Navigate;
      } catch (_) {}
    }
    guardedRoutes.clear();
    guardedNavigation.clear();
  }

  function findRuntime(requireManager = true) {
    let React;
    let manager;
    let modalManagers;
    for (const req of SE.requires()) {
      const inspect = (exp) => {
        const values = [exp];
        try {
          values.push(...Object.values(exp || {}));
        } catch (_) {}
        for (const value of values) {
          if (
            !React &&
            value &&
            typeof value.createElement === 'function' &&
            typeof value.cloneElement === 'function' &&
            typeof value.useState === 'function'
          ) {
            React = value;
          }
          if (!manager) {
            try {
              const registry = value?.m_mapModalManager;
              const candidate = registry?.get(window);
              if (typeof candidate?.ShowLegacyPopupModal === 'function') {
                manager = candidate;
                modalManagers = registry;
              }
            } catch (_) {}
          }
        }
      };

      for (const module of Object.values(req.c || {})) inspect(module?.exports);
      for (const [id, factory] of Object.entries(req.m || {})) {
        if (React && (manager || !requireManager)) break;
        let source;
        try {
          source = Function.prototype.toString.call(factory);
        } catch (_) {
          continue;
        }
        const possibleManager = !manager && source.includes('Stomping CModalManager');
        const possibleReact =
          !React && source.includes('createElement') && source.includes('useState') && source.includes('Fragment');
        if (possibleManager || possibleReact) {
          try {
            inspect(req(id));
          } catch (_) {}
        }
      }
      if (React && (manager || !requireManager)) break;
    }

    if (!React || (requireManager && !manager)) {
      failure = !React ? 'Steam React runtime was not found.' : 'Registered Library popup manager was not found.';
      return null;
    }

    return {
      React,
      modalManagers,
      showModal(element, owner, title, options, browser, actions) {
        let handle;
        const content = React.cloneElement(element, { closeModal: () => handle?.Close() });
        handle = manager.ShowLegacyPopupModal(
          title,
          content,
          { ...options, browserContext: browser || owner.browserInfo },
          actions
        );
        return handle;
      },
    };
  }

  function openDirect(beforeOpen, target) {
    if (popup) {
      scanPopupDocuments();
      if (!popupDocuments.size) {
        const stale = popup;
        popup = null;
        stopPopupTracking();
        try {
          stale.Close();
        } catch (_) {}
      }
    }
    if (popup) {
      beforeOpen?.();
      if (target === 'library') pendingManager = true;
      scanPopupDocuments();
      for (const doc of popupDocuments) {
        try {
          doc.defaultView?.focus();
          break;
        } catch (_) {}
      }
      return true;
    }

    window.__steamEnhancedFriendsDock?.prepareModal?.();
    const component = settingsComponent();
    const runtime = findRuntime();
    if (!component || !runtime) {
      if (!component) failure = 'Millennium settings route was not found.';
      return false;
    }

    try {
      const element = runtime.React.createElement(component);
      let result;
      const options = {
        bForcePopOut: true,
        bNeverPopOut: false,
        bHideMainWindowForPopouts: false,
        popupWidth: 1080,
        popupHeight: 800,
        strTitle: 'Millennium',
        fnOnClose: () => {
          if (popup !== result) return;
          popup = null;
          stopPopupTracking();
        },
      };
      beforeOpen?.();
      result = runtime.showModal(element, window, 'Millennium', options, undefined, { bHideActions: false });
      if (!result || typeof result.Close !== 'function') {
        failure = 'Steam returned no popup handle.';
        return false;
      }
      popup = result;
      popupModalManagers = runtime.modalManagers;
      if (typeof result.ClosedPromise?.then === 'function') {
        const clearPopup = () => {
          if (popup === result) {
            popup = null;
            stopPopupTracking();
          }
        };
        result.ClosedPromise.then(clearPopup, clearPopup);
      }
      pendingManager = target === 'library';
      scanPopupDocuments();
      popupScan = setInterval(scanPopupDocuments, 250);
      return true;
    } catch (error) {
      popup = null;
      stopPopupTracking();
      failure = error?.message || String(error);
      console.warn('[Steam Enhanced] Millennium window:', error);
      return false;
    }
  }

  installRouteGuards();
  const routeGuardPoll = SE.poll(installRouteGuards, 500);

  window.__seMillenniumWindow = {
    openDirect,
    showError,
    openLibraryManager: (target) => millBridge.openLibraryManager(target),
    destroy() {
      destroyed = true;
      routeGuardPoll.disconnect();
      removeRouteGuards();
      try {
        popup?.Close();
      } catch (_) {}
      popup = null;
      stopPopupTracking();
      errorNotice?.remove();
      errorNotice = null;
      delete window.__seMillenniumWindow;
    },
  };
});
