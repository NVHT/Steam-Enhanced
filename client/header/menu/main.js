/*
 * Steam menu (see shared.js): the menu's API (destroy()) and starting once the body exists.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const {
    anchors, avatarLayouts, cancelHoverClose, closeAfterHover, enterMenuPopup, hoverDocuments,
    leaveMenuPopup, onMainMouseMove, openMillenniumWindow, openOnHover, openSideOnHover, patched,
    restorePopups, sideButtons, sidebarManagers, start, unpatchInstance,
  } = ns;
  const { live } = ns;

  window.__seSteamMenu = {
    destroy() {
      clearInterval(live.timer);
      live.popupPoll?.disconnect();
      cancelHoverClose();
      document.removeEventListener('mousemove', onMainMouseMove);
      for (const node of sideButtons.values()) {
        node.removeEventListener('mouseenter', openSideOnHover);
        node.removeEventListener('mouseleave', closeAfterHover);
      }
      sideButtons.clear();
      live.hoverButton?.removeEventListener('mouseenter', openOnHover);
      live.hoverButton?.removeEventListener('mouseleave', closeAfterHover);
      for (const doc of hoverDocuments) {
        doc.body?.removeEventListener('mouseenter', enterMenuPopup);
        doc.body?.removeEventListener('mouseleave', leaveMenuPopup);
        doc.removeEventListener('click', openMillenniumWindow, true);
      }
      hoverDocuments.clear();
      document.removeEventListener('click', openMillenniumWindow, true);
      for (const obs of avatarLayouts.values()) obs.disconnect();
      avatarLayouts.clear();
      restorePopups();
      live.observer?.disconnect();
      removeEventListener('DOMContentLoaded', start);

      if (live.manager && live.manager.CreateContextMenuInstance === live.wrappedCreate) {
        live.manager.CreateContextMenuInstance = live.originalCreate;
      }
      for (const [owner, saved] of sidebarManagers) {
        if (owner.CreateContextMenuInstance === saved.wrapped) {
          owner.CreateContextMenuInstance = saved.original;
        }
      }
      sidebarManagers.clear();

      for (const [instance, saved] of patched) unpatchInstance(instance, saved);
      for (const anchor of anchors.values()) anchor.remove();
      anchors.clear();
      for (const node of document.querySelectorAll('[data-se-menu-open]')) {
        node.removeAttribute('data-se-menu-open');
      }
      patched.clear();
      live.manager?.OnMenusChanged?.Dispatch?.();
      document.body?.classList.remove('se-steam-menu-ready');
      delete window.__seSteamMenu;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
})(window.__se);
