/* Window group "notify": windows a friend notification can be clicked in. skin.json holds its regex; client/loader.js lists its files. */
(window.__seWindows ??= []).push('notify');
window.__seClient?.flush();
