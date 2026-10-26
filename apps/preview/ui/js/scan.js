/* Clean Scan: photo/image of a page -> clean PDF page. Edge detection, perspective warp, deskew, shadow removal,
   paper-white / ink-black modes, multi-page batching. Pure canvas + typed-array code, fully offline. */
'use strict';
const Scan = (P.Scan = { pages: [], cur: 0, opts: { mode: 'paper', shadow: true, deskew: true, strength: 50 }, on: false });
const MAXW = 3200;

// ---------- image helpers ----------
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
Scan.toWork = async (blobOrBitmap) => { const bmp = blobOrBitmap instanceof Blob ? await createImageBitmap(blobOrBitmap) : blobOrBitmap; const k = Math.min(1, MAXW / Math.max(bmp.width, bmp.height)); const c = mkCanvas(bmp.width * k, bmp.height * k); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close(); return c; };
const smallGray = (src, maxSide) => { const k = Math.min(1, maxSide / Math.max(src.width, src.height)); const w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k)); const c = mkCanvas(w, h); const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h); for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = lum(d, i); freeCanvas(c); return { g, w, h, k }; };
const boxBlur = (g, w, h, r, passes = 1) => { let a = g, b = new Float32Array(g.length); for (let p = 0; p < passes; p++) { // horizontal
    for (let y = 0; y < h; y++) { let sum = 0, cnt = 0; const o = y * w; for (let x = -r; x <= r; x++) { const xx = clamp(x, 0, w - 1); sum += a[o + xx]; cnt++; } for (let x = 0; x < w; x++) { b[o + x] = sum / cnt; const add = clamp(x + r + 1, 0, w - 1), rem = clamp(x - r, 0, w - 1); sum += a[o + add] - a[o + rem]; } }
    const t = a === g ? new Float32Array(g.length) : a; a = b; b = t; // vertical
    for (let x = 0; x < w; x++) { let sum = 0, cnt = 0; for (let y = -r; y <= r; y++) { sum += a[clamp(y, 0, h - 1) * w + x]; cnt++; } for (let y = 0; y < h; y++) { b[y * w + x] = sum / cnt; const add = clamp(y + r + 1, 0, h - 1), rem = clamp(y - r, 0, h - 1); sum += a[add * w + x] - a[rem * w + x]; } }
    const t2 = a; a = b; b = t2 === g ? new Float32Array(g.length) : t2; }
  return a; };
const otsu = (g) => { const hist = new Float64Array(256); for (let i = 0; i < g.length; i++) hist[clamp(Math.round(g[i]), 0, 255)]++; const tot = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, th = 128; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } } return th; };

// ---------- edge detection ----------
const convexHull = (pts) => { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); };
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
const orderCorners = (pts) => { const s = pts.map((p) => p[0] + p[1]), d = pts.map((p) => p[0] - p[1]); return [pts[s.indexOf(Math.min(...s))], pts[d.indexOf(Math.max(...d))], pts[s.indexOf(Math.max(...s))], pts[d.indexOf(Math.min(...d))]]; }; // TL TR BR BL
Scan.defaultCorners = (w, h, inset = 0.03) => [[w * inset, h * inset], [w * (1 - inset), h * inset], [w * (1 - inset), h * (1 - inset)], [w * inset, h * (1 - inset)]];
Scan.detect = (src) => {
  const { g: g0, w, h, k } = smallGray(src, 320); const g = boxBlur(g0, w, h, 3, 2); const fallback = { corners: Scan.defaultCorners(src.width, src.height), found: false };
  const th = otsu(g); let best = null;
  for (const pol of [1, -1]) {
    const mask = new Uint8Array(w * h); for (let i = 0; i < mask.length; i++) mask[i] = (pol > 0 ? g[i] > th : g[i] <= th) ? 1 : 0;
    const label = new Int32Array(w * h); const stack = []; let n = 0;
    for (let s = 0; s < mask.length; s++) { if (!mask[s] || label[s]) continue; n++; let area = 0, border = 0, minx = w, maxx = 0, miny = h, maxy = 0; stack.push(s); label[s] = n; const pix = [];
      while (stack.length) { const p = stack.pop(); area++; const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++; if (area <= 200000) pix.push(p); if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = n; stack.push(p - 1); } if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = n; stack.push(p + 1); } if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = n; stack.push(p - w); } if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = n; stack.push(p + w); } }
      const frac = area / (w * h); if (frac < 0.12 || frac > 0.97) continue;
      // boundary points only (pixels with a background neighbour) for the hull
      const bpts = []; for (const p of pix) { const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) bpts.push([x, y]); }
      if (bpts.length < 8) continue; const hull = convexHull(bpts); const solidity = area / Math.max(1, polyArea(hull)); const touching = border / (2 * (w + h)); let score = frac * solidity * solidity * (1 - Math.min(0.7, touching * 6));
      if (!best || score > best.score) best = { score, hull, frac, solidity }; }
  }
  if (!best || best.solidity < 0.7) return fallback;
  let c = orderCorners(best.hull).map(([x, y]) => [x / k, y / k]); // back to source pixels
  const a = polyArea(c) / (src.width * src.height); if (a < 0.12) return fallback;
  // pull corners a hair outward (blur eats the edge)
  const cx = c.reduce((s, p) => s + p[0], 0) / 4, cy = c.reduce((s, p) => s + p[1], 0) / 4; c = c.map(([x, y]) => [clamp(x + (x - cx) * 0.008, 0, src.width - 1), clamp(y + (y - cy) * 0.008, 0, src.height - 1)]);
  return { corners: c, found: true, confidence: best.solidity };
};

