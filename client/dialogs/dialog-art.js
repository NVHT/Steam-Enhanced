/*
 * A rebuilt dialog's game art (Install, Uninstall, EULA, Mark as Private, New Collection, Exit
 * Game): the hero art behind its top (.se-dialog-art) and the game capsules
 * (.se-dialog-capsules), styled in client/dialogs/dialogs.css. Both work through a game's copies with Steam's own list first
 * (SE.heroURLs / SE.headerURLs, SE.art in core/runtime.js), so newer games' hashed art loads,
 * and both are marked [data-ready] once their image has loaded.
 *
 *   SE.dialogArt.hero(host, appid, className?)  appends the art to host; null when there is none
 *   SE.dialogArt.capsules(appids)               the first three games' capsules, fanned
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

  SE.dialogArt = { hero, capsules };
})(window.__se);
