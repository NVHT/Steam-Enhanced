/*
 * Telling Steam's menu rows apart by the labels it localizes (the account menu's rows).
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { live } = ns;

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
    details: ['#Menu_AccountDetails', '#AccountMenu_AccountDetails'],
    store: ['#Menu_StorePreferences', '#AccountMenu_StorePreferences'],
    wallet: ['#Menu_ViewWallet', '#AccountMenu_ViewWallet'],
    signOut: ['#Menu_SignOut', '#Menu_Logout', '#AccountMenu_SignOut', '#AccountMenu_Logout'],
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
  Object.assign(ns, { isLabel, normalizeMenuLabel });
})(window.__se);
