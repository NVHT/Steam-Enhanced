/*
 * Brew Hub (github.com/madmaxgrey/BrewHub; Millennium Settings › Brew Hub, root .bh-root): the plugin's theme and plugin store,
 * paired with brew-hub.css, laid out like the other Millennium pages.
 *
 * The plugin's React owns every node, so nothing of its is moved or rebuilt. This marks the view
 * on the root ([data-se-bh] grid / detail), sizes the root to the window (--se-bh-h, through
 * millennium-pages.js's fillHeight), hides the cards off the current page ([data-se-bh-hide]:
 * a mark of its own, as leaving another Millennium page clears that page's data-se-hide across
 * the window) and adds four theme elements as the root's last children, where React's updates
 * never touch them ([data-se-bh-own]):
 * - the page title: a .DialogHeader with its sub-line, so it is every settings page's title. Its
 *   words are the page's entry in the settings dialog's MILL_PAGES list, which also gives the
 *   page its sidebar icon and the sub-line on the dialog's own passes;
 * - the segmented track behind the Themes | Plugins tabs, whose labels read "Themes 27"
 *   ([data-se-name] / [data-se-count], drawn by brew-hub.css);
 * - a Sort dropdown standing in for the plugin's sort pills (choosing clicks the pill, so the
 *   plugin still does the sorting);
 * - the pager row: the pager and a Refresh that presses the plugin's own (hidden) and turns
 *   while it is busy. No label: the tab already says what is listed and how many. A page holds
 *   as many rows of cards as the window does; a new list (search, sort, tags, tab) goes back to
 *   page one.
 *
 * Classic script, listed after client/settings/millennium/ in client/loader.js: it reads the
 * icons and fillHeight from window.__seMillParts.
 */
