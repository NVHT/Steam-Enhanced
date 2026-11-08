/* Replace native browser title attributes in Friends & Chat windows with Steam React tooltips. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedChatTooltips?.destroy();

  const mounts = new Map();
  const savedTitles = new WeakMap();
  let observer;
  let frame = 0;

  const TARGET_SELECTOR =
    '.se-chat-tile[data-se-chat-tip], .friendlist [title], .multiChatDialog [title], .friendlist [data-se-native-tip], .multiChatDialog [data-se-native-tip]';

  const update = () => {
    frame = 0;
    for (const [node, entry] of mounts) {
      if (!node.isConnected || !entry.host.isConnected) {
        entry.root.unmount();
        entry.host.remove();
        node.style.position = entry.oldPosition;
        node.removeAttribute('data-se-native-tip');
        mounts.delete(node);
      }
    }

    const nodes = document.querySelectorAll(TARGET_SELECTOR);
    if (!nodes.length) return;

    const native = window.__steamEnhancedNativeTooltips?.resolve();
    if (!native) return;
    const { React, DOM, Tooltip } = native;

    for (const node of nodes) {
      if (
        node.closest('.GamepadMode') ||
        node.matches('input, textarea, select, option, svg, [title=""]')
      ) {
        continue;
      }

      const rawTitle = node.getAttribute('title');
      if (rawTitle) savedTitles.set(node, rawTitle);
      const label = node.getAttribute('data-se-chat-tip') || savedTitles.get(node);
      if (!label) continue;

      let entry = mounts.get(node);
      if (!entry) {
        const host = document.createElement('span');
        host.className = 'se-chat-tooltip-host';
        const oldPosition = node.style.position;
        if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
        node.appendChild(host);
        entry = { host, root: DOM.createRoot(host), label: null, oldPosition };
        node.setAttribute('data-se-native-tip', '');
        mounts.set(node, entry);
      }

      if (rawTitle) node.removeAttribute('title');
      if (entry.label === label) continue;
      entry.label = label;
      entry.root.render(
        React.createElement(Tooltip, {
          toolTipContent: label,
          bTopmost: true,
          nDelayShowMS: 200,
          direction: 'bottom',
          bPortalToBody: true,
          children: React.createElement('span', { className: 'se-chat-tooltip-hitbox' }),
        })
      );
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const start = () => {
    observer = SE.watch(schedule, { attributes: ['data-se-chat-tip', 'title'], sync: true });
    schedule();
  };

  window.__steamEnhancedChatTooltips = {
    destroy() {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const [node, entry] of mounts) {
        entry.root.unmount();
        entry.host.remove();
        node.style.position = entry.oldPosition;
        node.removeAttribute('data-se-native-tip');
        if (savedTitles.has(node) && !node.hasAttribute('title')) {
          node.setAttribute('title', savedTitles.get(node));
        }
      }
      mounts.clear();
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedChatTooltips;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
