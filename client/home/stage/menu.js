/*
 * The Home's settings menus: one at a time, over the page by the button that opened it (the
 * stage's sliders button, a panel's ⋯), in the theme's menu language (the game-type menu,
 * client/navigation/sidebar-icons.css): a header (the title, a control at its right if given), rows that
 * light up on hover with a mark at their end, headings and dividers, Reset as the last row.
 * It closes on Escape, a click outside or its button again; every change applies at once.
 * Rows the caller can use:
 *   segment()     a label and a segmented control (data-set / data-val); segButtons() alone
 *   option()      a row choosing one of several: icon, name, a line under it, a round mark
 *                 (data-set / data-val)
 *   toggle()      an on/off row with a square mark (data-toggle)
 *   radio()       a row with a radio input (onChange), for long lists such as collections
 *   group()       a heading, a control at its right if given
 *   openMenu(anchor, { label, title, head, paint, foot, side, onClick, onChange, onReset })
 *     head()         markup at the title's right (a segmented control), repainted with the body
 *     paint()        the body's markup, called on open and on repaintMenu()
 *     onClick(e)     a click inside, after the menu's own buttons
 *     onChange(e)    a radio changed
 *     onKeyDown(e), onMouseDown(e)  a key or a press inside (a list the caller lets you reorder)
 *     foot           rows after Reset in the footer (markup, painted once)
 *     side           'below' or 'above' its button, when it takes a popup's place (placePop)
 *     onReset()      the Reset row (none without it)
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;

  const esc = SE.esc;

  let menu = null;
  let anchor = null;
  let opts = null;
  // Below or above its button, kept while open (placePop)
  let side = null;

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    opts = null;
    side = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', placeMenu);
    anchor?.setAttribute('aria-expanded', 'false');
    anchor = null;
  }

  function onOutside(e) {
    if (menu && !menu.contains(e.target) && !anchor?.contains(e.target)) closeMenu();
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !menu) return;
    e.stopPropagation();
    const a = anchor;
    closeMenu();
    a?.focus();
  }

  /**
   * Places a popup (a menu, a picker) by its button: below when it fits, else on the side with
   * more room, and keeps `side` once chosen (the edge by the button fixed, so a list opening
   * inside it grows away from the button instead of moving it) unless it no longer fits there
   * and the other side has more room. Never taller than its side's room: past that it scrolls
   * inside, so it never runs out of a short window. Returns the side.
   */
  function placePop(el, button, side) {
    const r = button.getBoundingClientRect();
    const GAP = 8;
    const EDGE = 12;
    const room = {
      below: Math.max(0, innerHeight - r.bottom - GAP - EDGE),
      above: Math.max(0, r.top - GAP - EDGE),
    };
    const other = (s) => (s === 'below' ? 'above' : 'below');
    // Its full height: the inline cap off for the read (the stylesheet's 100vh cap stays)
    el.style.maxHeight = 'none';
    const need = el.offsetHeight;
    let s = side && (need <= room[side] || room[side] >= room[other(side)]) ? side : null;
    s ??= need <= room.below || room.below >= room.above ? 'below' : 'above';
    const w = el.offsetWidth;
    el.style.left = `${Math.max(EDGE, Math.min(r.right - w, innerWidth - w - EDGE))}px`;
    if (s === 'below') {
      el.style.top = `${r.bottom + GAP}px`;
      el.style.bottom = '';
    } else {
      el.style.top = '';
      el.style.bottom = `${innerHeight - r.top + GAP}px`;
    }
    el.style.maxHeight = `${room[s]}px`;
    return s;
  }

  function placeMenu() {
    if (!menu || !anchor?.isConnected) {
      closeMenu();
      return;
    }
    side = placePop(menu, anchor, side);
  }

  /** Repaint the body, keeping focus on the control that had it (by data-set/val or name/value). */
  function repaintMenu() {
    if (!menu) return;
    const active = document.activeElement;
    const key = active && menu.contains(active)
      ? active.dataset.set
        ? `[data-set="${active.dataset.set}"][data-val="${active.dataset.val}"]`
        : active.name
          ? `input[name="${active.name}"][value="${CSS.escape(active.value)}"]`
          : active.dataset.act
            ? `[data-act="${active.dataset.act}"]`
            : active.dataset.toggle
              ? `[data-toggle="${active.dataset.toggle}"]`
              : active.dataset.panel
                ? `[data-panel="${active.dataset.panel}"]`

              : null
      : null;
    menu.querySelector('.se-hs-mn-body').innerHTML = opts.paint();
    menu.querySelector('.se-hs-mn-head').innerHTML = opts.head?.() || '';
    placeMenu();
    if (key) menu.querySelector(key)?.focus();
  }

  function openMenu(button, options) {
    if (menu && anchor === button) {
      closeMenu();
      return;
    }
    closeMenu();
    ns.closePick();
    anchor = button;
    opts = options;
    side = options.side || null;
    anchor.setAttribute('aria-expanded', 'true');
    menu = document.createElement('div');
    menu.className = 'se-hs-pick se-hs-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', options.label);
    menu.innerHTML =
      `<div class="se-hs-mn-sum"><span class="se-hs-mn-title">${esc(options.title)}</span><span class="se-hs-mn-head"></span></div>` +
      '<div class="se-hs-mn-body"></div>' +
      (options.onReset || options.foot
        ? '<div class="se-hs-mn-foot">' +
          (options.onReset
            ? '<button type="button" class="se-hs-mn-row" data-mn-reset>' +
              '<span class="se-hs-mn-icon" style="--se-hs-mn-icon: var(--se-icon-restore)"></span>' +
              '<span class="se-hs-mn-name">Reset to defaults</span></button>'
            : '') +
          (options.foot || '') +
          '</div>'
        : '');
    menu.addEventListener('click', (e) => {
      if (e.target.closest('[data-mn-close]')) {
        closeMenu();
        return;
      }
      if (e.target.closest('[data-mn-reset]')) {
        opts.onReset();
        repaintMenu();
        return;
      }
      opts.onClick?.(e);
    });
    menu.addEventListener('change', (e) => opts.onChange?.(e));
    menu.addEventListener('keydown', (e) => opts.onKeyDown?.(e));
    menu.addEventListener('mousedown', (e) => opts.onMouseDown?.(e));
    document.body.appendChild(menu);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', placeMenu);
    repaintMenu();
    menu.querySelector('input:checked, [data-on], input, button')?.focus();
  }

  /* ---------- Rows ---------- */

  /** A segmented control alone: options [[value, text]], the one matching `value` on. */
  const segButtons = (key, label, options, value) =>
    `<div class="se-seg" role="group" aria-label="${esc(label)}">${options
      .map(([id, text]) => {
        const on = String(value) === String(id);
        return `<button type="button" data-set="${key}" data-val="${esc(id)}" aria-pressed="${on}"${on ? ' data-on' : ''}>${esc(text)}</button>`;
      })
      .join('')}</div>`;

  // A row's icon: a --se-icon-* name, drawn in the row's colour
  const icon = (name) => (name ? `<span class="se-hs-mn-icon" style="--se-hs-mn-icon: var(--se-icon-${name})"></span>` : '');

  /** A label (an icon before it if given) and a segmented control. */
  const segment = (key, label, options, value, iconName) =>
    `<div class="se-hs-mn-field">${icon(iconName)}<span class="se-hs-mn-label">${esc(label)}</span>${segButtons(key, label, options, value)}</div>`;

  /** A row choosing one of several (data-set / data-val), its round mark lit when `on`. */
  const option = (key, value, name, sub, iconName, on) =>
    `<button type="button" class="se-hs-mn-row" role="radio" aria-checked="${on}" data-set="${key}" data-val="${esc(value)}"${on ? ' data-on' : ''}>` +
    icon(iconName) +
    `<span class="se-hs-mn-text"><span class="se-hs-mn-name">${esc(name)}</span>${sub ? `<span class="se-hs-mn-sub">${esc(sub)}</span>` : ''}</span>` +
    '<span class="se-hs-mn-mark" data-round></span></button>';

  /** An on/off row (data-toggle="key"), its square mark lit when `on`. */
  const toggle = (key, name, on) =>
    `<button type="button" class="se-hs-mn-row" aria-pressed="${Boolean(on)}" data-toggle="${key}"${on ? ' data-on' : ''}>` +
    `<span class="se-hs-mn-name">${esc(name)}</span><span class="se-hs-mn-mark"></span></button>`;

  /** A row with a radio input (onChange), for long lists: name, a quiet count after it, round mark. */
  const radio = (name, value, label, on, count = '') =>
    '<label class="se-hs-mn-row">' +
    `<input type="radio" class="se-hs-mn-input" name="${name}" value="${esc(value)}"${on ? ' checked' : ''}>` +
    `<span class="se-hs-mn-name">${esc(label)}${count ? ` <span class="se-hs-mn-count">${esc(count)}</span>` : ''}</span>` +
    '<span class="se-hs-mn-mark" data-round></span></label>';

  /** A section's heading, with an optional control at its right (a segmented control). */
  const group = (text, extra = '') => `<div class="se-hs-mn-group"><span>${esc(text)}</span>${extra}</div>`;

  Object.assign(ns, {
    closeMenu, menuGroup: group, menuOption: option, menuRadio: radio, menuSegButtons: segButtons,
    menuSegment: segment, menuSide: () => side, menuToggle: toggle, openMenu, placeMenu, placePop,
    repaintMenu,
  });
})(window.__se);
