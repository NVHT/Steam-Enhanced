/*
 * Where Millennium Settings opens, as Theme settings › Millennium › Settings open in says
 * (`millennium-open`):
 * - window (the default): Millennium's registered settings route mounted in a detached Steam
 *   legacy popup modal, never the main Library viewport;
 * - overlay: the same route in a Steam dialog over the client (Steam's ModalPosition frame
 *   through its showModal, never popped out), in a box of the theme's with a close button;
 * - page: Millennium's own way, the route in the main window.
 * The route guard (PopupOnlySettings) stays in every mode and lets the route through on Page,
 * so switching never has to unwrap what plugins wrapped around it. Also exposes an FFI /
 * Library Manager bridge (`__seMillBridge`) to the popup window.
 */
((SE) => {
  const { C } = SE;
  const SETTINGS_ROUTE = '/millennium/settings';
  const isSettingsRoute = (route) =>
    /^\/millennium\/settings(?:[/?#]|$)/.test(typeof route === 'string' ? route : route?.pathname || '');
  window.__seMillenniumWindow?.destroy();

  let popup;
  // How the open one was opened: 'window' or 'overlay'
  let popupMode = null;
  const mode = () => {
    const how = SE.settings?.get?.('millennium-open');
    return how === 'overlay' || how === 'page' ? how : 'window';
  };
  let failure = '';
  let errorNotice = null;

  const popupDocuments = new Set();
  const managerEmbeds = new Map();
  const dialogHosts = new Map();
  let popupModalManagers = null;
  // Route entry -> Millennium's own settings component, kept while the guard stands in for it
  const guardedRoutes = new Map();
  // The last one guarded: a guard still inside a plugin's wrapper after destroy() renders it
  let lastReal = null;
  // The prop the popup hands the guard Millennium's component through (see PopupOnlySettings)
  const REAL = '__seRealSettings';
  const guardedNavigation = new Map();
  let redirectPending = false;
  let leaveRoute = false;
  let destroyed = false;

  function showError() {
    errorNotice?.remove();
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;top:70px;right:24px;z-index:var(--se-z-max);max-width:480px;padding:var(--se-space-4);' +
      'border-radius:var(--se-radius-ml);background:var(--se-surface);box-shadow:var(--se-shadow-pop);' +
      'color:var(--se-text);font:var(--se-fs-md)/1.5 var(--se-font)';
    const text = document.createElement('div');
    text.textContent = `Millennium popup: ${failure || 'Popup runtime unavailable.'}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'DialogButton'; // Steam's button, as the theme restyles it
    close.textContent = 'Dismiss';
    close.style.marginTop = 'var(--se-space-3)';
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
      } catch {}
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

    /*
     * Steam's paged settings dialog keys its pages by `identifier`. Steam's route sidebar (what
     * Millennium's SidebarNavigation was up to 3.6) gives each page its route as identifier and
     * switches by replacing the router's location, which here would move the main window: so its
     * click is taken over below. Millennium 3.7's SDK hands its pages to the dialog directly,
     * with no identifier: given a route as `page` it matches none and shows the first page, while
     * its own click switches in place, never touching the main window. So the click is left
     * alone when the dialog's pages carry no identifier.
     */
    let keyed = null;
    let selection = null;
    for (let fiber = SE.fiber(item), depth = 0; fiber && depth < 40; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (keyed === null && Array.isArray(props?.pages)) {
        keyed = props.pages.some((page) => page && typeof page === 'object' && page.identifier);
        if (!keyed) return;
      }
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
    } catch {}
    try {
      doc.removeEventListener('click', onPopupTabClick, true);
    } catch {}
  }

  // Walking the fibers for every realm is costly and ffi()/core() ask on each call, so the list
  // is kept for 2 s unless one of its windows has closed.
  let windowCache = null;

  const millBridge = {
    windows() {
      const now = performance.now();
      if (windowCache && now < windowCache.until && windowCache.list.every((w) => !SE.run(() => w.closed))) {
        return windowCache.list;
      }
      const out = [window, ...SE.owners()];
      const root = document.querySelector('#root, [data-reactroot]') || document.body.firstElementChild;
      for (let f = SE.fiber(root), n = 0; f && n < 4000; f = f.return, n++) {
        try {
          if ((f.tag === 3 || f.tag === 4) && f.stateNode?.containerInfo) {
            const w = f.stateNode.containerInfo.ownerDocument?.defaultView;
            if (w && !out.includes(w)) out.push(w);
          }
        } catch {}
      }
      for (let i = 0; i < out.length && out.length < 16; i++) {
        for (const k of ['opener', 'parent', 'top']) {
          try {
            const n = out[i][k];
            if (n && !out.includes(n)) out.push(n);
          } catch {}
        }
      }
      windowCache = { list: out, until: now + 2000 };
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
        } catch {}
      }
      return Promise.reject(new Error('Millennium is not reachable'));
    },
    openLibraryManager(target) {
      yieldToManager();
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
        } catch {}
      }
      raiseMain();
      return true;
    },
    core() {
      for (const o of millBridge.windows()) {
        try {
          const c = o.PLUGIN_LIST?.core;
          if (c) return c;
        } catch {}
      }
      return null;
    },
  };

  // The popup is a modal owned by the main window, so it always sits above it: the Library
  // Manager (in the main window) can only be seen once the popup is closed.
  function yieldToManager() {
    if (!closePopup()) return false;
    raiseMain();
    return true;
  }

  // Closes the window or overlay that's open; false when none was
  function closePopup() {
    if (!popup) return false;
    const open = popup;
    popup = null;
    popupMode = null;
    stopPopupTracking();
    stopOverlay();
    try {
      open.Close();
    } catch {}
    return true;
  }

  function raiseMain() {
    try {
      window.focus();
    } catch {}
    try {
      SE.mainWindow()?.BringToFront?.();
    } catch {}
    try {
      window.SteamClient?.Window?.BringToFront?.();
    } catch {}
  }

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
      } catch {}
    }
  }

  function removeDialogHosts() {
    for (const [api, { wrapped, descriptor }] of dialogHosts) {
      try {
        if (api.showModal !== wrapped) continue;
        if (descriptor) Object.defineProperty(api, 'showModal', descriptor);
        else delete api.showModal;
      } catch {}
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
          } catch {}
          if (popupDocuments.has(doc)) continue;
          popupDocuments.add(doc);
          try {
            installManagerTab(doc);
          } catch (error) {
            console.warn('[Steam Enhanced] Library Manager tab:', error);
          }
          doc.addEventListener('click', onPopupTabClick, true);
        }
      } catch {}
    }
    if (popupDocuments.size) {
      if (!dialogHosts.size) installDialogHosts();
      releasePopupNavigation();
    }
  }

  /*
   * Popup windows: Steam's popup manager announces each one it creates, so the theme watches
   * that window's own document (one observer per window) until the Millennium page mounts in it,
   * then lets go. No timer: this works while the main window is hidden in the tray.
   */
  const popupWatchers = new Map();
  let popupHooks = [];

  function unwatchPopupWindow(doc) {
    const watcher = popupWatchers.get(doc);
    if (!watcher) return;
    watcher.observer.disconnect();
    clearTimeout(watcher.giveUp);
    popupWatchers.delete(doc);
  }

  function watchPopupWindow(win) {
    const doc = SE.run(() => win?.document);
    if (!doc || doc === document || popupWatchers.has(doc) || popupDocuments.has(doc)) return;
    let queued = false;
    const observer = new win.MutationObserver(() => {
      if (queued) return;
      queued = true;
      win.setTimeout(() => {
        queued = false;
        scanPopupDocuments();
        if (popupDocuments.has(doc) || win.closed) unwatchPopupWindow(doc);
      }, 50);
    });
    observer.observe(doc.documentElement || doc, { childList: true, subtree: true });
    // A popup that isn't Millennium's (chat, a dialog) is let go once it has had time to mount
    const giveUp = setTimeout(() => unwatchPopupWindow(doc), 10000);
    popupWatchers.set(doc, { observer, giveUp });
  }

  function startPopupTracking() {
    stopPopupHooks();
    for (const owner of SE.owners()) {
      const manager = SE.run(() => owner.g_PopupManager);
      if (!manager) continue;
      const created = SE.run(() => manager.AddPopupCreatedCallback((entry) => watchPopupWindow(entry?.window)));
      const destroyed = SE.run(() => manager.AddPopupDestroyedCallback(() => scanPopupDocuments()));
      popupHooks.push(created, destroyed);
      for (const entry of SE.run(() => [...manager.m_mapPopups.values()]) || []) watchPopupWindow(entry.window);
    }
  }

  function stopPopupHooks() {
    for (const hook of popupHooks) SE.run(() => hook?.Unregister?.());
    popupHooks = [];
    for (const doc of [...popupWatchers.keys()]) unwatchPopupWindow(doc);
  }

  function stopPopupTracking() {
    stopPopupHooks();
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
              } catch {
                return null;
              }
            })
            .find(Boolean);
        if (store) {
          store.start_page = original;
          storage.removeItem('millennium-original-start-page');
        }
      } catch {}
    }
  }

  function settingsRoutes(owner) {
    const state = owner.__ROUTER_HOOK_INSTANCE?.routerState;
    return state?._routes?.has?.(SETTINGS_ROUTE) ? state._routes : state?.publicState?.().routes;
  }

  const isComponent = (value) => typeof value === 'function' || Boolean(value?.$$typeof);

  // What the popup renders: the route's component as it stands (the guard, or a plugin's wrapper
  // around it) and Millennium's own under the guard
  function settingsRoute() {
    for (const owner of SE.owners()) {
      try {
        const entry = settingsRoutes(owner)?.get(SETTINGS_ROUTE);
        if (!isComponent(entry?.component)) continue;
        return { component: entry.component, real: guardedRoutes.get(entry) || null };
      } catch {}
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

  /*
   * The settings route's component while the guard stands: in the main window a hidden span that
   * sends the route to the popup. A plugin may wrap it (Brew Hub calls it as a function and adds
   * its page to the tree it returns), so in the popup it renders Millennium's own component the
   * same way, handed down through the REAL prop: the wrapper then sees Millennium's pages.
   */
  function PopupOnlySettings(props) {
    const React = findRuntime(false)?.React;
    // Page: Millennium's own, in the main window. Switching to it or away while the route is
    // up would change this render's hooks, so a change of mode leaves the route first (onMode)
    const real = props?.[REAL] || (destroyed || mode() === 'page' ? lastReal : null);
    if (real && React) {
      const rest = { ...props };
      delete rest[REAL];
      const plain = typeof real === 'function' && !real.prototype?.isReactComponent;
      return plain ? real(rest) : React.createElement(real, rest);
    }
    return React?.createElement('span', { hidden: true, ref: redirectMountedRoute }) ?? null;
  }

  function guardNavigation(store) {
    const original = store?.Navigate;
    if (typeof original !== 'function' || guardedNavigation.get(store)?.wrapped === original) return;
    const descriptor = Object.getOwnPropertyDescriptor(store, 'Navigate');
    function wrapped(route, ...args) {
      if (isSettingsRoute(route) && mode() !== 'page') {
        redirectToPopup();
        return;
      }
      return original.call(this, route, ...args);
    }
    store.Navigate = wrapped;
    if (store.Navigate === wrapped) guardedNavigation.set(store, { wrapped, descriptor });
  }

  /*
   * An entry needs the guard when it's new (Millennium registering its route again makes a new
   * entry) or when Millennium's own component is back on it (a plugin's teardown). A guarded
   * entry whose component changed to anything else is a plugin wrapping the guard (Brew Hub 1.2
   * re-checks every 1.5 s and force-renders the main window each time it wraps): left as it is,
   * or the two would replace each other forever.
   */
  function needsGuard(entry) {
    const component = entry.component;
    if (component === PopupOnlySettings || !isComponent(component)) return false;
    return !guardedRoutes.has(entry) || component === guardedRoutes.get(entry);
  }

  function installRouteGuards() {
    for (const owner of SE.owners()) {
      try {
        const entry = settingsRoutes(owner)?.get(SETTINGS_ROUTE);
        if (entry && needsGuard(entry)) {
          const component = entry.component;
          entry.component = PopupOnlySettings;
          if (entry.component === PopupOnlySettings) {
            guardedRoutes.set(entry, component);
            lastReal = component;
          }
        }
      } catch {}
      for (const getStore of [
        () => owner.SteamUIStore,
        () => owner.SteamUIStore?.WindowStore?.MainWindowInstance,
      ]) {
        try {
          guardNavigation(getStore());
        } catch {}
      }
    }
  }

  function removeRouteGuards() {
    for (const [entry, component] of guardedRoutes) {
      try {
        if (entry.component === PopupOnlySettings) entry.component = component;
      } catch {}
    }
    for (const [store, { wrapped, descriptor }] of guardedNavigation) {
      try {
        if (store.Navigate !== wrapped) continue;
        if (descriptor) Object.defineProperty(store, 'Navigate', descriptor);
        else delete store.Navigate;
      } catch {}
    }
    guardedRoutes.clear();
    guardedNavigation.clear();
  }

  const isReact = (value) =>
    Boolean(value) &&
    typeof value.createElement === 'function' &&
    typeof value.cloneElement === 'function' &&
    typeof value.useState === 'function';

  // The registry of modal managers that has one for this window able to open legacy popups.
  const managerRegistry = (value) => {
    try {
      const registry = value?.m_mapModalManager;
      return typeof registry?.get(window)?.ShowLegacyPopupModal === 'function' ? registry : null;
    } catch {
      return null;
    }
  };

  // A module's export, or the first of its named exports, that passes `test`.
  const fromExports = (exp, test) => {
    if (!exp) return null;
    const hit = SE.run(() => test(exp));
    if (hit) return hit === true ? exp : hit;
    for (const value of SE.run(() => Object.values(exp)) || []) {
      const found = SE.run(() => test(value));
      if (found) return found === true ? value : found;
    }
    return null;
  };

  // Loaded modules first (cheap), then a one-time source scan cached by core's findModule.
  const fromModules = (key, needle, test) => {
    for (const req of SE.requires()) {
      for (const module of Object.values(req.c || {})) {
        const hit = fromExports(module?.exports, test);
        if (hit) return hit;
      }
    }
    return SE.findModule(key, (src, id, req) => needle(src) && fromExports(req(id), test));
  };

  // Found once per window: React and the modal managers never change after the client loads.
  let runtimeParts = null;

  function findRuntime(requireManager = true) {
    let React = runtimeParts?.React || SE.global('SP_REACT', isReact);
    React ||= fromModules(
      'se-mill-react',
      (src) => src.includes('createElement') && src.includes('useState') && src.includes('Fragment'),
      isReact
    );
    let modalManagers = runtimeParts?.modalManagers;
    if (React && requireManager && !modalManagers) {
      modalManagers = fromModules('se-mill-modal', (src) => src.includes('Stomping CModalManager'), managerRegistry);
    }
    if (React) runtimeParts = { React, modalManagers };
    const manager = modalManagers?.get(window);

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

  /*
   * Overlay: the main window's own document holds the dialog, so the parts the popup windows
   * get (scanPopupDocuments) are set up here: the Library Manager's sidebar label, page clicks
   * kept from moving the main window, and Millennium's start-page flags taken back.
   */
  let overlayView = null;

  function startOverlay() {
    if (overlayView) return;
    document.addEventListener('click', onPopupTabClick, true);
    const roots = document.getElementsByClassName('se-mill-overlay-box');
    const views = SE.mount(
      'Millennium overlay',
      () => [...roots].filter((box) => box.querySelector('.MillenniumSettings')),
      () => {
        installManagerTab(document);
        if (!managerEmbeds.has(document)) return null;
        releasePopupNavigation();
        return {
          destroy() {
            const dispose = managerEmbeds.get(document);
            managerEmbeds.delete(document);
            SE.run(() => dispose?.());
          },
        };
      }
    );
    overlayView = {
      destroy() {
        views.destroy();
        document.removeEventListener('click', onPopupTabClick, true);
      },
    };
  }

  function stopOverlay() {
    overlayView?.destroy();
    overlayView = null;
  }

  /*
   * Steam's ModalPosition: the frame of every in-window dialog (the dim behind it, Esc and a
   * click outside through onEscKeypress). Millennium exports it, but finds it by a search that
   * can miss on a newer Steam (its ModalRoot already does), so Steam's modules are the fallback:
   * the module that draws ModalPosition_Content, its component reading the frame from context.
   */
  function modalFrame() {
    const exported = window.MILLENNIUM_API?.ModalPosition;
    if (isComponent(exported)) return exported;
    return fromModules(
      'se-mill-modal-position',
      (src) => src.includes('ModalPosition_Content') && src.includes('onEscKeypress'),
      (value) => typeof value === 'function' && String(value).includes('.ModalPosition')
    );
  }

  // Opens a dialog in this window: Millennium's showModal (Steam's, never popped out), else the
  // window's own modal manager, as Steam's showModal does for an in-window dialog
  function showInWindow(element, onClosed) {
    const show = window.MILLENNIUM_API?.showModal;
    if (typeof show === 'function') return show(element, window, { bNeverPopOut: true, fnOnClose: onClosed });
    const manager = findRuntime()?.modalManagers?.get(window);
    if (typeof manager?.ShowModal !== 'function') throw new Error('No modal manager in the main window.');
    const handle = manager.ShowModal(element);
    handle?.ClosedPromise?.then?.(onClosed, onClosed);
    return handle;
  }

  function openOverlay(route, beforeOpen) {
    const React = findRuntime(false)?.React;
    const Frame = React && modalFrame();
    if (!Frame) {
      failure = React ? "Steam's dialog frame (ModalPosition) was not found." : 'Steam React runtime was not found.';
      return false;
    }
    let handle = null;
    const record = {
      Close() {
        if (handle) SE.run(() => handle.Close());
        else record.closed = true;
      },
    };
    const onClosed = () => {
      if (popup !== record) return;
      popup = null;
      popupMode = null;
      stopOverlay();
    };
    const body = React.createElement(route.component, route.real ? { [REAL]: route.real } : null);
    const close = React.createElement('button', {
      type: 'button',
      className: 'se-mill-overlay-close',
      'aria-label': 'Close',
      title: 'Close',
      onClick: () => record.Close(),
    });
    // Steam's own close icon hidden: the box draws the theme's
    const element = React.createElement(
      Frame,
      { className: 'se-mill-overlay', onEscKeypress: () => record.Close(), bHideCloseIcon: true },
      React.createElement('div', { className: 'se-mill-overlay-box' }, body, close)
    );
    try {
      beforeOpen?.();
      popup = record;
      popupMode = 'overlay';
      startOverlay();
      // Steam's showModal is async: the handle comes once the dialog is placed
      Promise.resolve(showInWindow(element, onClosed)).then(
        (result) => {
          handle = result;
          if (record.closed || popup !== record) SE.run(() => result?.Close());
        },
        (error) => {
          console.warn('[Steam Enhanced] Millennium overlay:', error);
          onClosed();
        }
      );
      return true;
    } catch (error) {
      onClosed();
      failure = error?.message || String(error);
      console.warn('[Steam Enhanced] Millennium overlay:', error);
      return false;
    }
  }

  function openDirect(beforeOpen) {
    const how = mode();
    if (popup && popupMode !== how) closePopup();
    if (how === 'page') {
      beforeOpen?.();
      return SE.navigate(SETTINGS_ROUTE);
    }
    if (how === 'overlay') {
      if (popup) {
        beforeOpen?.();
        return true;
      }
      window.__seFriendsDock?.prepareModal?.();
      const route = settingsRoute();
      if (!route) {
        failure = 'Millennium settings route was not found.';
        return false;
      }
      return openOverlay(route, beforeOpen);
    }

    if (popup) {
      scanPopupDocuments();
      if (!popupDocuments.size) {
        const stale = popup;
        popup = null;
        popupMode = null;
        stopPopupTracking();
        try {
          stale.Close();
        } catch {}
      }
    }
    if (popup) {
      beforeOpen?.();
      scanPopupDocuments();
      for (const doc of popupDocuments) {
        try {
          doc.defaultView?.focus();
          break;
        } catch {}
      }
      return true;
    }

    window.__seFriendsDock?.prepareModal?.();
    const route = settingsRoute();
    const runtime = findRuntime();
    if (!route || !runtime) {
      if (!route) failure = 'Millennium settings route was not found.';
      return false;
    }

    try {
      const element = runtime.React.createElement(route.component, route.real ? { [REAL]: route.real } : null);
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
          popupMode = null;
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
      popupMode = 'window';
      popupModalManagers = runtime.modalManagers;
      if (typeof result.ClosedPromise?.then === 'function') {
        const clearPopup = () => {
          if (popup === result) {
            popup = null;
            popupMode = null;
            stopPopupTracking();
          }
        };
        result.ClosedPromise.then(clearPopup, clearPopup);
      }
      scanPopupDocuments();
      startPopupTracking();
      return true;
    } catch (error) {
      popup = null;
      popupMode = null;
      stopPopupTracking();
      failure = error?.message || String(error);
      console.warn('[Steam Enhanced] Millennium window:', error);
      return false;
    }
  }

  // Re-installs the guards only when one is missing or was replaced (Millennium re-registering
  // its route, the main window instance appearing); otherwise the check runs every 5 s.
  function guardsNeeded() {
    if (!guardedRoutes.size || !guardedNavigation.size) return true;
    const main = SE.mainWindow();
    if (main && typeof main.Navigate === 'function' && !guardedNavigation.has(main)) return true;
    // A re-registered route is a new entry object the guard has never seen; a plugin's wrapper
    // over the guard needs nothing (needsGuard)
    for (const entry of guardedRoutes.keys()) if (needsGuard(entry)) return true;
    for (const owner of SE.owners()) {
      const entry = SE.run(() => settingsRoutes(owner)?.get(SETTINGS_ROUTE));
      if (entry && needsGuard(entry)) return true;
    }
    for (const [store, { wrapped }] of guardedNavigation) if (store.Navigate !== wrapped) return true;
    return false;
  }

  installRouteGuards();
  // Steam re-registers routes and Navigate without an event; 500 ms only while a guard is
  // missing (guardsNeeded), otherwise one check every 5 s.
  const routeGuardPoll = SE.poll(installRouteGuards, 500, { active: guardsNeeded, idle: 5000 });

  /*
   * A new place for Millennium Settings: what's open elsewhere closes, and the page in the main
   * window is left (to the Library's Home) when Page is no longer chosen. Never left up across a
   * change: the guard would render it another way and React would see other hooks.
   */
  let lastMode = mode();
  function onMode() {
    const how = mode();
    if (how === lastMode) return;
    lastMode = how;
    if (popup && popupMode !== how) closePopup();
    if (document.querySelector('.MillenniumSettings:not(.se-mill-overlay-box *)')) SE.navigate('/library/home');
  }
  const offMode = SE.settings?.on?.(onMode);

  window.__seMillenniumWindow = {
    openDirect,
    // Steam's React and popup modal, for the theme's own popup windows (client/settings/theme/)
    popupRuntime: () => findRuntime(),
    showError,
    openLibraryManager: (target) => millBridge.openLibraryManager(target),
    yieldToManager,
    windows: () => millBridge.windows(),
    destroy() {
      destroyed = true;
      routeGuardPoll.disconnect();
      offMode?.();
      removeRouteGuards();
      closePopup();
      stopPopupTracking();
      stopOverlay();
      errorNotice?.remove();
      errorNotice = null;
      delete window.__seMillenniumWindow;
    },
  };
})(window.__se);
