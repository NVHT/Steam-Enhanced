/*
 * Steam Settings, Game Properties and Millennium Settings: sidebar headers and icons.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSettingsParts;
  if (!ns) return;
  const { attr: setAttr } = SE;
  const {
    BY_NAME, GROUPS, ITEM, LIST, MILL_BY_NAME, MILL_GROUPS, MILL_PAGES, PAGES, SEP, TITLE, filter,
    pageNameOf, text,
  } = ns;
  const { live } = ns;

  function millPageOf(item, items) {
    return (
      MILL_BY_NAME.get(pageNameOf(item).toLowerCase()) ||
      (items.length === MILL_PAGES.length ? MILL_PAGES[items.indexOf(item)] : null) ||
      null
    );
  }

  function sidebar(list, steam, mill) {
    const items = [...list.querySelectorAll(ITEM)];
    if (mill) {
      [...list.querySelectorAll(SEP)]
        .filter((sep) => !sep.classList.contains('se-mill-label'))
        .forEach((sep, i) => setAttr(sep, 'data-se-label', MILL_GROUPS[i] || null));
      items.forEach((item) => setAttr(item, 'data-se-icon', millPageOf(item, items)?.[1] || null));
    }
    if (steam) {
      setAttr(list, 'data-se-label', GROUPS[0]);
      [...list.querySelectorAll(SEP)].forEach((sep, i) => setAttr(sep, 'data-se-label', GROUPS[i + 1] || null));
      const byIndex = items.length === PAGES.length;
      items.forEach((item, i) => {
        const page = BY_NAME.get(pageNameOf(item).toLowerCase()) || (byIndex ? PAGES[i] : null);
        setAttr(item, 'data-se-icon', page ? page[1] : null);
      });
    }

    const title = document.querySelector(TITLE);
    if (title && steam && /^steam settings$/i.test(text(title))) {
      setAttr(title, 'data-se-title', 'Settings');
    }
    if (title && !live.search) {
      live.search = document.createElement('label');
      live.search.className = 'se-settings-search';
      live.search.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="se-fill" cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="text" placeholder="Search settings" aria-label="Search settings" spellcheck="false">';
      const input = live.search.querySelector('input');
      live.results = document.createElement('div');
      live.results.className = 'se-settings-results';
      live.results.hidden = true;
      input.addEventListener('input', () => {
        live.cursor = 0;
        filter(document.querySelector(LIST), input.value);
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const rows = live.results ? [...live.results.querySelectorAll('.se-settings-result')] : [];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!rows.length) return;
          e.preventDefault();
          live.cursor = (live.cursor + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
          rows.forEach((r, n) => setAttr(r, 'data-se-cur', n === live.cursor ? '' : null));
          rows[live.cursor].scrollIntoView({ block: 'nearest' });
        }
        if (e.key === 'Escape') {
          input.value = '';
          live.cursor = 0;
          filter(document.querySelector(LIST), '');
        }
        if (e.key === 'Enter') {
          if (rows.length) rows[live.cursor]?.click();
          else document.querySelector(`${LIST} ${ITEM}:not([data-se-miss])`)?.click();
        }
      });
    }
    if (title && live.search && live.search.previousElementSibling !== title) title.after(live.search);
    if (live.search && live.results && live.search.nextElementSibling !== live.results) live.search.after(live.results);
  }

  function adjacent(a, b, allow) {
    const range = document.createRange();
    range.setStartAfter(a);
    range.setEndBefore(b);
    const frag = range.cloneContents();
    if (allow) frag.querySelectorAll(allow).forEach((n) => n.remove());
    if (frag.textContent.trim()) return false;
    return !frag.querySelector('button, input, img, svg, [role], canvas, video');
  }
  Object.assign(ns, { adjacent, millPageOf, sidebar });
});
