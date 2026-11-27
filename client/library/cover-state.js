/*
 * A cover's state chip (client/library/cover-state.css): one small chip in each cover's corner
 * (LibraryItemBox), the same size for every state, its colour saying which: ready to play
 * (installed), not installed, or updating / downloading (a ring for how far the active one got).
 * The game is found once per cover (SE.appOf); its state is read again each pass, and on each
 * download feed update (SE.downloadFeed), so a game installed, removed or downloading follows.
 * A second chip in the top corner says where a game stands in its release (coming soon, ready to
 * pre-load, new to the library) in place of Steam's wide banner. The chips are nodes of their own:
 * Steam uses both of the box's pseudo-elements. Each has its setting (Status chips, Release chips);
 * off, Steam's own mark goes too. A click on a ready chip plays the game, on an install chip opens
 * Steam's install dialog; an updating chip passes the click to the cover. With Dim uninstalled
 * games on, a cover whose game isn't installed is marked data-se-uninstalled
 * (options/library/dim-uninstalled.css draws it): Steam's own marks don't say it at rest
 * everywhere (a collection shelf's Install button exists only while hovered).
 */
((SE) => {
  window.__seCoverState?.destroy();
  const { C } = SE;

  const BOX = `.${C.LibraryItemBox}`;
  // Steam's portrait banner: New to library, Coming soon and Pre-load share it
  const BANNER = `.${C.AppPortraitBannerContainer}`;
  const CHIP = 'se-cover-chip';
  const RELEASE = 'se-cover-release';
  const HIDDEN = 'data-se-release-banner';
  const UNINSTALLED = 'data-se-uninstalled';
  // Steam's display_status values (sp.js, its app display status enum): ReadyToPreload,
  // PresaleOnly (Coming soon)
  const PRELOAD = 10;
  const COMING_SOON = 13;
  const covers = new Map(); // a cover → { app, chip, release: the top chip, banner: Steam's }
  const chipCover = new WeakMap(); // a status chip → its cover's entry
  const TIPS = { ready: 'Play', install: 'Install' };
  // A cover's tips open off its top or bottom edge, whichever their chip sits on: its hover card
  // opens beside it at its height (on the rail's side for tips, client/header/header-tooltips.js,
  // or the other), over them
  const TIP_SIDE = 'bottom';
  const TOP_TIP_SIDE = 'top';
  // Steam's Steam Deck badge on a hovered cover (cover-state.css): its verdict, told by the
  // icon's class (the cover's icon has no words of its own), as the theme's tip on the badge.
  // Every cover's, a hover card's too (Home's shelves), whether or not its game was found.
  const DECK = `${BOX} .${C.SteamDeckCompatIcon}`;
  const DECK_TIPS = [
    [C.SteamDeckCompatVerified, 'Verified on Steam Deck'],
    [C.SteamDeckCompatPlayable, 'Playable on Steam Deck'],
    [C.SteamDeckCompatUnsupported, 'Unsupported on Steam Deck'],
    [C.SteamDeckCompatUnknown, 'Unknown on Steam Deck'],
  ];
  const tipDecks = () => {
    for (const deck of document.querySelectorAll(DECK)) {
      const tip = DECK_TIPS.find(([cls]) => deck.querySelector(`.${cls}`))?.[1] || null;
      SE.attr(deck, 'data-se-tip', tip);
      SE.attr(deck, 'data-se-tip-dir', tip ? TIP_SIDE : null);
    }
  };

  // The games in Steam's download queue, and the one downloading now with how far it got
  const downloads = () => {
    const feed = SE.downloadFeed;
    const queued = new Set((feed?.queue() || []).map((item) => Number(item.appid)));
    const active = Number(feed?.overview?.update_appid) || 0;
    if (active) queued.add(active);
    const percent = Number(feed?.overview?.overall_percent_complete);
    return { queued, active, percent: Number.isFinite(percent) ? percent : null };
  };

  const stateOf = (app, queue) => {
    if (queue.queued.has(app.appid)) return 'update';
    return SE.isInstalled(app) ? 'ready' : 'install';
  };

  const chipFor = (box) => {
    const chip = document.createElement('span');
    chip.className = CHIP;
    chip.setAttribute('aria-hidden', 'true');
    chip.setAttribute('data-se-tip-dir', TIP_SIDE);
    box.append(chip);
    return chip;
  };

  /*
   * The release chip, in the top corner in place of Steam's wide banner (the cover's or its
   * card's, wherever Steam put it), named in the theme's tip (client/header/header-tooltips.js):
   * coming soon (a calendar, its date when Steam has one), ready to pre-load (a clock), or new to
   * the library (a sparkle)
   */
  const releaseOf = (app) => {
    const status = Number(app.display_status);
    if (status === COMING_SOON) {
      const date = Number(app.rt_steam_release_date) || 0;
      const label = date * 1000 > Date.now()
        ? `Coming ${new Date(date * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : 'Coming soon';
      return { kind: 'soon', label };
    }
    if (status === PRELOAD) return { kind: 'preload', label: 'Pre-load available' };
    if (SE.run(() => app.BIsNewToLibrary())) return { kind: 'new', label: 'New to library' };
    return null;
  };

  const releaseChipFor = (box) => {
    const chip = document.createElement('span');
    chip.className = RELEASE;
    chip.setAttribute('data-se-tip-dir', TOP_TIP_SIDE);
    box.append(chip);
    return chip;
  };

  const bannerOf = (box) => box.querySelector(BANNER) || box.parentElement?.querySelector(BANNER) || null;

  // The chip while its setting is on; Steam's banner hidden either way
  const syncRelease = (box, cover, release, show) => {
    if (release && show) {
      if (!cover.release?.isConnected) cover.release = releaseChipFor(box);
      SE.attr(cover.release, 'data-kind', release.kind);
      SE.attr(cover.release, 'data-se-tip', release.label);
    } else if (cover.release) {
      cover.release.remove();
      cover.release = null;
    }
    const banner = release ? bannerOf(box) : null;
    if (cover.banner && cover.banner !== banner) cover.banner.removeAttribute(HIDDEN);
    cover.banner = banner;
    banner?.setAttribute(HIDDEN, '');
  };

  // The Status chips and Release chips settings (client/shared/settings.js); off: no mark of the
  // theme's, and none of Steam's either (Steam's buttons: options/library/cover-chips-off.css)
  const showStatus = () => SE.settings?.get('cover-chips') !== 'off';
  const showRelease = () => SE.settings?.get('release-chips') !== 'off';
  const dimUninstalled = () => SE.settings?.get('dim-uninstalled') === 'on';

  const update = () => {
    for (const [box, cover] of covers) {
      if (box.isConnected) continue;
      drop(cover);
      covers.delete(box);
    }
    for (const box of document.querySelectorAll(BOX)) {
      if (!covers.has(box)) covers.set(box, { app: SE.appOf(box) || null, chip: null, release: null, banner: null });
    }
    const status = showStatus();
    const queue = status ? downloads() : null;
    const releases = showRelease();
    const dim = dimUninstalled();
    for (const [box, cover] of covers) {
      SE.attr(box, UNINSTALLED, dim && cover.app && !SE.isInstalled(cover.app) ? '' : null);
      if (!cover.app) continue;
      const release = releaseOf(cover.app);
      // A game still to come has nothing to play or install yet: no status chip
      if (status && release?.kind !== 'soon') {
        if (!cover.chip?.isConnected) {
          cover.chip = chipFor(box);
          chipCover.set(cover.chip, cover);
        }
        const state = stateOf(cover.app, queue);
        SE.attr(cover.chip, 'data-state', state);
        SE.attr(cover.chip, 'data-se-tip', TIPS[state] || null);
        const progress = cover.app.appid === queue.active && queue.percent != null ? `${queue.percent}%` : null;
        if (progress) cover.chip.style.setProperty('--se-chip-progress', progress);
        else cover.chip.style.removeProperty('--se-chip-progress');
      } else if (cover.chip) {
        cover.chip.remove();
        cover.chip = null;
      }
      syncRelease(box, cover, release, releases);
    }
    tipDecks();
  };

  const drop = (cover) => {
    cover.chip?.remove();
    cover.release?.remove();
    cover.banner?.removeAttribute(HIDDEN);
  };

  /*
   * The chip's own action, before Steam's cover sees the click (capture on the document, ahead of
   * React's root): Play runs the game, Install opens Steam's install dialog (as the collections
   * list's buttons, client/library/collections.js). Updating chips take no pointer (cover-state.css).
   */
  const onClick = (event) => {
    const chip = event.target.closest?.(`.${CHIP}`);
    const app = chip && chipCover.get(chip)?.app;
    if (!app) return;
    const state = chip.getAttribute('data-state');
    if (state !== 'ready' && state !== 'install') return;
    event.stopPropagation();
    event.preventDefault();
    if (state === 'ready') SE.steamCall('Apps', 'RunGame', String(app.gameid || app.appid), '', -1, 100);
    else SE.steamCall('URL', 'ExecuteSteamURL', `steam://install/${app.appid}`);
  };
  document.addEventListener('click', onClick, true);

  // Throttled: covers redraw in bursts as shelves and grids scroll (a chip is added once per
  // cover, so its own mutation settles on the next pass). The download feed is read only while
  // the status chips show.
  const watcher = SE.watch(update, { throttle: 200 });
  let unsubscribeFeed = null;
  const apply = () => {
    if (showStatus() && !unsubscribeFeed) unsubscribeFeed = SE.downloadFeed?.subscribe(update) || null;
    if (!showStatus() && unsubscribeFeed) {
      unsubscribeFeed();
      unsubscribeFeed = null;
    }
    update();
  };

  const unsubscribeSettings = SE.settings?.on(apply);
  apply();

  window.__seCoverState = {
    destroy() {
      document.removeEventListener('click', onClick, true);
      unsubscribeSettings?.();
      unsubscribeFeed?.();
      watcher.disconnect();
      for (const [box, cover] of covers) {
        drop(cover);
        box.removeAttribute(UNINSTALLED);
      }
      for (const deck of document.querySelectorAll(DECK)) {
        deck.removeAttribute('data-se-tip');
        deck.removeAttribute('data-se-tip-dir');
      }
      covers.clear();
      delete window.__seCoverState;
    },
  };
})(window.__se);
