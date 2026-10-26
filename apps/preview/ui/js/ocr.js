/* Offline OCR (English) with the vendored Tesseract.js (Apache-2.0) + LSTM wasm core. Loaded only when used. */
'use strict';
P.ocr = { worker: null, loading: null };
P.ocr.get = (progress) => {
  if (P.ocr.worker) return Promise.resolve(P.ocr.worker);
  if (P.ocr.loading) return P.ocr.loading;
  P.ocr.loading = (async () => {
    const base = new URL('/vendor/ocr', location.href).href;
    if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + '/tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('OCR files are missing')); document.head.append(s); });
    const opts = { workerPath: base + '/worker.min.js', corePath: base + '/tesseract-core-lstm.js', langPath: base, gzip: true, cacheMethod: 'none', logger: (m) => progress && progress(m) };
    let w; try { w = await Promise.race([Tesseract.createWorker('eng', 1, { ...opts, workerBlobURL: false }), sleep(20000).then(() => { throw new Error('timeout'); })]); } catch (e) { console.warn('OCR direct worker failed, retrying via blob', e); w = await Tesseract.createWorker('eng', 1, { ...opts, workerBlobURL: true }); }
    P.ocr.worker = w; return w;
  })();
  P.ocr.loading.catch(() => (P.ocr.loading = null));
  return P.ocr.loading;
};
P.ocr.words = async (canvas, progress) => {
  const w = await P.ocr.get(progress); const { data } = await w.recognize(canvas, {}, { blocks: true }); const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) if (wd.text && wd.text.trim()) out.push({ text: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, conf: wd.confidence });
  return { words: out, text: data.text };
};
// invisible text layer so the scan is searchable / selectable
Scan.ocrPage = async (out, page, canvas, pw, ph) => {
  if (!Scan.opts.ocr) return; const font = await out.embedFont(PDFLib.StandardFonts.Helvetica); const { words } = await P.ocr.words(canvas, Scan.ocrProgress); const sx = pw / canvas.width, sy = ph / canvas.height;
  for (const w of words) { if (w.conf < 30) continue; let t = w.text; try { font.encodeText(t); } catch { t = t.replace(/[^\x20-\x7e]/g, ''); if (!t) continue; } const h = (w.y1 - w.y0) * sy; const size = Math.max(4, h * 0.82); const targetW = (w.x1 - w.x0) * sx; const natural = font.widthOfTextAtSize(t, size) || 1; page.drawText(t, { x: w.x0 * sx, y: ph - w.y1 * sy + h * 0.2, size: size * Math.min(1.6, Math.max(0.5, targetW / natural)), font, opacity: 0 }); }
};
