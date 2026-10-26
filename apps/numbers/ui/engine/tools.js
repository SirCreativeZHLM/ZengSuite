/* ZengNumbers data tools: autofill, sort, filter, pivot, goal seek, text-to-columns, duplicates, validation,
   find/replace, selection stats, auto-fit, merges, names, tables. Pure engine logic (no DOM).
   Mutations go through wb.put / setInput / mergeStyle / setProp / mod (journaled); the UI wraps calls in wb.tx(). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const FM = ZN.formula; const F = ZN.F; const E = ZN.E; const D = ZN.date; const { ZErr, Range, MAXR, MAXC } = ZN; const isErr = F.isErr;
  const TL = ZN.tools = {};

  // ---------- shared helpers ----------
  const norm = (r) => ({ r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) });
  // run fn inside a transaction only when the caller did not open one (UI normally wraps calls in wb.tx)
  const batch = (wb, fn) => (wb.depth > 0 ? fn() : wb.tx('tools', fn));
  const styleOf = (wb, sh, r, c) => wb.style(sh.styleId(r, c));
  const round15 = (x) => (typeof x === 'number' && isFinite(x) ? parseFloat(x.toPrecision(15)) : x);
  const NUMRE = F.NUMRE;
  const typeOf = (v) => (v == null ? 4 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  function parseTyped(text) { // typed text -> number | null (numbers, dates, times, percents via ZN.parseValue when present)
    if (typeof text === 'number') return text; if (typeof text !== 'string') return null; const t = text.trim(); if (t === '') return null;
    if (NUMRE.test(t)) return parseFloat(t);
    if (ZN.parseValue) { try { const p = ZN.parseValue(t); if (p && typeof p.v === 'number') return p.v; } catch (e) { /* ignore */ } }
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return D.fromYMD(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t); if (m) return (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400;
    return null;
  }
  // displayed text of a cell (formatted through ZN.fmt when available)
  function displayText(wb, sh, r, c, cell) {
    if (cell === undefined) cell = sh.getCell(r, c); const v = cell ? cell.v : undefined; if (v == null) return '';
    if (typeof v === 'string') return v;
    if (isErr(v)) return v.code; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') {
      const s = cell.s !== undefined ? cell.s : sh.styleId(r, c); const nf = s ? wb.style(s).nf : undefined;
      if (nf && nf !== 'General' && ZN.fmt && typeof ZN.fmt.format === 'function') { try { const t = ZN.fmt.format(v, nf); if (typeof t === 'string') return t; if (t && typeof t.text === 'string') return t.text; } catch (e) { /* fall through */ } }
      return ZN.numToStr(v);
    }
    return String(v);
  }
  TL.displayText = displayText;
  const isDateNf = (nf) => { if (!nf || nf === 'General' || nf === '@') return false; if (ZN.fmt && typeof ZN.fmt.isDate === 'function') { try { return !!ZN.fmt.isDate(nf); } catch (e) { /* ignore */ } } const s = nf.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''); return /[yd]/i.test(s) || (/m/i.test(s) && !/[hs]/i.test(s)); };
  const natCmp = (a, b) => { // labels: blank last; number < string < boolean; strings case-insensitive
    const ta = typeOf(a), tb = typeOf(b); if (ta === 4 || tb === 4) return ta === tb ? 0 : ta === 4 ? 1 : -1; if (ta !== tb) return ta - tb;
    if (ta === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; } if (ta === 3) return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const valKey = (v) => (v == null || v === '' ? '\u0000' : typeof v === 'number' ? 'n' + v : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'boolean' ? 'b' + v : 'e' + v.code);
  const inRange = (R, r, c) => r >= R.r1 && r <= R.r2 && c >= R.c1 && c <= R.c2;
  const SEP = '\u0001';

  // moves / clears whole rows (or columns) of cells, keeping styles; same-line relative refs are re-pointed
  function relocate(sh, old, from, to, byCols) {
    if (!old) return undefined; const nc = {};
    for (const k of Object.keys(old)) { if (k === 'f' || k === 'ast' || k === 'deps' || k === 'spill' || k === 'sp' || k === 'bad') continue; nc[k] = old[k]; }
    if (old.sp !== undefined) { delete nc.v; nc.v = old.v; }
    if (old.f !== undefined) {
      nc.v = undefined; nc.f = from === to ? old.f : FM.rewrite(old.f, (x) => {
        if (x.sheet != null && x.sheet.toLowerCase() !== sh.name.toLowerCase()) return x;
        if (!byCols) { if (x.kind !== 'cols' && x.kind !== 'rows' && x.r1 === from && x.r2 === from && !x.ar1 && !x.ar2) { x.r1 = x.r2 = to; } }
        else if (x.kind !== 'cols' && x.kind !== 'rows' && x.c1 === from && x.c2 === from && !x.ac1 && !x.ac2) { x.c1 = x.c2 = to; }
        return x;
      });
    }
    return nc.v === undefined && nc.f === undefined && nc.s === undefined ? undefined : nc;
  }
  // map: array of {from: srcLine|-1(clear), to: dstLine}; line = row (byCols false) or column; span = other-axis [a, b]
  function moveLines(wb, sh, map, a, b, byCols) {
    const snap = new Map(); for (const m of map) if (m.from >= 0 && m.from !== m.to && !snap.has(m.from)) { const arr = []; for (let k = a; k <= b; k++) arr.push(byCols ? sh.getCell(k, m.from) : sh.getCell(m.from, k)); snap.set(m.from, arr); }
    let moved = 0;
    for (const m of map) {
      if (m.from === m.to) continue; const src = m.from >= 0 ? snap.get(m.from) : null; moved++;
      for (let k = a; k <= b; k++) { const nc = src ? relocate(sh, src[k - a], m.from, m.to, byCols) : undefined; if (byCols) wb.put(sh, k, m.to, nc); else wb.put(sh, m.to, k, nc); }
    }
    return moved;
  }

  // =====================================================================================================
  // AUTOFILL
  // =====================================================================================================
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS3 = MONTHS.map((m) => m.slice(0, 3));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS3 = DAYS.map((m) => m.slice(0, 3));
  const LISTS = [MONTHS, MONTHS3, DAYS, DAYS3].map((l) => l.map((x) => x.toLowerCase()));
  const LISTS_ORIG = [MONTHS, MONTHS3, DAYS, DAYS3];
  const mod = (a, n) => ((a % n) + n) % n;
  function addMonths(serial, k) {
    const p = D.toYMD(Math.floor(serial)); if (!p) return serial; const t = p.y * 12 + (p.m - 1) + k; const y = Math.floor(t / 12), m = mod(t, 12) + 1;
    return D.fromYMD(y, m, Math.min(p.d, D.daysInMonth(y, m))) + (serial - Math.floor(serial));
  }
  const isBiz = (n) => { const w = D.weekday(Math.floor(n)); return w !== 0 && w !== 6; };
  function addBiz(n, k) { const s = k < 0 ? -1 : 1; let left = Math.abs(k), x = n; while (left > 0) { x += s; if (isBiz(x)) left--; } return x; }
  function dateStep(base, unit, step, k) { // k-th step after base
    if (unit === 'month') return addMonths(base, step * k); if (unit === 'year') return addMonths(base, 12 * step * k);
    if (unit === 'weekday') return addBiz(base, step * k); if (unit === 'week') return base + 7 * step * k; return base + step * k;
  }
  function detectDateUnit(vals) {
    const n = vals.length; const d = []; for (let i = 1; i < n; i++) d.push(vals[i] - vals[i - 1]);
    const same = d.every((x) => x === d[0]);
    // month / year pattern: same day-of-month, constant month delta
    const ymd = vals.map((v) => D.toYMD(Math.floor(v))); if (ymd.every((p) => p)) {
      const md = []; for (let i = 1; i < n; i++) md.push((ymd[i].y * 12 + ymd[i].m) - (ymd[i - 1].y * 12 + ymd[i - 1].m));
      if (md.every((x) => x === md[0]) && md[0] !== 0 && ymd.every((p) => p.d === ymd[0].d) && (!same || Math.abs(d[0]) >= 28)) { return md[0] % 12 === 0 ? { unit: 'year', step: md[0] / 12 } : { unit: 'month', step: md[0] }; }
    }
    if (same) { if (d[0] !== 0 && d[0] % 7 === 0 && false) return { unit: 'day', step: d[0] }; return { unit: 'day', step: d[0] }; }
    if (vals.every(isBiz)) { let ok = true; for (let i = 1; i < n; i++) if (addBiz(vals[i - 1], 1) !== vals[i]) ok = false; if (ok) return { unit: 'weekday', step: 1 }; }
    const avg = (vals[n - 1] - vals[0]) / (n - 1); return { unit: 'day', step: avg };
  }
  function linearStep(vals) {
    const n = vals.length; const d0 = vals[1] - vals[0]; let eqd = true; for (let i = 2; i < n; i++) if (Math.abs(vals[i] - vals[i - 1] - d0) > 1e-12 * Math.max(1, Math.abs(d0), Math.abs(vals[i]))) eqd = false;
    if (eqd) return { step: d0, from: vals[n - 1], k0: 0 };
    let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += i + 1; sy += vals[i]; } const mx = sx / n, my = sy / n; let nu = 0, de = 0;
    for (let i = 0; i < n; i++) { nu += (i + 1 - mx) * (vals[i] - my); de += (i + 1 - mx) * (i + 1 - mx); } const b = nu / de, a = my - b * mx;
    return { step: b, from: a + b * (n + 1), k0: 1 };
  }
  // produce `count` new values continuing the series held by `cells`; null => not a series (caller copies the cycle)
  function seriesGen(wb, sh, cells, count, opts) {
    const n = cells.length; if (!n) return null; const forced = opts.mode === 'series'; const vals = cells.map((c) => (c ? c.v : null));
    if (cells.some((c) => c && c.f !== undefined)) return null; if (vals.some((v) => v == null || isErr(v))) return null;
    const out = new Array(count);
    if (vals.every((v) => typeof v === 'number')) {
      if (opts.type === 'growth') {
        let ratio; if (opts.step != null) ratio = opts.step; else if (n === 1) ratio = 1; else { if (vals.some((v) => v <= 0) || vals[0] === 0) return null; ratio = n === 2 ? vals[1] / vals[0] : Math.pow(vals[n - 1] / vals[0], 1 / (n - 1)); }
        for (let k = 1; k <= count; k++) out[k - 1] = round15(vals[n - 1] * Math.pow(ratio, k)); return out;
      }
      const dateFmt = cells.every((c) => isDateNf(wb.style(c.s || 0).nf)) && vals.every((v) => Number.isInteger(v));
      if (dateFmt || opts.dateUnit) {
        if (!dateFmt && !forced) return null; let unit = opts.dateUnit || 'day', step = opts.step != null ? opts.step : 1;
        if (!opts.dateUnit && n > 1) { const u = detectDateUnit(vals); unit = u.unit; step = opts.step != null ? opts.step : u.step; }
        for (let k = 1; k <= count; k++) out[k - 1] = dateStep(vals[n - 1], unit, step, k); return out;
      }
      let step, from = vals[n - 1], k0 = 0;
      if (opts.step != null) step = opts.step; else if (n === 1) { if (!forced) return null; step = 1; } else { const l = linearStep(vals); step = l.step; from = l.from; k0 = l.k0; }
      for (let k = 0; k < count; k++) out[k] = round15(k0 ? from + step * k : from + step * (k + 1));
      return out;
    }
    if (vals.every((v) => typeof v === 'string')) {
      for (let li = 0; li < LISTS.length; li++) {
        const L = LISTS[li]; const idx = vals.map((v) => L.indexOf(v.trim().toLowerCase())); if (idx.some((i) => i < 0)) continue;
        let step = 1; if (n > 1) { step = mod(idx[1] - idx[0], L.length); for (let i = 2; i < n; i++) if (mod(idx[i] - idx[i - 1], L.length) !== step) return null; if (step === 0) return null; }
        const last = vals[n - 1]; const mode = last === last.toUpperCase() && last.length > 1 ? 'U' : last === last.toLowerCase() ? 'L' : 'C';
        for (let k = 1; k <= count; k++) { const w = LISTS_ORIG[li][mod(idx[n - 1] + step * k, L.length)]; out[k - 1] = mode === 'U' ? w.toUpperCase() : mode === 'L' ? w.toLowerCase() : w; }
        return out;
      }
      const re = /^([\s\S]*?)(\d+)(\D*)$/; const ms = vals.map((v) => re.exec(v)); if (ms.some((m) => !m)) return null;
      if (ms.some((m) => m[1] !== ms[0][1] || m[3] !== ms[0][3])) return null;
      const nums = ms.map((m) => parseInt(m[2], 10)); let step = 1;
      if (n > 1) { step = nums[1] - nums[0]; for (let i = 2; i < n; i++) if (nums[i] - nums[i - 1] !== step) return null; } else if (opts.step != null) step = opts.step;
      if (opts.step != null) step = opts.step; const w = ms[n - 1][2].length > 1 && ms[n - 1][2][0] === '0' ? ms[n - 1][2].length : 0;
      for (let k = 1; k <= count; k++) { const x = nums[n - 1] + step * k; let s = String(Math.abs(x)); if (w) while (s.length < w) s = '0' + s; out[k - 1] = ms[0][1] + (x < 0 ? '-' : '') + s + ms[0][3]; }
      return out;
    }
    return null;
  }
  // direction helpers
  function fillDirection(src, dst, opts) {
    if (opts && opts.direction) return opts.direction;
    const colsCover = dst.c1 <= src.c1 && dst.c2 >= src.c2, rowsCover = dst.r1 <= src.r1 && dst.r2 >= src.r2;
    if (colsCover && dst.r2 > src.r2) return 'down'; if (colsCover && dst.r1 < src.r1) return 'up';
    if (rowsCover && dst.c2 > src.c2) return 'right'; if (rowsCover && dst.c1 < src.c1) return 'left'; return null;
  }
  const cleanCell = (cell, over) => { const o = {}; if (cell) { if (cell.v !== undefined) o.v = cell.v; if (cell.f !== undefined) o.f = cell.f; if (cell.s !== undefined) o.s = cell.s; } Object.assign(o, over); for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return Object.keys(o).length ? o : undefined; };

  TL.autofill = function autofill(wb, sheet, src, dst, opts = {}) {
    src = norm(src); dst = norm(dst); const mode = opts.mode; const dir = fillDirection(src, dst, opts); if (!dir) return { filled: 0 };
    const vertical = dir === 'down' || dir === 'up'; const rev = dir === 'up' || dir === 'left';
    const count = dir === 'down' ? dst.r2 - src.r2 : dir === 'up' ? src.r1 - dst.r1 : dir === 'right' ? dst.c2 - src.c2 : src.c1 - dst.c1; if (count <= 0) return { filled: 0 };
    const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1; const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1; let filled = 0;
    return batch(wb, () => {
      for (let li = 0; li < lines; li++) {
        const pos = []; // source positions in order of travel
        for (let i = 0; i < len; i++) { const j = rev ? len - 1 - i : i; pos.push(vertical ? [src.r1 + j, src.c1 + li] : [src.r1 + li, src.c1 + j]); }
        const cells = pos.map(([r, c]) => sheet.getCell(r, c));
        const seq = mode === 'copy' || mode === 'formats' ? null : seriesGen(wb, sheet, cells, count, opts);
        for (let k = 0; k < count; k++) {
          const tr = vertical ? (dir === 'down' ? src.r2 + 1 + k : src.r1 - 1 - k) : src.r1 + li, tc = vertical ? src.c1 + li : (dir === 'right' ? src.c2 + 1 + k : src.c1 - 1 - k);
          const si = k % len; const sc = cells[si]; const [sr, scc] = pos[si]; const target = sheet.getCell(tr, tc); let nc;
          if (mode === 'formats') nc = cleanCell(target, { s: sc ? sc.s : undefined });
          else {
            let over = {}; if (seq) over = { v: seq[k], f: undefined }; else if (sc && sc.f !== undefined) over = { f: FM.translate(sc.f, tr - sr, tc - scc), v: undefined }; else over = { v: sc ? sc.v : undefined };
            if (mode === 'noformats') over.s = target ? target.s : undefined; else over.s = sc ? sc.s : undefined;
            nc = {}; if (over.v !== undefined && over.v !== null) nc.v = over.v; if (over.f !== undefined) nc.f = over.f; if (over.s !== undefined) nc.s = over.s;
            if (nc.v === undefined && nc.f === undefined && nc.s === undefined) nc = undefined; else if (nc.f !== undefined) delete nc.v; else if (nc.v === undefined) nc.v = undefined;
          }
          wb.put(sheet, tr, tc, nc); filled++;
        }
      }
      return { filled, direction: dir };
    });
  };
  // values a fill would produce (for a preview), without writing: returns array (length count) per source line
  TL.insertSeriesPreview = function (wb, sheet, src, count, opts = {}) {
    src = norm(src); const dir = opts.direction || 'down'; const vertical = dir === 'down' || dir === 'up'; const rev = dir === 'up' || dir === 'left'; const out = [];
    const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1; const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
    for (let li = 0; li < lines; li++) {
      const cells = []; for (let i = 0; i < len; i++) { const j = rev ? len - 1 - i : i; cells.push(vertical ? sheet.getCell(src.r1 + j, src.c1 + li) : sheet.getCell(src.r1 + li, src.c1 + j)); }
      const seq = opts.mode === 'copy' ? null : seriesGen(wb, sheet, cells, count, opts); const col = [];
      for (let k = 0; k < count; k++) { const sc = cells[k % len]; col.push(seq ? seq[k] : sc ? (sc.f !== undefined ? '=' + sc.f : sc.v) : null); } out.push(col);
    }
    return out;
  };
  // Fill > Series dialog: fills each line of `range` starting from its first cell
  TL.fillSeries = function fillSeries(wb, sheet, range, o = {}) {
    range = norm(range); const type = o.type || 'linear'; const byRows = !!o.byRows; let written = 0;
    return batch(wb, () => {
      const lines = byRows ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1, len = byRows ? range.c2 - range.c1 + 1 : range.r2 - range.r1 + 1;
      for (let li = 0; li < lines; li++) {
        const at = (i) => (byRows ? [range.r1 + li, range.c1 + i] : [range.r1 + i, range.c1 + li]);
        const [r0, c0] = at(0); const start = sheet.getCell(r0, c0); let v0 = start ? start.v : null; if (typeof v0 === 'string') { const p = parseTyped(v0); if (p != null) v0 = p; }
        if (typeof v0 !== 'number') continue;
        let step = o.step != null ? o.step : 1; const stop = o.stop; let unit = o.dateUnit || 'day';
        for (let i = 1; i < len; i++) {
          let v; if (type === 'growth') v = round15(v0 * Math.pow(step, i)); else if (type === 'date') v = dateStep(v0, unit, step, i); else v = round15(v0 + step * i);
          if (stop != null && typeof stop === 'number') { const up = type === 'growth' ? step > 1 : step > 0; if (up ? v > stop + 1e-12 : v < stop - 1e-12) break; }
          const [r, c] = at(i); const old = sheet.getCell(r, c); const s = old && old.s !== undefined ? old.s : start ? start.s : undefined;
          wb.put(sheet, r, c, s !== undefined ? { v, s } : { v }); written++;
        }
      }
      return { written };
    });
  };

  // =====================================================================================================
  // SORT
  // =====================================================================================================
  TL.sortRange = function sortRange(wb, sheet, range, keys, o = {}) {
    const R = norm(range); const byRows = !!o.byRows; // byRows: sort columns left-to-right (keys name rows)
    const first = (byRows ? R.c1 : R.r1) + (o.header ? 1 : 0), last = byRows ? R.c2 : R.r2; const n = last - first + 1; if (n < 2 || !keys || !keys.length) return { moved: 0, order: [] };
    const K = keys.length; const T = [], N = [], S = [], DIR = [], CS = [];
    for (let k = 0; k < K; k++) {
      const key = keys[k]; const by = key.by || 'value'; const line = byRows ? (key.row != null ? key.row : key.col) : key.col;
      const t = new Int8Array(n), nu = new Float64Array(n), st = new Array(n); const custom = key.custom ? key.custom.map((x) => String(x).toLowerCase()) : null;
      const want = key.color ? String(key.color).toLowerCase() : null;
      for (let i = 0; i < n; i++) {
        const r = byRows ? line : first + i, c = byRows ? first + i : line; const cell = sheet.getCell(r, c);
        if (by === 'color' || by === 'fontColor') { const stl = wb.style(cell && cell.s !== undefined ? cell.s : sheet.styleId(r, c)); const col = (by === 'color' ? stl.bg : stl.fc); const m = want ? (col ? String(col).toLowerCase() === want : want === 'none') : !!col; t[i] = 0; nu[i] = m ? 0 : 1; continue; }
        const v = cell && cell.v !== undefined ? cell.v : null;
        if (v === null) { t[i] = 4; continue; }
        if (typeof v === 'number') { t[i] = 0; nu[i] = v; } else if (typeof v === 'string') {
          const lo = v.toLowerCase(); if (custom) { const ix = custom.indexOf(lo); if (ix >= 0) { t[i] = -1; nu[i] = ix; continue; } } t[i] = 1; st[i] = key.caseSensitive ? v : lo; if (key.caseSensitive) CS[k] = true; if (key.caseSensitive) { nu[i] = 0; }
        } else if (typeof v === 'boolean') { t[i] = 2; nu[i] = v ? 1 : 0; } else { t[i] = 3; st[i] = v.code || String(v); }
      }
      T.push(t); N.push(nu); S.push(st); DIR.push(key.dir === 'desc' ? -1 : 1);
    }
    const sv = keys.map((k) => !!k.caseSensitive); const origs = [];
    const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    const cmp = (a, b) => {
      for (let k = 0; k < K; k++) {
        const ta = T[k][a], tb = T[k][b];
        if (ta === 4 || tb === 4) { if (ta === tb) continue; return ta === 4 ? 1 : -1; }
        if (ta !== tb) return DIR[k] * (ta - tb);
        if (ta === 1 || ta === 3) { let x = S[k][a], y = S[k][b]; if (ta === 1 && sv[k]) { const lx = x.toLowerCase(), ly = y.toLowerCase(); if (lx !== ly) return DIR[k] * (lx < ly ? -1 : 1); if (x !== y) return DIR[k] * (x > y ? -1 : 1); continue; } if (x !== y) return DIR[k] * (x < y ? -1 : 1); continue; }
        const x = N[k][a], y = N[k][b]; if (x !== y) return DIR[k] * (x < y ? -1 : 1);
      }
      return a - b;
    };
    idx.sort(cmp);
    return batch(wb, () => {
      const map = []; for (let i = 0; i < n; i++) if (idx[i] !== i) map.push({ from: first + idx[i], to: first + i });
      const moved = byRows ? moveLines(wb, sheet, map, R.r1, R.r2, true) : moveLines(wb, sheet, map, R.c1, R.c2, false);
      return { moved, order: idx.map((i) => first + i) };
    });
  };

  // =====================================================================================================
  // FILTER
  // =====================================================================================================
  function dateWindow(when, today) { // -> [lo, hi] inclusive serials, or fn
    const p = D.toYMD(today); const wd = D.weekday(today); const ws = today - wd; const y = p.y, m = p.m;
    const mStart = (yy, mm) => { const t = yy * 12 + (mm - 1); return D.fromYMD(Math.floor(t / 12), mod(t, 12) + 1, 1); };
    const mEnd = (yy, mm) => mStart(yy, mm + 1) - 1; const q = Math.floor((m - 1) / 3);
    switch (when) {
      case 'today': return [today, today]; case 'yesterday': return [today - 1, today - 1]; case 'tomorrow': return [today + 1, today + 1];
      case 'last7': return [today - 6, today];
      case 'thisWeek': case 'thisweek': return [ws, ws + 6]; case 'lastWeek': case 'lastweek': return [ws - 7, ws - 1]; case 'nextWeek': case 'nextweek': return [ws + 7, ws + 13];
      case 'thisMonth': case 'thismonth': return [mStart(y, m), mEnd(y, m)]; case 'lastMonth': case 'lastmonth': return [mStart(y, m - 1), mEnd(y, m - 1)]; case 'nextMonth': case 'nextmonth': return [mStart(y, m + 1), mEnd(y, m + 1)];
      case 'thisQuarter': case 'lastQuarter': case 'nextQuarter': { const off = when === 'thisQuarter' ? 0 : when === 'lastQuarter' ? -1 : 1; const sm = q * 3 + 1 + off * 3; return [mStart(y, sm), mEnd(y, sm + 2)]; }
      case 'thisYear': case 'thisyear': return [D.fromYMD(y, 1, 1), D.fromYMD(y, 12, 31)]; case 'lastYear': case 'lastyear': return [D.fromYMD(y - 1, 1, 1), D.fromYMD(y - 1, 12, 31)]; case 'nextYear': case 'nextyear': return [D.fromYMD(y + 1, 1, 1), D.fromYMD(y + 1, 12, 31)];
      case 'yearToDate': return [D.fromYMD(y, 1, 1), today];
    }
    return null;
  }
  function textMatcher(op, v) {
    const s = String(v == null ? '' : v); const wild = F.hasWild(s);
    const plain = (x) => x.toLowerCase();
    if (wild) { const re = F.wildRe(s); const sub = new RegExp(F.wildRe(s).source.replace(/^\^/, '').replace(/\$$/, ''), 'i'); const bw = new RegExp('^' + sub.source, 'i'), ew = new RegExp(sub.source + '$', 'i');
      return op === 'eq' ? (t) => re.test(t) : op === 'ne' ? (t) => !re.test(t) : op === 'contains' ? (t) => sub.test(t) : op === 'notContains' ? (t) => !sub.test(t) : op === 'begins' ? (t) => bw.test(t) : (t) => ew.test(t); }
    const l = plain(s);
    switch (op) { case 'eq': return (t) => plain(t) === l; case 'ne': return (t) => plain(t) !== l; case 'contains': return (t) => plain(t).includes(l); case 'notContains': return (t) => !plain(t).includes(l); case 'begins': return (t) => plain(t).startsWith(l); case 'ends': return (t) => plain(t).endsWith(l); }
    return () => true;
  }
  // builds predicate (r) => bool for one column; data rows rows[] used for top/avg statistics
  function buildPred(wb, sheet, crit, col, rows) {
    if (!crit) return () => true; const preds = [];
    if (crit.any) { const ps = crit.any.map((x) => buildPred(wb, sheet, x, col, rows)); preds.push((r) => ps.some((p) => p(r))); }
    if (crit.all) { const ps = crit.all.map((x) => buildPred(wb, sheet, x, col, rows)); preds.push((r) => ps.every((p) => p(r))); }
    if (crit.values || crit.blanks !== undefined) {
      const set = new Set(crit.values ? Array.from(crit.values, (x) => String(x)) : []); const blanks = !!crit.blanks; const lower = new Set(Array.from(set, (x) => x.toLowerCase()));
      preds.push((r) => { const cell = sheet.getCell(r, col); if (!cell || cell.v == null || cell.v === '') return blanks; const t = displayText(wb, sheet, r, col, cell); return set.has(t) || lower.has(t.toLowerCase()); });
    }
    if (crit.text) { const m = textMatcher(crit.text.op, crit.text.v); preds.push((r) => { const cell = sheet.getCell(r, col); const t = cell && cell.v != null ? displayText(wb, sheet, r, col, cell) : ''; if (t === '' && !(crit.text.op === 'ne' || crit.text.op === 'notContains')) return false; return m(t); }); }
    if (crit.num) {
      const { op, v, v2 } = crit.num; const a = typeof v === 'number' ? v : parseTyped(v), b = typeof v2 === 'number' ? v2 : parseTyped(v2);
      preds.push((r) => { const x = sheet.getValue(r, col); if (typeof x !== 'number') return op === 'ne';
        switch (op) { case 'gt': return x > a; case 'lt': return x < a; case 'ge': return x >= a; case 'le': return x <= a; case 'eq': return x === a; case 'ne': return x !== a; case 'between': return x >= Math.min(a, b) && x <= Math.max(a, b); } return true; });
    }
    if (crit.top) {
      const nums = []; for (const r of rows) { const x = sheet.getValue(r, col); if (typeof x === 'number') nums.push(x); }
      nums.sort((x, y) => (crit.top.bottom ? x - y : y - x)); let k = crit.top.pct ? Math.max(1, Math.floor(nums.length * crit.top.n / 100)) : crit.top.n; k = Math.min(k, nums.length);
      const th = k > 0 ? nums[k - 1] : null; preds.push((r) => { const x = sheet.getValue(r, col); return typeof x === 'number' && th !== null && (crit.top.bottom ? x <= th : x >= th); });
    }
    if (crit.aboveAvg !== undefined) {
      let s = 0, c = 0; for (const r of rows) { const x = sheet.getValue(r, col); if (typeof x === 'number') { s += x; c++; } } const avg = c ? s / c : 0; const above = !!crit.aboveAvg;
      preds.push((r) => { const x = sheet.getValue(r, col); return typeof x === 'number' && (above ? x > avg : x < avg); });
    }
    if (crit.date) {
      const today = crit.date.today != null ? crit.date.today : Math.floor(D.now()); const w = crit.date.when; let win = dateWindow(w, today); let test;
      if (win) test = (x) => x >= win[0] && x < win[1] + 1;
      else if (/^Q[1-4]$/i.test(w)) { const q = +w[1]; test = (x) => { const p = D.toYMD(Math.floor(x)); return p && Math.floor((p.m - 1) / 3) + 1 === q; }; }
      else if (/^M(1[0-2]|[1-9])$/i.test(w)) { const mm = +w.slice(1); test = (x) => { const p = D.toYMD(Math.floor(x)); return p && p.m === mm; }; }
      else test = () => true;
      preds.push((r) => { const x = sheet.getValue(r, col); return typeof x === 'number' && test(x); });
    }
    if (crit.color) {
      const bg = crit.color.bg, fc = crit.color.fc;
      preds.push((r) => { const cell = sheet.getCell(r, col); const st = wb.style(cell && cell.s !== undefined ? cell.s : sheet.styleId(r, col));
        const eqc = (a, b) => (b === 'none' || b == null ? !a : !!a && String(a).toLowerCase() === String(b).toLowerCase());
        return (bg === undefined || eqc(st.bg, bg)) && (fc === undefined || eqc(st.fc, fc)); });
    }
    if (!preds.length) return () => true;
    // any/all objects may carry the combination alone; everything else ANDs
    return (r) => { for (const p of preds) if (!p(r)) return false; return true; };
  }
  TL.filterRows = function filterRows(wb, sheet, range, header, criteriaByCol) {
    const R = norm(range); const start = R.r1 + (header ? 1 : 0); const rows = []; for (let r = start; r <= R.r2; r++) rows.push(r);
    const preds = []; for (const k of Object.keys(criteriaByCol || {})) { const col = +k; if (criteriaByCol[k]) preds.push(buildPred(wb, sheet, criteriaByCol[k], col, rows)); }
    const hidden = new Set(); if (preds.length) for (const r of rows) { for (const p of preds) if (!p(r)) { hidden.add(r); break; } }
    return { hidden, visible: rows.length - hidden.size };
  };
  TL.distinctValues = function distinctValues(wb, sheet, range, header, col, o = {}) {
    const R = norm(range); const start = R.r1 + (header ? 1 : 0); const m = new Map(); let blanks = 0;
    for (let r = start; r <= R.r2; r++) {
      const cell = sheet.getCell(r, col); if (!cell || cell.v == null || cell.v === '') { blanks++; continue; }
      const t = displayText(wb, sheet, r, col, cell); const k = t.toLowerCase(); const e = m.get(k); if (e) e.count++; else m.set(k, { text: t, count: 1, v: cell.v });
    }
    let out = Array.from(m.values()).sort((a, b) => natCmp(a.v, b.v) || (a.text < b.text ? -1 : 1));
    if (o.limit && out.length > o.limit) out = out.slice(0, o.limit);
    if (blanks) out.push({ text: '', count: blanks, v: null, blank: true });
    return out;
  };

  // =====================================================================================================
  // PIVOT
  // =====================================================================================================
  const AGG_NAME = { sum: 'Sum', count: 'Count', counta: 'Count', average: 'Average', min: 'Min', max: 'Max', product: 'Product', stdev: 'StdDev', var: 'Var', median: 'Median' };
  function aggregate(name, vals) { // vals: raw values of one field for the records of a bucket
    const nums = []; let ne = 0; for (const v of vals) { if (v == null || v === '') continue; ne++; if (typeof v === 'number') nums.push(v); }
    switch (name) {
      case 'count': return nums.length; case 'counta': return ne;
      case 'sum': { let s = 0; for (const x of nums) s += x; return s; }
      case 'product': { let s = 1; for (const x of nums) s *= x; return nums.length ? s : 0; }
      case 'average': { if (!nums.length) return E.DIV0; let s = 0; for (const x of nums) s += x; return s / nums.length; }
      case 'min': return nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : 0; case 'max': return nums.length ? nums.reduce((a, b) => (b > a ? b : a)) : 0;
      case 'median': { if (!nums.length) return E.NUM; const s = nums.slice().sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
      case 'stdev': case 'var': { if (nums.length < 2) return E.DIV0; let s = 0; for (const x of nums) s += x; const mu = s / nums.length; let q = 0; for (const x of nums) q += (x - mu) * (x - mu); const v = q / (nums.length - 1); return name === 'var' ? v : Math.sqrt(v); }
    }
    return E.VALUE;
  }
  TL.columnTitles = function columnTitles(wb, sheet, range, header) {
    const R = norm(range); const out = [];
    for (let c = R.c1; c <= R.c2; c++) { const t = header ? displayText(wb, sheet, R.r1, c) : ''; out.push(t !== '' ? t : 'Column ' + ZN.colName(c)); }
    return out;
  };
  TL.pivot = function pivot(wb, sheet, range, cfg) {
    const R = norm(range); const header = cfg.header !== false; const titles = TL.columnTitles(wb, sheet, R, header);
    const A = (i) => (cfg.absolute ? i : R.c1 + i); const rowF = (cfg.rows || []).map(A), colF = (cfg.cols || []).map(A);
    const vdefs = (cfg.values || []).map((v) => ({ col: A(v.col), agg: v.agg || 'sum', show: v.show || 'value', label: v.label, idx: v.col }));
    const gt = Object.assign({ rows: true, cols: true }, cfg.grandTotals || {}); const rl = rowF.length, cl = colF.length, V = Math.max(vdefs.length, 0);
    const titleOf = (abs) => titles[abs - R.c1] != null ? titles[abs - R.c1] : 'Column ' + ZN.colName(abs);
    vdefs.forEach((v) => { v.label = v.label || (AGG_NAME[v.agg] || v.agg) + ' of ' + titleOf(v.col); });
    // filters
    const filt = []; for (const k of Object.keys(cfg.filters || {})) { const abs = A(+k); const al = cfg.filters[k]; const keys = new Set(al.map((x) => valKey(x))); const texts = new Set(al.map((x) => String(x).toLowerCase())); filt.push([abs, keys, texts]); }
    // records
    const recs = []; const start = R.r1 + (header ? 1 : 0);
    for (let r = start; r <= R.r2; r++) {
      let ok = true; for (const [abs, keys, texts] of filt) { const cell = sheet.getCell(r, abs); const v = cell ? cell.v : null; if (!(keys.has(valKey(v)) || texts.has(displayText(wb, sheet, r, abs, cell).toLowerCase()))) { ok = false; break; } } if (!ok) continue;
      recs.push(r);
    }
    const labelInfo = new Map(); // key -> {v, nf}
    const tupleOf = (r, fields) => { const labs = [], keys = []; for (const abs of fields) { const cell = sheet.getCell(r, abs); const v = cell && cell.v !== undefined ? cell.v : null; const k = valKey(v); keys.push(k); if (!labelInfo.has(abs + SEP + k)) { const s = cell && cell.s !== undefined ? cell.s : 0; labelInfo.set(abs + SEP + k, { v: v == null || v === '' ? '(blank)' : v, raw: v == null || v === '' ? null : v, nf: s ? wb.style(s).nf : undefined }); } labs.push(abs + SEP + k); } return { labs, key: keys.join(SEP) }; };
    const push = (m, k, x) => { const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); };
    const rowB = new Map(), colB = new Map(), cellB = new Map(), preB = new Map(); const rowT = new Map(), colT = new Map(); const rowOf = [], colOf = [];
    recs.forEach((r, i) => {
      const rt = tupleOf(r, rowF), ct = tupleOf(r, colF); rowOf.push(rt.key); colOf.push(ct.key);
      if (!rowT.has(rt.key)) rowT.set(rt.key, rt.labs); if (!colT.has(ct.key)) colT.set(ct.key, ct.labs);
      push(rowB, rt.key, i); push(colB, ct.key, i); push(cellB, rt.key + '\u0002' + ct.key, i);
      for (let l = 0; l < rl - 1; l++) push(preB, l + '\u0002' + rt.labs.slice(0, l + 1).join(SEP), i);
    });
    const lab = (id) => labelInfo.get(id); const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { const x = lab(a[i]), y = lab(b[i]); const c = natCmp(x.raw, y.raw); if (c) return c; } return 0; };
    const rowKeys = rl ? Array.from(rowT.keys()).sort((a, b) => cmpTuple(rowT.get(a), rowT.get(b))) : [''];
    const colKeys = cl ? Array.from(colT.keys()).sort((a, b) => cmpTuple(colT.get(a), colT.get(b))) : [''];
    if (!rl && !recs.length) rowKeys.length = 1; const all = recs.map((_, i) => i);
    // field values
    const fv = vdefs.map((v) => recs.map((r) => sheet.getValue(r, v.col)));
    const aggOf = (vi, list) => { if (!list || !list.length) return null; const d = vdefs[vi]; const vals = new Array(list.length); for (let i = 0; i < list.length; i++) vals[i] = fv[vi][list[i]]; return aggregate(d.agg, vals); };
    const nfFor = (vi) => { const d = vdefs[vi]; if (d.show !== 'value') return '0.00%'; if (d.agg === 'count' || d.agg === 'counta') return '0'; for (let r = start; r <= Math.min(R.r2, start + 50); r++) { const nf = styleOf(wb, sheet, r, d.col).nf; if (nf && nf !== 'General') return nf; } return undefined; };
    const nfs = vdefs.map((_, i) => nfFor(i));
    const shown = (vi, v, rowRecs, colRecs) => {
      const d = vdefs[vi]; if (v === null || d.show === 'value') return v; if (isErr(v)) return v;
      const den = d.show === 'pctOfTotal' ? aggOf(vi, all) : d.show === 'pctOfRow' ? aggOf(vi, rowRecs) : aggOf(vi, colRecs);
      if (typeof den !== 'number' || den === 0 || typeof v !== 'number') return E.DIV0; return v / den;
    };
    // layout
    const leaves = []; for (const ck of colKeys) for (let vi = 0; vi < Math.max(V, 1); vi++) leaves.push({ ck, vi });
    const showGrandCol = cl > 0 && gt.rows !== false; if (showGrandCol) for (let vi = 0; vi < Math.max(V, 1); vi++) leaves.push({ total: true, vi });
    const H = cl > 0 ? cl + (V > 1 ? 1 : 0) : 1; const RH = Math.max(rl, 1); const width = RH + leaves.length;
    const lines = []; // data line descriptors
    const rowsT = rowKeys.map((k) => ({ type: 'data', key: k, labs: rl ? rowT.get(k) : [], recs: rowB.get(k) || [] }));
    rowsT.forEach((rt, i) => {
      lines.push(rt); if (cfg.subtotals && rl > 1) { const nx = rowsT[i + 1]; for (let l = rl - 2; l >= 0; l--) { const pre = rt.labs.slice(0, l + 1).join(SEP); if (!nx || nx.labs.slice(0, l + 1).join(SEP) !== pre) lines.push({ type: 'sub', level: l, labs: rt.labs.slice(0, l + 1), recs: preB.get(l + '\u0002' + pre) || [] }); } }
    });
    if (gt.cols !== false && rl > 0) lines.push({ type: 'grand', recs: all });
    const cells = []; const mk = (v, kind, extra) => Object.assign({ v: v === undefined ? null : v, kind }, extra);
    for (let h = 0; h < H; h++) cells.push(new Array(width).fill(null).map(() => mk(null, 'corner')));
    // corner: row field titles in last header row
    for (let i = 0; i < rl; i++) { cells[H - 1][i] = mk(titleOf(rowF[i]), 'corner', { b: true, ha: 'left' }); }
    // column headers
    const prevPath = [];
    leaves.forEach((lf, j) => {
      const x = RH + j;
      if (lf.total) { if (cl > 0) { if (lf.vi === 0) cells[0][x] = mk('Grand Total', 'colHeader', { b: true, ha: 'center' }); if (V > 1) cells[H - 1][x] = mk(vdefs[lf.vi].label, 'colHeader', { b: true, ha: 'center' }); } return; }
      if (cl > 0) { const labs = colT.get(lf.ck); for (let l = 0; l < cl; l++) { const path = labs.slice(0, l + 1).join(SEP); if (lf.vi === 0 && prevPath[l] !== path) { const li = lab(labs[l]); cells[l][x] = mk(li.v, 'colHeader', { b: true, ha: 'center', nf: li.nf }); } prevPath[l] = lf.vi === 0 ? path : prevPath[l]; } if (V > 1) cells[H - 1][x] = mk(vdefs[lf.vi].label, 'colHeader', { b: true, ha: 'center' }); }
      else cells[0][x] = mk(V ? vdefs[lf.vi].label : '', 'colHeader', { b: true, ha: 'center' });
    });
    // body
    let prevLabs = null;
    for (const ln of lines) {
      const row = new Array(width).fill(null).map(() => mk(null, ln.type === 'value' ? 'value' : 'value'));
      const hdrKind = ln.type === 'data' ? 'rowHeader' : ln.type === 'sub' ? 'total' : 'grand'; const bold = ln.type !== 'data';
      for (let i = 0; i < RH; i++) row[i] = mk(null, hdrKind, { b: bold });
      if (ln.type === 'data') {
        if (rl === 0) row[0] = mk('Total', 'rowHeader', { b: false, ha: 'left' });
        else for (let l = 0; l < rl; l++) { const same = prevLabs && prevLabs.slice(0, l + 1).join(SEP) === ln.labs.slice(0, l + 1).join(SEP) && !cfg.repeatLabels; if (!same) { const li = lab(ln.labs[l]); row[l] = mk(li.v, 'rowHeader', { ha: 'left', nf: li.nf }); } } prevLabs = ln.labs;
      } else if (ln.type === 'sub') { const li = lab(ln.labs[ln.level]); row[ln.level] = mk((li.v === '(blank)' ? '(blank)' : ZN.F.toStr(li.v)) + ' Total', 'total', { b: true, ha: 'left' }); prevLabs = null; }
      else { row[0] = mk('Grand Total', 'grand', { b: true, ha: 'left' }); prevLabs = null; }
      // group row records by column key for sub/grand lines
      let byCol = null; if (ln.type !== 'data') { byCol = new Map(); for (const i of ln.recs) push(byCol, colOf[i], i); }
      leaves.forEach((lf, j) => {
        const vi = lf.vi; let list; let colRecs;
        if (!V) { row[RH + j] = mk(null, 'value'); return; }
        if (lf.total) { list = ln.recs; colRecs = all; } else { colRecs = cl ? colB.get(lf.ck) : all; list = ln.type === 'data' ? cellB.get(ln.key + '\u0002' + lf.ck) : byCol.get(lf.ck); }
        let v = aggOf(vi, list); v = shown(vi, v, ln.recs, colRecs);
        const kind = ln.type === 'data' ? (lf.total ? 'total' : 'value') : ln.type === 'sub' ? 'total' : 'grand';
        row[RH + j] = mk(v, kind, { b: kind !== 'value', nf: nfs[vi] });
      });
      cells.push(row);
    }
    return { cells, rows: cells.length, cols: width, headerRows: H, rowHeaderCols: RH };
  };
  TL.writePivot = function writePivot(wb, target, r, c, result) {
    return batch(wb, () => {
      for (let i = 0; i < result.cells.length; i++) for (let j = 0; j < result.cells[i].length; j++) {
        const x = result.cells[i][j]; const old = target.getCell(r + i, c + j);
        if (x.v === null || x.v === undefined) { if (old) wb.put(target, r + i, c + j, undefined); continue; }
        const patch = {}; if (x.b) patch.b = 1; if (x.nf) patch.nf = x.nf; if (x.ha) patch.ha = x.ha; const s = Object.keys(patch).length ? wb.mergeStyle(0, patch) : undefined;
        wb.put(target, r + i, c + j, s ? { v: x.v, s } : { v: x.v });
      }
      return { r1: r, c1: c, r2: r + result.rows - 1, c2: c + result.cols - 1 };
    });
  };

  // =====================================================================================================
  // GOAL SEEK
  // =====================================================================================================
  TL.goalSeek = function goalSeek(wb, sheet, target, targetValue, changing, o = {}) {
    const maxIter = o.maxIter || 100, tol = o.tol || 1e-9; const key = ZN.keyOf(sheet.id, changing.r, changing.c);
    const orig = sheet.getCell(changing.r, changing.c); if (orig && orig.f !== undefined) return { ok: false, reached: false, value: null, iterations: 0, error: 'The changing cell must contain a constant' };
    let iter = 0; const thr = tol * Math.max(1, Math.abs(targetValue));
    const f = (x) => { iter++; const cell = { v: x }; if (orig && orig.s !== undefined) cell.s = orig.s; sheet.setRaw(changing.r, changing.c, cell); wb.recalc(new Set([key])); const v = sheet.getValue(target.r, target.c); return typeof v === 'number' && isFinite(v) ? v - targetValue : NaN; };
    let best = { x: orig && typeof orig.v === 'number' ? orig.v : 0, f: NaN };
    const consider = (x, fx) => { if (!isNaN(fx) && (isNaN(best.f) || Math.abs(fx) < Math.abs(best.f))) best = { x, f: fx }; };
    try {
      let x0 = best.x; let f0 = f(x0); consider(x0, f0);
      if (isNaN(f0)) for (const alt of [1, 0, -1, 10]) { if (alt === x0) continue; const fa = f(alt); if (!isNaN(fa)) { x0 = alt; f0 = fa; consider(x0, f0); break; } }
      if (!isNaN(f0) && Math.abs(f0) > thr) {
        // bracketing search outward from x0
        const scale = Math.max(Math.abs(x0), 1); let bracket = null; const side = { '1': { x: x0, f: f0 }, '-1': { x: x0, f: f0 } };
        for (let k = 0; k < 70 && !bracket && iter < maxIter * 3; k++) {
          const d = scale * 0.01 * Math.pow(2, k);
          for (const sgn of [1, -1]) { const x = x0 + sgn * d; const fx = f(x); consider(x, fx); if (isNaN(fx)) continue; const p = side[sgn]; if (Math.abs(fx) <= thr) { bracket = { a: x, fa: fx, b: x, fb: fx }; break; } if ((fx < 0) !== (p.f < 0)) { bracket = { a: p.x, fa: p.f, b: x, fb: fx }; break; } side[sgn] = { x, f: fx }; }
        }
        if (bracket && Math.abs(bracket.fb) > thr) {
          let { a, fa, b, fb } = bracket; let sideLast = 0;
          for (let it = 0; it < maxIter && Math.abs(best.f) > thr; it++) {
            let c = b - fb * (b - a) / (fb - fa); if (!isFinite(c) || c <= Math.min(a, b) || c >= Math.max(a, b)) c = (a + b) / 2;
            const fc = f(c); consider(c, fc); if (isNaN(fc)) break; if (Math.abs(fc) <= thr) break;
            if ((fc < 0) !== (fb < 0)) { a = b; fa = fb; if (sideLast === 1) fa /= 2; sideLast = 1; } else { fa /= 2; sideLast = -1; if (false) fa = fa; }
            b = c; fb = fc; if (Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(b))) break;
          }
        } else if (!bracket) { // secant fallback
          let xa = x0, fa = f0, xb = x0 + scale * 0.01, fb = f(xb); consider(xb, fb);
          for (let it = 0; it < maxIter && !isNaN(fb) && Math.abs(best.f) > thr; it++) { if (fb === fa) break; const xc = xb - fb * (xb - xa) / (fb - fa); xa = xb; fa = fb; xb = xc; fb = f(xb); consider(xb, fb); }
        }
      }
    } finally {
      sheet.setRaw(changing.r, changing.c, orig); wb.recalc(new Set([key]));
    }
    const reached = !isNaN(best.f) && Math.abs(best.f) <= thr;
    return { ok: reached, value: best.x, iterations: iter, reached, error: reached ? undefined : (isNaN(best.f) ? 'The target cell does not evaluate to a number' : 'No solution found') };
  };

  // =====================================================================================================
  // TEXT TO COLUMNS
  // =====================================================================================================
  TL.textToColumns = function textToColumns(strings, o = {}) {
    const d = o.delimiters || {}; const q = o.qualifier === undefined ? '"' : o.qualifier; const delims = [];
    if (d.tab) delims.push('\t'); if (d.semicolon) delims.push(';'); if (d.comma) delims.push(','); if (d.space) delims.push(' '); if (d.other) for (const ch of String(d.other)) delims.push(ch);
    return strings.map((raw) => {
      const s = raw == null ? '' : String(raw);
      if (o.fixed && o.fixed.length) { const pos = o.fixed.slice().sort((a, b) => a - b); const out = []; let prev = 0; for (const p of pos) { out.push(s.slice(prev, p)); prev = p; } out.push(s.slice(prev)); return out; }
      if (!delims.length) return [s];
      const out = []; let cur = '', i = 0, atStart = true, lastWasDelim = false;
      while (i < s.length) {
        const ch = s[i];
        if (q && atStart && ch === q) { let j = i + 1, t = ''; for (;;) { if (j >= s.length) break; if (s[j] === q) { if (s[j + 1] === q) { t += q; j += 2; continue; } break; } t += s[j++]; } cur = t; i = j + 1; atStart = false; lastWasDelim = false; continue; }
        if (delims.includes(ch)) { if (!(o.consecutive && lastWasDelim)) { out.push(cur); } cur = ''; atStart = true; lastWasDelim = true; i++; continue; }
        cur += ch; atStart = false; lastWasDelim = false; i++;
      }
      out.push(cur); return out;
    });
  };
  TL.applyTextToColumns = function applyTextToColumns(wb, sheet, range, o = {}) {
    const R = norm(range); const rows = []; for (let r = R.r1; r <= R.r2; r++) rows.push(displayText(wb, sheet, r, R.c1));
    const parts = TL.textToColumns(rows, o); const dr = o.dest ? o.dest.r : R.r1, dc = o.dest ? o.dest.c : R.c1; let maxc = 0;
    batch(wb, () => { parts.forEach((p, i) => { maxc = Math.max(maxc, p.length); p.forEach((t, j) => { wb.setInput(sheet, dr + i, dc + j, o.asText ? "'" + t : t); }); }); });
    return { rows: parts.length, cols: maxc, parts };
  };

  // =====================================================================================================
  // DUPLICATES
  // =====================================================================================================
  const dupKey = (v, cs) => { if (v == null || v === '') return null; if (typeof v === 'string') return 's' + (cs ? v : v.toLowerCase()); return valKey(v); };
  TL.findDuplicates = function findDuplicates(wb, sheet, range, o = {}) {
    const R = norm(range); const cs = !!o.caseSensitive; const m = new Map();
    if (!o.byRow) {
      for (let c = R.c1; c <= R.c2; c++) for (let r = R.r1; r <= R.r2; r++) { const k = dupKey(sheet.getValue(r, c), cs); if (k === null) continue; const a = m.get(k); if (a) a.push({ r, c }); else m.set(k, [{ r, c }]); }
    } else {
      for (let r = R.r1; r <= R.r2; r++) { const parts = []; let blank = true; for (let c = R.c1; c <= R.c2; c++) { const k = dupKey(sheet.getValue(r, c), cs); if (k !== null) blank = false; parts.push(k === null ? '' : k); } if (blank) continue; const k = parts.join(SEP); const e = { r, c: R.c1 }; const a = m.get(k); if (a) a.push(e); else m.set(k, [e]); }
    }
    const groups = [], cells = []; for (const a of m.values()) if (a.length > 1) { groups.push(a); for (const e of a) { if (o.byRow) for (let c = R.c1; c <= R.c2; c++) cells.push({ r: e.r, c }); else cells.push(e); } }
    cells.sort((a, b) => a.r - b.r || a.c - b.c); return { cells, groups };
  };
  TL.removeDuplicates = function removeDuplicates(wb, sheet, range, o = {}) {
    const R = norm(range); const cs = !!o.caseSensitive; const cols = o.cols && o.cols.length ? o.cols : null; const start = R.r1 + (o.header ? 1 : 0); const seen = new Set(); const keep = [];
    for (let r = start; r <= R.r2; r++) { const parts = []; for (let c = cols ? 0 : R.c1; c <= (cols ? cols.length - 1 : R.c2); c++) { const k = dupKey(sheet.getValue(r, cols ? cols[c] : c), cs); parts.push(k === null ? '' : k); } const k = parts.join(SEP); if (seen.has(k)) continue; seen.add(k); keep.push(r); }
    const total = R.r2 - start + 1, removed = total - keep.length; if (!removed) return { removed: 0, remaining: total };
    batch(wb, () => {
      const map = []; for (let i = 0; i < keep.length; i++) map.push({ from: keep[i], to: start + i }); for (let r = start + keep.length; r <= R.r2; r++) map.push({ from: -1, to: r });
      moveLines(wb, sheet, map, R.c1, R.c2, false);
    });
    return { removed, remaining: keep.length };
  };

  // =====================================================================================================
  // DATA VALIDATION
  // =====================================================================================================
  function dvRulesAt(sheet, r, c) {
    const out = []; for (const rule of sheet.dv || []) for (const g of rule.ranges || []) if (r >= g[0] && r <= g[2] && c >= g[1] && c <= g[3]) { out.push({ rule, origin: g }); break; } return out;
  }
  function evalFormula(wb, sheet, r, c, text, origin) {
    let f = String(text).trim(); if (f[0] === '=') f = f.slice(1); const dr = origin ? r - origin[0] : 0, dc = origin ? c - origin[1] : 0; if (dr || dc) f = FM.translate(f, dr, dc);
    try { return FM.ev(FM.parse(f), { wb, sheet, r, c, vars: null, dyn: null }); } catch (e) { return E.VALUE; }
  }
  function listItems(wb, sheet, r, c, rule, origin) {
    if (Array.isArray(rule.list)) return { items: rule.list.map((x) => ({ text: String(x), v: x })), cs: true };
    const src = rule.source != null ? String(rule.source) : ''; const items = [];
    if (src[0] === '=') {
      const res = evalFormula(wb, sheet, r, c, src, null);
      if (res instanceof Range) { const rr = res.clampedRows(); for (let i = 0; i < rr; i++) for (let j = 0; j < res.cols; j++) { const cell = res.sheet.getCell(res.r1 + i, res.c1 + j); if (!cell || cell.v == null || cell.v === '') continue; items.push({ text: displayText(wb, res.sheet, res.r1 + i, res.c1 + j, cell), v: cell.v }); } }
      else if (Array.isArray(res)) { for (const row of res) for (const x of row) if (x != null && x !== '' && !isErr(x)) items.push({ text: F.toStr(x), v: x }); }
      else if (typeof res === 'string') res.split(',').forEach((x) => items.push({ text: x.trim(), v: x.trim() }));
      return { items, cs: false };
    }
    src.split(',').forEach((x) => items.push({ text: x.trim(), v: x.trim() })); return { items, cs: true };
  }
  function operand(wb, sheet, r, c, x, origin) {
    if (x == null || x === '') return null; if (typeof x === 'number') return x;
    if (typeof x === 'string' && x[0] === '=') { let v = evalFormula(wb, sheet, r, c, x, origin); v = F.scalar(v); if (typeof v === 'number') return v; if (typeof v === 'string') return parseTyped(v); return null; }
    return parseTyped(x);
  }
  const cmpOp = (op, x, a, b) => { switch (op || 'between') { case 'between': return x >= Math.min(a, b) && x <= Math.max(a, b); case 'notBetween': return x < Math.min(a, b) || x > Math.max(a, b); case 'eq': return x === a; case 'ne': return x !== a; case 'gt': return x > a; case 'lt': return x < a; case 'ge': return x >= a; case 'le': return x <= a; } return true; };
  function checkRule(wb, sheet, r, c, rule, origin, value, inplace) {
    const blank = value == null || value === ''; if (blank) return rule.allowBlank !== false;
    switch (rule.type) {
      case 'list': { const { items, cs } = listItems(wb, sheet, r, c, rule, origin); const s = typeof value === 'string' ? value : F.toStr(value); const n = typeof value === 'number' ? value : null;
        return items.some((it) => (cs ? it.text === s : it.text.toLowerCase() === s.toLowerCase()) || (n !== null && typeof it.v === 'number' && it.v === n)); }
      case 'whole': case 'decimal': case 'date': case 'time': {
        let x = typeof value === 'number' ? value : typeof value === 'string' ? parseTyped(value) : null; if (x === null) return false;
        if (rule.type === 'whole' && !Number.isInteger(x)) return false;
        const a = operand(wb, sheet, r, c, rule.v1, origin), b = operand(wb, sheet, r, c, rule.v2, origin); if (a === null && b === null) return true;
        if (rule.type === 'time') { x = x - Math.floor(x); const fa = a === null ? null : a - Math.floor(a), fb = b === null ? null : b - Math.floor(b); return cmpOp(rule.op, x, fa, fb === null ? fa : fb); }
        return cmpOp(rule.op, x, a, b === null ? a : b);
      }
      case 'length': { const s = typeof value === 'string' ? value : F.toStr(value); const a = operand(wb, sheet, r, c, rule.v1, origin), b = operand(wb, sheet, r, c, rule.v2, origin); if (a === null) return true; return cmpOp(rule.op, s.length, a, b === null ? a : b); }
      case 'custom': {
        let res; const orig = sheet.getCell(r, c); const typed = typeof value === 'string' ? (parseTyped(value) !== null ? parseTyped(value) : value) : value;
        if (!inplace) { sheet.setRaw(r, c, orig && orig.s !== undefined ? { v: typed, s: orig.s } : { v: typed }); }
        try { res = F.scalar(evalFormula(wb, sheet, r, c, rule.formula || '', origin)); } finally { if (!inplace) sheet.setRaw(r, c, orig); }
        if (isErr(res)) return false; const b = F.toBool(res); return b === true;
      }
    }
    return true;
  }
  TL.validate = function validate(wb, sheet, r, c, value) {
    for (const { rule, origin } of dvRulesAt(sheet, r, c)) {
      if (checkRule(wb, sheet, r, c, rule, origin, value, false)) continue; if (rule.showError === false) continue;
      return { ok: false, style: rule.errStyle || 'stop', title: rule.errTitle || 'Microsoft Excel', message: rule.errMsg || "This value doesn't match the data validation restrictions defined for this cell." };
    }
    return { ok: true };
  };
  TL.dropdownItems = function dropdownItems(wb, sheet, r, c) {
    for (const { rule, origin } of dvRulesAt(sheet, r, c)) if (rule.type === 'list' && rule.dropdown !== false) return listItems(wb, sheet, r, c, rule, origin).items.map((x) => x.text);
    return null;
  };
  TL.inputMessage = function inputMessage(wb, sheet, r, c) {
    for (const { rule } of dvRulesAt(sheet, r, c)) if (rule.showPrompt !== false && (rule.prompt || rule.promptTitle)) return { title: rule.promptTitle || '', message: rule.prompt || '' };
    return null;
  };
  TL.circleInvalid = function circleInvalid(wb, sheet) {
    const seen = new Set(), out = [];
    for (const rule of sheet.dv || []) for (const g of rule.ranges || []) {
      sheet.eachCell(g[0], g[1], g[2], g[3], (v, r, c) => {
        const k = r * MAXC + c; if (seen.has(k)) return; const origin = g; if (!checkRule(wb, sheet, r, c, rule, origin, v, true)) { seen.add(k); out.push({ r, c }); }
      });
    }
    out.sort((a, b) => a.r - b.r || a.c - b.c); return out;
  };

  // =====================================================================================================
  // FIND & REPLACE
  // =====================================================================================================
  function plainSrc(q) { let s = ''; for (let i = 0; i < q.length; i++) { const ch = q[i]; if (ch === '~' && i + 1 < q.length) s += q[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); else if (ch === '*') s += '[\\s\\S]*'; else if (ch === '?') s += '[\\s\\S]'; else s += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } return s; }
  function buildRe(o, g) {
    let src = o.regex ? String(o.query) : plainSrc(String(o.query)); if (o.wholeCell) src = '^(?:' + src + ')$';
    try { return new RegExp(src, (o.matchCase ? '' : 'i') + (g ? 'g' : '')); } catch (e) { throw new Error('Invalid regular expression: ' + e.message); }
  }
  TL.find = function find(wb, o) {
    if (o.query == null || o.query === '') return Object.assign([], { opts: o }); const re = buildRe(o, false); const lookIn = o.lookIn || 'values'; const scope = o.scope || 'sheet';
    const active = o.sheet || wb.sheets[wb.active] || wb.sheets[0]; const targets = [];
    if (scope === 'workbook') for (const s of wb.sheets) targets.push({ s, R: { r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 } });
    else if (scope === 'selection' && o.ranges && o.ranges.length) for (const g of o.ranges) { const sh = g.sheet && g.sheet.cols ? g.sheet : g.sheetId != null ? wb.byId.get(g.sheetId) : active; targets.push({ s: sh, R: norm(g) }); }
    else targets.push({ s: active, R: { r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 } });
    const res = []; const seen = new Set();
    for (const { s, R } of targets) {
      const ce = Math.min(R.c2, s.cols.length - 1);
      for (let c = R.c1; c <= ce; c++) {
        const col = s.cols[c]; if (!col) continue; const re2 = Math.min(R.r2, col.length - 1);
        for (let r = R.r1; r <= re2; r++) {
          const cell = col[r]; if (cell === undefined) continue; if (cell.v === undefined && cell.f === undefined) continue;
          let text = null;
          if (lookIn !== 'formulas') { const t = displayText(wb, s, r, c, cell); if (t !== '' && re.test(t)) text = t; }
          if (text === null && lookIn !== 'values') { const t = cell.f !== undefined ? '=' + cell.f : cell.v == null ? '' : typeof cell.v === 'string' ? cell.v : displayText(wb, s, r, c, cell); if (t !== '' && re.test(t)) text = t; }
          if (text !== null) { const k = s.id * 1e12 + r * MAXC + c; if (!seen.has(k)) { seen.add(k); res.push({ sheetId: s.id, r, c, text }); } }
        }
      }
    }
    const order = o.order === 'cols' ? 'cols' : 'rows'; const si = new Map(wb.sheets.map((s, i) => [s.id, i]));
    res.sort((a, b) => si.get(a.sheetId) - si.get(b.sheetId) || (order === 'rows' ? a.r - b.r || a.c - b.c : a.c - b.c || a.r - b.r));
    res.opts = o; return res;
  };
  TL.replace = function replace(wb, matchesOrOpts, replacement, ro = {}) {
    let matches, o; if (Array.isArray(matchesOrOpts)) { matches = matchesOrOpts; o = matches.opts || ro.opts; if (!o) throw new Error('replace() needs the search options (pass find() results or an options object)'); if (!ro.all && ro.all !== undefined) matches = matches.slice(0, 1); } else { o = matchesOrOpts; matches = TL.find(wb, o); if (!ro.all) matches = matches.slice(0, 1); }
    const g = buildRe(o, true); const lookIn = o.lookIn || 'values'; const repl = replacement == null ? '' : String(replacement); let count = 0;
    batch(wb, () => {
      for (const m of matches) {
        const sh = wb.byId.get(m.sheetId); if (!sh) continue; const cell = sh.getCell(m.r, m.c); if (!cell) continue; let src;
        if (cell.f !== undefined) { if (lookIn === 'values') continue; src = '=' + cell.f; } else { if (lookIn === 'formulas' && typeof cell.v !== 'string' && false) continue; src = typeof cell.v === 'string' ? cell.v : m.text; }
        g.lastIndex = 0; const out = o.regex ? src.replace(g, repl) : src.replace(g, () => repl); if (out === src) continue;
        wb.setInput(sh, m.r, m.c, o.regex || true ? out : out); count++;
      }
    });
    return count;
  };

  // =====================================================================================================
  // SELECTION STATS
  // =====================================================================================================
  function subtractRect(a, b) { // a minus b -> disjoint rects
    if (b.r1 > a.r2 || b.r2 < a.r1 || b.c1 > a.c2 || b.c2 < a.c1) return [a]; const out = [];
    if (b.r1 > a.r1) out.push({ r1: a.r1, c1: a.c1, r2: b.r1 - 1, c2: a.c2 }); if (b.r2 < a.r2) out.push({ r1: b.r2 + 1, c1: a.c1, r2: a.r2, c2: a.c2 });
    const m1 = Math.max(a.r1, b.r1), m2 = Math.min(a.r2, b.r2); if (b.c1 > a.c1) out.push({ r1: m1, c1: a.c1, r2: m2, c2: b.c1 - 1 }); if (b.c2 < a.c2) out.push({ r1: m1, c1: b.c2 + 1, r2: m2, c2: a.c2 });
    return out;
  }
  TL.stats = function stats(wb, sheet, ranges) {
    let pieces = []; for (const rg of ranges || []) { let cur = [norm(rg)]; for (const p of pieces) { const nx = []; for (const x of cur) nx.push(...subtractRect(x, p)); cur = nx; if (!cur.length) break; } pieces.push(...cur); }
    let count = 0, nn = 0, sum = 0, min = Infinity, max = -Infinity;
    for (const p of pieces) sheet.eachCell(p.r1, p.c1, p.r2, p.c2, (v) => { if (v === '') return; count++; if (typeof v === 'number') { nn++; sum += v; if (v < min) min = v; if (v > max) max = v; } });
    return { count, nums: nn, countNums: nn, sum, avg: nn ? sum / nn : null, min: nn ? min : null, max: nn ? max : null };
  };

  // =====================================================================================================
  // AUTO-FIT
  // =====================================================================================================
  const wrapW = (m) => (typeof m === 'number' ? m : m && typeof m.w === 'number' ? m.w : 0);
  TL.autoFitWidth = function autoFitWidth(wb, sheet, c, o = {}) {
    const measure = o.measure || ((t) => t.length * 7); const maxRows = o.maxRows || 2000; const pad = o.padding != null ? o.padding : 8; let best = 0; const col = sheet.cols[c]; if (!col) return o.min || sheet.defColW;
    const lim = Math.min(col.length, maxRows);
    for (let r = 0; r < lim; r++) {
      const cell = col[r]; if (!cell || cell.v == null || cell.v === '') continue; const stl = wb.style(cell.s !== undefined ? cell.s : sheet.styleId(r, c)); if (stl.wr) continue;
      const m = sheet.mergeAt(r, c); if (m && (m[3] > m[1])) continue;
      const lines = displayText(wb, sheet, r, c, cell).split('\n'); for (const ln of lines) { const w = wrapW(measure(ln, stl)) + (stl.ind ? stl.ind * 9 : 0); if (w > best) best = w; }
    }
    return Math.max(Math.ceil(best) + pad, o.min || 20);
  };
  TL.autoFitHeight = function autoFitHeight(wb, sheet, r, o = {}) {
    const measure = o.measure || ((t) => t.length * 7); const maxCols = o.maxCols || 200; let best = 0; const lim = Math.min(sheet.cols.length, maxCols);
    for (let c = 0; c < lim; c++) {
      const cell = sheet.getCell(r, c); if (!cell || cell.v == null || cell.v === '') continue; const stl = wb.style(cell.s !== undefined ? cell.s : sheet.styleId(r, c)); const fs = stl.fs || 11; const lineH = Math.ceil(fs * 4 / 3 * 1.25);
      const m = sheet.mergeAt(r, c); if (m && m[2] > m[0]) continue; const text = displayText(wb, sheet, r, c, cell); let lines = text.split('\n').length;
      if (stl.wr) { const w = sheet.colWidth(c) || sheet.defColW; lines = 0; for (const ln of text.split('\n')) { const mw = measure(ln, stl, w); lines += mw && typeof mw === 'object' && typeof mw.lines === 'number' ? mw.lines : Math.max(1, Math.ceil(wrapW(mw) / Math.max(1, w - 6))); } }
      const h = lines * lineH + 4; if (h > best) best = h;
    }
    return best ? Math.max(best, o.min || 0) : sheet.defRowH;
  };

  // =====================================================================================================
  // MERGES
  // =====================================================================================================
  const overlaps = (m, R) => !(m[0] > R.r2 || m[2] < R.r1 || m[1] > R.c2 || m[3] < R.c1);
  TL.mergeRanges = function mergeRanges(sheet, range, o = {}) {
    const wb = sheet.wb; const R = norm(range); const added = [];
    if (o.across) { for (let r = R.r1; r <= R.r2; r++) if (R.c2 > R.c1) added.push([r, R.c1, r, R.c2]); } else if (R.r2 > R.r1 || R.c2 > R.c1) added.push([R.r1, R.c1, R.r2, R.c2]);
    if (!added.length) return [];
    return batch(wb, () => {
      const keep = sheet.merges.filter((m) => !added.some((a) => overlaps(m, { r1: a[0], c1: a[1], r2: a[2], c2: a[3] })));
      for (const a of added) { // clear non-top-left cells (values removed, styles kept)
        for (let r = a[0]; r <= a[2]; r++) for (let c = a[1]; c <= a[3]; c++) { if (r === a[0] && c === a[1]) continue; const cell = sheet.getCell(r, c); if (cell && (cell.v !== undefined || cell.f !== undefined)) wb.put(sheet, r, c, cell.s !== undefined ? { v: undefined, s: cell.s } : undefined); }
      }
      wb.setProp(sheet, 'merges', keep.concat(added)); return added;
    });
  };
  TL.unmerge = function unmerge(sheet, range) {
    const R = norm(range); const wb = sheet.wb; const gone = sheet.merges.filter((m) => overlaps(m, R)); if (!gone.length) return [];
    batch(wb, () => wb.setProp(sheet, 'merges', sheet.merges.filter((m) => !overlaps(m, R)))); return gone;
  };
  TL.normalizeMerge = function normalizeMerge(sheet) {
    const out = []; let changed = 0;
    for (const m0 of sheet.merges) { const m = [Math.min(m0[0], m0[2]), Math.min(m0[1], m0[3]), Math.max(m0[0], m0[2]), Math.max(m0[1], m0[3])]; if (m[0] === m[2] && m[1] === m[3]) { changed++; continue; } if (out.some((x) => overlaps(x, { r1: m[0], c1: m[1], r2: m[2], c2: m[3] }))) { changed++; continue; } out.push(m); }
    if (changed) batch(sheet.wb, () => sheet.wb.setProp(sheet, 'merges', out)); return changed;
  };

  // =====================================================================================================
  // NAMES
  // =====================================================================================================
  function validName(name) {
    if (typeof name !== 'string' || !name || name.length > 255) return false; if (!/^[A-Za-z_\\¡-￿][A-Za-z0-9_.\\¡-￿]*$/.test(name)) return false;
    if (/^[A-Za-z]{1,3}\d+$/.test(name) || /^[Rr]\d*([Cc]\d*)?$/.test(name) || /^[Cc]$/.test(name) || /^(TRUE|FALSE)$/i.test(name)) return false; return true;
  }
  function namesChange(wb, label, fnRedo, fnUndo) {
    fnRedo(); if (wb.tx_) { wb._log({ t: 'fn', undo: fnUndo, redo: fnRedo }); wb.tx_.rebuild = true; } else { wb.rebuildGraph(); wb.recalc(null); wb._emit('names'); }
  }
  TL.defineName = function defineName(wb, name, refText, scopeSheet) {
    if (!validName(name)) throw new Error('Invalid name: ' + name); const key = wb.nameKey(name, scopeSheet || null); const prev = wb.names.get(key);
    const entry = { name, ref: String(refText).replace(/^=/, ''), scope: scopeSheet ? scopeSheet.id : null };
    namesChange(wb, 'name', () => wb.names.set(key, entry), () => { if (prev) wb.names.set(key, prev); else wb.names.delete(key); }); return entry;
  };
  TL.deleteName = function deleteName(wb, name, scopeSheet) {
    const key = wb.nameKey(name, scopeSheet || null); const prev = wb.names.get(key); if (!prev) return false;
    namesChange(wb, 'name', () => wb.names.delete(key), () => wb.names.set(key, prev)); return true;
  };
  TL.listNames = function listNames(wb) {
    const out = []; for (const [key, e] of wb.names) { const sh = e.scope != null ? wb.byId.get(e.scope) : null; out.push({ key, name: e.name, ref: e.ref, scope: e.scope == null ? null : e.scope, scopeName: sh ? sh.name : 'Workbook' }); }
    return out.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
  };

  // =====================================================================================================
  // TABLES
  // =====================================================================================================
  TL.createTable = function createTable(wb, sheet, range, o = {}) {
    let R = norm(range); const hasHeader = o.header !== false;
    for (const t of sheet.tables) if (!(t.r1 > R.r2 || t.r2 < R.r1 || t.c1 > R.c2 || t.c2 < R.c1)) throw new Error('The range overlaps an existing table');
    let name = o.name; if (name) { if (!validName(name)) throw new Error('Invalid table name: ' + name); if (wb.tableByName(name)) throw new Error('A table named ' + name + ' already exists'); }
    else { let i = 1; while (wb.tableByName('Table' + i)) i++; name = 'Table' + i; }
    return batch(wb, () => {
      let cols = []; const used = new Set();
      if (!hasHeader) {
        if (R.r1 === 0) throw new Error('No room above the range for a header row');
        for (let c = R.c1; c <= R.c2; c++) if (sheet.getCell(R.r1 - 1, c) && sheet.getCell(R.r1 - 1, c).v != null) throw new Error('No room above the range for a header row');
        R = { r1: R.r1 - 1, c1: R.c1, r2: R.r2, c2: R.c2 }; for (let c = R.c1; c <= R.c2; c++) wb.setInput(sheet, R.r1, c, "'Column" + (c - R.c1 + 1));
      }
      for (let c = R.c1; c <= R.c2; c++) { let t = displayText(wb, sheet, R.r1, c); if (t === '') t = 'Column' + (c - R.c1 + 1); let u = t, i = 2; while (used.has(u.toLowerCase())) u = t + i++; used.add(u.toLowerCase()); cols.push(u); if (u !== t || sheet.getValue(R.r1, c) == null || typeof sheet.getValue(R.r1, c) !== 'string') wb.setInput(sheet, R.r1, c, "'" + u); }
      const tbl = { name, r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, header: true, total: false, cols, style: o.style || 'medium2', banded: true, bandedCols: false, firstCol: false, lastCol: false, filter: true, totals: {} };
      wb.mod(sheet, 'tables', (arr) => { arr.push(tbl); }, true); return tbl;
    });
  };
  TL.removeTable = function removeTable(wb, sheet, name) {
    const i = sheet.tables.findIndex((t) => t.name.toLowerCase() === String(name).toLowerCase()); if (i < 0) return false;
    batch(wb, () => wb.mod(sheet, 'tables', (arr) => { arr.splice(i, 1); }, true)); return true;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
