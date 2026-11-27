/*
 * A sorted Home shelf's label on each cover (the corner chip, client/library/library-home.css),
 * written from the game where Steam's says too much, too little or nothing:
 *   Hours Played     "493 h", "23 min" (collection pages' form); never played: "Not played"
 *   Achievements     "22%" over a fill of as much; none yet or none to get: muted ("0%", "—")
 *   Size on Disk     "108 GB", "562 MB"; the drive ("C:") only when the shelf's games sit on
 *                    more than one
 *   Steam Review     Steam draws none: the game's score, "94%", its dot in the review's colour
 * Steam's label (LibraryItemBoxSubscript) keeps its place and is drawn with the theme's text
 * (data-se-tag); where Steam draws none, a chip of the theme's (.se-sort-tag) stands in. Other
 * orders keep Steam's words. The shelf's order is its showcase's eSortBy (Steam's ESortOption).
 */
((SE) => {
  window.__seSortTags?.destroy();
  const { C } = SE;

  const SHELF = `.${C.Showcase}`;
  const HEADER = `.${C.ShowcaseHeader}`;
  const ITEM = `.${C.Draggable}`;
  const BOX = `.${C.LibraryItemBox}`;
  const STEAM_TAG = `.${C.LibraryItemBoxSubscript}`;
  const OWN = 'se-sort-tag';
  // Steam's ESortOption values the theme writes
  const SORT = { achievements: 2, hours: 4, size: 8, review: 11 };

  const apps = new WeakMap(); // a cover → its game, found once

  const appOf = (box) => {
    if (!apps.has(box)) apps.set(box, SE.appOf(box) || null);
    return apps.get(box);
  };

  // live: the header's own fiber can hold the order from before a change
  const sortOf = (shelf) => {
    const header = shelf.querySelector(HEADER);
    return header ? SE.fromProps(header, 12, (p) => p.showcase?.eSortBy ?? null, { live: true }) : null;
  };

  const hours = (app) => {
    const m = app.minutes_playtime_forever || 0;
    if (!m) return { text: 'Not played', tone: 'muted' };
    return { text: m < 60 ? `${m} min` : `${Math.round(m / 60).toLocaleString()} h` };
  };

  // Steam's own label holds the progress ("22%", or "No Achievements": no digit)
  const achievements = (steamTag) => {
    const match = steamTag?.textContent.match(/\d+/);
    if (!match) return steamTag ? { text: '—', tone: 'muted' } : null;
    const pct = Math.min(100, Number(match[0]));
    return { text: `${pct}%`, tone: pct ? null : 'muted', fill: `${pct}%` };
  };

  const size = (app, drives) => {
    const text = SE.bytes(app.size_on_disk, { short: true });
    if (!text) return null;
    return { text: drives > 1 && app.library_id != null ? `${app.library_id} ${text}` : text };
  };

  // Steam's review score (1 Overwhelmingly Negative … 9 Overwhelmingly Positive)
  const review = (app) => {
    const pct = SE.run(() => app.review_percentage);
    const score = SE.run(() => app.review_score);
    if (!pct || !score) return null;
    return { text: `${pct}%`, tone: score >= 6 ? 'good' : score === 5 ? 'mixed' : 'bad' };
  };

  const paint = (el, label) => {
    SE.attr(el, 'data-se-tag', label.text);
    SE.attr(el, 'data-se-tone', label.tone);
    // set only when it changes: a write inside the shelf would run the pass again
    if ((el.style.getPropertyValue('--se-tag-fill') || null) !== (label.fill || null)) {
      if (label.fill) el.style.setProperty('--se-tag-fill', label.fill);
      else el.style.removeProperty('--se-tag-fill');
    }
  };

  const clear = (el) => {
    SE.unmark(el, 'data-se-tag');
    SE.unmark(el, 'data-se-tone');
    el.style.removeProperty('--se-tag-fill');
  };

  const syncShelf = (shelf) => {
    const sort = sortOf(shelf);
    const items = [...shelf.querySelectorAll(ITEM)].filter((item) => item.querySelector(`:scope > ${BOX}`));
    const ours = Object.values(SORT).includes(sort);
    const drives = sort === SORT.size
      ? new Set(items.map((item) => appOf(item.querySelector(BOX))?.library_id).filter((id) => id != null)).size
      : 0;
    for (const item of items) {
      const steamTag = item.querySelector(STEAM_TAG);
      const app = appOf(item.querySelector(BOX));
      let label = null;
      if (ours && app) {
        if (sort === SORT.hours) label = hours(app);
        else if (sort === SORT.achievements) label = achievements(steamTag);
        else if (sort === SORT.size) label = size(app, drives);
        else label = review(app);
      }
      let own = item.querySelector(`:scope > .${OWN}`);
      if (label && !steamTag) {
        if (!own) {
          own = document.createElement('span');
          own.className = OWN;
          own.setAttribute('aria-hidden', 'true');
          item.append(own);
        }
        paint(own, label);
      } else own?.remove();
      if (!steamTag) continue;
      if (label) paint(steamTag, label);
      else clear(steamTag);
    }
  };

  const update = () => {
    for (const shelf of document.querySelectorAll(SHELF)) SE.run(() => syncShelf(shelf));
  };

  const watcher = SE.watch(update, { throttle: 100, ignore: SE.inSide });
  update();

  window.__seSortTags = {
    destroy() {
      watcher.disconnect();
      for (const el of document.querySelectorAll(`${SHELF} .${OWN}`)) el.remove();
      for (const el of document.querySelectorAll(`${SHELF} ${STEAM_TAG}[data-se-tag]`)) clear(el);
      delete window.__seSortTags;
    },
  };
})(window.__se);
