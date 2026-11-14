/*
 * Overlay: rendering the sections into the column, the view tabs and the timer.
 *
 * Part of client/overlay/ (see context.js).
 */
((SE) => {
  const ns = window.__seOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { GUIDES_URL, GUIDE_URL, HEADER_ART, ICON, NEWS_URL, achIcon, achievementsFromStore, buildBar, button, createCache, duration, img, loadAchievements, loadGuides, loadNews, loadRecentPlayers, loadScreenshots, resolveAchievementStore } = ns;
  const { live } = ns;

  /* ---------- Render ---------- */

  let renderQueued = false;

  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      ns.sync();
    });
  };

  const achievementsCache = createCache({ ttl: 60_000, retry: 15_000, load: loadAchievements, onSettled: scheduleRender });
  const recentCache = createCache({ ttl: 10 * 60_000, retry: 60_000, load: loadRecentPlayers, onSettled: scheduleRender });
  const screenshotsCache = createCache({ ttl: 60_000, retry: 30_000, load: loadScreenshots, onSettled: scheduleRender });
  const guidesCache = createCache({ ttl: 30 * 60_000, retry: 2 * 60_000, load: loadGuides, onSettled: scheduleRender });
  const newsCache = createCache({ ttl: 30 * 60_000, retry: 2 * 60_000, load: loadNews, onSettled: scheduleRender });
  // `loadNotes` is defined further down; resolve it at call time.
  const caches = [achievementsCache, recentCache, screenshotsCache, guidesCache, newsCache];

  const setStat = (cell, minutes) => {
    const { value, unit } = duration(minutes);
    const [b, small] = cell.querySelector('.se-ov-stat-value').children;
    if (b.textContent !== value) b.textContent = value;
    if (small.textContent !== unit) small.textContent = unit;
  };

  // Rebuild a section's body only when what it shows has changed, so the
  // 1s poll never touches the DOM in the steady state.
  const commit = (part, visible, signature, fill) => {
    part.section.hidden = !visible;
    if (!visible || part.signature === signature) return;
    part.signature = signature;
    part.body.replaceChildren();
    fill(part.body);
  };

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const formatDate = (seconds) => (seconds > 0 ? dateFormat.format(seconds * 1000) : '');

  const renderAchievements = (part, appid) => {
    const store = appid ? resolveAchievementStore() : null;
    const data = !appid ? null : store ? achievementsFromStore(store, appid) : achievementsCache.get(appid);
    if (data !== undefined) live.achData = data;
    const visible = !!data && data.total > 0;
    const signature = visible ? JSON.stringify([data.unlocked, data.total, data.rows]) : '';
    commit(part, visible, signature, (body) => {
      setText(part.meta, `${data.unlocked} / ${data.total}`);
      const list = el('ul', 'se-ov-ach-list');
      for (const row of data.rows) {
        const item = el('li', 'se-ov-ach');
        // Name and count share a line, so every bar spans the same width.
        const line = el('div', 'se-ov-ach-line');
        line.append(
          el('span', 'se-ov-ach-name', row.name),
          el(
            'span',
            'se-ov-ach-count',
            row.unlockedAt ? formatDate(row.unlockedAt) : `${row.current.toLocaleString()}/${row.max.toLocaleString()}`
          )
        );
        const text = el('div', 'se-ov-ach-text');
        text.append(line);
        if (!row.unlockedAt) text.append(buildBar(row.ratio));
        item.append(achIcon('se-ov-ach-icon', row, !!row.unlockedAt), text);
        list.append(item);
      }
      body.append(buildBar(data.unlocked / data.total));
      if (data.rows.length) body.append(list);
    });
  };

  // Avatar geometry, matching `.se-ov-avatar` and `.se-ov-avatars` in overlay.css.
  const AVATAR = Object.freeze({ size: 34, gap: 12, inset: 8, rows: 2 });

  // As many avatars as fit in two rows of the column. In-game friends come
  // first, then a divider and the recent ones; the rest fold into "+N".
  const renderFriends = (part, inGame, recent, width) => {
    const total = inGame.length + recent.length;
    const perRow = Math.max(1, Math.floor((width - AVATAR.inset + AVATAR.gap) / (AVATAR.size + AVATAR.gap)));
    // In-game friends lead (green ring); no divider, so both rows share columns.
    let capacity = perRow * AVATAR.rows;
    if (total > capacity) capacity -= 1;
    const shownIn = inGame.slice(0, capacity);
    const shownRecent = recent.slice(0, Math.max(0, capacity - shownIn.length));
    const more = total - shownIn.length - shownRecent.length;

    const visible = total > 0;
    const signature = visible ? JSON.stringify([shownIn, shownRecent, more, inGame.length, recent.length]) : '';
    commit(part, visible, signature, (body) => {
      setText(
        part.meta,
        [inGame.length && `${inGame.length} in-game`, recent.length && `${recent.length} recent`].filter(Boolean).join(' · ')
      );
      const row = el('div', 'se-ov-avatars');
      const avatar = (friend) => {
        const node = button('se-ov-avatar', { steamid: friend.steamid, status: friend.status });
        if (friend.away) node.dataset.away = '';
        node.title = friend.name;
        node.setAttribute('aria-label', friend.name);
        node.append(img(null, friend.avatar));
        return node;
      };
      row.append(...shownIn.map(avatar));
      row.append(...shownRecent.map(avatar));
      if (more > 0) row.append(el('span', 'se-ov-avatar se-ov-avatar-more', `+${more}`));
      body.append(row);
    });
  };

  const renderScreenshots = (part, data) => {
    const visible = !!data?.shots.length;
    const signature = visible ? JSON.stringify(data) : '';
    commit(part, visible, signature, (body) => {
      const grid = el('div', 'se-ov-shots');
      for (const shot of data.shots) {
        const tile = button('se-ov-shot', { widget: 'Screenshots' });
        tile.setAttribute('aria-label', `Screenshot from ${formatDate(shot.created)}`);
        tile.append(img(null, shot.url));
        grid.append(tile);
      }
      body.append(grid);
    });
  };

  const renderGuides = (part, appid, guides) => {
    const visible = !!guides?.length;
    const signature = visible ? JSON.stringify([appid, guides]) : '';
    commit(part, visible, signature, (body) => {
      part.head.querySelector('.se-ov-sec-link').dataset.url = GUIDES_URL(appid);
      const list = el('ul', 'se-ov-guides');
      for (const guide of guides) {
        const item = el('li');
        const row = button('se-ov-guide', { url: GUIDE_URL + guide.id, fav: String(guide.favorite) });
        const icon = el('span', 'se-ov-guide-icon');
        icon.innerHTML = guide.favorite ? ICON.star : ICON.open;
        row.title = guide.title;
        row.append(icon, el('span', 'se-ov-guide-title', guide.title));
        item.append(row);
        list.append(item);
      }
      body.append(list);
    });
  };

  // The newest post as a featured card with its capsule, the rest as rows.
  const renderNews = (part, appid, news) => {
    const visible = !!news?.length;
    const signature = visible ? JSON.stringify([appid, news]) : '';
    commit(part, visible, signature, (body) => {
      part.head.querySelector('.se-ov-sec-link').dataset.url = NEWS_URL(appid);
      const [lead, ...rest] = news;
      const featured = button('se-ov-news-lead', { url: lead.url });
      featured.append(img('se-ov-news-art', lead.image || HEADER_ART(appid)));
      const kicker = [lead.label, formatDate(lead.time)].filter(Boolean).join(' · ');
      featured.append(el('span', 'se-ov-news-kicker', kicker), el('span', 'se-ov-news-title', lead.title));
      body.append(featured);
      for (const item of rest) {
        const row = button('se-ov-news-row', { url: item.url });
        row.title = item.title;
        const thumb = el('span', 'se-ov-news-thumb');
        if (item.image) thumb.append(img(null, item.image));
        row.append(thumb, el('span', 'se-ov-news-row-title', item.title), el('span', 'se-ov-news-date', formatDate(item.time)));
        body.append(row);
      }
    });
  };

  /* ---------- Views ---------- */

  const VIEWS = Object.freeze([
    { id: 'overview', label: 'Overview' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'friends', label: 'Friends' },
    { id: 'remote', label: 'Remote Play Together' },
    { id: 'notes', label: 'Notes' },
    { id: 'controller', label: 'Controller' },
    { id: 'browser', label: 'Browser' },
    { id: 'settings', label: 'Settings' },
  ]);

  const renderTabs = (tabs, notes) => {
    for (const [id, { tab }] of tabs.tabs) {
      tab.setAttribute('aria-pressed', String(id === live.view));
      tab.hidden = id === 'achievements' && !live.achData?.total;
    }
    const current = VIEWS.find(({ id }) => id === live.view);
    setText(tabs.title, current.label);
    setText(tabs.note, notes[live.view] || '');
    tabs.rail.dataset.view = live.view;
  };

  /* ---------- Timer ---------- */

  // A stopwatch kept across overlay openings and restarts (localStorage).
  const TIMER_KEY = 'se-overlay-timer';
  const timer = (() => {
    const read = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(TIMER_KEY));
        if (saved && typeof saved === 'object') return { start: Number(saved.start) || 0, acc: Number(saved.acc) || 0 };
      } catch {}
      return { start: 0, acc: 0 };
    };
    let state = read();
    const save = () => {
      try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(state));
      } catch {}
      scheduleRender();
    };
    return {
      running: () => state.start > 0,
      elapsed: () => state.acc + (state.start ? Date.now() - state.start : 0),
      start() {
        if (!state.start) (state = { ...state, start: Date.now() }), save();
      },
      pause() {
        if (state.start) (state = { start: 0, acc: state.acc + Date.now() - state.start }), save();
      },
      reset() {
        state = { start: 0, acc: 0 };
        save();
      },
    };
  })();

  const clockText = (ms) => {
    const total = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  };

  const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const renderTime = (part) => {
    const elapsed = timer.elapsed();
    const running = timer.running();
    const mode = running ? 'running' : elapsed > 0 ? 'paused' : 'clock';
    if (mode === 'clock') {
      const parts = clockFormat.formatToParts(new Date());
      setText(part.b, parts.filter(x => x.type !== 'dayPeriod').map(x => x.value).join('').trim());
      setText(part.small, parts.find(x => x.type === 'dayPeriod')?.value || '');
      setText(part.label, dayFormat.format(new Date()));
    } else {
      setText(part.b, clockText(elapsed));
      setText(part.small, '');
      setText(part.label, running ? 'Timer' : 'Timer · paused');
    }
    if (part.cell.dataset.mode === mode) return;
    part.cell.dataset.mode = mode;
    part.cell.setAttribute('aria-pressed', String(running));
    part.cell.title = {
      clock: 'Start a timer',
      running: 'Pause the timer (right-click to reset)',
      paused: 'Resume the timer (right-click to reset)',
    }[mode];
  };

  Object.assign(ns, { VIEWS, achievementsCache, caches, formatDate, guidesCache, newsCache, recentCache, renderAchievements, renderFriends, renderGuides, renderNews, renderScreenshots, renderTabs, renderTime, scheduleRender, screenshotsCache, setStat, setText, timer });
})(window.__se);
