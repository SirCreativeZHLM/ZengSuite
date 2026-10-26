/* Write: Focus + Readability Lens.
   Focus mode dims everything except the current paragraph or sentence (with optional typewriter scrolling).
   The Lens panel analyses the text live: reading time, Flesch scores, long sentences, passive voice, repeated words and a
   per-heading word-count outline. Everything runs locally; the analysis is English-oriented heuristics. */
(() => {
  'use strict';
  const P = window.P, flow = P.flow, scroll = P.$('#scroll');
  const hasHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  const L = (P.lens = { focus: false, scope: 'paragraph', typewriter: true, longAt: 28, showLong: true, showPassive: true, showRepeat: true, open: false, data: null, repWord: null });
  L.save = () => zeng.store.set('lens', { scope: L.scope, typewriter: L.typewriter, longAt: L.longAt, showLong: L.showLong, showPassive: L.showPassive, showRepeat: L.showRepeat });
  L.load = async () => { const s = await zeng.store.get('lens', null); if (s) Object.assign(L, s); };

  /* ---------- text mapping ---------- */
  const map = (b) => {
    const nodes = []; let text = '';
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.pgsp,[contenteditable=false],del[data-tc],.fld') && !n.parentElement.closest('[data-toc]') ? 2 : n.parentElement.closest('[data-toc]') ? 2 : 1) });
    while (w.nextNode()) { const n = w.currentNode; nodes.push({ n, s: text.length }); text += n.nodeValue; }
    return { nodes, text };
  };
  const rangeOf = (m, s, e) => {
    let a, b; for (const { n, s: o } of m.nodes) { const len = n.nodeValue.length; if (!a && s < o + len) a = [n, s - o]; if (e <= o + len) { b = [n, Math.max(0, e - o)]; break; } }
    if (!a || !b) return null; const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r;
  };
  const textBlocks = () => [...flow.querySelectorAll('p,h1,h2,h3,h4')].filter((b) => !b.hasAttribute('data-toc') && !b.closest('[data-toc]'));

  /* ---------- language heuristics ---------- */
  const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Fig|approx|Inc|Ltd|Co)\./g;
  const sentencesOf = (text) => {
    const masked = text.replace(ABBR, (m) => m.replace(/\./g, '\u0001')).replace(/(\d)\.(\d)/g, '$1\u0001$2').replace(/\b([A-Z])\.(?=\s?[A-Z]\.)/g, '$1\u0001');
    const out = []; const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g; let m;
    while ((m = re.exec(masked))) { const raw = text.slice(m.index, m.index + m[0].length); const lead = raw.length - raw.trimStart().length; const t = raw.trim(); if (t) out.push({ s: m.index + lead, e: m.index + lead + t.length, text: t }); }
    return out;
  };
  const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  const wordsOf = (text) => { const out = []; let m; WORD.lastIndex = 0; while ((m = WORD.exec(text))) out.push({ w: m[0], s: m.index, e: m.index + m[0].length }); return out; };
  const syll = (word) => {
    let w = word.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 1; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
  };
  const IRREG = 'been|born|bought|brought|built|caught|chosen|come|done|drawn|driven|eaten|fallen|felt|found|forgotten|given|gone|grown|had|heard|held|hidden|kept|known|laid|led|left|lost|made|meant|met|paid|put|read|ridden|risen|run|said|seen|sent|set|shown|sold|spoken|spent|stood|taken|taught|told|thought|thrown|understood|won|worn|written|broken|begun|bitten|blown|chosen|cut|dealt|dug|fed|flown|fought|frozen|hung|hurt|lit|shot|shut|sung|sunk|slept|split|spread|stolen|struck|swept|torn|woken';
  const PASSIVE = new RegExp(`\\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten|getting)\\s+(?:(?:not|also|often|never|always|still|just|already|really|very|being|been)\\s+|\\w+ly\\s+)*(?:\\w{3,}ed|${IRREG})\\b(?!\\s+(?:to\\b))`, 'gi');
  const NOT_PASSIVE = /^(?:tired|excited|interested|concerned|worried|pleased|surprised|bored|scared|confused|prepared|married|supposed|used|related|based|advanced|limited|united|needed|indeed|hundred|speed|need|seed|feed|bleed|breed|embed|proceed|succeed|exceed|agreed|red|bed|fed|led|shed|wed)$/i;
  const STOP = new Set('the a an and or but if of to in on at for with from by as is are was were be been being it its this that these those i you he she we they them his her our your their my me us not no so than then there here have has had do does did will would can could should may might must also just very more most much many some any all each other such into over under about after before between through during up down out off again further once only own same too both few more how what when where which who whom why while because until against among within without upon per via one two three said says like get gets got'.split(' '));

  /* ---------- analysis ---------- */
  L.analyze = () => {
    const blocks = textBlocks(); const d = { words: 0, sentences: 0, syl: 0, chars: 0, long: [], passive: [], dups: [], freq: new Map(), sections: [], sentList: [] };
    const freqPos = new Map(); let sec = null; let prevWords = [];
    const flowKids = [...flow.children]; const secByBlock = new Map();
    for (const el of flowKids) { if (/^H[1-4]$/.test(el.tagName) || el.getAttribute('data-st') === 'Title') { const t = el.textContent.replace(/​/g, '').trim(); sec = { el, level: el.tagName[1] ? +el.tagName[1] : 0, text: t, own: 0, total: 0 }; if (t) d.sections.push(sec); } secByBlock.set(el, sec); }
    for (const b of blocks) {
      const m = map(b); const text = m.text.replace(/​/g, ' '); if (!text.trim()) continue; const top = P.blockOf(b); const sc = secByBlock.get(top);
      const ws = wordsOf(text); if (sc && ws.length && top !== sc.el) sc.own += ws.length; else if (sc && top === sc.el) { /* heading words not counted in body */ }
      if (/^H[1-4]$/.test(b.tagName) && b.parentNode === flow) { prevWords = []; }
      const ss = sentencesOf(text);
      for (const s of ss) {
        const sw = wordsOf(s.text); if (!sw.length) continue; d.words += sw.length; d.sentences++; d.chars += sw.reduce((a, x) => a + x.w.length, 0); for (const x of sw) d.syl += syll(x.w);
        d.sentList.push({ b, m, s: s.s, e: s.e, n: sw.length });
        if (sw.length >= L.longAt) d.long.push({ b, m, s: s.s, e: s.e, n: sw.length, text: s.text });
        PASSIVE.lastIndex = 0; let pm; while ((pm = PASSIVE.exec(s.text))) { const last = pm[0].split(/\s+/).pop(); if (NOT_PASSIVE.test(last)) continue; d.passive.push({ b, m, s: s.s + pm.index, e: s.s + pm.index + pm[0].length, text: pm[0] }); }
      }
      // repeats: adjacent duplicates and close repeats of content words
      const lw = ws.map((x) => ({ ...x, k: x.w.toLowerCase().replace(/['’]s$/, '') }));
      for (let i = 0; i < lw.length; i++) {
        const x = lw[i]; if (i && lw[i - 1].k === x.k && x.k.length > 1 && !/^\d+$/.test(x.k) && !/^(had|that)$/.test(x.k)) d.dups.push({ b, m, s: lw[i - 1].s, e: x.e, text: x.w + ' ' + x.w });
        if (x.k.length >= 4 && !STOP.has(x.k) && !/^\d+$/.test(x.k)) { d.freq.set(x.k, (d.freq.get(x.k) || 0) + 1); }
      }
    }
    // section totals (own words + deeper sections that follow until a heading of same or higher level)
    const S_ = d.sections; for (let i = 0; i < S_.length; i++) { let t = S_[i].own; for (let j = i + 1; j < S_.length && (S_[j].level > S_[i].level || S_[i].level === 0 && S_[j].level > 0); j++) t += S_[j].own; S_[i].total = t; }
    const W = d.words || 1, SN = d.sentences || 1; d.wps = W / SN; d.spw = d.syl / W; d.fre = d.words ? 206.835 - 1.015 * d.wps - 84.6 * d.spw : 0; d.fk = d.words ? 0.39 * d.wps + 11.8 * d.spw - 15.59 : 0;
    d.readMin = d.words / 238; d.speakMin = d.words / 150; d.top = [...d.freq.entries()].filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    L.data = d; return d;
  };
  const fmtTime = (min) => (min < 0.5 ? '< 1 min' : min < 60 ? Math.round(min) + ' min' : Math.floor(min / 60) + ' h ' + Math.round(min % 60) + ' min');
  const level = (fre) => (fre >= 90 ? 'Very easy' : fre >= 80 ? 'Easy' : fre >= 70 ? 'Fairly easy' : fre >= 60 ? 'Plain English' : fre >= 50 ? 'Fairly difficult' : fre >= 30 ? 'Difficult' : 'Very difficult');
  L.level = level; L.fmtTime = fmtTime;

  /* ---------- highlights in the document ---------- */
  const paint = (name, items, on) => {
    if (!hasHL) return; CSS.highlights.delete(name); if (!on || !L.open) return;
    const rs = []; for (const it of items) { const r = rangeOf(it.m, it.s, it.e); if (r) rs.push(r); } if (rs.length) CSS.highlights.set(name, new Highlight(...rs));
  };
  L.paintAll = () => {
    const d = L.data; if (!d) return; if (L.focus) { L.clearHighlights(); return; } paint('zlong', d.long, L.showLong); paint('zpassive', d.passive, L.showPassive); paint('zdup', d.dups, L.showRepeat);
    if (hasHL) { CSS.highlights.delete('zrep'); if (L.open && L.repWord && L.showRepeat) { const rs = []; for (const b of textBlocks()) { const m = map(b); const lower = m.text.toLowerCase(); for (const w of wordsOf(m.text)) if (w.w.toLowerCase().replace(/['’]s$/, '') === L.repWord) { const r = rangeOf(m, w.s, w.e); if (r) rs.push(r); } void lower; } if (rs.length) CSS.highlights.set('zrep', new Highlight(...rs)); } }
  };
  L.clearHighlights = () => { if (!hasHL) return; for (const n of ['zlong', 'zpassive', 'zdup', 'zrep']) CSS.highlights.delete(n); };
  L.jump = (item) => { const r = rangeOf(item.m, item.s, item.e); if (!r) return; const rc = r.getBoundingClientRect(), sr = scroll.getBoundingClientRect(); scroll.scrollTop += rc.top - sr.top - sr.height * 0.3; const s = getSelection(); s.removeAllRanges(); s.addRange(r); };

  /* ---------- focus mode ---------- */
  let focusRaf = 0;
  const currentRange = () => {
    const s = getSelection(); if (!s.rangeCount || !flow.contains(s.anchorNode)) return null; const para = P.paraOf(s.focusNode) || P.blockOf(s.focusNode); if (!para) return null;
    if (L.scope === 'paragraph' || !para.matches(P.BLOCK_SEL)) { const r = document.createRange(); r.selectNodeContents(para); return { r, para }; }
    const m = map(para); const off = P.lo(para, s.focusNode, s.focusOffset); void off;
    // logical offset differs from text offset only by atoms; recompute against text nodes directly
    let pos = 0; for (const { n, s: o } of m.nodes) { if (n === s.focusNode) { pos = o + s.focusOffset; break; } if (s.focusNode.nodeType === 1 && n.compareDocumentPosition(s.focusNode) & Node.DOCUMENT_POSITION_FOLLOWING) pos = o + n.nodeValue.length; }
    const ss = sentencesOf(m.text); let cur = ss.find((x) => pos >= x.s && pos <= x.e + 1) || ss[ss.length - 1]; if (!cur) { const r = document.createRange(); r.selectNodeContents(para); return { r, para }; }
    const r = rangeOf(m, cur.s, cur.e); if (!r) { const rr = document.createRange(); rr.selectNodeContents(para); return { r: rr, para }; } return { r, para };
  };
  const paintFocus = () => {
    if (!L.focus) return; const cur = currentRange();
    for (const x of flow.querySelectorAll('[data-fc]')) x.removeAttribute('data-fc');
    if (!cur) { if (hasHL) CSS.highlights.delete('zdim'); return; }
    cur.para.setAttribute('data-fc', '1'); const top = P.blockOf(cur.para); if (top && top !== cur.para) top.setAttribute('data-fc', '1');
    if (hasHL) {
      const a = document.createRange(), b = document.createRange(); a.setStart(flow, 0); a.setEnd(cur.r.startContainer, cur.r.startOffset); b.setStart(cur.r.endContainer, cur.r.endOffset); b.setEnd(flow, flow.childNodes.length);
      CSS.highlights.set('zdim', new Highlight(a, b)); flow.classList.add('hl-focus'); flow.classList.remove('fb-focus');
    } else { flow.classList.add('fb-focus'); }
    if (L.typewriter) typewriter();
  };
  const typewriter = () => {
    const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0).cloneRange(); r.collapse(false); let rc = r.getClientRects()[0]; if (!rc) { const e = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode; rc = e.getBoundingClientRect(); }
    const sr = scroll.getBoundingClientRect(); const delta = rc.top + rc.height / 2 - (sr.top + sr.height * 0.45); if (Math.abs(delta) > 3) scroll.scrollTop += delta;
  };
  L.refreshFocus = () => { if (!L.focus) return; cancelAnimationFrame(focusRaf); focusRaf = requestAnimationFrame(paintFocus); };
  L.setFocus = (on) => {
    L.focus = on === undefined ? !L.focus : on; document.body.classList.toggle('focusing', L.focus);
    if (!L.focus) { L.paintAll(); if (hasHL) CSS.highlights.delete('zdim'); flow.classList.remove('hl-focus', 'fb-focus'); for (const x of flow.querySelectorAll('[data-fc]')) x.removeAttribute('data-fc'); }
    else { L.clearHighlights(); P.focus(); setTimeout(paintFocus, 30); zk.toast('Focus mode — press Esc to leave', 1600); }
    P.ui && P.ui.refreshAll && P.ui.refreshAll(); setTimeout(() => P.refreshSoon && P.refreshSoon(), 250);
  };
  document.addEventListener('selectionchange', () => L.refreshFocus());
  flow.addEventListener('input', () => { L.refreshFocus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.focus && !document.querySelector('.zk-pop,.zk-scrim')) { e.preventDefault(); L.setFocus(false); } }, true);
  P.$('#scroll').addEventListener('pointermove', (e) => { if (!L.focus) return; document.body.classList.toggle('chrome-peek', e.clientY < 96 || e.clientX < 8 || e.clientX > innerWidth - 8); });

  /* ---------- panel ---------- */
  let timer = 0;
  L.schedule = () => { if (!L.open) return; clearTimeout(timer); timer = setTimeout(() => { L.analyze(); L.paintAll(); P.ui && P.ui.renderLens && P.ui.renderLens(); }, 450); };
  L.setOpen = (v) => { L.open = v; if (v) { L.analyze(); L.paintAll(); } else L.clearHighlights(); };
  L.panel = () => {
    const d = L.data || L.analyze(); const el = zk.el; const root = el('.lens');
    const card = (title, ...kids) => el('.lcard', el('.zk-section-title', title), ...kids);
    const stat = (v, lab, sub) => el('.lstat', el('.lv', v), el('.ll', lab), sub ? el('.ls', sub) : null);
    // focus controls
    const sw = (checked, on) => { const i = el('input.zk-switch', { type: 'checkbox', checked }); i.onchange = () => on(i.checked); return i; };
    const scope = el('.zk-seg', ...['paragraph', 'sentence'].map((v) => el('button', { type: 'button', class: L.scope === v ? 'on' : '', 'aria-pressed': L.scope === v, onclick: () => { L.scope = v; L.save(); L.refreshFocus(); P.ui.renderLens(); } }, v[0].toUpperCase() + v.slice(1))));
    root.append(card('Focus', el('.zk-field', el('span', 'Dim everything else'), sw(L.focus, (v) => L.setFocus(v))), el('.zk-field', el('span', 'Highlight'), scope), el('.zk-field', el('span', 'Typewriter scrolling'), sw(L.typewriter, (v) => { L.typewriter = v; L.save(); L.refreshFocus(); }))));
    root.append(card('Reading', el('.lstats', stat(fmtTime(d.readMin), 'Reading time', d.words.toLocaleString() + ' words'), stat(fmtTime(d.speakMin), 'Speaking time', 'at 150 wpm')), el('.lstats', stat(d.words ? (Math.round(d.fk * 10) / 10 < 0 ? '< 0' : Math.round(d.fk * 10) / 10) : '–', 'Flesch–Kincaid grade', d.words ? level(d.fre) : ''), stat(d.words ? Math.max(0, Math.round(d.fre)) : '–', 'Reading ease', d.words ? d.wps.toFixed(1) + ' words / sentence' : ''))));
    const row = (label, n, key, color) => el('.lrow', el('span.dot', { style: { background: color } }), el('span.lfill', label), el('span.lcount', String(n)), sw(L[key], (v) => { L[key] = v; L.save(); L.paintAll(); }));
    const listOf = (items, fmt) => el('.llist', ...items.slice(0, 6).map((it) => el('button.litem', { type: 'button', onclick: () => L.jump(it) }, fmt(it))), items.length > 6 ? el('.lmore', `+ ${items.length - 6} more`) : null);
    root.append(card('Style', row(`Long sentences (${L.longAt}+ words)`, d.long.length, 'showLong', '#ff9f0a'),
      (() => { const r = el('input.zk-range', { type: 'range', min: 15, max: 45, value: L.longAt, 'aria-label': 'Long sentence threshold' }); r.oninput = () => { L.longAt = +r.value; L.save(); L.analyze(); L.paintAll(); P.ui.renderLens(true); }; return r; })(),
      d.long.length ? listOf(d.long, (it) => `${it.n} words — “${it.text.slice(0, 60)}${it.text.length > 60 ? '…' : ''}”`) : null,
      row('Possible passive voice', d.passive.length, 'showPassive', '#0a84ff'), d.passive.length ? listOf(d.passive, (it) => '“' + it.text + '”') : null));
    root.append(card('Repetition', row('Doubled words', d.dups.length, 'showRepeat', '#ff453a'), d.dups.length ? listOf(d.dups, (it) => '“' + it.text + '”') : null,
      d.top.length ? el('.lcloud', ...d.top.map(([w, c]) => el('button.lchip' + (L.repWord === w ? '.on' : ''), { type: 'button', title: 'Highlight “' + w + '”', onclick: () => { L.repWord = L.repWord === w ? null : w; L.paintAll(); P.ui.renderLens(true); } }, w, el('b', String(c))))) : el('.lnote', 'No word appears 4 or more times.')));
    const max = Math.max(1, ...d.sections.map((s) => s.total));
    root.append(card('Outline by length', d.sections.length ? el('.lout', ...d.sections.map((s) => el('button.lsec', { type: 'button', style: { paddingLeft: 6 + Math.max(0, s.level - 1) * 12 + 'px' }, onclick: () => P.scrollToEl(s.el), title: s.text }, el('span.lname', s.text), el('span.lnum', String(s.total.toLocaleString())), el('span.lbar', el('i', { style: { width: Math.max(2, (s.total / max) * 100) + '%' } }))))) : el('.lnote', 'Add headings to see how long each section is.')));
    root.append(el('.lnote.foot', 'Heuristics are tuned for English and run on this device.'));
    return root;
  };
})();
