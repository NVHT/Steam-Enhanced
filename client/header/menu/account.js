/*
 * The account menu, grouped like the Settings menu (client/header/account-menu.css): Status
 * (the four states as one segmented row, Do Not Disturb as a switch), Profile (view, rename),
 * Account (details, store preferences, wallet, change account, sign out). Steam's own rows stay
 * and are moved and marked (data-se-acct-icon); the headings, the status row and the switch are
 * the theme's.
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
    if (choicesOnly) markCurrentState(root, itemClass);
  }

  // The status row's current state (account-menu.css): Steam's order is Online, Away, Invisible,
  // Offline; your persona's state picks one.
  const STATE_ORDER = { 1: 0, 3: 1, 7: 2, 0: 3 };
  function markCurrentState(root, itemClass) {
    const persona = nativeFriendStore()?.self?.persona;
    const states = [...root.querySelectorAll(`.${itemClass}`)].filter((item) =>
      isLabel('state', normalizeMenuLabel(item.textContent), /^(?:Online|Away|Invisible|Offline)$/i)
    );
    const index = persona ? STATE_ORDER[persona.m_ePersonaState] : undefined;
    states.forEach((item, i) => SE.attr(item, 'data-se-current', i === index ? '' : null));
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

  const h = (...args) => live.api.React.createElement(...args);

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
        'data-se-acct-icon': 'dnd',
        style: avatarItemStyle,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const store = nativeFriendStore();
          if (!store) return;
          store.SetUserDoNotDisturb(!store.GetUserDoNotDisturb());
          setChecked(Boolean(store.GetUserDoNotDisturb()));
        },
      },
      h('span', { className: 'se-acct-text' }, 'Do Not Disturb', h('span', { className: 'se-acct-hint' }, 'Mute chat and notifications')),
      h('span', { className: 'se-acct-switch', 'aria-hidden': true })
    );
  }

  function resolveRenameDialog() {
    live.renameDialogOpener ||= SE.findModule('steam-menu:rename-dialog', (source, id, req) => {
      const marker = source.indexOf('"ChangePersonaDialog"');
      if (marker < 0 || !source.includes(C.className_className5)) return null;
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
      if (!source.includes(C.className_className5) || !source.includes('setPersonaNameEresultCallback')) return null;
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
        'data-se-acct-icon': 'edit',
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
      live.api.React.createElement(
        'span',
        { className: 'se-acct-text' },
        error ? 'Rename dialog unavailable' : 'Edit Profile Name',
        live.api.React.createElement('span', { className: 'se-acct-hint' }, 'Your name and picture')
      )
    );
  }

  function AccountStatusMenu() {
    const entry = configurations().get('Friends');
    const permission = live.api.usePermission(entry?.props.parentalFeature ?? live.api.defaultFeature);
    if (!entry || permission !== live.api.allowed) return null;
    const props = entry.props;

    const heading = (text, divided) =>
      h('div', { className: divided ? 'se-acct-heading se-acct-heading-divided' : 'se-acct-heading', role: 'presentation' }, text);
    const section = (name, ...children) =>
      h('div', { 'data-se-avatar-section': name, style: { display: 'contents' }, ref: placeAvatarSection }, ...children);

    return h(
      live.api.React.Fragment,
      null,
      section(
        'status',
        heading('Status'),
        h(
          'div',
          { 'data-se-account-status': 'choices', className: 'se-acct-seg', role: 'group', ref: trimAccountStatus },
          h(live.api.MenuItems, {
            menuItems: props.menuItems || [],
            children: props.menuContent,
            disabledItemClass: props.disabledItemClass,
          })
        ),
        h(DoNotDisturbItem)
      ),
      section('profile', heading('Profile', true)),
      section('edit', h(EditProfileNameItem)),
      section('account', heading('Account', true))
    );
  }

  /*
   * Where each section goes among Steam's rows: Status first, the Profile heading before View My
   * Profile and Edit Profile Name after it, the Account heading before Account Details.
   */
  const SECTION_PLACES = {
    profile: { group: 'profile', english: /^View My Profile$/i },
    edit: { group: 'profile', english: /^View My Profile$/i, after: true },
    account: { group: 'details', english: /^Account Details/i },
  };

  // Steam's rows' hint lines, by icon (drawn under the label from data-se-acct-hint, account-menu.css;
  // Account Details has its account name there instead)
  const ROW_HINTS = {
    profile: 'Your page on Steam Community',
    store: 'What the Store shows you',
    wallet: 'Your balance and its history',
    switch: 'Sign in with another account',
    signout: 'Steam asks for your sign-in next time',
  };

  // Steam's rows and their icons (account-menu.css), by label
  const ROW_ICONS = [
    ['profile', 'profile', /^View My Profile$/i],
    ['details', 'details', /^Account Details/i],
    ['store', 'store', /^Store Preferences$/i],
    ['wallet', 'wallet', /^View My Wallet\b/i],
    ['account', 'switch', /^Change Account(?:\.\.\.|…)?$/i],
    ['signOut', 'signout', /^(?:Sign Out|Log Out)\b/i],
  ];

  const topChild = (node, parent) => {
    let anchor = node;
    while (anchor && anchor.parentElement !== parent) anchor = anchor.parentElement;
    return anchor;
  };

  function placeAvatarSection(section) {
    if (!section) return;
    const parent = section.parentElement;
    if (!parent) return;
    const name = section.getAttribute('data-se-avatar-section');
    if (name === 'status') {
      if (parent.firstElementChild !== section) parent.insertBefore(section, parent.firstElementChild);
      return;
    }
    const place = SECTION_PLACES[name];
    if (!place) return;
    const itemClass = live.api.menuStyles.MenuItem.split(' ')[0];
    const row = [...parent.querySelectorAll(`.${itemClass}`)].find(
      (item) => !item.closest('[data-se-avatar-section]') && isLabel(place.group, normalizeMenuLabel(item.textContent), place.english)
    );
    const anchor = row && topChild(row, parent);
    if (!anchor || anchor.contains(section)) return;
    if (place.after) {
      if (anchor.nextElementSibling !== section) parent.insertBefore(section, anchor.nextSibling);
    } else if (section.nextElementSibling !== anchor) {
      parent.insertBefore(section, anchor);
    }
  }

  function markRows(node) {
    const itemClass = live.api.menuStyles.MenuItem.split(' ')[0];
    for (const item of node.querySelectorAll(`.${itemClass}`)) {
      if (item.closest('[data-se-avatar-section]')) continue;
      const label = normalizeMenuLabel(item.textContent);
      const icon = ROW_ICONS.find(([group, , english]) => isLabel(group, label, english))?.[1];
      SE.attr(item, 'data-se-acct-icon', icon || null);
      SE.attr(item, 'data-se-acct-hint', ROW_HINTS[icon] || null);
      if (icon === 'details') splitDetails(item);
    }
  }

  // "Account Details: name" (Steam: LogoutButton > text, AccountName): the account name on its
  // own line under the label, as a hint (account-menu.css), the label without its colon.
  function splitDetails(item) {
    const label = item.firstElementChild;
    const name = label?.lastElementChild;
    if (!name) return;
    SE.attr(label, 'data-se-acct-label', '');
    SE.attr(name, 'data-se-acct-sub', '');
    for (const node of label.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && /:\s*$/.test(node.data)) {
        node.data = node.data.replace(/\s*:\s*$/, '');
      }
    }
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
      markRows(node);
    };
    arrange();
    if (avatarLayouts.has(node)) return;
    // Own observer on purpose: one menu node's children while it is open
    const obs = new MutationObserver(arrange);
    obs.observe(node, { childList: true, subtree: true });
    avatarLayouts.set(node, obs);
  }
  Object.assign(ns, { AccountStatusMenu, initializeAvatarMenu });
})(window.__se);
