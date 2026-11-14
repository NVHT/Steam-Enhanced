/*
 * Where a menu opens: anchored beside the rail or under its button.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C } = SE;
  const { isSteam, patched } = ns;

  function sidebarAnchor(instance) {
    const anchor = instance.position?.element;
    if (!anchor) return undefined;
    for (const node of document.querySelectorAll(
      `.se-menu-icon:is([data-se-icon="store"], [data-se-icon="library"], [data-se-icon="community"], [data-se-icon="profile"]), [data-se-action="add"], .${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}, .${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`
    )) {
      if (anchor === node || anchor.contains(node) || node.contains(anchor)) return node;
    }
    return undefined;
  }

  function railWidth() {
    if (!SE.railMode()) return 0;
    return Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--se-rail-width')) || 60;
  }

  function placementFor(steam) {
    return railWidth() && !steam
      ? { bOverlapHorizontal: false, bOverlapVertical: true, bPreferPopLeft: false, bPreferPopTop: false, bGrowToElementWidth: false }
      : { bOverlapHorizontal: true, bOverlapVertical: false, bPreferPopLeft: false, bPreferPopTop: false, bGrowToElementWidth: false };
  }

  // One hidden anchor per button, shared by every menu instance Steam makes for it.
  const anchors = new Map();
  function menuAnchor(button, steam) {
    let anchor = anchors.get(button);
    if (!anchor) {
      anchor = createMenuAnchor(button, steam);
      anchors.set(button, anchor);
    }
    return anchor;
  }

  function createMenuAnchor(button, steam) {
    const anchor = document.createElement('span');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden;width:0;height:0';
    anchor.getBoundingClientRect = () => {
      if (steam && railWidth()) {
        const bar = document.querySelector(`.${C.RootMenuBar}`)?.getBoundingClientRect();
        if (bar && bar.width > 0) {
          const width = 40;
          return new DOMRect(
            Math.round(bar.left + (bar.width - width) / 2),
            Math.round(bar.top),
            width,
            Math.round(bar.height)
          );
        }
      }
      const rect = button.getBoundingClientRect();
      const rail = steam ? 0 : railWidth();
      if (rail) {
        return new DOMRect(rect.left, rect.top, Math.max(rect.width, rail + 6 - rect.left), rect.height);
      }
      return new DOMRect(rect.left, rect.top, rect.width, rect.height);
    };
    document.body.appendChild(anchor);
    return anchor;
  }

  function applyPlacement(instance) {
    const saved = patched.get(instance);
    if (!saved) return;
    saved.placement = placementFor(isSteam(instance));
    Object.assign(instance.options, saved.placement);
  }

  function syncOpenState() {
    const open = new Set();
    for (const [instance, saved] of patched) {
      if (instance.visible && saved.button) open.add(saved.button);
    }
    for (const node of document.querySelectorAll('[data-se-menu-open]')) {
      if (!open.has(node)) node.removeAttribute('data-se-menu-open');
    }
    for (const node of open) {
      SE.mark(node, 'data-se-menu-open');
    }
  }

  function refreshPosition(instance) {
    const node = instance.m_element;
    for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
      const renderer = fiber.stateNode;
      if (typeof renderer?.PositionMenu !== 'function') continue;
      renderer.PositionMenu(true);
      renderer.PositionPopupWindow?.();
      return;
    }
  }
  Object.assign(ns, {
    anchors, applyPlacement, menuAnchor, placementFor, refreshPosition, sidebarAnchor,
    syncOpenState,
  });
})(window.__se);
