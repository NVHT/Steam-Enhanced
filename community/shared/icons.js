/*
 * Community duotone icons: 24px icons in two layers, .s (back, the soft tone) and .p (front,
 * the strong tone), coloured by shared/ui.css (--se-duo-1 / --se-duo-2). Used where Steam shows
 * its small grey menu icons (activity/page.js, profile/page.js).
 *
 *   iconFor(href)  the icon name for a Community link (/id/<name>/games -> 'games'), or null
 *   duoIcon(name)  a <span class="se-duo"> holding that icon's SVG ([data-se-own], aria-hidden)
 *
 * Links are matched by path, not by label, so every Steam language gets the same icons.
 */
const ICONS = {
  profile: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M12 6.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5zM6.5 18.5c.7-2.7 2.9-4.3 5.5-4.3s4.8 1.6 5.5 4.3z',
  ],
  edit: [
    'M3 5a2 2 0 0 1 2-2h10l-3 3H5v13h13v-7l3-3v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M18.1 2.6a1.9 1.9 0 0 1 2.7 0l.6.6a1.9 1.9 0 0 1 0 2.7L13 14.3 9 15l.7-4z',
  ],
  games: [
    'M7 6.5h10a5 5 0 0 1 4.9 6l-.7 3.6a2.6 2.6 0 0 1-4.5 1.2L14.8 15H9.2l-1.9 2.3a2.6 2.6 0 0 1-4.5-1.2l-.7-3.6A5 5 0 0 1 7 6.5z',
    'M7 9.25h1.5v1.5H10v1.5H8.5v1.5H7v-1.5H5.5v-1.5H7zM16.5 9.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zM18.6 11.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  ],
  friends: [
    'M16.5 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM13.6 13.2c.9-.5 1.9-.7 2.9-.7 3 0 5.2 2.1 5.5 5.5H16.6a7.6 7.6 0 0 0-3-4.8z',
    'M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2 20c.4-3.9 3.2-6.5 7-6.5s6.6 2.6 7 6.5z',
  ],
  groups: [
    'M5 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM19 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM1 19c.2-2.7 1.8-4.6 4.3-4.6 1 0 1.9.3 2.6.9L7 19zM23 19c-.2-2.7-1.8-4.6-4.3-4.6-1 0-1.9.3-2.6.9L17 19z',
    'M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM6 20c.4-3.9 2.8-6.5 6-6.5s5.6 2.6 6 6.5z',
  ],
  inventory: [
    'M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M2 5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5V9H2zM9.5 11.5h5a1.25 1.25 0 0 1 0 2.5h-5a1.25 1.25 0 0 1 0-2.5z',
  ],
  trade: [
    'M15 2.5 21 7.5l-6 5v-3.25H4v-3.5h11z',
    'M9 11.5l-6 5 6 5v-3.25h11v-3.5H9z',
  ],
  screenshots: [
    'M4 7h3l1.5-2.1A2 2 0 0 1 10.1 4h3.8a2 2 0 0 1 1.6.9L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
    'M12 9.25a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5zM18.5 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  ],
  videos: [
    'M2 7.5A2.5 2.5 0 0 1 4.5 5h10A2.5 2.5 0 0 1 17 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 2 16.5z',
    'M18 10l4-2.5v9L18 14zM7.5 8.75l5.5 3.25-5.5 3.25z',
  ],
  guides: [
    'M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
    'M14 2v4a2 2 0 0 0 2 2h4zM8 12h8v2H8zM8 16h5.5v2H8z',
  ],
  workshop: [
    'M16.5 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z',
    'M21.6 6.1a5.4 5.4 0 0 1-7 6.6l-7.3 7.4a2.3 2.3 0 0 1-3.3-3.3l7.4-7.3a5.4 5.4 0 0 1 6.6-7l-3.2 3.2.6 2.5 2.5.6z',
  ],
  comments: [
    'M9 2.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1v3.2L15.4 13.5H9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z',
    'M3 8h9.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3.6 3.2V18H3a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z',
  ],
  badges: [
    'M8 13.5 5 22l4-1.6L12 23l3-2.6 4 1.6-3-8.5z',
    'M12 1.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 5l1.2 2.5 2.8.4-2 1.9.5 2.7L12 11.2l-2.5 1.3.5-2.7-2-1.9 2.8-.4z',
  ],
  reviews: [
    'M3 10h3.5v11H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
    'M8 10.5 12.2 3a2 2 0 0 1 3.7 1.3L15 9h5a2 2 0 0 1 2 2.3l-1.3 7.6A2.5 2.5 0 0 1 18.2 21H8z',
  ],
  awards: [
    'M7 3h10v6.5a5 5 0 0 1-10 0z',
    'M4 4h3v1.8H5.8v1.4a2 2 0 0 0 1.6 2l.4 1.7A3.8 3.8 0 0 1 4 7.2zM20 4h-3v1.8h1.2v1.4a2 2 0 0 1-1.6 2l-.4 1.7A3.8 3.8 0 0 0 20 7.2zM10.5 15h3v3h3a1 1 0 0 1 1 1v2h-11v-2a1 1 0 0 1 1-1h3z',
  ],
  artwork: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M8.5 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 17.5l5-5 3.5 3.5 3.5-4.5L21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
};

// First path segment after the profile -> icon
const BY_SECTION = {
  '': 'profile',
  edit: 'edit',
  games: 'games',
  friends: 'friends',
  groups: 'groups',
  inventory: 'inventory',
  tradeoffers: 'trade',
  screenshots: 'screenshots',
  videos: 'videos',
  myworkshopfiles: 'workshop',
  commenthistory: 'comments',
  badges: 'badges',
  awards: 'awards',
  recommended: 'reviews',
  reviews: 'reviews',
  images: 'artwork',
};

// /id/<name>/<section>, /profiles/<steamid>/<section> or /my/<section>
const PROFILE = /^\/(?:(?:id|profiles)\/[^/]+|my)\/?([^/?#]*)/i;

export const iconFor = (href) => {
  let url;
  try {
    url = new URL(href, location.href);
  } catch {
    return null;
  }
  const section = url.pathname.match(PROFILE)?.[1]?.toLowerCase();
  if (section == null) return null;
  if (section === 'myworkshopfiles' && url.searchParams.get('section') === 'guides') return 'guides';
  return BY_SECTION[section] ?? null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export const duoIcon = (name) => {
  const paths = ICONS[name];
  if (!paths) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  paths.forEach((d, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', i ? 'p' : 's');
    path.setAttribute('d', d);
    svg.append(path);
  });
  const span = document.createElement('span');
  span.className = 'se-duo';
  span.setAttribute('aria-hidden', 'true');
  span.setAttribute('data-se-own', '');
  span.setAttribute('data-se-icon', name);
  span.append(svg);
  return span;
};
