/*
 * Scroll to top, on every store page: the library game page's button (client/game-page/
 * activity.css) brought to the store. A 48px round dark button in the bottom-right corner
 * with an arrow, ringed in the accent colour by how far down the page you are. It rises in
 * once you've scrolled past the first screen and drops away again near the top.
 *
 * The store scrolls the window on every page, client-side navigations included, so one
 * button lives for the whole session; its progress is --se-scroll (0..1) on the button.
 */
const SHOW_AFTER = 0.6; // of the window's height

export default (dom) => {
  const $ = dom.scope();

  const button = dom.el('button', { class: 'se-store-top', type: 'button', 'aria-label': 'Scroll to top', title: 'Scroll to top' }, dom.el('span', { class: 'se-store-top-face' }));
  $.listen(button, 'click', () => {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  });

  const update = dom.perFrame(() => {
    const root = document.documentElement;
    const range = root.scrollHeight - innerHeight;
    const progress = range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0;
    dom.setVar(button, '--se-scroll', progress.toFixed(4));
    button.toggleAttribute('data-shown', scrollY > innerHeight * SHOW_AFTER);
  });
  $.listen(window, 'scroll', update, { passive: true });
  $.listen(window, 'resize', update, { passive: true });
  $.add(update.cancel);

  (document.body ?? document.documentElement).append(button);
  $.add(() => button.remove());
  // Pages that grow after load (rows, React routes) change the range without a scroll
  if (window.ResizeObserver && document.body) {
    const resize = new ResizeObserver(update);
    resize.observe(document.body);
    $.add(() => resize.disconnect());
  }
  update();

  return () => $.destroy();
};
