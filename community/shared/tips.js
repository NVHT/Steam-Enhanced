/*
 * Community title tooltips. The browser draws an element's `title` as a light system box that
 * CSS can't reach; titleTips() moves the title of every element matching `selector` to
 * [data-se-tip] (and to aria-description, so it is still announced) and shows it in the
 * theme's tooltip (.se-tip, shared/ui.css) on hover or keyboard focus.
 *
 *   const tips = titleTips(dom, selector)
 *   tips.scan()     take the titles of matching elements (call on page changes)
 *   tips.destroy()  put every title back and remove the tooltip
 *
 * The tooltip sits under its element, or over it when there is no room below, and stays
 * inside the window.
 */
const DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;

export const titleTips = (dom, selector) => {
  const $ = dom.scope();
  const tip = dom.el('div', { class: 'se-tip', role: 'tooltip', hidden: true });
  let target = null;
  let timer = 0;

  const scan = () => {
    for (const node of document.querySelectorAll(selector)) {
      const text = node.getAttribute('title')?.trim();
      node.removeAttribute('title');
      if (!text) continue;
      node.setAttribute('data-se-tip', text);
      node.setAttribute('aria-description', text);
    }
  };

  const place = (node) => {
    const box = node.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, EDGE), innerWidth - width - EDGE);
    const below = box.bottom + GAP;
    const top = below + height > innerHeight - EDGE ? Math.max(box.top - height - GAP, EDGE) : below;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };

  const show = (node) => {
    if (!node.isConnected) return;
    if (!tip.isConnected) document.body.append(tip);
    tip.textContent = node.getAttribute('data-se-tip');
    tip.hidden = false;
    place(node);
  };

  const hide = () => {
    clearTimeout(timer);
    timer = 0;
    target = null;
    tip.hidden = true;
  };

  const tipOf = (event) => (event.target instanceof Element ? event.target.closest('[data-se-tip]') : null);

  $.listen(document, 'pointerover', (event) => {
    const node = tipOf(event);
    if (node === target) return;
    hide();
    if (!node) return;
    target = node;
    timer = setTimeout(() => show(node), DELAY_MS);
  });

  $.listen(document, 'pointerout', (event) => {
    if (!target) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    hide();
  });

  $.listen(document, 'focusin', (event) => {
    const node = tipOf(event);
    hide();
    if (!node) return;
    target = node;
    show(node);
  });

  $.listen(document, 'focusout', hide);
  $.listen(document, 'pointerdown', hide, true);
  $.listen(document, 'scroll', hide, { capture: true, passive: true });
  $.listen(document, 'keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  $.add(() => {
    hide();
    tip.remove();
    for (const node of document.querySelectorAll('[data-se-tip]')) {
      node.setAttribute('title', node.getAttribute('data-se-tip'));
      node.removeAttribute('data-se-tip');
      node.removeAttribute('aria-description');
    }
  });

  return { scan, destroy: () => $.destroy() };
};
