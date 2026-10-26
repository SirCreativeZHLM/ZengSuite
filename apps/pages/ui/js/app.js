/* Write: boot, document wiring, menus, autosave recovery. */
(async () => {
  'use strict';
  await zeng.ready;
  const P = window.P, S = P.S, flow = P.flow, U = P.ui, $ = P.$;
  S.author = await zeng.store.get('author', 'Author'); S.units = await zeng.store.get('units', P.defaultPageSize() === 'letter' ? 'in' : 'cm');
  flow.spellcheck = await zeng.store.get('spell', true); await P.lens.load();
  P.resetDocSettings(); P.zoomMode = 'auto';
  const imgExt = /^(png|jpe?g|gif|webp|bmp|svg)$/i;

  /* ---------- document ---------- */
  const doc = (P.doc = zeng.doc({
    name: 'Write', ext: 'zpages', filters: [{ name: 'Write Document', exts: ['zpages'] }],
    openExts: ['zpages', 'docx', 'html', 'htm', 'md', 'markdown', 'txt', 'text', 'rtf'],
    blank: () => { P.resetMedia(); P.resetDocSettings(); P.clearHistory(); flow.innerHTML = '<p><br></p>'; P.afterLoad(); P.placeCaretIn(flow.firstChild); clearDraft(); U.refreshAll(); },
    load: async (buf, ext) => { await P.loadFile(buf, ext); clearDraft(); P.placeCaretIn(flow.firstElementChild); U.refreshAll(); },
    save: async (ext) => P.saveAs(ext),
    export: [{ label: 'Document (.docx)…', ext: 'docx' }, { label: 'PDF…', ext: 'pdf', run: async () => { zk.toast('Choose “Save as PDF” in the print dialog', 3200); P.print(); } }, { label: 'HTML…', ext: 'html' }, { label: 'Markdown…', ext: 'md' }, { label: 'Plain Text…', ext: 'txt' }, { label: 'Rich Text (.rtf)…', ext: 'rtf' }],
    print: () => P.print(),
    onOtherFiles: (hs) => { const imgs = hs.filter((h) => imgExt.test(zeng.files.ext(h.name))); if (!imgs.length) return true; (async () => { for (const h of imgs) { try { await P.insertImageBytes(new Uint8Array(await zeng.files.read(h)), P.mimeOfExt(zeng.files.ext(h.name)), h.name); } catch (e) { zk.alert('Can’t insert “' + h.name + '”', e.message); } } })(); return false; },
  }));
  const _clean = doc.setClean; doc.setClean = () => { _clean(); clearDraft(); };
  const _dirty = doc.markDirty; doc.markDirty = () => { P._closing = false; _dirty(); };

  /* ---------- autosave draft ---------- */
  async function clearDraft() { clearTimeout(draftT); try { await zeng.store.set('draft', null); } catch { /* ignore */ } }
  let draftT = 0;
  P.draftSoon = () => { clearTimeout(draftT); draftT = setTimeout(async () => { if (!doc.dirty) return; try { const b = P.zpagesBytes({ draft: true }); if (b.length > 24e6) return; await zeng.store.set('draft', { ts: Date.now(), name: doc.file ? doc.file.name.replace(/\.[^.]+$/, '') : doc.untitled, b64: P.u8ToB64(b) }); } catch (e) { console.warn('draft', e); } }, 2500); };
  zeng.on('close', () => { P._closing = true; });
  const _quit = zeng.quit; zeng.quit = () => { if (P._closing && doc.dirty) { const t = clearDraft(); void t; } _quit(); };

  /* ---------- menus ---------- */
  const ed = (fn) => () => { P.focus(); fn(); };
  const hl = (n) => ({ label: n, checked: U.F.style === n, run: () => P.setStyle(n) });
  const styleItems = () => Object.keys(S.styles).filter((n) => !S.styles[n].hidden).map((n, i) => ({ ...hl(n), accel: n === 'Body' ? 'CmdOrCtrl+Alt+0' : /^Heading (\d)$/.test(n) ? 'CmdOrCtrl+Alt+' + n.slice(-1) : undefined }));
  const menus = () => [
    { label: 'File', items: (() => { const f = doc.fileMenu(); f.splice(1, 0, { label: 'New from Template…', accel: 'CmdOrCtrl+Shift+N', run: () => P.showTemplates() }); const pi = f.findIndex((x) => x.label && x.label.startsWith('Print')); f.splice(pi, 0, { label: 'Page Setup…', run: () => U.showTab('document') }, { separator: true }); return f; })() },
    { label: 'Edit', items: zeng.stdEdit({ undo: () => P.undo(), redo: () => P.redo(), extra: [
      { label: 'Paste and Match Style', accel: 'CmdOrCtrl+Shift+V', run: async () => { try { P.pastePlain(await navigator.clipboard.readText()); } catch { zk.toast('Clipboard access was not allowed'); } } },
      { label: 'Select All', accel: 'CmdOrCtrl+A', run: ed(() => document.execCommand('selectAll')) }, { separator: true },
      { label: 'Find…', accel: 'CmdOrCtrl+F', run: () => U.toggleFind(true) }, { label: 'Find Next', accel: 'CmdOrCtrl+G', run: () => { P.find.q = U.findQ.value || P.find.q; P.find.next(); } }, { label: 'Find Previous', accel: 'CmdOrCtrl+Shift+G', run: () => { P.find.q = U.findQ.value || P.find.q; P.find.prev(); } }, { label: 'Replace…', accel: 'CmdOrCtrl+Alt+F', run: () => U.toggleFind(true) }] }) },
    { label: 'Insert', items: [
      { label: 'Table', submenu: [[2, 2], [3, 3], [4, 3], [5, 4], [8, 5]].map(([r, c]) => ({ label: `${r} × ${c}`, run: ed(() => P.insertTable(r, c)) })) },
      { label: 'Image…', run: () => P.insertImageDialog() }, { label: 'Shape', submenu: U.shapeItems() }, { label: 'Link…', accel: 'CmdOrCtrl+K', run: () => U.link() }, { separator: true },
      { label: 'Comment', accel: 'CmdOrCtrl+Alt+M', run: () => U.addComment() }, { label: 'Footnote', accel: 'CmdOrCtrl+Alt+Shift+F', run: () => P.insertFootnote() }, { label: 'Table of Contents', run: () => P.insertTOC() }, { label: 'Bookmark…', run: () => P.insertBookmark() }, { label: 'Cross-reference…', run: () => P.insertCrossRef() }, { label: 'Equation…', accel: 'CmdOrCtrl+Alt+E', run: () => P.editEquation() }, { separator: true },
      { label: 'Page Break', accel: 'CmdOrCtrl+Alt+Return', run: () => P.insertPageBreak() }, { label: 'Column Break', run: () => P.insertColumnBreak() }, { label: 'Tab Character', run: () => P.insertTab() }, { separator: true },
      { label: 'Header Page Number', run: () => P.insertField('page') }, { label: 'Header Page Count', run: () => P.insertField('pages') }, { label: 'Date', run: () => P.insertSymbol(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) },
      { label: 'Symbol', submenu: ['©', '®', '™', '°', '±', '×', '÷', '≠', '≤', '≥', '→', '←', '•', '…', '—', '–', '§', '¶', '€', '£', '¥'].map((c) => ({ label: c, run: () => P.insertSymbol(c) })) }] },
    { label: 'Format', items: [
      { label: 'Bold', accel: 'CmdOrCtrl+B', run: ed(() => P.toggleInline('bold')) }, { label: 'Italic', accel: 'CmdOrCtrl+I', run: ed(() => P.toggleInline('italic')) }, { label: 'Underline', accel: 'CmdOrCtrl+U', run: ed(() => P.toggleInline('underline')) }, { label: 'Strikethrough', accel: 'CmdOrCtrl+Shift+X', run: ed(() => P.toggleInline('strikeThrough')) },
      { label: 'Superscript', accel: 'CmdOrCtrl+Shift+Plus', run: ed(() => P.sup()) }, { label: 'Subscript', accel: 'CmdOrCtrl+Alt+Minus', run: ed(() => P.sub()) }, { label: 'Small Caps', run: ed(() => P.toggleSmallCaps()) },
      { label: 'Change Case', submenu: [['UPPERCASE', 'upper'], ['lowercase', 'lower'], ['Title Case', 'title'], ['Sentence case', 'sentence'], ['tOGGLE cASE', 'toggle']].map(([l, m]) => ({ label: l, run: () => P.changeCase(m) })) },
      { label: 'Bigger', accel: 'CmdOrCtrl+Shift+.', run: () => P.setFontSize((U.F.size || 11) + 1) }, { label: 'Smaller', accel: 'CmdOrCtrl+Shift+,', run: () => P.setFontSize(Math.max(4, (U.F.size || 11) - 1)) }, { label: 'Clear Formatting', accel: 'CmdOrCtrl+\\', run: () => P.clearFormatting() }, { separator: true },
      { label: 'Paragraph Style', submenu: styleItems() }, { label: 'Update Style to Match Selection', run: () => P.updateStyleFromSelection(U.F.style || 'Body') }, { label: 'Modify Style…', run: () => U.modifyStyle(U.F.style || 'Body') }, { label: 'New Style from Selection…', run: () => U.newStyle() }, { separator: true },
      { label: 'Align', submenu: [['Left', 'left', 'Shift+L'], ['Centre', 'center', 'Shift+E'], ['Right', 'right', 'Shift+R'], ['Justify', 'justify', 'Shift+J']].map(([l, a, k]) => ({ label: l, accel: 'CmdOrCtrl+' + k, checked: U.F.align === a, run: () => P.setAlign(a) })) },
      { label: 'Lists', submenu: [{ label: 'Bullets', accel: 'CmdOrCtrl+Shift+8', checked: U.F.list === 'b', run: () => P.setList('b') }, { label: 'Numbered', accel: 'CmdOrCtrl+Shift+7', checked: U.F.list === 'n', run: () => P.setList('n') }, { label: 'Outline Numbering', checked: U.F.list === 'm', run: () => P.setList('m') }, { label: 'Checklist', accel: 'CmdOrCtrl+Shift+9', checked: U.F.list === 'c', run: () => P.setList('c') }, { separator: true }, { label: 'Increase Level', accel: 'CmdOrCtrl+]', run: () => P.indent(1) }, { label: 'Decrease Level', accel: 'CmdOrCtrl+[', run: () => P.indent(-1) }, { label: 'Restart Numbering', run: () => P.restartList() }, { label: 'Continue Numbering', run: () => P.continueList() }] },
      { label: 'Line Spacing', submenu: [1, 1.15, 1.35, 1.5, 2].map((v) => ({ label: String(v), run: () => P.setLineHeight(v) })) },
      { label: 'Borders', submenu: ['none', 'box', 'top', 'bottom', 'left', 'right'].map((m) => ({ label: m[0].toUpperCase() + m.slice(1), run: () => P.setBorder(m) })) }, { label: 'Page Break Before', run: () => P.pageBreakBefore() }, { label: 'Keep with Next', run: () => P.keepWithNext() }] },
    { label: 'Table', items: [{ label: 'Insert Table…', run: (e) => U.tablePop($('#tb')) }, { separator: true }, { label: 'Add Row Above', run: () => P.insertRow(false) }, { label: 'Add Row Below', run: () => P.insertRow(true) }, { label: 'Add Column Left', run: () => P.insertCol(false) }, { label: 'Add Column Right', run: () => P.insertCol(true) }, { separator: true }, { label: 'Delete Row', run: () => P.deleteRow() }, { label: 'Delete Column', run: () => P.deleteCol() }, { label: 'Delete Table', run: () => P.deleteTable() }, { separator: true }, { label: 'Merge Cells', run: () => P.mergeCells() }, { label: 'Split Cell', run: () => P.splitCell() }, { label: 'Header Row', run: () => P.toggleHeaderRow() }, { label: 'Table Style', submenu: Object.entries(P.TABLE_STYLES).map(([k, l]) => ({ label: l, run: () => P.tableStyle(k) })) }] },
    { label: 'Review', items: [{ label: 'Add Comment', accel: 'CmdOrCtrl+Alt+M', run: () => U.addComment() }, { label: 'Show Review Panel', run: () => U.showReview() }, { separator: true }, { label: 'Track Changes', accel: 'CmdOrCtrl+Shift+T', checked: S.track, run: () => P.review.toggle() }, { label: 'Accept All Changes', run: () => P.review.acceptAll() }, { label: 'Reject All Changes', run: () => P.review.rejectAll() }, { separator: true }, { label: 'Go to Footnote / Reference', run: () => P.gotoFootnote() }, { label: 'Spelling and Grammar', checked: flow.spellcheck, run: () => { flow.spellcheck = !flow.spellcheck; zeng.store.set('spell', flow.spellcheck); U.refreshAll(); } }] },
    { label: 'View', items: [
      { label: 'Zoom In', accel: 'CmdOrCtrl+Plus', run: () => { P.zoomMode = null; P.setZoom(P.zoom * 1.1); } }, { label: 'Zoom Out', accel: 'CmdOrCtrl+-', run: () => { P.zoomMode = null; P.setZoom(P.zoom / 1.1); } }, { label: 'Actual Size', accel: 'CmdOrCtrl+0', run: () => { P.zoomMode = null; P.setZoom(1); } }, { label: 'Fit Width', run: () => P.fitWidth() }, { label: 'Fit Page', run: () => P.fitPage() }, { separator: true },
      { label: 'Sidebar', accel: 'CmdOrCtrl+Alt+S', checked: U.left, run: () => U.toggleLeft() }, { label: 'Inspector', accel: 'CmdOrCtrl+Alt+I', checked: U.right, run: () => U.toggleRight() }, { separator: true },
      { label: 'Focus Mode', accel: 'CmdOrCtrl+Shift+F', checked: P.lens.focus, run: () => P.lens.setFocus() }, { label: 'Readability Lens', accel: 'CmdOrCtrl+Alt+L', checked: U.right && U.mode === 'lens', run: () => U.showPanel('lens') }, { label: 'Typewriter Scrolling', checked: P.lens.typewriter, run: () => { P.lens.typewriter = !P.lens.typewriter; P.lens.save(); U.refreshAll(); } }, { separator: true },
      { label: 'Full Screen', accel: zeng.platform === 'mac' ? 'Ctrl+Cmd+F' : 'F11', run: () => zeng.fullscreen(!document.fullscreenElement) }] },
  ];
  const _refresh = U.refreshAll; U.refreshAll = () => { _refresh.call(U); zeng.setMenus(menus()); };
  zeng.shortcut('CmdOrCtrl+=', () => { P.zoomMode = null; P.setZoom(P.zoom * 1.1); });

  /* ---------- boot ---------- */
  U.build(); await doc.ready; flow.innerHTML = '<p><br></p>'; P.applyPageCss(); P.applyStyleCss(); P.afterLoad(); P.autoZoom(); U.showPanel('format'); U.toggleRight(true); U.toggleLeft(false); zeng.setMenus(menus()); U.refresh();
  P.placeCaretIn(flow.firstChild); flow.focus();
  window.addEventListener('beforeunload', () => {});
  // recovery
  const d = await zeng.store.get('draft', null);
  if (d && d.b64) {
    const r = await zk.sheet({ title: 'Recover unsaved changes?', message: `Write found unsaved changes to “${d.name}” from ${new Date(d.ts).toLocaleString()}.`, buttons: [{ label: 'Discard', value: 'd' }, { label: 'Recover', primary: true, value: 'r' }], dismissable: false });
    if (r === 'r') { try { P.loadZpages(P.b64ToU8(d.b64)); doc.untitled = d.name; doc.file = null; doc.setDirty(true); P.draftSoon(); U.refreshAll(); } catch (e) { zk.alert('Couldn’t recover the draft', e.message); await clearDraft(); } } else await clearDraft();
  }
  window.__zw = { P, doc };
})();
