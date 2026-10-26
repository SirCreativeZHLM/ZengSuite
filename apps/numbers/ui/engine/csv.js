/* ZengNumbers CSV import/export (ZN.io.csv) + shared IO helpers (ZN.io._u). */
(function (G) {
  'use strict';
  const ZN = G.ZN; const IO = ZN.io || (ZN.io = {});
  const U = IO._u = IO._u || {};

  // ---------- shared helpers ----------
  U.esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  U.escA = (s) => U.esc(s).replace(/"/g, '&quot;');
  // displayed text of a value under number format nf
  U.fmtText = (v, nf) => {
    if (v == null) return '';
    if (v instanceof ZN.ZErr) return v.code;
    if (nf && nf !== 'General' && ZN.fmt && ZN.fmt.format) { try { const r = ZN.fmt.format(v, nf); if (r && typeof r.text === 'string') return r.text; } catch (e) { /* fall through */ } }
    if (typeof v === 'number') return ZN.numToStr(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };
  U.rawText = (v) => (v == null ? '' : v instanceof ZN.ZErr ? v.code : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? ZN.numToStr(v) : String(v));
  // text -> {v, nf?} typed value, or null when it must stay text
  const NUM_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
  U.typed = (s) => {
    if (s === '') return null;
    const t = s.trim(); if (t === '') return null;
    const c = t.charCodeAt(0);
    // quick reject of obvious text (letters other than TRUE/FALSE) keeps imports fast
    if (c > 57 && !(c === 84 || c === 70 || c === 116 || c === 102)) { return null; }
    if (/^[+-]?0\d/.test(t) && !/^[+-]?0\d*[.,:/-]/.test(t)) return null; // leading zeros: keep text
    if (/^[+-]?\d{16,}$/.test(t)) return null; // long digit strings (ids, cards)
    if (ZN.parseValue) {
      let p = null; try { p = ZN.parseValue(t); } catch (e) { p = null; }
      if (!p) return null;
      if (typeof p.v === 'string') return null;
      return p.nf && p.nf !== 'General' ? { v: p.v, nf: p.nf } : { v: p.v };
    }
    if (NUM_RE.test(t)) { const n = +t; return isFinite(n) ? { v: n } : null; }
    const u = t.toUpperCase(); if (u === 'TRUE') return { v: true }; if (u === 'FALSE') return { v: false };
    return null;
  };
  U.toU8 = (input) => {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer instanceof ArrayBuffer && typeof input.byteLength === 'number') return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('Unsupported input: expected ArrayBuffer or Uint8Array');
  };
  U.utf8 = (u8) => new TextDecoder('utf-8').decode(u8);
  U.utf8Enc = (s) => new TextEncoder().encode(s);
  U.b64decode = (s) => { if (typeof atob === 'function') { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } return new Uint8Array(Buffer.from(s, 'base64')); };

  // ---------- decoding ----------
  const W1252 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F, 0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
  function decode1252(u8) {
    let out = ''; const CH = 8192;
    for (let i = 0; i < u8.length; i += CH) {
      const n = Math.min(CH, u8.length - i); const arr = new Array(n);
      for (let j = 0; j < n; j++) { const b = u8[i + j]; arr[j] = b >= 0x80 && b < 0xA0 ? W1252[b - 0x80] : b; }
      out += String.fromCharCode.apply(null, arr);
    }
    return out;
  }
  function decodeBytes(u8, forced) {
    let enc = forced ? String(forced).toLowerCase() : null; let off = 0;
    if (!enc || enc === 'auto') {
      if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) { enc = 'utf-8'; off = 3; }
      else if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) { enc = 'utf-16le'; off = 2; }
      else if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) { enc = 'utf-16be'; off = 2; }
      else {
        enc = null;
        // BOM-less UTF-16 heuristic: many NULs in alternating positions
        if (u8.length >= 4) { let ev = 0, od = 0; const n = Math.min(u8.length, 400); for (let i = 0; i < n; i++) if (u8[i] === 0) { if (i & 1) od++; else ev++; } if (od > n / 5 && ev === 0) enc = 'utf-16le'; else if (ev > n / 5 && od === 0) enc = 'utf-16be'; }
        if (!enc) { try { new TextDecoder('utf-8', { fatal: true }).decode(u8); enc = 'utf-8'; } catch (e) { enc = 'windows-1252'; } }
      }
    } else if (enc === 'utf8') enc = 'utf-8'; else if (enc === 'latin1' || enc === 'iso-8859-1' || enc === 'cp1252') enc = 'windows-1252';
    else if (enc === 'utf-8' && u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) off = 3;
    const body = off ? u8.subarray(off) : u8;
    let text;
    if (enc === 'windows-1252') text = decode1252(body);
    else if (enc === 'utf-16be') { const sw = new Uint8Array(body.length & ~1); for (let i = 0; i + 1 < body.length; i += 2) { sw[i] = body[i + 1]; sw[i + 1] = body[i]; } text = new TextDecoder('utf-16le').decode(sw); }
    else text = new TextDecoder(enc, { ignoreBOM: true }).decode(body);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return { text, encoding: enc };
  }

  // ---------- RFC4180 parser ----------
  // Returns rows (arrays of strings). maxRows limits work for delimiter sniffing.
  function parseText(s, delim, maxRows) {
    const rows = []; let row = []; const n = s.length; const dc = delim.charCodeAt(0); let i = 0;
    while (i < n) {
      let ch = s.charCodeAt(i), field;
      if (ch === 34) {
        let j = i + 1, out = '';
        for (;;) {
          const k = s.indexOf('"', j);
          if (k < 0) { out += s.slice(j); i = n; break; }
          if (s.charCodeAt(k + 1) === 34) { out += s.slice(j, k + 1); j = k + 2; continue; }
          out += s.slice(j, k); i = k + 1; break;
        }
        // tolerate garbage after the closing quote up to the delimiter / EOL
        let k = i; while (k < n) { const x = s.charCodeAt(k); if (x === dc || x === 10 || x === 13) break; k++; }
        if (k > i) { out += s.slice(i, k); i = k; }
        field = out;
      } else {
        let j = i; while (j < n) { const x = s.charCodeAt(j); if (x === dc || x === 10 || x === 13) break; j++; }
        field = s.slice(i, j); i = j;
      }
      row.push(field);
      if (i >= n) break;
      ch = s.charCodeAt(i);
      if (ch === dc) { i++; if (i >= n) row.push(''); continue; }
      if (ch === 13 && s.charCodeAt(i + 1) === 10) i += 2; else i++;
      rows.push(row); row = [];
      if (maxRows && rows.length >= maxRows) return rows;
    }
    if (row.length) rows.push(row);
    return rows;
  }

  function detectDelimiter(text) {
    const sample = text.length > 200000 ? text.slice(0, 200000) : text;
    let best = ',', bestScore = -1;
    for (const d of [',', ';', '\t', '|']) {
      if (sample.indexOf(d) < 0) continue;
      const rows = parseText(sample, d, 30); if (!rows.length) continue;
      const cnt = new Map(); let maxCols = 0;
      for (const r of rows) { cnt.set(r.length, (cnt.get(r.length) || 0) + 1); if (r.length > maxCols) maxCols = r.length; }
      let mode = 0, modeN = 0; for (const [k, v] of cnt) if (v > modeN || (v === modeN && k > mode)) { mode = k; modeN = v; }
      if (mode < 2) continue;
      const score = (modeN / rows.length) * 1000 + Math.min(mode, 50); // consistency first, then width
      if (score > bestScore + 1e-9) { bestScore = score; best = d; }
    }
    return best;
  }

  const csv = IO.csv = {};
  csv.parse = (input, opts = {}) => {
    let text, encoding;
    if (typeof input === 'string') { text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input; encoding = 'utf-8'; }
    else { const d = decodeBytes(U.toU8(input), opts.encoding); text = d.text; encoding = d.encoding; }
    const delimiter = opts.delimiter && opts.delimiter !== 'auto' ? (opts.delimiter === 'tab' ? '\t' : opts.delimiter) : detectDelimiter(text);
    return { rows: parseText(text, delimiter), delimiter, encoding };
  };
  csv.parseText = parseText;

  csv.toWorkbook = (input, opts = {}) => {
    const res = typeof input === 'object' && input && input.rows ? input : csv.parse(input, opts);
    const wb = ZN.newWorkbook(); const sh = wb.sheets[0];
    if (opts.name) sh.name = String(opts.name).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet1';
    const nfCache = new Map(); const rows = res.rows; let maxC = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]; if (row.length > maxC) maxC = row.length;
      for (let c = 0; c < row.length; c++) {
        const s = row[c]; if (s === '') continue;
        const t = U.typed(s);
        if (t) {
          const cell = { v: t.v };
          if (t.nf) { let id = nfCache.get(t.nf); if (id === undefined) { id = wb.internStyle({ nf: t.nf }); nfCache.set(t.nf, id); } if (id) cell.s = id; }
          sh.setRaw(r, c, cell);
        } else sh.setRaw(r, c, { v: s });
      }
    }
    wb.finish();
    return wb;
  };

  csv.stringify = (sheet, o = {}) => {
    const delim = o.delimiter === 'tab' ? '\t' : o.delimiter || ','; const formatted = o.formatted !== false; const wb = sheet.wb;
    let r1 = 0, c1 = 0, r2 = sheet.maxRow(), c2 = sheet.maxCol();
    if (o.range) { const g = o.range; if (Array.isArray(g)) [r1, c1, r2, c2] = g; else { r1 = g.r1; c1 = g.c1; r2 = g.r2; c2 = g.c2; } }
    const need = new RegExp('["\\r\\n' + delim.replace(/[\\\]^-]/g, '\\$&') + ']');
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const parts = [];
      for (let c = c1; c <= c2; c++) {
        const cell = sheet.getCell(r, c); let t = '';
        if (cell && cell.v !== undefined && cell.v !== null) {
          if (formatted) { const st = cell.s !== undefined && wb ? wb.style(cell.s) : null; t = U.fmtText(cell.v, st && st.nf); } else t = U.rawText(cell.v);
        }
        parts.push(need.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
      }
      lines.push(parts.join(delim));
    }
    return (o.bom ? '﻿' : '') + lines.join('\r\n') + (lines.length ? '\r\n' : '');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
