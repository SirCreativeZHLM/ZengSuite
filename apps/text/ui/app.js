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
    load: async (buf, ext) => { const t = new TextDecoder().decode(buf); if (ext === 'html' || ext === 'htm') { rich.innerHTML = new DOMParser().parseFromString(t, 'text/html').body.innerHTML; setMode('rich'); } else { plain.value = t; setMode('plain'); } stats(); },
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
      { label: 'View', items: [{ label: 'Bigger', accel: 'CmdOrCtrl+Plus', run: () => zoom(1) }, { label: 'Smaller', accel: 'CmdOrCtrl+-', run: () => zoom(-1) }] },
    ]);
  }
  let size = 15; const zoom = (d) => { size = zk.clamp(size + d, 9, 40); plain.style.fontSize = size + 'px'; rich.style.fontSize = size + 1 + 'px'; };
  await doc.ready; setMode('plain'); stats();
  window.__zt = { setText: (t) => { plain.value = t; stats(); } };
})();