// ---------- perspective warp ----------
const solve = (A, b) => { const n = b.length; for (let i = 0; i < n; i++) { let m = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } } const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; } return x; };
const homography = (dst, src) => { // maps dst (u,v) -> src (x,y)
  const A = [], b = []; for (let i = 0; i < 4; i++) { const [u, v] = dst[i], [x, y] = src[i]; A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x); A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y); } return solve(A, b); };
Scan.warp = (src, corners, maxSide = 2400) => {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); const [tl, tr, br, bl] = corners; let W = (d(tl, tr) + d(bl, br)) / 2, H = (d(tl, bl) + d(tr, br)) / 2; const k = Math.min(1, maxSide / Math.max(W, H)); W = Math.max(16, Math.round(W * k)); H = Math.max(16, Math.round(H * k));
  const hm = homography([[0, 0], [W, 0], [W, H], [0, H]], corners); const sx = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height); const sd = sx.data, sw = src.width, sh = src.height;
  const out = mkCanvas(W, H); const ox = out.getContext('2d'); const od = ox.createImageData(W, H); const o = od.data; const [a, b, c, dd, e, f, g, hh] = hm;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { const z = g * u + hh * v + 1; const x = (a * u + b * v + c) / z, y = (dd * u + e * v + f) / z; const i = (v * W + u) * 4; if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) { o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = 255; continue; } const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0; const p = (y0 * sw + x0) * 4, q = p + sw * 4; for (let ch = 0; ch < 3; ch++) o[i + ch] = (sd[p + ch] * (1 - fx) + sd[p + 4 + ch] * fx) * (1 - fy) + (sd[q + ch] * (1 - fx) + sd[q + 4 + ch] * fx) * fy; o[i + 3] = 255; }
  ox.putImageData(od, 0, 0); return out;
};

// ---------- deskew ----------
Scan.skewAngle = (canvas) => {
  const { g, w, h } = smallGray(canvas, 700); const th = Math.min(otsu(g), 200) * 0.92; const pts = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] < th) pts.push(x, y); const n = pts.length / 2; if (n < 300) return 0;
  const step = Math.max(1, Math.floor(n / 40000)); const score = (deg) => { const r = (deg * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r); const bins = new Float64Array(h * 2 + 2 * w + 8); const off = w + 4; for (let i = 0; i < n; i += step) { const x = pts[2 * i], y = pts[2 * i + 1]; bins[Math.round(y * c - x * s) + off | 0]++; } let sc = 0; for (let i = 0; i < bins.length; i++) sc += bins[i] * bins[i]; return sc; };
  let best = 0, bs = -1; for (let a = -8; a <= 8.001; a += 0.25) { const s = score(a); if (s > bs) { bs = s; best = a; } } for (let a = best - 0.25; a <= best + 0.251; a += 0.05) { const s = score(a); if (s > bs) { bs = s; best = a; } }
  const s0 = score(0); if (bs / s0 < 1.015 || Math.abs(best) < 0.2) return 0; return best;
};
Scan.rotate = (c, deg) => { const r = (deg * Math.PI) / 180; const out = mkCanvas(c.width, c.height); const x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height); x.translate(c.width / 2, c.height / 2); x.rotate(r); x.imageSmoothingQuality = 'high'; x.drawImage(c, -c.width / 2, -c.height / 2); return out; };

