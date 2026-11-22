/*
 * Patching Steam's menu instances, keeping them patched, and start().
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C } = SE;
  const {
    AccountStatusMenu, SIDE_HOVER, SUBMENU_NAMES, SteamMenu, anchors, hoverDocuments,
    anyMenuOpen, applyPlacement, bindHoverButton, bindManager, configurations,
    initializeAvatarMenu, inspectPopups, instanceManager, isSteam, menuAnchor, onMainMouseMove,
    openMillenniumWindow, patchSidebarMenus, patched, placementFor, refreshPosition,
    resolveMenuApi, sidebarAnchor,
  } = ns;
  const { live } = ns;

  function buildPatchedGetter(originalGet, steam, button) {
    return function () {
      const element = originalGet.call(this);
      if (!live.api.React.isValidElement(element)) return element;
      if (!steam) {
        if (!SE.railMode() || !button?.matches(SIDE_HOVER.account)) return element;
        return live.api.React.cloneElement(element, {
          children: live.api.React.createElement(
            'div',
            { 'data-se-avatar-menu': '', style: { display: 'contents' }, ref: initializeAvatarMenu },
            live.api.React.createElement(AccountStatusMenu),
            element.props.children
          ),
        });
      }
      // Steam's own rows stay mounted (hidden by placeGroup()); the theme's menu is drawn after
      // them (client/header/menu/actions.js). Without it, Steam's menu stays as it is.
      if (typeof SteamMenu !== 'function') return element;
      return live.api.React.cloneElement(element, {
        children: live.api.React.createElement(
          live.api.React.Fragment,
          null,
          element.props.children,
          live.api.React.createElement(SteamMenu)
        ),
      });
    };
  }

  /*
   * A menu's panel in its window: Steam's contextMenuContents (hashed; SteamTracking sp.js),
   * whether the menu's element is it, inside it, or holds it.
   */
  const MENU_PANEL = `.${C.contextMenuContents}`;
  function menuPanel(instance) {
    const el = instance.m_element;
    return el?.closest?.(MENU_PANEL) || el?.querySelector?.(MENU_PANEL) || null;
  }

  /*
   * A menu Steam creates already showing (its root menu, made fresh on each click) is placed from
   * the element it was made on, before the theme's anchor is in: it opened off its button. Once
   * its window is up, it's placed again from the anchor (a few frames at most).
   */
  function settlePosition(instance, frames = 12) {
    if (!patched.has(instance) || !instance.visible) return;
    if (instance.m_element) {
      // Steam can draw a menu again in the window and panel it closed: open, not still closing
      menuPanel(instance)?.removeAttribute('data-se-closing');
      refreshPosition(instance);
      requestAnimationFrame(() => {
        if (patched.has(instance) && instance.visible) refreshPosition(instance);
      });
    } else if (frames > 0) {
      requestAnimationFrame(() => settlePosition(instance, frames - 1));
    }
  }

  /*
   * The focus is still Steam's: in the main window, or in a menu's own window (over a page each
   * menu is a popup window of its own, and holds the focus while it shows). Anywhere else is a
   * window a row opened (About Steam, System Information).
   */
  function focusInMenus(instance) {
    if (document.hasFocus()) return true;
    for (let menu = instance; menu; menu = menu.submenu) {
      if (SE.run(() => menu.m_element?.ownerDocument?.hasFocus())) return true;
    }
    for (const doc of hoverDocuments) {
      if (SE.run(() => doc.hasFocus())) return true;
    }
    return false;
  }

  /*
   * Over a Store or Community page, a click on a menu's button hands the focus back to the page's
   * browser view a moment after the menu opens (~200 ms), which blurs the menu's window: Steam
   * would cancel the menu under a still pointer. A blur this soon, with the pointer still on the
   * button, is that hand-back, not the user leaving.
   */
  const OPENING_MS = 600;

  function patchInstance(instance) {
    if (!instance || patched.has(instance)) return;
    const steam = isSteam(instance);
    const button = steam ? live.steamButton : sidebarAnchor(instance);
    if (!steam && !button) return;

    const own = Object.getOwnPropertyDescriptor(instance, 'ReactElement');
    if (own && !own.configurable) return;

    let proto = instance;
    let descriptor = own;
    while (!descriptor && (proto = Object.getPrototypeOf(proto))) {
      descriptor = Object.getOwnPropertyDescriptor(proto, 'ReactElement');
    }
    if (!descriptor?.get) return;

    const getter = buildPatchedGetter(descriptor.get, steam, button);
    Object.defineProperty(instance, 'ReactElement', { configurable: true, get: getter });

    const placement = placementFor(button);
    const savedPlacement = new Map();
    for (const [key, value] of Object.entries(placement)) {
      savedPlacement.set(key, {
        present: Object.prototype.hasOwnProperty.call(instance.options, key),
        value: instance.options[key],
      });
      instance.options[key] = value;
    }

    const position = instance.position;
    const originalAnchor = position?.element;
    const anchor = position && button ? menuAnchor(button) : null;
    if (anchor) position.element = anchor;

    // Closing plays the menus' animation first; a menu shown again meanwhile stays (shared.js)
    const closer = ns.animateClose(instance, menuPanel);

    const ownShow = Object.getOwnPropertyDescriptor(instance, 'Show');
    const originalShow = instance.Show;
    const show = function (...args) {
      const entry = patched.get(this);
      if (entry) entry.shownAt = performance.now();
      closer.cancel();
      applyPlacement(this);
      refreshPosition(this);
      const result = originalShow.apply(this, args);
      settlePosition(this);
      live.popupPoll?.refresh(); // wake the popup housekeeping now rather than on its idle beat
      return result;
    };
    instance.Show = show;

    const ownTakeFocus = Object.getOwnPropertyDescriptor(instance, 'TakeFocus');
    const originalTakeFocus = instance.TakeFocus;
    const takeFocus = function (...args) {
      applyPlacement(this);
      const result = originalTakeFocus.apply(this, args);
      refreshPosition(this);
      return result;
    };
    instance.TakeFocus = takeFocus;

    /*
     * Steam cancels a menu that loses focus (its OnBlur). Closing one of the submenus the theme
     * nests in the Steam menu can hand focus to the main window instead of back to the menu, which
     * cancelled the menu under the pointer. While the pointer is on the menu and the focus is still
     * Steam's (focusInMenus), it stays open and takes focus back; focus gone to another window (one a row
     * opened: About Steam, System Information) cancels it as Steam would, since taking focus back
     * (Steam's TakeFocus brings the menu's window to the front) pulled Steam over that window.
     * The blur comes before the new window has the focus, so the choice waits a tick. A click
     * elsewhere (pointer off the menu) still cancels it, and Escape hides it through Hide().
     */
    const ownCancel = Object.getOwnPropertyDescriptor(instance, 'OnCancel');
    const originalCancel = instance.OnCancel;
    const cancel = function (...args) {
      const entry = patched.get(this);
      if (performance.now() - (entry?.shownAt ?? -Infinity) < OPENING_MS && ns.pointerOnOwnButton(this)) {
        this.CancelHideMenuTimer?.();
        return undefined;
      }
      if (!ns.pointerOnMenu(this)) return originalCancel.apply(this, args);
      this.CancelHideMenuTimer?.();
      setTimeout(() => {
        if (!this.visible) return;
        // Unpatched meanwhile (destroy, its button gone): Steam's own cancel, as without the theme
        if (patched.has(this) && focusInMenus(this)) this.TakeFocus?.();
        else originalCancel.apply(this, args);
      }, 0);
      return undefined;
    };
    instance.OnCancel = cancel;

    patched.set(instance, {
      own,
      getter,
      placement,
      savedPlacement,
      position,
      originalAnchor,
      anchor,
      button,
      ownShow,
      show,
      ownTakeFocus,
      takeFocus,
      ownCancel,
      cancel,
      closer,
      // A menu Steam made already showing (the Steam menu) opened now: it never passes Show()
      shownAt: instance.visible ? performance.now() : -Infinity,
    });

    refreshPosition(instance);
    settlePosition(instance);
    document.body.classList.add('se-steam-menu-ready');
    const owner = instanceManager(instance) || live.manager;
    queueMicrotask(() => {
      if (patched.has(instance)) owner?.OnMenusChanged?.Dispatch?.();
    });
  }

  // Puts back what patchInstance() changed (when its button is gone, or on destroy).
  function unpatchInstance(instance, saved) {
    patched.delete(instance);
    if (Object.getOwnPropertyDescriptor(instance, 'ReactElement')?.get !== saved.getter) return;
    if (instance.TakeFocus === saved.takeFocus) {
      if (saved.ownTakeFocus) Object.defineProperty(instance, 'TakeFocus', saved.ownTakeFocus);
      else delete instance.TakeFocus;
    }
    if (instance.Show === saved.show) {
      if (saved.ownShow) Object.defineProperty(instance, 'Show', saved.ownShow);
      else delete instance.Show;
    }
    if (instance.OnCancel === saved.cancel) {
      if (saved.ownCancel) Object.defineProperty(instance, 'OnCancel', saved.ownCancel);
      else delete instance.OnCancel;
    }
    saved.closer.restore();
    if (saved.position?.element === saved.anchor) {
      saved.position.element = saved.originalAnchor;
    }
    for (const [key, original] of saved.savedPlacement) {
      if (instance.options[key] !== saved.placement[key]) continue;
      if (original.present) instance.options[key] = original.value;
      else delete instance.options[key];
    }
    if (saved.own) Object.defineProperty(instance, 'ReactElement', saved.own);
    else delete instance.ReactElement;
  }

  // Menus whose button Steam has re-rendered away: unpatched (update() patches the live ones
  // again), so neither `patched` nor the anchors grow over a session.
  function pruneDetached() {
    for (const [instance, saved] of patched) {
      if (saved.button && !saved.button.isConnected && !instance.visible) unpatchInstance(instance, saved);
    }
    for (const [button, anchor] of anchors) {
      if (button.isConnected) continue;
      anchor.remove();
      anchors.delete(button);
    }
  }

  function update() {
    pruneDetached();
    const entries = configurations();
    live.steamButton = entries.get('Steam')?.node;
    bindHoverButton();
    if (!live.steamButton || SUBMENU_NAMES.some((name) => !entries.has(name))) {
      document.body.classList.remove('se-steam-menu-ready');
      return;
    }
    if (!live.api) live.api = resolveMenuApi();
    if (!live.api) return;
    if (!live.manager && !bindManager(entries.get('Steam'))) return;
    patchInstance(entries.get('Steam')?.instance);
    for (const instance of live.manager.GetAllMenus()) patchInstance(instance);
    patchSidebarMenus();
  }

  function start() {
    document.addEventListener('mousemove', onMainMouseMove);
    document.addEventListener('click', openMillenniumWindow, true);

    // Restrict synchronous MutationObserver passes to the titlebar and navigation rail
    // so deep Library or game-page mutations do not trigger React fiber walks. Throttled: each
    // pass walks the menu buttons' fibers (~5 ms), and the startup poll covers the first mount.
    const MENU_AREA = `.${C.TopBar}, .${C.FocusNavigationRoot_TitleBarControls}, .${C.RootMenuBar}, .${C.SuperNavBar}, .se-sidebar-icons, .se-header-actions, .se-menu-icon`;
    live.observer = SE.watch(update, {
      throttle: 200,
      ignore: (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !live.steamButton?.isConnected) return false;
        return !el.contains(live.steamButton) && !el.closest(MENU_AREA);
      },
    });

    // Startup retry, polled: the Steam button can mount before its menu props exist, and their
    // arrival changes nothing the watcher sees. Up to 40 tries (10 s, paused while hidden), then
    // the watcher alone keeps it patched.
    let retries = 0;
    live.startPoll = SE.poll(() => {
      update();
      if (patched.size || ++retries >= 40) {
        live.startPoll?.disconnect();
        live.startPoll = null;
      }
    }, 250);
    update();
    // Every 200 ms while a menu is open (and once more after it closes), idle otherwise.
    // g_PopupManager's created callback only covers new windows; these menus render in-window.
    live.popupPoll = SE.poll(inspectPopups, 200, { active: () => anyMenuOpen() || !live.popupsIdle });
    inspectPopups();
  }
  Object.assign(ns, { patchInstance, start, unpatchInstance });
})(window.__se);
