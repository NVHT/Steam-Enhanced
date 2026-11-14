/*
 * Hover-to-open between root menu buttons, and the rail's side buttons.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { SIDE_HOVER, hoverDocuments, patched, sideButtons } = ns;
  const { live } = ns;

  /*
   * The menu windows (root menu and each open submenu, every one its own popup) the pointer is
   * in. Moving between them fires one's mouseleave and the other's mouseenter in no fixed order,
   * so a close decided from those events alone (or from :hover, which lags across windows) could
   * hide a menu the pointer is on. Pointer back in the main window clears it; a window that has
   * gone is dropped when checked. The close timer also binds menu windows opened since the last
   * popup check (they'd have missed their mouseenter) and asks each whether it's hovered.
   */
  const insideMenus = new Set();
  const pointerInMenu = () => {
    for (const doc of insideMenus) {
      if (!doc.defaultView || doc.defaultView.closed) insideMenus.delete(doc);
    }
    if (insideMenus.size) return true;
    // A submenu that opened since the last popup check has no listeners yet: bind it now and ask
    // every menu window directly
    ns.inspectPopups();
    for (const doc of hoverDocuments) {
      try {
        if (doc.body?.matches(':hover')) return true;
      } catch {}
    }
    return false;
  };

  // The pointer is on `instance` or one of its submenus, wherever they're drawn
  const pointerOnMenu = (instance) => isHoveringMenu(instance) || pointerInMenu();

  function cancelHoverClose() {
    clearTimeout(live.hoverCloseTimer);
    live.hoverCloseTimer = null;
  }

  function isHoveringMenu(instance) {
    if (!instance?.visible) return false;
    return Boolean(instance.m_element?.matches(':hover')) || isHoveringMenu(instance.submenu);
  }

  // A menu (or one of its open submenus) drawn in the main window that contains `node`
  function menuInMain(node) {
    for (const instance of patched.keys()) {
      for (let menu = instance; menu?.visible; menu = menu.submenu) {
        const el = menu.m_element;
        if (el?.ownerDocument === document && el.contains(node)) return true;
      }
    }
    return false;
  }

  function enterMenuPopup(event) {
    live.pointerInMain = false;
    if (event?.currentTarget) insideMenus.add(event.currentTarget.ownerDocument);
    cancelHoverClose();
  }

  function leaveMenuPopup(event) {
    if (event?.currentTarget) insideMenus.delete(event.currentTarget.ownerDocument);
    closeAfterHover(event);
  }

  function anyMenuOpen() {
    for (const instance of patched.keys()) {
      if (instance.visible) return true;
    }
    return false;
  }

  function onMainMouseMove(event) {
    live.pointerInMain = true;
    insideMenus.clear();
    live.mainPointer = { x: event.clientX, y: event.clientY };
    if (
      menuInMain(event.target) ||
      live.steamButton?.contains(event.target) ||
      [...sideButtons.values()].some((button) => button.contains(event.target))
    ) {
      cancelHoverClose();
    } else if (!live.hoverCloseTimer && anyMenuOpen()) {
      closeAfterHover();
    }
  }

  function openMillenniumWindow(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const item = target.closest('[role="menuitem"], [class*="MenuItem"], .Focusable');
    if (item?.textContent.trim() !== 'Millennium') return;

    const doc = item.ownerDocument;
    if (doc !== document && doc.title !== 'Steam Root Menu') return;
    if (doc === document && !item.closest('[role="menu"], [class*="ContextMenu"], [class*="contextmenu"]')) return;

    const opened = window.__seMillenniumWindow?.openDirect(() => {
      for (const instance of patched.keys()) {
        if (ns.isSteam(instance) && instance.visible) instance.Hide();
      }
    });
    if (!opened) window.__seMillenniumWindow?.showError?.();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function bindMenuHoverDocument(doc) {
    if (!doc?.body || hoverDocuments.has(doc)) return;
    doc.body.addEventListener('mouseenter', enterMenuPopup);
    doc.body.addEventListener('mouseleave', leaveMenuPopup);
    doc.addEventListener('click', openMillenniumWindow, true);
    hoverDocuments.add(doc);
  }

  function pointerOverButton(button) {
    if (!live.pointerInMain || !live.mainPointer || !button) return false;
    const rect = button.getBoundingClientRect();
    return (
      live.mainPointer.x >= rect.left &&
      live.mainPointer.x < rect.right &&
      live.mainPointer.y >= rect.top &&
      live.mainPointer.y < rect.bottom
    );
  }

  function closeAfterHover(event) {
    if (event?.currentTarget === live.hoverButton || [...sideButtons.values()].includes(event?.currentTarget)) {
      live.mainPointer = { x: event.clientX, y: event.clientY };
    }
    cancelHoverClose();
    live.hoverCloseTimer = setTimeout(() => {
      live.hoverCloseTimer = null;
      for (const [instance, saved] of patched) {
        const button = ns.isSteam(instance) ? live.steamButton : sideFor(saved.button);
        // Over any part of the menu, wherever it's drawn, keeps it open: the window that last saw
        // the pointer move can be the main one while the pointer is on a submenu
        if (button && instance.visible && !pointerOverButton(button) && !isHoveringMenu(instance) && !pointerInMenu()) {
          instance.Hide();
        }
      }
    }, 200);
  }

  function openOnHover(event) {
    live.pointerInMain = true;
    live.mainPointer = { x: event.clientX, y: event.clientY };
    cancelHoverClose();
    const instance = [...patched.keys()].find(ns.isSteam);
    if (!instance?.visible) live.steamButton?.click();
  }

  function sideFor(button) {
    if (!button) return null;
    for (const side of sideButtons.values()) {
      if (side === button || side.contains(button) || button.contains(side)) return side;
    }
    return null;
  }

  function openSideOnHover(event) {
    live.pointerInMain = true;
    live.mainPointer = { x: event.clientX, y: event.clientY };
    cancelHoverClose();
    const button = event.currentTarget;
    if (button === sideButtons.get('bell') && window.__seHeaderTooltips?.hasNotifications() === false) {
      return;
    }
    const open = [...patched].some(([instance, saved]) => instance.visible && sideFor(saved.button) === button);
    if (!open) button.click();
  }

  function bindHoverButton() {
    for (const [key, sel] of Object.entries(SIDE_HOVER)) {
      const node = document.querySelector(sel);
      const old = sideButtons.get(key);
      if (node === old) continue;
      old?.removeEventListener('mouseenter', openSideOnHover);
      old?.removeEventListener('mouseleave', closeAfterHover);
      if (node) {
        node.addEventListener('mouseenter', openSideOnHover);
        node.addEventListener('mouseleave', closeAfterHover);
        sideButtons.set(key, node);
      } else {
        sideButtons.delete(key);
      }
    }
    if (live.hoverButton === live.steamButton) return;
    live.hoverButton?.removeEventListener('mouseenter', openOnHover);
    live.hoverButton?.removeEventListener('mouseleave', closeAfterHover);
    live.hoverButton = live.steamButton;
    live.hoverButton?.addEventListener('mouseenter', openOnHover);
    live.hoverButton?.addEventListener('mouseleave', closeAfterHover);
  }
  Object.assign(ns, {
    anyMenuOpen, bindHoverButton, pointerOnMenu, bindMenuHoverDocument, cancelHoverClose,
    closeAfterHover, enterMenuPopup, leaveMenuPopup, onMainMouseMove, openMillenniumWindow,
    openOnHover, openSideOnHover, sideFor,
  });
})(window.__se);
