/*
 * Replace native browser title attributes in Friends & Chat windows with Steam React tooltips.
 */
((SE) => {
  window.__seChatTooltips?.destroy();

  const mounts = new Map();
  const savedTitles = new WeakMap();
  /* Every target lives in Friends & Chat; outside it no mutation (or title change) matters */
  const SCOPE = '.friendsui-container, .friendlist, .multiChatDialog';
  let gate;
  let observer;
  let sweep;

  const TARGET_SELECTOR =
    '.se-chat-tile[data-se-chat-tip], .friendlist [title], .multiChatDialog [title], .friendlist [data-se-native-tip], .multiChatDialog [data-se-native-tip]';

  const release = (node, entry) => {
    entry.root.unmount();
    entry.host.remove();
    node.style.position = entry.oldPosition;
    node.removeAttribute('data-se-native-tip');
    mounts.delete(node);
  };

  // A whole Friends & Chat tree can leave from outside the scope (the dock unmounting it).
  const prune = () => {
    for (const [node, entry] of mounts) {
      if (!node.isConnected || !entry.host.isConnected) release(node, entry);
    }
  };

  const update = () => {
    prune();

    const nodes = document.querySelectorAll(TARGET_SELECTOR);
    if (!nodes.length) return;

    const native = window.__seNativeTooltips?.resolve();
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

  const present = () => !!document.querySelector(SCOPE);

  // Settings, Properties and other windows never show Friends & Chat: wait for it to appear.
  const start = () => {
    if (!present()) {
      gate ||= SE.watch(() => present() && start());
      return;
    }
    gate?.disconnect();
    gate = null;
    observer ||= SE.watch(update, { scope: SCOPE, attributes: ['data-se-chat-tip', 'title'] });
    sweep ||= SE.poll(prune, 5000, { active: () => mounts.size > 0 });
    update();
  };

  window.__seChatTooltips = {
    destroy() {
      gate?.disconnect();
      observer?.disconnect();
      sweep?.disconnect();
      for (const [node, entry] of mounts) {
        release(node, entry);
        if (savedTitles.has(node) && !node.hasAttribute('title')) {
          node.setAttribute('title', savedTitles.get(node));
        }
      }
      removeEventListener('DOMContentLoaded', start);
      delete window.__seChatTooltips;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
