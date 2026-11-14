/* Native submenus and the labels Steam localizes (View, Friends, Games, Help). */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSteamMenuParts;
  if (!ns) return;
  const { live } = ns;

  /*
   * Menu items whose dialog Steam shows in the window it's handed. A menu runs in its own popup
   * window, and Steam hands an item that popup's window (the clicked row's defaultView), so its
   * modal never fits there and opens as a separate "Steam Dialog" window. These items get the
   * window the menu belongs to instead, where the dialog opens as an overlay.
   */
  const OWNER_WINDOW_ITEMS = new Set(['#Menu_ActivateRetail']);

  function inOwnerWindow(items, ownerWindow) {
    if (!ownerWindow || !items.some((item) => OWNER_WINDOW_ITEMS.has(item?.name) && typeof item.onClick === 'function')) {
      return items;
    }
    return items.map((item) =>
      OWNER_WINDOW_ITEMS.has(item?.name) && typeof item.onClick === 'function'
        ? { ...item, onClick: () => item.onClick(ownerWindow) }
        : item
    );
  }

  function Submenu({ name, entry }) {
    const permission = live.api.usePermission(entry?.props.parentalFeature ?? live.api.defaultFeature);
    const items = entry?.props.menuItems;
    const ownerWindow = entry?.node.ownerDocument.defaultView;
    const menuItems = live.api.React.useMemo(() => inOwnerWindow(items || [], ownerWindow), [items, ownerWindow]);
    if (!entry || permission !== live.api.allowed) return null;
    const { node, props } = entry;
    const label = node.getAttribute('aria-label') || node.textContent.trim() || name;
    return live.api.React.createElement(live.api.SubMenu, {
      label,
      className: [live.api.menuStyles.MenuItem, live.api.menuStyles.Item, 'se-steam-native-submenu'].filter(Boolean).join(' '),
      children: live.api.React.createElement(live.api.MenuItems, {
        menuItems,
        children: props.menuContent,
        disabledItemClass: props.disabledItemClass,
      }),
    });
  }

  function normalizeMenuLabel(text) {
    return text.replace(/\u2026/g, '...').replace(/\s+/g, ' ').trim();
  }

  /*
   * Menu rows are told apart by Steam's own wording for the label's localization token, so
   * this works in any client language; the English patterns stay as the fallback for a build
   * whose tokens differ. Unknown tokens come back as the token itself and are skipped.
   */
  const MENU_TOKENS = {
    state: ['#PersonaStateOnline', '#PersonaStateAway', '#PersonaStateInvisible', '#PersonaStateOffline',
      '#Menu_Online', '#Menu_Away', '#Menu_Invisible', '#Menu_Offline'],
    unwanted: ['#Menu_ViewFriendsList', '#Menu_FriendsList', '#Menu_AddFriend', '#Menu_AddAFriend'],
    editName: ['#Menu_ChangeProfileName', '#Menu_EditProfileName', '#Menu_ChangePersonaName'],
    profile: ['#Menu_ViewMyProfile', '#Menu_ViewProfile', '#AccountMenu_ViewProfile'],
    account: ['#Menu_ChangeAccount', '#AccountMenu_ChangeAccount'],
  };
  const localizedLabels = new Map();
  function labelsFor(group) {
    let set = localizedLabels.get(group);
    if (!set) {
      set = new Set();
      for (const token of MENU_TOKENS[group]) {
        const text = SE.run(() => live.api.localize(token));
        if (typeof text === 'string' && text && !text.startsWith('#')) set.add(normalizeMenuLabel(text).toLowerCase());
      }
      localizedLabels.set(group, set);
    }
    return set;
  }
  const isLabel = (group, label, english) => labelsFor(group).has(label.toLowerCase()) || english.test(label);
  Object.assign(ns, { Submenu, isLabel, normalizeMenuLabel });
});
