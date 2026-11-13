/*
 * Notice of Copyright Infringement (/dmca/create/): the form's step headings are plain text,
 * "1. Identify Content". Each heading gets its number and title as attributes
 * ([data-se-step], [data-se-step-title]) so dmca/page.css can draw a number badge beside the
 * title, as on the store's legal pages. The text itself is React's and stays untouched; the
 * page is React-rendered, so headings are tagged as they appear.
 *
 * Class names are the page's hashed ones (from the page report; SteamTracking doesn't carry
 * this build): step heading .mHNc5VfjUpc-.
 */
const HEADING = '.mHNc5VfjUpc-';
const STEP = /^\s*(\d+)[.)]\s*(.+)$/;

export default (dom) => {
  const $ = dom.scope();

  const tag = () => {
    for (const heading of document.querySelectorAll(HEADING)) {
      const match = dom.squash(heading.textContent).match(STEP);
      if (!match) continue;
      dom.mark(heading, 'data-se-step', match[1]);
      dom.mark(heading, 'data-se-step-title', match[2]);
    }
  };

  $.observe(tag);
  tag();

  return () => {
    $.destroy();
    for (const heading of document.querySelectorAll('[data-se-step]')) {
      heading.removeAttribute('data-se-step');
      heading.removeAttribute('data-se-step-title');
    }
  };
};
