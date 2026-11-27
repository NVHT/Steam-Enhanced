/*
 * Game hover card: playtime tiles.
 *
 * Steam writes each playtime line as one string ("Last two weeks: 3.2 hrs", "Total: 8.3 hrs").
 * The tile shows the value large with the label under it, so each line is split at its last
 * colon into data-se-label / data-se-value, which client/shared/hover-cards.css draws.
 * The text itself is left to React; a line without a colon (some languages) is left unsplit
 * and shows as written. A line at zero (no digit but 0, any language) is marked data-se-zero and
 * hidden; a card whose lines are all zero is marked data-se-unplayed ("Not played yet").
 */
((SE) => {
  window.__seHoverCards?.destroy();

  const PLAYTIME = `.${SE.C.PlaytimeDetails}`;
  const LINE = `${PLAYTIME} > div:not(.${SE.C.AppPortraitHover_Header})`;
  const SPLIT = /^(.*\S)\s*[:：]\s*(\S.*)$/s;
  const ATTRS = ['data-se-src', 'data-se-label', 'data-se-value', 'data-se-zero'];
  const UNPLAYED = 'data-se-unplayed';
  const isZero = (text) => /\d/.test(text) && !/[1-9]/.test(text);

  const clear = (el) => {
    for (const name of ATTRS) SE.unmark(el, name);
  };

  const split = (el) => {
    const text = el.textContent.trim();
    if (el.getAttribute('data-se-src') === text) return;
    const match = text.match(SPLIT);
    // Each attribute set only when it changes: a write inside the card would scan it again
    SE.attr(el, 'data-se-zero', isZero(match ? match[2] : text) ? '' : null);
    SE.attr(el, 'data-se-label', match?.[1]);
    SE.attr(el, 'data-se-value', match?.[2]);
    SE.attr(el, 'data-se-src', match ? text : null);
  };

  const scan = () => {
    for (const el of document.querySelectorAll(LINE)) split(el);
    for (const box of document.querySelectorAll(PLAYTIME)) {
      const lines = box.querySelectorAll(`:scope > div:not(.${SE.C.AppPortraitHover_Header})`);
      const unplayed = lines.length > 0 && [...lines].every((el) => el.hasAttribute('data-se-zero'));
      SE.attr(box, UNPLAYED, unplayed ? '' : null);
    }
  };

  // Only mutations that add or touch a card's playtime block count: the main window's text
  // changes (download speeds, timers) would otherwise rescan the whole document every frame.
  const inPlaytime = SE.inside(PLAYTIME);
  const touchesPlaytime = (record) =>
    inPlaytime(record.target) ||
    [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(PLAYTIME) || node.querySelector(PLAYTIME)));

  // Text updates matter too: the hover re-renders its lines in place when playtime loads.
  const watcher = SE.watch(records => records.some(touchesPlaytime) && scan(), { characterData: true, records: true });
  scan();

  window.__seHoverCards = {
    destroy() {
      watcher?.disconnect();
      for (const el of document.querySelectorAll(`${LINE}:is([data-se-src], [data-se-zero])`)) clear(el);
      for (const el of document.querySelectorAll(`${PLAYTIME}[${UNPLAYED}]`)) el.removeAttribute(UNPLAYED);
    },
  };
})(window.__se);
