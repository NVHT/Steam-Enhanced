/*
 * A rebuilt dialog's game art (Install, Uninstall, EULA, Mark as Private, New Collection, Exit
 * Game, CD Keys): the hero art behind its top (.se-dialog-art) and the game capsules
 * (.se-dialog-capsules), styled in client/dialogs/dialogs.css. Both work through a game's copies with Steam's own list first
 * (SE.heroURLs / SE.headerURLs, SE.art in core/runtime.js), so newer games' hashed art loads,
 * and both are marked [data-ready] once their image has loaded.
 *
 *   SE.dialogArt.hero(host, appid, className?)  appends the art to host; null when there is none
 *   SE.dialogArt.capsules(appids)               the first three games' capsules, fanned
 *   SE.dialogArt.fitWindow(root)                grows a popped-out dialog's window to the
 *                                               rebuilt dialog; returns the cancel
 *   SE.dialogArt.count(n, one, many)            "1 game", "1,204 games"
 *   SE.dialogArt.names(names)                   several games' names: "A and B", "A, B and 3 more"
 */
((SE) => {
  const MAX_CAPSULES = 3;
  const { el } = SE;

  // An image through its copies inside `box`, which is marked ready on load and dropped on failure
  const fill = (box, urls) => {
    const img = SE.art.img(urls, '', () => box.remove());
    img.addEventListener('load', () => SE.mark(box, 'data-ready'), { once: true });
    box.append(img);
  };

  const hero = (host, appid, className = '') => {
    const urls = SE.run(() => SE.heroURLs(appid)) || [];
    if (!host || !urls.length) return null;
    const art = el('div', `${className} se-dialog-art`.trim());
    art.setAttribute('aria-hidden', 'true');
    fill(art, urls);
    host.append(art);
    return art;
  };

  const capsules = (appids) => {
    const stack = el('div', 'se-dialog-capsules');
    stack.setAttribute('aria-hidden', 'true');
    for (const appid of appids.slice(0, MAX_CAPSULES)) {
      const urls = SE.run(() => SE.headerURLs(appid)) || [];
      if (!urls.length) continue;
      const capsule = el('div', 'se-dialog-capsule');
      fill(capsule, urls);
      stack.append(capsule);
    }
    return stack;
  };

  /*
   * Popped out, a dialog is its window, sized by Steam to its own, shorter dialog: the window
   * grows to fit the rebuilt one, next frame once it is laid out (SteamClient's ResizeTo takes CSS
   * pixels with `true`, as Settings sizes its window in client/settings/dialog/window.js).
   */
  const fitWindow = (root) => {
    const frame = requestAnimationFrame(() => {
      const win = window.SteamClient?.Window;
      if (document.title === 'Steam' || !win?.ResizeTo) return;
      const need = Math.ceil(root.getBoundingClientRect().top + root.scrollHeight);
      if (need > innerHeight + 1) SE.run(() => win.ResizeTo(innerWidth, Math.min(need, screen.availHeight || need), true));
    });
    return () => cancelAnimationFrame(frame);
  };

  const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

  // The first two names, then how many more
  const names = (list) => {
    const shown = list.slice(0, 2).filter(Boolean);
    const more = list.length - shown.length;
    return more ? `${shown.join(', ')} and ${more.toLocaleString()} more` : shown.join(' and ');
  };

  SE.dialogArt = { hero, capsules, fitWindow, count, names };
})(window.__se);
