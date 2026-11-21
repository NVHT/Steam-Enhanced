/*
 * Where a menu opens: under its title-bar button, or beside its rail button (the bell, the avatar).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C } = SE;
  const { patched } = ns;

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

  // The bell and the avatar sit at the rail's foot (client/navigation/nav-rail.css); the Steam
  // button in the title bar.
  const BELL = `.${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}`;
  const RAIL = `${BELL}, .${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`;
  const inRail = (button) => Boolean(button?.matches?.(RAIL));
  // The space between a button and the menu it opens
  const menuGap = () => SE.px('--se-space-3');

  // A rail button's menu opens beside the rail, growing up from the button (the bell and the
  // avatar sit at the rail's foot), as the theme's rail menus do (SE.layer.besideRail); a
  // title-bar button's drops under it.
  function placementFor(button) {
    return inRail(button)
      ? { bOverlapHorizontal: false, bOverlapVertical: true, bPreferPopLeft: false, bPreferPopTop: true, bGrowToElementWidth: false }
      : { bOverlapHorizontal: true, bOverlapVertical: false, bPreferPopLeft: false, bPreferPopTop: false, bGrowToElementWidth: false };
  }

  /*
   * The Steam menu's room on its left (its panel's left margin, steam-menu.css): the full room
   * for its shadow (--se-pop-room-side), less only when the button is nearer the screen's left
   * edge than that: the window would start off the screen and Steam pulls it back in, off the
   * button. Never under --se-space-2.
   */
  function leftRoom(button) {
    const fromEdge = window.screenX + button.getBoundingClientRect().left - (screen.availLeft || 0);
    return Math.max(SE.px('--se-space-2'), Math.min(SE.px('--se-pop-room-side'), Math.floor(fromEdge)));
  }

  // One hidden anchor per button, shared by every menu instance Steam makes for it.
  const anchors = new Map();
  function menuAnchor(button) {
    let anchor = anchors.get(button);
    if (!anchor) {
      anchor = createMenuAnchor(button);
      anchors.set(button, anchor);
    }
    return anchor;
  }

  function createMenuAnchor(button) {
    const anchor = document.createElement('span');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden;width:0;height:0';
    anchor.getBoundingClientRect = () => {
      const rect = button.getBoundingClientRect();
      // The bell's, the avatar's and the Steam menu's panels sit inside a margin for their
      // shadows (--se-pop-room-*: client/header/notifications.css, account-menu.css,
      // steam-menu.css): the anchor takes it back, so the panel itself lines up with the button.
      const x = SE.px('--se-pop-room-side');
      const y = SE.px('--se-pop-room-top');
      // Under a title-bar button (the Steam button): 12px below it, its left edge on the
      // button's, its left room as wide as the screen's edge allows (leftRoom).
      if (!inRail(button)) {
        const left = leftRoom(button);
        return new DOMRect(rect.left - left, rect.top, rect.width, rect.height + menuGap() - y);
      }
      // Beside a rail button: 12px off its side, the anchor ending where the panel's margin
      // begins, and spanning the panel's top and bottom margins, so the panel's bottom meets
      // the button's (or, flipped down for room, its top meets the button's).
      return new DOMRect(rect.left, rect.top - y, rect.width + menuGap() - x, rect.height + y + SE.px('--se-pop-room-bottom'));
    };
    document.body.appendChild(anchor);
    return anchor;
  }

  function applyPlacement(instance) {
    const saved = patched.get(instance);
    if (!saved) return;
    saved.placement = placementFor(saved.button);
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

  // The Steam menu's window learns its left room (--se-pop-room-left), and whether the screen's edge narrowed it
  function syncLeftRoom(instance) {
    const button = patched.get(instance)?.button;
    const html = instance.m_element?.ownerDocument?.documentElement;
    if (!button || inRail(button) || !html || html.ownerDocument === document) return;
    const room = leftRoom(button);
    SE.cssVar(html, '--se-pop-room-left', `${room}px`);
    SE.attr(html, 'data-se-room-narrow', room < SE.px('--se-pop-room-side') ? '' : null);
  }

  function refreshPosition(instance) {
    const node = instance.m_element;
    syncLeftRoom(instance);
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
