/*
 * Continues popup-layer-panel.js (see popup-layer.js's header): the theme's action menu,
 * closing on leave and with the menus' animation, rail placement; publishes SE.layer.
 */
((SE) => {
  const ns = window.__seLayerParts;
  if (!ns || SE.layer) return;
  const { panel } = ns;

  /*
   * The theme's action menu, in a panel (above a browser page too). One open at a time. Controls
   * that stay open and need focus (segments, a list to reorder) go in the settings menu
   * (client/shared/menu.js) instead.
   *   items   rows [{ label, run, state, icon, art, hint, keys, time, unread, external, checked,
   *           danger }],
   *           with { heading, action }, { separator: true } and { note } between them. state
   *           goes on the row as data-state with an <i> before the label for the caller's mark
   *           (the dock's status dots); icon is a mask token's name (a duotone icon); art an
   *           image URL drawn as a tile at the row's start (the icon in the tile while it's
   *           missing or fails; '' for the icon's tile alone); hint a line under the label;
   *           keys a shortcut at the row's end; time a short time at the row's end; unread
   *           (true / false) an accent dot after it; external a mark that the row opens
   *           outside; checked (true / false) makes the row an on/off setting, with a switch at
   *           its end (role menuitemcheckbox) that run flips, the menu staying open (every
   *           other row closes it); current marks the row for the
   *           page you're on (aria-current, the accent); danger draws a destroying row in
   *           red. A heading's action ({ label, run }) is a small button at its end:
   *           run(handle), the menu staying open. A note is a line of plain text (an empty
   *           state).
   *   at      where: a spot for show() ({ left | right, top }, or a function of the menu's size)
   *   options { sheets: the theme files styling the marks; owner: the button that opened it,
   *           whose press never counts as an outside click (it toggles) and which carries
   *           aria-expanded while the menu is open }
   * Keys: in the page the rows take focus; a popup window never does, so the main window hears
   * Up / Down / Enter / Escape and moves a highlight ([data-se-active]) through the rows. A menu
   * opens with no row lit: only the pointer or the keys light one.
   * Returns { release(), update(items), released }, or null when no panel could open. update
   * draws new rows in place, without the opening animation.
   */
  let openMenu = null;

  /*
   * Closing a click popup when the pointer leaves it, as Steam's own rail menus do (the bell's,
   * the avatar's): leaving its button or the popup closes it after a moment, unless the pointer
   * has gone into the other one meanwhile. watch(el) adds an element (the popup, in whatever
   * document it is drawn); dispose() stops it all.
   */
  const LEAVE_MS = 300;
  function leaveCloser(owner, close) {
    let timer = 0;
    const watched = [];
    const stay = () => {
      clearTimeout(timer);
      timer = 0;
    };
    const leave = () => {
      stay();
      timer = setTimeout(close, LEAVE_MS);
    };
    const watch = (el) => {
      if (!el) return;
      el.addEventListener('mouseenter', stay);
      el.addEventListener('mouseleave', leave);
      watched.push(el);
    };
    watch(owner);
    return {
      watch,
      dispose() {
        stay();
        for (const el of watched.splice(0)) {
          el.removeEventListener('mouseenter', stay);
          el.removeEventListener('mouseleave', leave);
        }
      },
    };
  }

  /*
   * Closing with the menus' animation (se-menu-out on [data-se-closing], core/motion.css): marks
   * the element, waits out the animation it then has, and calls done. With none (reduced motion,
   * or nothing styled for it) done runs at once and this returns null; otherwise it returns a
   * cancel() that keeps the element open and never calls done. The wait runs on this window's
   * clock, not the element's: a popup window can be gone or asleep before it ends.
   */
  function closeWith(el, done) {
    const view = el?.ownerDocument?.defaultView;
    if (!view) {
      done();
      return null;
    }
    el.setAttribute('data-se-closing', '');
    const style = view.getComputedStyle(el);
    const ms = style.animationName === 'none' ? 0 : parseFloat(style.animationDuration) * 1000;
    if (!(ms > 0)) {
      el.removeAttribute('data-se-closing');
      done();
      return null;
    }
    let timer = setTimeout(() => {
      timer = 0;
      done();
    }, ms);
    return () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      el.removeAttribute('data-se-closing');
    };
  }

  function menu(items, at, { sheets = [], owner = null, closeOnLeave = false } = {}) {
    openMenu?.release();
    const open = panel({ sheets });
    if (!open) return null;
    let rows = [];
    let shown = null;
    let index = -1;
    let released = false;
    const leaving = closeOnLeave && owner ? leaveCloser(owner, () => handle.release()) : null;

    const highlight = (next) => {
      if (!rows.length) return;
      index = (next + rows.length) % rows.length;
      const row = rows[index];
      if (row.ownerDocument === document) row.focus({ preventScroll: true });
      else rows.forEach((other) => SE.attr(other, 'data-se-active', other === row ? '' : null));
    };

    const onKey = (event) => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (event.key === 'Escape') handle.release();
      // Nothing is lit until the keys are used: Down starts at the first row, Up at the last
      else if (step) highlight(index < 0 && step < 0 ? rows.length - 1 : index + step);
      // In the page the focused row hears Enter itself; in a popup window it's pressed here.
      else if ((event.key === 'Enter' || event.key === ' ') && rows[index]?.ownerDocument !== document) {
        rows[index]?.click();
      } else return;
      event.preventDefault();
    };

    const onPointer = (event) => {
      const target = event.target;
      if (shown?.contains(target) || owner?.contains(target)) return;
      handle.release();
    };

    const handle = {
      release() {
        if (released) return;
        released = true;
        if (openMenu === handle) openMenu = null;
        removeEventListener('keydown', onKey, true);
        removeEventListener('pointerdown', onPointer, true);
        leaving?.dispose();
        SE.attr(owner, 'aria-expanded', 'false');
        // In the page it fades out first; a popup window's goes at once (its spare is reused)
        if (shown?.ownerDocument === document) closeWith(shown, () => open.release());
        else open.release();
      },
      update(next) {
        if (handle.released) return;
        index = -1;
        open.show(at, build(next, true));
      },
      get released() {
        return released || open.released;
      },
    };

    const build = (entries, redraw = false) => (container) => {
      const doc = container.ownerDocument;
      const list = doc.createElement('div');
      list.className = 'se-menu';
      list.setAttribute('role', 'menu');
      if (redraw) list.setAttribute('data-se-redraw', '');
      const part = (tag, className, text) => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text != null) node.textContent = text;
        return node;
      };
      const maskIcon = (token) => {
        const icon = part('span', 'se-menu-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.style.setProperty('--se-menu-mask', `var(${token})`);
        return icon;
      };
      for (const item of entries) {
        if (item.heading) {
          const heading = part('div', 'se-menu-heading', item.heading);
          if (item.action) {
            const action = part('button', 'se-menu-heading-action', item.action.label);
            action.type = 'button';
            action.addEventListener('click', (event) => {
              event.stopPropagation();
              item.action.run(handle);
            });
            heading.append(action);
          }
          list.append(heading);
          continue;
        }
        if (item.note) {
          list.append(part('div', 'se-menu-note', item.note));
          continue;
        }
        if (item.separator) {
          const line = part('div', 'se-menu-sep');
          line.setAttribute('role', 'separator');
          list.append(line);
          continue;
        }
        const row = doc.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'menuitem');
        if (item.current) row.setAttribute('aria-current', 'page');
        // A row that destroys something (Delete): in red (popup-layer.css)
        if (item.danger) row.setAttribute('data-danger', '');
        if (item.state) {
          row.dataset.state = item.state;
          row.append(doc.createElement('i'));
        }
        if (item.art != null) {
          const tile = part('span', 'se-menu-art');
          tile.setAttribute('aria-hidden', 'true');
          if (item.icon) tile.append(maskIcon(item.icon));
          if (item.art) {
            const img = doc.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.decoding = 'async';
            img.addEventListener('error', () => img.remove(), { once: true });
            img.src = item.art;
            tile.append(img);
          }
          row.append(tile);
        } else if (item.icon) {
          row.append(maskIcon(item.icon));
        }
        const text = part('span', 'se-menu-text');
        text.append(part('span', 'se-menu-label', item.label));
        if (item.hint) {
          row.toggleAttribute('data-hint', true);
          text.append(part('span', 'se-menu-hint', item.hint));
        }
        row.append(text);
        if (item.keys) row.append(part('kbd', 'se-menu-keys', item.keys));
        if (item.time) row.append(part('span', 'se-menu-time', item.time));
        if (typeof item.unread === 'boolean') {
          row.toggleAttribute('data-unread', item.unread);
          row.append(part('span', 'se-menu-dot'));
        }
        if (item.external) {
          const mark = part('span', 'se-menu-external');
          mark.setAttribute('aria-hidden', 'true');
          row.append(mark);
        }
        if (typeof item.checked === 'boolean') {
          row.setAttribute('role', 'menuitemcheckbox');
          row.setAttribute('aria-checked', String(item.checked));
          const toggle = part('span', 'se-menu-switch');
          toggle.setAttribute('aria-hidden', 'true');
          row.append(toggle);
        }
        row.addEventListener('click', (event) => {
          event.stopPropagation();
          // A setting flips in place, so several can be set in one visit
          if (typeof item.checked === 'boolean') {
            item.checked = !item.checked;
            row.setAttribute('aria-checked', String(item.checked));
            item.run();
            return;
          }
          handle.release();
          item.run();
        });
        list.append(row);
      }
      container.append(list);
      shown = list;
      leaving?.watch(list);
      rows = [...list.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')];
    };

    open.show(at, build(items));

    openMenu = handle;
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onPointer, true);
    SE.attr(owner, 'aria-expanded', 'true');
    return handle;
  }

  /*
   * Where a rail button's popup goes: 12px off the button's side (the gap every menu keeps from
   * its button, --se-space-3; the Steam menu's under the Steam button too), side-aligned with it. A page
   * icon's (top) lines its top up with the button's; one at the rail's foot (`foot`) lines its
   * bottom up with the button's, so it grows up. Kept inside the window. Steam's own rail menus
   * (the bell's, the avatar's) open the same way (client/header/menu/placement.js).
   */
  const menuGap = () => SE.px('--se-space-3');
  function besideRail(button, { foot = false } = {}) {
    const rect = button.getBoundingClientRect();
    const edge = SE.px('--se-space-2');
    return (width, height) => ({
      left: rect.right + menuGap(),
      top: Math.max(edge, Math.min(foot ? rect.bottom - height : rect.top, innerHeight - height - edge)),
    });
  }

  const layer = {
    besideRail,
    runtime: ns.findRuntime,
    missing: ns.missing,
    place: ns.place,
    copyStyles: ns.copyStyles,
    menuOpen: ns.menuOpen,
    panel,
    hover: ns.hover,
    menu,
    closeWith,
    leaveCloser,
    react: ns.react,
    take: ns.take,
    finish: ns.finish,
    // How long a panel can wait for its window before the layer gives up on it (one retry).
    giveUpMs: ns.MOUNT_TIMEOUT_MS * 2,
    destroy() {
      openMenu?.release();
      ns.destroy();
      delete SE.layer;
    },
  };
  delete window.__seLayerParts;
  SE.layer = layer;
})(window.__se);
