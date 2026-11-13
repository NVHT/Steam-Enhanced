/* Window group "toasts": notification toasts. skin.json holds its regex; client/loader.js lists its files. */
(window.__seWindows ??= []).push('toasts');
window.__seClient?.flush();
