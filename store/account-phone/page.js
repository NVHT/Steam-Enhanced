/*
 * Manage phone number (/phone/manage): page.css turns Steam's boxes into cards. This adds:
 *
 *   - the phone chip beside the current number (Steam's own icon there is a small blue image)
 *   - each box's status line ("Days since you verified your phone number: 636") under its
 *     question: Steam prints it after the button, where it drifts off to the right
 *
 * A status line is any text in a box that is neither the question nor the button. Moved nodes
 * go back where they were on destroy().
 */
const PHONE = '<rect class="d" x="7" y="3" width="10" height="18" rx="2.5"/><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>';

/** The box's own text outside the question and the button: the element holding it, or null. */
const findNote = (box, dom) => {
  for (const node of box.querySelectorAll('*')) {
    if (node.matches('form, form *, .phonebox_content_description, .phonebox_content_description *, a, a *, button, button *')) continue;
    if (node.querySelector('a, button, .phonebox_content_description')) continue; // holds the button or question
    const own = [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (own && dom.squash(node.textContent)) return node;
  }
  return null;
};

export default async (dom) => {
  await dom.ready();
  const added = [];
  const moves = [];

  const line = document.querySelector('.current_phone_box .phone_header_description');
  if (line) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = PHONE;
    const chip = dom.el('span', { class: 'se-phone-chip', 'data-se-phone': 'chip' }, icon);
    line.prepend(chip);
    added.push(chip);
  }

  for (const box of document.querySelectorAll('.phone_left_col > .phone_box')) {
    const question = box.querySelector(':scope > .phonebox_content_description');
    if (!question) continue;
    let note = findNote(box, dom);
    if (!note) {
      // Loose text right in the box: wrapped so it can be placed
      const text = [...box.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (!text) continue;
      note = dom.el('span');
      text.before(note);
      note.append(text);
      added.push({ remove: () => note.replaceWith(text) });
    }
    moves.push([note, note.parentNode, note.nextSibling]);
    dom.mark(note, 'data-se-phone-note');
    question.after(note);
  }

  return () => {
    while (moves.length) {
      const [node, parent, next] = moves.pop();
      dom.unmark(node, 'data-se-phone-note');
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    for (const node of added) node.remove();
  };
};
