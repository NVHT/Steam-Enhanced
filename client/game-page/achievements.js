/*
 * Achievements card and achievements in the activity feed: progress rings, rarity tiers,
 * icon rows that fill the card, unlock tooltips, the progress banner and the latest unlock.
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { day, drop, own, parseCount, placePopup, schedule, steamClient, when } = ns;
  const { live } = ns;

  const { C, esc, fromProps, mark, props: propsOf, cssVar: setVar, unmark } = SE;

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

  // Tip listeners sit on Steam's own nodes too, which outlive the feature: each is recorded so
  // destroy() can take it off (unbindTips), and a re-run binds afresh.
  const tipBindings = new Map(); // node -> [type, listener][]
  function bind(el, type, fn) {
    el.addEventListener(type, fn);
    let list = tipBindings.get(el);
    if (!list) {
      if (tipBindings.size >= 200) for (const node of tipBindings.keys()) if (!node.isConnected) tipBindings.delete(node);
      tipBindings.set(el, (list = []));
    }
    list.push([type, fn]);
  }
  function unbindTips() {
    for (const [el, list] of tipBindings) for (const [type, fn] of list) el.removeEventListener(type, fn);
    tipBindings.clear();
  }
  function withTip(el, anchor) {
    const show = () => showTip(el, anchor?.() || el);
    bind(el, 'mouseenter', show);
    bind(el, 'mouseleave', hideTip);
    bind(el, 'focusin', show);
    bind(el, 'focusout', hideTip);
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
  live.achSizer = undefined;
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
        if (!live.achSizer) {
          live.achSizer = new ResizeObserver((es) => {
            for (const e of es) fillAchRow(e.target);
          });
        }
        live.achSizer.observe(mine);
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
    live.achSizer?.unobserve(mine);
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
    } catch {
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
  live.muteAll = null;

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
        if (tipBindings.has(host)) continue;
        bind(host, 'mouseenter', () => muteHost(host));
        withTip(host, () => (icon.isConnected ? icon : host));
      }
    }
    for (const h of tipHosts) {
      if (!h.isConnected) tipHosts.delete(h);
    }
    for (const el of tipBindings.keys()) if (!el.isConnected) tipBindings.delete(el);
    if (!live.muteAll && tipHosts.size) {
      live.muteAll = () => {
        for (const h of tipHosts) muteHost(h);
      };
      // pointerout precedes the compat mouse events, so one listener re-mutes before either enter.
      document.addEventListener('pointerout', live.muteAll, true);
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

  Object.assign(ns, {
    unbindTips,
    achRows, appIdOf, banners, placeAchBanner, placeAchFeatured, placeAchIcons, placeAchRings,
    placeFeedAchAll, tipHosts, topChecked,
  });
})(window.__se);
