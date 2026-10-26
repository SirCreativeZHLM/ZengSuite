/* Scratch (free-form notes): free-form lines, live right-aligned results, persistent variables, autosave, text export. */
(function () {
  'use strict';
  window.ZM = window.ZM || {};
  const C = window.ZC;
  window.ZM.notes = function (H, root) {
    root.classList.add('zc-notes'); root.replaceChildren();
    const ta = zk.el('textarea.zc-n-text.selectable', { spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', wrap: 'off', 'aria-label': 'Scratch. Type calculations such as rent = 1200 or 20% of 85.', placeholder: 'rent = 1200\nrent * 12 + 300\n20% of 85\n5 km in miles\nsum' });
    const res = zk.el('.zc-n-res', { 'aria-label': 'Results', role: 'log', 'aria-live': 'off' });
    const foot = zk.el('.zc-n-foot', zk.el('span', { id: 'n-count' }), zk.el('span.zk-spacer'), zk.el('span', 'Results are saved automatically'));
    root.append(zk.el('.zc-n-wrap', ta, res), foot);
    let last = null, evald = { lines: [], vars: {} };
    const angle = { get: () => H.settings.angle, set(a) { H.settings.angle = a; H.saveSettings(); run(); H.updateAngle(); } };
    function run() {
      evald = C.evaluateNotes(ta.value, { fmt: H.fmtOpts(), angle: H.settings.angle });
      const frag = document.createDocumentFragment(); last = null;
      evald.lines.forEach((l) => {
        const d = zk.el('div');
        if (l.kind === 'result' || l.kind === 'assign') { d.className = l.kind === 'assign' ? 'a' : 'r'; d.textContent = l.text; d.title = 'Click to copy'; d.dataset.copy = C.formatQ(l.value, { group: false, sep: H.sep }); d.onclick = () => H.copy(d.dataset.copy); last = d.dataset.copy; if (l.kind === 'assign') d.textContent = l.text; }
        else if (l.kind === 'error') { d.className = 'e'; d.textContent = l.error; }
        frag.append(d);
      });
      res.replaceChildren(frag); res.scrollTop = ta.scrollTop;
      const nVars = Object.keys(evald.vars).length; foot.firstChild.textContent = ta.value ? `${ta.value.split('\n').length} lines${nVars ? ', ' + nVars + ' variable' + (nVars === 1 ? '' : 's') : ''}` : '';
      H.save('notes', { text: ta.value });
    }
    ta.addEventListener('input', run); ta.addEventListener('scroll', () => { res.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); } });
    async function exportText() {
      const txt = C.exportText(ta.value, evald);
      try { const h = await zeng.files.saveAs(txt, { name: 'Scratch.txt', filters: [{ name: 'Text', exts: ['txt'] }] }); if (h) zk.toast('Exported', 1200); } catch (e) { zk.alert('Could not export', e.message); }
    }
    const ready = (async () => { const s = await H.load('notes', null); if (s && typeof s.text === 'string') ta.value = s.text; run(); })();
    return {
      el: root, ready, show() { run(); setTimeout(() => ta.focus(), 30); }, refresh: run, resize() {},
      copyText: () => last, angle,
      menuItems: () => [{ label: 'Export Scratch as Text…', accel: 'CmdOrCtrl+E', run: exportText }, { label: 'Clear Scratch…', run: async () => { if (!ta.value || await zk.confirm('Clear Scratch?', 'This removes every line and variable.')) { ta.value = ''; run(); } } }],
      undo() { ta.focus(); document.execCommand('undo'); }, onKey() { return false; },
    };
  };
})();
