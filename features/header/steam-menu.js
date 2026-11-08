/*
 * Root menu bar consolidation and context menu positioning.
 *
 * Patches Steam's ContextMenuManager instances so View, Friends, Games, and Help
 * render as native submenus inside the main Steam root menu, adds restart and
 * reload actions, and adds online status and profile rename controls to the
 * account menu when the vertical rail is active.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, owners } = SE;
  window.__steamEnhancedSteamMenu?.destroy();

  const ROOT_BTN_SELECTOR = `.${C.RootMenuBar} .${C.RootMenuButton}`;
  const SUBMENU_NAMES = ['View', 'Friends', 'Games', 'Help'];
  const SIDE_HOVER = {
    add: '[data-se-action="add"]',
    bell: `.${C.FocusNavigationRoot_TitleBarControls} .${C.NotificationsButton}`,
    account: `.${C.FocusNavigationRoot_TitleBarControls} .${C.AccountMenu}`,
  };

  const patched = new Map();
  const sidebarManagers = new Map();
  const sideButtons = new Map();
  const hoverDocuments = new Set();
  const avatarLayouts = new Map();
  const popupObservers = new Map();
  const movedGroups = new Map();

  let api;
  let manager;
  let originalCreate;
  let wrappedCreate;
  let timer;
  let popupTimer;
  let observer;
  let frame = 0;
  let steamButton;
  let hoverButton;
  let hoverCloseTimer;
  let pointerInMain = false;
  let mainPointer;
  let popupsIdle = false;
  let renameDialogOpener;
  let nextScan = 0;

  // Known webpack module IDs and export keys for fast-path resolution.
  const KNOWN_MODULES = {
    React: [63696],
    menus: [1582, '_G'],
    submenu: [12711, 'Vs'],
    registry: [377, 'XX'],
    parental: [54069, 'l9'],
    features: [28532, 'z9', 'uX'],
    localize: [7727, 'we'],
    styles: [51319],
  };

  function sourceOf(req, id) {
    try {
      return Function.prototype.toString.call(req.m[id]);
    } catch (_) {
      return '';
    }
  }

  function exportNames(src) {
    const out = {};
    const match = /\.d\(\s*[\w$]+\s*,\s*\{([^}]*)\}\s*\)/.exec(src);
    if (match) {
      for (const [, key, local] of match[1].matchAll(/([\w$]+)\s*:\s*\(\)\s*=>\s*([\w$.]+)/g)) {
        out[local] = key;
      }
    }
    return out;
  }

  function importsOf(src) {
    const out = {};
    for (const [, alias, id] of src.matchAll(/([\w$]+)\s*=\s*[\w$]+\(\s*(\d+)\s*\)/g)) {
      if (!(alias in out)) out[alias] = Number(id);
    }
    for (const [, alias, target] of src.matchAll(/([\w$]+)\s*=\s*[\w$]+\.n\(\s*([\w$]+)\s*\)/g)) {
      if (!(alias in out) && target in out) out[alias] = out[target];
    }
    return out;
  }

  const isReact = (r) => Boolean(r?.createElement && r.Fragment && r.useState);
  const isStyles = (o) => typeof o?.MenuItem === 'string' && typeof o.Separator === 'string';

  function resolveFromKnown(req) {
    const k = KNOWN_MODULES;
    if (!req?.m?.[k.menus[0]] || !req.m[k.submenu[0]] || !req.m[k.registry[0]]) {
      return null;
    }
    const React = req(k.React[0]);
    const menus = req(k.menus[0]);
    const context = req(k.submenu[0]);
    const registry = req(k.registry[0])[k.registry[1]];
    const parental = req(k.parental[0]);
    const features = req(k.features[0]);
    const MenuItems = menus[k.menus[1]];
    const SubMenu = context[k.submenu[1]];
    const usePermission = parental[k.parental[1]];
    const localize = req(k.localize[0])[k.localize[1]];
    const menuStyles = req(k.styles[0]);

    if (
      !isReact(React) ||
      typeof MenuItems !== 'function' ||
      typeof SubMenu !== 'function' ||
      !registry?.GetContextMenuManager ||
      typeof usePermission !== 'function' ||
      features[k.features[1]] === undefined ||
      typeof localize !== 'function' ||
      !isStyles(menuStyles)
    ) {
      return null;
    }

    return {
      React,
      MenuItems,
      SubMenu,
      registry,
      localize,
      menuStyles,
      usePermission,
      allowed: features[k.features[1]],
      defaultFeature: features[k.features[2]],
    };
  }

  function resolveFromSource(req) {
    let menusId;
    let submenuId;
    let registryId;

    for (const id of Object.keys(req.m || {})) {
      const src = sourceOf(req, id);
      if (menusId === undefined && src.includes('"Menus"') && src.includes('disabledItemClass') && src.includes('parentalFeature')) {
        menusId = id;
      } else if (submenuId === undefined && src.includes('OnSubMenuMouseEnter') && src.includes('bInGamepadUI')) {
        submenuId = id;
      } else if (registryId === undefined && src.includes('m_mapManagers') && src.includes('GetContextMenuManagerFromWindow')) {
        registryId = id;
      }
      if (menusId !== undefined && submenuId !== undefined && registryId !== undefined) break;
    }

    if (menusId === undefined || submenuId === undefined || registryId === undefined) {
      return null;
    }

    const src = sourceOf(req, menusId);
    const exported = exportNames(src);
    const imports = importsOf(src);
    const mod = req(menusId);
    const pick = (alias, key) => {
      const id = imports[alias];
      return id === undefined ? undefined : req(id)?.[key];
    };

    const items = /([\w$]+)\s*=\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{\s*const\s*\{\s*disabledItemClass\s*:\s*[\w$]+\s*,\s*menuItems\s*:/.exec(src);
    const MenuItems = items && mod[exported[items[1]]];
    const feat = /parentalFeature\s*:\s*([\w$]+)\s*=\s*([\w$]+)\.([\w$]+)/.exec(src);
    const perm = feat && new RegExp(`([\\w$]+)\\s*=\\s*\\(\\s*0\\s*,\\s*([\\w$]+)\\.([\\w$]+)\\s*\\)\\s*\\(\\s*${feat[1].replace(/\$/g, '\\$')}\\s*\\)\\s*,\\s*[\\w$]+\\s*=\\s*\\1\\s*!==?\\s*([\\w$]+)\\.([\\w$]+)`).exec(src);
    const loc = /\(\s*0\s*,\s*([\w$]+)\.([\w$]+)\s*\)\s*\(\s*"#/.exec(src);

    let React;
    let menuStyles;
    for (const id of new Set(Object.values(imports))) {
      let m;
      try {
        m = req(id);
      } catch (_) {
        continue;
      }
      if (!React && isReact(m)) React = m;
      if (!menuStyles && isStyles(m)) menuStyles = m;
    }

    const subSrc = sourceOf(req, submenuId);
    const subNames = exportNames(subSrc);
    const subMod = req(submenuId);
    const sub = /([\w$]+)\s*=\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{\s*const\s+([\w$]+)\s*=\s*\(\s*0\s*,\s*[\w$.]+\s*\)\s*\(\s*\)\s*;?\s*return\s*\(\s*0\s*,\s*[\w$.]+\s*\)\s*\(\s*[\w$]+\s*,\s*\{\s*\.\.\.\s*\2\s*,\s*bInGamepadUI\s*:\s*\3\s*\}/.exec(subSrc);
    const SubMenu = sub && subMod[subNames[sub[1]]];
    const registry = Object.values(req(registryId) || {}).find((v) => v && typeof v.GetContextMenuManager === 'function');

    const resolved = {
      React,
      MenuItems,
      SubMenu,
      registry,
      menuStyles,
      localize: loc && pick(loc[1], loc[2]),
      usePermission: perm && pick(perm[2], perm[3]),
      allowed: perm && pick(perm[4], perm[5]),
      defaultFeature: feat && pick(feat[2], feat[3]),
    };

    if (
      !isReact(React) ||
      typeof MenuItems !== 'function' ||
      typeof SubMenu !== 'function' ||
      !registry ||
      typeof resolved.localize !== 'function' ||
      typeof resolved.usePermission !== 'function' ||
      resolved.allowed === undefined ||
      !isStyles(menuStyles)
    ) {
      return null;
    }
    return resolved;
  }

  function resolveMenuApi() {
    for (const req of SE.requires()) {
      try {
        const found = resolveFromKnown(req);
        if (found) return found;
      } catch (_) {}
    }
    if (performance.now() < nextScan) return undefined;
    nextScan = performance.now() + 10000;
    for (const req of SE.requires()) {
      try {
        const found = resolveFromSource(req);
        if (found) return found;
      } catch (_) {}
    }
    return undefined;
  }

  function contextManager(fiber) {
    for (let current = fiber; current; current = current.return) {
      for (let dep = current.dependencies?.firstContext; dep; dep = dep.next) {
        const value = dep.memoizedValue;
        if (value?.CreateContextMenuInstance && value.GetAllMenus) return value;
      }
    }
    return undefined;
  }

  function retainedMenu(fiber) {
    for (let hook = fiber?.memoizedState; hook; hook = hook.next) {
      const value = hook.memoizedState?.current;
      if (value?.Show && value?.Hide && 'ReactElement' in value) return value;
    }
    return undefined;
  }

  function configuration(node) {
    for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.title?.endsWith?.(' Root Menu') && (props.menuContent || props.menuItems)) {
        return {
          props,
          instance: retainedMenu(fiber),
          manager: contextManager(fiber),
        };
      }
    }
    return undefined;
  }

  function configurations() {
    const found = new Map();
    for (const node of document.querySelectorAll(ROOT_BTN_SELECTOR)) {
      const entry = configuration(node);
      if (entry) {
        found.set(entry.props.title.replace(/ Root Menu$/, ''), { node, ...entry });
      }
    }
    return found;
  }

  function Submenu({ name, entry }) {
    const permission = api.usePermission(entry?.props.parentalFeature ?? api.defaultFeature);
    if (!entry || permission !== api.allowed) return null;
    const { node, props } = entry;
    const label = node.getAttribute('aria-label') || node.textContent.trim() || name;
    return api.React.createElement(api.SubMenu, {
      label,
      className: [api.menuStyles.MenuItem, api.menuStyles.Item, 'se-steam-native-submenu'].filter(Boolean).join(' '),
      children: api.React.createElement(api.MenuItems, {
        menuItems: props.menuItems || [],
        children: props.menuContent,
        disabledItemClass: props.disabledItemClass,
      }),
    });
  }

  function normalizeMenuLabel(text) {
    return text.replace(/\u2026/g, '...').replace(/\s+/g, ' ').trim();
  }

  function trimAccountStatus(root) {
    if (!root) return;
    const itemClass = api.menuStyles.MenuItem.split(' ')[0];
    const separatorClass = api.menuStyles.Separator?.split(' ')[0];
    const mode = root.getAttribute('data-se-account-status');
    const choicesOnly = mode === 'choices';
    let hasStatus = false;

    for (const item of root.querySelectorAll(`.${itemClass}, hr`)) {
      const label = normalizeMenuLabel(item.textContent);
      const stateChoice = /^(?:Online|Away|Invisible|Offline)$/i.test(label);
      const unwanted = /^(?:View Friends List(?:\s*\(|$)|Add a Friend(?:\.\.\.|$))/i.test(label);
      const separator = item.tagName === 'HR' || (separatorClass && item.classList.contains(separatorClass));
      const editName = /^Edit Profile Name(?:\s*\/\s*Avatar)?(?:\.\.\.)?$/i.test(label);
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

  const avatarItemClass = () => [api.menuStyles.MenuItem, C.contextMenuItem, 'contextMenuItem', 'se-avatar-menu-item'].join(' ');
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
    const [checked, setChecked] = api.React.useState(read);

    api.React.useEffect(() => {
      const id = setInterval(() => setChecked(read()), 250);
      return () => clearInterval(id);
    }, []);

    return api.React.createElement(
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
      api.React.createElement('input', {
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
    if (renameDialogOpener) return renameDialogOpener;
    for (const req of SE.requires()) {
      const ids = ['57249', ...Object.keys(req.m || {}).filter((id) => id !== '57249')];
      for (const id of ids) {
        const source = sourceOf(req, id);
        const marker = source.indexOf('"ChangePersonaDialog"');
        if (marker < 0 || !source.includes('Dialog_ChangePersonaName')) continue;
        const declaration = source.slice(source.lastIndexOf('function ', marker), marker);
        const local = /^function\s+([\w$]+)\s*\(/.exec(declaration)?.[1];
        try {
          const exports = req(id);
          const key = local && exportNames(source)[local];
          const candidates = [key && exports[key], ...Object.values(exports || {})];
          for (const candidate of candidates) {
            if (typeof candidate !== 'function') continue;
            const body = Function.prototype.toString.call(candidate);
            if (body.length < 2000 && body.includes('"ChangePersonaDialog"')) {
              renameDialogOpener = candidate;
              return renameDialogOpener;
            }
          }
        } catch (_) {}
      }
    }
    return null;
  }

  function findNativeRenameMenu() {
    for (const req of SE.requires()) {
      for (const id of ['57249', ...Object.keys(req.m || {}).filter((k) => k !== '57249')]) {
        const source = sourceOf(req, id);
        if (!source.includes('Dialog_ChangePersonaName') || !source.includes('setPersonaNameEresultCallback')) continue;
        try {
          const menu = Object.values(req(id) || {}).find(
            (value) =>
              typeof value === 'function' &&
              Function.prototype.toString.call(value).includes('setPersonaNameEresultCallback') &&
              Function.prototype.toString.call(value).includes('ownerWindow')
          );
          if (menu) return menu;
        } catch (_) {}
      }
    }
    return null;
  }

  function findRenameController(value, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 6) return null;
    seen.add(value);
    if (api.React.isValidElement(value)) {
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

    const managers = new Set([manager, ...sidebarManagers.keys(), ...(api.registry.m_mapManagers?.values?.() || [])]);
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
    const [error, setError] = api.React.useState(false);
    return api.React.createElement(
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
    const permission = api.usePermission(entry?.props.parentalFeature ?? api.defaultFeature);
    if (!entry || permission !== api.allowed) return null;
    const props = entry.props;

    const list = (mode) =>
      api.React.createElement(
        'div',
        { 'data-se-account-status': mode, style: { display: 'contents' }, ref: trimAccountStatus },
        api.React.createElement(api.MenuItems, {
          menuItems: props.menuItems || [],
          children: props.menuContent,
          disabledItemClass: props.disabledItemClass,
        })
      );

    return api.React.createElement(
      api.React.Fragment,
      null,
      api.React.createElement(
        'div',
        { 'data-se-avatar-section': 'edit', style: { display: 'contents' }, ref: placeAvatarSection },
        api.React.createElement(EditProfileNameItem)
      ),
      api.React.createElement(
        'div',
        { 'data-se-avatar-section': 'status', style: { display: 'contents' }, ref: placeAvatarSection },
        api.React.createElement(DoNotDisturbItem),
        api.React.createElement(api.SubMenu, {
          label: 'Online Status',
          className: [api.menuStyles.MenuItem, api.menuStyles.Item, 'se-avatar-status-submenu'].filter(Boolean).join(' '),
          children: list('choices'),
        })
      )
    );
  }

  function placeAvatarSection(section) {
    if (!section) return;
    const parent = section.parentElement;
    const target =
      section.getAttribute('data-se-avatar-section') === 'edit'
        ? /^View My Profile$/i
        : /^Change Account(?:\.\.\.|\u2026)?$/i;
    const itemClass = api.menuStyles.MenuItem.split(' ')[0];
    const row = [...parent.querySelectorAll(`.${itemClass}`)].find(
      (item) => !item.closest('[data-se-avatar-section]') && target.test(normalizeMenuLabel(item.textContent))
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

  function AdditionalMenus() {
    const entries = configurations();
    return api.React.createElement(
      api.React.Fragment,
      null,
      ...SUBMENU_NAMES.map((name) => api.React.createElement(Submenu, { key: name, name, entry: entries.get(name) }))
    );
  }

  function groupSeparator(key) {
    return api.React.createElement('hr', {
      key,
      className: [api.menuStyles.MenuItem, api.menuStyles.Separator, `se-menu-group-${key}`].filter(Boolean).join(' '),
    });
  }

  function SteamClientActions({ instance, nativeWindow }) {
    const marker = api.React.useRef(null);

    api.React.useLayoutEffect(() => {
      const root = marker.current.parentElement;
      const doc = root.ownerDocument;
      const itemClass = api.menuStyles.MenuItem.split(' ')[0];
      const exitLabel = normalizeMenuLabel(api.localize('#Menu_Exit'));
      const pluginItem = 'data-restart-steam-root-item';
      function steamCommand(namespace, method, ...args) {
        for (const owner of new Set([nativeWindow, ...owners()])) {
          const target = owner?.SteamClient?.[namespace];
          if (typeof target?.[method] === 'function') return target[method](...args);
        }
        throw new Error(`Steam's ${namespace}.${method} command is unavailable`);
      }

      const actions = [
        ['restart', 'Restart Steam', () => steamCommand('User', 'StartRestart', true)],
        ['reload', 'Reload UI', () => steamCommand('Browser', 'RestartJSContext')],
      ];
      const rows = new Map();
      const separator = doc.createElement('hr');
      separator.className = [api.menuStyles.MenuItem, api.menuStyles.Separator].join(' ');
      let template;

      function makeRow(exit, label, run) {
        const row = doc.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'menuitem');
        row.className = exit.className;
        row.style.cssText = 'font-family:inherit;text-align:start;cursor:pointer';
        row.textContent = label;
        row.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (row.disabled) return;
          row.disabled = true;
          row.textContent = label;
          row.removeAttribute('title');
          try {
            // Dispatch before closing the popup that received the click.
            await run();
          } catch (error) {
            row.disabled = false;
            row.textContent = `${label} failed — try again`;
            row.title = error?.message || String(error);
            console.warn(`[Steam Enhanced] ${label}:`, error);
            return;
          }
          row.disabled = false;
          try {
            instance.Hide();
          } catch (error) {
            console.warn('[Steam Enhanced] Could not close the Steam menu:', error);
          }
        });
        return row;
      }

      function refresh() {
        const exit = [...root.querySelectorAll(`[role="menuitem"], .${itemClass}`)].find(
          (item) => !item.hasAttribute(pluginItem) &&
            normalizeMenuLabel(item.textContent) === exitLabel
        );
        if (exit !== template) {
          for (const row of rows.values()) row.remove();
          rows.clear();
          template = exit;
          if (exit) {
            for (const [key, label, run] of actions) rows.set(key, makeRow(exit, label, run));
          }
        }
        if (!exit) {
          separator.remove();
          return;
        }

        const parent = exit.parentElement;
        const pluginRows = [...parent.children].filter((item) => item.hasAttribute(pluginItem));
        const pluginKeys = new Set(pluginRows.map((item) => item.getAttribute(pluginItem)));
        const group = [];
        for (const [key, row] of rows) {
          if (pluginKeys.has(key)) row.remove();
          else group.push(row);
        }
        if (group.length && !pluginKeys.has('separator')) group.push(separator);
        else separator.remove();

        // Leave the plugin's group intact so its own layout hook can position it.
        let anchor = pluginRows[0] || exit;
        for (const row of group.reverse()) {
          if (row.nextElementSibling !== anchor) parent.insertBefore(row, anchor);
          anchor = row;
        }
      }

      const observer = new MutationObserver(refresh);
      observer.observe(root, { childList: true, subtree: true });
      refresh();
      return () => {
        observer.disconnect();
        for (const row of rows.values()) row.remove();
        separator.remove();
      };
    }, [instance, nativeWindow]);

    return api.React.createElement('span', { hidden: true, ref: marker });
  }

  function placeGroup(doc) {
    const start = doc.querySelector('.se-menu-group-start');
    const end = doc.querySelector('.se-menu-group-end');
    const parent = start?.parentElement;
    if (!parent || end?.parentElement !== parent) return;

    const group = [start, ...parent.querySelectorAll(':scope > .se-steam-native-submenu'), end];
    if (group.length <= 2) return;

    const label = normalizeMenuLabel(api.localize('#Menu_CheckForSteamUpdates'));
    const updateNode = [...parent.children].find((node) => !group.includes(node) && normalizeMenuLabel(node.textContent) === label);
    if (!updateNode) return;

    const previous = updateNode.previousElementSibling;
    if (previous === end) return;

    if (!movedGroups.has(parent)) {
      movedGroups.set(parent, { group, anchor: end.nextSibling, separator: null, display: '' });
    }
    const saved = movedGroups.get(parent);
    if (previous?.tagName === 'HR' && previous !== start && previous !== end) {
      saved.separator = previous;
      saved.display = previous.style.display;
      previous.style.display = 'none';
    }
    for (const node of group) {
      parent.insertBefore(node, updateNode);
    }
  }

  function cancelHoverClose() {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }

  function isHoveringMenu(instance) {
    if (!instance?.visible) return false;
    return Boolean(instance.m_element?.matches(':hover')) || isHoveringMenu(instance.submenu);
  }

  function enterMenuPopup() {
    pointerInMain = false;
    cancelHoverClose();
  }

  function anyMenuOpen() {
    for (const instance of patched.keys()) {
      if (instance.visible) return true;
    }
    return false;
  }

  function onMainMouseMove(event) {
    pointerInMain = true;
    mainPointer = { x: event.clientX, y: event.clientY };
    if (
      steamButton?.contains(event.target) ||
      [...sideButtons.values()].some((button) => button.contains(event.target))
    ) {
      cancelHoverClose();
    } else if (!hoverCloseTimer && anyMenuOpen()) {
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
        if (isSteam(instance) && instance.visible) instance.Hide();
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
    doc.body.addEventListener('mouseleave', closeAfterHover);
    doc.addEventListener('click', openMillenniumWindow, true);
    hoverDocuments.add(doc);
  }

  function pointerOverButton(button) {
    if (!pointerInMain || !mainPointer || !button) return false;
    const rect = button.getBoundingClientRect();
    return (
      mainPointer.x >= rect.left &&
      mainPointer.x < rect.right &&
      mainPointer.y >= rect.top &&
      mainPointer.y < rect.bottom
    );
  }

  function closeAfterHover(event) {
    if (event?.currentTarget === hoverButton || [...sideButtons.values()].includes(event?.currentTarget)) {
      mainPointer = { x: event.clientX, y: event.clientY };
    }
    cancelHoverClose();
    hoverCloseTimer = setTimeout(() => {
      hoverCloseTimer = null;
      for (const [instance, saved] of patched) {
        const button = isSteam(instance) ? steamButton : sideFor(saved.button);
        if (
          button &&
          instance.visible &&
          !pointerOverButton(button) &&
          (pointerInMain || !isHoveringMenu(instance))
        ) {
          instance.Hide();
        }
      }
    }, 200);
  }

  function openOnHover(event) {
    pointerInMain = true;
    mainPointer = { x: event.clientX, y: event.clientY };
    cancelHoverClose();
    const instance = [...patched.keys()].find(isSteam);
    if (!instance?.visible) steamButton?.click();
  }

  function sideFor(button) {
    if (!button) return null;
    for (const side of sideButtons.values()) {
      if (side === button || side.contains(button) || button.contains(side)) return side;
    }
    return null;
  }

  function openSideOnHover(event) {
    pointerInMain = true;
    mainPointer = { x: event.clientX, y: event.clientY };
    cancelHoverClose();
    const button = event.currentTarget;
    if (button === sideButtons.get('bell') && window.__steamEnhancedHeaderTooltips?.hasNotifications() === false) {
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
    if (hoverButton === steamButton) return;
    hoverButton?.removeEventListener('mouseenter', openOnHover);
    hoverButton?.removeEventListener('mouseleave', closeAfterHover);
    hoverButton = steamButton;
    hoverButton?.addEventListener('mouseenter', openOnHover);
    hoverButton?.addEventListener('mouseleave', closeAfterHover);
  }

  function inspectPopups() {
    const open = anyMenuOpen();
    if (!open && popupsIdle) return;
    popupsIdle = !open;
    syncOpenState();

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
        const existing = api.registry.m_mapManagers?.get(owner);
        if (existing?.GetAllMenus) {
          candidate = existing;
          break;
        }
      }
    }
    if (!candidate?.CreateContextMenuInstance || !candidate.GetAllMenus) return false;
    manager = candidate;
    originalCreate = manager.CreateContextMenuInstance;
    wrappedCreate = function (...args) {
      const instance = originalCreate.apply(this, args);
      patchInstance(instance);
      return instance;
    };
    manager.CreateContextMenuInstance = wrappedCreate;
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
      (steamButton && (anchor === steamButton || (anchor && steamButton.contains(anchor))))
    );
  }

  function watchSidebarManager(owner) {
    if (!owner?.GetAllMenus || !owner.CreateContextMenuInstance) return;
    if (owner !== manager && !sidebarManagers.has(owner)) {
      const original = owner.CreateContextMenuInstance;
      const wrapped = function (...args) {
        const menu = original.apply(this, args);
        patchInstance(menu);
        return menu;
      };
      owner.CreateContextMenuInstance = wrapped;
      sidebarManagers.set(owner, { original, wrapped });
    }
    for (const menu of owner.GetAllMenus()) patchInstance(menu);
  }

  function patchSidebarMenus() {
    for (const owner of owners()) {
      for (const candidate of api.registry.m_mapManagers?.values?.() || []) {
        watchSidebarManager(candidate);
      }
      watchSidebarManager(api.registry.m_mapManagers?.get(owner));
    }
    for (const node of document.querySelectorAll(
      '.se-menu-icon:is([data-se-icon="store"], [data-se-icon="library"], [data-se-icon="community"], [data-se-icon="profile"])'
    )) {
      for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
        if (!fiber.memoizedProps?.bSuperNavBehavior) continue;
        const instance = retainedMenu(fiber);
        patchInstance(instance);
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
        patchInstance(instance);
        watchSidebarManager(instanceManager(instance) || contextManager(fiber));
        break;
      }
    }
  }

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

  function buildPatchedGetter(originalGet, steam, button) {
    let nativeWindow;
    try {
      nativeWindow = originalGet.constructor('return globalThis')();
    } catch (_) {}

    return function () {
      const element = originalGet.call(this);
      if (!api.React.isValidElement(element)) return element;
      if (!steam) {
        if (!SE.railMode() || !button?.matches(SIDE_HOVER.account)) return element;
        return api.React.cloneElement(element, {
          children: api.React.createElement(
            'div',
            { 'data-se-avatar-menu': '', style: { display: 'contents' }, ref: initializeAvatarMenu },
            api.React.createElement(AccountStatusMenu),
            element.props.children
          ),
        });
      }
      return api.React.cloneElement(element, {
        children: api.React.createElement(
          api.React.Fragment,
          null,
          element.props.children,
          groupSeparator('start'),
          api.React.createElement(AdditionalMenus),
          groupSeparator('end'),
          api.React.createElement(SteamClientActions, { instance: this, nativeWindow })
        ),
      });
    };
  }

  function patchInstance(instance) {
    if (!instance || patched.has(instance)) return;
    const steam = isSteam(instance);
    const button = steam ? steamButton : sidebarAnchor(instance);
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
    const anchor = position && button ? createMenuAnchor(button, steam) : null;
    if (anchor) position.element = anchor;

    const ownShow = Object.getOwnPropertyDescriptor(instance, 'Show');
    const originalShow = instance.Show;
    const show = function (...args) {
      applyPlacement(this);
      refreshPosition(this);
      return originalShow.apply(this, args);
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
    });

    refreshPosition(instance);
    document.body.classList.add('se-steam-menu-ready');
    const owner = instanceManager(instance) || manager;
    queueMicrotask(() => {
      if (patched.has(instance)) owner?.OnMenusChanged?.Dispatch?.();
    });
  }

  function update() {
    frame = 0;
    const entries = configurations();
    steamButton = entries.get('Steam')?.node;
    bindHoverButton();
    if (!steamButton || SUBMENU_NAMES.some((name) => !entries.has(name))) {
      document.body.classList.remove('se-steam-menu-ready');
      return;
    }
    if (!api) api = resolveMenuApi();
    if (!api) return;
    if (!manager && !bindManager(entries.get('Steam'))) return;
    patchInstance(entries.get('Steam')?.instance);
    for (const instance of manager.GetAllMenus()) patchInstance(instance);
    patchSidebarMenus();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function start() {
    document.addEventListener('mousemove', onMainMouseMove);
    document.addEventListener('click', openMillenniumWindow, true);

    // Restrict synchronous MutationObserver passes to the titlebar and navigation rail
    // so deep Library or game-page mutations do not trigger React fiber walks.
    const MENU_AREA = `.${C.TopBar}, .${C.FocusNavigationRoot_TitleBarControls}, .${C.RootMenuBar}, .${C.SuperNavBar}, .se-sidebar-icons, .se-header-actions, .se-menu-icon`;
    observer = SE.watch(schedule, {
      sync: true,
      ignore: (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !steamButton?.isConnected) return false;
        return !el.contains(steamButton) && !el.closest(MENU_AREA);
      },
    });

    let retries = 0;
    timer = setInterval(() => {
      update();
      if (patched.size || ++retries >= 40) {
        clearInterval(timer);
        timer = null;
      }
    }, 250);
    update();
    popupTimer = setInterval(inspectPopups, 200);
    inspectPopups();
  }

  window.__steamEnhancedSteamMenu = {
    destroy() {
      clearInterval(timer);
      clearInterval(popupTimer);
      cancelHoverClose();
      document.removeEventListener('mousemove', onMainMouseMove);
      for (const node of sideButtons.values()) {
        node.removeEventListener('mouseenter', openSideOnHover);
        node.removeEventListener('mouseleave', closeAfterHover);
      }
      sideButtons.clear();
      hoverButton?.removeEventListener('mouseenter', openOnHover);
      hoverButton?.removeEventListener('mouseleave', closeAfterHover);
      for (const doc of hoverDocuments) {
        doc.body?.removeEventListener('mouseenter', enterMenuPopup);
        doc.body?.removeEventListener('mouseleave', closeAfterHover);
        doc.removeEventListener('click', openMillenniumWindow, true);
      }
      hoverDocuments.clear();
      document.removeEventListener('click', openMillenniumWindow, true);
      for (const obs of avatarLayouts.values()) obs.disconnect();
      avatarLayouts.clear();
      restorePopups();
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      removeEventListener('DOMContentLoaded', start);

      if (manager?.CreateContextMenuInstance === wrappedCreate) {
        manager.CreateContextMenuInstance = originalCreate;
      }
      for (const [owner, saved] of sidebarManagers) {
        if (owner.CreateContextMenuInstance === saved.wrapped) {
          owner.CreateContextMenuInstance = saved.original;
        }
      }
      sidebarManagers.clear();

      for (const [instance, saved] of patched) {
        if (Object.getOwnPropertyDescriptor(instance, 'ReactElement')?.get !== saved.getter) continue;
        if (instance.TakeFocus === saved.takeFocus) {
          if (saved.ownTakeFocus) Object.defineProperty(instance, 'TakeFocus', saved.ownTakeFocus);
          else delete instance.TakeFocus;
        }
        if (instance.Show === saved.show) {
          if (saved.ownShow) Object.defineProperty(instance, 'Show', saved.ownShow);
          else delete instance.Show;
        }
        if (saved.position?.element === saved.anchor) {
          saved.position.element = saved.originalAnchor;
        }
        saved.anchor?.remove();
        for (const [key, original] of saved.savedPlacement) {
          if (instance.options[key] !== saved.placement[key]) continue;
          if (original.present) instance.options[key] = original.value;
          else delete instance.options[key];
        }
        if (saved.own) Object.defineProperty(instance, 'ReactElement', saved.own);
        else delete instance.ReactElement;
      }
      for (const node of document.querySelectorAll('[data-se-menu-open]')) {
        node.removeAttribute('data-se-menu-open');
      }
      patched.clear();
      manager?.OnMenusChanged?.Dispatch?.();
      document.body?.classList.remove('se-steam-menu-ready');
      delete window.__steamEnhancedSteamMenu;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
