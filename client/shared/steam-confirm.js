/*
 * Steam's own confirm dialog for a theme prompt (sp.js ConfirmDialog, shown by Steam's modal
 * call): it opens as Steam's dialogs do, in this window or popped out, and takes their look
 * (client/dialogs/dialogs.css, as Mark as Private does): a title, a line, OK, an optional
 * middle button, Cancel. Found as dev/dialog-launcher.js finds them.
 *   SE.steamConfirm({ title, description, ok, middle, cancel, onOK, onMiddle, onCancel })
 *     true once shown; false when Steam's pieces weren't found (the caller falls back)
 */
((SE) => {
  if (SE.steamConfirm) return;
  const { run } = SE;

  const sourceOf = (fn) => (typeof fn === 'function' ? run(() => Function.prototype.toString.call(fn)) || '' : '');
  const exportWhere = (exports, test) => {
    for (const value of Object.values(exports || {})) {
      if (typeof value === 'function' && test(sourceOf(value))) return value;
    }
    return null;
  };

  // Steam's modal call: show(element, window, options)
  const showModal = () =>
    SE.findModule('steam-confirm:show', (src, id, req) =>
      src.includes('Conflicting popout options')
        ? exportWhere(run(() => req(id)), (fn) => fn.includes('bHideMainWindowForPopouts:!0'))
        : null
    );

  // Its confirm dialog component, and the React that module uses to make elements
  const confirmDialog = () =>
    SE.findModule('steam-confirm:dialog', (src, id, req) => {
      if (!src.includes('bProgressDialog') || !src.includes('#Error_FailureNotice')) return null;
      const Dialog = exportWhere(run(() => req(id)), (fn) => fn.includes('bProgressDialog'));
      const [, alias] = src.match(/([\w$]+)\.useId\(\)/) || [];
      const React = alias ? SE.importOf(src, alias, req) : null;
      return Dialog && React?.createElement ? { Dialog, React } : null;
    });

  SE.steamConfirm = ({ title, description, ok, middle, cancel, onOK, onMiddle, onCancel }) => {
    const show = showModal();
    const parts = confirmDialog();
    if (!show || !parts) return false;
    const props = {
      strTitle: title,
      strDescription: description,
      strOKButtonText: ok,
      strCancelButtonText: cancel,
      onOK: () => onOK?.(),
      onCancel: () => onCancel?.(),
    };
    if (middle) Object.assign(props, { strMiddleButtonText: middle, onMiddleButton: () => onMiddle?.() });
    return run(() => {
      show(parts.React.createElement(parts.Dialog, props), window);
      return true;
    }) === true;
  };
})(window.__se);
