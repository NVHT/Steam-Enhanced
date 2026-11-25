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
(() => {
  'use strict';
  const web = window.__seWeb;

  /* Each row's icon: a core mask (core/icons-*.css), drawn by shared/account.css (.se-account-icon) */
  const ICONS = {
    store: 'store',
    community: 'community',
    friends: 'bubble',
    profile: 'user',
    games: 'console',
    chosen: 'check-circle',
    dot: 'dot',
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

  const icon = (name) => {
    const node = document.createElement('span');
    node.className = 'se-account-icon';
    node.style.setProperty('--se-account-icon', `var(--se-icon-${ICONS[name] ?? ICONS.dot})`);
    node.setAttribute('aria-hidden', 'true');
    return node;
  };

  web.define(async (dom) => {
    await dom.ready();
    const box = document.querySelector('.parental_settings_box');
    if (!box) return () => {};

    const $ = dom.scope();
    const added = [];
    const rows = [];

    for (const row of box.querySelectorAll('.feature_row')) {
      const input = row.querySelector('input[type="checkbox"], input[type="radio"]');
      if (!input) continue;
      const kind = ICON_BY_ID.find(([test]) => test.test(input.id || input.name))?.[1] ?? 'dot';
      const chip = dom.el('span', { class: 'se-parental-chip', 'data-se-parental': 'chip' }, icon(kind));
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

    return () => {
      $.destroy();
      for (const row of rows) dom.unmark(row, 'data-se-parental-row');
      for (const node of added) node.remove();
    };
  });
})();