// ---------- shadow removal + modes ----------
Scan.background = (c) => { // smooth estimate of "paper" colour per pixel, text removed by a max filter
  const s = Math.max(4, Math.round(Math.max(c.width, c.height) / 220)); const w = Math.ceil(c.width / s), h = Math.ceil(c.height / s); const t = mkCanvas(w, h); const tx = t.getContext('2d', { willReadFrequently: true }); tx.imageSmoothingQuality = 'high'; tx.drawImage(c, 0, 0, w, h); const id = tx.getImageData(0, 0, w, h); const d = id.data; const R = 3;
  for (let ch = 0; ch < 3; ch++) { let p = new Float32Array(w * h); for (let i = 0; i < p.length; i++) p[i] = d[i * 4 + ch]; // dilate (max) separable
    const tmp = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = -R; k <= R; k++) { const v = p[y * w + clamp(x + k, 0, w - 1)]; if (v > m) m = v; } tmp[y * w + x] = m; } for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = -R; k <= R; k++) { const v = tmp[clamp(y + k, 0, h - 1) * w + x]; if (v > m) m = v; } p[y * w + x] = m; }
    p = boxBlur(p, w, h, 3, 2); for (let i = 0; i < p.length; i++) d[i * 4 + ch] = p[i]; }
  tx.putImageData(id, 0, 0); const out = mkCanvas(c.width, c.height); const ox = out.getContext('2d'); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.drawImage(t, 0, 0, c.width, c.height); freeCanvas(t); return out;
};
Scan.finish = (warped, opts) => {
  let c = warped; const mode = opts.mode; const x = c.getContext('2d', { willReadFrequently: true }); const id = x.getImageData(0, 0, c.width, c.height); const d = id.data;
  const needNorm = opts.shadow || mode !== 'color'; let bd = null;
  if (needNorm) { const bg = Scan.background(c); bd = bg.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; freeCanvas(bg); }
  const st = opts.strength / 100; const T = 255 * (0.66 + st * 0.26); // ink threshold, lower strength = only dark ink
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (needNorm) { const br = Math.max(24, bd[i]), bgc = Math.max(24, bd[i + 1]), bb = Math.max(24, bd[i + 2]); const m = Math.max(br, bgc, bb); /* keep paper tint neutral: divide by a common luminance-ish bg */ const L = 0.299 * br + 0.587 * bgc + 0.114 * bb; if (mode === 'color') { r = (r * 255) / br; g = (g * 255) / bgc; b = (b * 255) / bb; } else { const gy = lum(d, i); const n = (gy * 255) / Math.max(24, L); r = g = b = n; } }
    if (mode === 'paper') { r = lev(r, st); g = lev(g, st); b = lev(b, st); }
    else if (mode === 'gray') { const v = lev(r, st); r = g = b = v; }
    else if (mode === 'ink') { const v = r; const o = v >= T + 14 ? 255 : v <= T - 40 ? 0 : 255 * ((v - (T - 40)) / 54); r = g = b = o; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  x.putImageData(id, 0, 0); return c;
};
const lev = (v, st) => { const bp = 8 + st * 40, wp = 255 - (1 - st) * 10; return clamp(((v - bp) / (wp - bp)) * 255, 0, 255); };
Scan.process = (page, maxSide = 2400) => {
  const o = Scan.opts; let w = Scan.warp(page.src, page.corners, maxSide); let angle = 0;
  if (o.deskew) { const gray = o.shadow || o.mode !== 'color' ? null : w; angle = Scan.skewAngle(w); }
  const out = Scan.finish(w, o);
  if (angle) { const r = Scan.rotate(out, -angle); freeCanvas(out); page.angle = angle; return r; } page.angle = 0; return out;
};
