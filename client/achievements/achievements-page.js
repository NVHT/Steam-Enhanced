/*
 * Library › game › Achievements: rarity tiers on every achievement icon, as on the game page.
 *
 * Steam's icon component takes the global unlock rate as its own prop (globalUnlockPercentage)
 * beside the achievement; it is read from the fiber, so no extra request is made. Each tiered
 * icon gets `data-se-tier` (aura), `data-se-tier-locked` when not unlocked, and the
 * SE.rarity.fx layer (sparkles and the tier's initial). Styles: core/achievement-tiers.css and
 * client/achievements/achievements-page.css. Spoiler-covered hidden achievements stay plain.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, mark, unmark, fromProps } = SE;
  const { tierOf, fx } = SE.rarity;
  window.__steamEnhancedAchievementsPage?.destroy();

  const TABLE = `.${C.AchievementsTable}`;
  const ICON = `${TABLE} .${C.HiddenLabel_AchievementIconWrapper}`;
  const FX = 'se-ach-fx';

  // The icon component's props, a few fibers above its wrapper <div>.
  const iconProps = (el) =>
    fromProps(el, 6, (p) => (p.achievement && 'globalUnlockPercentage' in p ? p : null));

  function decorate(el) {
    const p = iconProps(el);
    // `hidden: true` is Steam's spoiler cover: its rarity stays hidden with the rest of it.
    const tier = p && p.hidden !== true ? tierOf(p.globalUnlockPercentage) : null;
    const locked = !p?.unlocked;
    const sig = tier ? `${tier.id}:${locked ? 1 : 0}` : '';
    const layer = el.querySelector(`:scope > .${FX}`);
    if (el.__seTier === sig && Boolean(layer) === Boolean(tier)) return;
    el.__seTier = sig;
    layer?.remove();
    if (!tier) {
      unmark(el, 'data-se-tier');
      unmark(el, 'data-se-tier-locked');
      return;
    }
    mark(el, 'data-se-tier', tier.id);
    if (locked) mark(el, 'data-se-tier-locked');
    else unmark(el, 'data-se-tier-locked');
    el.append(fx(tier, locked));
  }

  function update() {
    for (const el of document.querySelectorAll(ICON)) {
      try {
        decorate(el);
      } catch (_) {}
    }
  }

  // Rates arrive after the rows: Steam re-renders the icons then (their glow class changes).
  const observer = SE.watch(update, {
    attributes: ['class'],
    throttle: 50,
    ignore: SE.inside(SE.SIDE),
  });
  update();

  window.__steamEnhancedAchievementsPage = {
    destroy() {
      observer.disconnect();
      for (const el of document.querySelectorAll(`${TABLE} .${FX}`)) el.remove();
      for (const el of document.querySelectorAll(`${TABLE} [data-se-tier]`)) {
        unmark(el, 'data-se-tier');
        unmark(el, 'data-se-tier-locked');
        el.__seTier = undefined;
      }
    },
  };
});
