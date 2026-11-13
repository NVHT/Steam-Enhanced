/* Window group "content": every window but menus and notification toasts. skin.json holds its regex; client/loader.js lists its files. */
(window.__seWindows ??= []).push('content');
window.__seClient?.flush();
