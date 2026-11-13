/*
 * Reader for long game-page text (the "About this game" description): a modal <dialog> with a
 * header (eyebrow, game name, close) over a scrolling article in reading type.
 *
 *   const reader = createReader(dom);
 *   reader.open({ eyebrow, title, content });   // content: a node, moved into the reader
 *   reader.destroy();
 *
 * Esc closes (native to <dialog>), as do the close button and a click on the dim backdrop.
 * The page behind stays still while it is open. Styles: app/about.css (.se-reader).
 */
export const createReader = ({ el, scope }) => {
  const life = scope();

  const eyebrow = el('span', { class: 'se-reader__eyebrow' });
  const title = el('h2', { class: 'se-reader__title', id: 'se-reader-title' });
  const close = el('button', { class: 'se-reader__close', type: 'button', 'aria-label': 'Close' });
  const article = el('article', { class: 'se-reader__article' });

  const dialog = el('dialog', { class: 'se-reader', 'aria-labelledby': 'se-reader-title' }, [
    el('div', { class: 'se-reader__panel' }, [
      el('header', { class: 'se-reader__head' }, [el('div', { class: 'se-reader__heading' }, [eyebrow, title]), close]),
      article,
    ]),
  ]);

  life.listen(close, 'click', () => dialog.close());
  // A click on the dialog itself (outside the panel) landed on the backdrop.
  life.listen(dialog, 'click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  life.listen(dialog, 'close', () => document.documentElement.classList.remove('se-reader-open'));

  return {
    open({ eyebrow: kicker = '', title: name = '', content }) {
      eyebrow.textContent = kicker;
      eyebrow.hidden = !kicker;
      title.textContent = name;
      article.replaceChildren(content);
      if (!dialog.isConnected) document.body.append(dialog);
      if (!dialog.open) dialog.showModal();
      document.documentElement.classList.add('se-reader-open');
      article.scrollTop = 0;
      close.focus({ preventScroll: true });
    },
    destroy() {
      if (dialog.open) dialog.close();
      life.destroy();
      dialog.remove();
    },
  };
};
