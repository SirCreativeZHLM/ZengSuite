/* Related notes: TF-IDF cosine similarity over note text, boosted by direct links and shared tags. */
(() => {
  const U = N.u, Db = N.db; const R = (N.rel = {});
  const STOP = new Set('the and for are but not you all any can had her was one our out has have this that with from they will would there their what about which when your said each she how them than then these those into been were over also more some such only very just like make made many much most must even does did get got its it\'s per via'.split(' '));
  const tf = new Map(); const df = new Map(); const inv = new Map(); let ready = false, token = 0;
  const vecOf = (text) => { const m = new Map(); const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []; for (const w of words) { if (STOP.has(w) || /^\d+$/.test(w)) continue; m.set(w, (m.get(w) || 0) + 1); } if (m.size > 60) return new Map([...m].sort((a, b) => b[1] - a[1]).slice(0, 60)); return m; };
  const drop = (id) => { const v = tf.get(id); if (!v) return; for (const t of v.keys()) { df.set(t, (df.get(t) || 1) - 1); const s = inv.get(t); if (s) { s.delete(id); if (!s.size) inv.delete(t); } } tf.delete(id); };
  const add = (id, text) => { drop(id); const v = vecOf(text); tf.set(id, v); for (const t of v.keys()) { df.set(t, (df.get(t) || 0) + 1); let s = inv.get(t); if (!s) inv.set(t, (s = new Set())); s.add(id); } };
  R.update = (id, text) => { if (!ready) return; const m = Db.idx.notes[id]; if (!m || m.d || m.l) return drop(id); add(id, text); };
  R.rebuild = (done) => {
    const my = ++token; ready = false; tf.clear(); df.clear(); inv.clear(); const ids = Object.keys(Db.idx.notes).filter((id) => { const m = Db.idx.notes[id]; return !m.d && !m.l; }); let i = 0;
    const step = () => { if (my !== token) return; const end = Math.min(ids.length, i + 250); for (; i < end; i++) add(ids[i], Db.text(ids[i])); if (i < ids.length) setTimeout(step, 0); else { ready = true; done && done(); } };
    step();
  };
  const weight = (t, c, N_) => (1 + Math.log(c)) * Math.log(1 + N_ / (df.get(t) || 1));
  R.related = (id, limit = 5) => {
    if (!ready) return []; const me = tf.get(id); const meta = Db.idx.notes[id]; if (!me || !meta) return []; const N_ = tf.size || 1;
    const vw = (v) => { const w = new Map(); let n2 = 0; for (const [t, c] of v) { const x = weight(t, c, N_); w.set(t, x); n2 += x * x; } return { w, n: Math.sqrt(n2) || 1 }; };
    const a = vw(me); const top = [...a.w].sort((x, y) => y[1] - x[1]).slice(0, 14); const cand = new Map();
    for (const [t, wt] of top) { const s = inv.get(t); if (!s || s.size > 400) continue; for (const o of s) if (o !== id) { const e = cand.get(o) || { dot: 0, terms: [] }; cand.set(o, e); } }
    const myTitle = (meta.t || '').toLowerCase(); const linked = new Set(); for (const l of meta.ln || []) linked.add(l);
    for (const [oid, m] of Object.entries(Db.idx.notes)) { if (oid === id || m.d || m.l) continue; if (linked.has(oid) || (m.t && linked.has(m.t.toLowerCase())) || (m.ln && (m.ln.includes(id) || (myTitle && m.ln.includes(myTitle))))) cand.set(oid, cand.get(oid) || { dot: 0, terms: [] }); }
    const mt = new Set(meta.tg || []); const out = [];
    for (const [oid, e] of cand) {
      const m = Db.idx.notes[oid]; if (!m || m.d || m.l) continue; const v = tf.get(oid); let dot = 0; const shared = []; let n2 = 0; const ow = new Map();
      if (v) { for (const [t, c] of v) { const x = weight(t, c, N_); n2 += x * x; if (a.w.has(t)) { dot += x * a.w.get(t); shared.push([t, x * a.w.get(t)]); } } }
      const cos = v ? dot / (a.n * (Math.sqrt(n2) || 1)) : 0; const why = [];
      const link = linked.has(oid) || (m.t && linked.has(m.t.toLowerCase())) || (m.ln && (m.ln.includes(id) || (myTitle && m.ln.includes(myTitle)))); const tags = (m.tg || []).filter((t) => mt.has(t));
      let score = cos + (link ? 0.35 : 0) + Math.min(0.36, tags.length * 0.12); if (score < 0.1) continue;
      if (link) why.push('linked'); if (tags.length) why.push(tags.slice(0, 2).map((t) => '#' + t).join(' ')); if (!why.length || cos > 0.18) { const ts = shared.sort((x, y) => y[1] - x[1]).slice(0, 2).map((x) => x[0]); if (ts.length) why.push(ts.join(', ')); }
      out.push({ id: oid, score, why });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, limit);
  };
})();
