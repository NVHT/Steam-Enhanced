/*
 * Patching Steam's menu instances, keeping them patched, and start().
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C } = SE;
  const {
    AccountStatusMenu, AdditionalMenus, SIDE_HOVER, SUBMENU_NAMES, SteamClientActions, anchors,
    anyMenuOpen, applyPlacement, bindHoverButton, bindManager, configurations, groupSeparator,
    initializeAvatarMenu, inspectPopups, instanceManager, isSteam, menuAnchor, onMainMouseMove,
    openMillenniumWindow, patchSidebarMenus, patched, placementFor, refreshPosition,
    resolveMenuApi, sidebarAnchor,
  } = ns;
  const { live } = ns;

  function buildPatchedGetter(originalGet, steam, button) {
    let nativeWindow;
    try {
      nativeWindow = originalGet.constructor('return globalThis')();
    } catch {}

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
      return live.api.React.cloneElement(element, {
        children: live.api.React.createElement(
          live.api.React.Fragment,
          null,
          element.props.children,
          groupSeparator('start'),
          live.api.React.createElement(AdditionalMenus),
          groupSeparator('end'),
          live.api.React.createElement(SteamClientActions, { instance: this, nativeWindow })
        ),
      });
    };
  }

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

    const placement = placementFor(steam);
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
    const anchor = position && button ? menuAnchor(button, steam) : null;
    if (anchor) position.element = anchor;

    const ownShow = Object.getOwnPropertyDescriptor(instance, 'Show');
    const originalShow = instance.Show;
    const show = function (...args) {
      applyPlacement(this);
      refreshPosition(this);
      const result = originalShow.apply(this, args);
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
     * cancelled the menu under the pointer. While the pointer is on the menu, it stays open and
     * takes focus back; a click elsewhere (pointer off the menu) still cancels it, and Escape hides
     * it through Hide(), not this.
     */
    const ownCancel = Object.getOwnPropertyDescriptor(instance, 'OnCancel');
    const originalCancel = instance.OnCancel;
    const cancel = function (...args) {
      if (ns.pointerOnMenu(this)) {
        this.CancelHideMenuTimer?.();
        this.TakeFocus?.();
        return undefined;
      }
      return originalCancel.apply(this, args);
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
    });

    refreshPosition(instance);
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
    // so deep Library or game-page mutations do not trigger React fiber walks.
    const MENU_AREA = `.${C.TopBar}, .${C.FocusNavigationRoot_TitleBarControls}, .${C.RootMenuBar}, .${C.SuperNavBar}, .se-sidebar-icons, .se-header-actions, .se-menu-icon`;
    live.observer = SE.watch(update, {
      ignore: (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !live.steamButton?.isConnected) return false;
        return !el.contains(live.steamButton) && !el.closest(MENU_AREA);
      },
    });

    let retries = 0;
    live.timer = setInterval(() => {
      update();
      if (patched.size || ++retries >= 40) {
        clearInterval(live.timer);
        live.timer = null;
      }
    }, 250);
    update();
    // Every 200 ms while a menu is open (and once more after it closes), idle otherwise.
    live.popupPoll = SE.poll(inspectPopups, 200, { active: () => anyMenuOpen() || !live.popupsIdle });
    inspectPopups();
  }
  Object.assign(ns, { patchInstance, start, unpatchInstance });
})(window.__se);
