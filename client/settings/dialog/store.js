/*
 * Steam Settings › Store: a hero over Steam's preference rows, laid out as tiles in three groups
 * (styles: client/settings/pages-store.css, the card pages-hero.css).
 *
 * The hero shows the theme's Store front page on its right, drawn as the theme's wireframe
 * (SE.wireframe, view 'store': its store bar, Cinema hero, deal tiles and tabbed list, the client
 * around it left out), rising from the card's foot. Steam's seven rows (each a label, a line and
 * a Manage button that opens its page of Store preferences) become tiles: What you see (Mature
 * content, Exclude from my Store, Platforms), Queues (Discovery, New on Steam) and More (Steam
 * Deck feedback, Live broadcasts). A row is told by its label, as the page's row icons are (shared.js ROW_ICONS gives each its icon); one this doesn't know joins
 * More. The groups' order is CSS's (each row marked with its group), so Steam's nodes never
 * move; the headings are the theme's own. A click anywhere on a tile runs its Manage button.
 */
((SE) => {
  window.__seSettingsStorePage?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { el } = SE;
  const GROUP = 'data-se-store-group';

  // A row's label → its group; the order is the groups' and, inside one, the tiles'
  const ROWS = [
    [/^mature content/i, 'see'],
    [/^exclude from my store/i, 'see'],
    [/^platform preference/i, 'see'],
    [/^discovery queue/i, 'queues'],
    [/^new on steam queue/i, 'queues'],
    [/^steam deck feedback/i, 'more'],
    [/^live broadcasts/i, 'more'],
  ];
  const GROUPS = [
    ['see', 'What you see'],
    ['queues', 'Queues'],
    ['more', 'More'],
  ];

  const view = ns.pageView({
    route: 'store',
    make(body) {
      const hero = ns.pageHero();
      // The theme's Store front page, its page alone (pages-store.css leaves out the client)
      if (SE.wireframe) {
        const front = el('div', 'se-store-front');
        front.innerHTML = SE.wireframe({ view: 'store' });
        hero.side.append(front);
      }
      hero.title('Your Store');
      hero.line('What it shows you, and how it asks');
      // The groups' headings, placed by CSS order among Steam's rows (ignored as the view is)
      const heads = GROUPS.map(([key, name]) => {
        const head = el('div', 'se-store-head se-page-view', name);
        head.dataset.group = key;
        return head;
      });
      body.append(...heads);
      return {
        root: hero.root,
        body,
        destroy() {
          for (const head of heads) head.remove();
          for (const field of body.querySelectorAll(`[${GROUP}]`)) {
            SE.unmark(field, GROUP);
            SE.cssVar(field, '--se-store-i', null);
          }
        },
      };
    },
    read: () => null,
    // Each row's group and its place in it (CSS order), kept as Steam redraws
    draw(v) {
      for (const field of v.body.querySelectorAll(`:scope > ${ns.FIELD}`)) {
        const label = ns.fieldLabel(field);
        const index = ROWS.findIndex(([re]) => re.test(label));
        SE.attr(field, GROUP, index < 0 ? 'more' : ROWS[index][1]);
        SE.cssVar(field, '--se-store-i', String(index < 0 ? ROWS.length : index));
      }
    },
  });

  // A click on a tile, off its button: the tile's Manage runs
  const onClick = (event) => {
    const field = event.target.closest?.(`${view.PAGE} [${GROUP}]`);
    if (!field || event.target.closest('button')) return;
    field.querySelector('button.DialogButton')?.click();
  };
  document.addEventListener('click', onClick);

  window.__seSettingsStorePage = {
    destroy() {
      view.destroy();
      document.removeEventListener('click', onClick);
      delete window.__seSettingsStorePage;
    },
  };
})(window.__se);
