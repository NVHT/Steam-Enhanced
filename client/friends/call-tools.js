/*
 * SE.callTools: a call bar's stand-ins (.se-call-tool, data-tool="<kind>") for Steam's own call
 * buttons (mic, headphones, leave), which live in the message box or channel list (React's, so
 * they can't move). Each runs its original's click handler and shows its state and label.
 * Users: a one-to-one call's bar (chat/chat.js), a group's in the dock's flyout (dock/flyouts.js).
 *
 *   find(win, kind)       a stand-in's original in that chat window, or null
 *   sync(win, buttons, find, off)  each button follows its original: hidden without one,
 *                         data-off when off(original, kind), its title as label
 *   click(event, find)    a click on a stand-in runs the original's handler; the chat window
 *                         when it ran (for the caller's resync), else null
 */
((SE) => {
  if (!SE) return;
  const { run } = SE;

  const sync = (win, buttons, find, off) => {
    for (const button of buttons) {
      const original = find(win, button.dataset.tool);
      SE.attr(button, 'hidden', original ? null : '');
      if (!original) continue;
      SE.attr(button, 'data-off', off(original, button.dataset.tool) ? '' : null);
      const label = original.getAttribute('title') || '';
      if (label && button.getAttribute('aria-label') !== label) {
        button.title = label;
        button.setAttribute('aria-label', label);
      }
    }
  };

  const click = (event, find) => {
    const button = event.target.closest?.('.se-call-tool');
    const win = button?.closest('.chatWindow');
    const original = win && find(win, button.dataset.tool);
    const onClick = original && SE.fromProps(original, 3, (p) => (typeof p.onClick === 'function' ? p.onClick : undefined));
    if (!onClick) return null;
    event.stopPropagation();
    run(() => onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: original, target: original }));
    return win;
  };

  SE.callTools = { sync, click };
})(window.__se);
