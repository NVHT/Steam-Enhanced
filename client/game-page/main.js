/*
 * Game Details page layout and component controller.
 *
 * - Tags each overview section with `data-se-sec` and computes `--se-span` row
 *   spans so the two-column CSS Grid stacks cards independently without gaps.
 * - Expands fixed-width achievement icon rows to fill card width, attaches rich
 *   unlock tooltips, and sets `--se-pct` progress ring variables.
 * - Adds group tabs, avatar stacks, and status rings to the "Friends Who Play" card.
 * - Renders a complete DLC grid from `details.vecDLC`, tags Trading Card badge
 *   states, builds a multi-screenshot carousel and paginated comment viewer in
 *   the activity feed, and formats rating/award pills.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedGamePageParts (values parts reassign live on its `live`): util.js
 * (shared helpers), achievements.js, layout.js, friends.js, activity.js, cards.js, page.js,
 * play-bar.js, and this one, main.js, which runs every part's steps in one pass per frame and
 * undoes them all in destroy().
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedGamePageParts;
  if (!ns) return;
  const {
    achRows, attachHltb, banners, cancelPass, CONTAINER, layout, LEFT_CARDS, LINKED, LOGO_CROP,
    onAnyScroll, onCommentPill, onEmoClick, onLogoLoad, onResizeTop, ownClasses, placeAchBanner,
    placeAchFeatured, placeAchIcons, placeAchRings, placeBadge, placeDlcAll, placeEmoDot,
    placeFeedAchAll, placeFeedEvents, placeFeedShots, placeFriends, placeHeadingLinks,
    placeHideCommunity, placeLabels, placeLeftCards, placeMoreNames, placeNewsLink,
    placePlayBarIcons, placeRatings, placeReviewPrompt, placeScrollTop, placeStatKinds,
    RIGHT_CONTROLS, schedule, setPass, sized, sizeLogos, stopLogos, tipHosts,
  } = ns;
  const { live } = ns;

  const { C } = SE;

  window.__steamEnhancedGamePage?.destroy();

  let observer;

  /*
   * [step, sections]: a step with sections runs only while one of those cards is on the page
   * (or it still holds nodes to clean up). One query lists the cards for the whole pass.
   */
  const FEED = ['activity'];
  const STEPS = [
    [sizeLogos],
    [layout],
    [placeAchRings],
    [placeAchBanner, ['achievements'], () => banners.size],
    [placeAchIcons, ['achievements'], () => achRows.size],
    [placeAchFeatured, ['achievements', 'activity'], () => tipHosts.size],
    [placeHeadingLinks, LINKED],
    [placeFriends, ['friends']],
    [placeLeftCards, LEFT_CARDS],
    [placeDlcAll, ['dlc']],
    [placeBadge, ['cards']],
    [placeHideCommunity],
    [placeEmoDot, FEED],
    [placeRatings],
    [placeScrollTop],
    [placeFeedAchAll, FEED],
    [placeFeedShots, FEED],
    [placeFeedEvents, FEED],
    [placeNewsLink, FEED],
    [placeReviewPrompt],
    [placePlayBarIcons],
    [placeStatKinds],
    [placeMoreNames],
    [placeLabels],
  ];

  const ON_PAGE = `.${C.AppDetailsMain}, ${CONTAINER}, ${RIGHT_CONTROLS}`;
  let wasOnPage = true;

  function run(step) {
    try {
      step();
    } catch (_) {}
  }

  function update() {
    cancelPass();
    const onPage = Boolean(document.querySelector(ON_PAGE));
    const cleanup = wasOnPage;
    wasOnPage = onPage;
    if (!onPage && !cleanup) {
      run(placeScrollTop);
      return;
    }
    let present = null;
    for (const [step, secs, holds] of STEPS) {
      if (secs && onPage) {
        if (!present) {
          present = new Set();
          for (const el of document.querySelectorAll('[data-se-sec]')) present.add(el.dataset.seSec);
        }
        if (!secs.some((k) => present.has(k)) && !holds?.()) continue;
      }
      run(step);
    }
  }



  function start() {
    addEventListener('se-hltb-ready', attachHltb);
    attachHltb();
    // Our own popups live in <body>: showing one must not trigger a pass.
    observer = SE.watch(update, {
      attributes: ['class'],
      throttle: 50,
      ignore: SE.inside(`${SE.SIDE}, .se-ach-tip, .se-tip-label`),
    });
    document.addEventListener('load', onLogoLoad, true);
    document.addEventListener('error', onLogoLoad, true);
    document.addEventListener('click', onEmoClick, true);
    document.addEventListener('click', onCommentPill, true);
    document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true });
    addEventListener('resize', onResizeTop);
    schedule();
  }

  const ATTRS = [
    'data-se-sec',
    'data-se-count',
    'data-se-replaced',
    'data-se-tier',
    'data-se-tier-locked',
    'data-se-ach-body',
    'data-se-ach-lead',
    'data-se-has-link',
    'data-se-icon',
    'data-se-stat',
    'data-se-label',
    'data-se-hidden',
    'data-se-cgrid',
    'data-se-textbtn',
    'data-se-btnwrap',
    'data-se-badge',
    'data-se-emo-dot',
    'data-se-empty',
    'data-se-shots',
    'data-se-fr',
    'data-se-fr-tab',
    'data-se-fr-pic',
    'data-se-fr-av',
    'data-se-fr-status',
    'data-se-fr-state',
    'data-se-fr-grid',
    'data-se-fr-wrap',
    'data-se-fr-avwrap',
    'data-se-more-count',
    'data-se-rv-text',
    'data-se-rv-hours',
    'data-se-rv-btn',
    'data-se-rate-bar',
    'data-se-rate',
    'data-se-rated',
    'data-se-rate-icon',
    'data-se-rate-count',
    'data-se-shot-side',
    'data-se-side',
    'data-se-reply',
    'data-se-pg',
    'data-se-top-host',
    'data-se-clist',
  ];

  window.__steamEnhancedGamePage = {
    destroy() {
      stopLogos();
      document.removeEventListener('load', onLogoLoad, true);
      document.removeEventListener('error', onLogoLoad, true);
      document.querySelectorAll(`[style*="${LOGO_CROP}"]`).forEach(img => img.style.removeProperty(LOGO_CROP));
      removeEventListener('se-hltb-ready', attachHltb);
      live.hltb?.destroy();
      observer?.disconnect();
      live.sizer?.disconnect();
      live.achSizer?.disconnect();
      if (live.muteAll) document.removeEventListener('pointerout', live.muteAll, true);
      cancelPass();
      for (const id of [live.fitQueued, live.scrollFrame]) if (id) cancelAnimationFrame(id);
      clearTimeout(live.shotRetry);
      document.removeEventListener('click', onEmoClick, true);
      document.removeEventListener('click', onCommentPill, true);
      document.removeEventListener('scroll', onAnyScroll, { capture: true });
      removeEventListener('resize', onResizeTop);
      document.querySelectorAll('[style*="--se-scroll"]').forEach((el) => {
        el.style.removeProperty('--se-scroll');
        el.style.removeProperty('--se-top-x');
        el.style.removeProperty('--se-top-y');
      });
      document.querySelectorAll([...ownClasses].map((c) => `.${c}`).join(', ')).forEach((el) => el.remove());
      for (const name of ATTRS) {
        document.querySelectorAll(`[${name}]`).forEach((el) => el.removeAttribute(name));
      }
      document.querySelectorAll('.se-assoc-collapsed').forEach((el) => el.classList.remove('se-assoc-collapsed'));
      document.querySelectorAll('[style*="--se-span"]').forEach((el) => el.style.removeProperty('--se-span'));
      sized.clear();
      document.querySelectorAll('[style*="--se-pct"]').forEach((el) => el.style.removeProperty('--se-pct'));
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedGamePage;
    },
  };

  setPass(update);

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
