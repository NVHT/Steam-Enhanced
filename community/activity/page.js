/*
 * Friend Activity (/id/<name>/home): the parts CSS can't do alone.
 *
 *   - Rails: Steam keeps your menu, the friends list button, friends in-game, add friends,
 *     events and groups in one box (#friendactivity_right_column .friends_launch_area). Above
 *     Steam's 910px breakpoint they move into a left rail (you and your shortcuts) and a right
 *     column (friends, events, groups), with friends in-game wrapped into one card; the page
 *     gets [data-se-arranged]. Below it, or on destroy, every node moves back so Steam's own
 *     responsive menu finds its box intact.
 *   - Type chips: each event card gets one ("Purchase", "Review", "Workshop"...). Steam wraps
 *     each event in a per-type panel (.blotter_workshopitempublished...); matched by class
 *     prefix, first match wins, unlisted types get none.
 *   - Wide art: workshop previews are sized for Steam's 200px thumbnail (?imw=200&imh=150...).
 *     Shown full-width here, they're asked for at feed width instead. Restored on destroy.
 *   - "+N" tiles: the "+2" Steam ends a long purchase with gets [data-se-more] (found by its
 *     text) so it can match the game capsules.
 *   - Duotone icons: the menu's small grey icons (and the friends list / groups buttons') are
 *     replaced by the theme's two-tone ones (shared/icons.js), matched by link path. A link
 *     with no matching icon keeps Steam's.
 *
 * The feed loads more as you scroll: new blocks are handled as they arrive.
 */
