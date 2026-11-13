/*
 * Discussions:
 *   - Label chips: Steam writes topic labels as "PINNED:" / "MOVED:"; the trailing colon is
 *     dropped so they read as chips. Restored on destroy.
 *   - OP chip: an "OP" chip on the topic starter's replies. The starter is the opening post's
 *     author link (.forum_op .forum_op_author); each reply whose author link points to the same
 *     profile gets [data-se-op], which shared/ui.css draws as the chip.
 *
 * Topics and replies page in place, so new ones are handled as they arrive.
 *
 * Classes are Steam's (SteamTracking: steamcommunity.com/public/css/skin_1/forums.css).
 */
const profileKey = (href) => {
  try {
    return new URL(href, location.href).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return '';
  }
};

export default (dom) => {
  const $ = dom.scope();

  const tag = () => {
    const op = document.querySelector('.forum_op .forum_op_author[href], .forum_op a.forum_op_author');
    const key = op ? profileKey(op.getAttribute('href')) : '';
    if (!key) return;
    for (const comment of document.querySelectorAll('.forumtopic_comments .commentthread_comment, .commentthread_comments .commentthread_comment')) {
      const link = comment.querySelector('.commentthread_author_link[href]');
      const mine = Boolean(link) && profileKey(link.getAttribute('href')) === key;
      if (mine) dom.mark(comment, 'data-se-op');
      else dom.unmark(comment, 'data-se-op');
    }
  };

  $.add(() => {
    for (const comment of document.querySelectorAll('[data-se-op]')) comment.removeAttribute('data-se-op');
  });

  const labels = new Map(); // label -> original text

  const tidyLabels = () => {
    for (const label of document.querySelectorAll('.forum_topic_label')) {
      if (labels.has(label)) continue;
      const text = label.textContent;
      const tidy = text.replace(/\s*:\s*$/, '');
      if (tidy === text || label.childElementCount) continue;
      labels.set(label, text);
      label.textContent = tidy;
    }
  };

  $.add(() => {
    for (const [label, text] of labels) if (label.isConnected) label.textContent = text;
    labels.clear();
  });

  const scan = () => {
    tag();
    tidyLabels();
  };

  $.observe(scan);
  scan();

  return () => $.destroy();
};
