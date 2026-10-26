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
    const Q = C.Q, Dec = C.Dec;
    const wiBar = zk.el('.zc-wi', { hidden: true, role: 'group', 'aria-label': 'What-if slider' });
    const varsBox = zk.el('.zc-vars', { 'aria-label': 'Variables. Choose one for a what-if slider.' });
    foot.insertBefore(varsBox, foot.children[1]);
    root.insertBefore(wiBar, foot);
    let wi = null;
    const lineText = (i) => ta.value.split('\n')[i] || '';
    function build(ev, cmp) {
      const frag = document.createDocumentFragment(); let n = 0; last = null;
      ev.lines.forEach((l, i) => {
        const d = zk.el('div');
        if (l.kind === 'result' || l.kind === 'assign') {
          d.className = l.kind === 'assign' ? 'a' : 'r'; d.textContent = l.text; d.dataset.copy = C.formatQ(l.value, { group: false, sep: H.sep }); last = d.dataset.copy; d.title = 'Click to show how this was computed';
          d.tabIndex = 0; d.onclick = () => showLine(i, ev); d.onkeydown = (e) => { if (e.key === 'Enter') showLine(i, ev); };
          d.oncontextmenu = (e) => zk.contextMenu(e, [{ label: 'Show Work', run: () => showLine(i, ev) }, { label: 'Copy Value', run: () => H.copy(d.dataset.copy) }, ...(l.kind === 'assign' ? [{ separator: true }, { label: 'What-if Slider…', run: () => openWhatIf(i) }] : [])]);
          if (cmp) { const was = cmp.lines[i]; if (was && was.text !== l.text) { d.classList.add('chg'); d.title = 'was ' + was.text; n++; } }
          if (l.kind === 'assign' && !cmp) d.append(zk.el('button.zk-btn.icon.wi', { type: 'button', 'aria-label': 'What-if slider for ' + l.name.replace(/_/g, ' '), title: 'What-if slider', onclick: (e) => { e.stopPropagation(); openWhatIf(i); } }, zk.icon('sliders-horizontal', 13)));
        } else if (l.kind === 'error') { d.className = 'e'; d.textContent = l.error; }
        frag.append(d);
      });
      res.replaceChildren(frag); res.scrollTop = ta.scrollTop; return n;
    }
    function run() {
      closeWhatIf(true); evald = C.evaluateNotes(ta.value, { fmt: H.fmtOpts(), angle: H.settings.angle }); build(evald, null);
      const names = {}; evald.lines.forEach((l, i) => { if (l.kind === 'assign') names[l.name] = i; });
      varsBox.replaceChildren(...Object.keys(names).map((k) => zk.el('button.zc-chip', { type: 'button', title: 'What-if slider for ' + k.replace(/_/g, ' '), onclick: () => openWhatIf(names[k]) }, k.replace(/_/g, ' '))));
      const nVars = Object.keys(evald.vars).length; foot.firstChild.textContent = ta.value ? `${ta.value.split('\n').length} lines${nVars ? ', ' + nVars + ' variable' + (nVars === 1 ? '' : 's') : ''}` : '';
      H.save('notes', { text: ta.value });
    }
    // ---- Show Work for a line
    function showLine(i, ev) {
      const l = (ev || evald).lines[i]; if (!l) return;
      if (l.parts) { H.work.openModel({ kind: 'steps', expr: 'sum of the lines above', resultText: l.text, steps: [{ plain: l.parts.join(' + ') + ' = ' + l.text, note: 'Adds the block of result lines directly above (a blank line, heading or variable definition ends the block).' }] }, { title: 'Show work' }); return; }
      if (!l.src) { H.toast('Nothing to show for this line'); return; }
      H.work.openExpr({ src: l.src, vars: l.vars, varNames: new Set(Object.keys(l.vars || {})), units: true, angle: H.settings.angle, title: l.kind === 'assign' ? 'Show work: ' + l.name.replace(/_/g, ' ') : 'Show work' });
    }
    function caretLine() { return ta.value.slice(0, ta.selectionStart).split('\n').length - 1; }
    // ---- What-if slider
    const nice = (x) => { const a = Math.abs(x); if (a === 0) return 1; return Math.pow(10, Math.floor(Math.log10(a)) - 2); };
    function openWhatIf(i) {
      const l = evald.lines[i]; if (!l || l.kind !== 'assign') return;
      const unit = l.value instanceof Q ? l.value.u : null; const dec = unit ? l.value.v : l.value; const nv = dec.toNumber();
      let lo = Math.min(0, nv * 2), hi = Math.max(0, nv * 2); if (nv === 0) { lo = -10; hi = 10; }
      const step = nice((hi - lo) / 2); const lt = lineText(i); const m = /^(.*?=\s*)(-?[\d.]+)(\s*[^\d=]*)$/.exec(lt);
      wi = { i, name: l.name, unit, base: dec, lo, hi, step, literal: !!m && l.src && /^\s*-?[\d.]+\s*[^\d=]*$/.test(l.src) };
      const rng = zk.el('input.zk-range', { type: 'range', min: lo, max: hi, step, value: nv, 'aria-label': 'Value of ' + l.name.replace(/_/g, ' ') });
      const num = zk.el('input.zc-input', { type: 'number', step, value: nv, 'aria-label': 'Exact value' }); const info = zk.el('span.zc-note', { role: 'status', 'aria-live': 'polite' });
      const decimals = Math.max(0, -Math.floor(Math.log10(step)));
      let raf = 0; const apply = (v) => { if (!isFinite(v)) return; if (v < +rng.min) rng.min = v; if (v > +rng.max) rng.max = v; wi.val = Dec.parse(v.toFixed(Math.min(12, decimals))); if (!raf) raf = requestAnimationFrame(() => { raf = 0; live(info); }); };
      rng.addEventListener('input', () => { num.value = rng.value; apply(+rng.value); }); num.addEventListener('input', () => { rng.value = num.value; apply(+num.value); });
      const applyBtn = zk.el('button.zc-btn.primary', { type: 'button', disabled: !wi.literal, title: wi.literal ? 'Write this value into the line' : 'This line is a formula, so there is no single number to replace', onclick: () => applyWhatIf() }, 'Apply');
      wiBar.replaceChildren(zk.el('strong', l.name.replace(/_/g, ' ')), rng, num, info, applyBtn, zk.el('button.zc-btn', { type: 'button', onclick: () => { closeWhatIf(); } }, 'Done'));
      wiBar.hidden = false; wi.val = dec; live(info);
    }
    function live(info) {
      const v = wi.unit ? new Q(wi.val, wi.unit) : wi.val;
      const alt = C.evaluateNotes(ta.value, { fmt: H.fmtOpts(), angle: H.settings.angle, override: { line: wi.i, value: v } });
      const n = Math.max(0, build(alt, evald) - (alt.lines[wi.i] && evald.lines[wi.i] && alt.lines[wi.i].text !== evald.lines[wi.i].text ? 1 : 0)); info.textContent = n ? `${n} dependent line${n === 1 ? '' : 's'} change` : 'No other line depends on this'; wi.alt = alt;
    }
    function closeWhatIf(silent) { if (!wi) return; wi = null; wiBar.hidden = true; wiBar.replaceChildren(); if (!silent) build(evald, null); }
    function applyWhatIf() {
      if (!wi || !wi.literal) return; const lines = ta.value.split('\n'); const m = /^(.*?=\s*)(-?[\d.]+)(\s*[^\d=]*)$/.exec(lines[wi.i]); if (!m) return;
      lines[wi.i] = m[1] + wi.val.toPlain() + m[3]; ta.value = lines.join('\n'); run(); zk.toast('Applied', 1000);
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
      copyText: () => last, angle, showWork() { showLine(caretLine()); },
      menuItems: () => [{ label: 'Export Scratch as Text…', accel: 'CmdOrCtrl+E', run: exportText }, { label: 'Clear Scratch…', run: async () => { if (!ta.value || await zk.confirm('Clear Scratch?', 'This removes every line and variable.')) { ta.value = ''; run(); } } }],
      undo() { ta.focus(); document.execCommand('undo'); }, onKey() { return false; },
    };
  };
})();
