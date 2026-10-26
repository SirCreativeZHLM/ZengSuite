/* ZengWrite find & replace: regex, case, whole word, highlight all (CSS Custom Highlight API where available). */
(() => {
  'use strict';
  const P = window.P, flow = P.flow;
  const F = (P.find = { q: '', r: '', regex: false, cs: false, word: false, hl: true, matches: [], cur: -1, err: '' });
  const hasHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  const re = () => {
    if (!F.q) return null; let src = F.regex ? F.q : F.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (F.word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
    try { F.err = ''; return new RegExp(src, 'gu' + (F.cs ? '' : 'i')); } catch (e) { F.err = e.message; return null; }
  };
  const blocksToSearch = () => [...flow.querySelectorAll('p,h1,h2,h3,h4')].filter((b) => !b.closest('[data-toc]'));
  const textNodes = (b) => { const out = []; const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.pgsp') ? 2 : 1) }); while (w.nextNode()) out.push(w.currentNode); return out; };
  F.scan = () => {
    F.matches = []; const rx = re(); if (!rx) { F.paint(); return 0; }
    for (const b of blocksToSearch()) {
      const nodes = textNodes(b); if (!nodes.length) continue; const txt = nodes.map((n) => n.nodeValue).join(''); if (!txt) continue;
      rx.lastIndex = 0; let m; let guard = 0;
      while ((m = rx.exec(txt)) && guard++ < 5000) {
        if (m[0] === '') { rx.lastIndex++; continue; }
        const s = m.index, e = s + m[0].length; let pos = 0, sn, so, en, eo;
        for (const n of nodes) { const L = n.nodeValue.length; if (sn === undefined && s < pos + L) { sn = n; so = s - pos; } if (e <= pos + L) { en = n; eo = e - pos; break; } pos += L; }
        if (!sn || !en) continue; const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo); F.matches.push(r);
      }
    }
    if (F.cur >= F.matches.length) F.cur = F.matches.length - 1; F.paint(); return F.matches.length;
  };
  F.paint = () => {
    if (!hasHL) return; CSS.highlights.delete('zfind'); CSS.highlights.delete('zfind-cur');
    if (!F.matches.length) return; if (F.hl) CSS.highlights.set('zfind', new Highlight(...F.matches.filter((_, i) => i !== F.cur)));
    if (F.cur >= 0 && F.matches[F.cur]) CSS.highlights.set('zfind-cur', new Highlight(F.matches[F.cur]));
  };
  F.clear = () => { F.matches = []; F.cur = -1; if (hasHL) { CSS.highlights.delete('zfind'); CSS.highlights.delete('zfind-cur'); } };
  const inBar = () => document.activeElement && document.activeElement.closest && document.activeElement.closest('#findbar');
  const show = (i) => {
    F.cur = i; const r = F.matches[i]; if (!r) { F.paint(); return; }
    if (!inBar()) { const s = getSelection(); if (!P.hfActive) flow.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(r.cloneRange()); }
    F.paint(); const sc = P.$('#scroll'), rc = r.getBoundingClientRect(), sr = sc.getBoundingClientRect(); if (rc.top < sr.top + 40 || rc.bottom > sr.bottom - 40) sc.scrollTop += rc.top - sr.top - sr.height * 0.35;
  };
  F.step = (dir) => {
    const prev = F.cur >= 0 ? F.matches[F.cur] : null; const prevText = prev ? prev.toString() : null; F.scan(); if (!F.matches.length) { F.cur = -1; P.ui && P.ui.findStatus && P.ui.findStatus(); return; }
    let i;
    if (inBar() && prevText !== null && F.cur >= 0 && F.cur < F.matches.length) i = (F.cur + dir + F.matches.length) % F.matches.length;
    else {
      const s = getSelection();
      if (s.rangeCount && flow.contains(s.anchorNode)) {
        const sel = s.getRangeAt(0); const exact = F.matches.findIndex((m) => m.compareBoundaryPoints(Range.START_TO_START, sel) === 0 && m.compareBoundaryPoints(Range.END_TO_END, sel) === 0);
        if (exact >= 0 && !sel.collapsed) i = (exact + dir + F.matches.length) % F.matches.length;
        else if (dir > 0) { i = F.matches.findIndex((m) => m.compareBoundaryPoints(Range.START_TO_START, sel) >= 0); if (i < 0) i = 0; }
        else { i = -1; for (let k = F.matches.length - 1; k >= 0; k--) if (F.matches[k].compareBoundaryPoints(Range.END_TO_START, sel) <= 0) { i = k; break; } if (i < 0) i = F.matches.length - 1; }
      } else i = dir > 0 ? 0 : F.matches.length - 1;
    }
    show(i); P.ui && P.ui.findStatus && P.ui.findStatus();
  };
  F.next = () => F.step(1); F.prev = () => F.step(-1);
  const replacementFor = (m) => { if (!F.regex) return F.r; const rx = re(); if (!rx) return F.r; const one = new RegExp(rx.source, rx.flags.replace('g', '')); return m.toString().replace(one, F.r); };
  F.replace = () => {
    F.scan(); let i = F.cur >= 0 && F.cur < F.matches.length && inBar() ? F.cur : -1;
    if (i < 0) { const s = getSelection(); if (s.rangeCount) { const sel = s.getRangeAt(0); i = F.matches.findIndex((m) => m.compareBoundaryPoints(Range.START_TO_START, sel) === 0 && m.compareBoundaryPoints(Range.END_TO_END, sel) === 0); } }
    if (i < 0) { F.next(); return; }
    P.checkpoint(false); const m = F.matches[i]; const txt = replacementFor(m); m.deleteContents(); m.insertNode(document.createTextNode(txt)); m.startContainer.parentNode && m.startContainer.parentNode.normalize();
    P.changed(); P.markDirty(); F.cur = i - 1; F.scan(); F.step(1);
  };
  F.replaceAll = () => {
    const n = F.scan(); if (!n) return 0; P.checkpoint(false);
    for (let i = F.matches.length - 1; i >= 0; i--) { const m = F.matches[i]; const txt = replacementFor(m); const par = m.startContainer.parentNode; m.deleteContents(); m.insertNode(document.createTextNode(txt)); par && par.normalize(); }
    F.clear(); P.changed(); P.markDirty(); zk.toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`); return n;
  };
  F.count = () => F.scan();
})();
