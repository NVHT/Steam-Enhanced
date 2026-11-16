/*
 * Achievement Manager (github.com/madmaxgrey/AchievementManager): its window, paired with
 * achievement-manager.css.
 *
 * The plugin shows each achievement's global unlock rate ("12.3% of players ...") as text and
 * a bar, and in the Split design names a rarity of its own. This gives every achievement the
 * theme's rarity tier (SE.rarity: Legendary ≤ 5%, Epic ≤ 15%, Rare ≤ 35%, Uncommon ≤ 60%,
 * Common), the same tiers as the game page and the overlay: [data-se-tier] on the row / tile /
 * pane, which the CSS turns into the tier's colour on the bar, the rate and the tier label, and
 * [data-se-tier-name] on Split's label, shown in place of the plugin's wording; and each icon the
 * game page's tier look (iconFx).
 *
 * It also names Classic's navigation rows ([data-se-am-nav]) for their Settings-style icons,
 * and reads the head's unlocked share into [data-se-am-pct] / --se-am-pct for the theme's
 * progress ring (as on the game page's play bar) in place of Steam's progress bar.
 *
 * Only runs in the plugin's own window (titled "Achievement Manager").
 */
((SE) => {
  const KEY = '__seAchievementManager';
  window[KEY]?.destroy?.();
  if (document.title !== 'Achievement Manager') return;

  const ROOT = '.amw-root';
  // One achievement in each design: Classic row, Showcase tile, Table row, Split row, Split pane
  const ITEM = '.amw-row:not(.amw-statrow), .amx-tile:not(.amx-stat), .amx-trow:not(.amx-hd, .amx-statrow), .amx-srow, .amx-pane';
  // Where the rate is written: Classic's line, the others' bar (its title, or its text in Table)
  const RATE = '.amw-rowpct, .amx-rarity';
  const PCT = /(\d+(?:[.,]\d+)?)\s*%/;

  /*
   * Split's rows show no rate, so for them it comes from the layout's own data: the model
   * (props.m.rows: title, percent) of the design's React component, looked up by title.
   */
  let rates = new Map();
  function readRates(root) {
    const wrap = root.querySelector('.amx-wrap');
    const rows = wrap && SE.fromProps(wrap, 12, (p) => (Array.isArray(p?.m?.rows) ? p.m.rows : undefined));
    rates = new Map();
    for (const r of rows || []) {
      if (typeof r?.title === 'string' && typeof r.percent === 'number') rates.set(r.title, r.percent);
    }
  }

  const rateOf = (item) => {
    const el = item.querySelector(RATE);
    const m = el && PCT.exec(el.getAttribute('title') || el.textContent || '');
    if (m) return parseFloat(m[1].replace(',', '.'));
    const title = item.querySelector('.amx-ctitle, .amw-rowtitle')?.textContent.trim();
    return title && rates.has(title) ? rates.get(title) : null;
  };

  // Classic's navigation rows, by their label, for the Settings-style icons
  const NAV = [
    [/^achievements$/i, 'ach'],
    [/^stats$/i, 'stats'],
    [/^all\b/i, 'all'],
    [/^unlocked$/i, 'unlocked'],
    [/^locked$/i, 'locked'],
    [/^changed$/i, 'changed'],
  ];

  // The heads' "12 of 42 unlocked (28.6%)": the share, for the theme's progress ring
  const SHARE = /\((\d+(?:[.,]\d+)?)\s*%\)/;
  function placeRing(root) {
    for (const head of root.querySelectorAll('.amw-head, .amx-head')) {
      const line = head.querySelector('.amw-sub, .amx-subtitle, .amx-pill');
      const m = line && SHARE.exec(line.textContent || '');
      const pct = m ? Math.max(0, Math.min(100, parseFloat(m[1].replace(',', '.')))) : null;
      SE.attr(head, 'data-se-am-pct', pct == null ? null : String(Math.floor(pct)));
      SE.cssVar(head, '--se-am-pct', pct == null ? null : String(pct));
    }
  }

  /*
   * Showcase and Table put the Achievements / Stats tabs at the head's right, under the window's
   * title bar and its close button. They go to the start of the toolbar row under the head
   * instead (the filters and sort move to its end): laid there by CSS from the row's position,
   * measured here (--se-am-tabs-top / -left, [data-se-am-tabs]). React owns the tabs, so they aren't
   * moved, only placed. A row with nothing left in it (Stats: the search is hidden) keeps them in
   * the head.
   */
  function placeTabs(root) {
    for (const wrap of root.querySelectorAll('.amx-wrap')) {
      const tabs = wrap.querySelector(':scope > .amx-head > .amx-seg');
      const row = wrap.querySelector(':scope > .amx-head + .amx-row');
      const ok = tabs && row && row.offsetHeight > 0;
      SE.attr(wrap, 'data-se-am-tabs', ok ? '' : null);
      if (!ok) {
        SE.cssVar(wrap, '--se-am-tabs-top', null);
        SE.cssVar(wrap, '--se-am-tabs-left', null);
        continue;
      }
      // From the tabs' own containing block (the head, positioned for its ring), not the wrap
      const base = (tabs.offsetParent || wrap).getBoundingClientRect();
      const r = row.getBoundingClientRect();
      SE.cssVar(wrap, '--se-am-tabs-top', `${Math.round(r.top - base.top + (r.height - tabs.offsetHeight) / 2)}px`);
      SE.cssVar(wrap, '--se-am-tabs-left', `${Math.round(r.left - base.left)}px`);
    }
  }

  // Sizes change without DOM changes (window resize, fonts, the ring's head): measure again
  let observed = null;
  const sizes = new ResizeObserver(() => update());

  function update() {
    const root = document.querySelector(ROOT);
    if (!root) return;
    if (observed !== root) {
      sizes.disconnect();
      sizes.observe(root);
      for (const wrap of root.querySelectorAll('.amx-wrap')) sizes.observe(wrap);
      observed = root;
    }
    placeRing(root);
    placeTabs(root);
    readRates(root);
    for (const item of root.querySelectorAll('.amw-nav-item')) {
      const label = item.querySelector('.amw-label')?.textContent.trim() || '';
      SE.attr(item, 'data-se-am-nav', NAV.find(([re]) => re.test(label))?.[1] ?? null);
    }
    // Writes first (tags, layers), then every icon box read in one go, then the layers placed:
    // reading a box after a write forces a layout, once per achievement in a long list.
    const placed = [];
    for (const item of root.querySelectorAll(ITEM)) {
      const tier = SE.rarity.tierOf(rateOf(item));
      SE.attr(item, 'data-se-tier', tier?.id ?? null);
      const label = item.querySelector(':scope .amx-tier');
      SE.attr(label, 'data-se-tier-name', tier?.name ?? null);
      const fx = iconFx(item, tier);
      if (fx) placed.push(fx);
    }
    const boxes = placed.map(([item, icon]) => {
      const a = icon.getBoundingClientRect();
      const b = item.getBoundingClientRect();
      return [a.left - b.left - item.clientLeft, a.top - b.top - item.clientTop, a.width, a.height].map(
        (n) => `${Math.round(n)}px`
      );
    });
    placed.forEach(([, , fx], i) => {
      ['left', 'top', 'width', 'height'].forEach((k, j) => {
        if (fx.style[k] !== boxes[i][j]) fx.style[k] = boxes[i][j];
      });
    });
  }

  /*
   * The icon as on the game page: a tier aura, one twinkling sparkle per tier rank when unlocked
   * and the tier's initial in the corner (SE.rarity.fx, styled by client/shared/achievement-tiers.css);
   * locked ones grey with a faded initial. The icon is the plugin's own <img>, which can't hold
   * the layer, so the layer is a sibling laid over it (.se-am-fx), placed from the icon's box.
   * Locked: the plugin dims a locked icon (inline opacity), or the row says so.
   */
  const LOCKED = '.amw-row-off, .amx-off';
  /*
   * Sparkles twinkle only while their achievement is on screen: a long list would otherwise run
   * hundreds of animations at once ([data-se-am-on], set by an IntersectionObserver).
   */
  const onScreen = new IntersectionObserver((entries) => {
    for (const e of entries) SE.attr(e.target, 'data-se-am-on', e.isIntersecting ? '' : null);
  });
  const watched = new WeakSet();

  // The layer for one icon (made or kept), with what placing it needs; null when it has none
  function iconFx(item, tier) {
    const icon = item.querySelector('img.amw-rowicon');
    let fx = item.querySelector(':scope > .se-am-fx');
    if (!icon || !tier) {
      fx?.remove();
      SE.unmark(item, 'data-se-tier-locked');
      return null;
    }
    const locked = item.matches(LOCKED) || Number(icon.style.opacity || 1) < 1;
    SE.attr(item, 'data-se-tier-locked', locked ? '' : null);
    const sig = `${tier.id}:${locked ? 1 : 0}`;
    if (!fx || fx.dataset.sig !== sig) {
      fx?.remove();
      fx = document.createElement('span');
      fx.className = 'se-am-fx';
      fx.dataset.sig = sig;
      fx.append(SE.rarity.fx(tier, locked));
      item.append(fx);
    }
    if (!watched.has(item)) {
      watched.add(item);
      onScreen.observe(item);
    }
    return [item, icon, fx];
  }

  const watcher = SE.watch(update, { scope: ROOT, attributes: ['title'], characterData: true, throttle: 50 });
  addEventListener('resize', update);
  update();

  window[KEY] = {
    destroy() {
      watcher.disconnect();
      sizes.disconnect();
      onScreen.disconnect();
      removeEventListener('resize', update);
      document.querySelectorAll('.se-am-fx').forEach((el) => el.remove());
      for (const el of document.querySelectorAll('[data-se-tier], [data-se-tier-name], [data-se-tier-locked], [data-se-am-nav], [data-se-am-pct], [data-se-am-tabs], [data-se-am-on]')) {
        for (const a of ['data-se-tier', 'data-se-tier-name', 'data-se-tier-locked', 'data-se-am-nav', 'data-se-am-pct', 'data-se-am-tabs', 'data-se-am-on']) SE.unmark(el, a);
        SE.cssVar(el, '--se-am-pct', null);
        SE.cssVar(el, '--se-am-tabs-top', null);
        SE.cssVar(el, '--se-am-tabs-left', null);
      }
      delete window[KEY];
    },
  };
})(window.__se);
