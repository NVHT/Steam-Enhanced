/*
 * Family View (/parental/...): Steam's setup steps, one form at a time inside
 * .parental_settings_box. page.css turns the box into a card and each .feature_row (a checkbox
 * or radio and its label) into a row with a switch; this gives every row an icon chip and makes
 * the whole row toggle its input, not just the label.
 *
 * Icons follow the input's id (store, community, friends ...), the same in every language.
 * Steam swaps steps by showing and hiding forms already on the page, so every row is read
 * once at start. Nothing of Steam's moves; destroy() removes the chips.
 */
const ICONS = {
  store: '<path class="d" d="M5 8h14l-1.2 10.5a1.5 1.5 0 0 1-1.5 1.5H7.7a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M5 8h14l-1.2 10.5a1.5 1.5 0 0 1-1.5 1.5H7.7a1.5 1.5 0 0 1-1.5-1.5zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  community: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
  friends: '<path class="d" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4h0A2 2 0 0 1 4 14z"/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4A2 2 0 0 1 4 14zM9 10h.01M12 10h.01M15 10h.01"/>',
  profile: '<circle class="d" cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  games: '<rect class="d" x="3" y="7" width="18" height="11" rx="4"/><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 14h.01"/>',
  chosen: '<rect class="d" x="4" y="4" width="16" height="16" rx="3"/><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  dot: '<circle class="d" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/>',
};

/* Input ids to icons; first match wins ("nogames" is the chosen-games radio before it is games) */
const ICON_BY_ID = [
  [/^no_?games|choose|select/i, 'chosen'],
  [/game|library/i, 'games'],
  [/store/i, 'store'],
  [/community|ugc|workshop|market/i, 'community'],
  [/friend|chat/i, 'friends'],
  [/profile|info/i, 'profile'],
];

const svg = (name) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name] ?? ICONS.dot;
  return node;
};

export default async (dom) => {
  await dom.ready();
  const box = document.querySelector('.parental_settings_box');
  if (!box) return () => {};

  const $ = dom.scope();
  const added = [];
  const rows = [];

  for (const row of box.querySelectorAll('.feature_row')) {
    const input = row.querySelector('input[type="checkbox"], input[type="radio"]');
    if (!input) continue;
    const icon = ICON_BY_ID.find(([test]) => test.test(input.id || input.name))?.[1] ?? 'dot';
    const chip = dom.el('span', { class: 'se-parental-chip', 'data-se-parental': 'chip' }, svg(icon));
    row.prepend(chip);
    added.push(chip);
    dom.mark(row, 'data-se-parental-row', input.type);
    rows.push(row);
  }

  // The whole row toggles; the label and the input already do on their own
  $.listen(box, 'click', (event) => {
    const row = event.target.closest('[data-se-parental-row]');
    if (!row || event.target.closest('input, label, a, button')) return;
    row.querySelector('input')?.click();
  });

  dom.mark(document.documentElement, 'data-se-parental-ready');

  return () => {
    $.destroy();
    for (const row of rows) dom.unmark(row, 'data-se-parental-row');
    for (const node of added) node.remove();
    dom.unmark(document.documentElement, 'data-se-parental-ready');
  };
};
