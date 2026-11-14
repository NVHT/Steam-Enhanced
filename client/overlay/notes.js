/*
 * Overlay: the Notes view, saved to Steam's own game notes.
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { exportOf, scheduleRender, setText } = ns;
  const { live } = ns;

  /* ---------- Notes ---------- */

  // Steam's notes store: the GameNotesCloudStore singleton (`.Get()` on its
  // class), the one Steam's Notes widget reads through React context. Its
  // calls, as the widget uses them:
  //   GetGameNotesList({ appid }) -> [{ id, appid, ordinal, time_created,
  //                                     time_modified, title, content (BBCode) }]
  //   SaveGameNotes({ appid }, notes) -> EResult; the whole list is written
  //     to the cloud file notes_<appid>
  //   NewNote({ appid }, title) -> a new, unsaved note
  const EOK_SAVE = 1;
  const SAVE_DELAY_MS = 900;
  const NOTE_TITLE_MAX = 60;
  const notes = { appid: 0, list: null, activeId: null, status: '', readOnly: false, loading: false, error: null };
  let notesStoreRef = null;
  let saveTimer = 0;
  let pendingSave = null;

  const isNotesStore = value =>
    !!value &&
    typeof value.GetGameNotesList === 'function' &&
    typeof value.SaveGameNotes === 'function' &&
    typeof value.NewNote === 'function';

  const resolveNotesClass = () =>
    SE.findModule('overlay:notes-store', (src, id, req) =>
      exportOf(
        src,
        id,
        req,
        ['GameNotesCloudStore', 'GetGameNotesList'],
        value => typeof value?.Get === 'function' && typeof value.prototype?.GetGameNotesList === 'function'
      )
    );

  const notesStore = () => {
    if (isNotesStore(notesStoreRef)) return notesStoreRef;
    const store = SE.run(() => resolveNotesClass()?.Get());
    notesStoreRef = isNotesStore(store) ? store : null;
    return notesStoreRef;
  };

  const noteKey = appid => ({ appid });
  const savedOk = result => result === EOK_SAVE || result === true;

  // BBCode <-> the editor's HTML, for the tags the editor can write. A note
  // using anything else opens read-only, so saving can never drop content.
  const NOTE_TAGS = Object.freeze({ p: 'p', b: 'b', i: 'i', u: 'u', strike: 's', s: 's', code: 'code', url: 'a' });
  const FORMAT_TOOLS = Object.freeze([
    ['bold', 'Bold', '<b>B</b>'],
    ['italic', 'Italic', '<i>I</i>'],
    ['underline', 'Underline', '<u>U</u>'],
    ['strikeThrough', 'Strikethrough', '<s>S</s>'],
    ['code', 'Code', '<span class="se-ov-format-code">&lt;/&gt;</span>'],
  ]);

  const unsupportedTags = bbcode =>
    [...String(bbcode).matchAll(/\[\/?([a-z0-9*]+)/gi)].map(m => m[1].toLowerCase()).filter(tag => !(tag in NOTE_TAGS));

  const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const bbToHtml = bbcode => {
    const html = escapeHtml(String(bbcode || ''))
      .replace(/\[url=([^\]]+)\]/gi, (_, href) => `<a href="${href}">`)
      .replace(/\[\/url\]/gi, '</a>')
      .replace(/\[(\/?)(p|b|i|u|strike|s|code)\]/gi, (_, close, tag) => `<${close}${NOTE_TAGS[tag.toLowerCase()]}>`);
    return /<p>/i.test(html) ? html : html.split('\n').map(line => `<p>${line}</p>`).join('');
  };

  const BB_FOR = Object.freeze({ B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 'strike', STRIKE: 'strike', DEL: 'strike', CODE: 'code' });

  const htmlToBb = root => {
    const walk = node => {
      if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
      if (node.nodeType !== 1) return '';
      const inner = [...node.childNodes].map(walk).join('');
      const tag = node.tagName;
      if (tag === 'BR') return '\n';
      if (BB_FOR[tag]) return inner ? `[${BB_FOR[tag]}]${inner}[/${BB_FOR[tag]}]` : '';
      if (tag === 'A') return `[url=${node.getAttribute('href') || ''}]${inner}[/url]`;
      return inner;
    };
    // Each block (or line) is one paragraph, as Steam's editor writes them.
    const blocks = [];
    let line = '';
    for (const child of root.childNodes) {
      if (child.nodeType === 1 && /^(P|DIV|H\d|LI)$/.test(child.tagName)) {
        if (line) blocks.push(line), (line = '');
        blocks.push(walk(child));
      } else line += walk(child);
    }
    if (line) blocks.push(line);
    return blocks
      .flatMap(block => block.split('\n'))
      .map(text => `[p]${text}[/p]`)
      .join('');
  };

  const activeNote = () => notes.list?.find(note => note.id === notes.activeId) || null;

  const loadNotesFor = async appid => {
    const store = notesStore();
    if (!store) {
      notes.error = 'store';
      return scheduleRender();
    }
    notes.loading = true;
    try {
      const list = (await store.GetGameNotesList(noteKey(appid))) || [];
      if (notes.appid !== appid) return;
      notes.list = [...list].sort((a, b) => (b.time_modified || 0) - (a.time_modified || 0));
      notes.error = null;
      if (!activeNote()) notes.activeId = notes.list[0]?.id ?? null;
    } catch (err) {
      notes.error = String(err?.message || err);
    } finally {
      notes.loading = false;
      scheduleRender();
    }
  };

  // Write the whole list back, with this note replaced (or added), from a fresh
  // read, the way Steam's own widget saves.
  const writeNote = async (appid, note) => {
    const store = notesStore();
    const fresh = (await store.GetGameNotesList(noteKey(appid))) || [];
    const next = fresh.some(n => n.id === note.id) ? fresh.map(n => (n.id === note.id ? note : n)) : [...fresh, note];
    const result = await store.SaveGameNotes(noteKey(appid), next);
    if (!savedOk(result)) throw new Error(`EResult ${result}`);
    return next;
  };

  const flushSave = async () => {
    clearTimeout(saveTimer);
    const job = pendingSave;
    pendingSave = null;
    if (!job) return;
    notes.status = 'Saving…';
    scheduleRender();
    try {
      const saved = await writeNote(job.appid, job.note);
      if (notes.appid === job.appid) {
        notes.list = notes.list.map(n => (n.id === job.note.id ? job.note : n));
        if (!notes.list.some(n => n.id === job.note.id)) notes.list = [job.note, ...notes.list];
      }
      notes.status = saved ? 'Saved to Steam Cloud' : '';
    } catch (err) {
      notes.status = "Couldn't save. Your text is still here; try again.";
      console.warn('[Steam Enhanced overlay] note save failed', err);
    }
    scheduleRender();
  };

  const noteEdited = () => {
    const part = live.ui?.overview.tools.notes;
    const note = activeNote();
    if (!part || !note || notes.readOnly) return;
    // Like Steam's editor: the note's title is its first line.
    const firstLine = (part.editor.innerText || '').split('\n').map(line => line.trim()).find(Boolean) || '';
    const title = firstLine.slice(0, NOTE_TITLE_MAX) || 'Untitled Note';
    const content = htmlToBb(part.editor);
    const updated = { ...note, title, content, time_modified: Math.floor(Date.now() / 1000) };
    delete updated.not_persisted;
    pendingSave = { appid: notes.appid, note: updated };
    notes.status = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
    // Keep the picker's label in step with the title.
    const option = [...part.picker.options].find(o => o.value === note.id);
    if (option && option.textContent !== title) option.textContent = title;
    scheduleRender();
  };

  const showNote = (part, note) => {
    notes.readOnly = !!note && unsupportedTags(note.content).length > 0;
    part.editor.innerHTML = note ? bbToHtml(note.content) : '';
    part.editor.contentEditable = String(!!note && !notes.readOnly);
    part.editor.dataset.readonly = String(notes.readOnly);
    notes.status = notes.readOnly ? 'This note uses formatting only Steam’s editor can change.' : '';
  };

  const pickNote = async id => {
    await flushSave();
    notes.activeId = id;
    const part = live.ui?.overview.tools.notes;
    if (part) showNote(part, activeNote());
    scheduleRender();
  };

  const newNote = async () => {
    const store = notesStore();
    if (!store || !notes.appid) return;
    await flushSave();
    const note = SE.run(() => store.NewNote(noteKey(notes.appid), 'Untitled Note'));
    if (!note) return;
    const fresh = { ...note, title: note.title || 'Untitled Note', content: note.content || '', time_modified: Math.floor(Date.now() / 1000) };
    delete fresh.not_persisted;
    notes.list = [fresh, ...(notes.list || [])];
    notes.activeId = fresh.id;
    const part = live.ui?.overview.tools.notes;
    if (part) {
      part.listSig = '';
      showNote(part, fresh);
      requestAnimationFrame(() => part.editor.focus());
    }
    pendingSave = { appid: notes.appid, note: fresh };
    await flushSave();
  };

  const askDeleteNote = show => {
    const part = live.ui?.overview.tools.notes;
    if (part) part.confirm.hidden = !show || !activeNote();
  };

  const deleteNote = async () => {
    const store = notesStore();
    const note = activeNote();
    askDeleteNote(false);
    if (!store || !note) return;
    clearTimeout(saveTimer);
    pendingSave = null;
    try {
      const fresh = (await store.GetGameNotesList(noteKey(notes.appid))) || [];
      const result = await store.SaveGameNotes(noteKey(notes.appid), fresh.filter(n => n.id !== note.id));
      if (!savedOk(result)) throw new Error(`EResult ${result}`);
      notes.list = notes.list.filter(n => n.id !== note.id);
      notes.activeId = notes.list[0]?.id ?? null;
      notes.status = 'Note deleted';
      const part = live.ui?.overview.tools.notes;
      if (part) (part.listSig = ''), showNote(part, activeNote());
    } catch (err) {
      notes.status = "Couldn't delete the note.";
      console.warn('[Steam Enhanced overlay] note delete failed', err);
    }
    scheduleRender();
  };

  const formatNote = command => {
    const part = live.ui?.overview.tools.notes;
    if (!part || notes.readOnly || !activeNote()) return;
    part.editor.focus();
    if (command === 'code') {
      const selection = getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const code = document.createElement('code');
      code.append(range.extractContents());
      range.insertNode(code);
    } else {
      document.execCommand(command);
    }
    noteEdited();
  };

  const renderNotesView = (part, appid) => {
    if (notes.appid !== appid) {
      Object.assign(notes, { appid, list: null, activeId: null, status: '', error: null });
      part.listSig = '';
      if (appid) loadNotesFor(appid);
    } else if (!notes.list && !notes.loading && !notes.error && appid) loadNotesFor(appid);

    const list = notes.list || [];
    const sig = JSON.stringify([appid, notes.activeId, list.map(n => [n.id, n.title])]);
    if (part.listSig !== sig) {
      const first = !part.listSig;
      part.listSig = sig;
      part.picker.replaceChildren(
        ...list.map(note => {
          const option = el('option', null, note.title || 'Untitled Note');
          option.value = note.id;
          option.selected = note.id === notes.activeId;
          return option;
        })
      );
      // Fill the editor when the note changes, never while typing.
      if (first || part.editor.dataset.noteId !== String(notes.activeId)) {
        part.editor.dataset.noteId = String(notes.activeId);
        showNote(part, activeNote());
      }
    }
    const ready = !!notesStore() && !!notes.list;
    const hasNote = !!activeNote();
    part.picker.disabled = !list.length;
    part.add.disabled = !ready;
    part.remove.disabled = !hasNote;
    for (const node of [part.tools, part.editor]) node.hidden = !hasNote;
    part.empty.hidden = hasNote;
    setText(
      part.empty,
      notes.error === 'store'
        ? 'Steam’s notes aren’t available here. Use Steam’s editor instead.'
        : notes.error
          ? 'Couldn’t load your notes.'
          : !notes.list
            ? 'Loading notes…'
            : 'No notes for this game yet. Press + New to start one.'
    );
    setText(part.status, notes.status);
  };

  Object.assign(ns, { FORMAT_TOOLS, askDeleteNote, deleteNote, flushSave, formatNote, newNote, noteEdited, notes, notesStore, pickNote, renderNotesView });
});
