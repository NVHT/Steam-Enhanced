/*
 * Steam Subscriber Agreement (/subscriber_agreement/): one long run of paragraphs in #ssa_body,
 * a table of contents at the top and a ⏶ link back to it on every heading. The Privacy Policy
 * (/privacy_agreement/) shares its frame, with loose text and bold numbered headings in
 * #newsColumn instead. Each has a reader below; both are rebuilt as one reading page:
 *
 *   - a header with the title, section count, reading time and the language flags
 *   - the table of contents as a sticky sidebar that marks the section being read, with a
 *     reading progress bar
 *   - each numbered part as a card under its own heading (number badge, the contents' title,
 *     copy link), lettered sub-headings ("D. Enforcement") set apart, all-caps clauses toned down
 *   - the ⏶ links give way to the store's scroll-to-top button (shared/scroll-top.js)
 *
 * The page is server-rendered once and Steam never touches it again, so nodes are moved into
 * the theme's wrappers; destroy() puts every one back where it was. Sections follow Steam's
 * own numbering in every language.
 */
const HEADER_OFFSET = 96; // px under the floating store bar that counts as "reading this"
const WPM = 230;

const ICONS = {
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  doc: '<path class="d" d="M6 3h8l4 4v14H6z"/><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  clock: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

const svg = (name) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name];
  return node;
};

const words = (text) => (text.match(/\S+/g) ?? []).length;

/* Mostly upper-case prose (liability clauses): letters, not punctuation, decide */
const isShouting = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 120) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  return upper / letters.length > 0.7;
};

/* ---------- Readers: Steam's page to { root, intro, sections, hidden, tocLabel } ---------- */

/*
 * Subscriber Agreement: #ssa_body is block elements. Sections are cut at the anchors the table
 * of contents links to (href="#n" → <a name="n">); each opens with a paragraph heading
 * ("1. REGISTRATION …" with a ⏶ link), and the contents' own wording is the title.
 */
const readAgreement = (dom) => {
  const root = document.getElementById('ssa_body');
  if (!root) return null;
  const tocList = root.querySelector(':scope > ol');
  const tocLinks = tocList ? [...tocList.querySelectorAll('a[href^="#"]')] : [];
  const children = [...root.children];
  const topLevel = (node) => {
    while (node && node.parentElement !== root) node = node.parentElement;
    return node;
  };
  const entries = tocLinks
    .map((link) => {
      const name = decodeURIComponent(link.hash.slice(1));
      const target = name && root.querySelector(`a[name="${CSS.escape(name)}"], [id="${CSS.escape(name)}"]`);
      return { name, title: dom.squash(link.textContent), anchor: topLevel(target) };
    })
    .filter((entry) => entry.anchor && entry.anchor !== tocList)
    .sort((a, b) => children.indexOf(a.anchor) - children.indexOf(b.anchor));
  if (entries.length < 3) return null;

  const tocIntro = tocList.previousElementSibling?.matches('p') ? tocList.previousElementSibling : null;
  const skip = new Set([tocList, tocIntro]);
  const firstIndex = children.indexOf(entries[0].anchor);
  return {
    root,
    tocLabel: dom.squash(tocIntro?.textContent).replace(/[:：]\s*$/, ''),
    hidden: [tocList, tocIntro, ...children.slice(0, firstIndex).filter((node) => node.matches('h3, br'))].filter(Boolean),
    intro: children.slice(0, firstIndex).filter((node) => !skip.has(node) && !node.matches('h3, br')),
    sections: entries.map((entry, i) => {
      const start = children.indexOf(entry.anchor);
      const end = i + 1 < entries.length ? children.indexOf(entries[i + 1].anchor) : children.length;
      const nodes = children.slice(start, end).filter((node) => !skip.has(node));
      const heading = nodes.find((node) => node.matches('p'));
      const number = dom.squash(heading?.textContent).match(/^(\d+)\./)?.[1] ?? String(i + 1);
      return { name: entry.name, title: entry.title, number, heading, nodes };
    }),
  };
};

/*
 * Privacy Policy: #newsColumn is one run of text nodes, <br>s, links and lists, with no
 * contents and no anchors. Sections are cut at the bold numbered headings ("1. Definitions");
 * the heading's own text is the title, and each card gets an id (#section-1) to link to.
 */
const readPrivacy = (dom) => {
  const root = document.getElementById('newsColumn');
  if (!root) return null;
  const nodes = [...root.childNodes];
  const HEADING = /^(\d+)\.\s+(.+)$/;
  const starts = nodes
    .map((node, index) => ({ node, index, match: node.nodeType === Node.ELEMENT_NODE && node.matches('b, strong') && dom.squash(node.textContent).match(HEADING) }))
    .filter((entry) => entry.match);
  if (starts.length < 3) return null;
  return {
    root,
    tocLabel: '',
    hidden: [document.getElementById('pageTitle')].filter(Boolean),
    intro: nodes.slice(0, starts[0].index),
    sections: starts.map((start, i) => ({
      name: `section-${start.match[1]}`,
      title: start.match[2],
      number: start.match[1],
      heading: start.node,
      nodes: nodes.slice(start.index, i + 1 < starts.length ? starts[i + 1].index : nodes.length),
      ownId: true,
    })),
  };
};

