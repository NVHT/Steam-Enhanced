/*
 * The theme's game list beside the page (when Steam's own can't be shown): search, batched
 * rows, "more" on scroll. Builds its element and wires its own listeners on load.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { live } = ns;

  // Keep a searchable fallback for Steam builds whose native router differs.
  const BATCH_SIZE = 100;
  const library = document.createElement('aside');
  library.className = 'se-dl-library';
  library.setAttribute('aria-label', 'Game list');
  library.innerHTML = '<h2>Games</h2><input type="search" aria-label="Search games" placeholder="Search games">' +
    '<div class="se-dl-library-scroll"><div class="se-dl-library-rows"></div>' +
    '<p class="se-dl-library-empty" role="status"></p><button type="button">Show more games</button></div>';
  const libraryInput = library.querySelector('input');
  const libraryScroll = library.querySelector('.se-dl-library-scroll');
  const libraryRows = library.querySelector('.se-dl-library-rows');
  const libraryEmpty = library.querySelector('.se-dl-library-empty');
  const libraryMore = library.querySelector('button');
  const HOST_ATTR = 'data-se-dl-host';
  let apps = [];
  let libraryHost;
  let nextRead = 0;

  function addGameRows() {
    const start = libraryRows.childElementCount;
    const fragment = document.createDocumentFragment();
    for (const app of live.matches.slice(start, start + BATCH_SIZE)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.appid = app.appid;
      row.dataset.installed = String(app.installed);
      row.title = app.name;
      const url = SE.run(() => app.store.GetIconURLForApp(app.nativeApp));
      if (url) {
        const icon = document.createElement('img');
        icon.loading = 'lazy';
        icon.alt = '';
        icon.src = url;
        row.append(icon);
      }
      const name = document.createElement('span');
      name.textContent = app.name;
      row.append(name);
      fragment.append(row);
    }
    libraryRows.append(fragment);
    libraryMore.hidden = libraryRows.childElementCount >= live.matches.length;
  }

  function filterGames() {
    const query = libraryInput.value.trim().toLocaleLowerCase();
    live.matches = apps.filter((app) => app.searchName.includes(query));
    libraryRows.replaceChildren();
    libraryScroll.scrollTop = 0;
    libraryEmpty.textContent = live.matches.length ? '' : query ? 'No matching games' : 'No games to show';
    addGameRows();
  }

  function searchGames(value) {
    if (libraryInput.value === value) return;
    libraryInput.value = value;
    filterGames();
  }

  function openGame(appid) {
    return appid ? SE.navigate(`/library/app/${appid}`) : false;
  }

  libraryInput.addEventListener('input', filterGames);
  libraryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && openGame(live.matches[0]?.appid)) event.preventDefault();
  });
  libraryRows.addEventListener('click', (event) => openGame(event.target.closest('button[data-appid]')?.dataset.appid));
  libraryMore.addEventListener('click', () => {
    const first = libraryRows.childElementCount;
    addGameRows();
    libraryRows.children[first]?.focus({ preventScroll: true });
  });
  const moreObserver = window.IntersectionObserver && new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !libraryMore.hidden) addGameRows();
  }, { root: libraryScroll, rootMargin: '120px 0px' });

  function syncLibrary(page) {
    const host = page?.parentElement;
    if (host !== libraryHost) {
      moreObserver?.disconnect();
      library.remove();
      SE.unmark(libraryHost, HOST_ATTR);
      libraryHost = host;
      nextRead = 0;
    }
    if (!host) return;
    SE.mark(host, HOST_ATTR);
    if (library.nextElementSibling !== page) {
      page.before(library);
      moreObserver?.observe(libraryMore);
    }
    if (Date.now() < nextRead) return;
    nextRead = Date.now() + 5000;
    const store = SE.global('appStore', (candidate) => candidate.allApps);
    const collections = SE.global('collectionStore');
    const items = SE.run(() => store?.allApps) || [];
    const next = items.filter((app) =>
      (app.app_type === 1 || app.app_type === 1073741824) &&
      app.visible_in_game_list !== false && app.display_name &&
      !SE.run(() => collections?.BIsHidden(app.appid))
    ).map((app) => ({
      appid: app.appid,
      name: app.display_name,
      searchName: app.display_name.toLocaleLowerCase(),
      installed: SE.isInstalled(app),
      store,
      nativeApp: app,
    }));

    if (next.length === apps.length && next.every((app, index) => {
      const previous = apps[index];
      return app.appid === previous.appid && app.name === previous.name &&
        app.installed === previous.installed && app.store === previous.store;
    })) return;
    apps = next;
    filterGames();
  }

  filterGames();

  Object.assign(ns, { library, openGame, searchGames, syncLibrary });
})(window.__se);
