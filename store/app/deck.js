/*
 * Steam Deck compatibility of the game page, shared by app/hero.js and app/summary.js.
 *
 * Steam renders the Deck block with React in the right column: a "Steam Deck Compatibility"
 * heading, then the status in its own element (an icon and a span reading "Verified",
 * "Playable", "Unsupported" or "Unknown"). The block's textContent runs those together with no
 * space ("...CompatibilityVerified"), so the status is found as an element whose whole text is the
 * word, inside the block that mentions Steam Deck. When Steam mounts it from
 * [data-featuretarget="deck-verified-results"], that node's data-props rating
 * (resolved_category: 0 Unknown, 1 Unsupported, 2 Playable, 3 Verified) is read first, in any
 * language. Returns 'Verified' | 'Playable' | 'Unsupported' | 'Unknown' (Valve hasn't tested
 * it yet), or '' while not yet rendered.
 *
 * findDeckBlock() returns Steam's whole Deck section (heading, status, "Learn more"), so the
 * hero can hide it once its chip shows the status: the section stays in the DOM, so readDeck()
 * keeps working and its "Learn more" button can still be clicked from the chip.
 */
const CATEGORY = { 0: 'Unknown', 1: 'Unsupported', 2: 'Playable', 3: 'Verified' };
const STATUS = /^(Verified|Playable|Unsupported|Unknown)$/i;

const fromProps = (node) => {
  try {
    return CATEGORY[JSON.parse(node.dataset.props ?? '{}').resolved_category] ?? '';
  } catch {
    return '';
  }
};

/** The first element in `block` whose entire text is a status word. */
const fromText = (block) => {
  for (const node of block.querySelectorAll('span, div, p, a')) {
    if (node.childElementCount > 1) continue;
    const match = STATUS.exec(node.textContent.trim());
    if (match) return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  }
  return '';
};

/** Steam's mount nodes first, else the right-column blocks that mention Steam Deck. */
const candidates = () => [
  ...document.querySelectorAll('[data-featuretarget="deck-verified-results"]'),
  ...[...document.querySelectorAll('.game_meta_data > div, .game_meta_data .block')].filter((block) =>
    /Steam Deck/i.test(block.textContent),
  ),
];

/**
 * The section to hide: the smallest element around the Deck results that also holds its
 * "Steam Deck Compatibility" heading (which can sit beside the React mount), never climbing
 * past the right column's own children, so neighbouring blocks are left alone.
 */
export const findDeckBlock = () => {
  for (const node of candidates()) {
    if (!(fromProps(node) || fromText(node))) continue;
    let block = node;
    while (!/Steam Deck/i.test(block.textContent) && block.parentElement && !block.parentElement.matches('.game_meta_data')) {
      block = block.parentElement;
    }
    return block;
  }
  return null;
};

/** Steam's "Learn more" control in the Deck section (opens its compatibility details). */
export const findLearnMore = () =>
  findDeckBlock()?.querySelector('button, [role="button"], a[href]:not([href^="#"]), a[onclick]') ?? null;

export const readDeck = () => {
  for (const node of document.querySelectorAll('[data-featuretarget="deck-verified-results"]')) {
    const status = fromProps(node) || fromText(node);
    if (status) return status;
  }
  for (const block of document.querySelectorAll('.game_meta_data > div, .game_meta_data .block')) {
    if (!/Steam Deck/i.test(block.textContent)) continue;
    const status = fromText(block);
    if (status) return status;
  }
  return '';
};
