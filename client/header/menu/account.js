/*
 * The account menu: online status, Do Not Disturb, profile rename, the avatar section.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C, owners } = SE;
  const {
    SIDE_HOVER, avatarLayouts, configurations, contextManager, exportNames, isLabel,
    normalizeMenuLabel, patched, sidebarManagers,
  } = ns;
  const { live } = ns;

  function trimAccountStatus(root) {
    if (!root) return;
    const itemClass = live.api.menuStyles.MenuItem.split(' ')[0];
    const separatorClass = live.api.menuStyles.Separator?.split(' ')[0];
    const mode = root.getAttribute('data-se-account-status');
    const choicesOnly = mode === 'choices';
    let hasStatus = false;

    for (const item of root.querySelectorAll(`.${itemClass}, hr`)) {
      const label = normalizeMenuLabel(item.textContent);
      const stateChoice = isLabel('state', label, /^(?:Online|Away|Invisible|Offline)$/i);
      const unwanted = isLabel('unwanted', label.replace(/\s*\(\d+\)$/, ''), /^(?:View Friends List(?:\s*\(|$)|Add a Friend(?:\.\.\.|$))/i);
      const separator = item.tagName === 'HR' || (separatorClass && item.classList.contains(separatorClass));
      const editName = isLabel('editName', label, /^Edit Profile Name(?:\s*\/\s*Avatar)?(?:\.\.\.)?$/i);
      const excluded = mode === 'edit' ? !editName : choicesOnly ? !stateChoice : stateChoice || editName;

      if (unwanted || excluded || (separator && !hasStatus)) {
        if (item.style.getPropertyValue('display') !== 'none' || item.style.getPropertyPriority('display') !== 'important') {
          item.style.setProperty('display', 'none', 'important');
        }
      } else if (!separator && label) {
        hasStatus = true;
      }
    }
  }

  function nativeFriendStore() {
    for (const owner of owners()) {
      const store = owner.g_FriendsUIApp?.FriendStore || owner.friendStore;
      if (typeof store?.GetUserDoNotDisturb === 'function' && typeof store.SetUserDoNotDisturb === 'function') {
        return store;
      }
    }
    return null;
  }

  const avatarItemClass = () => [live.api.menuStyles.MenuItem, C.contextMenuItem, 'contextMenuItem', 'se-avatar-menu-item'].join(' ');
  const avatarItemStyle = {
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
  };

  function DoNotDisturbItem() {
    const read = () => Boolean(nativeFriendStore()?.GetUserDoNotDisturb());
    const [checked, setChecked] = live.api.React.useState(read);

    // Steam offers no change event for it: re-read while the menu is open (paused when hidden).
    live.api.React.useEffect(() => {
      const poll = SE.poll(() => setChecked(read()), 250);
      return () => poll.disconnect();
    }, []);

    return live.api.React.createElement(
      'button',
      {
        type: 'button',
        role: 'menuitemcheckbox',
        'aria-checked': checked,
        disabled: !nativeFriendStore(),
        className: avatarItemClass(),
        style: { ...avatarItemStyle, display: 'flex', alignItems: 'center', gap: '8px' },
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const store = nativeFriendStore();
          if (!store) return;
          store.SetUserDoNotDisturb(!store.GetUserDoNotDisturb());
          setChecked(Boolean(store.GetUserDoNotDisturb()));
        },
      },
      live.api.React.createElement('input', {
        type: 'checkbox',
        checked,
        readOnly: true,
        tabIndex: -1,
        'aria-hidden': true,
        style: { margin: 0, pointerEvents: 'none', accentColor: 'var(--se-accent, #7cc4ff)' },
      }),
      'Do Not Disturb'
    );
  }

  function resolveRenameDialog() {
    live.renameDialogOpener ||= SE.findModule('steam-menu:rename-dialog', (source, id, req) => {
      const marker = source.indexOf('"ChangePersonaDialog"');
      if (marker < 0 || !source.includes('Dialog_ChangePersonaName')) return null;
      const declaration = source.slice(source.lastIndexOf('function ', marker), marker);
      const local = /^function\s+([\w$]+)\s*\(/.exec(declaration)?.[1];
      const exports = req(id);
      const key = local && exportNames(source)[local];
      return [key && exports[key], ...Object.values(exports || {})].find(
        (candidate) =>
          typeof candidate === 'function' &&
          Function.prototype.toString.call(candidate).length < 2000 &&
          Function.prototype.toString.call(candidate).includes('"ChangePersonaDialog"')
      );
    });
    return live.renameDialogOpener;
  }

  function findNativeRenameMenu() {
    return SE.findModule('steam-menu:rename-menu', (source, id, req) => {
      if (!source.includes('Dialog_ChangePersonaName') || !source.includes('setPersonaNameEresultCallback')) return null;
      return Object.values(req(id) || {}).find((value) => {
        if (typeof value !== 'function') return false;
        const body = Function.prototype.toString.call(value);
        return body.includes('setPersonaNameEresultCallback') && body.includes('ownerWindow');
      });
    });
  }

  function findRenameController(value, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 6) return null;
    seen.add(value);
    if (live.api.React.isValidElement(value)) {
      for (const Type of [value.type, value.type?.type]) {
        if (typeof Type === 'function' && Type.prototype && 'EditName' in Type.prototype) {
          return { Type, props: value.props };
        }
      }
      return findRenameController(value.props?.children, seen, depth + 1);
    }
    for (const child of Object.values(value)) {
      const match = findRenameController(child, seen, depth + 1);
      if (match) return match;
    }
    return null;
  }

  function openPrivateNativeRename() {
    let app;
    for (const owner of owners()) {
      if (owner.g_FriendsUIApp?.GetDefaultBrowserContext) {
        app = owner.g_FriendsUIApp;
        break;
      }
    }
    const nativeMenu = app && findNativeRenameMenu();
    if (!nativeMenu) return false;

    const managers = new Set([live.manager, ...sidebarManagers.keys(), ...(live.api.registry.m_mapManagers?.values?.() || [])]);
    const target = document.querySelector(SIDE_HOVER.account) || document.body;
    managers.add(contextManager(SE.fiber(target)));

    const stop = {};
    const saved = [];
    let captured;

    try {
      for (const owner of managers) {
        if (typeof owner?.CreateContextMenuInstance !== 'function') continue;
        const original = owner.CreateContextMenuInstance;
        const intercept = function (...args) {
          captured = findRenameController(args);
          throw stop;
        };
        owner.CreateContextMenuInstance = intercept;
        saved.push({ owner, original, intercept });
      }
      if (!saved.length) return false;
      const rect = target.getBoundingClientRect();
      try {
        nativeMenu(app.GetDefaultBrowserContext(), {
          currentTarget: target,
          target,
          view: window,
          clientX: rect.left,
          clientY: rect.bottom,
          pageX: rect.left,
          pageY: rect.bottom,
          preventDefault() {},
          stopPropagation() {},
        });
      } catch (error) {
        if (error !== stop) throw error;
      }
    } finally {
      for (const { owner, original, intercept } of saved) {
        if (owner.CreateContextMenuInstance === intercept) {
          owner.CreateContextMenuInstance = original;
        }
      }
    }

    if (!captured) return false;
    const controller = new captured.Type(captured.props);
    controller.EditName();
    return true;
  }

  function EditProfileNameItem() {
    const [error, setError] = live.api.React.useState(false);
    return live.api.React.createElement(
      'button',
      {
        type: 'button',
        'data-se-native-rename-action': '',
        className: avatarItemClass(),
        style: avatarItemStyle,
        onClick: async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const open = resolveRenameDialog();
          for (const [instance, saved] of patched) {
            if (instance.visible && saved.button?.matches(SIDE_HOVER.account)) {
              instance.Hide();
            }
          }
          try {
            if (open) open(null, window);
            else if (!openPrivateNativeRename()) setError(true);
          } catch (err) {
            console.warn('[Steam Enhanced] native rename dialog:', err);
            setError(true);
          }
        },
      },
      error ? 'Rename dialog unavailable' : 'Edit Profile Name'
    );
  }

  function AccountStatusMenu() {
    const entry = configurations().get('Friends');
    const permission = live.api.usePermission(entry?.props.parentalFeature ?? live.api.defaultFeature);
    if (!entry || permission !== live.api.allowed) return null;
    const props = entry.props;

    const list = (mode) =>
      live.api.React.createElement(
        'div',
        { 'data-se-account-status': mode, style: { display: 'contents' }, ref: trimAccountStatus },
        live.api.React.createElement(live.api.MenuItems, {
          menuItems: props.menuItems || [],
          children: props.menuContent,
          disabledItemClass: props.disabledItemClass,
        })
      );

    return live.api.React.createElement(
      live.api.React.Fragment,
      null,
      live.api.React.createElement(
        'div',
        { 'data-se-avatar-section': 'edit', style: { display: 'contents' }, ref: placeAvatarSection },
        live.api.React.createElement(EditProfileNameItem)
      ),
      live.api.React.createElement(
        'div',
        { 'data-se-avatar-section': 'status', style: { display: 'contents' }, ref: placeAvatarSection },
        live.api.React.createElement(DoNotDisturbItem),
        live.api.React.createElement(live.api.SubMenu, {
          label: 'Online Status',
          className: [live.api.menuStyles.MenuItem, live.api.menuStyles.Item, 'se-avatar-status-submenu'].filter(Boolean).join(' '),
          children: list('choices'),
        })
      )
    );
  }

  function placeAvatarSection(section) {
    if (!section) return;
    const parent = section.parentElement;
    const [group, english] =
      section.getAttribute('data-se-avatar-section') === 'edit'
        ? ['profile', /^View My Profile$/i]
        : ['account', /^Change Account(?:\.\.\.)?$/i];
    const itemClass = live.api.menuStyles.MenuItem.split(' ')[0];
    const row = [...parent.querySelectorAll(`.${itemClass}`)].find(
      (item) => !item.closest('[data-se-avatar-section]') && isLabel(group, normalizeMenuLabel(item.textContent), english)
    );
    if (!row) return;

    let anchor = row;
    while (anchor.parentElement !== parent && anchor.parentElement) {
      anchor = anchor.parentElement;
    }
    if (anchor.parentElement !== parent || anchor.contains(section) || section.nextElementSibling === anchor) {
      return;
    }
    parent.insertBefore(section, anchor);
  }

  function initializeAvatarMenu(node) {
    if (!node) return;
    for (const [old, obs] of avatarLayouts) {
      if (!old.isConnected) {
        obs.disconnect();
        avatarLayouts.delete(old);
      }
    }
    const arrange = () => {
      for (const root of node.querySelectorAll('[data-se-account-status]')) trimAccountStatus(root);
      for (const section of node.querySelectorAll('[data-se-avatar-section]')) placeAvatarSection(section);
    };
    arrange();
    if (avatarLayouts.has(node)) return;
    const obs = new MutationObserver(arrange);
    obs.observe(node, { childList: true, subtree: true });
    avatarLayouts.set(node, obs);
  }
  Object.assign(ns, { AccountStatusMenu, initializeAvatarMenu });
})(window.__se);
