/*
 * Activity feed: the emoticon dot, screenshot carousels with their comments and viewer,
 * event avatars, the news link and the rating / award pills.
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { drop, emptyOf, formatTime, frState, own, schedule, srcOf } = ns;
  const { live } = ns;

  const { C, esc, fromProps, mark, props: propsOf, unmark } = SE;

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
    } catch {
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

  live.shotRetry = 0;
  let shotTries = 0;

  // Up to 30 retries (15 s) while some screenshot has no URL yet; the budget refills once all load.
  function retryShots() {
    if (live.shotRetry || shotTries > 30) return;
    shotTries++;
    live.shotRetry = setTimeout(() => {
      live.shotRetry = 0;
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
          } catch {}
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

  Object.assign(ns, {
    onCommentPill, onEmoClick, placeEmoDot, placeFeedEvents, placeFeedShots, placeNewsLink,
    placeRatings,
  });
})(window.__se);
