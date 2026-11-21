/*
 * New Collection, rebuilt: the name, then the type as two cards to pick from (Collection, the
 * one picked at first, or Dynamic), then Cancel and Create, the dialog's one main action, greyed
 * until there is a name. Enter creates the picked type.
 *
 * Steam renders the dialog from sp.js (CSS module 1634, SaveCollectionContainer on the dialog's
 * content): a name field, then in the footer a label and TwoOptionsContainer with two Options,
 * each an ActionLabel button that creates its type at once (Disabled while the name is empty)
 * and a Description. The Save-search variant (a filter to save) has no Options and keeps
 * Steam's own OK.
 *
 * Every native node stays mounted and React keeps owning it. The theme marks the dialog
 * ([data-se-newcoll]), hides the footer's label and Options, and appends its own block at the
 * footer's end, a child list React doesn't change while the dialog is open. Create clicks the
 * picked type's own ActionLabel; Cancel runs the dialog's own onCancel.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
((SE) => {
  window.__seNewCollection?.destroy();

  /* SaveCollectionContainer CSS module (sp.js 1634) */
  const C = {
    root: `.${SE.C.SaveCollectionContainer}`,
    types: `.${SE.C.SaveCollectionContainer_TwoOptionsContainer}`,
    option: `.${SE.C.SaveCollectionContainer_Option}`,
    action: `.${SE.C.SaveCollectionContainer_ActionLabel}`,
    disabled: SE.C.SaveCollectionContainer_Disabled,
  };

  const OURS = 'se-nc';
  const ROOT = 'data-se-newcoll';
  const FOOTER = 'data-se-newcoll-footer';

  // In Steam's Options' order: Create, then Create Dynamic
  const TYPES = [
    { title: 'Collection', hint: 'Games you add yourself', icon: '--se-icon-folder' },
    { title: 'Dynamic', hint: 'Filters you set next keep it up to date', icon: '--se-icon-dynamic' },
  ];

  const attempt = SE.attempt('New collection');
  const isOurs = (node) => node.nodeType === 1 && node.closest?.(`.${OURS}`);

  function build(doc) {
    const block = doc.createElement('div');
    block.className = OURS;
    block.innerHTML =
      `<div class="${OURS}-label" id="${OURS}-type">Type</div>` +
      `<div class="${OURS}-types" role="radiogroup" aria-labelledby="${OURS}-type">` +
      TYPES.map(
        (type, i) =>
          `<button type="button" class="${OURS}-type" role="radio" aria-checked="${i === 0}" data-type="${i}">` +
          `<span class="${OURS}-icon" style="--se-nc-icon: var(${type.icon})" aria-hidden="true"></span>` +
          `<span class="${OURS}-text"><span class="${OURS}-title">${type.title}</span>` +
          `<span class="${OURS}-hint">${type.hint}</span></span></button>`
      ).join('') +
      '</div>' +
      `<div class="${OURS}-actions">` +
      '<button type="button" class="DialogButton" data-nc-cancel>Cancel</button>' +
      '<button type="button" class="DialogButton Primary" data-nc-create>Create</button>' +
      '</div>';
    return block;
  }

  const createView = (root) => {
    let block = null;
    let types = null;
    let picked = 0;
    let frame = 0;

    // Create follows Steam's own Options: greyed while they are (no name yet)
    const refresh = () => {
      frame = 0;
      if (!block || !types) return;
      const option = types.querySelectorAll(C.option)[picked];
      block.querySelector('[data-nc-create]').disabled = !option || option.classList.contains(C.disabled);
    };
    const refreshSoon = () => {
      if (!frame) frame = requestAnimationFrame(refresh);
    };

    const pick = (index) => {
      picked = index;
      for (const card of block.querySelectorAll(`.${OURS}-type`)) {
        card.setAttribute('aria-checked', String(Number(card.dataset.type) === index));
      }
      refresh();
    };

    const create = () => {
      const option = types?.querySelectorAll(C.option)[picked];
      if (!option || option.classList.contains(C.disabled)) return;
      option.querySelector(C.action)?.click();
    };

    const cancel = () => {
      const onCancel = SE.fromProps(root, 8, (props) => (typeof props.onCancel === 'function' ? props.onCancel : undefined));
      attempt(() => onCancel?.());
    };

    const onClick = (event) => {
      const card = event.target.closest(`.${OURS}-type`);
      if (card) pick(Number(card.dataset.type));
      else if (event.target.closest('[data-nc-create]')) create();
      else if (event.target.closest('[data-nc-cancel]')) cancel();
    };

    // Arrow keys move between the cards, as in any radio group
    const onKeyDown = (event) => {
      const card = event.target.closest?.(`.${OURS}-type`);
      if (card && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const next = (picked + 1) % TYPES.length;
        pick(next);
        block.querySelector(`[data-type="${next}"]`)?.focus();
      }
    };

    // Enter in the name creates the picked type (Steam's own Enter makes a plain collection)
    const onEnter = (event) => {
      if (event.key !== 'Enter' || picked === 0 || !event.target.matches?.('input')) return;
      event.preventDefault();
      event.stopPropagation();
      create();
    };

    const sync = () => {
      if (!root.isConnected) return;
      if (block?.isConnected) return refreshSoon();
      types = root.querySelector(C.types);
      if (!types?.parentElement) return;
      block = build(root.ownerDocument);
      block.addEventListener('click', onClick);
      block.addEventListener('keydown', onKeyDown);
      types.parentElement.append(block);
      SE.attr(types.parentElement, FOOTER, '');
      SE.attr(root, ROOT, '');
      refresh();
    };

    // The footer can mount after the frame; the name's changes re-render Steam's Options
    const change = SE.onChange(root, sync, { attributes: ['class'], ignore: isOurs });
    root.addEventListener('input', refreshSoon);
    root.addEventListener('keydown', onEnter, true);
    sync();

    return {
      root,
      destroy() {
        change.disconnect();
        cancelAnimationFrame(frame);
        root.removeEventListener('input', refreshSoon);
        root.removeEventListener('keydown', onEnter, true);
        if (types?.parentElement) SE.unmark(types.parentElement, FOOTER);
        block?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'New collection',
    () => [...document.querySelectorAll(C.root)].filter((root) => !root.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so
    // Steam's look never shows
    { sync: true, scope: C.root, ignore: isOurs }
  );

  window.__seNewCollection = {
    destroy() {
      mounted.destroy();
      delete window.__seNewCollection;
    },
  };
})(window.__se);
