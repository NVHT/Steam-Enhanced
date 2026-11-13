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
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, esc, mark, unmark, fiber: fiberOf, props: propsOf, fromProps, cssVar: setVar } = SE;
  window.__steamEnhancedGamePage?.destroy();

  let observer;
  let frame = 0;
  let hltb;
  /*
   * Class names of everything this module inserts. destroy() finds the nodes by class, so
   * nothing here holds a node after Steam unmounts it (a Set of nodes kept whole detached
   * sections and their fibers alive).
   */
  const ownClasses = new Set(['se-ach-fx', 'se-ach-clone']);

  const srcOf = (img) => img.currentSrc || img.getAttribute('src') || '';
  const own = (tag, className) => {
    const el = document.createElement(tag);
    el.className = className;
    ownClasses.add(className.split(' ')[0]);
    return el;
  };
  const drop = (el) => el?.remove();

  function parseCount(text) {
    const m = String(text || '').match(/(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/);
    return m ? [parseInt(m[1].replace(/\D/g, ''), 10), Math.max(1, parseInt(m[2].replace(/\D/g, ''), 10))] : null;
  }

  // Formatters are costly to build; one of each, created on first use.
  const formatters = new Map();
  const formatTime = (rt, opts) => {
    const key = JSON.stringify(opts);
    try {
      if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(undefined, opts));
      return formatters.get(key).format(new Date(rt * 1000));
    } catch (_) {
      return '';
    }
  };
  const DAY = { year: 'numeric', month: 'short', day: 'numeric' };
  const when = (rt) => formatTime(rt, { ...DAY, hour: 'numeric', minute: 'numeric' });
  const day = (rt) => formatTime(rt, DAY);

  function sharedParent(a, b, stop) {
    while (a.parentElement && a.parentElement !== stop && !a.parentElement.contains(b)) {
      a = a.parentElement;
    }
    const p = a.parentElement;
    return p && p !== stop ? p : null;
  }

  function placePopup(pop, anchor) {
    const doc = anchor.ownerDocument;
    // Re-appending an existing child is still a body mutation (and a full update pass).
    if (pop.parentNode !== doc.body) doc.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const t = pop.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    pop.style.left = `${Math.max(8, Math.min(vw - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
    pop.style.top = `${top}px`;
    pop.dataset.on = '';
  }

  const steamClient = () =>
    SE.global('SteamClient', (sc) => typeof sc?.Apps?.GetMyAchievementsForApp === 'function');

  const CONTAINER = `.${C.ColumnContainer_Container}`;
  const COLUMNS = `:scope > .${C.ColumnContainer}`;
  const RIGHT = `.${C.RightColumn}`;
  const LEFT = `.${C.LeftColumn}`;
  const SEEK = C.SeekTarget;
  const CONTROLLER = `.${C.ControllerSectionBody}, .${C.ControllerSupportSectionHeader}`;
  const HEADING = `.${C.SectionHeader}`;
  const BODY = `:is(.${C.Body}, .Body)`;
  const RIGHT_CONTROLS = `.${C.RightControls}`;
  const APP_BUTTONS = `.${C.AppButtonsContainer}`;
  const ASSOCIATION = `.${C.ConciseContainer_Container} .${C.Association}`;
  const NAME = `.${C.ConciseContainer_Name}`;

  const NAMES = new Set([
    'friends',
    'additionalcontent',
    'achievements',
    'notes',
    'cards',
    'dlc',
    'workshop',
    'screenshots',
    'review',
    'activityrollup',
    'activity',
    'community',
  ]);

  const sectionName = (el) =>
    fromProps(el, 6, (p) => (typeof p.name === 'string' && NAMES.has(p.name) ? p.name : null));

  function tagSections(c) {
    const cols = c.querySelector(COLUMNS);
    if (!cols) return;
    for (const [col, side] of [
      [cols.querySelector(`:scope > ${RIGHT}`), 'right'],
      [cols.querySelector(`:scope > ${LEFT}`), 'left'],
    ]) {
      if (!col) continue;
      for (const el of col.children) {
        const seek = el.classList.contains(SEEK);
        const name = seek
          ? sectionName(el)
          : side === 'left'
            ? 'notice'
            : el.querySelector(CONTROLLER)
              ? 'controller'
              : 'mastersubincluded';
        if (name) mark(el, 'data-se-sec', name);
        else unmark(el, 'data-se-sec');
      }
    }
  }

  const ROW = 1;
  const GAP = 16;
  let sizer;
  let fitQueued = 0;
  const sized = new Set();

  function pieces(c) {
    const out = [];
    const info = c.querySelector(
      `:scope > .${C.AppGameInfoContainer} > .${C.ConciseContainer_Container} > .${C.InnerContainer}`
    );
    if (info) out.push(...info.children);
    const cols = c.querySelector(COLUMNS);
    if (cols) {
      for (const el of cols.children) {
        if (el.matches(`${RIGHT}, ${LEFT}`)) out.push(...el.children);
        else out.push(el);
      }
    }
    out.push(...c.querySelectorAll(':scope > .se-hltb-card'));
    return out;
  }

  function fit() {
    fitQueued = 0;
    const c = document.querySelector(CONTAINER);
    if (!c) return;
    // Batch DOM geometry reads before writing custom properties to avoid layout thrashing.
    const spans = pieces(c).map((el) => [el, el.getBoundingClientRect().height]);
    for (const [el, h] of spans) {
      setVar(el, '--se-span', String(h > 0 ? Math.ceil((h + GAP) / ROW) : 1));
    }
  }

  // Sizes change only through the ResizeObserver (it also reports each piece once on observe).
  function placeSpans(c) {
    if (!sizer) {
      sizer = new ResizeObserver(() => {
        if (!fitQueued) fitQueued = requestAnimationFrame(fit);
      });
    }
    for (const el of sized) {
      if (!el.isConnected) {
        sizer.unobserve(el);
        sized.delete(el);
      }
    }
    for (const el of pieces(c)) {
      if (!sized.has(el)) {
        sized.add(el);
        sizer.observe(el);
      }
    }
  }

  function layout() {
    for (const c of document.querySelectorAll(CONTAINER)) {
      if (!c.querySelector(COLUMNS)) continue;
      for (const step of [tagSections, hltb?.place, placeSpans]) {
        try {
          step?.(c);
        } catch (_) {}
      }
    }
  }

  function placeAchRings() {
    for (const el of document.querySelectorAll(`.${C.InPage} .${C.MiniAchievements}`)) {
      const n = parseCount(el.querySelector(`.${C.AchievementCountLabel}`)?.textContent);
      setVar(el, '--se-pct', String(n ? Math.round((100 * n[0]) / n[1]) : 0));
    }
    for (const el of document.querySelectorAll(`.${C.HighlightDiv}`)) {
      const n = parseCount(el.querySelector(`.${C.UnlockedLabel}`)?.textContent);
      if (!n) continue;
      setVar(el, '--se-pct', String(Math.min(100, Math.round((100 * n[0]) / n[1]))));
      mark(el, 'data-se-count', `${n[0]}/${n[1]}`);
    }
  }

  /* ---------- Rarity tiers ---------- */

  // Tier by global unlock rate (flAchieved: % of players), shared with the toasts (SE.rarity in core.js).
  const { TIERS, tierOf, fmtPct } = SE.rarity;

  // One sparkle per tier rank (unlocked only) and the tier's initial (SE.rarity.fx).
  const tierFx = SE.rarity.fx;

  function decorateTier(el, a) {
    const t = tierOf(a?.flAchieved);
    const sig = t ? `${t.id}:${a.locked ? 1 : 0}` : '';
    const fx = el.querySelector(':scope > .se-ach-fx');
    if (el.__seTier === sig && Boolean(fx) === Boolean(t)) return;
    el.__seTier = sig;
    drop(fx);
    if (!t) {
      unmark(el, 'data-se-tier');
      unmark(el, 'data-se-tier-locked');
      return;
    }
    mark(el, 'data-se-tier', t.id);
    if (a.locked) mark(el, 'data-se-tier-locked');
    else unmark(el, 'data-se-tier-locked');
    el.appendChild(tierFx(t, a.locked));
  }

  function toAch(a, locked, prog) {
    const hide = locked && a.hidden;
    const pct = [a.global_achieved_percent, a.flAchieved, a.percent, a.unlock_percent].find(
      (v) => typeof v === 'number'
    );
    return {
      name: hide ? 'Hidden achievement' : a.name || a.api_name || '',
      description: hide ? '' : a.description || a.desc || '',
      icon: hide ? '' : (locked ? a.icon_unachieved : a.icon_achieved) || a.icon_achieved || '',
      id: a.api_name || a.internal_name || a.strID || '',
      flAchieved: pct,
      hidden: hide,
      locked,
      rt: (prog && a.internal_key !== undefined && prog[a.internal_key]?.unlock_time) || 0,
    };
  }

  let tip = null;

  function showTip(host, anchor = host) {
    const a = host.__seAch;
    if (!a) return;
    const pct = typeof a.flAchieved === 'number' ? a.flAchieved : NaN;
    const tier = tierOf(pct);
    if (!tip) tip = own('div', 'se-ach-tip');
    const img = a.icon ? `<img src="${esc(a.icon)}" alt="">` : '<span class="se-ach-q">?</span>';
    const whenStr = a.locked ? 'Locked' : a.rt ? `Unlocked ${esc(when(a.rt))}` : 'Unlocked';
    tip.innerHTML =
      `<div class="se-ach-tip-main"><div class="se-ach-tip-ico${a.locked ? ' se-locked' : ''}">${img}</div>` +
      `<div class="se-ach-tip-text"><div class="se-ach-tip-name">${esc(a.name)}</div>${a.description ? `<div class="se-ach-tip-desc">${esc(a.description)}</div>` : ''}</div></div>` +
      `<div class="se-ach-tip-info"><div class="se-ach-tip-when">${whenStr}</div>` +
      (tier
        ? `<div class="se-ach-tip-pct" data-se-tier="${tier.id}">${tier.name} · ${esc(fmtPct(pct))}% of players</div>`
        : '') +
      '</div>';
    tip.toggleAttribute('data-locked', Boolean(a.locked));
    placePopup(tip, anchor);
  }

  const hideTip = () => tip?.removeAttribute('data-on');

  function withTip(el, anchor) {
    el.addEventListener('mouseenter', () => showTip(el, anchor?.() || el));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focusin', () => showTip(el, anchor?.() || el));
    el.addEventListener('focusout', hideTip);
  }

  const ACH_ROW = `.${C.IconRow}`;
  const ACH_ITEM = `.${C.ItemWrapper}`;
  const ACH_LOCKED = `.${C.UnachievedSection}`;
  // Steam draws achievement icons with two components: the legacy one (activity feed) and the
  // current one (card rows, latest unlock). The current one takes the rate as a separate prop.
  const ICON_WRAP = `:is(.${C.AchievementIconWrapper}, .${C.HiddenLabel_AchievementIconWrapper})`;

  const rowList = (row, locked) =>
    fromProps(row, 30, (p) => {
      const l = p.achievements;
      if (
        !Array.isArray(l) ||
        !l.length ||
        typeof l[0] !== 'object' ||
        !('icon_achieved' in l[0] || 'icon_unachieved' in l[0])
      ) {
        return null;
      }
      return l.map((a) => toAch(a, locked, p.progress?.achievements));
    });

  const fiberAppId = (el) =>
    fromProps(el, 120, (p) =>
      [
        p.overview?.appid,
        p.appid,
        p.appId,
        p.unAppID,
        p.nAppID,
        p.app?.appid,
        p.details?.unAppID,
        p.appDetails?.unAppID,
        p.appOverview?.appid,
      ].find((v) => typeof v === 'number' && v > 0)
    );

  /*
   * A 120-deep fiber walk per card on every pass adds up, so the answer is kept per element
   * for as long as the route names the same app (switching games changes the route; React
   * may reuse the same nodes for the next game).
   */
  const appIds = new WeakMap();
  const topChecked = new WeakSet(); // per instance, so a hot reload re-checks every wrapper
  const appIdOf = (el) => {
    const route = location.href;
    const routeId = +(route.match(/\/app\/(\d+)/) || [])[1] || 0;
    const hit = appIds.get(el);
    if (routeId && hit?.route === route) return hit.id;
    const fromFiber = fiberAppId(el);
    const id = fromFiber || routeId;
    // Cache only an answer the route agrees with: a reused node can still hold the last game.
    if (routeId && fromFiber === routeId) appIds.set(el, { route, id });
    return id;
  };

  // One fetch of the player's achievements per app, shared by the icon rows and the banner.
  // Re-fetched when the card's "x/y" label changes (a new unlock).
  const asked = new Map();

  function digest(all) {
    const to = (a) => ({
      id: a.strID || '',
      name: a.strName || a.strID || '',
      description: a.strDescription || '',
      icon: a.strImage || '',
      flAchieved: a.flAchieved,
      rt: a.rtUnlocked || 0,
      hidden: Boolean(a.bHidden),
      locked: !a.bAchieved,
    });
    const unlocked = all
      .filter((a) => a.bAchieved)
      .map(to)
      .sort((a, b) => b.rt - a.rt);
    const locked = all
      .filter((a) => !a.bAchieved)
      .map(to)
      .sort((a, b) => a.hidden - b.hidden || (b.flAchieved || 0) - (a.flAchieved || 0));

    const tiers = TIERS.map((t) => ({ ...t, got: 0, total: 0 }));
    for (const a of [...unlocked, ...locked]) {
      const t = tierOf(a.flAchieved);
      if (!t) continue;
      const slot = tiers[TIERS.indexOf(t)];
      slot.total++;
      if (!a.locked) slot.got++;
    }
    const times = unlocked.map((a) => a.rt).filter((rt) => rt > 0);
    const rarest = unlocked
      .filter((a) => tierOf(a.flAchieved))
      .reduce((best, a) => (!best || a.flAchieved < best.flAchieved ? a : best), null);

    return {
      unlocked,
      locked,
      pct: new Map(all.map((a) => [a.strID, a.flAchieved])),
      summary: {
        got: unlocked.length,
        total: all.length,
        tiers,
        first: times.length ? Math.min(...times) : 0,
        last: times.length ? Math.max(...times) : 0,
        rarest,
        remaining: locked,
      },
    };
  }

  const ASKED_MAX = 40;

  function achData(appid, key) {
    const sc = steamClient();
    if (!appid || !sc) return null;
    const had = asked.get(appid);
    if (had && had.key === key) return had.data;
    const entry = { key, data: had?.data || null };
    asked.delete(appid);
    asked.set(appid, entry);
    if (asked.size > ASKED_MAX) asked.delete(asked.keys().next().value);

    Promise.resolve(sc.Apps.GetMyAchievementsForApp(String(appid)))
      .then((r) => {
        if (typeof r === 'string') r = JSON.parse(r);
        const all = r?.data?.rgAchievements;
        if (r?.result !== 1 || !Array.isArray(all)) return;
        entry.data = digest(all);
        schedule();
      })
      .catch(() => {});

    return entry.data;
  }

  const unlockedKey = (el) =>
    el
      .closest('[data-se-sec="achievements"]')
      ?.querySelector(`.${C.UnlockedLabel}`)
      ?.textContent.replace(/\s+/g, ' ') || '';

  const clientLists = (row) => achData(appIdOf(row), unlockedKey(row));

  /*
   * Steam's achievement objects no longer carry the global unlock rate (the row fetches it on
   * its own), so missing rates come from the player's achievement data, matched by API name.
   * Returns how many entries have a rate, which re-keys a row once the data arrives.
   */
  function withRates(list, el) {
    let rated = 0;
    let rates;
    for (const a of list) {
      if (typeof a.flAchieved !== 'number' && a.id) {
        rates ??= clientLists(el)?.pct || null;
        const pct = rates?.get(a.id);
        if (typeof pct === 'number') a.flAchieved = pct;
      }
      if (typeof a.flAchieved === 'number') rated++;
    }
    return rated;
  }

  // The unlocked row leaves out what the card already features (the latest unlock).
  function withoutFeatured(list, row) {
    const sec = row.closest('[data-se-sec="achievements"]');
    const names = new Set();
    for (const n of sec?.querySelectorAll(
      `.${C.Featured}:not(.${C.Featured_RemainderContainer}) .${C.Featured_Name}`
    ) || []) {
      names.add(n.textContent.trim());
    }
    return names.size ? list.filter((a) => !names.has(a.name.trim())) : list;
  }

  const achRows = new Map();
  let achSizer;
  const ICON = 52;
  const ICON_GAP = 12;

  function fillAchRow(mine) {
    const list = mine.__seList || [];
    const w = mine.clientWidth;
    if (!w) return;
    const fits = Math.max(1, Math.floor((w + ICON_GAP) / (ICON + ICON_GAP)));
    const n = list.length > fits ? fits - 1 : list.length;
    const key = `${n}/${list.length}/${mine.__seSig}`;
    if (mine.dataset.seKey === key) return;
    mine.dataset.seKey = key;
    mine.textContent = '';

    const steam = mine.__seSteam;
    // Clicks go to Steam's own row (hidden, still mounted), which opens the achievements page.
    const openSteam = () => steam.querySelector(`${ACH_ITEM} [role="link"], ${ACH_ITEM}, ${ICON_WRAP}`)?.click();
    for (const a of list.slice(0, n)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'se-ach-ico';
      b.__seAch = a;
      b.setAttribute('aria-label', a.name);
      b.innerHTML = a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy">` : '<span class="se-ach-q">?</span>';
      decorateTier(b, a);
      const tier = tierOf(a.flAchieved);
      if (tier) b.setAttribute('aria-label', `${a.name}, ${tier.name}`);
      withTip(b);
      b.addEventListener('click', openSteam);
      mine.appendChild(b);
    }
    if (n < list.length) {
      const m = document.createElement('button');
      m.type = 'button';
      m.className = 'se-ach-more';
      m.textContent = `+${list.length - n}`;
      m.addEventListener('click', () => {
        const more = steam.querySelector(`.${C.Featured_RemainderContainer}`) || steam.lastElementChild;
        if (more) more.click();
        else openSteam();
      });
      mine.appendChild(m);
    }
  }

  function placeAchIcons() {
    const live = new Set();
    for (const row of document.querySelectorAll(`[data-se-sec="achievements"] ${ACH_ROW}`)) {
      const locked = Boolean(row.closest(ACH_LOCKED));
      let list = rowList(row, locked);
      if (!list?.length) {
        const api = clientLists(row);
        list = api && (locked ? api.locked : api.unlocked);
      }
      if (!locked && list?.length) list = withoutFeatured(list, row);
      let mine = achRows.get(row);
      if (!list?.length) {
        if (mine) dropAchRow(row, mine);
        unmark(row, 'data-se-replaced');
        continue;
      }
      live.add(row);
      if (!mine) {
        mine = own('div', 'se-ach-row');
        if (locked) mine.dataset.locked = '';
        achRows.set(row, mine);
        if (!achSizer) {
          achSizer = new ResizeObserver((es) => {
            for (const e of es) fillAchRow(e.target);
          });
        }
        achSizer.observe(mine);
      }
      mine.__seList = list;
      mine.__seSteam = row;
      mine.__seSig = `${list.length}:${list[0]?.name || ''}:${withRates(list, row)}`;
      if (row.nextElementSibling !== mine) row.after(mine);
      mark(row, 'data-se-replaced');
      fillAchRow(mine);
    }
    for (const [row, mine] of achRows) {
      if (!live.has(row) || !row.isConnected) dropAchRow(row, mine);
    }
  }

  function dropAchRow(row, mine) {
    achSizer?.unobserve(mine);
    drop(mine);
    achRows.delete(row);
  }

  /* ---------- Progress banner ---------- */

  // Replaces Steam's ring + bar with one banner: "In progress" while unlocking, "Mastered" at 100%.
  const CUP = 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4';
  const BLUE = [124, 196, 255]; // --se-accent
  const GOLD = [240, 192, 96]; // --se-gold

  // Theme blue while in progress, easing into gold as the game nears 100%.
  const bannerAccent = (t) => {
    const k = Math.min(1, Math.max(0, t)) ** 3;
    return `rgb(${BLUE.map((b, i) => Math.round(b + (GOLD[i] - b) * k)).join(', ')})`;
  };

  function listOf(parts) {
    try {
      return new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(parts);
    } catch (_) {
      return parts.join(', ');
    }
  }

  function bannerText(s) {
    const left = s.total - s.got;
    if (!left) {
      const when = s.last ? `Completed ${day(s.last)}` : 'Completed';
      const days = s.first && s.last ? Math.round((s.last - s.first) / 86400) : 0;
      return {
        eyebrow: 'Mastered',
        title: `All ${s.total} achievements unlocked`,
        sub: days > 0 ? `${when} · ${days} day${days === 1 ? '' : 's'} after your first unlock` : when,
      };
    }
    const pct = Math.floor((100 * s.got) / s.total);
    const stage = left <= 3 ? 'Almost there' : pct < 25 ? 'Just started' : 'In progress';
    let sub = `${left} to go`;
    if (left <= 3) {
      const named = s.remaining.filter((a) => !a.hidden).map((a) => a.name);
      const hidden = s.remaining.length - named.length;
      if (hidden) named.push(hidden === 1 ? 'a hidden achievement' : `${hidden} hidden achievements`);
      sub += `: ${listOf(named)}`;
    } else if (s.rarest) {
      sub += ` · Rarest so far: ${s.rarest.name}, ${fmtPct(s.rarest.flAchieved)}% of players`;
    } else if (!s.got) {
      sub += ' · Nothing unlocked yet';
    }
    return { eyebrow: `${stage} · ${pct}%`, title: `${s.got} of ${s.total} achievements unlocked`, sub };
  }

  function bannerHtml(s, done) {
    const { eyebrow, title, sub } = bannerText(s);
    const chips = s.tiers
      .filter((t) => t.total)
      .map(
        (t) =>
          `<span class="se-ach-banner-chip" data-se-tier="${t.id}"${t.got === t.total ? ' data-full' : ''} ` +
          `title="${t.name}: ${t.got} of ${t.total}">` +
          `<span class="se-ach-banner-count"><b>${t.name[0]}</b>${t.got}<small>/${t.total}</small></span>` +
          `<span class="se-ach-banner-meter"><span style="width: ${((100 * t.got) / t.total).toFixed(1)}%"></span></span>` +
          '</span>'
      )
      .join('');
    return (
      '<span class="se-ach-banner-emblem" aria-hidden="true">' +
      `<svg viewBox="0 0 24 24"><path d="${CUP}"/></svg>` +
      (done ? '<i class="se-ach-spark"></i>'.repeat(4) : '') +
      '</span>' +
      '<div class="se-ach-banner-text">' +
      `<span class="se-ach-banner-eyebrow">${esc(eyebrow)}</span>` +
      `<span class="se-ach-banner-title">${esc(title)}</span>` +
      `<span class="se-ach-banner-sub">${esc(sub)}</span>` +
      '</div>' +
      (chips ? `<div class="se-ach-banner-tiers">${chips}</div>` : '')
    );
  }

  const banners = new Map();
  // Card bodies laid out as [banner | latest unlock] over the icon rows, so a stale one can be reset.
  const leadBodies = new Set();

  // The latest unlock (Steam features one, or two when exactly two are unlocked).
  const leadOf = (sec) => sec?.querySelector(`.${C.Featured}:not(.${C.Featured_RemainderContainer})`) || null;

  function setLead(body, lead) {
    for (const el of body ? body.querySelectorAll(':scope > [data-se-ach-lead]') : []) {
      if (el !== lead) unmark(el, 'data-se-ach-lead');
    }
    if (body && lead) {
      mark(body, 'data-se-ach-body');
      mark(lead, 'data-se-ach-lead');
      leadBodies.add(body);
    }
  }

  function placeAchBanner() {
    const live = new Set();
    const liveBodies = new Set();
    for (const hl of document.querySelectorAll(`[data-se-sec="achievements"] .${C.HighlightDiv}`)) {
      const s = achData(appIdOf(hl), unlockedKey(hl))?.summary;
      let el = banners.get(hl);
      if (!s?.total) {
        if (el) {
          drop(el);
          banners.delete(hl);
        }
        unmark(hl, 'data-se-replaced');
        continue;
      }
      live.add(hl);
      if (!el) {
        el = own('div', 'se-ach-banner');
        el.setAttribute('role', 'group');
        banners.set(hl, el);
      }
      const done = s.got === s.total;
      const sig = `${s.got}/${s.total}/${s.last}`;
      if (el.__seSig !== sig) {
        el.__seSig = sig;
        el.toggleAttribute('data-done', done);
        el.setAttribute('aria-label', `Achievements: ${s.got} of ${s.total} unlocked`);
        el.style.setProperty('--se-banner', done ? 'var(--se-gold, #f0c060)' : bannerAccent(s.got / s.total));
        el.style.setProperty('--se-pct', ((100 * s.got) / s.total).toFixed(1));
        el.innerHTML = bannerHtml(s, done);
      }
      const lead = leadOf(hl.closest('[data-se-sec="achievements"]'));
      const anchor = lead || hl;
      if (anchor.previousElementSibling !== el) anchor.before(el);
      if (lead) {
        setLead(lead.parentElement, lead);
        liveBodies.add(lead.parentElement);
      }
      mark(hl, 'data-se-replaced');
    }
    for (const [hl, el] of banners) {
      if (!live.has(hl) || !hl.isConnected) {
        drop(el);
        banners.delete(hl);
      }
    }
    for (const body of leadBodies) {
      if (liveBodies.has(body) && body.isConnected) continue;
      setLead(body, null);
      unmark(body, 'data-se-ach-body');
      leadBodies.delete(body);
    }
  }

  /*
   * The latest-unlock card beside the banner: an eyebrow above the name and the tier, rarity
   * and unlock date below the description. The card takes the tier's color (--se-tier).
   */
  function decorateLead(card, a) {
    const tier = tierOf(a.flAchieved);
    if (tier) mark(card, 'data-se-tier', tier.id);
    else unmark(card, 'data-se-tier');

    const name = card.querySelector(`.${C.Featured_Name}`);
    const text = name?.parentElement;
    if (!text) return;
    const meta = [tier && `${tier.name} · ${fmtPct(a.flAchieved)}% of players`, a.rt && `Unlocked ${day(a.rt)}`]
      .filter(Boolean)
      .join(' · ');

    let eyebrow = text.querySelector(':scope > .se-ach-lead-eyebrow');
    if (!eyebrow) {
      eyebrow = own('span', 'se-ach-lead-eyebrow');
      eyebrow.textContent = 'Latest unlock';
    }
    if (text.firstElementChild !== eyebrow) text.prepend(eyebrow);

    let line = text.querySelector(':scope > .se-ach-lead-meta');
    if (!meta) {
      drop(line);
      return;
    }
    if (!line) line = own('span', 'se-ach-lead-meta');
    if (line.textContent !== meta) line.textContent = meta;
    if (text.lastElementChild !== line) text.append(line);
  }

  const noop = () => {};
  noop.__se = true;
  const tipHosts = new Set();
  let muteAll = null;

  function muteHost(h) {
    const p = propsOf(h);
    if (p) {
      for (const k of ['onMouseEnter', 'onPointerEnter']) {
        if (typeof p[k] === 'function' && !p[k].__se) p[k] = noop;
      }
    }
  }

  function featuredData(icon, host) {
    const clone = icon.closest('.se-ach-clone');
    if (clone?.__seAch) return clone.__seAch;
    const isA = (x) =>
      x &&
      typeof x === 'object' &&
      (typeof x.name === 'string' || typeof x.strName === 'string' || 'icon_achieved' in x);

    for (const start of [icon, host]) {
      const found = fromProps(start, 25, (p) => {
        const tc = p.toolTipContent?.props;
        const x = isA(tc?.achievement) ? tc.achievement : isA(p.achievement) ? p.achievement : null;
        if (!x) return null;
        // The current icon component gets the global rate beside the achievement, not on it.
        return { x, prog: tc && tc.achievement === x ? tc.progress : p.progress, rate: p.globalUnlockPercentage };
      });
      if (!found) continue;
      const { x, prog, rate } = found;
      const out = toAch(
        {
          ...x,
          name: x.name ?? x.strName,
          description: x.description ?? x.strDescription,
          icon_achieved: x.icon_achieved ?? x.strImage ?? x.icon,
        },
        false,
        prog?.achievements || (prog && x.internal_key !== undefined ? { [x.internal_key]: prog } : null)
      );
      if (!out.rt && typeof prog?.unlock_time === 'number') out.rt = prog.unlock_time;
      if (!out.rt && typeof x.rtUnlocked === 'number') out.rt = x.rtUnlocked;
      if (x.bAchieved === false) out.locked = true;
      if (!out.icon) out.icon = icon.querySelector('img')?.src || '';
      if (typeof out.flAchieved !== 'number' && typeof rate === 'number') out.flAchieved = rate;
      return out;
    }

    const scope = icon.closest('[role="link"]') || icon.closest(`.${C.Featured}`) || host.parentElement || host;
    const img = icon.querySelector('img');
    const name = scope.querySelector(`.${C.Featured_Name}`)?.textContent || img?.alt || '';
    const desc = scope.querySelector(`.${C.Desc}`)?.textContent || '';
    return name ? { name, description: desc, icon: img?.currentSrc || img?.src || '', locked: false, rt: 0 } : null;
  }

  const FEED_ACH = `:is(.${C.PrimaryAchievement}, .PrimaryAchievement)`;

  function placeAchFeatured() {
    for (const sec of document.querySelectorAll('[data-se-sec="achievements"], [data-se-sec="activity"]')) {
      const feed = sec.dataset.seSec === 'activity';
      for (const icon of sec.querySelectorAll(ICON_WRAP)) {
        if (icon.closest(`${ACH_ROW}, .se-ach-row`)) continue;
        if (feed && !icon.closest(FEED_ACH)) continue;
        let host = null;
        for (let n = icon; n && n !== sec; n = n.parentElement) {
          const p = propsOf(n);
          if (p && (p.onMouseEnter || p.onPointerEnter)) {
            host = n;
            break;
          }
        }
        host = host || icon.closest('[role="link"]') || icon;
        const a = featuredData(icon, host);
        if (!a) continue;
        if (!feed) {
          withRates([a], icon);
          decorateTier(icon, a);
          const card = icon.closest('[data-se-ach-lead]');
          if (card) decorateLead(card, a);
        }
        host.__seAch = a;
        muteHost(host);
        tipHosts.add(host);
        if (host.__seTipped) continue;
        host.__seTipped = true;
        host.addEventListener('mouseenter', () => muteHost(host));
        withTip(host, () => (icon.isConnected ? icon : host));
      }
    }
    for (const h of tipHosts) {
      if (!h.isConnected) tipHosts.delete(h);
    }
    if (!muteAll && tipHosts.size) {
      muteAll = () => {
        for (const h of tipHosts) muteHost(h);
      };
      // pointerout precedes the compat mouse events, so one listener re-mutes before either enter.
      document.addEventListener('pointerout', muteAll, true);
    }
  }

  const ACH_GRID = `:is(.${C.ActivityAchievementUnlocked}, .ActivityAchievementUnlocked)`;
  const ACH_REST = `:is(.${C.AppActivityDay_RemainderContainer}, .RemainderContainer)`;
  const ACH_NAME = `:is(.${C.Featured_Name}, .Name)`;
  const ACH_DESC = `:is(.${C.Desc}, .Desc, .Description)`;

  function placeFeedAchAll() {
    for (const grid of document.querySelectorAll(`[data-se-sec="activity"] ${ACH_GRID}`)) {
      const rest = [...grid.children].find((c) => c.querySelector(ACH_REST) || c.matches(ACH_REST));
      const list = fromProps(grid, 8, (p) => (p.event?.achievements?.length ? p.event.achievements : undefined));
      const steamTiles = [...grid.children].filter(
        (c) => !c.classList.contains('se-ach-clone') && c !== rest && (c.matches(FEED_ACH) || c.querySelector(FEED_ACH))
      );
      const extra = list ? [...list].slice(steamTiles.length) : [];
      const key = extra.map((x) => x.strID).join(',');
      if (!rest || !extra.length || !steamTiles.length) {
        grid.querySelectorAll(':scope > .se-ach-clone').forEach(drop);
        if (rest) unmark(rest, 'data-se-hidden');
        continue;
      }
      mark(rest, 'data-se-hidden');
      if (grid.__seAchKey === key && grid.querySelector(':scope > .se-ach-clone')) continue;
      grid.__seAchKey = key;
      grid.querySelectorAll(':scope > .se-ach-clone').forEach(drop);
      const tpl = steamTiles[0];
      for (const x of extra) {
        const tile = tpl.cloneNode(true);
        tile.classList.add('se-ach-clone');
        tile.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        tile.querySelectorAll('[data-se-tip], [data-se-fr-pic]').forEach((el) => {
          el.removeAttribute('data-se-tip');
          el.removeAttribute('data-se-fr-pic');
        });
        const img = tile.querySelector('img');
        if (img) {
          img.removeAttribute('srcset');
          img.src = x.strImage || '';
          img.alt = x.strName || '';
        }
        const nm = tile.querySelector(ACH_NAME);
        const ds = tile.querySelector(ACH_DESC);
        if (nm) nm.textContent = x.strName || '';
        if (ds) ds.textContent = x.strDescription || '';
        const a = toAch({ ...x, name: x.strName, description: x.strDescription, icon_achieved: x.strImage }, false, null);
        if (typeof x.rtUnlocked === 'number') a.rt = x.rtUnlocked;
        tile.__seAch = a;
        grid.insertBefore(tile, rest);
      }
    }
  }

  const LINKED = ['achievements', 'review', 'controller', 'notes', 'dlc', 'cards', 'screenshots', 'workshop'];
  const AT_FOOT = new Set(['cards', 'screenshots']);

  function mainButton(sec, head) {
    const btn = [...sec.querySelectorAll(`${BODY} > :is(.DialogButton, button):not(.se-ach-view)`)].pop() || null;
    if (sec.dataset.seSec === 'achievements') {
      return btn && btn.nextElementSibling && !btn.nextElementSibling.classList.contains('se-ach-view') ? null : btn;
    }
    return (
      btn ||
      [...sec.querySelectorAll('.DialogButton, button')]
        .filter((b) => !b.classList.contains('se-ach-view') && !head.contains(b))
        .pop() ||
      null
    );
  }

  function placeHeadingLinks() {
    for (const sec of document.querySelectorAll(LINKED.map((k) => `[data-se-sec="${k}"]`).join(', '))) {
      const head = sec.querySelector(HEADING);
      const btn = head && mainButton(sec, head);
      let link = sec.querySelector('.se-ach-view');
      if (!btn) {
        drop(link);
        continue;
      }
      if (!link) {
        link = own('button', 'se-ach-view');
        link.type = 'button';
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          link.__seBtn?.click();
        });
      }
      link.__seBtn = btn;
      const text = btn.textContent.trim();
      if (link.textContent !== text) link.textContent = text;
      const atFoot = AT_FOOT.has(sec.dataset.seSec);
      link.classList.toggle('se-link-foot', atFoot);
      if (atFoot) {
        const body = btn.closest(BODY) || btn.parentElement;
        if (link.parentElement !== body || link.nextElementSibling) body.appendChild(link);
        unmark(head, 'data-se-has-link');
      } else {
        if (link.parentElement !== head) head.appendChild(link);
        mark(head, 'data-se-has-link');
      }
      mark(btn, 'data-se-replaced');
    }
  }

  const FR_SUB = `:is(.${C.Subsection}, .Subsection)`;
  const FR_HEAD = `:is(.${C.SubsectionHeader}, .SubsectionHeader)`;
  const FR_ITEM = `:is(.${C.FriendsSection_AvatarAndLabel}, .AvatarAndLabel)`;
  const FR_INGAME = `.${C.InGame}, .InGame`;
  const FR_RECENT = `.${C.Recent}, .Recent`;
  const FR_TABS = [
    ['recent', 'Recently'],
    ['ever', 'Previously'],
    ['wishlist', 'Wishlist'],
  ];

  function frKind(sub, subs) {
    const byTag = fromProps(sub, 4, (p) => {
      const tag = p.strHeaderTag;
      if (typeof tag !== 'string') return null;
      const kind = /InGameNow/.test(tag)
        ? 'ingame'
        : /PlayedRecently/.test(tag)
          ? 'recent'
          : /Wishlist/.test(tag)
            ? 'wishlist'
            : /FriendsPlayed/.test(tag)
              ? 'ever'
              : null;
      return kind && [kind, p.cFriends];
    });
    if (byTag) return byTag;
    const n =
      parseInt((sub.querySelector(FR_HEAD)?.textContent.match(/\d[\d,.]*/) || ['0'])[0].replace(/\D/g, ''), 10) || 0;
    if (sub.matches(FR_INGAME)) return ['ingame', n];
    if (sub.matches(FR_RECENT)) return ['recent', n];
    const rest = subs.filter((x) => !x.matches(`${FR_INGAME}, ${FR_RECENT}`));
    return [
      rest.indexOf(sub) === 0 && rest.length > 1
        ? 'ever'
        : /wish/i.test(sub.textContent.slice(0, 120))
          ? 'wishlist'
          : 'ever',
      n,
    ];
  }

  function frState(pr) {
    const game = (pr.m_gameid && pr.m_gameid !== '0') || pr.m_unGamePlayedAppID > 0;
    const ps = pr.m_ePersonaState;
    return !ps && !game ? 'offline' : `${game ? 'ingame' : 'online'}${ps === 3 || ps === 4 ? '-away' : ''}`;
  }

  const emptyOf = (el) => !el.querySelector('img, svg') && !el.closest('svg') && !el.textContent.trim();

  function frMark(sub) {
    let imgs = [...sub.querySelectorAll('[data-status-position] img')].filter((i) => !/frame/i.test(i.className));
    if (!imgs.length) {
      imgs = [...sub.querySelectorAll('img')].filter(
        (i) => !/frame/i.test(i.className) && (i.width || i.getBoundingClientRect().width || 32) >= 24
      );
    }
    for (const img of imgs) {
      const av = img.closest('[data-status-position]') || img.parentElement;
      if (!av || !sub.contains(av)) continue;
      mark(img, 'data-se-fr-pic');
      mark(av, 'data-se-fr-av');
      for (const ch of av.querySelectorAll('*')) {
        if (
          ch !== img &&
          !ch.contains(img) &&
          ch.tagName !== 'IMG' &&
          !ch.querySelector('img') &&
          !ch.textContent.trim()
        ) {
          mark(ch, 'data-se-fr-status');
        }
      }
      const pr = fromProps(av, 8, (p) => p.friend?.persona) || fromProps(img, 8, (p) => p.friend?.persona);
      if (pr) mark(img, 'data-se-fr-state', frState(pr));
    }
    if (!imgs.length) return;
    const one = imgs.length === 1 && imgs[0].closest(FR_ITEM);
    const grid =
      imgs.length > 1 ? sharedParent(imgs[0], imgs[1], sub) : one && sub.contains(one) ? one.parentElement : null;
    if (!grid || grid === sub) return;
    mark(grid, 'data-se-fr-grid');

    for (let w = grid.parentElement; w && w !== sub; w = w.parentElement) mark(w, 'data-se-fr-wrap');
    for (const img of imgs) {
      for (let w = img.parentElement; w && w !== grid && grid.contains(w); w = w.parentElement) {
        mark(w, 'data-se-fr-avwrap');
      }
    }
    [...grid.children].forEach((item) => {
      for (const el of item.querySelectorAll('div, span')) {
        if (!el.hasAttribute('data-se-fr-status') && emptyOf(el)) mark(el, 'data-se-fr-status');
      }
    });
  }

  const avatarSrcs = (sub, k) =>
    [...new Set([...sub.querySelectorAll('img[data-se-fr-pic]')].map(srcOf).filter(Boolean))].slice(0, k);

  function frTabs(sec, subs, counts, tab, tabs) {
    let bar = sec.querySelector('.se-fr-tabs');
    if (tabs.length < 2) {
      drop(bar);
      return;
    }
    if (!bar) {
      bar = own('div', 'se-fr-tabs');
      bar.setAttribute('role', 'tablist');
    }
    const count = (k) => (counts[k] || 0) + (k === 'recent' ? counts.ingame || 0 : 0);
    const sig = `${tab}|${tabs.map(([k]) => k + count(k)).join(',')}`;
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      bar.textContent = '';
      for (const [k, label] of tabs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.className = 'se-fr-tab';
        b.toggleAttribute('data-on', k === tab);
        b.setAttribute('aria-selected', String(k === tab));
        b.innerHTML = `${label}<span>· ${count(k)}</span>`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          sec.dataset.seFrTab = k;
          schedule();
        });
        bar.appendChild(b);
      }
    }
    if (bar.nextElementSibling !== subs[0]) subs[0].parentElement.insertBefore(bar, subs[0]);
  }

  function frFoot(sec, subs, counts) {
    let foot = sec.querySelector('.se-fr-foot');
    if (!foot) foot = own('div', 'se-fr-foot');
    const btn = sec.querySelector(`${BODY} > :is(.DialogButton, button):last-child`);
    const stacks = [
      ['ever', 'played before'],
      ['wishlist', 'wishlisted'],
    ]
      .map(([k, words]) => [subs.find((x) => x.dataset.seFr === k), k, counts[k], words])
      .filter((x) => x[0] && x[2]);
    const sig =
      stacks.map(([sub, , n]) => `${n}:${avatarSrcs(sub, 6).join(',')}`).join('|') +
      `|${Boolean(btn)}|${btn?.textContent || ''}`;

    if (foot.dataset.sig !== sig) {
      foot.dataset.sig = sig;
      foot.textContent = '';
      for (const [sub, k, n, words] of stacks) {
        const st = document.createElement('button');
        st.type = 'button';
        st.className = 'se-fr-stack';
        st.innerHTML = `<span class="se-fr-faces">${avatarSrcs(sub, 6)
          .map((u) => `<img src="${esc(u)}" alt="">`)
          .join('')}</span><span>${n} ${words}</span>`;
        st.addEventListener('click', (e) => {
          e.stopPropagation();
          sec.dataset.seFrTab = k;
          schedule();
        });
        foot.appendChild(st);
      }
      if (btn) {
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'se-fr-all';
        a.textContent = btn.textContent.trim();
        a.addEventListener('click', (e) => {
          e.stopPropagation();
          foot.__seBtn?.click();
        });
        foot.appendChild(a);
      }
    }
    foot.__seBtn = btn;
    if (btn) mark(btn, 'data-se-replaced');
    const lastSub = subs[subs.length - 1];
    if (!foot.childElementCount) foot.remove();
    else if (lastSub.nextElementSibling !== foot) lastSub.after(foot);
  }

  function placeFriends() {
    for (const sec of document.querySelectorAll('[data-se-sec="friends"]')) {
      const subs = [...sec.querySelectorAll(FR_SUB)];
      if (!subs.length) continue;
      const counts = {};
      for (const sub of subs) {
        const [kind, n] = frKind(sub, subs);
        mark(sub, 'data-se-fr', kind);
        counts[kind] = (counts[kind] || 0) + (n || 0);
        frMark(sub);
      }
      const tabs = FR_TABS.filter(([k]) => counts[k] || (k === 'recent' && counts.ingame));
      let tab = sec.dataset.seFrTab;
      if (!tabs.some(([k]) => k === tab)) tab = tabs[0]?.[0] || 'recent';
      mark(sec, 'data-se-fr-tab', tab);
      frTabs(sec, subs, counts, tab, tabs);
      frFoot(sec, subs, counts);
    }
  }

  const LEFT_CARDS = ['dlc', 'additionalcontent', 'cards', 'screenshots', 'workshop'];
  const isWorded = (b) =>
    b.textContent.trim().length > 2 && !b.classList.contains('se-ach-view') && !b.classList.contains('se-dlc-tile');

  function placeLeftCards() {
    for (const k of LEFT_CARDS) {
      for (const sec of document.querySelectorAll(`[data-se-sec="${k}"]`)) {
        const imgs = [...sec.querySelectorAll('img')].filter(
          (i) => !i.closest('.se-dlc-grid') && (i.getBoundingClientRect().width || i.width) >= 40
        );
        if (k !== 'workshop' && k !== 'additionalcontent' && imgs.length > 1) {
          const p1 = imgs[imgs.length - 2];
          const p2 = imgs[imgs.length - 1];
          for (const old of sec.querySelectorAll('[data-se-cgrid]')) {
            if (!old.contains(p1) || !old.contains(p2)) unmark(old, 'data-se-cgrid');
          }
          const g = sharedParent(p1, p2, sec);
          if (g) mark(g, 'data-se-cgrid');
        }
        if (k === 'workshop' && imgs.length) {
          const worded = [...sec.querySelectorAll('.DialogButton, button')].filter(
            (b) => b.textContent.trim().length > 2
          );
          let a = imgs[0];
          while (
            a.parentElement &&
            a.parentElement !== sec &&
            !worded.some((b) => a.parentElement.contains(b)) &&
            !a.parentElement.querySelector(HEADING)
          ) {
            a = a.parentElement;
          }
          if (a !== sec) mark(a, 'data-se-hidden');
        }
        for (const b of sec.querySelectorAll('.DialogButton, button')) {
          if (!isWorded(b)) continue;
          mark(b, 'data-se-textbtn');
          for (let w = b.parentElement; w && w !== sec && !w.matches(BODY); w = w.parentElement) {
            mark(w, 'data-se-btnwrap');
          }
        }
      }
    }
  }

  function dlcList(sec) {
    const pick = (p) => (Array.isArray(p.details?.vecDLC) ? p.details.vecDLC : null);
    const found = fromProps(sec.querySelector(`.${C.AppDetailsSection}, .AppDetailsSection`) || sec, 12, pick);
    if (found) return found;
    for (
      let el = sec.querySelector('[data-se-cgrid]') || sec.querySelector('img');
      el && sec.contains(el);
      el = el.parentElement
    ) {
      const v = fromProps(el, 12, pick);
      if (v) return v;
    }
    return null;
  }

  const dlcSort = (a, b) =>
    a.bAvailableOnStore && !b.bAvailableOnStore
      ? -1
      : b.bAvailableOnStore && !a.bAvailableOnStore
        ? 1
        : a.rtPurchaseDate == b.rtPurchaseDate
          ? String(a.strName).localeCompare(String(b.strName))
          : b.rtPurchaseDate - a.rtPurchaseDate;

  let label = null;

  function showLabel(el, text, sub) {
    if (!text) return;
    if (!label) label = own('div', 'se-tip-label');
    label.innerHTML = `<div>${esc(text)}</div>${sub ? `<div class="se-tip-sub">${esc(sub)}</div>` : ''}`;
    placePopup(label, el);
  }

  const hideLabel = () => label?.removeAttribute('data-on');

  function openStore(id) {
    const sc = steamClient();
    const url = `https://store.steampowered.com/app/${id}`;
    if (sc?.URL?.ExecuteSteamURL) sc.URL.ExecuteSteamURL(`steam://openurl/${url}`);
    else window.open(url);
  }

  function dlcTile(d, tpl, steamGrid) {
    const id = String(d.unAppID);
    const file = d.strHeaderFilename;
    const rt = d.rtStoreAssetModifyTime || 0;
    const STORE = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps';
    const urls = [
      ...new Set(
        [
          file && tpl?.base ? `${tpl.base}/${id}/${file}?c=${rt}` : '',
          file ? `${STORE}/${id}/${file}` : '',
          tpl?.base ? `${tpl.base}/${id}/header.jpg` : '',
          `${STORE}/${id}/header.jpg`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
          tpl?.src || '',
        ].filter(Boolean)
      ),
    ];

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'se-dlc-tile';
    b.setAttribute('aria-label', d.strName || '');
    b.toggleAttribute('data-owned', d.rtPurchaseDate > 0);
    const added =
      d.rtPurchaseDate > 0 ? `Added ${day(d.rtPurchaseDate)}` : '';
    b.addEventListener('mouseenter', () => showLabel(b, d.strName || '', added));
    b.addEventListener('mouseleave', hideLabel);

    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    let k = 0;
    img.onerror = () => {
      if (++k < urls.length) {
        img.src = urls[k];
      } else {
        img.remove();
        b.classList.add('se-dlc-noart');
      }
    };
    img.src = urls[0];

    const name = document.createElement('span');
    name.className = 'se-dlc-name';
    name.textContent = d.strName || '';
    b.append(img, name);

    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const steamImg = [...steamGrid.querySelectorAll('img')].find((i) => srcOf(i).includes(`/apps/${id}/`));
      if (steamImg) (steamImg.closest('[role="link"], [tabindex]') || steamImg).click();
      else openStore(id);
    });
    return b;
  }

  function placeDlcAll() {
    for (const sec of document.querySelectorAll('[data-se-sec="dlc"]')) {
      let steamGrid = [...sec.querySelectorAll('[data-se-cgrid]')].find((g) => !g.closest('.se-dlc-grid')) || null;
      if (!steamGrid) {
        const only = [...sec.querySelectorAll('img')].find((i) => !i.closest('.se-dlc-grid'));
        const box = only?.parentElement?.closest('[id]');
        steamGrid = box && sec.contains(box) && !box.contains(sec.querySelector(HEADING)) ? box : null;
      }
      let mine = sec.querySelector('.se-dlc-grid');
      const list = dlcList(sec);
      if (!steamGrid || !list || !list.length) {
        drop(mine);
        if (steamGrid) unmark(steamGrid, 'data-se-replaced');
        continue;
      }
      const drawn = [...steamGrid.querySelectorAll('img')].map(srcOf).find(Boolean) || '';
      const m = drawn.match(/^(.*)\/(\d+)\/[^/]+$/) || drawn.split('?')[0].match(/^(.*)\/(\d+)\/[^/]+$/);
      const tpl = drawn ? { src: drawn, base: m ? m[1] : '' } : null;
      const sorted = list.slice().sort(dlcSort);
      const sig =
        sorted.map((d) => `${d.unAppID}:${d.rtPurchaseDate > 0 ? 1 : 0}`).join(',') + `|${tpl?.src || ''}`;
      if (!mine) mine = own('div', 'se-dlc-grid');
      if (mine.dataset.sig !== sig) {
        mine.dataset.sig = sig;
        mine.textContent = '';
        for (const d of sorted) mine.appendChild(dlcTile(d, tpl, steamGrid));
      }
      if (steamGrid.nextElementSibling !== mine) steamGrid.after(mine);
      mark(steamGrid, 'data-se-replaced');
    }
  }

  function placeBadge() {
    for (const b of document.querySelectorAll(
      `[data-se-sec="cards"] :is(.${C.InnerContainerLower_BadgeSection}, .${C.AppActivityDay_BadgeSection}, .BadgeSection)`
    )) {
      const maxed = `:is(.${C.BadgeMaxed}, .BadgeMaxed)`;
      const st = b.querySelector(`:is(.${C.InnerContainerLower_EmptyCircle}, .${C.AppActivityDay_EmptyCircle}, .EmptyCircle)`)
        ? 'none'
        : b.matches(maxed) || b.querySelector(maxed)
          ? 'maxed'
          : 'crafted';
      mark(b, 'data-se-badge', st);
    }
  }

  function placeHideCommunity() {
    for (const el of document.querySelectorAll(
      `:is(.${C.CommunityContentContainer}, .CommunityContentContainer)`
    )) {
      mark(el.closest(`.${SEEK}`) || el, 'data-se-hidden');
    }
  }

  const EMO = `:is(.${C.EmoticonButton}, .EmoticonButton)`;
  const POST_BOX = `:is(.${C.PostTextEntry}, .PostTextEntry)`;

  function placeEmoDot() {
    for (const b of document.querySelectorAll(`[data-se-sec="activity"] ${EMO}`)) {
      for (const el of b.querySelectorAll('div, span')) {
        if (emptyOf(el)) mark(el, 'data-se-emo-dot');
      }
      for (const el of [b, ...b.querySelectorAll('[title]')]) {
        if (el.hasAttribute('title')) el.removeAttribute('title');
      }
      if (b.hasAttribute('disabled')) b.removeAttribute('disabled');
    }
  }

  let emoOwnClick = false;

  function onEmoClick(e) {
    if (emoOwnClick) return;
    const b = e.target.closest?.(`[data-se-sec="activity"] ${EMO}`);
    if (!b || !propsOf(b)?.disabled) return;
    const area = b.closest(POST_BOX)?.querySelector('textarea');
    if (!area) return;
    e.preventDefault();
    e.stopPropagation();
    area.focus();
    let tries = 0;
    const again = () => {
      if (propsOf(b)?.disabled && tries++ < 10) {
        requestAnimationFrame(again);
        return;
      }
      emoOwnClick = true;
      try {
        b.click();
      } finally {
        emoOwnClick = false;
      }
    };
    requestAnimationFrame(again);
  }

  const SHOT_CAR = `:is(.${C.ScreenshotCarousel}, .ScreenshotCarousel)`;
  const SHOT_ACTIVE = `:is(.${C.ActiveScreenshot}, .ActiveScreenshot)`;
  const SHOT_THUMB = `:is(.${C.CarouselThumb}, .CarouselThumb)`;
  const SHOT_STAMP = `:is(.${C.TimeStamp}, .TimeStamp)`;
  const SHOT_HEAD = `:is(.${C.EventHeadline}, .EventHeadline)`;
  const SVG_CHEV = (d) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const SVG_EXPAND =
    '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="var(--se-accent, #7cc4ff)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const okUrl = (u) => typeof u === 'string' && u.trim() !== '' && !/^(undefined|null)$/.test(u);
  const uniq = (a) => [...new Set(a)];
  const fullOf = (u) => (okUrl(u) && /[?&]im[wh]=/.test(u) ? u.replace(/\?.*$/, '') : '');

  function shotsOf(car) {
    const listy = (v) =>
      v && typeof v === 'object' && typeof v.length === 'number' && v.length > 0 ? Array.from(v) : undefined;
    const list =
      fromProps(car, 14, (p) => listy(p.screenshots) || listy(p.event?.screenshots)) ||
      fromProps(car.closest(`:is(.${C.Event}, .Event)`) || car, 14, (p) =>
        listy(p.event?.screenshots) || listy(p.screenshots)
      );
    const drawn = [...car.querySelectorAll(`${SHOT_THUMB} img`)].map((i) => srcOf(i));
    const one = car.querySelector(`${SHOT_ACTIVE} img`);
    if (!drawn.length && one) drawn.push(srcOf(one));

    if (list) {
      return list.map((e, i) => {
        const x = e?.file && typeof e.file === 'object' ? e.file : e;
        return {
          urls: uniq(
            [x?.file_url, x?.image_url, fullOf(x?.preview_url), fullOf(drawn[i]), x?.preview_url, drawn[i]].filter(
              okUrl
            )
          ),
          id: String(x?.publishedfileid ?? i),
          time: Number(x?.time_created) || 0,
          cap: x?.file_description || '',
        };
      });
    }
    return drawn.map((u, i) => ({
      urls: uniq([fullOf(u), u].filter(okUrl)),
      id: String(i),
      time: 0,
      cap: '',
    }));
  }

  const shotTime = (t) =>
    `${formatTime(t, { month: 'short', day: 'numeric' })} · ${formatTime(t, { hour: 'numeric', minute: '2-digit' })}`;

  const stampText = (car) => (car.querySelector(SHOT_STAMP)?.textContent || '').trim();
  const stampShort = (car) => stampText(car).replace(/^[^:：]*[:：]\s*/, '');

  const SHOT_ON = `:is(.${C.AppActivityDay_Active}, .Active)`;

  function openShot(car, i) {
    const thumbs = car.querySelectorAll(SHOT_THUMB);
    const open = () => car.querySelector(`${SHOT_ACTIVE} img`)?.click();
    const t = thumbs[i];
    if (t && !t.matches(SHOT_ON)) {
      t.click();
      setTimeout(open, 80);
    } else {
      open();
    }
  }

  function activeShot(car, box) {
    const i = [...car.querySelectorAll(SHOT_THUMB)].findIndex((t) => t.matches(SHOT_ON));
    return i >= 0 ? i : box.__seActive || 0;
  }

  /*
   * Shows the first candidate URL that hasn't failed. Once a picture is up, a better candidate
   * is preloaded off-screen and swapped in only if it loads, so the frame never blanks.
   */
  function showBest(img, urls) {
    img.__seUrls = urls;
    const ok = urls.filter((u) => !img.__seBad.has(u));
    const cur = img.getAttribute('src');
    if (!ok.length) {
      if (cur) img.removeAttribute('src');
      return;
    }
    const best = ok[0];
    if (!ok.includes(cur)) {
      img.__seTrying = '';
      img.src = best;
      return;
    }
    if (cur === best || img.__seTrying === best || !img.complete || !img.naturalWidth) return;
    img.__seTrying = best;
    const probe = new Image();
    probe.onload = () => {
      if (img.isConnected && img.__seUrls.includes(best)) img.src = best;
    };
    probe.onerror = () => {
      img.__seBad.add(best);
      img.__seTrying = '';
      showBest(img, img.__seUrls);
    };
    probe.src = best;
  }

  function trackFailures(img) {
    img.__seBad = new Set();
    img.__seUrls = [];
    img.addEventListener('error', () => {
      img.__seBad.add(img.getAttribute('src'));
      img.removeAttribute('src');
      showBest(img, img.__seUrls);
    });
  }

  function syncViewer(car, box, shots) {
    const i = Math.min(shots.length - 1, activeShot(car, box));
    box.__seActive = i;
    box.__seShots = shots;
    showBest(box.querySelector('.se-shot-main img'), shots[i]?.urls || []);
    const text = `${i + 1} / ${shots.length}`;
    const count = box.querySelector('.se-shot-count');
    if (count.textContent !== text) count.textContent = text;
    const strip = box.querySelector('.se-shot-strip');
    strip.querySelectorAll('.se-shot').forEach((t, k) => t.toggleAttribute('data-on', k === i));
    if (box.__seShown !== i) {
      box.__seShown = i;
      const t = strip.children[i];
      if (t && (t.offsetLeft < strip.scrollLeft || t.offsetLeft + t.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
        strip.scrollTo({
          left: t.offsetLeft - (strip.clientWidth - t.offsetWidth) / 2,
          behavior: 'smooth',
        });
      }
    }
  }

  function fillShots(box, shots) {
    box.querySelectorAll('.se-shot img').forEach((img, i) => showBest(img, shots[i]?.urls || []));
  }

  function buildCarousel(car, shots) {
    const box = own('div', 'se-shot-car');
    box.innerHTML =
      '<button type="button" class="se-shot-main"><img alt="" decoding="async"><span class="se-shot-count"></span></button>' +
      `<div class="se-shot-strip">${shots.map((x, i) => `<button type="button" class="se-shot" data-i="${i}"><img alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`;

    box.querySelectorAll('img').forEach(trackFailures);

    box.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.se-shot-main')) {
        openShot(car, box.__seActive || 0);
        return;
      }
      const shot = e.target.closest('.se-shot');
      if (!shot) return;
      const i = Number(shot.dataset.i);
      box.__seActive = i;
      const t = car.querySelectorAll(SHOT_THUMB)[i];
      if (t && !t.matches(SHOT_ON)) t.click();
      syncViewer(car, box, box.__seShots || []);
    });
    return box;
  }

  function placeShotTime(car, shots) {
    const head = car.closest(`:is(.${C.Event}, .Event)`)?.querySelector(SHOT_HEAD);
    if (!head) return;
    const text = shots[0]?.time ? shotTime(shots[0].time) : stampShort(car);
    let el = head.querySelector(':scope > .se-ev-time');
    if (!text) {
      drop(el);
      return;
    }
    if (!el) el = own('span', 'se-ev-time');
    if (el.textContent !== text) el.textContent = text;
    if (el.parentElement !== head || el.nextElementSibling) head.appendChild(el);
  }

  function gameName(car) {
    const appid = fromProps(car, 10, (p) => p.event?.appid || undefined);
    try {
      return (appid && SE.appStore()?.GetAppOverviewByAppID(appid)?.display_name) || '';
    } catch (_) {
      return '';
    }
  }

  function placeShotInfo(car, shot) {
    const active = car.querySelector(SHOT_ACTIVE);
    if (!active) return;
    let info = active.querySelector(':scope > .se-shot-info');
    if (!info) {
      info = own('div', 'se-shot-info');
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('.se-shot-open')) {
          car.querySelector(`${SHOT_ACTIVE} img`)?.click();
        }
      });
    }
    const game = gameName(car);
    const whenStr = stampText(car);
    const key = [game, whenStr, shot?.cap].join('|');
    if (info.__seKey !== key) {
      info.__seKey = key;
      info.innerHTML =
        '<div class="se-shot-kicker">Screenshot</div>' +
        (game ? `<div class="se-shot-game">${esc(game)}</div>` : '') +
        (whenStr ? `<div class="se-shot-when">${esc(whenStr)}</div>` : '') +
        (shot?.cap ? `<div class="se-shot-cap">${esc(shot.cap)}</div>` : '') +
        `<button type="button" class="se-shot-open">${SVG_EXPAND}View full size</button>`;
    }
    if (info.parentElement !== active || info.nextElementSibling) active.appendChild(info);
  }

  let shotRetry = 0;
  let shotTries = 0;

  // Up to 30 retries (15 s) while some screenshot has no URL yet; the budget refills once all load.
  function retryShots() {
    if (shotRetry || shotTries > 30) return;
    shotTries++;
    shotRetry = setTimeout(() => {
      shotRetry = 0;
      schedule();
    }, 500);
  }

  const EVENT = `:is(.${C.Event}, .Event)`;
  const MORE_COMMENTS = `:is(.${C.MakeCommentsVisible}, .MakeCommentsVisible)`;
  const COMMENT = `:is(.${C.Comment}, .Comment)`;
  const RATING_BOX = `:is(.${C.ActivityCommentThreadMinimized_RatingContainer}, .RatingContainer)`;
  const MAX_TABS = 7;

  function placeShotSide(car) {
    const ev = car.closest(EVENT);
    const kids = ev ? [...ev.children] : [];
    const body = kids.find((k) => k.contains(car));
    const head = ev?.querySelector(`:scope > :is(.${C.EventHeadline}, .EventHeadline)`);
    const wrap = kids.find(
      (k) =>
        k !== body &&
        k !== head &&
        k.querySelector(
          `${RATE_BAR}, [data-se-rate-bar], :is(.${C.ActivityCommentThread}, .ActivityCommentThread, .${C.ActivityCommentThreadMinimized}, .ActivityCommentThreadMinimized)`
        )
    );
    if (!body) {
      if (ev) unmark(ev, 'data-se-shot-side');
      return false;
    }
    if (!wrap) {
      const spot = kids.find((k) => k !== body && k !== head);
      if (!spot) {
        unmark(ev, 'data-se-shot-side');
        return false;
      }
      mark(ev, 'data-se-shot-side');
      mark(body, 'data-se-side', 'media');
      mark(spot, 'data-se-side', 'comments');
      drop(car.querySelector(`${SHOT_ACTIVE} > .se-shot-info`));
      return true;
    }
    const pick = car.querySelector(':scope > .se-shot-car')?.__seActive ?? 0;
    if (wrap.__seFor !== pick) {
      wrap.__seFor = pick;
      wrap.__sePage = 0;
      wrap.__seCmKey = '';
    }
    mark(ev, 'data-se-shot-side');
    mark(body, 'data-se-side', 'media');
    mark(wrap, 'data-se-side', 'comments');
    drop(car.querySelector(`${SHOT_ACTIVE} > .se-shot-info`));
    placeShotComments(wrap);
    return true;
  }

  // Splits the comments into pages that fit the box; returns the pages and each comment's height.
  function commentPages(box, list) {
    list.forEach((c) => mark(c, 'data-se-pg', 'on'));
    const room = box.clientHeight;
    const pages = [];
    const heights = new Map();
    let used = room + 1;
    for (const c of list) {
      const h = c.offsetHeight;
      heights.set(c, h);
      if (used + h > room && (pages.length === 0 || pages[pages.length - 1].length)) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(c);
      used += h;
    }
    return { pages: pages.length ? pages : [[]], heights };
  }

  // Off-page comments are display:none, so they measure 0 on the next pass.
  const commentKey = (box, list, heightOf, page) =>
    `${list.length}|${box.clientHeight}|${box.clientWidth}|${list.map(heightOf).join(',')}|${page}`;

  function placeShotComments(wrap) {
    const more = wrap.querySelector(MORE_COMMENTS);
    if (more && Date.now() - (wrap.__seMoreAt || 0) > 1000) {
      wrap.__seMoreAt = Date.now();
      more.click();
    }
    const list = [...wrap.querySelectorAll(COMMENT)];
    const box = list[0]?.parentElement;
    const inner = wrap.querySelector(RV_THREAD_IN);
    const rating = inner?.querySelector(RATING_BOX);
    let head = inner?.querySelector(':scope > .se-cm-head');
    if (!list.length || !box || !inner || !rating) {
      drop(head);
      return;
    }
    mark(box, 'data-se-clist');

    if (!head) {
      head = own('div', 'se-cm-head');
      head.innerHTML = '<span class="se-cm-title"></span><div class="se-cm-tabs"></div>';
      head.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        e.stopPropagation();
        wrap.__sePage =
          b.dataset.page !== undefined ? Number(b.dataset.page) : (wrap.__sePage || 0) + Number(b.dataset.dir);
        wrap.__seCmKey = '';
        placeShotComments(wrap);
      });
    }
    if (head.parentElement !== inner || head.previousElementSibling !== rating) {
      rating.after(head);
    }

    const title = `Comments · ${list.length}`;
    const tEl = head.querySelector('.se-cm-title');
    if (tEl.textContent !== title) tEl.textContent = title;

    if (wrap.__seCmKey === commentKey(box, list, (c) => c.offsetHeight || 0, wrap.__sePage || 0)) return;

    const { pages, heights } = commentPages(box, list);
    const page = Math.min(pages.length - 1, Math.max(0, wrap.__sePage || 0));
    wrap.__sePage = page;
    const onPage = new Set(pages[page]);
    for (const c of list) mark(c, 'data-se-pg', onPage.has(c) ? 'on' : 'off');
    wrap.__seCmKey = commentKey(box, list, (c) => (onPage.has(c) ? heights.get(c) || 0 : 0), page);

    const tabs = head.querySelector('.se-cm-tabs');
    const html =
      pages.length < 2
        ? ''
        : pages.length <= MAX_TABS
          ? pages
              .map((_, i) => `<button type="button" data-page="${i}"${i === page ? ' data-on' : ''}>${i + 1}</button>`)
              .join('')
          : `<button type="button" data-dir="-1" aria-label="Previous"${page === 0 ? ' disabled' : ''}>${SVG_CHEV('M15 5l-7 7 7 7')}</button><span>${page + 1} / ${pages.length}</span><button type="button" data-dir="1" aria-label="Next"${page === pages.length - 1 ? ' disabled' : ''}>${SVG_CHEV('M9 5l7 7-7 7')}</button>`;
    if (tabs.__seHtml !== html) {
      tabs.__seHtml = html;
      tabs.innerHTML = html;
    }
  }

  function placeFeedShots() {
    let missing = false;
    for (const car of document.querySelectorAll(`[data-se-sec="activity"] ${SHOT_CAR}`)) {
      const shots = shotsOf(car);
      if (!shots.length) continue;
      placeShotTime(car, shots);
      let box = car.querySelector(':scope > .se-shot-car');
      if (shots.length < 2) {
        drop(box);
        mark(car, 'data-se-shots', '1');
        if (!placeShotSide(car)) placeShotInfo(car, shots[0]);
        continue;
      }
      drop(car.querySelector(`${SHOT_ACTIVE} > .se-shot-info`));
      const key = shots.map((x) => x.id).join(',');
      if (box && box.__seKey !== key) {
        drop(box);
        box = null;
      }
      if (!box) {
        box = buildCarousel(car, shots);
        box.__seKey = key;
      }
      if (box.parentElement !== car || box.nextElementSibling) car.appendChild(box);
      fillShots(
        box,
        shots.map((x) => ({ ...x, urls: [...x.urls].reverse() }))
      );
      syncViewer(car, box, shots);
      if (shots.some((x) => !x.urls.length)) missing = true;
      mark(car, 'data-se-shots', 'many');
      placeShotSide(car);
    }
    if (missing) retryShots();
    else shotTries = 0;
  }

  function placeFeedAvatars() {
    for (const av of document.querySelectorAll(
      `[data-se-sec="activity"] :is(.${C.EventActorAvatar}, .EventActorAvatar)`
    )) {
      const img = av.querySelector('img');
      if (!img) continue;
      mark(img, 'data-se-fr-pic');
      for (const el of av.querySelectorAll('div, span')) {
        if (!el.contains(img) && emptyOf(el)) mark(el, 'data-se-fr-status');
      }
      const pick = (p) =>
        [p.friend?.persona, p.persona, p.player?.persona, p.actor?.persona, p.user?.persona].find(
          (v) => v && typeof v === 'object' && 'm_ePersonaState' in v
        );
      const pr = fromProps(img, 10, pick) || fromProps(av, 10, pick);
      if (pr) {
        mark(img, 'data-se-fr-state', frState(pr));
        continue;
      }
      const cls = [...av.querySelectorAll('*'), av]
        .map((e) => (typeof e.className === 'string' ? e.className : ''))
        .join(' ');
      const game = /\b(in-?game|ingame)\b/i.test(cls);
      const on = game || /\bonline\b/i.test(cls);
      const away = /\baway|snooze/i.test(cls);
      mark(img, 'data-se-fr-state', on ? `${game ? 'ingame' : 'online'}${away ? '-away' : ''}` : 'offline');
    }
  }

  function placeFeedEvents() {
    placeFeedAvatars();
    for (const ev of document.querySelectorAll(`[data-se-sec="activity"] :is(.${C.Event}, .Event)`)) {
      for (const ch of ev.children) {
        if (ch.matches(`:is(.${C.EventHeadline}, .EventHeadline, .${C.EventBody}, .EventBody)`)) continue;
        if (emptyOf(ch)) mark(ch, 'data-se-empty');
        else unmark(ch, 'data-se-empty');
      }
    }
  }

  function placeNewsLink() {
    for (const sec of document.querySelectorAll('[data-se-sec="activity"]')) {
      const steam = sec.querySelector(`:is(.${C.ViewLastNews}, .ViewLastNews)`);
      const box = sec.querySelector(`:is(.${C.PostTextEntry}, .PostTextEntry)`);
      let link = sec.querySelector('.se-news-link');
      if (!steam || !box) {
        drop(link);
        if (steam) unmark(steam, 'data-se-replaced');
        continue;
      }
      if (!link) {
        link = own('button', 'se-news-link');
        link.type = 'button';
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          link.__seBtn?.click();
        });
      }
      link.__seBtn = steam;
      const text = steam.textContent.trim();
      if (link.textContent !== text) link.textContent = text;
      if (link.parentElement !== box || link.nextElementSibling) box.appendChild(link);
      mark(steam, 'data-se-replaced');
    }
  }

  const RATE_BAR = `:is(.${C.RatingBar}, .RatingBar)`;
  const RATE_LIKE = `:is(.${C.LikeButton}, .LikeButton)`;
  const RATE_COMMENT = `:is(.${C.CommentButton}, .CommentButton)`;
  const RATE_CAN = `:is(.${C.CanClick}, .CanClick)`;
  const RATE_AWARD = `:is(.${C.Reactions}, .Reactions)`;
  const NUMERIC = /^\s*\d[\d.,\s\u00a0\u202f]*$/;

  const shortNum = (n) =>
    (n >= 1e6
      ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`
        : String(n)
    ).replace(/\.0(?=[KM])/, '');

  function rateParts(btn) {
    const kids = [...btn.children];
    const count = kids.find((c) => !c.querySelector('*') && NUMERIC.test(c.textContent));
    const icon = kids.find((c) => c !== count && (c.matches('svg') || c.querySelector('svg')));
    return count && icon ? { count, icon } : null;
  }

  function markRateBar(bar, btns) {
    mark(bar, 'data-se-rate-bar');
    btns.forEach((b, i) => {
      const kind = b.matches(RATE_LIKE)
        ? 'like'
        : b.matches(RATE_COMMENT)
          ? 'comment'
          : b.matches(RATE_AWARD)
            ? 'award'
            : bar.querySelector(RATE_LIKE) || bar.querySelector(RATE_COMMENT)
              ? 'award'
              : i === btns.length - 1
                ? 'like'
                : i === btns.length - 2
                  ? 'comment'
                  : 'award';
      mark(b, 'data-se-rate', kind);
      if (b.matches(RATE_CAN) || kind !== 'like') unmark(b, 'data-se-rated');
      else mark(b, 'data-se-rated');
      const parts = rateParts(b);
      if (!parts) return;
      mark(parts.icon, 'data-se-rate-icon');
      mark(parts.count, 'data-se-rate-count', shortNum(parseInt(parts.count.textContent.replace(/\D/g, ''), 10) || 0));
    });
  }

  const RV_THREAD_IN = `:is(.${C.ActivityCommentThread}, .ActivityCommentThread, .${C.ActivityCommentThreadMinimized}, .ActivityCommentThreadMinimized)`;
  const ADD_REPLY = `:is(.${C.AddReply}, .AddReply)`;

  function onCommentPill(e) {
    const pill = e.target.closest?.('[data-se-sec="activity"] [data-se-rate="comment"]');
    const inner = pill?.closest(RV_THREAD_IN);
    const root = inner?.parentElement;
    if (!root) return;
    if (root.hasAttribute('data-se-reply')) {
      root.removeAttribute('data-se-reply');
      e.stopPropagation();
      e.preventDefault();
      schedule();
      return;
    }
    root.setAttribute('data-se-reply', '');
    schedule();
    if (root.querySelector(ADD_REPLY)) {
      e.stopPropagation();
      e.preventDefault();
    }
    let tries = 0;
    const focus = () => {
      const area = root.querySelector(`${ADD_REPLY} textarea`);
      if (area) area.focus();
      else if (tries++ < 20) requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  }

  function placeRatings() {
    const seen = new Set();
    for (const bar of document.querySelectorAll(RATE_BAR)) {
      if (bar.__seWoke || bar.closest(RV_THREAD_IN)) continue;
      bar.__seWoke = true;
      for (let n = bar.parentElement, i = 0; n && i < 4; n = n.parentElement, i++) {
        const fn = propsOf(n)?.onMouseEnter;
        if (typeof fn === 'function' && !fn.__se) {
          // Steam fills the bar on hover; a stand-in event wakes it once without a real pointer.
          try {
            fn({ type: 'mouseenter', target: n, currentTarget: n, preventDefault() {}, stopPropagation() {} });
          } catch (_) {}
          break;
        }
      }
    }
    for (const bar of document.querySelectorAll(RATE_BAR)) {
      seen.add(bar);
      markRateBar(bar, [...bar.children].filter((c) => rateParts(c)));
    }
    const bars = new Map();
    for (const svg of document.querySelectorAll(`[data-se-sec="activity"] :is(.${C.Event}, .Event) svg`)) {
      if (svg.closest(`[class^="se-"], [class*=" se-"], :is(.${C.ActiveScreenshot}, .ActiveScreenshot)`)) continue;
      const btn = (svg.parentElement === svg.closest('div') ? svg.parentElement : svg.closest('div'))?.parentElement;
      const bar = btn?.parentElement;
      if (!bar || seen.has(bar) || !rateParts(btn)) continue;
      if (!bars.has(bar)) bars.set(bar, new Set());
      bars.get(bar).add(btn);
    }
    for (const [bar, set] of bars) {
      if (set.size >= 2) {
        markRateBar(
          bar,
          [...bar.children].filter((c) => set.has(c))
        );
      }
    }
  }

  const TOP_BTN = `:is(.${C.ScrollToTopButton}, .ScrollToTopButton)`;

  function placeTop(btn) {
    const sc = btn.__seSc;
    if (!sc?.isConnected) return;
    if (!servesScroller(btn, sc)) {
      btn.__seSc = null;
      return;
    }
    const max = sc.scrollHeight - sc.clientHeight;
    setVar(btn, '--se-scroll', String(max > 0 ? Math.min(1, Math.max(0, sc.scrollTop / max)).toFixed(3) : 0));
    const wrap = btn.parentElement;
    if (!wrap) return;
    const o = wrap.getBoundingClientRect();
    const r = sc.getBoundingClientRect();
    const bar = sc.offsetWidth - sc.clientWidth;
    setVar(btn, '--se-top-x', `${Math.round(r.right - o.left - bar - 48 - 20)}px`);
    setVar(btn, '--se-top-y', `${Math.round(Math.min(r.bottom, innerHeight) - o.top - 48 - 20)}px`);
  }

  /*
   * A button belongs to a scroller only if the scroller holds it, or sits under it. Without
   * this, scrolling the game list (also tall, and a near relative in the DOM) handed the
   * page's button the list's box, and the button was drawn in the header beside the list.
   */
  function servesScroller(btn, sc) {
    if (sc.contains(btn)) return true;
    const host = btn.parentElement?.parentElement;
    if (!host) return false;
    const a = sc.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    return a.width > 0 && overlap >= a.width * 0.5;
  }

  // Scroll events arrive many times a frame: keep the latest scroller and place once per frame.
  let scrolled = null;
  let scrollFrame = 0;
  const topFor = new WeakMap();

  function onAnyScroll(e) {
    scrolled = e.target === document ? document.scrollingElement : e.target;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(placeScrolled);
  }

  function placeScrolled() {
    scrollFrame = 0;
    const t = scrolled;
    scrolled = null;
    if (!(t instanceof Element) || t.clientHeight < innerHeight * 0.6 || t.scrollHeight - t.clientHeight < 50) return;
    if (t.closest(SE.SIDE)) return;
    const known = topFor.get(t);
    if (known?.isConnected && known.__seSc === t) {
      placeTop(known);
      return;
    }
    let best = null;
    let bestSteps = 7;
    for (const btn of document.querySelectorAll(TOP_BTN)) {
      if (!servesScroller(btn, t)) continue;
      let steps = 0;
      for (let n = btn.parentElement; n && steps < bestSteps; n = n.parentElement, steps++) {
        if (n === t || n.contains(t)) break;
      }
      if (steps < bestSteps) {
        best = btn;
        bestSteps = steps;
      }
    }
    if (!best) return;
    best.__seSc = t;
    topFor.set(t, best);
    placeTop(best);
  }

  function onResizeTop() {
    for (const btn of document.querySelectorAll(TOP_BTN)) placeTop(btn);
  }

  function placeScrollTop() {
    for (const btn of document.querySelectorAll(TOP_BTN)) {
      const w = btn.parentElement;
      // One computed-style read per wrapper, not one per pass.
      if (w && !topChecked.has(w)) {
        topChecked.add(w);
        if (
          !w.matches(`:is(.${C.ScrollToTopButtonPosition}, .ScrollToTopButtonPosition)`) &&
          getComputedStyle(w).position === 'static'
        ) {
          mark(w, 'data-se-top-host');
        }
      }
      placeTop(btn);
    }
  }

  const RV_BOX = `.${C.ReviewContainer}`;
  const RV_ROW = `.${C.WriteReviewContainer_RatingContainer}`;
  const RV_TIME = `.${C.WriteReviewContainer_Playtime}`;
  const RV_ASK = `.${C.RecommendGame}`;
  const RV_BTN = `:is(.${C.ReviewThumbButton}, .${C.CompactThumbButton})`;
  const RV_UP = `.${C.Up}`;
  const RV_DOWN = `.${C.Down}`;

  function placeReviewPrompt() {
    for (const box of document.querySelectorAll(RV_BOX)) {
      const time = box.querySelector(RV_TIME);
      const row = box.querySelector(RV_ROW);
      if (!time || !row) continue;
      const said = time.textContent.trim();
      const m =
        said.match(/^You['’]ve played for ([\d.,]+)\s+(\S+)$/i) || said.match(/([\d][\d.,]*)\s+(\S+)/);
      let tile = row.querySelector(':scope > .se-rv-hours');
      if (m) {
        if (!tile) {
          tile = own('div', 'se-rv-hours');
          tile.innerHTML = '<b></b><i></i>';
        }
        if (tile.firstChild.textContent !== m[1]) tile.firstChild.textContent = m[1];
        if (tile.lastChild.textContent !== m[2]) tile.lastChild.textContent = m[2];
        if (row.firstElementChild !== tile) row.prepend(tile);
        mark(box, 'data-se-rv-hours');
      } else {
        drop(tile);
        unmark(box, 'data-se-rv-hours');
      }
      const english = /^You['’]ve played for /i.test(said);
      if (english && m) {
        mark(time, 'data-se-rv-text', 'Your review helps other players decide.');
      } else {
        unmark(time, 'data-se-rv-text');
      }
      const btns = [...box.querySelectorAll(RV_BTN)];
      const pics = btns.filter((b) => b.querySelector('svg, img'));
      btns.forEach((b, n) => {
        const kind = b.querySelector(RV_UP)
          ? 'up'
          : b.querySelector(RV_DOWN)
            ? 'down'
            : pics.length
              ? pics.includes(b)
                ? pics.indexOf(b)
                  ? 'down'
                  : 'up'
                : 'later'
              : ['up', 'down', 'later'][n];
        if (kind) mark(b, 'data-se-rv-btn', kind);
      });
      const ask = box.querySelector(RV_ASK);
      if (ask) {
        if (/^Would you recommend this game to other players\?$/i.test(ask.textContent.trim())) {
          mark(ask, 'data-se-rv-text', 'Would you recommend this game?');
        } else {
          unmark(ask, 'data-se-rv-text');
        }
      }
    }
  }

  const FAVORITE = `.${C.FavoriteButton}`;
  const UNIT = `.${C.MenuButtonContainer}, .${C.PlayBar_MenuButton}, ${FAVORITE}`;
  const TILE = `.${C.PlayBar_MenuButton}, ${FAVORITE}`;
  const holds = (el, sel) => el.matches(sel) || Boolean(el.querySelector(sel));
  const ICONS = [
    ['heart', (el) => Boolean(el.closest(FAVORITE)) || Boolean(el.querySelector(FAVORITE))],
    ['gear', (el) => el.matches(`.${C.MenuButtonContainer}`) && !el.matches('[id], [role="button"]')],
    ['pad', (el) => holds(el, `.${C.ControllerConfigButton}`)],
    ['info', (el) => holds(el, `.${C.GameInfoButton}, .${C.DotDotDot}`)],
  ];

  function isButton(el) {
    if (el.matches(UNIT)) return true;
    const r = el.getBoundingClientRect();
    return r.width >= 20 && r.width <= 64 && r.height >= 20 && r.height <= 64 && Boolean(el.querySelector('svg, img'));
  }

  function markIcon(el) {
    const tile = el.matches(TILE) ? el : el.querySelector(`:scope > :is(${TILE})`) || el.querySelector(TILE) || el;
    const hit = ICONS.find(([, test]) => test(el));
    if (hit) mark(tile, 'data-se-icon', hit[0]);
    else unmark(tile, 'data-se-icon');
  }

  function placePlayBarIcons() {
    for (const controls of document.querySelectorAll(RIGHT_CONTROLS)) {
      if (!controls.querySelector(APP_BUTTONS)) continue;
      const widget = window.__steamEnhancedHltb?.widgetSelector;
      const walk = (el) => {
        for (const child of el.children) {
          if (widget && child.matches(widget)) continue;
          if (isButton(child)) markIcon(child);
          else walk(child);
        }
      };
      walk(controls);
    }
  }

  /*
   * Play bar stats Steam gives no class of their own. "Space Required" shares Last Played's
   * classes, so it is told apart by its React parents: the stat itself (label, no icon,
   * tooltip or classNames) rendered by a component that reads only `details`, while nothing
   * of the game is on disk. Last Played's parent passes bIsApplicationOrTool; the beta stat
   * has a tooltip.
   */
  const GAME_STAT = `.${C.GameStatsSection} .${C.GameStat}`;

  function statKind(el) {
    let stat = null;
    for (let cur = fiberOf(el), depth = 0; cur && depth < 10; cur = cur.return, depth++) {
      const p = cur.memoizedProps;
      if (!p || typeof p !== 'object') continue;
      if (!stat) {
        if ('label' in p) stat = p;
        continue;
      }
      const d = p.details;
      if (!d) continue;
      const plain = !stat.icon && !stat.classNames && !stat.strTooltip;
      return plain && !('bIsApplicationOrTool' in p) && !d.bHasAnyLocalContent && d.lDiskSpaceRequiredBytes > 0
        ? 'space'
        : null;
    }
    return null;
  }

  function placeStatKinds() {
    for (const el of document.querySelectorAll(GAME_STAT)) {
      const kind = statKind(el);
      if (kind) mark(el, 'data-se-stat', kind);
      else unmark(el, 'data-se-stat');
    }
  }

  const SHOW_FIRST = 1;

  function placeMoreNames() {
    for (const list of document.querySelectorAll(ASSOCIATION)) {
      const hidden = list.querySelectorAll(`:scope > ${NAME}`).length - SHOW_FIRST;
      let link = list.querySelector(':scope > .se-assoc-more');
      if (hidden < 2) {
        drop(link);
        list.classList.remove('se-assoc-collapsed');
        continue;
      }
      if (!link) {
        link = own('button', 'se-assoc-more');
        link.type = 'button';
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = list.classList.toggle('se-assoc-collapsed');
          link.textContent = collapsed ? `and ${list.dataset.seMoreCount} more` : 'show less';
        });
        list.classList.add('se-assoc-collapsed');
      }
      list.dataset.seMoreCount = String(hidden);
      if (list.classList.contains('se-assoc-collapsed')) {
        const labelStr = `and ${hidden} more`;
        if (link.textContent !== labelStr) link.textContent = labelStr;
      }
      if (list.lastElementChild !== link) list.appendChild(link);
    }
  }

  function placeLabels() {
    for (const labelEl of document.querySelectorAll(`.${C.ConciseContainer_Container} .${C.Label}`)) {
      const word = labelEl.textContent.trim().replace(/\s*[:：]\s*$/, '');
      if (word) mark(labelEl, 'data-se-label', word);
    }
  }

  const LOGO = '._2gZXhRmKUk68pA28-5ZmGQ ._2Eh7Soh97QONu_grMi2m66 img._3NBxSLAZLbbbnul8KfDFjw';
  const LOGO_CROP = '--se-logo-crop';
  const logoCrops = new Map();
  const logoSources = new WeakMap();
  let logoSizingActive = CSS.supports('object-view-box', 'inset(1%)');

  /*
   * Pixel reads must stay on the CPU. A default 2D canvas is GPU-backed, and reading it back
   * (getImageData) stalls Steam's GPU process; at 4K the whole main window then repaints
   * black for about a second while every tile is rastered again. `willReadFrequently`
   * keeps the canvas in software, and the read waits for an idle moment so it never lands
   * in the frames that draw the page.
   */
  const LOGO_SAMPLE = 512;
  const whenIdle = (fn) => new Promise((resolve, reject) => {
    const run = () => {
      try {
        resolve(fn());
      } catch (error) {
        reject(error);
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else setTimeout(run, 200);
  });

  function measureLogoCrop(img) {
    const scale = Math.min(1, LOGO_SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    let data;
    try {
      ctx.drawImage(img, 0, 0, width, height);
      ({ data } = ctx.getImageData(0, 0, width, height));
    } finally {
      // Free the backing store now rather than at the next GC.
      canvas.width = canvas.height = 0;
    }

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0, alpha = 3; y < height; y++) {
      for (let x = 0; x < width; x++, alpha += 4) {
        if (!data[alpha]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) return '';

    // Leave one sample pixel at a cropped edge to protect fine antialiasing.
    const insets = [
      Math.max(0, top - 1) / height,
      Math.max(0, width - right - 2) / width,
      Math.max(0, height - bottom - 2) / height,
      Math.max(0, left - 1) / width,
    ];
    return insets.some(Boolean) ? `inset(${insets.map(value => `${value * 100}%`).join(' ')})` : '';
  }

  async function readLogoCrop(img, source) {
    try {
      return await whenIdle(() => measureLogoCrop(img));
    } catch (error) {
      if (error.name !== 'SecurityError') return '';
    }

    // Steam may load remote artwork without CORS. Try an anonymous copy for pixel access.
    const copy = new Image();
    copy.crossOrigin = 'anonymous';
    copy.src = source;
    try {
      await copy.decode();
      return await whenIdle(() => measureLogoCrop(copy));
    } catch {
      return '';
    }
  }

  function sizeLogo(img) {
    const source = srcOf(img);
    if (logoSources.get(img) === source) return;
    img.style.removeProperty(LOGO_CROP);
    if (!source || !img.complete || !img.naturalWidth) return;

    logoSources.set(img, source);
    if (!logoCrops.has(source)) {
      if (logoCrops.size >= 80) logoCrops.delete(logoCrops.keys().next().value);
      logoCrops.set(source, readLogoCrop(img, source));
    }
    logoCrops.get(source).then(crop => {
      if (crop && logoSizingActive && img.isConnected && img.matches(LOGO) && srcOf(img) === source) {
        setVar(img, LOGO_CROP, crop);
      }
    });
  }

  function sizeLogos() {
    if (logoSizingActive) document.querySelectorAll(LOGO).forEach(sizeLogo);
  }

  function onLogoLoad(event) {
    const img = event.target;
    if (!logoSizingActive || !img.matches?.(LOGO)) return;
    logoSources.delete(img);
    sizeLogo(img);
  }

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
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
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

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function attachHltb() {
    const integration = window.__steamEnhancedHltb;
    if (!integration) return;
    hltb?.destroy();
    hltb = integration.createCard({
      C,
      esc,
      mark,
      unmark,
      fromProps,
      appIdOf,
      appStore: SE.appStore,
      own,
      drop,
      schedule,
    });
    schedule();
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
      logoSizingActive = false;
      logoCrops.clear();
      document.removeEventListener('load', onLogoLoad, true);
      document.removeEventListener('error', onLogoLoad, true);
      document.querySelectorAll(`[style*="${LOGO_CROP}"]`).forEach(img => img.style.removeProperty(LOGO_CROP));
      removeEventListener('se-hltb-ready', attachHltb);
      hltb?.destroy();
      observer?.disconnect();
      sizer?.disconnect();
      achSizer?.disconnect();
      if (muteAll) document.removeEventListener('pointerout', muteAll, true);
      for (const id of [frame, fitQueued, scrollFrame]) if (id) cancelAnimationFrame(id);
      clearTimeout(shotRetry);
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

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
