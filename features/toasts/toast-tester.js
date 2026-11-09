/*
 * Toast tester: Ctrl+Shift+T in the Steam window opens a panel that plays every kind of
 * Stage toast (features/toasts/toasts.js) at the bottom centre of the Steam window. Art comes
 * from your recently played games; achievements use real ones from those games when one
 * exists in a tier (otherwise a sample unlock rate for it).
 *
 * Previews use the same rendering, queue, motion and rarity code as real toasts. Reading
 * Steam's own toasts and placing their windows only happens in Steam's toast windows.
 */
(window.__se ? init => init(window.__se) : init => addEventListener('se-core', () => init(window.__se), { once: true }))(SE => {
  window.__seToastTester?.destroy();

  const { run, esc, rarity } = SE;
  const PLAY_ALL_GAP_MS = 350;

  const contextGlobal = name => {
    for (const win of SE.owners()) {
      const v = run(() => win[name]);
      if (v) return v;
    }
    return null;
  };

  const steamClient = () => {
    for (const win of SE.owners()) {
      const sc = run(() => win.SteamClient);
      if (typeof sc?.Apps?.GetMyAchievementsForApp === 'function') return sc;
    }
    return null;
  };

  /* ---------- Your data: recent games and their achievements ---------- */

  function recentGames(count = 6) {
    const store = contextGlobal('appStore');
    const list =
      run(() =>
        store.allApps
          .filter(a => a && a.rt_last_time_played > 0 && a.app_type === 1)
          .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
          .slice(0, count)
      ) || [];
    const games = list.map(a => ({ appid: a.appid, name: a.display_name || `App ${a.appid}` }));
    // Placeholders keep the tester working without a library (art falls back to the plain ground).
    while (games.length < count) games.push({ appid: 0, name: ['Hollow Reach', 'Starfall Tactics', 'Neon Drift', 'Ironbound', 'Tidebreaker', 'Ember Trail'][games.length] });
    return games;
  }
  const game = i => recentGames()[i % 6];

  const achCache = new Map();
  function achievementsFor(appid) {
    if (!appid) return Promise.resolve([]);
    if (!achCache.has(appid)) {
      const sc = steamClient();
      achCache.set(
        appid,
        sc
          ? Promise.resolve(sc.Apps.GetMyAchievementsForApp(String(appid)))
              .then(r => (typeof r === 'string' ? JSON.parse(r) : r))
              .then(r => (r?.result === 1 && Array.isArray(r.data?.rgAchievements) ? r.data.rgAchievements : []))
              .catch(() => [])
          : Promise.resolve([])
      );
    }
    return achCache.get(appid);
  }

  const SAMPLE_PCT = { legendary: 2.1, epic: 9.4, rare: 28.0, uncommon: 48.7, common: 82.3 };

  // A real unlocked achievement in this tier from your recent games, else a sample one.
  async function achievementSpec(tierId) {
    for (const g of recentGames()) {
      const hit = (await achievementsFor(g.appid)).find(a => a.bAchieved && rarity.tierOf(a.flAchieved)?.id === tierId);
      if (hit) {
        return { kind: 'ach', appid: g.appid, title: hit.strName, text: `${g.name} · ${hit.strDescription || ''}`.replace(/ · $/, ''), icon: hit.strImage || '', pct: hit.flAchieved };
      }
    }
    const tier = rarity.TIERS.find(t => t.id === tierId);
    const g = game(0);
    return { kind: 'ach', appid: g.appid, title: `${tier.name} achievement`, text: `${g.name} · sample: no ${tier.name.toLowerCase()} unlock found`, pct: SAMPLE_PCT[tierId] };
  }

  // A game you've finished (every achievement unlocked), else sample counts.
  async function masteredSpec() {
    for (const g of recentGames()) {
      const all = await achievementsFor(g.appid);
      if (all.length && all.every(a => a.bAchieved)) {
        const counts = rarity.TIERS.map(t => ({ t, n: all.filter(a => rarity.tierOf(a.flAchieved) === t).length })).filter(c => c.n);
        return { kind: 'ach', appid: g.appid, title: g.name, mastered: { total: all.length, counts } };
      }
    }
    const [L, E, R, U, C] = rarity.TIERS;
    const g = game(0);
    return { kind: 'ach', appid: g.appid, title: g.name, mastered: { total: 48, counts: [{ t: L, n: 2 }, { t: E, n: 5 }, { t: R, n: 9 }, { t: U, n: 14 }, { t: C, n: 18 }] } };
  }

  /* ---------- What can be fired ---------- */

  const hero = g => SE.heroURLs(g.appid)[0] || '';

  const GROUPS = [
    ['Friends & chat', [
      ['Message', () => ({ kind: 'msg', title: 'Mara', text: 'you hopping on tonight? squad is forming around 9' })],
      ['Group chat', () => ({ kind: 'msg', title: 'Night Raid Crew', text: 'Rivet: lobby is up, join when ready' })],
      ['Online', () => ({ kind: 'online', title: 'Juno_42', text: 'is now online' })],
      ['Now playing', () => ({ kind: 'playing', title: 'Rivet', text: `is now playing ${game(1).name}`, appid: game(1).appid })],
      ['Comment', () => ({ kind: 'comment', title: 'Otter commented on your profile', text: '“that showcase is clean”' })],
      ['Voice call', () => ({ kind: 'call', title: 'Juno_42', text: 'is calling you', buttons: ['Answer', 'Decline'] })],
    ]],
    ['Invites & requests', [
      ['Game invite', () => ({ kind: 'invite', title: 'Mara invited you to play', text: game(2).name, appid: game(2).appid, buttons: ['Join', 'Ignore'] })],
      ['Friend request', () => ({ kind: 'request', title: 'Tidebreaker', text: 'wants to be your friend', buttons: ['Accept', 'Ignore'] })],
      ['Steam Family', () => ({ kind: 'family', title: 'Leo wants to play', text: `${game(3).name} · asks for 1 h more`, appid: game(3).appid, buttons: ['Approve', 'Deny'] })],
    ]],
    ['Achievements', [
      ...rarity.TIERS.map(t => [t.name, () => achievementSpec(t.id)]),
      ['Mastered', () => masteredSpec()],
    ]],
    ['Library & capture', [
      ['Ready to play', () => ({ kind: 'ready', title: game(0).name, text: 'Download complete', appid: game(0).appid, buttons: ['Play'] })],
      ['Updated', () => ({ kind: 'update', title: '3 games updated', text: `${game(1).name}, ${game(2).name} and 1 more`, appid: game(1).appid })],
      ['Disk full', () => ({ kind: 'error', title: game(2).name, text: 'Download paused · not enough disk space', appid: game(2).appid, buttons: ['Free space', 'Retry'] })],
      ['Screenshot', () => ({ kind: 'shot', title: game(0).name, text: 'Screenshot saved · F12', shot: hero(game(0)) })],
      ['Clip', () => ({ kind: 'clip', title: game(1).name, text: 'Clip saved · last 30 seconds', appid: game(1).appid })],
    ]],
    ['Store & inventory', [
      ['Wishlist sale', () => ({ kind: 'sale', title: game(4).name, text: '−60% · ends in 2 days', appid: game(4).appid })],
      ['Released', () => ({ kind: 'sale', title: `${game(5).name} is out`, text: 'A game on your wishlist just released', appid: game(5).appid })],
      ['Gift', () => ({ kind: 'gift', title: 'Otter sent you a gift', text: game(3).name, appid: game(3).appid, buttons: ['Add to library'] })],
      ['New item', () => ({ kind: 'item', title: 'Ember Trail Badge', text: `${game(0).name} · added to your inventory`, appid: game(0).appid })],
      ['Trade offer', () => ({ kind: 'trade', title: 'kestrel sent a trade offer', text: 'You give 2 items · you get 3' })],
    ]],
    ['System', [
      ['Overlay', () => ({ kind: 'overlay', title: game(0).name, text: 'Press Shift+Tab to open the overlay', appid: game(0).appid })],
      ['Controller', () => ({ kind: 'system', title: 'Wireless controller connected', text: 'Player 1 · Steam Input on' })],
      ['Battery low', () => ({ kind: 'battery', title: 'Wireless controller', text: 'Battery at 10%' })],
    ]],
  ];
  const FIRES = GROUPS.flatMap(([, items]) => items.map(([, make]) => make));

  // `auto` (Play all): toasts that wait to be handled (calls, errors) time out instead of
  // holding up the rest of the queue.
  async function fire(i, auto = false) {
    const toasts = window.__seToasts;
    if (!toasts?.preview) return;
    const spec = await Promise.resolve(run(FIRES[i]));
    if (!spec) return;
    if (auto && (spec.kind === 'call' || spec.kind === 'error')) spec.ms = 8000;
    toasts.preview(spec);
  }

  /* ---------- Panel ---------- */

  let panel = null;
  let playTimers = [];

  const stopPlayAll = () => {
    playTimers.forEach(clearTimeout);
    playTimers = [];
  };

  function build() {
    let n = 0;
    const groups = GROUPS.map(
      ([title, items]) =>
        `<section class="se-tt-group"><h3>${esc(title)}</h3><div class="se-tt-btns">${items
          .map(([label]) => `<button type="button" class="se-tt-btn" data-se-tt="${n++}">${esc(label)}</button>`)
          .join('')}</div></section>`
    ).join('');
    panel = document.createElement('div');
    panel.className = 'se-tt';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Toast tester');
    panel.innerHTML =
      '<header class="se-tt-head"><b>Toast tester</b><span>Ctrl+Shift+T</span>' +
      '<button type="button" class="se-tt-x" aria-label="Close" data-se-tt-close>×</button></header>' +
      `<div class="se-tt-body">${groups}</div>` +
      '<footer class="se-tt-foot"><button type="button" class="se-tt-btn se-tt-primary" data-se-tt-all>Play all</button>' +
      '<button type="button" class="se-tt-btn" data-se-tt-clear>Clear</button></footer>';
    panel.addEventListener('click', onClick);
    document.body.appendChild(panel);
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-se-tt-close')) return toggle(false);
    if (b.hasAttribute('data-se-tt-clear')) {
      stopPlayAll();
      return run(() => window.__seToasts?.clearAll());
    }
    if (b.hasAttribute('data-se-tt-all')) {
      stopPlayAll();
      playTimers = FIRES.map((_, i) => setTimeout(() => fire(i, true), i * PLAY_ALL_GAP_MS));
      return undefined;
    }
    if (b.dataset.seTt) fire(Number(b.dataset.seTt));
    return undefined;
  }

  function toggle(force) {
    const show = force ?? !panel?.isConnected;
    if (show) {
      if (!panel) build();
      else if (!panel.isConnected) document.body.appendChild(panel);
      panel.querySelector('.se-tt-btn')?.focus();
    } else {
      stopPlayAll();
      panel?.remove();
    }
  }

  function onKey(e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyT') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape' && panel?.isConnected) {
      toggle(false);
    }
  }

  window.addEventListener('keydown', onKey, true);

  window.__seToastTester = {
    open: () => toggle(true),
    close: () => toggle(false),
    fire: label => {
      const i = GROUPS.flatMap(([, items]) => items.map(([l]) => l)).indexOf(label);
      if (i >= 0) fire(i);
    },
    destroy() {
      stopPlayAll();
      window.removeEventListener('keydown', onKey, true);
      panel?.remove();
      delete window.__seToastTester;
    },
  };
});