const versioned = (file) => {
  const url = new URL(file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
};
const { iconFor, duoIcon } = await import(versioned('../shared/icons.js'));

const WIDE = '(min-width: 911px)';
const ART_WIDTH = 1520; // the feed's width at 2x
const ART_HEIGHT = 1120;

const KINDS = [
  ['blotter_gamepurchase', 'purchase', 'Purchase'],
  ['blotter_recommendation', 'review', 'Review'],
  ['blotter_screenshot', 'screenshot', 'Screenshot'],
  ['blotter_video', 'video', 'Video'],
  ['blotter_workshopitem', 'workshop', 'Workshop'],
  ['blotter_userstats', 'achievement', 'Achievements'],
  ['blotter_userstatus', 'status', 'Status'],
  ['blotter_group', 'group', 'Group'],
  ['blotter_daily_rollup', 'rollup', 'Activity'],
];

export default (dom) => {
  const $ = dom.scope();
  const { el, mark, unmark } = dom;

  /* ---------- Rails ---------- */

  const rail = el('aside', { class: 'se-activity-rail', 'aria-label': 'Your shortcuts' });
  const side = el('aside', { class: 'se-activity-side', 'aria-label': 'Friends and events' });
  const friends = el('section', { class: 'se-activity-friends', 'aria-label': 'Friends in-game' });
  const moves = []; // [node, comment holding its place], in move order
  const wide = window.matchMedia(WIDE);

  const move = (node, parent) => {
    if (!node || node.parentElement === parent) return;
    const anchor = document.createComment('se-activity');
    node.before(anchor);
    moves.push([node, anchor]);
    parent.append(node);
  };

  const arrange = () => {
    const page = document.getElementById('blotter_page');
    const box = page?.querySelector('#friendactivity_right_column .friends_launch_area');
    if (!page || !box) return;

    if (rail.parentElement !== page) page.append(rail);
    if (side.parentElement !== page) page.append(side);

    move(box.querySelector(':scope > .profile_link_block'), rail);

    move(box.querySelector(':scope > a.nohover:has(> .friends_link_block)'), side);
    if (friends.parentElement !== side) side.append(friends);
    move(box.querySelector(':scope > .profile_friends_ingame'), friends);
    for (const node of box.querySelectorAll(':scope > :is(.friendBlock, .profile_friends_ingame_viewall)')) move(node, friends);
    move(box.querySelector(':scope > .friends_add_block'), side);
    move(box.querySelector(':scope > .blotter_eventsblock'), side);
    move(box.querySelector(':scope > .profile_group_block'), side);

    friends.hidden = !friends.childElementCount;
    mark(page, 'data-se-arranged');
  };

  const restore = () => {
    for (const [node, anchor] of moves.splice(0).reverse()) {
      if (anchor.isConnected) anchor.replaceWith(node);
      else anchor.remove();
    }
    rail.remove();
    side.remove();
    friends.remove();
    const page = document.getElementById('blotter_page');
    if (page) unmark(page, 'data-se-arranged');
  };

  $.listen(wide, 'change', () => (wide.matches ? arrange() : restore()));
  $.add(restore);

  /* ---------- Type chips ---------- */

  const chips = new Set();

  const kindOf = (block) => {
    const classes = [...block.querySelectorAll(':scope > [class*="blotter_"], :scope > * > [class*="blotter_"]')].flatMap(
      (node) => [...node.classList],
    );
    return KINDS.find(([prefix]) => classes.some((cls) => cls.startsWith(prefix)));
  };

  const tagKinds = () => {
    for (const block of document.querySelectorAll('.blotter_block:not([data-se-kind])')) {
      const kind = kindOf(block);
      mark(block, 'data-se-kind', kind?.[1] ?? '');
      if (!kind) continue;
      const chip = el('span', { class: 'se-activity-kind', 'data-se-kind': kind[1], text: kind[2] });
      const author = block.querySelector('.blotter_author_block');
      if (author) author.append(chip);
      else block.prepend(chip);
      chips.add(chip);
    }
  };

  $.add(() => {
    for (const chip of chips) chip.remove();
    chips.clear();
    for (const block of document.querySelectorAll('.blotter_block[data-se-kind]')) block.removeAttribute('data-se-kind');
  });

  /* ---------- Wide art ---------- */

  const upgraded = new Map(); // img -> original src

  const widenArt = () => {
    for (const img of document.querySelectorAll('.blotter_workshopitem_preview img')) {
      if (upgraded.has(img)) continue;
      const src = img.getAttribute('src') ?? '';
      let url;
      try {
        url = new URL(src, location.href);
      } catch {
        continue;
      }
      if (!url.searchParams.has('imw')) continue;
      upgraded.set(img, src);
      url.searchParams.set('imw', String(ART_WIDTH));
      url.searchParams.set('imh', String(ART_HEIGHT));
      url.searchParams.delete('impolicy'); // Steam's letterbox: the feed shows the art as is
      url.searchParams.set('ima', 'fit');
      img.src = url.href;
    }
  };

  $.add(() => {
    for (const [img, src] of upgraded) if (img.isConnected) img.src = src;
    upgraded.clear();
  });

  /* ---------- Duotone icons ---------- */

  // [link, icon to use when the path has none]: menu items, the friends list and groups buttons
  const iconLinks = () => [
    ...[...document.querySelectorAll('.profile_menu_item > a')].map((a) => [a, null]),
    ...[...document.querySelectorAll('a.nohover:has(> .friends_link_block)')].map((a) => [a, 'friends']),
    ...[...document.querySelectorAll('.profile_group_block > a.nohover:has(.profile_view_group_text)')].map((a) => [a, 'groups']),
  ];

  const icons = new Set();

  const swapIcons = () => {
    for (const [link, fallback] of iconLinks()) {
      if (link.hasAttribute('data-se-duo')) continue;
      const name = iconFor(link.getAttribute('href') ?? '') ?? fallback;
      const img = link.querySelector('img');
      const icon = name && img ? duoIcon(name) : null;
      mark(link, 'data-se-duo', icon ? name : '');
      if (!icon) continue;
      img.before(icon);
      icons.add(icon);
    }
  };

  $.add(() => {
    for (const icon of icons) icon.remove();
    icons.clear();
    for (const link of document.querySelectorAll('[data-se-duo]')) link.removeAttribute('data-se-duo');
  });

  /* ---------- "+N" tiles ---------- */

  // Purchases of more than three games end with a "+2" tile; Steam gives it no stable class,
  // so it's found by its text.
  const MORE = /^\+\s?\d+$/;

  const tagMore = () => {
    for (const node of document.querySelectorAll('.blotter_gamepurchase_content :is(div, span, a):not([data-se-more])')) {
      if (node.childElementCount || !MORE.test(node.textContent.trim())) continue;
      mark(node, 'data-se-more');
    }
  };

  $.add(() => {
    for (const node of document.querySelectorAll('[data-se-more]')) node.removeAttribute('data-se-more');
  });

  /* ---------- Run ---------- */

  const scan = () => {
    if (wide.matches) arrange();
    tagKinds();
    widenArt();
    swapIcons();
    tagMore();
  };

  $.observe(scan);
  scan();

  return () => $.destroy();
};
