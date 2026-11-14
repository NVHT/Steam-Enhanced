/* Watching menu popups and patching the sidebar's own menu managers. */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSteamMenuParts;
  if (!ns) return;
  const { C, owners } = SE;
  const {
    anyMenuOpen, bindMenuHoverDocument, contextManager, hoverDocuments, movedGroups, patched,
    placeGroup, popupObservers, retainedMenu, sideFor, sidebarManagers,
  } = ns;
  const { live } = ns;

  function inspectPopups() {
    const open = anyMenuOpen();
    if (!open && live.popupsIdle) return;
    live.popupsIdle = !open;
    ns.syncOpenState();

    for (const [instance, saved] of patched) {
      if (!sideFor(saved.button)) continue;
      const doc = instance.m_element?.ownerDocument;
      if (doc && doc !== document) bindMenuHoverDocument(doc);
    }

    const steam = [...patched.keys()].find(isSteam);
    for (let submenu = steam?.submenu; submenu; submenu = submenu.submenu) {
      const doc = submenu.m_element?.ownerDocument;
      if (doc && doc !== document) bindMenuHoverDocument(doc);
    }

    const visited = new Set();
    for (const owner of owners()) {
      const popups = owner.g_PopupManager?.m_mapPopups;
      if (!popups?.values || visited.has(popups)) continue;
      visited.add(popups);
      for (const popup of popups.values()) {
        try {
          const doc = popup.window?.document;
          if (!doc || doc.title !== 'Steam Root Menu') continue;
          bindMenuHoverDocument(doc);
          if (!popupObservers.has(doc)) {
            const obs = new MutationObserver(() => placeGroup(doc));
            obs.observe(doc.body, { subtree: true, childList: true });
            popupObservers.set(doc, obs);
          }
          placeGroup(doc);
        } catch (_) {}
      }
    }

    for (const parent of movedGroups.keys()) {
      if (!parent.isConnected) movedGroups.delete(parent);
    }
    for (const [doc, obs] of popupObservers) {
      if (doc.defaultView?.closed) {
        obs.disconnect();
        popupObservers.delete(doc);
      }
    }
    for (const doc of hoverDocuments) {
      if (!doc.defaultView || doc.defaultView.closed) hoverDocuments.delete(doc);
    }
  }

  function instanceManager(instance) {
    return instance?.Manager || instance?.m_ContextMenuManager;
  }

  function bindManager(entry) {
    let candidate = instanceManager(entry?.instance) || entry?.manager;
    if (!candidate) {
      for (const owner of owners()) {
        const existing = live.api.registry.m_mapManagers?.get(owner);
        if (existing?.GetAllMenus) {
          candidate = existing;
          break;
        }
      }
    }
    if (!candidate?.CreateContextMenuInstance || !candidate.GetAllMenus) return false;
    live.manager = candidate;
    live.originalCreate = live.manager.CreateContextMenuInstance;
    live.wrappedCreate = function (...args) {
      const instance = live.originalCreate.apply(this, args);
      ns.patchInstance(instance);
      return instance;
    };
    live.manager.CreateContextMenuInstance = live.wrappedCreate;
    return true;
  }

  function restorePopups() {
    for (const obs of popupObservers.values()) obs.disconnect();
    popupObservers.clear();
    for (const [parent, saved] of movedGroups) {
      const anchor = saved.anchor?.parentNode === parent ? saved.anchor : null;
      for (const node of saved.group) {
        if (node.parentNode === parent) parent.insertBefore(node, anchor);
      }
      if (saved.separator) saved.separator.style.display = saved.display;
    }
    movedGroups.clear();
  }

  function isSteam(instance) {
    const anchor = instance.position?.element;
    return (
      instance.options?.title === 'Steam Root Menu' ||
      (live.steamButton && (anchor === live.steamButton || (anchor && live.steamButton.contains(anchor))))
    );
  }

  function watchSidebarManager(owner) {
    if (!owner?.GetAllMenus || !owner.CreateContextMenuInstance) return;
    if (owner !== live.manager && !sidebarManagers.has(owner)) {
      const original = owner.CreateContextMenuInstance;
      const wrapped = function (...args) {
        const menu = original.apply(this, args);
        ns.patchInstance(menu);
        return menu;
      };
      owner.CreateContextMenuInstance = wrapped;
      sidebarManagers.set(owner, { original, wrapped });
    }
    for (const menu of owner.GetAllMenus()) ns.patchInstance(menu);
  }

  function patchSidebarMenus() {
    for (const owner of owners()) {
      for (const candidate of live.api.registry.m_mapManagers?.values?.() || []) {
        watchSidebarManager(candidate);
      }
      watchSidebarManager(live.api.registry.m_mapManagers?.get(owner));
    }
    for (const node of document.querySelectorAll(
      '.se-menu-icon:is([data-se-icon="store"], [data-se-icon="library"], [data-se-icon="community"], [data-se-icon="profile"])'
    )) {
      for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
        if (!fiber.memoizedProps?.bSuperNavBehavior) continue;
        const instance = retainedMenu(fiber);
        ns.patchInstance(instance);
        watchSidebarManager(instanceManager(instance) || contextManager(fiber));
        break;
      }
    }
    for (const node of document.querySelectorAll(
      `.${C.FocusNavigationRoot_TitleBarControls} :is(.${C.NotificationsButton}, .${C.AccountMenu})`
    )) {
      for (let fiber = SE.fiber(node), depth = 0; fiber && depth < 12; fiber = fiber.return, depth++) {
        const props = fiber.memoizedProps;
        if (!(props?.menuContent || props?.refPopupMenu) || typeof props?.title !== 'string') continue;
        const instance = props.refPopupMenu?.current?.Show ? props.refPopupMenu.current : retainedMenu(fiber);
        ns.patchInstance(instance);
        watchSidebarManager(instanceManager(instance) || contextManager(fiber));
        break;
      }
    }
  }
  Object.assign(ns, {
    bindManager, inspectPopups, instanceManager, isSteam, patchSidebarMenus, restorePopups,
  });
});
