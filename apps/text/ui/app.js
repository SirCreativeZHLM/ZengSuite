(async () => {
  await zeng.ready;
  const $ = (s) => document.querySelector(s), plain = $('#plain'), rich = $('#rich');
  let mode = 'plain';
  $('#find-btn').append(zk.icon('search')); $('#fclose').append(zk.icon('x'));
  const setMode = (m) => { mode = m; plain.classList.toggle('zk-hidden', m !== 'plain'); rich.classList.toggle('zk-hidden', m !== 'rich');
    document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); (m === 'plain' ? plain : rich).focus(); stats(); buildMenus(); };
  const text = () => (mode === 'plain' ? plain.value : rich.innerText);
  const stats = () => { const t = text(); const w = (t.trim().match(/\S+/g) || []).length; $('#stats').textContent = `${w.toLocaleString()} words · ${t.length.toLocaleString()} characters`;
    if (mode === 'plain') { const before = plain.value.slice(0, plain.selectionStart).split('\n'); $('#where').textContent = `Ln ${before.length}, Col ${before.at(-1).length + 1}`; } else $('#where').textContent = ''; };
  const doc = zeng.doc({
    name: 'Text', ext: 'txt', filters: [{ name: 'Text', exts: ['txt', 'md', 'text', 'log', 'json', 'csv', 'js', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'rs', 'py', 'swift', 'sh'] }, { name: 'Rich Text (HTML)', exts: ['html', 'htm'] }],
    openExts: ['txt', 'md', 'text', 'log', 'json', 'csv', 'js', 'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'toml', 'rs', 'py', 'swift', 'sh', 'ts', 'c', 'h', 'cpp', 'go'],
    blank: () => { plain.value = ''; rich.innerHTML = ''; setMode('plain'); stats(); },
    load: async (buf, ext, h) => { setTimeout(loadHist, 50); const t = new TextDecoder().decode(buf); if (ext === 'html' || ext === 'htm') { rich.innerHTML = new DOMParser().parseFromString(t, 'text/html').body.innerHTML; setMode('rich'); } else { plain.value = t; setMode('plain'); } stats(); },
    save: async (ext) => (ext === 'html' || ext === 'htm' ? `<!doctype html><meta charset="utf-8"><body>${rich.innerHTML}</body>` : text()),
    export: [{ label: 'Plain Text…', ext: 'txt' }, { label: 'HTML…', ext: 'html' }],
  });
  [plain, rich].forEach((e) => { e.addEventListener('input', () => { doc.markDirty(); stats(); }); e.addEventListener('keyup', stats); e.addEventListener('click', stats); });
  plain.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '\t'); } });
  document.querySelectorAll('#mode button').forEach((b) => (b.onclick = () => { if (b.dataset.m === mode) return; const t = text(); if (b.dataset.m === 'rich') rich.innerText = t; else plain.value = t; setMode(b.dataset.m); }));

  // find & replace (plain mode)
  const bar = $('#findbar'); const toggleFind = (on = bar.classList.contains('zk-hidden')) => { bar.classList.toggle('zk-hidden', !on); if (on) { $('#q').focus(); $('#q').select(); } };
  $('#find-btn').onclick = () => toggleFind(); $('#fclose').onclick = () => toggleFind(false);
  const next = () => { const q = $('#q').value; if (!q) return; if (mode === 'plain') { const i = plain.value.toLowerCase().indexOf(q.toLowerCase(), plain.selectionEnd); const j = i < 0 ? plain.value.toLowerCase().indexOf(q.toLowerCase()) : i; if (j >= 0) { plain.focus(); plain.setSelectionRange(j, j + q.length); } } else window.find(q); };
  const count = () => { const q = $('#q').value.toLowerCase(); $('#count').textContent = q && mode === 'plain' ? `${plain.value.toLowerCase().split(q).length - 1} found` : ''; };
  $('#q').oninput = count; $('#q').onkeydown = (e) => { if (e.key === 'Enter') next(); if (e.key === 'Escape') toggleFind(false); };
  $('#next').onclick = next;
  $('#repl').onclick = () => { if (mode !== 'plain') return; const q = $('#q').value; if (plain.value.slice(plain.selectionStart, plain.selectionEnd).toLowerCase() === q.toLowerCase() && q) { plain.focus(); document.execCommand('insertText', false, $('#r').value); doc.markDirty(); } next(); };
  $('#all').onclick = () => { if (mode !== 'plain') return; const q = $('#q').value; if (!q) return; plain.value = plain.value.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => $('#r').value); doc.markDirty(); count(); stats(); };


  // ---------- time-travel history: local snapshots of every document, scrubbed with a slider ----------
  const H = { snaps: [], key: 'h-new', last: '' };
  const keyOf = () => 'h-' + [...(doc.file ? doc.file.path || doc.file.name : 'untitled')].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const loadHist = async () => { H.key = keyOf(); H.snaps = (await zeng.store.get(H.key, [])) || []; H.last = H.snaps.at(-1)?.t || ''; renderHist(); };
  const snap = async (label = '') => { const t = text(); if (t === H.last && !label) return; H.last = t; H.snaps.push({ at: Date.now(), t, label, rich: mode === 'rich' ? rich.innerHTML : null });
    if (H.snaps.length > 120) { const keep = H.snaps.filter((x, i) => x.label || i > H.snaps.length - 60 || i % 2 === 0); H.snaps = keep.slice(-120); }
    await zeng.store.set(H.key, H.snaps); renderHist(); };
  const snapSoon = zk.debounce(() => snap(), 20000);
  const diff = (a, b) => { const A = a.split('\n'), B = b.split('\n'); const m = A.length, n = B.length; if (m * n > 4e6) return [['add', 'Large file: diff skipped']]; const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1)); for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); const out = []; let i = 0, j = 0; while (i < m && j < n) { if (A[i] === B[j]) { out.push(['same', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['del', A[i++]]); else out.push(['add', B[j++]]); } while (i < m) out.push(['del', A[i++]]); while (j < n) out.push(['add', B[j++]]); return out; };
  let sel = 0;
  const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const renderHist = () => { const sl = $('#hslide'); sl.max = Math.max(0, H.snaps.length - 1); if (!$('#hist').classList.contains('zk-hidden')) show(Math.min(sel, H.snaps.length - 1)); };
  const show = (i) => { sel = i < 0 ? 0 : i; const s = H.snaps[sel]; $('#hslide').value = sel; if (!s) { $('#hwhen').textContent = 'No versions yet — they are saved as you work.'; $('#hdiff').textContent = ''; $('#hlist').replaceChildren(); return; }
    $('#hwhen').textContent = `${when(s.at)}${s.label ? ' · ' + s.label : ''}  (${sel + 1} of ${H.snaps.length})`;
    const d = diff(s.t, text()); const pre = $('#hdiff'); pre.replaceChildren(...d.filter((x, k) => x[0] !== 'same' || d.slice(Math.max(0, k - 2), k + 3).some((y) => y[0] !== 'same')).map(([k, l]) => zk.el('span' + (k === 'same' ? '' : '.' + k), (k === 'add' ? '+ ' : k === 'del' ? '− ' : '  ') + l + '\n')));
    if (d.every((x) => x[0] === 'same')) pre.textContent = 'This version matches what you have now.';
    $('#hlist').replaceChildren(...H.snaps.map((x, k) => zk.el('.zk-list-item' + (k === sel ? '.sel' : ''), { onclick: () => show(k) }, when(x.at), x.label && zk.el('span.zk-meta', x.label))).reverse()); };
  const toggleHist = (on = $('#hist').classList.contains('zk-hidden')) => { $('#hist').classList.toggle('zk-hidden', !on); $('#hist-btn').classList.toggle('on', on); if (on) { snap(); show(H.snaps.length - 1); } };
  $('#hist-btn').append(zk.icon('history')); $('#hclose').append(zk.icon('x')); $('#hist-btn').onclick = () => toggleHist(); $('#hclose').onclick = () => toggleHist(false);
  $('#hslide').oninput = (e) => show(+e.target.value);
  $('#hsnap').onclick = async () => { const l = await zk.prompt('Name this version', '', { ok: 'Save' }); if (l !== null) { await snap(l || 'Snapshot'); show(H.snaps.length - 1); zk.toast('Snapshot saved'); } };
  $('#hrestore').onclick = async () => { const s = H.snaps[sel]; if (!s) return; await snap('Before restore'); if (s.rich != null) { rich.innerHTML = s.rich; setMode('rich'); } else { plain.value = s.t; setMode('plain'); } doc.markDirty(); stats(); show(H.snaps.length - 1); zk.toast('Restored'); };
  [plain, rich].forEach((e) => e.addEventListener('input', snapSoon));
  doc.afterOpen = loadHist;

  function buildMenus() {
    zeng.setMenus([
      { label: 'File', items: doc.fileMenu() },
      { label: 'Edit', items: zeng.stdEdit({ extra: [{ label: 'Find…', accel: 'CmdOrCtrl+F', run: () => toggleFind(true) }, { label: 'Find Next', accel: 'CmdOrCtrl+G', run: next }] }) },
      { label: 'Format', items: [
        { label: 'Plain Text', checked: mode === 'plain', accel: 'CmdOrCtrl+Shift+T', run: () => $('#mode [data-m=plain]').click() },
        { label: 'Rich Text', checked: mode === 'rich', run: () => $('#mode [data-m=rich]').click() },
        { separator: true },
        { label: 'Bold', accel: 'CmdOrCtrl+B', enabled: mode === 'rich', run: () => document.execCommand('bold') },
        { label: 'Italic', accel: 'CmdOrCtrl+I', enabled: mode === 'rich', run: () => document.execCommand('italic') },
        { label: 'Underline', accel: 'CmdOrCtrl+U', enabled: mode === 'rich', run: () => document.execCommand('underline') },
      ] },
      { label: 'View', items: [{ label: 'Version History', accel: 'CmdOrCtrl+Shift+H', run: () => toggleHist() }, { separator: true }, { label: 'Bigger', accel: 'CmdOrCtrl+Plus', run: () => zoom(1) }, { label: 'Smaller', accel: 'CmdOrCtrl+-', run: () => zoom(-1) }] },
    ]);
  }
  let size = 15; const zoom = (d) => { size = zk.clamp(size + d, 9, 40); plain.style.fontSize = size + 'px'; rich.style.fontSize = size + 1 + 'px'; };
  await doc.ready; setMode('plain'); stats(); await loadHist(); zeng.on('focus', () => {}); addEventListener('beforeunload', () => snap());
  window.__zt = { setText: (t) => { plain.value = t; stats(); } };
})();
