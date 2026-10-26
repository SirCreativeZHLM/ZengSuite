/* ZengNotes storage layer on top of zeng.store (one JSON file per key).
   Keys:  idx_a / idx_b / idx_c   index copies (alternating; c is a slow-moving fallback)
          n_<id>_a / n_<id>_b     note record, two slots written alternately ("write then switch")
          fts_0 .. fts_f          search text shards {id: text}
          a_<id> / a_<id>_<i>     attachment meta + base64 chunks
          t_<id>                  thumbnail data URL
          lib_marker              exists once a library was created (lets us detect a lost index) */
(() => {
  const U = N.u; const Db = (N.db = {});
  const native = zeng.isNative;
  const kv = {
    async get(k) { if (window.__testStore) return window.__testStore.get(k); return await zeng.store.get(k, null); },
    async set(k, v) {
      if (window.__testStore) return window.__testStore.set(k, v);
      if (native) await zeng.call('store_set', { key: k, value: v });
      else localStorage.setItem('zeng:' + k, JSON.stringify(v));
    },
  };
  Db.kv = kv;
  Db.idx = { v: 1, seq: 0, folders: [], notes: {} };
  Db.fts = Array.from({ length: 16 }, () => ({}));
  const dirtyFts = new Set(); let idxDirty = false; const pending = new Map(); let lastC = 0;
  Db.status = { corrupted: false, recovered: 0, lost: [], error: null };
  Db.pendingCount = () => pending.size + (idxDirty ? 1 : 0) + dirtyFts.size;
  const validIdx = (x) => x && x.v === 1 && x.notes && typeof x.notes === 'object' && Array.isArray(x.folders) && typeof x.seq === 'number';

  Db.init = async () => {
    const [a, b, c, marker] = await Promise.all([kv.get('idx_a'), kv.get('idx_b'), kv.get('idx_c'), kv.get('lib_marker')]);
    const ok = [a, b, c].filter(validIdx).sort((x, y) => y.seq - x.seq);
    if (!ok.length) {
      if (marker || a || b || c) Db.status.corrupted = true;
    } else {
      Db.idx = ok[0];
      if ([a, b].some((x) => !validIdx(x))) Db.status.recovered++;
    }
    const sh = await Promise.all(Array.from({ length: 16 }, (_, i) => kv.get('fts_' + i)));
    sh.forEach((s, i) => { Db.fts[i] = s && typeof s === 'object' ? s : {}; });
    // drop fts entries for notes that no longer exist
    for (let i = 0; i < 16; i++) for (const id in Db.fts[i]) if (!Db.idx.notes[id]) delete Db.fts[i][id];
    return Db.idx;
  };
  Db.ensureMarker = async () => { if (!Db.markerSet) { Db.markerSet = true; try { await kv.set('lib_marker', { created: Date.now(), app: 'ZengNotes' }); } catch {} } };

  Db.text = (id) => Db.fts[U.hash16(id)][id] || '';
  Db.put = (rec, meta, text) => {
    pending.set(rec.id, rec); Db.idx.notes[rec.id] = meta; const sh = U.hash16(rec.id);
    if (text != null) { Db.fts[sh][rec.id] = text; dirtyFts.add(sh); } idxDirty = true;
  };
  Db.touchIndex = () => { idxDirty = true; };
  Db.setFts = (id, text) => { const sh = U.hash16(id); Db.fts[sh][id] = text; dirtyFts.add(sh); };

  let chain = Promise.resolve();
  Db.flush = () => (chain = chain.then(doFlush, doFlush));
  const doFlush = async () => {
    if (!pending.size && !idxDirty && !dirtyFts.size) return true;
    const recs = [...pending.values()]; pending.clear(); const fts = [...dirtyFts]; dirtyFts.clear(); const wasIdx = idxDirty; idxDirty = false;
    try {
      await Db.ensureMarker();
      for (const rec of recs) {
        const meta = Db.idx.notes[rec.id]; if (!meta) continue;
        const slot = meta.sl === 'a' ? 'b' : 'a';
        await kv.set(`n_${rec.id}_${slot}`, rec); meta.sl = slot;
      }
      for (const sh of fts) await kv.set('fts_' + sh, Db.fts[sh]);
      if (wasIdx || recs.length) {
        const idx = Db.idx; idx.seq++; await kv.set(idx.seq % 2 ? 'idx_a' : 'idx_b', idx);
        if (Date.now() - lastC > 10 * 60 * 1000) { lastC = Date.now(); await kv.set('idx_c', idx); }
      }
      Db.status.error = null; return true;
    } catch (e) {
      console.error('flush failed', e); Db.status.error = e.message || String(e);
      for (const r of recs) if (!pending.has(r.id)) pending.set(r.id, r);
      fts.forEach((s) => dirtyFts.add(s)); idxDirty = true; return false;
    }
  };

  Db.loadNote = async (id) => {
    const meta = Db.idx.notes[id]; if (!meta) return null;
    const first = meta.sl === 'b' ? 'b' : 'a', second = first === 'a' ? 'b' : 'a';
    let r = await kv.get(`n_${id}_${first}`);
    if (r && r.id === id) return r;
    r = await kv.get(`n_${id}_${second}`);
    if (r && r.id === id) { Db.status.recovered++; return r; }
    Db.status.lost.push(id); return null;
  };
  Db.removeNote = async (id) => {
    const meta = Db.idx.notes[id]; if (!meta) return;
    let rec = null; try { rec = await Db.loadNote(id); } catch {}
    for (const a of (rec && rec.atts) || []) await Db.delAtt(a);
    delete Db.idx.notes[id]; const sh = U.hash16(id); delete Db.fts[sh][id]; dirtyFts.add(sh); idxDirty = true; pending.delete(id);
    await kv.set(`n_${id}_a`, null).catch(() => {}); await kv.set(`n_${id}_b`, null).catch(() => {}); await kv.set('t_' + id, null).catch(() => {});
  };

  // ---------- attachments ----------
  const CH = 900000;
  Db.putAtt = async (id, bytes, meta, enc) => {
    let data = bytes, em = null;
    if (enc) { const r = await N.crypto.encBytes(enc, bytes); data = r.ct; em = r.iv; }
    const s = U.b64(data); const n = Math.max(1, Math.ceil(s.length / CH));
    for (let i = 0; i < n; i++) await kv.set(`a_${id}_${i}`, s.slice(i * CH, (i + 1) * CH));
    await kv.set('a_' + id, { name: meta.name, type: meta.type, size: bytes.length, n, iv: em });
    await Db.ensureMarker();
  };
  Db.attMeta = (id) => kv.get('a_' + id);
  Db.getAtt = async (id, key) => {
    const m = await kv.get('a_' + id); if (!m || !m.n) return null;
    const parts = []; for (let i = 0; i < m.n; i++) { const p = await kv.get(`a_${id}_${i}`); if (typeof p !== 'string') return null; parts.push(p); }
    let bytes = U.unb64(parts.join(''));
    if (m.iv) { if (!key) return { meta: m, locked: true }; bytes = await N.crypto.decBytes(key, m.iv, bytes); }
    return { meta: m, bytes };
  };
  Db.getAttRaw = async (id) => { const m = await kv.get('a_' + id); if (!m || !m.n) return null; const parts = []; for (let i = 0; i < m.n; i++) { const p = await kv.get(`a_${id}_${i}`); if (typeof p !== 'string') return null; parts.push(p); } return { meta: m, bytes: U.unb64(parts.join('')) }; };
  Db.putAttRaw = async (id, bytes, meta) => { const s = U.b64(bytes); const n = Math.max(1, Math.ceil(s.length / CH)); for (let i = 0; i < n; i++) await kv.set(`a_${id}_${i}`, s.slice(i * CH, (i + 1) * CH)); await kv.set('a_' + id, { name: meta.name, type: meta.type, size: meta.size, n, iv: meta.iv || null }); await Db.ensureMarker(); };
  Db.delAtt = async (id) => {
    const m = await kv.get('a_' + id).catch(() => null); if (!m) return;
    for (let i = 0; i < (m.n || 0); i++) await kv.set(`a_${id}_${i}`, null).catch(() => {});
    await kv.set('a_' + id, null).catch(() => {});
  };
  Db.getThumb = (id) => kv.get('t_' + id);
  Db.setThumb = (id, url) => kv.set('t_' + id, url);
})();