const isBlankNode = (node) => node.nodeType === Node.TEXT_NODE && !node.textContent.trim();

export default async (dom) => {
  await dom.ready();
  const box = document.getElementById('ssa_box');
  const titleArea = document.querySelector('#main_content > .page_title_area');
  const read = box && titleArea ? readAgreement(dom) ?? readPrivacy(dom) : null;
  if (!read) return () => {};
  const body = read.root;

  const $ = dom.scope();
  const { mark, move } = $;

  // What the sidebar and header replace (the contents list, Steam's own heading)
  for (const node of read.hidden) mark(node, 'data-se-ssa-hidden');

  /* ---------- Sections ---------- */

  const intro = dom.el('section', { class: 'se-ssa-card se-ssa-intro', 'data-se-ssa': 'intro' });
  for (const node of read.intro) move(node, intro);

  const copyLink = (button, hash) => {
    const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    button.replaceChildren(svg('check'));
    dom.mark(button, 'data-copied');
    $.timeout(() => {
      button.replaceChildren(svg('link'));
      dom.unmark(button, 'data-copied');
    }, 1400);
  };

  const sections = read.sections.map((entry) => {
    const { heading, number } = entry;
    if (heading) mark(heading, 'data-se-ssa-hidden');

    const link = dom.el('button', { class: 'se-ssa-link', type: 'button', 'aria-label': 'Copy link to this section', title: 'Copy link' }, svg('link'));
    $.listen(link, 'click', () => copyLink(link, entry.name));
    const head = dom.el('header', { class: 'se-ssa-head' }, [
      dom.el('span', { class: 'se-ssa-num', text: number }),
      dom.el('h2', { class: 'se-ssa-title', text: entry.title }),
      link,
    ]);

    const card = dom.el('section', { class: 'se-ssa-card', 'data-se-ssa': 'section', 'aria-label': entry.title, id: entry.ownId ? entry.name : null }, head);
    let hasText = false; // a sub-heading that opens the section gets no divider above it
    for (const node of entry.nodes) {
      move(node, card);
      if (node === heading || node.nodeType !== Node.ELEMENT_NODE || !node.matches('p, ul, ol')) continue;
      const text = dom.squash(node.textContent);
      if (!text) continue;
      // Lettered sub-headings: "D. Enforcement"
      if (node.matches('p') && /^[A-Z]\.\s+\S/.test(text) && text.length < 90 && !/[.:;]$/.test(text)) mark(node, 'data-se-ssa-sub', hasText ? '' : 'first');
      else if (node.matches('p') && isShouting(text)) mark(node, 'data-se-ssa-caps');
      hasText = true;
    }
    return { ...entry, card };
  });

  /* ---------- Layout: sidebar and document ---------- */

  const progressBar = dom.el('span', { class: 'se-ssa-progress-bar' });
  const progressText = dom.el('span', { class: 'se-ssa-progress-text', text: '0%' });
  const nav = dom.el('nav', { class: 'se-ssa-toc', 'aria-label': 'Contents' });
  for (const section of sections) {
    const item = dom.el('a', { class: 'se-ssa-toc-item', href: `#${section.name}` }, [
      dom.el('span', { class: 'se-ssa-toc-num', text: section.number }),
      dom.el('span', { class: 'se-ssa-toc-title', text: section.title }),
    ]);
    $.listen(item, 'click', (event) => {
      event.preventDefault();
      goTo(section);
    });
    section.item = item;
    nav.append(item);
  }
  const aside = dom.el('aside', { class: 'se-ssa-aside', 'data-se-ssa': 'aside' }, [
    dom.el('div', { class: 'se-ssa-aside-head' }, [
      dom.el('span', { class: 'se-ssa-aside-title', text: read.tocLabel || 'Contents' }),
      progressText,
    ]),
    dom.el('div', { class: 'se-ssa-progress' }, progressBar),
    nav,
  ]);

  // Steam pads the text with blank paragraphs (spacers, or an anchor alone) and runs of <br> at
  // a section's edges: they'd only add gaps. Inner <br> pairs stay, as paragraph breaks.
  const isGap = (node) => isBlankNode(node) || node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.ELEMENT_NODE && (node.matches('br, [data-se-ssa-hidden]') || node.matches('a[name]:empty')));
  for (const card of [intro, ...sections.map((section) => section.card)]) {
    for (const node of card.querySelectorAll(':scope > p')) {
      if (!dom.squash(node.textContent) && !node.querySelector('img, iframe, video')) mark(node, 'data-se-ssa-hidden');
    }
    const flow = [...card.childNodes].filter((node) => !node.matches?.('.se-ssa-head'));
    for (const edge of [flow, flow.slice().reverse()]) {
      for (const node of edge) {
        if (!isGap(node)) break;
        if (node.nodeType === Node.ELEMENT_NODE && node.matches('br')) mark(node, 'data-se-ssa-hidden');
      }
    }
  }

  const doc = dom.el('div', { class: 'se-ssa-doc', 'data-se-ssa': 'doc' });
  if (dom.squash(intro.textContent)) doc.append(intro);
  doc.append(...sections.map((section) => section.card));

  // Links Steam leaves loose under the box ("Privacy Feedback") sit at the foot of the sidebar
  const loose = [...(box.parentElement?.children ?? []), ...box.children].filter((node) => node.matches('a[href]') && dom.squash(node.textContent));
  // The <br>s Steam puts before them inside the box would be left as a gap under the document
  for (const node of box.children) if (node.matches('br')) mark(node, 'data-se-ssa-hidden');
  if (loose.length) {
    const foot = dom.el('div', { class: 'se-ssa-foot', 'data-se-ssa': 'foot' });
    for (const link of loose) move(link, foot);
    aside.append(foot);
  }
  body.append(doc);

  const layout = dom.el('div', { class: 'se-ssa-layout', 'data-se-ssa': 'layout' }, aside);
  move(box, layout);
  titleArea.after(layout);

  /* ---------- Header: count, reading time, languages ---------- */

  const minutes = Math.max(1, Math.round(words(body.textContent) / WPM));
  const meta = dom.el('div', { class: 'se-ssa-meta', 'data-se-ssa': 'meta' }, [
    dom.el('span', { class: 'se-ssa-meta-item' }, [svg('doc'), dom.el('span', { text: `${sections.length} sections` })]),
    dom.el('span', { class: 'se-ssa-meta-item' }, [svg('clock'), dom.el('span', { text: `${minutes} min read` })]),
  ]);
  const languages = document.getElementById('languages');
  if (languages) {
    for (const flag of languages.querySelectorAll('a')) {
      const img = flag.querySelector('img');
      const label = img?.title || img?.alt || flag.title;
      if (label && !flag.title) {
        flag.title = label;
        $.add(() => flag.removeAttribute('title'));
      }
    }
    move(languages, meta);
  }
  titleArea.append(meta);

  mark(document.documentElement, 'data-se-ssa-ready');

  /* ---------- Scrolling: active section, progress ---------- */

  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  const goTo = (section) => {
    section.card.scrollIntoView({ behavior: smooth(), block: 'start' });
    history.replaceState(history.state, '', `#${section.name}`);
  };

  let active = null;
  const update = dom.perFrame(() => {
    const docRect = doc.getBoundingClientRect();
    const span = docRect.height - innerHeight + HEADER_OFFSET;
    const progress = span > 0 ? Math.min(1, Math.max(0, (HEADER_OFFSET - docRect.top) / span)) : 1;
    dom.setVar(aside, '--se-ssa-progress', progress.toFixed(4));
    dom.setText(progressText, `${Math.round(progress * 100)}%`);

    let current = sections[0];
    for (const section of sections) if (section.card.getBoundingClientRect().top <= HEADER_OFFSET + 8) current = section;
    // The last sections can't scroll up to the bar: at the page's end, the last one is the one read
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = sections[sections.length - 1];
    if (current !== active) {
      active?.item.removeAttribute('aria-current');
      current.item.setAttribute('aria-current', 'true');
      active = current;
      // Keep the active entry in the sidebar's view without moving the page
      const item = current.item;
      if (item.offsetTop < nav.scrollTop || item.offsetTop + item.offsetHeight > nav.scrollTop + nav.clientHeight) {
        nav.scrollTo({ top: item.offsetTop - nav.clientHeight / 2 + item.offsetHeight / 2, behavior: 'auto' });
      }
    }
  });
  $.listen(window, 'scroll', update, { passive: true });
  $.listen(window, 'resize', update, { passive: true });
  $.add(update.cancel);
  update();

  // A link in from outside (#3) lands on its card once the layout has settled
  if (location.hash) {
    const target = sections.find((section) => `#${section.name}` === decodeURIComponent(location.hash));
    if (target) requestAnimationFrame(() => target.card.scrollIntoView({ block: 'start' }));
  }

  return () => {
    $.destroy();
    meta.remove();
    layout.remove();
    doc.remove();
    intro.remove();
    for (const section of sections) section.card.remove();
  };
};

