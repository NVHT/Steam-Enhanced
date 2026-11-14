/*
 * Steam Settings, Game Properties and Millennium Settings: which window this is, and sizing it.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
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
    } catch {}
  }
  /*
   * The page fills its window. The in-game overlay's Settings window is sized by the overlay
   * (client/overlay/widgets.js), wider than Steam lays its dialog out, which left a blank column
   * at the right. Every box from the page up to <body> stretches (`data-se-fill`), and empty
   * boxes beside that chain step aside (`data-se-fill-spare`). Desktop windows already fill
   * theirs, so nothing is marked there.
   */
  const FILL = 'data-se-fill';
  const SPARE = 'data-se-fill-spare';
  const FILL_SLACK = 16;
  const isSpare = (el) =>
    !el.textContent.trim() && !el.querySelector('button, svg, img, input, [role="button"], [tabindex]');

  function unfillWindow() {
    for (const el of document.querySelectorAll(`[${FILL}], [${SPARE}]`)) {
      el.removeAttribute(FILL);
      el.removeAttribute(SPARE);
    }
  }

  function fillWindow(content) {
    if (!content || document.title === 'Steam') return;
    const gap = innerWidth - content.getBoundingClientRect().right;
    if (gap <= FILL_SLACK || content.hasAttribute(FILL)) return;
    for (let el = content; el && el !== document.body; el = el.parentElement) {
      el.setAttribute(FILL, '');
      for (const sib of el.parentElement?.children || []) {
        if (sib !== el && !sib.hasAttribute(SPARE) && isSpare(sib)) sib.setAttribute(SPARE, '');
      }
    }
  }

  Object.assign(ns, { fillWindow, isSteamSettings, sizeWindow, unfillWindow });
})(window.__se);
