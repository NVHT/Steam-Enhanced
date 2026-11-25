/*
 * Steam Settings › Security: the hero card saying how protected the account is (the card
 * pages-hero.css, its tint client/settings/pages.css, "Security").
 *
 * The hero reads Steam Guard's own row: its icon's state class (EnabledTwoFactor: codes from the
 * Steam app; another Enabled… class: codes by email; none: off) gives the title and the tint,
 * and Steam's status line ("2FA protection on via the Steam Mobile App since…") is shown under
 * it, kept in step as Steam changes it. The account name is marked so CSS blurs it until
 * hovered, as the email on Account; Deauthorize gets the danger button.
 *
 * On the card's right, how the codes come: a phone showing a Steam Guard code that changes as its
 * bar runs out (app), an envelope with one (email), an empty dashed phone (off). The code is
 * made up (Steam's five letters and digits, never the account's), a new one each time the bar's
 * animation starts over (no timer); with reduced motion the bar stands and the code stays.
 */
((SE) => {
  window.__seSettingsSecurity?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const PRIVATE = 'data-se-private';
  const DANGER = 'data-se-danger';
  const STATES = {
    app: ['Protected', 'Steam Guard'],
    email: ['Partly protected', 'Steam Guard'],
    off: ['Not protected', 'Steam Guard is off'],
  };
  // Deauthorize all devices, the same in every language: the last row of Steam Guard's section
  // (Steam Guard, Backup Codes with two-factor, Deauthorize), absent when Steam Guard is off and
  // the section holds Steam Guard's row alone
  const deauthorizeOf = (body) => {
    const section = body.querySelector('.SteamGuardIcon')?.closest('.DialogControlsSection');
    const rows = section ? [...section.querySelectorAll(ns.FIELD)] : [];
    return rows.length > 1 ? rows[rows.length - 1] : null;
  };

  const stateOf = (page) => {
    const icon = page.querySelector('.SteamGuardIcon');
    if (!icon) return 'off';
    if (icon.classList.contains('EnabledTwoFactor')) return 'app';
    return [...icon.classList].some((c) => /^Enabled/.test(c)) ? 'email' : 'off';
  };

  // Steam Guard's code alphabet: no vowels or look-alikes
  const LETTERS = '23456789BCDFGHJKMNPQRTVWXY';
  const madeUpCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

  function makeArt(side) {
    const art = SE.el('div', 'se-sec-art');
    const code = SE.el('div', 'se-sec-code', madeUpCode());
    const bar = SE.el('div', 'se-sec-bar');
    const run = SE.el('span');
    bar.append(run);
    art.append(SE.el('i', 'se-sec-device'), code, bar);
    run.addEventListener('animationiteration', () => {
      code.textContent = madeUpCode();
    });
    side.append(art);
  }

  const view = ns.pageView({
    route: 'security',
    make(body) {
      const hero = ns.pageHero();
      hero.root.setAttribute('aria-live', 'polite');
      makeArt(hero.side);
      return { root: hero.root, hero, body };
    },
    read: (page) => ({
      state: stateOf(page),
      status: ns.text(page.querySelector('.SteamGuardIcon')?.closest('.Status')),
    }),
    // The hero's state and line, the account name's mark and Deauthorize's button, kept in step
    // with Steam's rows
    draw(v, { state, status }) {
      v.root.dataset.secState = state;
      const [title, fallback] = STATES[state];
      v.hero.title(title);
      v.hero.line(status || fallback);
      const deauthorize = deauthorizeOf(v.body);
      for (const field of v.body.querySelectorAll(ns.FIELD)) {
        SE.attr(field, PRIVATE, field.querySelector(':scope > .FieldLeftColumn .EntryValue') ? '' : null);
        const button = field.querySelector(':scope > .FieldRightColumn button.DialogButton');
        if (button) SE.attr(button, DANGER, field === deauthorize ? '' : null);
      }
    },
    // Steam Guard's state lives in its icon's classes and its status text
    characterData: true,
  });

  window.__seSettingsSecurity = {
    destroy() {
      view.destroy();
      for (const node of document.querySelectorAll(`${view.PAGE} [${PRIVATE}], ${view.PAGE} [${DANGER}]`)) {
        SE.unmark(node, PRIVATE);
        SE.unmark(node, DANGER);
      }
      delete window.__seSettingsSecurity;
    },
  };
})(window.__se);
