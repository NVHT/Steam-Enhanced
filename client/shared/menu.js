/*
 * The theme's settings menu (SE.settingsMenu), for controls that stay open and need focus (rows
 * that run and close go in the action menu, SE.layer.menu): one at a time, over the page by
 * the button that opened it (the Home stage's sliders button, a Home panel's ⋯), in the theme's
 * menu language (the game-type menu, client/navigation/sidebar-icons.css): a header (the
 * title, a control at its right if given), rows that light up on hover with a mark at their
 * end, headings and dividers, Reset as the last row. Styled by client/shared/menu.css; the picker
 * (client/shared/picker.js) draws in the same classes and SE.placePop places both.
 * It closes on Escape, a click outside or its button again; every change applies at once.
 *   SE.settingsMenu  { open, close, place, repaint, height(), side() } and the row builders.
 * Rows the caller can use:
 *   segment()     a label and a segmented control (data-set / data-val); segButtons() alone
 *   option()      a row choosing one of several: icon, name, a line under it, a round mark
 *                 (data-set / data-val)
 *   toggle()      an on/off row with a square mark (data-toggle)
 *   radio()       a row with a radio input (onChange), for long lists such as collections
 *   group()       a heading, a control at its right if given
 *   open(anchor, { label, title, head, paint, foot, side, onClick, onChange, onReset })
 *     head()         markup at the title's right (a segmented control), repainted with the body
 *     paint()        the body's markup, called on open and on repaint()
 *     onClick(e)     a click inside, after the menu's own buttons
 *     onChange(e)    a radio changed
 *     onKeyDown(e), onMouseDown(e)  a key or a press inside (a list the caller lets you reorder)
 *     foot           rows after Reset in the footer (markup, painted once)
 *     side           'below' or 'above' its button, when it takes a popup's place (placePop)
 *     onReset()      the Reset row (none without it)
 */
((SE) => {
  if (SE.settingsMenu) return;

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


  function placeMenu() {
    if (!menu || !anchor?.isConnected) {
      closeMenu();
      return;
    }
    side = SE.placePop(menu, anchor, side);
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
    menu.querySelector('.se-mn-body').innerHTML = opts.paint();
    menu.querySelector('.se-mn-head').innerHTML = opts.head?.() || '';
    placeMenu();
    if (key) menu.querySelector(key)?.focus();
  }

  function openMenu(button, options) {
    if (menu && anchor === button) {
      closeMenu();
      return;
    }
    closeMenu();
    SE.picker?.close();
    anchor = button;
    opts = options;
    side = options.side || null;
    anchor.setAttribute('aria-expanded', 'true');
    menu = document.createElement('div');
    menu.className = 'se-placed se-mn';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', options.label);
    menu.innerHTML =
      `<div class="se-mn-sum"><span class="se-mn-title">${esc(options.title)}</span><span class="se-mn-head"></span></div>` +
      '<div class="se-mn-body"></div>' +
      (options.onReset || options.foot
        ? '<div class="se-mn-foot">' +
          (options.onReset
            ? '<button type="button" class="se-mn-row" data-mn-reset>' +
              '<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-restore)"></span>' +
              '<span class="se-mn-name">Reset to defaults</span></button>'
            : '') +
          (options.foot || '') +
          '</div>'
        : '');
    menu.addEventListener('click', (e) => {
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
  const icon = (name) => (name ? `<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-${name})"></span>` : '');

  /** A label (an icon before it if given) and a segmented control. */
  const segment = (key, label, options, value, iconName) =>
    `<div class="se-mn-field">${icon(iconName)}<span class="se-mn-label">${esc(label)}</span>${segButtons(key, label, options, value)}</div>`;

  /** A row choosing one of several (data-set / data-val), its round mark lit when `on`. */
  const option = (key, value, name, sub, iconName, on) =>
    `<button type="button" class="se-mn-row" role="radio" aria-checked="${on}" data-set="${key}" data-val="${esc(value)}"${on ? ' data-on' : ''}>` +
    icon(iconName) +
    `<span class="se-mn-text"><span class="se-mn-name">${esc(name)}</span>${sub ? `<span class="se-mn-sub">${esc(sub)}</span>` : ''}</span>` +
    '<span class="se-mn-mark" data-round></span></button>';

  /** An on/off row (data-toggle="key"), its square mark lit when `on`. */
  const toggle = (key, name, on) =>
    `<button type="button" class="se-mn-row" aria-pressed="${Boolean(on)}" data-toggle="${key}"${on ? ' data-on' : ''}>` +
    `<span class="se-mn-name">${esc(name)}</span><span class="se-mn-mark"></span></button>`;

  /** A row with a radio input (onChange), for long lists: name, a quiet count after it, round mark. */
  const radio = (name, value, label, on, count = '') =>
    '<label class="se-mn-row">' +
    `<input type="radio" class="se-mn-input" name="${name}" value="${esc(value)}"${on ? ' checked' : ''}>` +
    `<span class="se-mn-name">${esc(label)}${count ? ` <span class="se-mn-count">${esc(count)}</span>` : ''}</span>` +
    '<span class="se-mn-mark" data-round></span></label>';

  /** A section's heading, with an optional control at its right (a segmented control). */
  const group = (text, extra = '') => `<div class="se-mn-group"><span>${esc(text)}</span>${extra}</div>`;

  SE.settingsMenu = {
    open: openMenu, close: closeMenu, place: placeMenu, repaint: repaintMenu,
    height: () => menu?.offsetHeight || 0, side: () => side,
    group, option, radio, segButtons, segment, toggle,
  };
})(window.__se);
