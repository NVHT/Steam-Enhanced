/*
 * Account tables (Purchase History, Licenses): the parts both share, imported by their page
 * scripts (account-history/page.js, account-licenses/page.js); styled by account/table.css.
 *
 *   - a toolbar over the table: a search field, one chip per row type found so far (the page's
 *     own words, so in its language), and a count of what the filter shows
 *   - the table as a card whose header sticks under the store bar; once stuck
 *     ([data-se-table-stuck]) the page colour fills the gap above it
 *   - a "nothing matches" card in place of a table filtered away
 *
 * Rows Steam adds later (Load More) are read and filtered as they land. Nothing of Steam's
 * moves; destroy() takes the theme's parts and marks back off.
 */
const HIDDEN = 'data-se-table-hidden';
const ROW = 'data-se-table-row';
const STUCK = 'data-se-table-stuck';

const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  clear: '<path d="M7 7l10 10M17 7L7 17"/>',
};

const svg = (name) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name];
  return node;
};

/**
 * @param dom    the store runtime (shared/dom.js)
 * @param $      the page's scope; listeners and the observer are released with it
 * @param opts   table       the <table>
 *               head        what sticks: the <thead>, or the header <tr> when Steam puts it in the body
 *               rows        () => the data rows, in order
 *               typeOf      (row) => the row's type label, or null
 *               onRow       (row) => extra one-time work per row (optional)
 *               watch       the element Steam adds rows to (optional; default: no watching)
 *               placeholder, searchLabel, typesLabel, emptyText   the toolbar's words
 *               countText   (total) => the unfiltered count ("85 transactions")
 * @returns { apply, destroy }
 */
export const mountTable = (dom, $, opts) => {
  const { table, head, rows, typeOf, onRow, watch } = opts;
  const added = [];
  const add = (node) => (added.push(node), node);
  const tagged = new Set();
  const data = new WeakMap(); // row → { type, text }
  const types = new Map(); // type → chip
  const state = { query: '', type: null };

  dom.mark(table, 'data-se-table');
  if (head) dom.mark(head, 'data-se-table-head');

  /* ---------- Toolbar ---------- */

  const field = dom.el('input', {
    class: 'se-table-search-input',
    type: 'search',
    placeholder: opts.placeholder,
    'aria-label': opts.searchLabel,
    autocomplete: 'off',
    spellcheck: false,
  });
  const clear = dom.el('button', { class: 'se-table-search-clear', type: 'button', 'aria-label': 'Clear search', hidden: true }, svg('clear'));
  const search = dom.el('label', { class: 'se-table-search' }, [svg('search'), field, clear]);
  const all = dom.el('button', { class: 'se-table-chip', type: 'button', text: 'All', 'aria-pressed': 'true' });
  const chips = dom.el('div', { class: 'se-table-chips', role: 'group', 'aria-label': opts.typesLabel }, all);
  const count = dom.el('span', { class: 'se-table-count', 'aria-live': 'polite' });
  table.before(add(dom.el('div', { class: 'se-table-toolbar', 'data-se-table': 'toolbar' }, [search, chips, count])));

  const empty = add(dom.el('div', { class: 'se-table-empty', 'data-se-table': 'empty', hidden: true, text: opts.emptyText }));
  table.after(empty);

  /* ---------- Rows and filter ---------- */

  const read = (row) => {
    if (tagged.has(row)) return;
    tagged.add(row);
    dom.mark(row, ROW);
    const type = typeOf(row);
    data.set(row, { type, text: dom.squash(row.textContent).toLocaleLowerCase() });
    if (type && !types.has(type)) {
      const chip = dom.el('button', { class: 'se-table-chip', type: 'button', text: type, 'aria-pressed': 'false' });
      chip.dataset.type = type;
      types.set(type, chip);
      chips.append(chip);
    }
    onRow?.(row);
  };

  const apply = () => {
    const words = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let total = 0;
    let shown = 0;
    for (const row of rows()) {
      read(row);
      total++;
      const { type, text } = data.get(row);
      if ((!state.type || type === state.type) && words.every((word) => text.includes(word))) {
        shown++;
        dom.unmark(row, HIDDEN);
      } else {
        dom.mark(row, HIDDEN);
      }
    }
    const filtered = Boolean(words.length || state.type);
    dom.setText(count, filtered ? `${shown} of ${total} shown` : opts.countText(total));
    empty.hidden = !(filtered && total && !shown);
    chips.hidden = types.size < 2; // one type is no choice
    for (const chip of [all, ...types.values()]) {
      dom.mark(chip, 'aria-pressed', String(chip === all ? !state.type : chip.dataset.type === state.type));
    }
  };

  let typing = 0;
  $.listen(field, 'input', () => {
    clear.hidden = !field.value;
    clearTimeout(typing);
    typing = setTimeout(() => {
      state.query = field.value.trim();
      apply();
    }, 120);
  });
  $.add(() => clearTimeout(typing));
  $.listen(field, 'keydown', (event) => {
    if (event.key !== 'Escape' || !field.value) return;
    event.preventDefault();
    clear.click();
  });
  $.listen(clear, 'click', () => {
    field.value = '';
    clear.hidden = true;
    state.query = '';
    apply();
    field.focus();
  });
  $.listen(chips, 'click', (event) => {
    const chip = event.target.closest('.se-table-chip');
    if (!chip) return;
    state.type = chip === all || chip.dataset.type === state.type ? null : chip.dataset.type;
    apply();
  });
  if (watch) $.observe(apply, { filter: (record) => record.target === watch });

  /* ---------- Sticky header: mark when it has left its place ---------- */

  if (head) {
    const check = dom.perFrame(() => {
      if (head.getBoundingClientRect().top - table.getBoundingClientRect().top > 1) dom.mark(table, STUCK);
      else dom.unmark(table, STUCK);
    });
    $.listen(window, 'scroll', check, { passive: true });
    $.listen(window, 'resize', check, { passive: true });
    $.add(check.cancel);
    check();
  }

  apply();

  return {
    apply,
    destroy() {
      for (const row of tagged) {
        row.removeAttribute(ROW);
        row.removeAttribute(HIDDEN);
      }
      for (const node of [table, head]) node?.removeAttribute('data-se-table-head');
      for (const name of ['data-se-table', STUCK]) table.removeAttribute(name);
      for (const node of added.reverse()) node.remove();
    },
  };
};
