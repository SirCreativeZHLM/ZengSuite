/* File formats: native .zkey (zip with deck.json + media/), PDF (print CSS), image + HTML export. */
(() => {
  const K = window.K;
  const extFor = (type, name) => { const m = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }; return m[type] || (name && name.includes('.') ? name.split('.').pop() : 'bin'); };
  K.zkeySave = (deck) => {
    const files = {}; const media = {};
    for (const id in deck.media) { const m = deck.media[id]; const path = `media/${id}.${extFor(m.type, m.name)}`; files[path] = [m.data, { level: 0 }]; media[id] = { name: m.name, type: m.type, w: m.w, h: m.h, file: path }; }
    const j = { format: 'zengkeynote', version: 1, size: deck.size, theme: deck.theme, layouts: deck.layouts, slides: deck.slides, opts: deck.opts, media };
    const out = { 'deck.json': [fflate.strToU8(JSON.stringify(j)), { level: 6 }], ...files };
    return fflate.zipSync(out, { level: 6 });
  };
  K.zkeyLoad = (bytes) => {
    let z; try { z = fflate.unzipSync(bytes); } catch { throw new Error('This file is not a valid .zkey archive.'); }
    if (!z['deck.json']) throw new Error('The archive has no deck.json.'); const j = JSON.parse(fflate.strFromU8(z['deck.json']));
    if (j.format !== 'zengkeynote') throw new Error('This is not a ZengKeynote presentation.');
    const deck = { v: j.version, size: j.size, theme: j.theme, layouts: j.layouts, slides: j.slides, opts: j.opts || {}, media: {} };
    for (const id in j.media || {}) { const m = j.media[id]; const data = z[m.file]; if (data) deck.media[id] = { id, name: m.name, type: m.type, w: m.w, h: m.h, data, url: null }; }
    return deck;
  };
  // --- PDF: one slide per page via print CSS ---
  K.exportPDF = async (deck) => {
    const root = document.getElementById('print-root'); root.replaceChildren(); const W = deck.size.w, H = deck.size.h;
    const style = document.createElement('style'); style.id = 'print-page-style'; style.textContent = `@page { size: ${W}px ${H}px; margin: 0; }`; document.head.append(style);
    deck.slides.forEach((s, i) => { if (s.skip) return; const pg = document.createElement('div'); pg.className = 'pg'; pg.style.cssText = `width:${W}px;height:${H}px`; const ks = K.renderSlide(deck, s, { index: i }); pg.append(ks); root.append(pg); });
    root.querySelectorAll('video,audio').forEach((m) => m.remove()); await new Promise((r) => requestAnimationFrame(() => r())); K.fit(root); await new Promise((r) => setTimeout(r, 200));
    const done = () => { root.replaceChildren(); style.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); zeng.print(); setTimeout(() => { if (document.getElementById('print-page-style')) done(); }, 600000);
  };
})();
