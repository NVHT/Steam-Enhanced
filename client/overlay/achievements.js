/*
 * Overlay: the full achievements list view.
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { ACH_TABS, VIEWS, achIcon, buildBar, button, fmtPct, formatDate, friendGroups, friendsInGame, friendsPlayedRecently, friendsState, guidesCache, newsCache, recentCache, renderAchievements, renderFriends, renderFriendsView, renderGuides, renderNews, renderNotesView, renderScreenshots, renderToolViews, scheduleRender, screenshotsCache, setText, tierOf } = ns;
  const { live } = ns;

  /* ---------- Achievements list view ---------- */

  const VIEW_ATTR = 'data-se-ov-view';
  const listState = { tab: null, query: '', tier: null };

  // A view that has nothing to show (a game without achievements) falls back
  // to the overview.
  const setView = next => {
    const known = VIEWS.some(({ id }) => id === next);
    const target = !known || (next === 'achievements' && !live.achData?.total) ? 'overview' : next;
    if (target === live.view) return;
    live.view = target;
    if (live.ui) {
      SE.attr(live.ui.overview.wrap, VIEW_ATTR, live.view === 'overview' ? null : live.view);
      live.ui.overview.wrap.scrollTop = 0;
    }
    scheduleRender();
  };

  const setListState = patch => {
    Object.assign(listState, patch);
    if (live.ui) renderAchList(live.ui.overview.list, live.achData);
  };

  const byNewest = (a, b) => b.unlockedAt - a.unlockedAt;
  const byEasiest = (a, b) => (b.pct ?? -1) - (a.pct ?? -1);
  const byClosest = (a, b) => b.progress.ratio - a.progress.ratio;

  // Tab contents: closest first, newest unlock first, easiest locked first.
  const tabItems = (items, tab) => {
    switch (tab) {
      case 'progress':
        return items.filter(item => item.progress).sort(byClosest);
      case 'unlocked':
        return items.filter(item => item.achieved).sort(byNewest);
      default:
        return items.filter(item => !item.achieved).sort(byEasiest);
    }
  };

  const tierCounts = items =>
    SE.rarity.TIERS.map(tier => {
      const all = items.filter(item => tierOf(item.pct) === tier);
      return { tier, total: all.length, unlocked: all.filter(item => item.achieved).length };
    }).filter(count => count.total);

  const buildAchRow = item => {
    const row = el('li', 'se-ov-achl-row');
    if (!item.achieved) row.dataset.locked = '';
    const text = el('div', 'se-ov-achl-text');
    const line = el('div', 'se-ov-achl-line');
    const right = item.progress
      ? `${item.progress.current.toLocaleString()}/${item.progress.max.toLocaleString()}`
      : item.achieved
        ? formatDate(item.unlockedAt)
        : '';
    // Name, then the rarity pill and the date or count, on one line.
    line.append(el('span', 'se-ov-achl-name', item.name));
    const tier = tierOf(item.pct);
    if (tier) {
      const pill = el('span', 'se-ov-achl-pill', `${tier.name} · ${fmtPct(item.pct)}%`);
      pill.dataset.seTier = tier.id;
      line.append(pill);
    }
    if (right) line.append(el('span', 'se-ov-achl-when', right));
    text.append(line, el('span', 'se-ov-achl-desc', item.desc));
    if (item.progress) text.append(buildBar(item.progress.ratio));
    row.append(achIcon('se-ov-achl-icon', item, item.achieved), text);
    return row;
  };

  const renderAchList = (part, data) => {
    if (!data?.total) return;
    const items = data.items;
    const counts = {
      progress: items.filter(item => item.progress).length,
      unlocked: data.unlocked,
      locked: data.total - data.unlocked,
    };
    // Open on In progress when anything is, else on the unlocks.
    if (!listState.tab || (listState.tab === 'progress' && !counts.progress)) {
      listState.tab = counts.progress ? 'progress' : 'unlocked';
    }

    part.bar.firstChild.style.width = `${((data.unlocked / data.total) * 100).toFixed(1)}%`;

    for (const { id, label } of ACH_TABS) {
      const tab = part.tabButtons.get(id);
      const count = counts[id];
      setText(tab, count === undefined ? label : `${label} · ${count}`);
      tab.hidden = id === 'progress' && !counts.progress;
      tab.setAttribute('aria-selected', String(listState.tab === id));
    }

    const tiers = tierCounts(items);
    const chipsSig = JSON.stringify([tiers.map(c => [c.tier.id, c.unlocked, c.total]), listState.tier]);
    if (part.chipsSig !== chipsSig) {
      part.chipsSig = chipsSig;
      part.chips.hidden = !tiers.length;
      part.chips.replaceChildren(
        ...tiers.map(({ tier, unlocked, total }) => {
          const chip = button('se-ov-achl-chip', { achTier: tier.id, seTier: tier.id });
          chip.setAttribute('aria-pressed', String(listState.tier === tier.id));
          chip.title = `${tier.name}: ${unlocked} of ${total} unlocked`;
          chip.append(el('i'), el('span', null, tier.name), el('b', null, `${unlocked}/${total}`));
          return chip;
        })
      );
    }

    const query = listState.query.trim().toLowerCase();
    const rowsSig = [data.items.length, data.unlocked, items.reduce((n, i) => n + (i.progress?.current || 0), 0), listState.tab, listState.tier, query].join('|');
    if (part.rowsSig === rowsSig) return;
    part.rowsSig = rowsSig;
    let shown = tabItems(items, listState.tab);
    if (listState.tier) shown = shown.filter(item => tierOf(item.pct)?.id === listState.tier);
    if (query) shown = shown.filter(item => `${item.name} ${item.desc}`.toLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    for (const item of shown) fragment.append(buildAchRow(item));
    part.list.replaceChildren(fragment);
    part.list.scrollTop = 0;
    part.empty.hidden = shown.length > 0;
    setText(part.empty, query || listState.tier ? 'No achievements match.' : 'Nothing here yet.');
  };

  // A box's width inside its padding (the wrap pads for clipped effects).
  const contentWidth = node => {
    const style = getComputedStyle(node);
    return node.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  };

  const renderOverview = (overview, appid) => {
    renderAchievements(overview.achievements, appid);
    if (live.achData?.total) renderAchList(overview.list, live.achData);
    else if (live.view === 'achievements') setView('overview');
    if (live.view === 'friends') renderFriendsView(overview.friendsView, appid, friendGroups(appid, friendsState.query));
    renderToolViews(overview.tools, appid);
    if (live.view === 'notes') renderNotesView(overview.tools.notes, appid);
    renderFriends(
      overview.friends,
      appid ? friendsInGame(appid) : [],
      appid ? friendsPlayedRecently(appid, recentCache.get(appid)) : [],
      contentWidth(overview.wrap)
    );
    renderScreenshots(overview.screenshots, appid ? screenshotsCache.get(appid) : null);
    renderGuides(overview.guides, appid, appid ? guidesCache.get(appid) : null);
    renderNews(overview.news, appid, appid ? newsCache.get(appid) : null);
  };

  Object.assign(ns, { VIEW_ATTR, listState, renderOverview, setListState, setView });
});
