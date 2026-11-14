/*
 * Left-column cards and card headings: the heading links, DLC grid (from details.vecDLC),
 * Trading Card badge state and the hidden Community card.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedGamePageParts;
  if (!ns) return;
  const { BODY, day, drop, HEADING, own, placePopup, SEEK, sharedParent, srcOf, steamClient } = ns;

  const { C, esc, fromProps, mark, unmark } = SE;

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

  Object.assign(ns, {
    LEFT_CARDS, LINKED, placeBadge, placeDlcAll, placeHeadingLinks, placeHideCommunity,
    placeLeftCards,
  });
});
