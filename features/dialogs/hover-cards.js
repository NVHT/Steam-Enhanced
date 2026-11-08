/*
 * Game hover card: playtime tiles.
 *
 * Steam writes each playtime line as one string ("Last two weeks: 3.2 hrs", "Total: 8.3 hrs").
 * The tile shows the value large with the label under it, so each line is split at its last
 * colon into data-se-label / data-se-value, which features/dialogs/hover-cards.css draws.
 * The text itself is left to React; a line without a colon (some languages) is left unsplit
 * and shows as written.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedHoverCards?.destroy();

  const LINE = '._1VGPO4xU5sgRK6DFt4t74O > div:not(.MIHa_O-B1JXrzkoGc255n)';
  const SPLIT = /^(.*\S)\s*[:：]\s*(\S.*)$/s;
  const ATTRS = ['data-se-src', 'data-se-label', 'data-se-value'];

  const clear = el => {
    for (const name of ATTRS) SE.unmark(el, name);
  };

  const split = el => {
    const text = el.textContent.trim();
    if (el.getAttribute('data-se-src') === text) return;
    const match = text.match(SPLIT);
    if (!match) {
      clear(el);
      return;
    }
    SE.mark(el, 'data-se-label', match[1]);
    SE.mark(el, 'data-se-value', match[2]);
    SE.mark(el, 'data-se-src', text);
  };

  const scan = () => {
    for (const el of document.querySelectorAll(LINE)) split(el);
  };

  // Text updates matter too: the hover re-renders its lines in place when playtime loads.
  const watcher = SE.watch(scan, { characterData: true });
  scan();

  window.__steamEnhancedHoverCards = {
    destroy() {
      watcher?.disconnect();
      for (const el of document.querySelectorAll(`${LINE}[data-se-src]`)) clear(el);
    },
  };
});
