/* ZengNotes editor: a contenteditable engine with its own undo history, markdown shortcuts, slash menu,
   checklists, tables, code blocks, attachments and sketch blocks. */
(() => {
  const U = N.u, CV = N.cv; const Ed = (N.ed = {});
  let root, hooks = {}, readOnly = false;
  const isMac = () => zeng.platform === 'mac';
  const sel = () => getSelection();
  const selRange = () => { const s = sel(); return s && s.rangeCount ? s.getRangeAt(0) : null; };
  const inRoot = (n) => !!n && root.contains(n);
  const elOf = (n) => (n && n.nodeType === 3 ? n.parentNode : n);
  const closest = (n, s) => { const e = elOf(n); return e && e.closest ? e.closest(s) : null; };
  const BLOCK_RE = /^(P|DIV|H1|H2|H3|LI|PRE|TD|TH|BLOCKQUOTE)$/;
  const blockOf = (n) => { let e = elOf(n); while (e && e !== root) { if (BLOCK_RE.test(e.tagName) && !(e.tagName === 'BLOCKQUOTE')) return e; e = e.parentNode; } return null; };
  const topOf = (n) => { let e = n; while (e && e.parentNode !== root) e = e.parentNode; return e && e.parentNode === root ? e : null; };
  const isAtomic = (e) => e && e.nodeType === 1 && (e.classList.contains('att') || e.classList.contains('sketch'));
  const caretTo = (node, atEnd = false) => { const r = document.createRange(); r.selectNodeContents(node); r.collapse(!atEnd); const s = sel(); s.removeAllRanges(); s.addRange(r); };
  const caretAt = (node, off) => { const r = document.createRange(); r.setStart(node, off); r.collapse(true); const s = sel(); s.removeAllRanges(); s.addRange(r); };

  // ------------------------------------------------------------ selection <-> paths (for history)
  const pathOf = (node, off) => { const p = []; let n = node; while (n && n !== root) { const par = n.parentNode; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.childNodes, n)); n = par; } return { p, off }; };
  const nodeAt = (o) => { let n = root; for (const i of o.p) { if (!n.childNodes[i]) break; n = n.childNodes[i]; } const max = n.nodeType === 3 ? n.length : n.childNodes.length; return [n, Math.min(o.off, max)]; };
  const saveSel = () => { const s = sel(); if (!s || !s.rangeCount || !inRoot(s.anchorNode) || !inRoot(s.focusNode)) return null; const a = pathOf(s.anchorNode, s.anchorOffset), f = pathOf(s.focusNode, s.focusOffset); return a && f ? { a, f } : null; };
  const restoreSel = (o) => { if (!o) return; try { const [an, ao] = nodeAt(o.a), [fn, fo] = nodeAt(o.f); sel().setBaseAndExtent(an, ao, fn, fo); } catch {} };

  // ------------------------------------------------------------ serialisation
  Ed.html = () => {
    const c = root.cloneNode(true);
    c.querySelectorAll('.sketch, .att').forEach((e) => { e.textContent = ''; e.removeAttribute('contenteditable'); e.removeAttribute('tabindex'); e.removeAttribute('style'); e.classList.remove('selected', 'active'); if (!e.className.trim()) e.removeAttribute('class'); });
    return c.innerHTML;
  };
  Ed.canon = () => CV.clean(Ed.html(), { raw: true });

  // ------------------------------------------------------------ history
  let stack = [], hi = -1, histTimer = 0, applying = false, lastHtml = '';
  const resetHistory = () => { clearTimeout(histTimer); lastHtml = Ed.html(); stack = [{ html: lastHtml, sel: null }]; hi = 0; };
  const commit = (force) => {
    clearTimeout(histTimer); histTimer = 0; if (applying) return false;
    const h = Ed.html(); if (!force && h === lastHtml) return false;
    stack.length = hi + 1; stack[hi].sel = stack[hi].sel || null; stack.push({ html: h, sel: saveSel() }); hi++; lastHtml = h;
    let total = 0; for (let i = stack.length - 1; i >= 0; i--) { total += stack[i].html.length; if (total > 40e6 || stack.length - i > 400) { stack.splice(0, i + 1); hi = stack.length - 1; break; } }
    return true;
  };
  const restore = (st) => { applying = true; root.innerHTML = st.html; hydrate(root); fix(); lastHtml = Ed.html(); applying = false; restoreSel(st.sel); if (!st.sel) { /* keep focus */ } hooks.onChange && hooks.onChange(); hooks.onSelection && hooks.onSelection(); };
  Ed.undo = () => { if (readOnly) return; commit(); if (hi <= 0) return; const cur = stack[hi]; hi--; restore({ html: stack[hi].html, sel: cur.sel || stack[hi].sel }); };
  Ed.redo = () => { if (readOnly) return; commit(); if (hi >= stack.length - 1) return; hi++; restore(stack[hi]); };
  Ed.canUndo = () => hi > 0 || lastHtml !== Ed.html(); Ed.canRedo = () => hi < stack.length - 1;
  const changed = (immediate) => { if (applying) return; hooks.onChange && hooks.onChange(); if (immediate) commit(); else { clearTimeout(histTimer); histTimer = setTimeout(() => commit(), 450); } };
  Ed.changed = changed; Ed.commit = commit;

  // ------------------------------------------------------------ hydration of atomic blocks
  function hydrate(scope) {
    scope.querySelectorAll('.att').forEach((el) => {
      el.setAttribute('contenteditable', 'false'); if (el.firstChild && el.dataset.hyd === '1') return; el.textContent = ''; el.dataset.hyd = '1';
      const id = el.dataset.att;
      if (el.classList.contains('img')) {
        const im = document.createElement('img'); im.alt = el.dataset.name || ''; im.draggable = false; el.append(im); el.classList.add('loading');
        Promise.resolve(hooks.attUrl && hooks.attUrl(id)).then((u) => { if (u) { im.src = u; im.onload = () => el.classList.remove('loading'); im.onerror = () => { el.classList.remove('loading'); el.classList.add('missing'); }; } else { el.classList.remove('loading'); el.classList.add('missing'); } });
      } else {
        el.append(zk.icon(/pdf$/i.test(el.dataset.name || '') ? 'file-text' : 'paperclip'), zk.el('span.an', el.dataset.name || 'Attachment'), zk.el('span.as', el.dataset.size ? U.size(+el.dataset.size) : ''));
      }
      el.removeAttribute('data-hyd'); el.dataset.hyd = '1';
    });
    scope.querySelectorAll('.sketch').forEach((el) => { if (el.querySelector('canvas')) return; N.sketch.mount(el, { commit: () => { changed(true); } }); });
  }
  Ed.hydrate = () => hydrate(root);

  // ------------------------------------------------------------ structure fixing
  function fix() {
    if (!root.firstChild) root.innerHTML = '<p><br></p>';
    // wrap stray inline nodes at root level
    let run = null;
    for (const c of [...root.childNodes]) {
      const stray = c.nodeType === 3 ? c.nodeValue !== '' : (c.nodeType === 1 && !/^(P|DIV|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|TABLE|HR)$/.test(c.tagName));
      if (stray) { if (!run) { run = document.createElement('p'); root.insertBefore(run, c); } run.append(c); } else run = null;
    }
    for (const c of [...root.childNodes]) if (c.nodeType === 3 && c.nodeValue === '') c.remove();
    const SOLID = /^(TABLE|HR|PRE|UL|OL|BLOCKQUOTE)$/;
    const solid = (e) => e && e.nodeType === 1 && (isAtomic(e) || SOLID.test(e.tagName));
    if (solid(root.lastElementChild)) root.append(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    if (solid(root.firstElementChild) && !root.firstElementChild.matches('ul,ol')) root.prepend(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    root.querySelectorAll('ul ul, ol ul').forEach((u) => { const par = u.parentElement.closest('ul'); if (par && !u.className && par.className) u.className = par.className; });
    root.querySelectorAll('table').forEach((t) => { if (!t.querySelector('tbody')) { const b = document.createElement('tbody'); b.append(...t.querySelectorAll('tr')); t.append(b); } });
  }
  // strip junk the browser leaves behind (style spans, font tags) while keeping the caret
  function scrub() {
    const junk = root.querySelectorAll('span[style], font, [style]:not(.sketch):not(.att):not(.sketch *):not(.att *), div:not([class]):empty');
    if (!junk.length) return; const s = saveSel();
    junk.forEach((e) => { if (e.matches('span, font')) e.replaceWith(...e.childNodes); else if (e.tagName === 'DIV' && !e.firstChild) e.remove(); else e.removeAttribute('style'); });
    root.normalize(); restoreSel(s);
  }

  // ------------------------------------------------------------ helpers: text before caret, block ops
  const textBefore = (blk, r) => { const x = document.createRange(); x.selectNodeContents(blk); x.setEnd(r.startContainer, r.startOffset); return x.toString(); };
  const deleteBefore = (blk, r) => { const x = document.createRange(); x.selectNodeContents(blk); x.setEnd(r.startContainer, r.startOffset); x.deleteContents(); };
  const isEmptyBlock = (b) => !b.textContent.replace(/​/g, '') && !b.querySelector('img,table,.att,.sketch');
  const exec = (c, v) => document.execCommand(c, false, v);
  const mk = (tag, html, attrs) => { const e = document.createElement(tag); if (html != null) e.innerHTML = html; for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };

  // run fn with remembered selection endpoints mapped through replaced nodes: fn returns Map(old -> new)
  function withSel(fn) {
    const s = sel(); const a = [s.anchorNode, s.anchorOffset], f = [s.focusNode, s.focusOffset]; const map = fn() || new Map();
    const fixp = (p) => { let [n, o] = p; if (map.has(n)) n = map.get(n); if (!n || !n.isConnected) return null; const max = n.nodeType === 3 ? n.length : n.childNodes.length; return [n, Math.min(o, max)]; };
    const A = fixp(a), F = fixp(f); if (A && F) try { s.setBaseAndExtent(A[0], A[1], F[0], F[1]); } catch {}
  }
  function selectedTopBlocks() {
    const r = selRange(); if (!r) return []; const s = topOf(r.startContainer) || (r.startContainer === root ? root.childNodes[r.startOffset] : null), e = topOf(r.endContainer) || (r.endContainer === root ? root.childNodes[Math.max(0, r.endOffset - 1)] : null);
    if (!s) return []; const out = []; let n = s; while (n) { out.push(n); if (n === e) break; n = n.nextElementSibling; } return out;
  }
  function setBlock(tag) {
    commit(); const blocks = selectedTopBlocks(); if (!blocks.length) return;
    withSel(() => {
      const map = new Map();
      if (tag === 'quote') {
        const allQ = blocks.every((b) => b.tagName === 'BLOCKQUOTE');
        if (allQ) { for (const b of blocks) { const kids = [...b.children]; b.replaceWith(...kids); map.set(b, kids[0]); } }
        else { const bq = mk('blockquote'); blocks[0].before(bq); for (const b of blocks) { if (isAtomic(b) || /^(UL|OL|TABLE)$/.test(b.tagName)) { bq.append(b); continue; } bq.append(b.tagName === 'DIV' ? Object.assign(b.ownerDocument.createElement('p'), { innerHTML: b.innerHTML }) : b); } }
        return map;
      }
      for (let b of blocks) {
        if (isAtomic(b) || /^(UL|OL|TABLE|HR)$/.test(b.tagName)) continue;
        let kids = [b]; if (b.tagName === 'BLOCKQUOTE') { kids = [...b.children]; b.replaceWith(...kids); map.set(b, kids[0]); }
        for (const k of kids) {
          if (isAtomic(k)) continue; let want = tag === 'codeblock' ? 'pre' : tag; const same = k.tagName.toLowerCase() === want;
          if (same && want !== 'p') want = 'p'; if (k.tagName.toLowerCase() === want) continue;
          let n;
          if (want === 'pre') { n = mk('pre', null); n.className = 'code'; n.textContent = CV.textOf(k).replace(/\n$/, ''); }
          else if (k.tagName === 'PRE') { const lines = k.textContent.split('\n'); const ps = lines.map((l) => mk(want, l ? U.esc(l) : '<br>')); k.replaceWith(...ps); map.set(k, ps[0]); continue; }
          else { n = mk(want, k.innerHTML); }
          k.replaceWith(n); map.set(k, n); [...k.childNodes].forEach((c) => map.set(c, c)); if (want === 'pre') { map.set(k, n); }
        }
      }
      return map;
    });
    fix(); changed(true); hooks.onSelection && hooks.onSelection();
  }

  // ------------------------------------------------------------ lists
  const listKind = (ul) => (ul.tagName === 'OL' ? 'ol' : ul.classList.contains('check') ? 'check' : ul.classList.contains('dash') ? 'dash' : 'ul');
  const listAt = () => { const r = selRange(); if (!r) return null; const li = closest(r.startContainer, 'li'); return li && inRoot(li) ? li.parentElement : null; };
  function toggleList(kind) {
    commit(); const cur = listAt();
    if (cur && listKind(cur) === kind) { exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); }
    else if (cur && ((cur.tagName === 'UL') === (kind !== 'ol'))) { cur.className = kind === 'check' || kind === 'dash' ? kind : ''; if (kind !== 'check') cur.querySelectorAll(':scope > li[data-done]').forEach((l) => l.removeAttribute('data-done')); }
    else if (cur) { exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); const n = listAt(); if (n) n.className = kind === 'check' || kind === 'dash' ? kind : ''; }
    else {
      exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); const r = selRange();
      if (r) { const lists = new Set(); const li = closest(r.startContainer, 'li'); if (li) lists.add(li.parentElement); const le = closest(r.endContainer, 'li'); if (le) lists.add(le.parentElement); root.querySelectorAll(':scope > ul, :scope > ol').forEach((l) => { if (r.intersectsNode(l)) lists.add(l); });
        lists.forEach((l) => { if (l.parentElement === root || l.parentElement.closest('li') === null) l.className = kind === 'check' || kind === 'dash' ? kind : ''; }); }
    }
    root.querySelectorAll('ul:not(.check) > li[data-done]').forEach((l) => l.removeAttribute('data-done'));
    fix(); changed(true); hooks.onSelection && hooks.onSelection();
  }
  Ed.toggleCheckAtCaret = () => { const r = selRange(); const li = r && closest(r.startContainer, 'li'); if (li && li.parentElement.classList.contains('check')) toggleCheck(li); };
  function toggleCheck(li) {
    commit(); const done = !li.hasAttribute('data-done'); if (done) li.setAttribute('data-done', '1'); else li.removeAttribute('data-done');
    if (hooks.autoSort && hooks.autoSort()) {
      const ul = li.parentElement;
      if (done) { let last = null; for (const s of ul.children) if (s !== li && !s.hasAttribute('data-done')) last = s; if (last) last.after(li); else ul.prepend(li); /* keep after undone */ const dones = [...ul.children].filter((s) => s.hasAttribute('data-done') && s !== li); if (!last && dones.length) { /* all done -> stay */ } }
      else { const firstDone = [...ul.children].find((s) => s !== li && s.hasAttribute('data-done')); if (firstDone) firstDone.before(li); }
    }
    changed(true);
  }

  // ------------------------------------------------------------ tables, atomic inserts
  function insertBlock(html, { caret = 'after' } = {}) {
    commit(); const r = selRange(); let top = r && inRoot(r.startContainer) ? topOf(r.startContainer) : null;
    const tpl = document.createElement('template'); tpl.innerHTML = html; const node = tpl.content.firstElementChild;
    if (top && top.tagName === 'P' && isEmptyBlock(top)) top.replaceWith(node); else if (top) top.after(node); else root.append(node);
    hydrate(node); fix();
    if (caret === 'first-cell') { const c = node.querySelector('td,th'); if (c) caretTo(c); } else { const nx = node.nextElementSibling; if (nx) caretTo(nx); }
    changed(true); hooks.onSelection && hooks.onSelection(); return node;
  }
  Ed.insertTable = (rows = 3, cols = 3) => { const row = (t) => `<tr>${Array(cols).fill(`<${t}><br></${t}>`).join('')}</tr>`; insertBlock(`<table><tbody>${row('th')}${Array(rows - 1).fill(row('td')).join('')}</tbody></table>`, { caret: 'first-cell' }); };
  Ed.insertHr = () => insertBlock('<hr>');
  Ed.insertSketch = () => { const n = insertBlock(N.sketch.newHtml()); n.scrollIntoView({ block: 'nearest' }); };
  Ed.insertCodeBlock = () => setBlock('codeblock');
  const cellAt = () => { const r = selRange(); const c = r && closest(r.startContainer, 'td,th'); return c && inRoot(c) ? c : null; };
  Ed.inTable = () => !!cellAt();
  Ed.tableOp = (op) => {
    const cell = cellAt(); if (!cell) return; commit(); const tr = cell.parentElement, table = cell.closest('table'); const idx = [...tr.children].indexOf(cell); const rows = [...table.querySelectorAll('tr')];
    const newCell = (t) => mk(t, '<br>');
    if (op === 'rowAbove' || op === 'rowBelow') { const nr = mk('tr'); [...tr.children].forEach((c) => nr.append(newCell(op === 'rowAbove' && tr === rows[0] ? 'td' : c.tagName.toLowerCase() === 'th' && tr !== rows[0] ? 'td' : c.tagName.toLowerCase()))); if (op === 'rowAbove') tr.before(nr); else tr.after(nr); caretTo(nr.children[idx] || nr.firstChild); }
    else if (op === 'colLeft' || op === 'colRight') { rows.forEach((r) => { const ref = r.children[idx]; const nc = newCell(ref ? ref.tagName.toLowerCase() : 'td'); if (op === 'colLeft') r.insertBefore(nc, ref || null); else r.insertBefore(nc, ref ? ref.nextSibling : null); }); }
    else if (op === 'delRow') { if (rows.length < 2) return Ed.tableOp('delTable'); const nx = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); caretTo(nx.children[Math.min(idx, nx.children.length - 1)]); }
    else if (op === 'delCol') { if (tr.children.length < 2) return Ed.tableOp('delTable'); rows.forEach((r) => r.children[idx] && r.children[idx].remove()); caretTo(tr.children[Math.min(idx, tr.children.length - 1)]); }
    else if (op === 'delTable') { const nx = table.nextElementSibling || table.previousElementSibling; table.remove(); fix(); if (nx) caretTo(nx); }
    else if (op === 'header') { const first = rows[0]; const isH = first.firstElementChild.tagName === 'TH'; [...first.children].forEach((c) => { const n = mk(isH ? 'td' : 'th', c.innerHTML); c.replaceWith(n); }); }
    fix(); changed(true);
  };
  function tabInTable(back) {
    const c = cellAt(); if (!c) return false; const cells = [...c.closest('table').querySelectorAll('td,th')]; const i = cells.indexOf(c);
    if (back) { if (i > 0) caretTo(cells[i - 1]); return true; }
    if (i < cells.length - 1) caretTo(cells[i + 1]); else { Ed.tableOp('rowBelow'); }
    return true;
  }

  // ------------------------------------------------------------ links
  const URL_RE = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"])$/i;
  function autolink() {
    const r = selRange(); if (!r || !r.collapsed) return; const n = r.startContainer; if (n.nodeType !== 3 || closest(n, 'a, pre, code')) return;
    const m = URL_RE.exec(n.nodeValue.slice(0, r.startOffset)); if (!m) return;
    const start = r.startOffset - m[2].length; const x = document.createRange(); x.setStart(n, start); x.setEnd(n, r.startOffset);
    const a = mk('a'); a.href = /^www\./i.test(m[2]) ? 'https://' + m[2] : m[2]; x.surroundContents(a); const after = document.createRange(); after.setStartAfter(a); after.collapse(true); sel().removeAllRanges(); sel().addRange(after);
  }
  Ed.linkAtCaret = () => { const r = selRange(); const a = r && closest(r.startContainer, 'a'); return a && inRoot(a) ? a : null; };
  Ed.setLink = (url) => {
    commit(); const a = Ed.linkAtCaret();
    if (!url) { if (a) { const r = document.createRange(); r.selectNodeContents(a); sel().removeAllRanges(); sel().addRange(r); } exec('unlink'); }
    else if (a && !a.dataset.nt) { a.href = url; } else { const s = sel(); if (s.isCollapsed) { exec('insertHTML', `<a href="${U.esc(url)}">${U.esc(url)}</a>`); } else exec('createLink', url); }
    changed(true);
  };
  function linkNodeInsert(range, title, id) {
    const a = mk('a', U.esc(title), { href: '#', 'data-nt': title }); if (id) a.dataset.note = id;
    range.deleteContents(); range.insertNode(a); const sp = document.createTextNode(' '); a.after(sp); caretAt(sp, 1); changed(true);
  }

  // ------------------------------------------------------------ attachments
  Ed.attachFiles = async (files) => {
    if (readOnly) return; const list = [...files]; let n = 0;
    for (const f of list) {
      try {
        let bytes = f.bytes || new Uint8Array(await f.arrayBuffer()); let type = f.type || U.mimeOf(f.name || ''); let name = f.name || 'Pasted ' + (U.isImage(type) ? 'image' : 'file') + '.' + U.extOfMime(type);
        if (bytes.length > 200 * 1048576) { zk.alert('File too large', `“${name}” is ${U.size(bytes.length)}. Attachments are limited to 200 MB.`); continue; }
        if (U.isImage(type)) { const s = await U.shrinkImage(bytes, type); bytes = s.bytes; if (s.type !== type) { type = s.type; name = U.base(name) + '.' + U.extOfMime(type); } }
        const att = await hooks.putFile({ name, type, bytes }); if (!att) continue;
        insertBlock(CV.attHtml(att)); n++;
      } catch (e) { console.error(e); zk.alert('Couldn’t attach file', (f.name || '') + ': ' + (e.message || e)); }
    }
    return n;
  };
  Ed.removeAtt = (el) => { commit(); const nx = el.nextElementSibling || el.previousElementSibling; el.remove(); fix(); if (nx) caretTo(nx); changed(true); };
  Ed.attIds = () => [...root.querySelectorAll('.att[data-att]')].map((e) => e.dataset.att);

  // ------------------------------------------------------------ suggestions (slash menu, [[ link picker)
  let sg = null;
  const SLASH = [
    ['Heading', 'heading-1', () => setBlock('h1'), 'heading title h1'], ['Subheading', 'heading-2', () => setBlock('h2'), 'subheading h2'], ['Small heading', 'heading-3', () => setBlock('h3'), 'h3'], ['Body text', 'pilcrow', () => setBlock('p'), 'paragraph body text'],
    ['Checklist', 'list-checks', () => toggleList('check'), 'todo task checklist checkbox'], ['Bulleted list', 'list', () => toggleList('ul'), 'bullets unordered'], ['Dashed list', 'minus', () => toggleList('dash'), 'dash'], ['Numbered list', 'list-ordered', () => toggleList('ol'), 'ordered numbers'],
    ['Quote', 'quote', () => setBlock('quote'), 'blockquote'], ['Code block', 'code-xml', () => setBlock('codeblock'), 'code monospace'], ['Table', 'table', () => Ed.insertTable(), 'grid'], ['Divider', 'minus', () => Ed.insertHr(), 'hr rule line separator'],
    ['Sketch', 'pen-line', () => Ed.insertSketch(), 'draw drawing pen canvas'], ['Image or file…', 'paperclip', () => hooks.pickFiles && hooks.pickFiles(), 'attach attachment image photo file upload'], ['Link to note…', 'link', () => { const r = selRange(); if (r) { exec('insertText', '[['); setTimeout(checkSuggest, 0); } }, 'wiki backlink note link'],
  ];
  function closeSg() { if (sg) { sg.el.remove(); sg = null; } }
  function renderSg() {
    sg.el.textContent = ''; if (!sg.items.length) { sg.el.append(zk.el('.zk-mi.disabled', 'No matches')); return; }
    sg.items.forEach((it, i) => { const row = zk.el('.zk-mi' + (i === sg.idx ? '.hl' : ''), { onmousedown: (e) => { e.preventDefault(); sg.idx = i; acceptSg(); }, onmouseenter: () => { sg.idx = i; [...sg.el.children].forEach((c, j) => c.classList.toggle('hl', j === i)); } }, zk.icon(it.icon || 'file-text'), zk.el('span', it.label)); row.style.paddingLeft = '8px'; sg.el.append(row); });
    const h = sg.el.querySelector('.hl'); h && h.scrollIntoView({ block: 'nearest' });
  }
  function placeSg(range) {
    let rc = range.getClientRects()[0]; if (!rc || (!rc.width && !rc.height && !rc.top)) { const b = elOf(range.startContainer).getBoundingClientRect(); rc = { left: b.left, bottom: b.bottom, top: b.top }; }
    const w = sg.el.offsetWidth, h = sg.el.offsetHeight; let left = Math.min(rc.left, innerWidth - w - 8), top = rc.bottom + 4; if (top + h > innerHeight - 8) top = Math.max(8, rc.top - h - 4);
    sg.el.style.left = Math.max(8, left) + 'px'; sg.el.style.top = top + 'px';
  }
  function openSg(kind, q, node, start) {
    const items = kind === 'slash' ? SLASH.filter((s) => !q || (s[0] + ' ' + s[3]).toLowerCase().includes(q.toLowerCase())).map((s) => ({ label: s[0], icon: s[1], run: s[2] })) : linkItems(q);
    if (!sg) { sg = { el: zk.el('.zk-pop.sg', { style: { minWidth: '210px', maxWidth: '320px', maxHeight: '260px' } }) }; document.body.append(sg.el); }
    Object.assign(sg, { kind, q, node, start, items, idx: Math.min(sg.idx || 0, Math.max(0, items.length - 1)) }); if (!sg.items.length && kind === 'slash') { closeSg(); return; }
    renderSg(); const r = selRange(); r && placeSg(r);
  }
  function linkItems(q) {
    const res = (hooks.searchTitles ? hooks.searchTitles(q) : []).map((n) => ({ label: n.title || 'New Note', icon: 'file-text', title: n.title, id: n.id }));
    if (q.trim() && !res.some((r) => (r.title || '').toLowerCase() === q.trim().toLowerCase())) res.push({ label: 'Create “' + q.trim() + '”', icon: 'plus', title: q.trim(), id: null });
    return res;
  }
  function acceptSg() {
    if (!sg) return; const it = sg.items[sg.idx]; const { node, start, kind } = sg; closeSg(); if (!it || !node.isConnected) return;
    const r = selRange(); const x = document.createRange(); x.setStart(node, start); x.setEnd(r.startContainer, r.startOffset);
    if (kind === 'slash') { x.deleteContents(); caretAt(node, Math.min(start, node.length)); commit(); it.run(); }
    else { x.setStart(node, start - 2); linkNodeInsert(x, it.title, it.id); }
  }
  function checkSuggest() {
    if (readOnly) return closeSg(); const r = selRange(); if (!r || !r.collapsed || !inRoot(r.startContainer)) return closeSg(); const n = r.startContainer;
    if (n.nodeType !== 3 || closest(n, 'pre, a')) return closeSg(); const before = n.nodeValue.slice(0, r.startOffset); let m;
    if ((m = /(?:^|\s)\/([A-Za-z -]{0,14})$/.exec(before))) { const blk = blockOf(n); if (blk && !/^\/?/.test('')) {} openSg('slash', m[1], n, r.startOffset - m[1].length - 1); }
    else if ((m = /\[\[([^\[\]\n]{0,60})$/.exec(before))) openSg('link', m[1], n, r.startOffset - m[1].length);
    else closeSg();
  }

  // ------------------------------------------------------------ markdown shortcuts
  function mdSpace(e) {
    const r = selRange(); if (!r || !r.collapsed || e.isComposing) return false; const n = r.startContainer; if (!inRoot(n) || closest(n, 'pre, code')) return false;
    const blk = blockOf(n); if (!blk) return false; const before = textBefore(blk, r); let m;
    if ((blk.tagName === 'P' || blk.tagName === 'DIV') && blk.parentNode === root) {
      const run = (fn) => { e.preventDefault(); commit(); deleteBefore(blk, r); fn(); };
      if ((m = /^(#{1,3})$/.exec(before))) { run(() => setBlock('h' + m[1].length)); return true; }
      if (before === '-') { run(() => toggleList('dash')); return true; } if (before === '*' || before === '+') { run(() => toggleList('ul')); return true; }
      if ((m = /^\[( |x|X)?\]$/.exec(before))) { run(() => { toggleList('check'); if (m[1] && m[1] !== ' ') Ed.toggleCheckAtCaret(); }); return true; }
      if (/^\d{1,3}[.)]$/.test(before)) { run(() => toggleList('ol')); return true; }
      if (before === '>') { run(() => setBlock('quote')); return true; }
      if ((m = /^```([\w+#-]*)$/.exec(before))) { run(() => { setBlock('codeblock'); const p = closest(selRange().startContainer, 'pre'); if (p && m[1]) p.dataset.lang = m[1]; }); return true; }
    }
    if (n.nodeType !== 3) return false; const t = n.nodeValue.slice(0, r.startOffset); let hit = null;
    const pats = [[/(\*\*|__)(?=\S)([^\n]*?\S)\1$/, 'b', 2, 1], [/~~(?=\S)([^\n]*?\S)~~$/, 's', 1, 0], [/(^|[^`])`([^`\n]+)`$/, 'code', 2, 1], [/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*$/, 'i', 2, 1], [/(^|[^\w_])_(?=[^\s_])([^_\n]*?[^\s_])_$/, 'i', 2, 1]];
    for (const [re, tag, gi, gp] of pats) { const mm = re.exec(t); if (mm) { const inner = mm[gi]; const len = t.length - mm.index - (tag === 'b' ? 0 : (re.source.startsWith('(^') ? mm[1].length : 0)); hit = { tag, inner, start: tag === 'b' || tag === 's' ? mm.index : mm.index + (mm[1] || '').length }; if (tag === 'b' || tag === 's') hit.start = mm.index; break; } }
    if (!hit) return false;
    e.preventDefault(); commit(); const x = document.createRange(); x.setStart(n, hit.start); x.setEnd(n, r.startOffset); x.deleteContents();
    const el = mk(hit.tag); el.textContent = hit.inner; x.insertNode(el); const sp = document.createTextNode(' '); el.after(sp); caretAt(sp, 1); changed(true); return true;
  }
  function onEnterRules(e) {
    const r = selRange(); if (!r) return false; const n = r.startContainer; if (!inRoot(n)) return false;
    const pre = closest(n, 'pre');
    if (pre && inRoot(pre)) {
      e.preventDefault(); const x = document.createRange(); x.selectNodeContents(pre); x.setStart(r.startContainer, r.startOffset); const atEnd = !x.toString().length; const txt = pre.textContent;
      if (r.collapsed && atEnd && /\n$/.test(txt)) { pre.textContent = txt.replace(/\n+$/, ''); const p = mk('p', '<br>'); pre.after(p); caretTo(p); commit(); changed(true); return true; }
      exec('insertText', '\n'); if (atEnd && !/\n$/.test(pre.textContent)) exec('insertText', '\n'); return true;
    }
    const blk = blockOf(n);
    if (blk && (blk.tagName === 'P' || blk.tagName === 'DIV') && blk.parentNode === root && r.collapsed) {
      const t = textBefore(blk, r).trim(); let m;
      if ((m = /^```([\w+#-]*)$/.exec(t)) && blk.textContent.trim() === t) { e.preventDefault(); const pre = mk('pre'); pre.className = 'code'; if (m[1]) pre.dataset.lang = m[1]; pre.innerHTML = '<br>'; commit(); blk.replaceWith(pre); caretTo(pre); fix(); changed(true); return true; }
      if (/^(---|\*\*\*|___)$/.test(t) && blk.textContent.trim() === t) { e.preventDefault(); commit(); const hr = mk('hr'); blk.replaceWith(hr); fix(); const nx = hr.nextElementSibling; caretTo(nx); changed(true); return true; }
    }
    const li = closest(n, 'li');
    if (li && inRoot(li) && li.parentElement.classList.contains('check') && !isEmptyBlock(li) && r.collapsed) {
      e.preventDefault(); commit(); const nested = li.querySelector(':scope > ul, :scope > ol'); const x = document.createRange(); x.setStart(r.startContainer, r.startOffset);
      if (nested) x.setEndBefore(nested); else x.selectNodeContents(li) && x.setStart(r.startContainer, r.startOffset);
      if (!nested) { x.setEnd(li, li.childNodes.length); }
      const frag = x.extractContents(); const nl = mk('li'); nl.append(frag); if (!nl.textContent && !nl.querySelector('img')) nl.innerHTML = '<br>'; if (!li.textContent.trim() && !li.querySelector(':scope > ul,:scope > ol')) li.innerHTML = '<br>'; else if (!li.firstChild) li.innerHTML = '<br>';
      li.after(nl); caretTo(nl); changed(true); return true;
    }
    const bq = closest(n, 'blockquote');
    if (bq && inRoot(bq) && blk && isEmptyBlock(blk) && r.collapsed) { e.preventDefault(); commit(); bq.after(blk); if (!bq.children.length) bq.remove(); const p = blk.tagName === 'P' ? blk : mk('p', '<br>'); if (p !== blk) blk.replaceWith(p); caretTo(p); changed(true); return true; }
    return false;
  }

  // ------------------------------------------------------------ events
  function bind() {
    root.addEventListener('beforeinput', (e) => {
      if (readOnly) return; const t = e.inputType;
      if (t === 'historyUndo') { e.preventDefault(); Ed.undo(); return; } if (t === 'historyRedo') { e.preventDefault(); Ed.redo(); return; }
      if (sg && (t === 'insertParagraph' || t === 'insertLineBreak')) { e.preventDefault(); acceptSg(); return; }
      if (t === 'insertText' && e.data === ' ') { autolink(); if (mdSpace(e)) return; }
      else if (t === 'insertText' && e.data === ']') {
        const r = selRange(); if (r && r.collapsed && r.startContainer.nodeType === 3 && !closest(r.startContainer, 'pre')) { const m = /\[\[([^\[\]\n]+)\]$/.exec(r.startContainer.nodeValue.slice(0, r.startOffset)); if (m) { e.preventDefault(); commit(); const x = document.createRange(); x.setStart(r.startContainer, r.startOffset - m[0].length); x.setEnd(r.startContainer, r.startOffset); const title = m[1].trim(); const found = hooks.findTitle && hooks.findTitle(title); linkNodeInsert(x, title, found ? found.id : null); return; } }
      }
      else if (t === 'insertParagraph' || t === 'insertLineBreak') { autolink(); if (t === 'insertParagraph' && onEnterRules(e)) return; if (t === 'insertParagraph') commit(); }
      else if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'deleteByCut' || t === 'insertReplacementText') commit();
      else if (t === 'deleteContentBackward' || t === 'deleteContentForward') {
        const att = root.querySelector('.att.selected'); if (att) { e.preventDefault(); Ed.removeAtt(att); return; }
        const r = selRange(); if (r && r.collapsed && t === 'deleteContentBackward') {
          const blk = blockOf(r.startContainer); const bq = blk && closest(blk, 'blockquote');
          if (blk && textBefore(blk, r) === '' && (blk.tagName === 'PRE' || (bq && blk === bq.firstElementChild && blk.parentNode === bq))) { e.preventDefault(); commit(); if (blk.tagName === 'PRE') { const p = mk('p', U.esc(blk.textContent) || '<br>'); blk.replaceWith(p); caretTo(p); } else { setBlock('quote'); } changed(true); return; }
          if (blk && blk.parentNode === root && textBefore(blk, r) === '' && /^H[1-3]$/.test(blk.tagName)) { e.preventDefault(); setBlock('p'); return; }
          // backspace right after an atomic block deletes it
          const prev = blk && blk.parentNode === root && textBefore(blk, r) === '' ? blk.previousElementSibling : null; if (prev && isAtomic(prev) && !isEmptyBlock(blk)) { e.preventDefault(); Ed.removeAtt(prev); return; }
        }
      }
    });
    root.addEventListener('input', (e) => { if (applying) return; scrub(); fix(); changed(false); checkSuggest(); hooks.onSelection && hooks.onSelection(); scheduleDecor(); });
    root.addEventListener('keydown', (e) => {
      if (readOnly) return; const k = e.key;
      if (sg) { if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); sg.idx = (sg.idx + (k === 'ArrowDown' ? 1 : -1) + sg.items.length) % Math.max(1, sg.items.length); renderSg(); return; } if (k === 'Enter' || k === 'Tab') { e.preventDefault(); e.stopPropagation(); acceptSg(); return; } if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSg(); return; } }
      const att = root.querySelector('.att.selected');
      if (att && (k === 'Backspace' || k === 'Delete')) { e.preventDefault(); Ed.removeAtt(att); return; }
      if (att && !(e.metaKey || e.ctrlKey) && k.length === 1) { att.classList.remove('selected'); }
      if (k === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const r = selRange(); if (!r) return; const li = closest(r.startContainer, 'li'); const pre = closest(r.startContainer, 'pre');
        if (cellAt()) { e.preventDefault(); tabInTable(e.shiftKey); return; }
        if (pre) { e.preventDefault(); if (!e.shiftKey) exec('insertText', '  '); return; }
        if (li && inRoot(li)) { e.preventDefault(); commit(); exec(e.shiftKey ? 'outdent' : 'indent'); fix(); changed(true); return; }
        e.preventDefault(); if (!e.shiftKey) exec('insertText', '    '); return;
      }
      if (k === 'Escape') { att && att.classList.remove('selected'); }
    });
    root.addEventListener('keyup', () => { checkSuggestKey(); hooks.onSelection && hooks.onSelection(); });
    const checkSuggestKey = () => { if (sg) checkSuggest(); };
    root.addEventListener('pointerdown', (e) => {
      closeSg(); root.querySelectorAll('.att.selected').forEach((a) => a.classList.remove('selected'));
      const att = e.target.closest && e.target.closest('.att'); if (att && inRoot(att)) { e.preventDefault(); root.focus({ preventScroll: true }); att.classList.add('selected'); const r = document.createRange(); r.selectNode(att); sel().removeAllRanges(); sel().addRange(r); return; }
      const li = e.target.closest && e.target.closest('li');
      if (li && li.parentElement.classList.contains('check') && inRoot(li) && e.button === 0 && !readOnly) {
        const rc = li.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(li).lineHeight) || 24; const depth = 0;
        if (e.clientX >= rc.left - 4 && e.clientX < rc.left + 26 && e.clientY < rc.top + lh * 1.3 + 2) { e.preventDefault(); toggleCheck(li); return; }
      }
    });
    root.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a'); if (!a || !inRoot(a)) return;
      if (a.dataset.nt !== undefined) { e.preventDefault(); hooks.linkNote && hooks.linkNote(a.dataset.nt, a.dataset.note || null); return; }
      if (e.metaKey || e.ctrlKey || readOnly) { e.preventDefault(); hooks.openUrl && hooks.openUrl(a.getAttribute('href')); }
    });
    root.addEventListener('dblclick', (e) => { const att = e.target.closest && e.target.closest('.att'); if (att) { e.preventDefault(); hooks.openAtt && hooks.openAtt(att); } });
    root.addEventListener('paste', onPaste);
    root.addEventListener('contextmenu', onContext);
    root.addEventListener('focus', () => hooks.onFocus && hooks.onFocus());
    root.addEventListener('blur', () => { closeSg(); hooks.onBlur && hooks.onBlur(); });
    document.addEventListener('selectionchange', () => { if (document.activeElement === root) { hooks.onSelection && hooks.onSelection(); } });
    document.addEventListener('pointerdown', (e) => { if (sg && !sg.el.contains(e.target)) closeSg(); });
    root.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); root.classList.add('drop'); } });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', () => root.classList.remove('drop'));
  }

  async function onPaste(e) {
    if (readOnly) return; e.preventDefault(); const cd = e.clipboardData; if (!cd) return; commit();
    const files = [...cd.files]; if (files.length) { Ed.attachFiles(files); return; }
    const html = cd.getData('text/html'), text = cd.getData('text/plain');
    if (html && !/^\s*<meta[^>]*>\s*$/.test(html)) {
      const ctx = CV.mkCtx(); let canon = CV.clean(html.replace(/<!--(Start|End)Fragment-->/g, ''), { img: ctx.img });
      const ids = [...canon.matchAll(/data-att="([a-z0-9]+)"/gi)].map((m) => m[1]);
      for (const id of new Set(ids)) { if (hooks.hasAtt && hooks.hasAtt(id)) continue; const nid = hooks.cloneAtt ? await hooks.cloneAtt(id) : null; canon = nid ? canon.split(`data-att="${id}"`).join(`data-att="${nid}"`) : canon.replace(new RegExp(`<div class="att[^>]*data-att="${id}"[^>]*></div>`, 'g'), ''); }
      for (const f of ctx.files) await hooks.putFile({ ...f, id: f.id });
      const single = /^<p>((?:(?!<p>)[\s\S])*)<\/p>$/.test(canon) && !/<br>$/.test(canon);
      exec('insertHTML', single ? canon.replace(/^<p>|<\/p>$/g, '') : canon); hydrate(root); fix(); scrub(); changed(true); return;
    }
    if (text) {
      const t = text.replace(/\r\n?/g, '\n');
      if (/^https?:\/\/\S+$/.test(t.trim()) && !t.includes('\n')) { const s = sel(); if (!s.isCollapsed) exec('createLink', t.trim()); else exec('insertHTML', `<a href="${U.esc(t.trim())}">${U.esc(t.trim())}</a>&nbsp;`); changed(true); return; }
      const lines = t.split('\n'); if (lines.length === 1) exec('insertText', t); else exec('insertHTML', lines.map((l) => `<p>${l ? U.esc(l) : '<br>'}</p>`).join('')); fix(); scrub(); changed(true);
    }
  }
  function onContext(e) {
    const t = e.target; const items = [];
    const att = t.closest && t.closest('.att'); const a = t.closest && t.closest('a'); const cell = t.closest && t.closest('td,th');
    if (att) { e.preventDefault(); items.push({ label: 'Open', run: () => hooks.openAtt && hooks.openAtt(att) }, { label: 'Save a Copy…', run: () => hooks.saveAtt && hooks.saveAtt(att) }, { separator: true }, { label: 'Delete', run: () => Ed.removeAtt(att) }); zk.menu(items, { x: e.clientX, y: e.clientY }); return; }
    if (a && inRoot(a)) { const r = document.createRange(); r.selectNodeContents(a); caretTo(a); e.preventDefault(); if (a.dataset.nt !== undefined) items.push({ label: 'Open Note', run: () => hooks.linkNote(a.dataset.nt, a.dataset.note || null) }); else items.push({ label: 'Open Link', run: () => hooks.openUrl(a.getAttribute('href')) }, { label: 'Edit Link…', run: () => hooks.editLink && hooks.editLink() }, { label: 'Copy Link', run: () => navigator.clipboard && navigator.clipboard.writeText(a.getAttribute('href')) }); items.push({ label: 'Remove Link', run: () => { if (a.dataset.nt !== undefined) { commit(); a.replaceWith(...a.childNodes); changed(true); } else Ed.setLink(''); } }); zk.menu(items, { x: e.clientX, y: e.clientY }); return; }
    if (cell && inRoot(cell)) { caretTo(cell, true); e.preventDefault(); const T = (l, op) => ({ label: l, run: () => Ed.tableOp(op) }); items.push(T('Insert Row Above', 'rowAbove'), T('Insert Row Below', 'rowBelow'), T('Insert Column Left', 'colLeft'), T('Insert Column Right', 'colRight'), { separator: true }, T('Toggle Header Row', 'header'), T('Delete Row', 'delRow'), T('Delete Column', 'delCol'), T('Delete Table', 'delTable'), { separator: true }, { label: 'Cut', run: () => exec('cut') }, { label: 'Copy', run: () => exec('copy') }, { label: 'Paste', run: () => exec('paste') }); zk.menu(items, { x: e.clientX, y: e.clientY }); }
  }

  // ------------------------------------------------------------ decorations via CSS Custom Highlight API
  let decorTimer = 0, findState = { q: '', ranges: [], i: -1 }, termHl = [];
  const hasHl = () => !!(window.CSS && CSS.highlights && window.Highlight);
  function textMap() {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.sk-ui, .sketch, .att') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let str = '', nodes = [], prevBlk = null, n; while ((n = w.nextNode())) { const b = blockOf(n); if (prevBlk && b !== prevBlk) str += '\u0000'; prevBlk = b; nodes.push({ node: n, start: str.length }); str += n.nodeValue; }
    return { str, nodes };
  }
  function rangeAt(map, s, e) {
    const find = (pos, end) => { let lo = 0, hi = map.nodes.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map.nodes[mid].start <= pos) lo = mid; else hi = mid - 1; } let it = map.nodes[lo]; if (end && pos === it.start && lo > 0) { it = map.nodes[lo - 1]; return [it.node, it.node.length]; } return [it.node, Math.min(it.node.length, pos - it.start)]; };
    const r = document.createRange(); const a = find(s, false), b = find(e, true); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r;
  }
  function decorate() {
    if (!hasHl()) return; const map = textMap(); const low = map.str.toLowerCase();
    // tags
    const tags = []; const re = /(^|[\s(\u0000])(#[\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu; let m; while ((m = re.exec(map.str))) { if (/^#\d+$/.test(m[2])) continue; const s = m.index + m[1].length; if (map.nodes.length) tags.push(rangeAt(map, s, s + m[2].length)); }
    CSS.highlights.set('zn-tag', new Highlight(...tags));
    // code
    const kinds = { kw: [], str: [], com: [], num: [], fn: [] };
    root.querySelectorAll('pre.code').forEach((pre) => {
      const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT); const ns = []; let s = '', n; while ((n = w.nextNode())) { ns.push({ node: n, start: s.length }); s += n.nodeValue; }
      if (!ns.length) return; const sub = { str: s, nodes: ns };
      for (const t of N.hl.tokens(s, pre.dataset.lang)) kinds[t.c].push(rangeAt(sub, t.s, t.e));
    });
    for (const k in kinds) CSS.highlights.set('tk-' + k, new Highlight(...kinds[k]));
    // search terms / find
    const hl = []; for (const q of termHl) { if (!q) continue; let i = 0; while ((i = low.indexOf(q, i)) >= 0 && hl.length < 500) { hl.push(rangeAt(map, i, i + q.length)); i += q.length; } }
    CSS.highlights.set('zn-term', new Highlight(...hl));
    if (findState.q) { const rs = []; let i = 0; const q = findState.q.toLowerCase(); while ((i = low.indexOf(q, i)) >= 0 && rs.length < 2000) { rs.push(rangeAt(map, i, i + q.length)); i += q.length; } findState.ranges = rs; if (findState.i >= rs.length) findState.i = rs.length - 1; CSS.highlights.set('zn-find', new Highlight(...rs)); if (findState.i >= 0) CSS.highlights.set('zn-find-cur', new Highlight(rs[findState.i])); else CSS.highlights.delete('zn-find-cur'); hooks.onFind && hooks.onFind(rs.length, findState.i); }
    else { CSS.highlights.delete('zn-find'); CSS.highlights.delete('zn-find-cur'); }
  }
  function scheduleDecor() { clearTimeout(decorTimer); decorTimer = setTimeout(decorate, 180); }
  Ed.decorate = decorate; Ed.setTerms = (terms) => { termHl = terms.map((t) => t.toLowerCase()); scheduleDecor(); };
  Ed.find = (q, dir = 0) => {
    findState.q = q; if (!q) { findState = { q: '', ranges: [], i: -1 }; decorate(); hooks.onFind && hooks.onFind(0, -1); return; }
    if (dir === 0) { findState.i = -1; } decorate(); const n = findState.ranges.length; if (!n) { hooks.onFind && hooks.onFind(0, -1); return; }
    if (dir === 0) findState.i = 0; else findState.i = (findState.i + dir + n) % n; decorate();
    const rg = findState.ranges[findState.i]; const el = elOf(rg.startContainer); el && el.scrollIntoView({ block: 'center', behavior: 'auto' });
  };
  Ed.findSelectCurrent = () => { const r = findState.ranges[findState.i]; if (r) { root.focus({ preventScroll: true }); sel().removeAllRanges(); sel().addRange(r); } findState = { q: '', ranges: [], i: -1 }; decorate(); };

  // ------------------------------------------------------------ public API
  Ed.init = (el, h) => { root = el; hooks = h; root.setAttribute('role', 'textbox'); root.setAttribute('aria-multiline', 'true'); root.setAttribute('aria-label', 'Note body'); bind(); try { exec('defaultParagraphSeparator', 'p'); } catch {} };
  Ed.load = (html, { ro = false } = {}) => {
    applying = true; readOnly = ro; root.innerHTML = html || '<p><br></p>'; root.contentEditable = ro ? 'false' : 'true'; hydrate(root); fix(); applying = false; closeSg(); resetHistory();
    findState = { q: '', ranges: [], i: -1 }; decorate(); try { exec('defaultParagraphSeparator', 'p'); } catch {}
  };
  Ed.setReadOnly = (v) => { readOnly = v; root.contentEditable = v ? 'false' : 'true'; };
  Ed.focus = () => root.focus({ preventScroll: true }); Ed.focusStart = () => { root.focus({ preventScroll: true }); caretTo(root.firstElementChild || root); };
  Ed.hasFocus = () => document.activeElement === root;
  Ed.isEmpty = () => isEmptyBlock(root) && root.children.length <= 1;
  Ed.insertText = (t) => exec('insertText', t);
  Ed.cmd = (name, arg) => {
    if (readOnly) return; if (document.activeElement !== root) root.focus({ preventScroll: true });
    switch (name) {
      case 'bold': case 'italic': case 'underline': commit(); exec(name); changed(true); break;
      case 'strike': commit(); exec('strikeThrough'); changed(true); break;
      case 'mono': { commit(); const r = selRange(); if (!r) break; const c = closest(r.startContainer, 'code'); if (c && inRoot(c)) { c.replaceWith(...c.childNodes); } else if (!r.collapsed) { const t = r.toString(); exec('insertHTML', `<code>${U.esc(t)}</code>`); } else setBlock('codeblock'); changed(true); break; }
      case 'h1': case 'h2': case 'h3': case 'p': case 'quote': case 'codeblock': setBlock(name); break;
      case 'ul': case 'ol': case 'dash': case 'check': toggleList(name); break;
      case 'indent': commit(); exec('indent'); fix(); changed(true); break; case 'outdent': commit(); exec('outdent'); fix(); changed(true); break;
      case 'hr': Ed.insertHr(); break; case 'table': Ed.insertTable(); break; case 'sketch': Ed.insertSketch(); break;
      case 'clear': commit(); exec('removeFormat'); setBlock('p'); break;
      case 'tick': Ed.toggleCheckAtCaret(); break;
    }
    hooks.onSelection && hooks.onSelection();
  };
  Ed.state = () => {
    const r = selRange(); if (!r || !inRoot(r.startContainer)) return null; const n = r.startContainer; const top = topOf(n); const st = { block: 'p' };
    try { st.bold = document.queryCommandState('bold'); st.italic = document.queryCommandState('italic'); st.underline = document.queryCommandState('underline'); st.strike = document.queryCommandState('strikeThrough'); } catch {}
    st.mono = !!closest(n, 'code'); const li = closest(n, 'li'); if (li && inRoot(li)) st.list = listKind(li.parentElement); st.link = !!Ed.linkAtCaret(); st.table = !!cellAt();
    if (top) st.block = top.tagName === 'BLOCKQUOTE' ? 'quote' : top.tagName === 'PRE' ? 'codeblock' : /^H[1-3]$/.test(top.tagName) ? top.tagName.toLowerCase() : 'p';
    return st;
  };
  Ed.selectionText = () => { const r = selRange(); return r && inRoot(r.startContainer) ? r.toString() : ''; };
  Ed.saveSel = saveSel; Ed.restoreSel = restoreSel; Ed.root = () => root;
  Ed.fix = fix; Ed.scrollToTop = () => { root.parentElement.scrollTop = 0; };
  Ed.firstThumb = () => { const im = root.querySelector('.att.img img'); if (im && im.complete && im.naturalWidth) return U.thumbFrom(im); const sk = root.querySelector('.sketch'); return sk ? N.sketch.thumb(sk) : null; };
  Ed.firstThumbId = () => { const f = root.querySelector('.att.img[data-att]'); const s = root.querySelector('.sketch'); const ids = [f, s].filter(Boolean).sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)); return ids[0] ? (ids[0].dataset.att || 'sk' + (ids[0].dataset.strokes || '').length) : null; };
})();
