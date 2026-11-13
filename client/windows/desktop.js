/* Window group "desktop": content windows minus the overlay, Big Picture, Quick Access, Main Menu, the Games List and browser find bars. skin.json holds its regex; client/loader.js lists its files. */
(window.__seWindows ??= []).push('desktop');
window.__seClient?.flush();
