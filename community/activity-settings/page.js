/*
 * Friend Activity Settings (/id/<name>/blotteredit): the parts CSS can't do alone.
 *
 *   - Whole-row toggles: each row's label is tied to its checkbox (label.htmlFor), so a click
 *     anywhere on the row toggles it. Labels that already point somewhere are left alone.
 *   - "N of M on": each group's header gets a count of its switched-on settings, kept current
 *     as you toggle.
 *
 * Steam repeats id="permissionsBlock" on every group; groups are found as
 * .settingsRight > [id="permissionsBlock"], each paired with the header just before it.
 */
const ROW = ':is(.permissionRow, .permissionRowAlt)';
const SWITCH = '.permissionRadio input:is([type="checkbox"], [type="radio"])';

export default (dom) => {
  const $ = dom.scope();
  const { el, setText } = dom;

  /* ---------- Whole-row toggles ---------- */

  const linked = new Set();

  const linkLabels = () => {
    for (const row of document.querySelectorAll(`.settingsRight ${ROW}`)) {
      const input = row.querySelector(SWITCH);
      const label = row.querySelector('p > label');
      if (!input?.id || !label || label.htmlFor) continue;
      label.htmlFor = input.id;
      linked.add(label);
    }
  };

  $.add(() => {
    for (const label of linked) label.removeAttribute('for');
    linked.clear();
  });

  /* ---------- Counts ---------- */

  const counts = new Map(); // group -> chip

  const placeCounts = () => {
    for (const group of document.querySelectorAll('.settingsRight > [id="permissionsBlock"]')) {
      if (counts.has(group)) continue;
      const header = group.previousElementSibling;
      if (!header?.matches('.permissionBlockHeader')) continue;
      const chip = el('span', { class: 'se-settings-count', 'aria-live': 'polite' });
      header.append(chip);
      counts.set(group, chip);
    }
  };

  const updateCounts = () => {
    for (const [group, chip] of counts) {
      const inputs = [...group.querySelectorAll(SWITCH)];
      const on = inputs.filter((input) => input.checked).length;
      setText(chip, `${on} of ${inputs.length} on`);
    }
  };

  $.add(() => {
    for (const chip of counts.values()) chip.remove();
    counts.clear();
  });

  $.listen(document, 'change', (event) => {
    if (event.target instanceof Element && event.target.matches(SWITCH)) updateCounts();
  });

  /* ---------- Run ---------- */

  const scan = () => {
    linkLabels();
    placeCounts();
    updateCounts();
  };

  $.observe(scan);
  scan();

  return () => $.destroy();
};