((SE) => {
  const KEY = '__seBrewHub';
  window[KEY]?.destroy?.();

  const parts = window.__seMillParts || {};
  const icon = (name) => parts.icon?.(name) || '';

  const ROOT = '.MillenniumSettings .bh-root';
  const CONTENT = `.${SE.C.PagedSettingsDialog_PageContent}`;
  const OWN = 'data-se-bh-own';
  const HIDE = 'data-se-bh-hide';
  // The page's key in the settings dialog's Millennium pages (client/settings/dialog/shared.js)
  const PAGE = 'brewhub';
  // Columns come from the grid; rows from the room under the toolbar (three rows on the
  // fixed window). Until a card can be measured, a page is this many.
  const FIRST_PAGE = 9;
  // The root never shrinks past this, so a short window scrolls rather than crushing the cards
  const MIN_H = 360;

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const isOwn = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return Boolean(el?.closest(`[${OWN}]`));
  };

  function make(tag, cls, html) {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute(OWN, '');
    if (html) el.innerHTML = html;
    return el;
  }

  function create(root) {
    const content = root.closest(CONTENT);
    if (!content) return null;
    const doc = root.ownerDocument;
    const win = doc.defaultView || window;

    let page = 0;
    let perPage = FIRST_PAGE;
    let listSig = null;
    let optionSig = null;
    let open = false;
    let frame = 0;

    // The page title, from the dialog's entry for this page
    const entry = window.__seSettingsParts?.MILL_BY_KEY?.get(PAGE);
    const head = make('div', 'DialogHeader se-bh-head');
    head.textContent = entry?.[0] || 'Brew Hub';
    if (entry?.[2]) head.setAttribute('data-se-sub', entry[2]);

    const track = make('div', 'se-bh-track');
    track.setAttribute('aria-hidden', 'true');

    const sort = make(
      'div',
      'se-bh-sort',
      `<button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Sort by"><span></span>${icon('next')}</button>` +
        '<div class="se-bh-menu" role="listbox" aria-label="Sort by"></div>'
    );
    const sortBtn = sort.firstElementChild;
    const menu = sort.lastElementChild;

    const bar = make(
      'div',
      'se-mtool se-bh-bar',
      '<div class="se-mpager" role="group" aria-label="Pages">' +
        `<button type="button" data-step="-1" aria-label="Previous page">${icon('prev')}</button>` +
        '<span aria-live="polite"></span>' +
        `<button type="button" data-step="1" aria-label="Next page">${icon('next')}</button></div>` +
        `<button type="button" class="se-bh-refresh" aria-label="Refresh" title="Refresh">${icon('reload')}</button>`
    );
    const pager = bar.querySelector('.se-mpager');
    const refresh = bar.querySelector('.se-bh-refresh');
    // The plugin's own Refresh (hidden): this one presses it and mirrors its busy state
    const pluginRefresh = () => root.querySelector('.bh-bar1 .bh-btn');
    const where = pager.querySelector('span');
    const [prev, next] = pager.querySelectorAll('button');

    const pills = () => [...root.querySelectorAll('.bh-pills > .bh-pill')];
    const grid = () => root.querySelector(':scope > .bh-grid');
    const cards = () => [...(grid()?.children || [])].filter((c) => c.classList.contains('bh-card'));
    const options = () => [...menu.querySelectorAll('[role="option"]')];

    // Sort: the plugin's pills, as one dropdown
    function syncSort() {
      const list = pills();
      SE.attr(sort, 'hidden', list.length ? null : '');
      if (!list.length) {
        if (open) setOpen(false);
        return;
      }
      const words = list.map(text);
      const sig = words.join('\n');
      if (sig !== optionSig) {
        optionSig = sig;
        menu.innerHTML = words
          .map((w, i) => `<div role="option" tabindex="-1" data-i="${i}" aria-selected="false">${SE.esc(w)}${icon('done')}</div>`)
          .join('');
      }
      const on = Math.max(0, list.findIndex((p) => p.classList.contains('bh-on')));
      SE.setText(sortBtn.firstElementChild, words[on]);
      options().forEach((o, i) => o.setAttribute('aria-selected', i === on ? 'true' : 'false'));
    }

    function outside(e) {
      if (!sort.contains(e.target)) setOpen(false);
    }

    function setOpen(on, refocus = false) {
      if (on === open) return;
      open = on;
      SE.attr(menu, 'data-open', on ? '' : null);
      sortBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) {
        doc.addEventListener('pointerdown', outside, true);
        (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild)?.focus();
      } else {
        doc.removeEventListener('pointerdown', outside, true);
        if (refocus) sortBtn.focus();
      }
    }

    function choose(i) {
      const pill = pills()[i];
      setOpen(false, true);
      if (pill && !pill.classList.contains('bh-on')) pill.click();
    }

    const onSortClick = () => setOpen(!open);

    function onSortKey(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
    }

    function onMenuClick(e) {
      const opt = e.target.closest('[role="option"]');
      if (opt) choose(Number(opt.dataset.i));
    }

    function onMenuKey(e) {
      const list = options();
      const at = list.indexOf(doc.activeElement);
      const go = (i) => list[(i + list.length) % list.length]?.focus();
      switch (e.key) {
        case 'ArrowDown':
          go(at + 1);
          break;
        case 'ArrowUp':
          go(at - 1);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(list.length - 1);
          break;
        case 'Enter':
        case ' ':
          if (at >= 0) choose(at);
          break;
        case 'Escape':
          setOpen(false, true);
          break;
        case 'Tab':
          setOpen(false);
          return;
        default:
          return;
      }
      e.preventDefault();
    }

    // The pager: one page of the cards the plugin shows, in its order
    function syncPage() {
      const list = cards();
      const sig = list.map((c) => text(c.querySelector('.bh-name'))).join('\n');
      if (sig !== listSig) {
        listSig = sig;
        page = 0;
      }
      const n = list.length;
      const pages = Math.max(1, Math.ceil(n / perPage));
      page = Math.min(Math.max(page, 0), pages - 1);
      list.forEach((c, i) => SE.attr(c, HIDE, Math.floor(i / perPage) === page ? null : ''));

      SE.attr(pager, 'hidden', pages > 1 ? null : '');
      SE.setText(where, `${page + 1} of ${pages}`);
      prev.disabled = page === 0;
      next.disabled = page === pages - 1;
    }

    // The tabs: "Themes 27" with the count in the faint tone (as the segmented control's <b>), drawn
    // by brew-hub.css from these attributes in place of the plugin's "Themes (27)"; its own text
    // stays for screen readers
    function syncTabs() {
      for (const tab of root.querySelectorAll('.bh-bar1 > .bh-tab')) {
        const m = text(tab).match(/^(.*?)\s*\((\d[\d,.]*)\)$/);
        SE.attr(tab, 'data-se-name', m ? m[1] : null);
        SE.attr(tab, 'data-se-count', m ? m[2] : null);
      }
    }

    function syncRefresh() {
      const own = pluginRefresh();
      SE.attr(refresh, 'hidden', own ? null : '');
      const busy = Boolean(own?.disabled);
      refresh.disabled = busy;
      SE.attr(refresh, 'data-busy', busy ? '' : null);
    }

    function onBarClick(e) {
      if (e.target.closest('.se-bh-refresh')) {
        pluginRefresh()?.click();
        return;
      }
      const step = Number(e.target.closest('[data-step]')?.dataset.step);
      if (!step) return;
      page += step;
      syncPage();
    }

    // A page is as many whole rows as the cards' area holds: measured once the root has its height
    function fitPage() {
      const g = grid();
      const card = g && cards().find((c) => !c.hasAttribute(HIDE));
      if (!card) return;
      const style = getComputedStyle(g);
      const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      const gap = parseFloat(style.rowGap) || 0;
      const rows = Math.max(1, Math.floor((g.clientHeight + gap) / (card.offsetHeight + gap)));
      const per = cols * rows;
      if (per === perPage) return;
      const first = page * perPage;
      perPage = per;
      page = Math.floor(first / per);
      syncPage();
    }

    function layout() {
      frame = 0;
      if (!root.isConnected) return;
      parts.fillHeight?.(root, content, '--se-bh-h', MIN_H);
      if (root.getAttribute('data-se-bh') === 'grid') fitPage();
    }

    const relayout = () => {
      if (!frame) frame = win.requestAnimationFrame(layout);
    };

    function sync() {
      const detail = Boolean(root.querySelector(':scope > .bh-detail'));
      SE.attr(root, 'data-se-bh', detail ? 'detail' : 'grid');
      const mine = [head, track, sort, bar];
      if (mine.some((el, i) => el !== root.children[root.children.length - mine.length + i])) root.append(...mine);
      if (detail) {
        setOpen(false);
      } else {
        syncTabs();
        syncSort();
        syncPage();
        syncRefresh();
      }
      relayout();
    }

    sortBtn.addEventListener('click', onSortClick);
    sortBtn.addEventListener('keydown', onSortKey);
    menu.addEventListener('click', onMenuClick);
    menu.addEventListener('keydown', onMenuKey);
    bar.addEventListener('click', onBarClick);
    win.addEventListener('resize', relayout);
    // The pills' and tabs' bh-on is a class change, Refresh's busy state its disabled, a tab's
    // count a text change; the theme's own nodes don't count
    const changes = SE.onChange(root, sync, { attributes: ['class', 'disabled'], characterData: true, ignore: isOwn });
    sync();

    return {
      destroy() {
        changes.disconnect();
        setOpen(false);
        win.removeEventListener('resize', relayout);
        if (frame) win.cancelAnimationFrame(frame);
        sortBtn.removeEventListener('click', onSortClick);
        sortBtn.removeEventListener('keydown', onSortKey);
        menu.removeEventListener('click', onMenuClick);
        menu.removeEventListener('keydown', onMenuKey);
        bar.removeEventListener('click', onBarClick);
        for (const el of [head, track, sort, bar]) el.remove();
        for (const c of root.querySelectorAll(`.bh-card[${HIDE}]`)) c.removeAttribute(HIDE);
        for (const t of root.querySelectorAll('.bh-tab[data-se-name]')) {
          t.removeAttribute('data-se-name');
          t.removeAttribute('data-se-count');
        }
        root.removeAttribute('data-se-bh');
        root.style.removeProperty('--se-bh-h');
      },
    };
  }

  const views = SE.mount('Brew Hub', () => document.querySelectorAll(ROOT), create, { scope: '.MillenniumSettings' });

  window[KEY] = {
    destroy() {
      views.destroy();
      delete window[KEY];
    },
  };
})(window.__se);
