/*
 * The one dropdown on the web (web/shared/select.css styles it): a field-like button showing the choice
 * and the theme's menu as its list. Steam's own dropdowns stay in the page, hidden, as the
 * source of truth; the theme's stands in for them, so every dropdown opens, looks and works the
 * same.
 *
 *   enhanceSelect(dom, $, select)               a <select>: choosing sets its value and fires
 *                                               (returns render(), call it after changing the
 *                                               options; render.root is the dropdown)
 *                                               its change event, so Steam's handlers (inline
 *                                               onchange included) run as before.
 *   enhanceDivSelect(dom, $, trigger, list, opt) Steam's script-driven div dropdowns (the hub's
 *                                               filters, the guides' period, the discussions'
 *                                               quick list): choosing clicks Steam's own option.
 *                                               opt: { option: selector of an option in list,
 *                                               name: the dropdown's name for screen readers }.
 *   shownChoice(dom, trigger, list)             a div dropdown's shown choice, as text.
 *   hideSource($, node)                         hide a Steam dropdown part the theme stands in
 *                                               for (another control, like the hub's chips).
 *   findList(trigger, selector)                 a div dropdown's list: inside it, right after it,
 *                                               paired by id (<id>_options), the first one after
 *                                               it beside it, or the page's only one.
 *
 * Keyboard: on the button, ArrowDown/ArrowUp/Enter/Space open the list; in it, the arrows,
 * Home and End move, typing jumps to an option, Enter/Space choose, Escape closes and Tab closes
 * and moves on. Everything it adds is released by $.destroy().
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const NATIVE = 'data-se-select-native';
  let uid = 0;

  /**
   * The dropdown over a source: { items() -> [{ text, selected, disabled }], choose(index),
   * disabled(), name, caption() (shown when no option is selected) }. Placed after `anchor`. Returns render(), to call when the source changes.
   */
  const buildDropdown = (dom, $, anchor, source) => {
    const id = `se-select-${(uid += 1)}`;
    const label = dom.el('span', { class: 'se-select__label' });
    const button = dom.el('button', {
      class: 'se-select__button',
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': id,
    }, [label]);
    const list = dom.el('div', { class: 'se-select__list', id, role: 'listbox', tabIndex: -1, hidden: true });
    const root = dom.el('div', { class: 'se-select' }, [button, list]);
    if (source.name) button.setAttribute('aria-label', dom.squash(source.name));
    anchor.after($.owned(root));

    let active = -1;
    const rows = () => [...list.children];

    const render = () => {
      const items = source.items();
      list.replaceChildren(...items.map((item, index) =>
        dom.el('div', {
          class: 'se-select__option',
          id: `${id}-${index}`,
          role: 'option',
          text: item.text,
          'aria-selected': String(item.selected),
          'aria-disabled': item.disabled ? 'true' : null,
          'data-index': String(index),
        })));
      // A menu whose choice isn't one of its options (a quick list) shows its own caption
      dom.setText(label, items.find((item) => item.selected)?.text ?? source.caption?.() ?? '');
      button.disabled = source.disabled();
    };

    const setActive = (index) => {
      const all = rows();
      if (!all.length) return;
      active = Math.max(0, Math.min(all.length - 1, index));
      all.forEach((row, i) => row.toggleAttribute('data-active', i === active));
      list.setAttribute('aria-activedescendant', all[active].id);
      all[active].scrollIntoView({ block: 'nearest' });
    };

    // Clicks outside close the list; listened to only while it is open
    const outside = (event) => {
      if (!root.contains(event.target)) close(false);
    };

    const open = () => {
      if (button.disabled || !list.hidden) return;
      render(); // Steam may have changed the options or the value since
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      setActive(source.items().findIndex((item) => item.selected));
      list.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
    };

    function close(refocus = true) {
      if (list.hidden) return;
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      list.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', outside, true);
      if (refocus) button.focus({ preventScroll: true });
    }

    const choose = (index) => {
      const item = source.items()[index];
      if (!item || item.disabled) return;
      close();
      if (item.selected) return;
      source.choose(index);
      render();
    };

    let typed = '';
    let typedAt = 0;
    const typeahead = (key) => {
      const now = performance.now();
      typed = now - typedAt > 700 ? key : typed + key;
      typedAt = now;
      const match = rows().findIndex((row) => row.textContent.toLowerCase().startsWith(typed.toLowerCase()));
      if (match >= 0) setActive(match);
    };

    $.listen(button, 'click', () => (list.hidden ? open() : close()));
    $.listen(button, 'keydown', (event) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      }
    });

    $.listen(list, 'click', (event) => {
      const row = event.target.closest?.('.se-select__option');
      if (row) choose(Number(row.dataset.index));
    });

    $.listen(list, 'pointermove', (event) => {
      const row = event.target.closest?.('.se-select__option');
      if (row) setActive(Number(row.dataset.index));
    });

    $.listen(list, 'keydown', (event) => {
      const last = rows().length - 1;
      const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + 8, PageUp: active - 8 };
      if (event.key in moves) {
        event.preventDefault();
        setActive(moves[event.key]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(active);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        close(false);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        typeahead(event.key);
      }
    });

    render();
    $.add(() => document.removeEventListener('pointerdown', outside, true));
    render.root = root;
    return render;
  };

  /** Hide one of Steam's dropdown parts the theme stands in for; destroy() shows it again. */
  const hideSource = ($, node) => {
    if (node) $.mark(node, NATIVE);
  };

  const enhanceSelect = (dom, $, select) => {
    if (select.hasAttribute(NATIVE) || select.multiple) return;
    const render = buildDropdown(dom, $, select, {
      // The select's own name: its <label> or aria-label, if Steam gave one
      name: select.getAttribute('aria-label') || select.labels?.[0]?.textContent,
      items: () => [...select.options].map((option) => ({ text: option.textContent, selected: option.selected, disabled: option.disabled })),
      choose: (index) => {
        select.selectedIndex = index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
      disabled: () => select.disabled,
    });
    hideSource($, select);
    // Steam can change the value from its own scripts (reset filters): keep the button in step
    $.listen(select, 'change', render);
    return render;
  };

  const findList = (trigger, selector) => {
    const inside = trigger.querySelector(selector);
    if (inside) return inside;
    if (trigger.nextElementSibling?.matches(selector)) return trigger.nextElementSibling;
    const paired = trigger.id && document.getElementById(`${trigger.id}_options`);
    if (paired?.matches(selector)) return paired;
    const later = [...(trigger.parentElement?.querySelectorAll(selector) ?? [])].find(
      (node) => trigger.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    if (later) return later;
    const all = document.querySelectorAll(selector);
    return all.length === 1 ? all[0] : null;
  };

  /** A div dropdown's shown choice: its text without the text of a list nested in it. */
  const shownChoice = (dom, trigger, list) =>
    dom.squash([...trigger.childNodes].filter((node) => node !== list && !node.contains?.(list)).map((node) => node.textContent).join(' '));

  const enhanceDivSelect = (dom, $, trigger, list, { option = '.option', name = null } = {}) => {
    if (!trigger || !list || trigger.hasAttribute(NATIVE)) return false;
    const options = () => [...list.querySelectorAll(option)];
    if (options().length < 2) return false;
    const render = buildDropdown(dom, $, trigger, {
      name,
      items: () => {
        const shown = shownChoice(dom, trigger, list);
        return options().map((node) => {
          const text = dom.squash(node.textContent);
          return { text, selected: text === shown, disabled: false };
        });
      },
      choose: (index) => options()[index]?.click(),
      disabled: () => false,
      caption: () => shownChoice(dom, trigger, list),
    });
    hideSource($, trigger);
    hideSource($, list);
    // Steam rewrites the shown choice from its own scripts: keep the button in step
    $.observe(render, { filter: (record) => trigger.contains(record.target) });
    return true;
  };

  web.parts.select = { hideSource, enhanceSelect, findList, shownChoice, enhanceDivSelect };
})();
