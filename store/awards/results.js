/*
 * The Steam Awards results pages (/steamawards/2016 ...).
 *
 * Server-rendered years (body.steamawards, .steamawards_page) get html.se-store-awards for
 * awards/results.css, plus the parts that stylesheet can't make on its own:
 *  - a "Winner" chip on each award's winning game ([data-se-award-winner-chip]);
 *  - the award's number on its card ([data-se-award-index], "01", "02" ...);
 *  - on the 2017–2018 layout, [data-se-vote] on the nominee label that is actually showing
 *    ("Your Vote"): Steam renders the label on every nominee and hides it on all but yours.
 *    Measured before the root class goes on, since the stylesheet hides every label;
 *  - [data-se-avatars] on awards whose nominees aren't games (Best Developer: studios with
 *    square logos), laid out as square tiles with the name as a caption;
 *  - sharper game art: these pages ask for small capsules, drawn several times larger on a
 *    high-DPI screen. Each game image is swapped for the app's 616x353 capsule as it nears the
 *    viewport ([data-se-hires]; the original stays if the app has none).
 * Years drawn by the React store (2022 on) only get html.se-store-awards-react once their
 * awards root has rendered; awards/results.css styles them from their hashed classes.
 */
export default async (dom) => {
  const { scope } = dom;
  const life = scope();
  const root = document.documentElement;

  // The page's layout can only be told apart once the document is parsed.
  await dom.ready();

  const page = document.querySelector('.steamawards_page');
  if (!page) {
    const REACT_ROOT = '.P0s12fkKEIs-';
    const REACT_CLASS = 'se-store-awards-react';
    const found = () => {
      if (!document.querySelector(REACT_ROOT)) return false;
      root.classList.add(REACT_CLASS);
      return true;
    };
    if (!found()) {
      const watch = scope();
      watch.observe(() => found() && watch.destroy());
      watch.timeout(() => watch.destroy(), 20000);
      life.add(() => watch.destroy());
    }
    return () => {
      life.destroy();
      root.classList.remove(REACT_CLASS);
    };
  }

  const ROOT_CLASS = 'se-store-awards';

  const shown = (node) =>
    node.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && node.getBoundingClientRect().width > 0;
  // Awards whose nominees aren't store apps (studios, publishers): their links don't go to /app/.
  const avatarAwards = [...page.querySelectorAll('.vote_category_ctn')].filter((award) => {
    const links = [...award.querySelectorAll('.category_nominations_ctn .nomination_app_link, .category_winner_ctn > a')];
    return links.length > 0 && links.every((link) => !/\/app\/\d+/.test(link.href));
  });
  const votes = [...page.querySelectorAll('.vote_category_ctn .category_nominations_ctn > div.category_nomination > div')].filter((label) => {
    if (avatarAwards.some((award) => award.contains(label))) return false;
    const text = label.querySelector('span') ?? label;
    return text.textContent.trim() !== '' && shown(text);
  });
  for (const award of avatarAwards) award.setAttribute('data-se-avatars', '');
  for (const label of votes) label.setAttribute('data-se-vote', '');
  root.classList.add(ROOT_CLASS);

  const chips = [];
  const cards = [...page.querySelectorAll('.results_list .vote_result_ctn')];
  cards.forEach((card, index) => {
    card.setAttribute('data-se-award-index', String(index + 1).padStart(2, '0'));
    const winner = card.querySelector('.results_carousel .winner');
    if (winner && !winner.querySelector('[data-se-award-winner-chip]')) {
      const chip = dom.el('span', { 'data-se-award-winner-chip': true, 'aria-hidden': 'true', text: 'Winner' });
      winner.append(chip);
      chips.push(chip);
    }
  });

  /* ---------- Sharper art, loaded as it nears the viewport ---------- */

  const capsule = (appid) => `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_616x353.jpg`;
  const APP_ART = [
    '.category_nominations_ctn img.category_nomination',
    '.category_winner_ctn > a > img:not(.category_winner_trophy)',
    '.results_carousel :is(.winner, .runnerup) img',
  ].join(', ');
  const appId = (img) =>
    /\/app\/(\d+)/.exec(img.closest('a')?.href ?? '')?.[1] ?? /\/apps\/(\d+)\//.exec(img.currentSrc || img.src)?.[1];

  const upgraded = [];
  const sharpen = (img) => {
    const appid = appId(img);
    const sharp = appid && capsule(appid);
    if (!sharp || img.getAttribute('src') === sharp) return;
    const probe = new Image();
    probe.onload = () => {
      if (!life.alive || !probe.naturalWidth) return;
      img.dataset.seOriginalSrc = img.getAttribute('src');
      img.setAttribute('data-se-hires', '');
      img.src = sharp;
      upgraded.push(img);
    };
    probe.src = sharp;
  };
  const near = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      near.unobserve(entry.target);
      sharpen(entry.target);
    }
  }, { rootMargin: '600px 0px' });
  page.querySelectorAll(APP_ART).forEach((img) => near.observe(img));
  life.add(() => near.disconnect());

  return () => {
    life.destroy();
    for (const img of upgraded) {
      img.src = img.dataset.seOriginalSrc;
      delete img.dataset.seOriginalSrc;
      img.removeAttribute('data-se-hires');
    }
    for (const label of votes) label.removeAttribute('data-se-vote');
    for (const award of avatarAwards) award.removeAttribute('data-se-avatars');
    for (const chip of chips) chip.remove();
    for (const card of cards) card.removeAttribute('data-se-award-index');
    root.classList.remove(ROOT_CLASS);
  };
};
