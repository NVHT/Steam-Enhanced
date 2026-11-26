/*
 * What's New settings (the gear on What's New; client/dialogs/whats-new-settings.css): an ⓘ
 * beside the title holding Steam's two paragraphs about What's New in the theme's tip (.se-tip,
 * inside the button, shown by the stylesheet on hover or focus: Steam's own tooltip never draws
 * in this popup window), and
 * under it a card showing what the settings do: What's New's row as a wireframe, each card with
 * its kind of news. The stylesheet fades the kinds that aren't product updates while Steam's
 * switch is on, so the card needs no script after it's built.
 */
((SE) => {
  window.__seWhatsNewSettings?.destroy();

  const ROOT = `.${SE.C.WhatsNewSettingsContainer}`;
  const NOTES = `.${SE.C.WhatsNewHeaderText}`; // Steam's two explainers
  // The row's cards: their kind, and whether "Only show product updates" keeps them
  const CARDS = [
    ['Major update', true], ['News', false], ['Patch notes', true], ['Event', false], ['Small update', true],
  ];

  const preview = () => {
    const card = document.createElement('div');
    card.className = 'se-wns-preview';
    card.setAttribute('aria-hidden', 'true');
    for (const [kind, update] of CARDS) {
      const news = card.appendChild(document.createElement('div'));
      news.className = 'se-wns-news';
      if (!update) news.dataset.other = '';
      const art = news.appendChild(document.createElement('div'));
      art.className = 'se-wns-art';
      art.appendChild(document.createElement('span')).textContent = kind;
      for (const line of ['title', 'title', 'game']) {
        news.appendChild(document.createElement('div')).className = `se-wns-line se-wns-${line}`;
      }
    }
    return card;
  };

  const view = SE.mount(
    'whats-new-settings',
    () => document.querySelectorAll(ROOT),
    (root) => {
      const header = root.querySelector('.DialogHeader');
      const notes = [...root.querySelectorAll(NOTES)]
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      if (!header || !notes.length) return null;

      const text = notes.join('\n\n');
      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'se-wns-info';
      info.setAttribute('aria-label', "About What's New");
      info.setAttribute('aria-describedby', 'se-wns-tip');
      const tip = info.appendChild(document.createElement('span'));
      tip.className = 'se-tip se-wns-tip';
      tip.id = 'se-wns-tip';
      tip.setAttribute('role', 'tooltip');
      tip.textContent = text;
      header.append(info);
      const card = preview();
      header.after(card);
      return {
        destroy() {
          info.remove();
          card.remove();
        },
      };
    },
    { sync: true }
  );

  window.__seWhatsNewSettings = {
    destroy() {
      view.destroy();
      delete window.__seWhatsNewSettings;
    },
  };
})(window.__se);
