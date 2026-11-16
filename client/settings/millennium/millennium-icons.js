/*
 * Millennium Settings: the icons the redesigned pages draw (Plugins, Updates, Logs), duotone in
 * the text colour: an outline over a soft fill (`.se-duo`, fill-opacity --se-icon-duo).
 *
 * Part of client/settings/millennium/: listed before the page parts in client/loader.js, which
 * read it from window.__seMillParts.icon(name).
 */
(() => {
  const parts = (window.__seMillParts = window.__seMillParts || {});

  const PATHS = {
    puzzle:
      '<path class="se-duo" d="M10 4.5a2 2 0 1 1 4 0V6h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 1 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v-1.5a2 2 0 1 0-4 0V19H6.5a1 1 0 0 1-1-1v-3.5H7a2 2 0 1 0 0-4H5.5V7a1 1 0 0 1 1-1H10z"/>',
    plug: '<path d="M9 2.5v4.5M15 2.5v4.5"/><path class="se-duo" d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4.5"/>',
    memory: '<rect class="se-duo" x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    cpu: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    gear:
      '<path class="se-duo" d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    info: '<circle class="se-duo" cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    check: '<circle class="se-duo" cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
    alert:
      '<path class="se-duo" d="M10.3 4.3a2 2 0 0 1 3.4 0l7.4 12.8a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3z"/><path d="M12 10v4M12 17h.01"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path class="se-duo" d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2z"/>',
    refresh:
      '<path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18.2 3.5v4.1h-4.1M5.8 20.5v-4.1h4.1"/><circle class="se-duo" cx="12" cy="12" r="4"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3v5.5h-5.5"/>',
    core: '<path class="se-duo" d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 12 20 7.4M12 12v9.2M12 12 4 7.4"/>',
    palette:
      '<path class="se-duo" d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    copy: '<rect class="se-duo" x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    done: '<path d="m5.5 12.5 4.2 4.2L18.5 8"/>',
    prev: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    next: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  };

  parts.icon = (name) =>
    `<svg class="se-micon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
})();
