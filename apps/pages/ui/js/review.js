/* ZengPages review: comments, track changes, footnotes, table of contents, bookmarks, outline, stats. */
(() => {
  'use strict';
  const P = window.P, flow = P.flow, S = P.S;
  const mk = (t, cls) => { const e = document.createElement(t); if (cls) e.className = cls; return e; };

  /* ================= comments ================= */
  const R = (P.review = {});
  P.activeComment = null;
  const textNodesIn = (r) => {
    const out = []; const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (r.intersectsNode(n) && n.nodeValue.length && !n.parentElement.closest('.pgsp,[contenteditable=false]') ? 1 : 2) });
    while (w.nextNode()) out.push(w.currentNode); return out;
  };
  const splitRange = (r) => {
    let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = r;
    if (ec.nodeType === 3 && eo < ec.nodeValue.length && eo > 0) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.nodeValue.length) { const t = sc.splitText(so); if (sc === ec) { ec = t; eo -= so; } sc = t; so = 0; }
    const nr = document.createRange(); nr.setStart(sc, so); nr.setEnd(ec, ec === sc && sc.nodeType === 3 ? Math.min(eo, ec.nodeValue.length) : eo);
    return textNodesIn(nr).filter((n) => { const a = n === sc ? so : 0; const b = n === ec ? eo : n.nodeValue.length; return b > a; });
  };
  const wordRange = () => {
    const s = getSelection(); const n = s.anchorNode; if (!n || n.nodeType !== 3) return null; const t = n.nodeValue; let a = s.anchorOffset, b = a;
    while (a > 0 && /\S/.test(t[a - 1])) a--; while (b < t.length && /\S/.test(t[b])) b++; if (a === b) return null; const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return r;
  };
  R.add = (text) => {
    P.focus(); let r = P.range(); if (!r) return null; if (r.collapsed) { r = wordRange() || (() => { const p = P.paraOf(r.startContainer); if (!p) return null; const q = document.createRange(); q.selectNodeContents(p); return q.toString().trim() ? q : null; })(); }
    if (!r) { zk.toast('Select some text to comment on'); return null; }
    P.checkpoint(false); const id = 'c' + P.uid(); const nodes = splitRange(r); if (!nodes.length) return null; let quote = '';
    for (const t of nodes) { quote += t.nodeValue; const sp = mk('span', 'cmt'); sp.dataset.cid = id; t.parentNode.insertBefore(sp, t); sp.append(t); }
    S.comments.push({ id, author: S.author, date: new Date().toISOString(), text: text || '', resolved: false, replies: [], quote: quote.slice(0, 120) });
    P.markDirty(); P.changed(); return id;
  };
  R.find = (id) => S.comments.find((c) => c.id === id);
  R.spans = (id) => [...flow.querySelectorAll(`.cmt[data-cid="${id}"]`)];
  R.remove = (id) => { P.checkpoint(false); for (const sp of R.spans(id)) { const p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); sp.remove(); p.normalize(); } S.comments = S.comments.filter((c) => c.id !== id); P.markDirty(); P.changed(); };
  R.resolve = (id, v = true) => { const c = R.find(id); if (!c) return; P.checkpoint(false); c.resolved = v; R.styleAll(); P.markDirty(); };
  R.reply = (id, text) => { const c = R.find(id); if (!c || !text.trim()) return; P.checkpoint(false); c.replies.push({ author: S.author, date: new Date().toISOString(), text }); P.markDirty(); };
  R.edit = (id, text, ri) => { const c = R.find(id); if (!c) return; P.checkpoint(false); if (ri == null) c.text = text; else c.replies[ri].text = text; P.markDirty(); };
  R.styleAll = () => { for (const sp of flow.querySelectorAll('.cmt[data-cid]')) { const c = R.find(sp.dataset.cid); sp.classList.toggle('resolved', !!(c && c.resolved)); if (!c) { /* orphan span */ const p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); sp.remove(); } } };
  P.reapplyComments = () => { R.styleAll(); };
  R.order = () => { const seen = new Set(); const ids = []; for (const sp of flow.querySelectorAll('.cmt[data-cid]')) if (!seen.has(sp.dataset.cid)) { seen.add(sp.dataset.cid); ids.push(sp.dataset.cid); } return ids.map(R.find).filter(Boolean); };
  R.setActive = (id) => { P.activeComment = id; for (const sp of flow.querySelectorAll('.cmt[data-sel]')) sp.removeAttribute('data-sel'); if (id) for (const sp of R.spans(id)) sp.setAttribute('data-sel', '1'); P.ui && P.ui.renderReview && P.ui.renderReview(); };
  R.goto = (id) => { const s = R.spans(id)[0]; if (s) { P.scrollToEl(s); R.setActive(id); } };
  flow.addEventListener('click', (e) => { const sp = e.target.closest && e.target.closest('.cmt[data-cid]'); if (sp) { P.ui && P.ui.showReview && P.ui.showReview(); R.setActive(sp.dataset.cid); } });
  // drop comments whose anchors vanished (deleted text) -- keep list tidy
  R.prune = () => { const live = new Set([...flow.querySelectorAll('.cmt[data-cid]')].map((s) => s.dataset.cid)); const before = S.comments.length; S.comments = S.comments.filter((c) => live.has(c.id)); return before !== S.comments.length; };

  /* ================= track changes ================= */
  const stamp = (el) => { el.setAttribute('data-tc', '1'); el.setAttribute('data-a', S.author); el.setAttribute('data-d', new Date().toISOString()); return el; };
  const own = (el) => el && el.getAttribute('data-a') === S.author;
  const closestTC = (n, tag) => { let e = n.nodeType === 3 ? n.parentElement : n; while (e && e !== flow) { if (e.tagName === tag && e.hasAttribute('data-tc')) return e; e = e.parentElement; } return null; };
  const markDeleted = (r) => {
    const nodes = splitRange(r); let lastDel = null, first = null;
    for (const t of nodes) {
      if (closestTC(t, 'DEL')) { lastDel = closestTC(t, 'DEL'); first ||= lastDel; continue; }
      const mine = closestTC(t, 'INS');
      if (mine && own(mine)) { const par = t.parentNode; t.remove(); if (!mine.textContent) mine.remove(); par.normalize && par.normalize(); continue; }
      const d = stamp(mk('del')); t.parentNode.insertBefore(d, t); d.append(t); lastDel = d; first ||= d;
    }
    return { first, last: lastDel };
  };
  R.beforeInput = (e) => {
    if (!S.track) return false; const t = e.inputType; const s = getSelection(); if (!s.rangeCount || !flow.contains(s.anchorNode)) return false;
    if (t === 'insertText' && e.data) {
      let r = s.getRangeAt(0);
      if (r.collapsed) { const cur = closestTC(r.startContainer, 'INS'); if (cur && own(cur)) return false; }
      P.checkpoint(true); e.preventDefault();
      if (!r.collapsed) { const { last } = markDeleted(r); const nr = document.createRange(); last ? nr.setStartAfter(last) : nr.setStart(r.endContainer, r.endOffset); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); r = nr; }
      const ins = stamp(mk('ins')); ins.textContent = e.data; const del = closestTC(r.startContainer, 'DEL');
      if (del) { const rr = document.createRange(); rr.setStartAfter(del); rr.collapse(true); rr.insertNode(ins); } else r.insertNode(ins);
      const nr = document.createRange(); nr.setStart(ins.firstChild, ins.firstChild.length); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); P.changed({ typing: true }); P.markDirty(); return true;
    }
    if (/^delete(Content|Word|Soft|Hard|ByCut)/.test(t) || t === 'deleteByCut') {
      let r = s.getRangeAt(0); const fwd = /Forward$/.test(t); P.checkpoint(false);
      if (r.collapsed) { const gran = /Word/.test(t) ? 'word' : /Soft|Hard/.test(t) ? 'lineboundary' : 'character'; s.modify('extend', fwd ? 'forward' : 'backward', gran); r = s.getRangeAt(0); if (r.collapsed) return false; }
      // never track-delete across non-text objects or block boundaries by swallowing: only text in range gets marked
      e.preventDefault(); const { first, last } = markDeleted(r); const nr = document.createRange();
      if (fwd && last) nr.setStartAfter(last); else if (first) nr.setStartBefore(first); else nr.setStart(r.startContainer, r.startOffset); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); P.changed(); P.markDirty(); return true;
    }
    return false;
  };
  R.changes = () => [...flow.querySelectorAll('ins[data-tc],del[data-tc]')];
  R.accept = (el) => { P.checkpoint(false); const rm = (x) => { x.tagName === 'INS' ? unwrap(x) : x.remove(); }; rm(el); P.changed(); P.markDirty(); };
  R.reject = (el) => { P.checkpoint(false); el.tagName === 'INS' ? el.remove() : unwrap(el); P.changed(); P.markDirty(); };
  const unwrap = (el) => { const p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); el.remove(); p.normalize && p.normalize(); };
  R.acceptAll = () => { P.checkpoint(false); for (const el of R.changes()) el.tagName === 'INS' ? unwrap(el) : el.remove(); P.changed(); P.markDirty(); };
  R.rejectAll = () => { P.checkpoint(false); for (const el of R.changes()) el.tagName === 'INS' ? el.remove() : unwrap(el); P.changed(); P.markDirty(); };
  R.toggle = (v) => { S.track = v ?? !S.track; P.ui && P.ui.refreshAll && P.ui.refreshAll(); zk.toast(S.track ? 'Track Changes on' : 'Track Changes off'); };

  /* ================= footnotes ================= */
  P.insertFootnote = () => {
    P.focus(); P.checkpoint(false); const r = P.range(); if (!r) return; if (P.cellOf(r.startContainer) && false) return;
    const id = 'f' + P.uid(); const ref = mk('sup', 'fnr'); ref.dataset.fn = id; ref.setAttribute('contenteditable', 'false'); r.deleteContents(); r.insertNode(ref);
    let sep = flow.querySelector('hr.fnsep'); if (!sep) { sep = mk('hr', 'fnsep'); sep.setAttribute('contenteditable', 'false'); const tail = P.emptyP(); flow.append(sep); void tail; }
    const p = mk('p'); p.dataset.st = 'Footnote'; p.dataset.fnid = id; p.append(document.createElement('br')); flow.append(p);
    P.renumberFootnotes(); P.changed(); P.markDirty(); P.placeCaretIn(p); P.ensureCaretVisible(); zk.toast('Footnote added at the end of the document — press ⌘↩ (Ctrl+Enter) to jump back');
  };
  P.renumberFootnotes = () => {
    const refs = [...flow.querySelectorAll('sup.fnr[data-fn]')]; const notes = new Map([...flow.querySelectorAll('p[data-fnid]')].map((p) => [p.dataset.fnid, p]));
    refs.forEach((ref, i) => { const n = String(i + 1); if (ref.getAttribute('data-n') !== n) ref.setAttribute('data-n', n); const note = notes.get(ref.dataset.fn); if (note && note.getAttribute('data-n') !== n) note.setAttribute('data-n', n); });
    const used = new Set(refs.map((r) => r.dataset.fn)); let changed = false;
    for (const [id, p] of notes) if (!used.has(id)) { p.remove(); changed = true; }
    const sep = flow.querySelector('hr.fnsep'); const any = flow.querySelector('p[data-fnid]');
    if (sep && !any) { sep.remove(); changed = true; }
    // keep notes in reference order, after the separator
    if (any && sep) { let prev = sep; for (const ref of refs) { const p = notes.get(ref.dataset.fn); if (p && p.isConnected) { if (prev.nextElementSibling !== p) { prev.after(p); changed = true; } prev = p; } } }
    return changed;
  };
  P.gotoFootnote = () => {
    const s = getSelection(); const n = s.anchorNode; const note = n && P.paraOf(n); if (note && note.dataset.fnid) { const ref = flow.querySelector(`sup.fnr[data-fn="${note.dataset.fnid}"]`); if (ref) { P.scrollToEl(ref); const r = document.createRange(); r.setStartAfter(ref); r.collapse(true); s.removeAllRanges(); s.addRange(r); } return; }
    const ref = n && (n.nodeType === 3 ? n.parentElement : n).closest?.('sup.fnr'); if (ref) { const p = flow.querySelector(`p[data-fnid="${ref.dataset.fn}"]`); if (p) { P.scrollToEl(p); P.placeCaretIn(p, true); } }
  };
  flow.addEventListener('click', (e) => { const ref = e.target.closest && e.target.closest('sup.fnr'); if (ref) { const p = flow.querySelector(`p[data-fnid="${ref.dataset.fn}"]`); if (p) { P.scrollToEl(p); P.placeCaretIn(p, true); } } });
  flow.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { const n = getSelection().anchorNode; const p = n && P.paraOf(n); if (p && p.dataset.fnid) { e.preventDefault(); P.gotoFootnote(); } } });

  /* ================= headings, outline, TOC ================= */
  P.headings = () => [...flow.children].filter((el) => /^H[1-4]$/.test(el.tagName) || el.getAttribute('data-st') === 'Title').map((el) => ({ el, level: el.tagName[1] ? +el.tagName[1] : 0, text: el.textContent.replace(/​/g, '').trim() })).filter((h) => h.text);
  const hid = (h, used) => { if (h.el.id && !used.has(h.el.id)) { used.add(h.el.id); return h.el.id; } let b = 'h-' + P.slug(h.text), id = b, k = 1; while (used.has(id)) id = b + '-' + ++k; h.el.id = id; used.add(id); return id; };
  P.tocBlocks = () => [...flow.children].filter((el) => el.hasAttribute('data-toc'));
  const tocSig = (hs) => hs.map((h) => h.level + ':' + h.text).join('|');
  const tocEntries = () => P.headings().filter((h) => h.level >= 1 && h.level <= 3);
  P.buildTOC = () => {
    const hs = tocEntries(); const used = new Set(); const frag = []; const title = mk('p'); title.dataset.st = 'TOC Heading'; title.dataset.toc = '0'; title.setAttribute('contenteditable', 'false'); title.textContent = 'Contents'; frag.push(title);
    if (!hs.length) { const e = mk('p'); e.dataset.st = 'TOC 1'; e.dataset.toc = '1'; e.setAttribute('contenteditable', 'false'); e.style.color = '#8e8e93'; e.textContent = 'No headings yet — apply Heading 1–3 styles, then update the table.'; frag.push(e); }
    for (const h of hs) { const id = hid(h, used); const p = mk('p'); p.dataset.st = 'TOC ' + h.level; p.dataset.toc = String(h.level); p.setAttribute('contenteditable', 'false'); const a = mk('a'); a.setAttribute('href', '#' + id); a.textContent = h.text; p.append(a, mk('span', 'tocl'), Object.assign(mk('span', 'tocpn'), { textContent: '0' })); frag.push(p); }
    return frag;
  };
  P.insertTOC = () => {
    P.focus(); P.checkpoint(false); const old = P.tocBlocks(); let ref = null; const r = P.range();
    if (old.length) { ref = old[0].previousSibling; old.forEach((b) => b.remove()); }
    const frag = P.buildTOC(); const anchorBlock = ref || (r ? P.blockOf(r.startContainer) : null);
    if (ref) ref.after(...frag); else if (old.length && !ref) flow.prepend(...frag); else if (anchorBlock) { const empty = !anchorBlock.textContent.trim() && anchorBlock.tagName === 'P'; if (empty) { anchorBlock.before(...frag); } else anchorBlock.after(...frag); } else flow.append(...frag);
    P.changed(); P.paginate({}); P.refreshTOC(true); P.markDirty();
  };
  P.refreshTOC = (force) => {
    const blocks = P.tocBlocks(); if (!blocks.length) return false; const hs = tocEntries(); const cur = blocks.filter((b) => b.dataset.toc !== '0').map((b) => b.dataset.toc + ':' + b.firstChild?.textContent).join('|'); let changed = false;
    if (force !== 'nobuild' && (cur !== tocSig(hs) && !(hs.length === 0 && blocks.length === 2))) {
      const first = blocks[0]; const prev = first.previousSibling; const frag = P.buildTOC(); blocks.forEach((b) => b.remove()); prev ? prev.after(...frag) : flow.prepend(...frag); changed = true; P.paginate({});
    }
    const fresh = P.tocBlocks(); const byId = new Map(P.headings().map((h) => [h.el.id, h.el]));
    for (const b of fresh) { const a = b.querySelector('a[href^="#"]'); const pn = b.querySelector('.tocpn'); if (!a || !pn) continue; const el = byId.get(a.getAttribute('href').slice(1)); const v = el ? String(P.S.pageStart + P.pageOfEl(el)) : '?'; if (pn.textContent !== v) { pn.textContent = v; } }
    return changed;
  };
  flow.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return; e.preventDefault();
    if (a.closest('[data-toc]') || e.metaKey || e.ctrlKey) P.openLink(a);
  });

  /* ================= bookmarks / cross references ================= */
  P.bookmarks = () => [...flow.querySelectorAll('.bm[data-bm]')].map((b) => ({ el: b, name: b.dataset.bm }));
  P.insertBookmark = async () => {
    const name = await zk.prompt('Bookmark', '', { message: 'Name this location so it can be linked to.', placeholder: 'e.g. results', ok: 'Add' }); if (!name || !name.trim()) return;
    const slug = P.slug(name); P.checkpoint(false); const old = flow.querySelector(`#bm-${CSS.escape(slug)}`); old && old.remove();
    const b = mk('span', 'bm'); b.dataset.bm = name.trim(); b.id = 'bm-' + slug; b.setAttribute('contenteditable', 'false'); const r = P.range(); if (!r) return; r.collapse(true); r.insertNode(b); P.changed(); P.markDirty(); zk.toast('Bookmark “' + name.trim() + '” added');
  };
  P.insertCrossRef = async () => {
    const targets = [...P.headings().map((h) => ({ label: h.text, id: hid(h, new Set([...flow.querySelectorAll('[id]')].filter((x) => x !== h.el).map((x) => x.id))), kind: 'Heading' })), ...P.bookmarks().map((b) => ({ label: b.name, id: b.el.id, kind: 'Bookmark' }))];
    if (!targets.length) { zk.alert('Nothing to refer to', 'Add a heading or a bookmark first.'); return; }
    const sel = zk.el('select.zk-select', { style: { width: '100%' } }, ...targets.map((t, i) => zk.el('option', { value: i }, `${t.kind}: ${t.label}`)));
    const r = await zk.sheet({ title: 'Cross-reference', message: 'Insert a link to a heading or bookmark.', body: sel, buttons: [{ label: 'Cancel', value: null }, { label: 'Insert', primary: true, value: 'ok' }] }); if (r !== 'ok') return;
    const t = targets[+sel.value]; P.setLinkText('#' + t.id, t.label);
  };
  P.setLinkText = (href, text) => { P.focus(); P.checkpoint(false); const a = mk('a'); a.setAttribute('href', href); a.textContent = text; const r = P.range(); if (!r) return; r.deleteContents(); r.insertNode(a); P.placeCaretIn(a, true); P.changed(); P.markDirty(); };

  /* ================= stats ================= */
  P.stats = () => {
    let words = 0, chars = 0, nospace = 0, paras = 0;
    for (const el of flow.children) { if (el.classList.contains('pgbreak') || el.tagName === 'HR') continue; const t = el.textContent.replace(/​/g, ''); if (el.tagName !== 'TABLE') paras++; else paras += el.rows.length; words += P.words(t.replace(/\t/g, ' ')); chars += t.length; nospace += t.replace(/\s/g, '').length; }
    return { words, chars, nospace, paras, pages: P.layout.pages };
  };
  P.docTitle = () => (P.doc && P.doc.file ? P.doc.file.name.replace(/\.[^.]+$/, '') : (P.doc && P.doc.untitled) || 'Untitled');
})();
