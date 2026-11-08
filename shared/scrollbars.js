/* Toggle [data-se-scrolling] on active scroll containers for auto-hiding scrollbar thumbs. */
(() => {
  window.__steamEnhancedScrollbars?.destroy();

  const HIDE_DELAY_MS = 900;
  const activeTimers = new Map();

  const onScroll = event => {
    const target = event.target === document ? document.scrollingElement : event.target;
    if (!target || target.nodeType !== 1) return;
    if (!target.hasAttribute('data-se-scrolling')) {
      target.setAttribute('data-se-scrolling', '');
    }
    clearTimeout(activeTimers.get(target));
    activeTimers.set(
      target,
      setTimeout(() => {
        target.removeAttribute('data-se-scrolling');
        activeTimers.delete(target);
      }, HIDE_DELAY_MS)
    );
  };

  addEventListener('scroll', onScroll, { capture: true, passive: true });

  window.__steamEnhancedScrollbars = {
    destroy() {
      removeEventListener('scroll', onScroll, { capture: true });
      for (const [el, timer] of activeTimers) {
        clearTimeout(timer);
        el.removeAttribute('data-se-scrolling');
      }
      activeTimers.clear();
      delete window.__steamEnhancedScrollbars;
    },
  };
})();
