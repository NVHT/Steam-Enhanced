/*
 * Edit Profile (/id/<name>/edit/...): the parts CSS can't do alone.
 *
 * The editor is a React app (#react_root) whose classes are hashed per Steam build, so its parts
 * are found by structure and tagged [data-se-edit]; page.css styles the tags.
 *
 *   shell     the two-column box holding the menu and the editor
 *   nav       the menu column: the column holding the tab links (hrefs under /edit/)
 *   link      a tab ([aria-current] / .active marks the open one, Steam's own class)
 *   back      "Back to Your Profile" (the menu's first block)
 *   rule      the menu's dividers
 *   promo     the Points Shop link at the menu's foot
 *   main      the editor column (the menu's sibling)
 *   section   a titled group of fields: a short title line followed by a block of fields
 *   title     that title line
 *   actions   the row holding the Save / Cancel buttons
 *
 * Tags are re-applied as React re-renders (each tab swaps the editor's content) and removed on
 * destroy. Nothing is moved, so React's tree is never disturbed.
 */
const ATTR = 'data-se-edit';
const FIELDS = '.DialogInputLabelGroup, input:not([type="hidden"]), textarea, select, .DialogDropDown';

export default (dom) => {
  const $ = dom.scope();
  const { mark, squash } = dom;
  const tagged = new Set();

  const tag = (node, value) => {
    if (!node) return;
    mark(node, ATTR, value);
    tagged.add(node);
  };

  const findNav = (root) => {
    const links = [...root.querySelectorAll('a[href*="/edit/"]')];
    if (links.length < 3) return null;
    // The column that holds the tab links directly
    const counts = new Map();
    for (const link of links) counts.set(link.parentElement, (counts.get(link.parentElement) ?? 0) + 1);
    let best = null;
    for (const [parent, n] of counts) if (!best || n > counts.get(best)) best = parent;
    return best;
  };

  const tagNav = (nav) => {
    tag(nav, 'nav');
    const children = [...nav.children];
    children.forEach((child, index) => {
      if (child.matches('a[href*="/edit/"]')) tag(child, 'link');
      else if (!child.childElementCount && !squash(child.textContent)) tag(child, 'rule');
      else if (index === 0) tag(child, 'back');
      else if (child.querySelector('a') && index === children.length - 1) tag(child, 'promo');
    });
  };

  const isTitle = (node) => node && !node.childElementCount && squash(node.textContent).length > 0 && squash(node.textContent).length < 60;

  const tagMain = (main) => {
    tag(main, 'main');
    for (const block of main.querySelectorAll('form > div, form > * > div')) {
      const [first, second] = block.children;
      if (block.children.length >= 2 && isTitle(first) && second?.matches(`:has(${FIELDS})`)) {
        tag(block, 'section');
        tag(first, 'title');
      }
    }
    for (const button of main.querySelectorAll('button.DialogButton')) {
      const row = button.parentElement;
      if (row && row.querySelectorAll(':scope > button.DialogButton').length >= 2) tag(row, 'actions');
    }
  };

  const scan = () => {
    for (const node of tagged) if (!node.isConnected) tagged.delete(node);
    const root = document.getElementById('react_root');
    if (!root) return;
    const nav = findNav(root);
    if (!nav) return;
    tag(nav.parentElement, 'shell');
    tagNav(nav);
    const main = nav.nextElementSibling;
    if (main) tagMain(main);
  };

  $.add(() => {
    for (const node of tagged) node.removeAttribute(ATTR);
    tagged.clear();
  });

  $.observe(scan);
  scan();

  return () => $.destroy();
};
