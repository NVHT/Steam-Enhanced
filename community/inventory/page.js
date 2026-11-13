/*
 * Inventory (/id/<name>/inventory, /profiles/<steamid>/inventory): the parts CSS can't do alone.
 *
 *   - Hero: the Trade Offers / More... buttons (.inventory_rightnav) move into the profile
 *     header card, so the page opens on one header row. Moved back on destroy.
 *   - Game heading: Steam shows the active game as a bare logo image (#inventory_logos). A
 *     heading built from the active tab (icon, name, item count) replaces it and follows tab
 *     changes.
 *   - Tab counts: "(2,072)" becomes [data-se-count="2,072"] for a count chip.
 *   - Rarity: each item's quality colour (Steam's inline border-color on .item, the name colour
 *     in the item panel, classic or React) becomes --se-q, which the tile and panel glows read.
 *   - Sharper art: grid tiles are bigger than Steam's 96px, so 96fx96f item images are asked
 *     for at 192fx192f (the economy CDN sizes on request). Restored on destroy.
 *   - Item panel buttons: Steam's React panel draws them as padded links with hashed classes;
 *     they're found by their padding and tagged [data-se-btn] for the theme's pills.
 *   - Search placeholder, and an empty state for the item panel while nothing is selected.
 *
 * Steam ids and classes are economy_v2's (SteamTracking: steamcommunity.com/public/javascript/
 * economy_v2.js, css/skin_1/economy_inventory.css) and the page report.
 */
const ART = /\/(\d+)fx(\d+)f(dpx2x)?$/;
const ART_SIZE = '192fx192f';
const COUNT = /^\(?\s*([\d.,\s]+)\s*\)?$/;

