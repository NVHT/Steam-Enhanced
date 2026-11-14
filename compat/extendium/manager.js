/*
 * Extendium's Extensions manager (its "Extensions" dialog window), paired with section 3 of
 * compat/extendium/extendium.css. Extendium renders three routes into .extension-manager-popup:
 *
 *   list      .root-buttons + .card-container (one .extension-card per extension)
 *   details   .extension-detail-info
 *   settings  .DialogBody with its own .header
 *
 * On the list this adds what CSS can't:
 *   - a page head: "Extensions" and a summary ("3 installed · 2 on")
 *   - a search field at the start of the toolbar row, filtering the cards by name / description
 *     (Ctrl+F focuses it, Esc clears it), with a no-match note under the grid
 *
 * And it sizes the window: Extendium opens it at 1280 px wide (its minimum) and 65% of the main
 * window's height, far more than two columns of cards or a settings list need. Once the manager
 * is in, a window wider than SIZE is lowered to SIZE (and its minimum to MIN_SIZE) and centred on
 * its screen, once per open; a window the user has made narrower is left alone.
 *
 * Extendium's React owns every node it renders, so nothing of its is moved or rebuilt: the head,
 * search and note are theme elements put beside them (.se-ext-*), and cards are filtered with an
 * attribute. Everything else (layout, the toggle in the card's corner, disabled cards, pills) is
 * CSS. Re-runs on any DOM or class change in the window: routes swap and toggles flip by class.
 */
((SE) => {
  const KEY = '__seExtendiumManager';
  window[KEY]?.destroy?.();
  if (document.title !== 'Extensions') return;

  const ROOT = '.extension-manager-popup';
  const SIZE = { w: 920, h: 720 };
  const MIN_SIZE = { w: 640, h: 480 };
  const HIDDEN = 'data-se-filtered';
  let query = '';

  /* ---------- Theme elements ---------- */

  const head = SE.el('header', 'se-ext-head');
  const title = SE.el('h1', 'se-ext-title', 'Extensions');
  const summary = SE.el('p', 'se-ext-summary');
  head.append(title, summary);

  const search = SE.el('label', 'se-ext-search');
  const input = SE.el('input');
  input.type = 'search';
  input.placeholder = 'Search extensions';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Search extensions');
  search.append(input);

  const empty = SE.el('p', 'se-ext-nomatch');

  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    update();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.stopPropagation(); // Esc would also close the dialog
      input.value = '';
      query = '';
      update();
    }
  });

  const onKey = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && search.isConnected) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  };
  addEventListener('keydown', onKey, true);

  /* ---------- Window size ---------- */

  let sized = false;
  function sizeWindow() {
    if (sized) return;
    sized = true;
    const win = window.SteamClient?.Window;
    if (!win?.ResizeTo || innerWidth <= SIZE.w + 40) return;
    const s = window.screen;
    const availW = s.availWidth || SIZE.w;
    const availH = s.availHeight || SIZE.h;
    const w = Math.min(SIZE.w, availW - 32);
    const h = Math.min(SIZE.h, availH - 32);
    try {
      win.SetMinSize?.(MIN_SIZE.w, MIN_SIZE.h); // Extendium's 1280 px minimum would hold it wide
      win.ResizeTo(w, h, true);
      win.MoveTo?.(
        (s.availLeft || 0) + Math.round((availW - w) / 2),
        (s.availTop || 0) + Math.round((availH - h) / 2),
        window.devicePixelRatio || true
      );
    } catch {}
  }

  /* ---------- Update ---------- */

  const text = (card) =>
    `${card.querySelector('.name')?.textContent || ''} ${card.querySelector('.description')?.textContent || ''}`.toLowerCase();

  const detach = () => {
    for (const node of [head, search, empty]) if (node.isConnected) node.remove();
  };

  function update() {
    const root = document.querySelector(ROOT);
    if (root) sizeWindow();
    const toolbar = root?.querySelector(':scope > .root-buttons');
    const grid = root?.querySelector(':scope > .card-container');
    if (!toolbar || !grid) return detach(); // details / settings: they have their own heads

    if (root.firstElementChild !== head) root.prepend(head);
    if (toolbar.firstElementChild !== search) toolbar.prepend(search);

    const cards = [...grid.querySelectorAll(':scope > .extension-card')];
    const on = cards.filter((card) => card.querySelector('.Toggle.On')).length;
    SE.setText(
      summary,
      cards.length ? `${cards.length} installed · ${on} on` : 'Chrome extensions, running inside Steam'
    );
    SE.attr(root, 'data-se-ext-count', cards.length);

    let shown = 0;
    for (const card of cards) {
      const match = !query || text(card).includes(query);
      SE.attr(card, HIDDEN, !match);
      if (match) shown++;
    }

    if (query && cards.length && !shown) {
      SE.setText(empty, `No extensions match “${input.value.trim()}”.`);
      if (grid.nextElementSibling !== empty) grid.after(empty);
    } else if (empty.isConnected) {
      empty.remove();
    }
  }

  const watcher = SE.watch(update, { scope: ROOT, attributes: ['class'] });
  update();

  window[KEY] = {
    destroy() {
      watcher.disconnect();
      removeEventListener('keydown', onKey, true);
      detach();
      for (const card of document.querySelectorAll(`[${HIDDEN}]`)) SE.unmark(card, HIDDEN);
      SE.unmark(document.querySelector(ROOT), 'data-se-ext-count');
      delete window[KEY];
    },
  };
})(window.__se);
