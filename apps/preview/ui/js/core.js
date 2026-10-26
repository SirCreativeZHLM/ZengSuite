/* ZengLook core: shared state, helpers, undo history. Classic script; everything hangs off the global P. */
'use strict';
const P = (window.P = {
  mode: null,            // 'pdf' | 'image' | null
  tool: 'select',
  style: { color: '#ffd23f', stroke: '#ff6b6b', fill: null, width: 3, opacity: 1, size: 16, font: 'sans', textColor: '#1d1d1f', dash: 0 },
  selId: null,
  selPage: null,
  author: 'ZengLook',
  PAL: ['#ffd23f', '#7bd88f', '#2ec4b6', '#4d8dff', '#9b5de5', '#f15bb5', '#ff6b6b', '#ff8a3d', '#222831', '#ffffff'],
  hooks: {},             // filled by modules: snap, restore, refreshAll...
});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (...a) => zk.el(...a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => zk.uid() + zk.uid().slice(0, 3);
const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB');
const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
const baseName = (n) => n.replace(/\.[^.]+$/, '');
const PDF_EXTS = ['pdf'];
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'avif', 'ico'];
const ALL_EXTS = [...PDF_EXTS, ...IMG_EXTS];

// extra icons used only here (Lucide-style 24px strokes)
Object.assign(window.ZI || (window.ZI = {}), {
  'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  'redact': '<rect x="3" y="7" width="18" height="10" rx="1.5" fill="currentColor"/>',
  'line-diag': '<path d="M5 19 19 5"/>',
  'two-up': '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>',
  'one-up': '<rect x="6" y="4" width="12" height="16" rx="1"/>',
  'scroll-up': '<rect x="6" y="2" width="12" height="9" rx="1"/><rect x="6" y="13" width="12" height="9" rx="1"/>',
  'text-box': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M12 10v5"/>',
  'note': '<path d="M4 4h16v12l-5 5H4z"/><path d="M15 21v-5h5"/>',
  'invert': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  'sign': '<path d="M3 17c3-6 5-9 7-9 2 0 1 5 0 7s1 2 3-1 3-3 4-1 2 1 4-1"/><path d="M3 21h18"/>',
  'rot-l': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'loupe': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="M8 11h6M11 8v6"/>',
  'adjust': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/>',
  'exif': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
});

// ---------- undo / redo (snapshot based; modules provide P.hooks.snap / restore) ----------
const H = (P.H = { stack: [], i: -1, busy: false });
P.resetHistory = () => { H.stack = []; H.i = -1; P.pushHistory(true); };
P.pushHistory = (initial) => {
  if (H.busy) return;
  const s = P.hooks.snap ? P.hooks.snap() : null;
  H.stack.length = H.i + 1; H.stack.push(s); if (H.stack.length > (P.maxHist || 80)) H.stack.shift(); H.i = H.stack.length - 1;
  if (!initial) { P.doc && P.doc.markDirty(); }
  P.onHistory && P.onHistory();
};
P.undo = async () => { if (H.i <= 0) return; H.busy = true; H.i--; try { await P.hooks.restore(H.stack[H.i]); } finally { H.busy = false; } P.doc.markDirty(); P.onHistory && P.onHistory(); };
P.redo = async () => { if (H.i >= H.stack.length - 1) return; H.busy = true; H.i++; try { await P.hooks.restore(H.stack[H.i]); } finally { H.busy = false; } P.doc.markDirty(); P.onHistory && P.onHistory(); };
P.canUndo = () => H.i > 0; P.canRedo = () => H.i < H.stack.length - 1;

// ---------- bytes / data-url helpers ----------
const dataUrlToBytes = (u) => { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const canvasBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), type, q));
const hexToRgb = (h) => { h = (h || '#000000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb01 = (h) => hexToRgb(h).map((v) => +(v / 255).toFixed(4));
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const freeCanvas = (c) => { if (c) { c.width = c.height = 0; } };
const asciiJson = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const pad2 = (n) => String(n).padStart(2, '0');
const pdfDate = (d = new Date()) => `D:${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
const wait = async (title, fn) => { // modal-free progress toast helper
  const t = el('.zk-toast', { role: 'status' }, title + '…'); document.body.append(t);
  try { return await fn((txt) => (t.textContent = txt)); } finally { t.remove(); }
};
// Progress sheet: returns {set(text, frac), close()}
P.progress = (title) => {
  const bar = el('div', { style: { height: '4px', borderRadius: '2px', background: 'var(--fill-2)', overflow: 'hidden' } }, el('div', { style: { height: '100%', width: '0%', background: 'var(--accent)', transition: 'width .15s' } }));
  const msg = el('p', ''); let sheet;
  const wrap = el('div.zk-scrim', { style: { zIndex: 950 } }, sheet = el('.zk-sheet', { style: { width: '320px' } }, el('.body', el('h2', title), msg, bar)));
  document.body.append(wrap);
  return { set(t, f) { if (t != null) msg.textContent = t; if (f != null) bar.firstChild.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; }, close() { wrap.remove(); } };
};