export default (dom) => {
  const $ = dom.scope();
  const { el, mark, unmark, setText, setVar, squash } = dom;

  /* ---------- Hero: move the action buttons into the header card ---------- */

  const placeHero = () => {
    const nav = document.querySelector('.inventory_links .inventory_rightnav');
    const header = document.querySelector('.profile_small_header_texture');
    if (!nav || !header || nav.parentElement === header) return;
    const home = nav.parentElement;
    const anchor = document.createComment('se-inventory-rightnav');
    home.insertBefore(anchor, nav);
    mark(nav, 'data-se-inv-actions');
    header.append(nav);
    $.add(() => {
      unmark(nav, 'data-se-inv-actions');
      if (anchor.isConnected) anchor.replaceWith(nav);
    });
  };

  /* ---------- Game heading, from the active tab ---------- */

  const headIcon = el('img', { class: 'se-inv-head-icon', alt: '', 'aria-hidden': 'true' });
  const headName = el('h2', { class: 'se-inv-head-name' });
  const headCount = el('span', { class: 'se-inv-head-count' });
  const head = el('div', { class: 'se-inv-head', 'data-se-inv-head': true }, [
    headIcon,
    el('div', { class: 'se-inv-head-text' }, [headName, headCount]),
  ]);
  $.add(() => head.remove());

  const placeHead = () => {
    const logos = document.getElementById('inventory_logos');
    if (logos && head.previousElementSibling !== logos) logos.after(head);

    const tab = document.querySelector('.games_list_tab.active');
    head.hidden = !tab;
    if (!tab) return;
    const name = squash(tab.querySelector('.games_list_tab_name')?.textContent);
    const count = tab.querySelector('.games_list_tab_number')?.getAttribute('data-se-count') ?? '';
    const icon = tab.querySelector('.games_list_tab_icon img')?.src ?? '';
    setText(headName, name);
    setText(headCount, count ? `${count} ${count === '1' ? 'item' : 'items'}` : '');
    if (headIcon.getAttribute('src') !== icon) headIcon.src = icon;
    headIcon.hidden = !icon;
  };

  /* ---------- Tab counts ---------- */

  const tagCounts = () => {
    for (const number of document.querySelectorAll('.games_list_tab_number')) {
      const match = squash(number.textContent).match(COUNT);
      if (match) mark(number, 'data-se-count', match[1].trim());
    }
  };

  /* ---------- Rarity colours and sharper art ---------- */

  const upgraded = new Map(); // img -> original src

  const tagItems = () => {
    for (const item of document.querySelectorAll('.inventory_ctn .item')) {
      const colour = item.style.borderColor;
      if (colour) setVar(item, '--se-q', colour);
      const img = item.querySelector(':scope > img');
      if (!img || img.srcset || upgraded.has(img)) continue;
      const src = img.getAttribute('src') ?? '';
      if (!ART.test(src)) continue;
      upgraded.set(img, src);
      img.src = src.replace(ART, `/${ART_SIZE}`);
    }
  };
  $.add(() => {
    for (const [img, src] of upgraded) if (img.isConnected) img.src = src;
    upgraded.clear();
    for (const item of document.querySelectorAll('.inventory_ctn .item')) item.style.removeProperty('--se-q');
  });

  // The panel's name colour is the item's rarity: Steam's classic panel sets it inline on
  // .hover_item_name, the React one styles its h1; read whichever is there.
  const PANELS = '.inventory_page_right > [id^="iteminfo"]';

  const tagPanels = () => {
    for (const panel of document.querySelectorAll(PANELS)) {
      if (panel.style.display === 'none') continue;
      const name = panel.querySelector('.hover_item_name, h1 span, h1');
      const colour = name ? name.style.color || getComputedStyle(name).color : '';
      if (colour) setVar(panel, '--se-q', colour);
      else if (panel.style.getPropertyValue('--se-q')) panel.style.removeProperty('--se-q');
    }
  };
  $.add(() => {
    for (const panel of document.querySelectorAll(PANELS)) panel.style.removeProperty('--se-q');
  });

  // Steam's React panel draws its buttons as padded links with hashed classes. A link or button
  // with real padding is a button (inline text links have none); the first one is the main
  // action. Tagged [data-se-btn] for the pill style.
  const tagButtons = () => {
    for (const panel of document.querySelectorAll(`${PANELS}:not(.inventory_iteminfo)`)) {
      if (panel.style.display === 'none') continue;
      let first = true;
      for (const node of panel.querySelectorAll('a, button, [role="button"]')) {
        if (node.closest('h1') || node.querySelector('img')) continue;
        const padded = parseFloat(getComputedStyle(node).paddingLeft) >= 6;
        if (!padded && !node.hasAttribute('data-se-btn')) continue;
        mark(node, 'data-se-btn', first ? 'primary' : '');
        first = false;
      }
    }
  };
  $.add(() => {
    for (const node of document.querySelectorAll('[data-se-btn]')) node.removeAttribute('data-se-btn');
  });

  /* ---------- Search and the item panel's empty state ---------- */

  const filter = document.getElementById('filter_control');
  if (filter) {
    const before = filter.getAttribute('placeholder');
    filter.placeholder = 'Search items';
    filter.setAttribute('aria-label', 'Search items');
    $.add(() => {
      if (before == null) filter.removeAttribute('placeholder');
      else filter.setAttribute('placeholder', before);
      filter.removeAttribute('aria-label');
    });
  }

  const empty = el('div', { class: 'se-inv-empty', 'data-se-inv-empty': true }, [
    el('span', { class: 'se-inv-empty-icon', 'aria-hidden': 'true' }),
    el('strong', { text: 'No item selected' }),
    el('span', { text: 'Pick an item to see its details, tags and actions.' }),
  ]);
  $.add(() => empty.remove());

  const placeEmpty = () => {
    const right = document.querySelector('#active_inventory_page .inventory_page_right');
    if (right && empty.parentElement !== right) right.prepend(empty);
  };

  /* ---------- Run ---------- */

  const scan = () => {
    placeHero();
    tagCounts();
    placeHead();
    placeEmpty();
    tagItems();
    tagPanels();
    tagButtons();
  };

  $.observe(scan, { attributes: ['class', 'style'] });
  scan();

  return () => $.destroy();
};
