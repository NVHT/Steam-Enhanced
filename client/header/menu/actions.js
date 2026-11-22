/*
 * The Steam menu, in the Settings menu's language (client/header/steam-menu.css): groups under
 * headings, each row an icon, a name and a hint.
 *   Steam:  About Steam, Check for Updates
 *   Client: Big Picture Mode, Restart Steam, Reload UI
 *   Help:   Steam Support, System Information, System Report, Legal (Privacy Policy, Legal
 *           Information, Steam Subscriber Agreement)
 *   Exit
 * Every row is one of Steam's own menu items (its MenuItems, given the theme's row as children),
 * so its dialogs and links open as Steam's do. Steam's own rows (account, settings, backup,
 * Millennium's) are hidden: the rail covers them (the avatar's, the cog's and the Games menu).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { configurations, movedGroups } = ns;
  const { live } = ns;

  const h = (...args) => live.api.React.createElement(...args);

  const localized = (token, fallback) => {
    const text = SE.run(() => live.api.localize(token));
    return typeof text === 'string' && text && !text.startsWith('#') ? text : fallback;
  };

  // A Steam item drawn as the theme's row: its icon (a mask token), its name, a hint and its shortcut
  const row = (item, { label, hint, icon, keys }) => ({
    ...item,
    children: h(
      'span',
      // se-sm-plain: one line, no hint (Legal's rows), a plain row's height
      { className: hint ? 'se-sm-row' : 'se-sm-row se-sm-plain', style: { '--se-sm-mask': `var(${icon})` } },
      h(
        'span',
        { className: 'se-sm-text' },
        h('span', { className: 'se-sm-label' }, label || localized(item.name, item.name)),
        hint && h('span', { className: 'se-sm-hint' }, hint)
      ),
      keys && h('kbd', { className: 'se-sm-keys' }, keys)
    ),
  });

  /*
   * The rows are React elements, so they're built on first draw, once Steam's menu API is found
   * (client/header/menu/api.js); built at load, they'd run before it and leave no menu.
   */
  let lists = null;
  const itemLists = () => (lists ??= {
    steam: [
      row({ name: '#Menu_About', dialog: 'AboutSteam' }, { hint: 'Version and credits', icon: '--se-icon-info' }),
      row(
        { name: '#Menu_CheckForSteamUpdates', dialog: 'CheckForUpdates' },
        { label: 'Check for Updates', hint: 'Get the latest client', icon: '--se-icon-install' }
      ),
    ],
    client: [
      row(
        { name: '#Menu_BigPictureMode', steamURL: 'steam://open/bigpicture' },
        { label: 'Big Picture Mode', hint: 'TV and controller mode', icon: '--se-icon-tv' }
      ),
      row(
        // false: a plain restart, as Steam's own Restart buttons make it
        { name: 'se-restart', onClick: () => SE.steamCall('User', 'StartRestart', false) },
        // Its shortcut and Reload UI's: client/header/header-actions.js
        { label: 'Restart Steam', hint: 'Close and reopen Steam', icon: '--se-icon-restart', keys: 'Ctrl+Shift+R' }
      ),
      row(
        { name: 'se-reload', onClick: () => SE.steamCall('Browser', 'RestartJSContext') },
        { label: 'Reload UI', hint: 'Refresh the interface', icon: '--se-icon-refresh', keys: 'Ctrl+R' }
      ),
    ],
    exit: [
      row({ name: '#Menu_Exit', steamURL: 'steam://exit' }, { hint: 'Quit Steam', icon: '--se-icon-power' }),
    ],
  });

  // Help's rows, from Steam's own Help items (their names, dialogs and which ones show)
  const HELP_ROWS = {
    '#Menu_Support': { hint: 'Get help with an issue', icon: '--se-icon-help' },
    '#Menu_SystemInfo': { hint: "Your PC's hardware", icon: '--se-icon-cpu' },
    '#Menu_SystemReport': { hint: 'Logs for troubleshooting', icon: '--se-icon-report' },
    '#Menu_SRSI_Diagnostics': { hint: 'Runtime diagnostics', icon: '--se-icon-cpu' },
  };
  // Legal's rows: one line each (an icon and Steam's name), in the submenu's own window
  const LEGAL_ROWS = {
    '#Menu_PrivacyPolicy': { icon: '--se-icon-shield' },
    '#Menu_LegalInfo': { icon: '--se-icon-scale' },
    '#Menu_SSA': { icon: '--se-icon-report' },
    '#Menu_SSA_China': { icon: '--se-icon-report' },
  };

  const heading = (text, divided) =>
    h('div', { className: divided ? 'se-acct-heading se-acct-heading-divided' : 'se-acct-heading', role: 'presentation' }, text);

  function SteamMenu() {
    if (!live.api) return null;
    const { steam, client, exit } = itemLists();
    const help = configurations().get('Help')?.props.menuItems || [];
    const byName = new Map(help.filter((item) => item?.name).map((item) => [item.name, item]));
    const helpItems = Object.entries(HELP_ROWS)
      .filter(([name]) => byName.has(name))
      .map(([name, look]) => row(byName.get(name), look));
    const legalItems = Object.entries(LEGAL_ROWS)
      .filter(([name]) => byName.has(name))
      .map(([name, look]) => row(byName.get(name), look));
    const itemClass = [live.api.menuStyles.MenuItem, live.api.menuStyles.Item].filter(Boolean).join(' ');

    return h(
      'div',
      { 'data-se-steam-menu': '', style: { display: 'contents' } },
      heading('Steam'),
      h(live.api.MenuItems, { menuItems: steam }),
      heading('Client', true),
      h(live.api.MenuItems, { menuItems: client }),
      heading('Help', true),
      h(live.api.MenuItems, { menuItems: helpItems }),
      legalItems.length > 0 &&
        live.api.SubMenu &&
        h(live.api.SubMenu, {
          className: itemClass,
          label: h(
            'span',
            // se-sm-sub: a submenu row, its arrow drawn at the row's end (Steam's is hidden)
            { className: 'se-sm-row se-sm-sub', style: { '--se-sm-mask': 'var(--se-icon-scale)' } },
            h(
              'span',
              { className: 'se-sm-text' },
              h('span', { className: 'se-sm-label' }, 'Legal'),
              h('span', { className: 'se-sm-hint' }, 'Privacy, terms, agreement')
            )
          ),
          children: h(live.api.MenuItems, { menuItems: legalItems }),
        }),
      h('div', { className: 'se-sm-divider', role: 'separator' }),
      h(live.api.MenuItems, { menuItems: exit })
    );
  }

  /*
   * Once the menu is drawn: every row of Steam's own is hidden, leaving the theme's section
   * (rows Steam or a plugin adds later are hidden too). Remembered so restorePopups()
   * (client/header/menu/popups.js) shows them again.
   */
  function placeGroup(doc) {
    const section = doc.querySelector('[data-se-steam-menu]');
    const parent = section?.parentElement;
    if (!parent) return;
    if (!movedGroups.has(parent)) movedGroups.set(parent, { hidden: [] });
    const saved = movedGroups.get(parent);
    for (const node of parent.children) {
      if (node === section || node.style.display === 'none') continue;
      saved.hidden.push([node, node.style.display]);
      node.style.display = 'none';
    }
  }

  Object.assign(ns, { SteamMenu, placeGroup });
})(window.__se);
