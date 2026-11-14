/*
 * Activate a Product, rebuilt: one large monospace code field with
 * a key glyph and a clear action, a live status line under it (which format the code matches, how
 * far along it is, or that it's unusual), and the example codes as labelled format cards that
 * light up as the code takes shape. The result screens get an icon over the headline, the
 * Subscriber Agreement step a framed, scrolling agreement.
 *
 * Steam renders the dialog from sp.js (module 66193, CSS module 28694) as a GenericDialog whose
 * content carries ActivateProductDialog. Its state ({ eState, nErrorCode, strProductName }) picks
 * one view: 0 SSA, 1 EnterCode, 2 Info (gamepad only), 3 Success, 4 Failure, 5 Busy. On the
 * desktop, EnterCode is HeaderContainer (DialogHeader), ProductActivationInfoContainerDesktop
 * (InfoBody, InfoExampleHeader, three InfoExample), the CodeInput TextField and the footer.
 *
 * Every native node stays mounted and React keeps owning it. The theme reads the state from the
 * dialog's hooks, marks it on the root ([data-se-ap]) and appends its own nodes only where React's
 * child lists never change (the info container, the input wrapper, the EnterCode container). The field's value is only ever changed the way Steam's own clear action does it
 * (native setter + input event), so React's onChange stays the source of truth.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedActivateProduct?.destroy();

  /* ActivateProductDialog CSS module (sp.js 28694) */
  const C = {
    root: '._2siQZCB9yAOkiG8N-zRZEe',
    header: '._2IWpfqj8UL5hUs7n-pxnUy',
    infoIcon: '._3sqYFYR9Cl3T6Iy-0a3EJ2',
    info: '._2V8QeCkR06XqFUJO_GDTVP',
    body: '._1fFighONx9alttArw-qWFo',
    exampleHeader: '._3kLa_RUiNSrm_Nr6tz7blu',
    example: '._2sEmBD0BnXW-eo2PlLcaLV',
    input: '._2JbjuHCSB0QxUPIMEQbqAi',
    ssa: '._3m3ry1aX6zf5f8KT9_7RU5',
    result: '._1aSkOCX_EmlK4A7z7HBIj',
    productName: '._2yUw38WTqPyZaPo3WENI46',
  };

  const OURS = 'se-ap';
  const STATE = 'data-se-ap';
  const BUILT = 'data-se-ap-built';
  const FILLED = 'data-se-ap-filled';
  const MAX_DEPTH = 16;
  const MAX_HOOKS = 40;

  /* eState → the theme's name for it ('result' is a finished activation whose outcome can't be read) */
  const STATES = ['ssa', 'code', 'info', 'success', 'failure', 'busy'];

  /*
   * Code shapes, as templates: X is a letter or digit, '-' and ' ' are literal. Checked in order,
   * so an exact Standard key wins over being the start of an Extended one.
   */
  const FORMATS = [
    { id: 'standard', label: 'Standard key', template: 'XXXXX-XXXXX-XXXXX' },
    { id: 'extended', label: 'Extended key', template: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' },
    { id: 'retail', label: 'Retail CD/DVD', template: 'XXXXXXXXXXXXXXX XX' },
  ];

  /* Sample codes in Steam's localized examples ("AAAAA-BBBBB-CCCCC", "237ABCDGHJLPRST 23") */
  const SAMPLE = /[A-Z0-9]{5}(?:-[A-Z0-9]{5})+|[A-Z0-9]{10,}(?: [A-Z0-9]{1,4})?/g;

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-ap svg .d) */
  const ICONS = {
    key: '<circle class="d" cx="8" cy="15.5" r="4.5"/><circle cx="8" cy="15.5" r="4.5"/><path d="M11.3 12.2L20 3.5M16.6 6.9l2.6 2.6M14.2 9.3l2 2"/><circle cx="8" cy="15.5" r=".6"/>',
    check: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
    progress: '<circle class="d" cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/><path d="M12 8v4l2.5 1.5"/>',
    alert: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.2M12 16.2v.2"/>',
    type: '<rect class="d" x="3" y="6.5" width="18" height="11" rx="2.5"/><rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10.5h.01M10.3 10.5h.01M13.6 10.5h.01M17 10.5h.01M8 14h8"/>',
    clear: '<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>',
  };

  const views = new Set();
  const viewOf = new WeakMap();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] Activate a Product:', err);
      return fallback;
    }
  };

  const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

  const { el } = SE;

  const { setText } = SE;

  const { icon, setIcon } = SE.icons(ICONS);


  const isOurs = SE.inside(`.${OURS}`);

  const isGamepad = root => !!root.closest('.GamepadMode');

  /* ---------- Code shapes ---------- */

  /* What the server sees: no zero-width characters, trimmed, one space at most, upper case */
  const normalize = text =>
    String(text ?? '')
      .replace(/[​-‍⁠﻿]/g, '')
      .replace(/[‐-―−]/g, '-') // typographic dashes from PDFs and e-mails
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();

  const shapeOf = code => code.replace(/[A-Z0-9]/g, 'X');

  /* Whole-code characters (letters and digits) a template holds */
  const charsIn = template => template.replace(/[^X]/g, '').length;

  /*
   * { tone, format, possible } for a normalized code:
   *   idle     nothing typed
   *   ok       an exact known format
   *   partial  the start of one or more known formats (`possible`)
   *   unusual  none of them; Steam still gets the final say
   */
  const classify = code => {
    if (!code) return { tone: 'idle', format: null, possible: [] };
    const shape = shapeOf(code);
    const exact = FORMATS.find(f => f.template === shape);
    if (exact) return { tone: 'ok', format: exact, possible: [exact] };
    const possible = FORMATS.filter(f => f.template.startsWith(shape));
    return possible.length ? { tone: 'partial', format: null, possible } : { tone: 'unusual', format: null, possible: [] };
  };

  const formatOfSample = sample => FORMATS.find(f => f.template === shapeOf(sample)) ?? null;

  /* ---------- Reading Steam's state ---------- */

  /* The dialog's { eState, ... } hook, read from the live fiber so it's this render's value */
  const readState = root => {
    let fiber = SE.liveFiber?.(root);
    for (let depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      if (typeof fiber.type !== 'function') continue;
      let hook = fiber.memoizedState;
      for (let i = 0; hook && typeof hook === 'object' && 'next' in hook && i < MAX_HOOKS; hook = hook.next, i++) {
        const value = hook.memoizedState;
        if (value && typeof value === 'object' && typeof value.eState === 'number') return value;
      }
    }
    return null;
  };

  /* The view on screen: from Steam's state, else from what's mounted */
  const viewName = root => {
    const state = attempt(() => readState(root), null);
    if (state && STATES[state.eState]) return STATES[state.eState];
    if (root.querySelector(C.header)) return 'code';
    if (root.querySelector(C.ssa)) return 'ssa';
    if (root.querySelector(C.result)) return root.querySelector(C.productName) ? 'success' : 'result';
    return 'busy';
  };

  /* Steam's samples, de-duplicated (English lists the Standard and Extended pair twice) */
  const readSamples = info => {
    const seen = new Set();
    const samples = [];
    for (const node of info.querySelectorAll(C.example)) {
      for (const match of clean(node.textContent).toUpperCase().matchAll(SAMPLE)) {
        if (seen.has(match[0])) continue;
        seen.add(match[0]);
        samples.push(match[0]);
      }
    }
    return samples;
  };

  /* Sets an input's value the way Steam's clear action does, so React's onChange runs */
  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /* ---------- EnterCode view ---------- */

  const buildCode = (root, header, cleanups) => {
    const container = header.parentElement;
    const info = container?.querySelector(`:scope > ${C.info}`);
    const input = container?.querySelector(`${C.input}, ${C.input} input`);
    const field = input?.closest('.DialogInput_Wrapper');
    if (!container || !input || !field) return null;
    const nodes = [];

    container.classList.add(`${OURS}-form`);

    /* Field: key glyph, placeholder, clear action */
    const glyph = icon('key', `${OURS} ${OURS}-glyph`);
    const clear = el('button', `${OURS} ${OURS}-clear`);
    clear.type = 'button'; // the dialog is a form: a bare button would submit it
    clear.tabIndex = -1;
    clear.setAttribute('aria-label', 'Clear');
    clear.append(icon('clear'));
    field.prepend(glyph);
    field.append(clear);
    nodes.push(glyph, clear);

    const hadPlaceholder = input.hasAttribute('placeholder');
    if (!hadPlaceholder) input.setAttribute('placeholder', FORMATS[0].template);
    SE.attr?.(input, 'autocomplete', 'off');
    SE.attr?.(input, 'maxlength', '64');
    cleanups.push(() => {
      if (!hadPlaceholder) input.removeAttribute('placeholder');
      SE.unmark?.(input, 'autocomplete');
      SE.unmark?.(input, 'maxlength');
    });

    /* Status line under the field */
    const status = el('div', `${OURS} ${OURS}-status`);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const statusIcon = icon('type');
    const statusText = el('span', `${OURS}-status-text`);
    const statusMeta = el('span', `${OURS}-status-meta`);
    const hint = el('span', `${OURS}-hint`);
    hint.append(el('kbd', null, 'Enter'), el('span', null, 'to activate'));
    status.append(statusIcon, statusText, statusMeta, hint);
    container.append(status);
    nodes.push(status);

    /* Format cards from Steam's own samples (kept in the DOM, hidden, as the source) */
    const cards = [];
    const samples = info ? readSamples(info) : [];
    if (info && samples.length) {
      const list = el('div', `${OURS} ${OURS}-formats`);
      list.setAttribute('role', 'list');
      for (const sample of samples) {
        const format = formatOfSample(sample);
        const card = el('div', `${OURS}-format`);
        card.setAttribute('role', 'listitem');
        card.append(el('span', `${OURS}-format-label`, format?.label ?? 'Product code'), el('span', `${OURS}-format-code`, sample));
        if (format) {
          const len = el('span', `${OURS}-format-len`, String(charsIn(format.template)));
          len.title = `${charsIn(format.template)} letters and digits`;
          card.append(len);
        }
        card.addEventListener('click', () => input.focus());
        list.append(card);
        cards.push({ card, format });
      }
      info.append(list);
      nodes.push(list);
      SE.mark(root, BUILT);
    }

    const update = () => {
      const code = normalize(input.value);
      const { tone, format, possible } = classify(code);
      const count = code.replace(/[^A-Z0-9]/g, '').length;
      SE.attr(root, FILLED, code ? '' : null);
      status.dataset.tone = tone;

      if (tone === 'idle') {
        setIcon(statusIcon, 'type');
        setText(statusText, 'Type or paste the code exactly as it’s printed');
        setText(statusMeta, '');
      } else if (tone === 'ok') {
        setIcon(statusIcon, 'check');
        setText(statusText, `${format.label} format`);
        setText(statusMeta, `${count} characters`);
      } else if (tone === 'partial') {
        const target = Math.min(...possible.map(f => charsIn(f.template)));
        setIcon(statusIcon, 'progress');
        setText(statusText, possible.length > 1 ? 'Keep going' : `Looks like a ${possible[0].label.toLowerCase()}`);
        setText(statusMeta, `${count} of ${target}`);
      } else {
        setIcon(statusIcon, 'alert');
        setText(statusText, 'Unusual format. Steam will still check it');
        setText(statusMeta, `${count} characters`);
      }

      for (const { card, format: cardFormat } of cards) {
        const state = !code ? null : cardFormat && format === cardFormat ? 'match' : cardFormat && possible.includes(cardFormat) ? 'possible' : 'muted';
        SE.attr(card, 'data-state', state);
      }
    };

    /* Pasted codes arrive trimmed and upper-cased, with typographic dashes made plain */
    const onPaste = event => {
      const text = event.clipboardData?.getData('text');
      if (text == null) return;
      const code = normalize(text);
      if (code === text) return;
      event.preventDefault();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      // setRangeText skips React's value tracker, so the input event below reaches onChange
      input.setRangeText(code, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onClear = () => {
      setValue(input, '');
      input.focus();
    };

    input.addEventListener('input', update);
    input.addEventListener('paste', onPaste);
    clear.addEventListener('click', onClear);
    cleanups.push(() => {
      input.removeEventListener('input', update);
      input.removeEventListener('paste', onPaste);
      container.classList.remove(`${OURS}-form`);
      SE.unmark(root, BUILT);
      SE.unmark(root, FILLED);
    });

    update();
    return { container, nodes, update };
  };

  /* ---------- View ---------- */

  const createView = root => {
    const cleanups = [];
    let code = null; // the built EnterCode view, while it's mounted
    let frame = 0;

    const teardownCode = () => {
      if (!code) return;
      for (const node of code.nodes) node.remove();
      for (const fn of code.cleanups.splice(0)) attempt(fn);
      code = null;
    };

    const sync = () => {
      frame = 0;
      const name = viewName(root);
      SE.attr(root, STATE, name);

      const header = name === 'code' ? root.querySelector(C.header) : null;
      if (code && (!header || !code.container.isConnected || code.container !== header.parentElement)) teardownCode();
      // The gamepad layout (an info button in the title) stays Steam's
      if (header && !code && !header.querySelector(C.infoIcon)) {
        const own = [];
        const built = attempt(() => buildCode(root, header, own), null);
        if (built) code = { ...built, cleanups: own };
        else for (const fn of own) attempt(fn);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    // Each view swap is a child-list change of the dialog's content
    const observer = new MutationObserver(records => {
      if (records.some(record => ![...record.addedNodes, ...record.removedNodes].every(isOurs))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true });
    cleanups.push(() => observer.disconnect());

    sync();

    return {
      root,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        teardownCode();
        for (const fn of cleanups.splice(0)) attempt(fn);
        SE.unmark(root, STATE);
        views.delete(this);
        viewOf.delete(root);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const scan = () => {
    for (const view of [...views]) if (!view.root.isConnected) view.destroy();
    for (const root of document.querySelectorAll(C.root)) {
      if (viewOf.has(root) || isGamepad(root)) continue;
      const view = attempt(() => createView(root), null);
      if (!view) continue;
      views.add(view);
      viewOf.set(root, view);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100, scope: C.root, ignore: isOurs });
  scan();

  window.__steamEnhancedActivateProduct = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__steamEnhancedActivateProduct;
    },
  };
});
