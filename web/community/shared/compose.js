/*
 * Comment box formatting (every community page with a comment thread): Steam takes BBCode, so
 * the composer card's tool bar (shared/ui-comments.css) starts with a tool for every tag Steam
 * allows in comments, then the emoticons, then Steam's "Formatting help" as a "?" button.
 *
 *   B I U S │ H1 H2 H3 │ link quote code spoiler │ list numbered rule │ ☺ ?        [Post comment]
 *
 * A tool wraps the selected text in its tag (or puts the tag at the caret, ready to type into);
 * Ctrl+B, Ctrl+I and Ctrl+U do the same in the field. Text goes in through setRangeText plus an
 * input event, so Steam's own listeners (length limits, the submit state) see every change.
 *
 * Tips are Steam's own (its jQuery v_tooltip, as on every Steam control): the theme's controls
 * carry data-tooltip-text and are bound the way Steam binds its own. Without Steam's tooltip
 * script, the label falls back to a title.
 *
 * Steam's markup: .commentthread_entry > .commentthread_entry_quotebox > textarea.commentthread_textarea,
 * then .commentthread_entry_submitlink (Formatting help, emoticons, Post).
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ENTRY = '.commentthread_entry';
  const FIELD = '.commentthread_entry_quotebox textarea';

  /** open/close: the tag pair; block: on lines of its own; select: the part to leave selected. */
  const TOOLS = [
    [
      { id: 'b', label: 'Bold', text: 'B', open: '[b]', close: '[/b]', key: 'b' },
      { id: 'i', label: 'Italic', text: 'I', open: '[i]', close: '[/i]', key: 'i' },
      { id: 'u', label: 'Underline', text: 'U', open: '[u]', close: '[/u]', key: 'u' },
      { id: 'strike', label: 'Strikethrough', text: 'S', open: '[strike]', close: '[/strike]' },
    ],
    [
      { id: 'h1', label: 'Heading 1', text: 'H1', open: '[h1]', close: '[/h1]', block: true },
      { id: 'h2', label: 'Heading 2', text: 'H2', open: '[h2]', close: '[/h2]', block: true },
      { id: 'h3', label: 'Heading 3', text: 'H3', open: '[h3]', close: '[/h3]', block: true },
    ],
    [
      { id: 'link', label: 'Link', icon: true, open: '[url=https://]', close: '[/url]', select: 'url' },
      { id: 'quote', label: 'Quote', icon: true, open: '[quote]', close: '[/quote]', block: true },
      { id: 'code', label: 'Code', icon: true, open: '[code]', close: '[/code]', block: true },
      { id: 'spoiler', label: 'Spoiler', icon: true, open: '[spoiler]', close: '[/spoiler]' },
    ],
    [
      { id: 'list', label: 'Bulleted list', icon: true, open: '[list]\n[*]', close: '\n[/list]', block: true, item: true },
      { id: 'olist', label: 'Numbered list', icon: true, open: '[olist]\n[*]', close: '\n[/olist]', block: true, item: true },
      { id: 'rule', label: 'Horizontal rule', icon: true, open: '[hr][/hr]', close: '', block: true },
    ],
  ];
  const BY_KEY = new Map(TOOLS.flat().filter((tool) => tool.key).map((tool) => [tool.key, tool]));
  const BY_ID = new Map(TOOLS.flat().map((tool) => [tool.id, tool]));

  /** Wrap the field's selection in a tool's tags, keeping a sensible selection after. */
  const apply = (field, tool) => {
    const { selectionStart: start, selectionEnd: end, value } = field;
    let picked = value.slice(start, end);
    // A list makes each selected line an item
    if (tool.item && picked) picked = picked.split('\n').join('\n[*]');
    let before = tool.open;
    let after = tool.close;
    if (tool.block) {
      if (start > 0 && value[start - 1] !== '\n') before = `\n${before}`;
      if (end < value.length && value[end] !== '\n') after = `${after}\n`;
    }
    field.focus();
    field.setRangeText(before + picked + after, start, end, 'end');
    const inner = start + before.length;
    if (tool.select === 'url') {
      // The address to type: everything after "[url=" up to "]"
      const urlStart = start + before.indexOf('=') + 1;
      field.setSelectionRange(urlStart, start + before.length - 1);
    } else if (!tool.close) {
      field.setSelectionRange(inner, inner);
    } else {
      field.setSelectionRange(inner, inner + picked.length);
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const TIP = { tooltipClass: 'community_tooltip', dataName: 'tooltipText', defaultType: 'text', replaceExisting: false };

  /** Give nodes Steam's tooltip: its v_tooltip when the page has it, else a plain title. */
  const tip = (nodes) => {
    const $J = window.$J;
    if (typeof $J?.fn?.v_tooltip === 'function') {
      try {
        $J(nodes).v_tooltip(TIP);
        return;
      } catch {
        // the title below
      }
    }
    for (const node of nodes) node.title = node.dataset.tooltipText ?? '';
  };

  web.define((dom) => {
    const $ = dom.scope();
    const { el } = dom;
    const built = new WeakSet();

    const toolButton = (tool) =>
      el('button', {
        class: tool.icon ? 'se-compose-tool se-compose-tool--icon' : 'se-compose-tool',
        type: 'button',
        text: tool.icon ? null : tool.text,
        'data-tooltip-text': tool.key ? `${tool.label} (Ctrl+${tool.key.toUpperCase()})` : tool.label,
        'aria-label': tool.label,
        'data-se-tool': tool.id,
      });

    const build = (entry) => {
      const field = entry.querySelector(FIELD);
      const bar = entry.querySelector('.commentthread_entry_submitlink');
      if (!field || !bar || built.has(entry)) return;
      built.add(entry);

      const groups = TOOLS.map((group) => el('div', { class: 'se-compose-group' }, group.map(toolButton)));
      const row = $.owned(el('div', { class: 'se-compose-tools', role: 'toolbar', 'aria-label': 'Formatting' }, groups));
      bar.prepend(row);

      // Steam's help link: a "?" beside the emoticons (placed by CSS order)
      const help = bar.querySelector(':scope > a[class*="btn_"]');
      if (help) {
        $.mark(help, 'data-se-compose-help');
        $.mark(help, 'data-tooltip-text', dom.squash(help.textContent));
      }
      tip([...row.querySelectorAll('[data-tooltip-text]'), help].filter(Boolean));

      $.listen(row, 'click', (event) => {
        const tool = BY_ID.get(event.target.closest?.('[data-se-tool]')?.dataset.seTool);
        if (tool) apply(field, tool);
      });
      // Keep the field's selection: a click on a tool would otherwise take focus first
      $.listen(row, 'mousedown', (event) => {
        if (event.target.closest?.('[data-se-tool]')) event.preventDefault();
      });
      $.listen(field, 'keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
        const tool = BY_KEY.get(event.key.toLowerCase());
        if (!tool) return;
        event.preventDefault();
        apply(field, tool);
      });
    };

    const scan = () => {
      for (const entry of document.querySelectorAll(ENTRY)) build(entry);
    };

    scan();
    $.observe(scan);

    return () => $.destroy();
  });
})();
