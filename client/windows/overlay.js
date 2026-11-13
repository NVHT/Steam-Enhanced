/* Window group "overlay": the in-game overlay. skin.json holds its regex; client/loader.js lists its files. */
(window.__seWindows ??= []).push('overlay');
window.__seClient?.flush();
