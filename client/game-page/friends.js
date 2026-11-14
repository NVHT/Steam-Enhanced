/*
 * "Friends who play" card: group tabs, avatar stacks, status rings and the footer.
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { BODY, drop, own, schedule, sharedParent, srcOf } = ns;

  const { C, esc, fromProps, mark } = SE;


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

  Object.assign(ns, { emptyOf, frState, placeFriends });
})(window.__se);
