/*
 * System Report: finding the dialog, building the view, the watcher and destroy().
 *
 * Part of client/dialogs/system-report/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSystemReportParts;
  if (!ns) return;
  const { BUILT, CHAIN, CONTAINER, ROOT, createView, views } = ns;

  /* ---------- Mounting ---------- */

  const viewOf = new WeakMap();

  /* Every element from the dialog root down to DialogBody fills its parent (system-report.css) */
  const markChain = (root, body) => {
    for (let node = body; node && node !== root; node = node.parentElement) SE.mark(node, CHAIN);
  };

  const build = root => {
    const container = root.querySelector(CONTAINER);
    const body = container?.closest('.DialogBody');
    const text = container?.parentElement;
    const footer = body?.querySelector(':scope > .DialogFooter');
    if (!container || !body || !text || !footer) return;
    viewOf.get(root)?.destroy();
    root.querySelectorAll('.se-sysreport').forEach(node => node.remove());
    const view = createView(root, body, container);
    viewOf.set(root, view);
    views.add(view);
    container.after(view.view);
    footer.before(view.status);
    markChain(root, body);
    SE.mark(root, BUILT);
  };

  const scan = () => {
    for (const root of document.querySelectorAll(ROOT)) {
      const view = viewOf.get(root);
      if (view && root.hasAttribute(BUILT) && view.view.isConnected && view.status.isConnected) {
        view.update();
        continue;
      }
      build(root);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100, scope: ROOT, ignore: node => !!node.closest?.('.se-sysreport') });
  scan();

  window.__steamEnhancedSystemReport = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll('.se-sysreport').forEach(node => node.remove());
      document.querySelectorAll(`[${BUILT}]`).forEach(node => SE.unmark(node, BUILT));
      document.querySelectorAll(`[${CHAIN}]`).forEach(node => SE.unmark(node, CHAIN));
      delete window.__steamEnhancedSystemReport;
    },
  };});
