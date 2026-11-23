/*
 * A friend's pictures. Their profile background, the one Steam shows on their hover card, from
 * the community's mini-profile JSON (the friend toasts, client/toasts/stage.js; the friend
 * dialogs' art, SE.dialogArt.friend). And Steam's "?" picture, what an account without one
 * reports instead of an empty URL (initials stand in for it).
 *
 *   SE.profileBackground(accountId)  a promise of { video, still } (either may be missing), or
 *                                    null when the friend has none or the fetch failed
 *   SE.isDefaultAvatar(url)          the URL is Steam's "?" picture
 *
 * Fetched once per friend and shared across windows: the cache sits on the opener's runtime
 * (window.__se), which popup windows reach; it keeps the 50 most recent friends.
 */
((SE) => {
  const { run } = SE;
  const KEEP = 50;
  let local = null;

  const miniProfile = (accountId) => {
    const host = run(() => window.opener) || window;
    const rt = run(() => host.__se);
    // The opener's own Map, so a closed window is not kept alive through it
    const cache = (rt && run(() => (rt.miniProfiles ||= new host.Map()))) || (local ||= new Map());
    if (!cache.has(accountId)) {
      if (cache.size >= KEEP) cache.delete(cache.keys().next().value);
      cache.set(
        accountId,
        fetch(`https://steamcommunity.com/miniprofile/${accountId}/json`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
    return cache.get(accountId);
  };

  const DEFAULT_AVATAR = /fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb/i;
  SE.isDefaultAvatar = (url) => typeof url === 'string' && DEFAULT_AVATAR.test(url);

  SE.profileBackground = async (accountId) => {
    const bg = (await miniProfile(accountId))?.profile_background;
    if (!bg) return null;
    const video = bg['video/webm'] || bg['video/mp4'] || '';
    const still = [bg.image, bg['image/jpeg'], bg['image/png']].find((url) => typeof url === 'string') || '';
    return video || still ? { video, still } : null;
  };
})(window.__se);
