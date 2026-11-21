/*
 * Steam Settings, Game Properties and Millennium Settings: the Game Properties header, the game's
 * hero art across the window's top, behind the sidebar and the page, fixed while the page
 * scrolls over it.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
  if (!ns) return;
  const { OWN } = ns;

  // The art on screen: { art, appid, failed }
  let head = null;

  function resetHeader() {
    head?.art.remove();
    head = null;
  }

  function build(appid, store) {
    const art = document.createElement('div');
    art.className = 'se-phead-art';
    art.setAttribute(OWN, 'settings');
    const mine = { art, appid, failed: false };
    // No hero (most non-Steam shortcuts): no art, the page as it is
    art.append(SE.art.img(SE.heroURLs(appid, store), 'se-phead-hero', () => {
      mine.failed = true;
      art.remove();
    }));
    return mine;
  }

  // target: the game this window is for (props.js propsTarget)
  function propsHeader(content, target) {
    const appid = target?.appid;
    const dialog = content?.closest('.PagedSettingsDialog');
    if (!dialog || !appid) {
      resetHeader();
      return;
    }
    if (head?.appid !== appid) {
      resetHeader();
      head = build(appid, target.store);
    }
    if (!head.failed && dialog.firstElementChild !== head.art) dialog.prepend(head.art);
  }
  Object.assign(ns, { propsHeader, resetHeader });
})(window.__se);
