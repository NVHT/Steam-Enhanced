/*
 * Steam Support: the home page's large topic buttons ("Games, Software, etc.", "Purchases",
 * "My Account" ...) get an icon each ([data-se-help-icon], drawn by help/site.css), matched on
 * the button's link, then its English text; anything else gets the plain help icon. The wizard
 * swaps its content in place, so buttons are tagged as they appear.
 */
const LARGE = 'a.help_wizard_button_large';

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

export default (dom) => {
  const $ = dom.scope();

  const tag = () => {
    for (const button of document.querySelectorAll(LARGE)) {
      const text = dom.squash(button.textContent);
      const href = button.getAttribute('href') ?? '';
      const icon = ICONS.find(([, link, words]) => link.test(href) || words.test(text))?.[0] ?? 'help';
      dom.mark(button, 'data-se-help-icon', icon);
    }
  };

  $.observe(tag);
  tag();

  return () => {
    $.destroy();
    for (const button of document.querySelectorAll('[data-se-help-icon]')) button.removeAttribute('data-se-help-icon');
  };
};
