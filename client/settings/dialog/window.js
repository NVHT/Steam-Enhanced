/*
 * Steam Settings, Game Properties and Millennium Settings: which window this is, and sizing it.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSettingsParts;
  if (!ns) return;
  const { fromProps } = SE;
  const { SIZE, pageNameOf } = ns;

  /*
   * Steam Settings in any language: first by its pages' identifiers when React exposes them,
   * then by the Account page's name (a few languages), then by size (no other paged dialog
   * comes close to its 19 pages). Only asked once Millennium and Properties are ruled out.
   */
  const STEAM_PAGE_ID = /^(?:\/?settings\/)?account$/i;
  const STEAM_ACCOUNT = /^(account|konto|compte|cuenta|conta)$/i;
  // Only a yes is kept: a list still filling in may not look like Steam Settings yet.
  const steamLists = new WeakSet();

  function isSteamSettings(list, items) {
    if (steamLists.has(list)) return true;
    const pages = fromProps(list, 10, (p) => (Array.isArray(p.pages) ? p.pages : undefined));
    const byId = pages?.some((page) =>
      [page?.identifier, page?.route, page?.key, page?.name].some((v) => typeof v === 'string' && STEAM_PAGE_ID.test(v))
    );
    const steam = Boolean(byId) || items.some((i) => STEAM_ACCOUNT.test(pageNameOf(i))) || items.length >= 14;
    if (steam) steamLists.add(list);
    return steam;
  }

  function sizeWindow(size = SIZE) {
    const win = window.SteamClient?.Window;
    if (!win?.ResizeTo || document.visibilityState !== 'visible') return;
    const s = window.screen;
    const availW = s.availWidth || size.w;
    const availH = s.availHeight || size.h;
    const w = Math.min(size.w, availW - 32);
    const h = Math.min(size.h, availH - 32);
    try {
      win.ResizeTo(w, h, true);
      if (win.MoveTo) {
        const x = (s.availLeft || 0) + Math.round((availW - w) / 2);
        const y = (s.availTop || 0) + Math.round((availH - h) / 2);
        win.MoveTo(x, y, window.devicePixelRatio || true);
      }
    } catch (_) {}
  }
  Object.assign(ns, { isSteamSettings, sizeWindow });
});
