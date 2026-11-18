/*
 * Steam Support: the home page's large topic buttons ("Games, Software, etc.", "Purchases",
 * "My Account" ...) get an icon each ([data-se-help-icon], drawn by web/help/site.css in a chip
 * span added first, [data-se-help-chip]), matched on the button's link, then its English text;
 * anything else gets the plain help icon. The wizard swaps its content in place, so buttons are
 * tagged as they appear. The search field takes the shared search field look.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const LARGE = 'a.help_wizard_button_large';
  const CHIP = 'data-se-help-chip';

  /* [icon, link pattern, text pattern] */
  const ICONS = [
    ['game', /HelpWithGame|HelpWithSoftware/i, /games|software/i],
    ['cart', /Purchase|HelpWithPurchase/i, /purchase/i],
    ['account', /HelpWithMyAccount|HelpWithAccount/i, /my account/i],
    ['gift', /Trading|Gift|Market|Points/i, /trading|gifting|market|points/i],
    ['hardware', /Hardware|SteamDeck|Controller/i, /hardware|deck|controller/i],
    ['community', /Community/i, /community/i],
    ['key', /Login|SignIn|Recovery/i, /sign(?:ing)? in|log(?:ging)? in|password/i],
    ['client', /SteamClient|HelpWithSteam\b/i, /steam client/i],
  ];

  web.define((dom) => {
    const $ = dom.scope();

    const tag = () => {
      for (const button of document.querySelectorAll(LARGE)) {
        const text = dom.squash(button.textContent);
        const href = button.getAttribute('href') ?? '';
        const icon = ICONS.find(([, link, words]) => link.test(href) || words.test(text))?.[0] ?? 'help';
        dom.mark(button, 'data-se-help-icon', icon);
        if (!button.querySelector(`:scope > [${CHIP}]`)) {
          button.prepend(dom.el('span', { [CHIP]: true, 'aria-hidden': 'true' }));
        }
      }
    };

    // The search field: the shared search field (web/shared/search-field.css)
    const search = () => {
      const input = document.getElementById('help_search_support_input');
      $.search(input, input?.closest('#help_search_support_form'));
    };

    $.observe(() => {
      tag();
      search();
    });
    tag();
    search();

    return () => {
      $.destroy();
      for (const chip of document.querySelectorAll(`[${CHIP}]`)) chip.remove();
      for (const button of document.querySelectorAll('[data-se-help-icon]')) button.removeAttribute('data-se-help-icon');
    };
  });
})();
