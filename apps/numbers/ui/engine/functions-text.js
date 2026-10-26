/* ZengNumbers text functions. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { E, ZErr } = ZN; const F = ZN.F; const { isErr, toNum, toStr, scalar } = F; const fmt = ZN.fmt;
  const reg = (names, min, max, impl, hint, desc, opts) => ZN.fn.def(names, min, max, impl, Object.assign({ cat: 'Text', hint, desc }, opts));
  const str = (v) => toStr(v);
  const cnt = (v, d) => { if (v === undefined) return d; const n = toNum(v); return isErr(n) ? n : Math.trunc(n); };
  const MAXLEN = 32767;
  const wide = (ch) => (ZN.dbcs && ch.codePointAt(0) > 0xff ? 2 : 1);
  const blen = (s) => { let n = 0; for (const ch of s) n += wide(ch) * (ch.length); return ZN.dbcs ? n : s.length; };
  // slice by "bytes" (== chars unless ZN.dbcs)
  const bslice = (s, start, count) => { if (!ZN.dbcs) return s.substr(start, count); let out = '', pos = 0; for (const ch of s) { const w = wide(ch); if (pos >= start && pos + w <= start + count) out += ch; pos += w; } return out; };

  // ---- CP1252 mapping for CHAR / CODE
  const CP = [0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178];
  const CPREV = new Map(CP.map((c, i) => [c, 128 + i]));

  reg('CONCAT', 1, 253, (...a) => { const out = []; for (const x of a) { for (const v of F.flat(x)) { if (isErr(v)) return v; out.push(str(v)); } } const s = out.join(''); return s.length > MAXLEN ? E.VALUE : s; }, 'CONCAT(text1, [text2], …)', 'Joins text from multiple strings and ranges.', { errs: true });
  reg('CONCATENATE', 1, 255, (...a) => { const s = a.map(str).join(''); return s.length > MAXLEN ? E.VALUE : s; }, 'CONCATENATE(text1, [text2], …)', 'Joins several text items into one.', { lift: true });
  reg('TEXTJOIN', 3, 255, (delim, ign, ...a) => {
    const ds = F.flat(delim === undefined ? '' : delim); for (const d of ds) if (isErr(d)) return d;
    const ie = F.toBool(scalar(ign)); if (isErr(ie)) return ie; const parts = [];
    for (const x of a) for (const v of F.flat(x)) { if (isErr(v)) return v; if (ie && (v == null || v === '')) continue; parts.push(str(v)); }
    let out = ''; parts.forEach((p, i) => { out += (i ? str(ds.length ? ds[(i - 1) % ds.length] : '') : '') + p; });
    return out.length > MAXLEN ? E.VALUE : out;
  }, 'TEXTJOIN(delimiter, ignore_empty, text1, [text2], …)', 'Joins text with a delimiter, optionally skipping empty items.', { errs: true });
  reg('LEFT', 1, 2, (t, n) => { const k = cnt(n, 1); if (isErr(k)) return k; if (k < 0) return E.VALUE; return str(t).slice(0, k); }, 'LEFT(text, [num_chars])', 'Returns the first characters of a text string.', { lift: true });
  reg('RIGHT', 1, 2, (t, n) => { const k = cnt(n, 1); if (isErr(k)) return k; if (k < 0) return E.VALUE; const s = str(t); return k === 0 ? '' : s.slice(-k); }, 'RIGHT(text, [num_chars])', 'Returns the last characters of a text string.', { lift: true });
  reg('MID', 3, 3, (t, st, n) => { const a = cnt(st), k = cnt(n); if (isErr(a)) return a; if (isErr(k)) return k; if (a < 1 || k < 0) return E.VALUE; return str(t).substr(a - 1, k); }, 'MID(text, start_num, num_chars)', 'Returns characters from the middle of a text string.', { lift: true });
  reg('LEN', 1, 1, (t) => str(t).length, 'LEN(text)', 'Returns the number of characters in a text string.', { lift: true });
  reg('LENB', 1, 1, (t) => blen(str(t)), 'LENB(text)', 'Returns the number of bytes in a text string.', { lift: true });
  reg('LEFTB', 1, 2, (t, n) => { const k = cnt(n, 1); if (isErr(k)) return k; if (k < 0) return E.VALUE; return bslice(str(t), 0, k); }, 'LEFTB(text, [num_bytes])', 'Returns the first bytes of a text string.', { lift: true });
  reg('RIGHTB', 1, 2, (t, n) => { const k = cnt(n, 1); if (isErr(k)) return k; if (k < 0) return E.VALUE; const s = str(t); const L = blen(s); return bslice(s, Math.max(0, L - k), k); }, 'RIGHTB(text, [num_bytes])', 'Returns the last bytes of a text string.', { lift: true });
  reg('MIDB', 3, 3, (t, st, n) => { const a = cnt(st), k = cnt(n); if (isErr(a)) return a; if (isErr(k)) return k; if (a < 1 || k < 0) return E.VALUE; return bslice(str(t), a - 1, k); }, 'MIDB(text, start_num, num_bytes)', 'Returns bytes from the middle of a text string.', { lift: true });

  const findImpl = (ci) => (find, within, start) => {
    const f = str(find), s = str(within); const st = cnt(start, 1); if (isErr(st)) return st; if (st < 1 || st > Math.max(1, s.length)) return E.VALUE;
    if (ci && /[*?~]/.test(f)) { const src = F.wildRe(f).source.slice(1, -1); const m = new RegExp(src, 'i').exec(s.slice(st - 1)); return m ? m.index + st : E.VALUE; }
    const i = ci ? s.toLowerCase().indexOf(f.toLowerCase(), st - 1) : s.indexOf(f, st - 1); return i < 0 ? E.VALUE : i + 1;
  };
  reg('FIND', 2, 3, findImpl(false), 'FIND(find_text, within_text, [start_num])', 'Finds one text string inside another (case-sensitive).', { lift: true });
  reg('FINDB', 2, 3, findImpl(false), 'FINDB(find_text, within_text, [start_num])', 'Finds one text string inside another by byte (case-sensitive).', { lift: true });
  reg('SEARCH', 2, 3, findImpl(true), 'SEARCH(find_text, within_text, [start_num])', 'Finds one text string inside another (case-insensitive, wildcards ? * ~).', { lift: true });
  reg('SEARCHB', 2, 3, findImpl(true), 'SEARCHB(find_text, within_text, [start_num])', 'Finds one text string inside another by byte (case-insensitive).', { lift: true });
  reg('SUBSTITUTE', 3, 4, (t, o, n, inst) => {
    const s = str(t), old = str(o), nw = str(n); if (old === '') return s;
    if (inst === undefined) return s.split(old).join(nw);
    const k = cnt(inst); if (isErr(k)) return k; if (k < 1) return E.VALUE;
    let pos = -1, from = 0; for (let i = 0; i < k; i++) { pos = s.indexOf(old, from); if (pos < 0) return s; from = pos + old.length; }
    return s.slice(0, pos) + nw + s.slice(pos + old.length);
  }, 'SUBSTITUTE(text, old_text, new_text, [instance_num])', 'Replaces existing text with new text in a string.', { lift: true });
  const replaceImpl = (t, st, n, nw) => { const a = cnt(st), k = cnt(n); if (isErr(a)) return a; if (isErr(k)) return k; if (a < 1 || k < 0) return E.VALUE; const s = str(t); return s.slice(0, a - 1) + str(nw) + s.slice(a - 1 + k); };
  reg('REPLACE', 4, 4, replaceImpl, 'REPLACE(old_text, start_num, num_chars, new_text)', 'Replaces part of a text string with different text.', { lift: true });
  reg('REPLACEB', 4, 4, replaceImpl, 'REPLACEB(old_text, start_num, num_bytes, new_text)', 'Replaces part of a text string by byte position.', { lift: true });
  reg('TRIM', 1, 1, (t) => str(t).replace(/ +/g, ' ').replace(/^ | $/g, ''), 'TRIM(text)', 'Removes extra spaces from text.', { lift: true });
  reg('CLEAN', 1, 1, (t) => str(t).replace(/[\x00-\x1f]/g, ''), 'CLEAN(text)', 'Removes non-printable characters from text.', { lift: true });
  reg('UPPER', 1, 1, (t) => str(t).toUpperCase(), 'UPPER(text)', 'Converts text to uppercase.', { lift: true });
  reg('LOWER', 1, 1, (t) => str(t).toLowerCase(), 'LOWER(text)', 'Converts text to lowercase.', { lift: true });
  reg('PROPER', 1, 1, (t) => { let out = '', up = true; for (const ch of str(t)) { const letter = /\p{L}/u.test(ch); out += letter ? (up ? ch.toUpperCase() : ch.toLowerCase()) : ch; up = !letter; } return out; }, 'PROPER(text)', 'Capitalizes the first letter of each word.', { lift: true });
  reg('EXACT', 2, 2, (a, b) => str(a) === str(b), 'EXACT(text1, text2)', 'Checks whether two text strings are exactly the same.', { lift: true });
  reg('REPT', 2, 2, (t, n) => { const k = cnt(n); if (isErr(k)) return k; if (k < 0) return E.VALUE; const s = str(t); if (s.length * k > MAXLEN) return E.VALUE; return s.repeat(k); }, 'REPT(text, number_times)', 'Repeats text a given number of times.', { lift: true });
  reg('CHAR', 1, 1, (n) => { const k = cnt(n); if (isErr(k)) return k; if (k < 1 || k > 255) return E.VALUE; return String.fromCharCode(k >= 128 && k < 160 ? CP[k - 128] : k); }, 'CHAR(number)', 'Returns the character for a code number (1-255).', { lift: true });
  reg('CODE', 1, 1, (t) => { const s = str(t); if (s === '') return E.VALUE; const c = s.codePointAt(0); if (c < 128) return c; if (CPREV.has(c)) return CPREV.get(c); return c < 256 ? c : 63; }, 'CODE(text)', 'Returns the numeric code of the first character.', { lift: true });
  reg('UNICHAR', 1, 1, (n) => { const k = cnt(n); if (isErr(k)) return k; if (k < 1 || k > 0x10ffff || (k >= 0xd800 && k <= 0xdfff)) return E.VALUE; return String.fromCodePoint(k); }, 'UNICHAR(number)', 'Returns the Unicode character for a number.', { lift: true });
  reg('UNICODE', 1, 1, (t) => { const s = str(t); return s === '' ? E.VALUE : s.codePointAt(0); }, 'UNICODE(text)', 'Returns the Unicode number of the first character.', { lift: true });
  reg('ASC', 1, 1, (t) => str(t).replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' '), 'ASC(text)', 'Converts full-width characters to half-width.', { lift: true });
  reg(['JIS', 'DBCS'], 1, 1, (t) => str(t).replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, '　'), 'JIS(text)', 'Converts half-width characters to full-width.', { lift: true });
  reg('PHONETIC', 1, 1, (r) => str(scalar(r)), 'PHONETIC(reference)', 'Returns the phonetic text of a reference (the text itself).');
  reg('ENCODEURL', 1, 1, (t) => encodeURIComponent(str(t)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()), 'ENCODEURL(text)', 'Returns a URL-encoded string.', { lift: true });

  // ---- TEXT / VALUE / numeric text
  reg('TEXT', 2, 2, (v, f) => {
    const code = str(f); if (code === '') return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (v == null) v = 0;
    if (typeof v === 'string') { const p = v.trim() === '' ? null : ZN.parseValue(v); if (p && typeof p.v === 'number') v = p.v; }
    const r = fmt.format(v, code, { maxChars: 20 }); if (r.bad) return E.VALUE; return r.text;
  }, 'TEXT(value, format_text)', 'Formats a number or date using a format code.', { lift: true });
  reg('VALUE', 1, 1, (t) => {
    if (typeof t === 'number') return t; if (t == null) return 0; if (typeof t !== 'string') return E.VALUE;
    const s = t.trim(); if (s === '') return E.VALUE; const p = ZN.parseValue(s); return p && typeof p.v === 'number' ? p.v : E.VALUE;
  }, 'VALUE(text)', 'Converts text that looks like a number, date or time into a number.', { lift: true });
  reg('NUMBERVALUE', 1, 3, (t, d, g) => {
    let s = str(t).replace(/\s/g, ''); const ds = d === undefined || str(d) === '' ? '.' : str(d)[0], gs = g === undefined || str(g) === '' ? ',' : str(g)[0]; if (ds === gs) return E.VALUE;
    if (s === '') return 0; let pct = 0; while (s.endsWith('%')) { pct++; s = s.slice(0, -1); }
    const di = s.indexOf(ds); if (di >= 0 && s.indexOf(ds, di + 1) >= 0) return E.VALUE;
    let ip = di < 0 ? s : s.slice(0, di); const fp = di < 0 ? '' : s.slice(di + 1); if (fp.indexOf(gs) >= 0) return E.VALUE;
    ip = ip.split(gs).join(''); const num = ip + (di >= 0 ? '.' + fp : ''); if (!F.NUMRE.test(num) || num === '') return E.VALUE;
    return parseFloat(num) / Math.pow(100, pct);
  }, 'NUMBERVALUE(text, [decimal_separator], [group_separator])', 'Converts text to a number independent of locale.', { lift: true });
  const group3 = (i) => i.replace(/\B(?=(\d{3})+$)/g, ',');
  const fixedText = (x, d, commas) => {
    const r = fmt.roundTo(x, d); const f = fmt.fixedDigits(Math.abs(r), Math.max(0, d)); let int = f.int || '0'; if (commas) int = group3(int);
    return { neg: r < 0, body: int + (d > 0 ? '.' + f.frac : '') };
  };
  reg('FIXED', 1, 3, (x, d, nc) => {
    const n = toNum(x); if (isErr(n)) return n; const k = cnt(d, 2); if (isErr(k)) return k; const b = nc === undefined ? false : F.toBool(nc); if (isErr(b)) return b;
    const r = fixedText(n, Math.max(-30, Math.min(30, k)), !b); return (r.neg ? '-' : '') + r.body;
  }, 'FIXED(number, [decimals], [no_commas])', 'Formats a number as text with a fixed number of decimals.', { lift: true });
  reg('DOLLAR', 1, 2, (x, d) => {
    const n = toNum(x); if (isErr(n)) return n; const k = cnt(d, 2); if (isErr(k)) return k;
    const r = fixedText(n, Math.max(-30, Math.min(30, k)), true); return r.neg ? '($' + r.body + ')' : '$' + r.body;
  }, 'DOLLAR(number, [decimals])', 'Formats a number as currency text.', { lift: true });

  // ---- TEXTSPLIT / TEXTBEFORE / TEXTAFTER
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const delimRe = (list, ci, g) => new RegExp(list.slice().sort((a, b) => b.length - a.length).map(escRe).join('|'), (g ? 'g' : '') + (ci ? 'i' : ''));
  const delimList = (v) => { const out = []; for (const x of F.flat(v)) { if (isErr(x)) return x; if (x !== undefined) out.push(str(x)); } return out; };
  reg('TEXTSPLIT', 2, 6, (text, cd, rd, ie, mm, pad) => {
    const s = str(scalar(text)); const ig = ie === undefined ? false : F.toBool(scalar(ie)); if (isErr(ig)) return ig; const mode = cnt(scalar(mm), 0); if (isErr(mode)) return mode; if (mode !== 0 && mode !== 1) return E.VALUE;
    const cl = cd === undefined ? [] : delimList(cd), rl = rd === undefined ? [] : delimList(rd); if (isErr(cl)) return cl; if (isErr(rl)) return rl;
    if (cl.includes('') || rl.includes('') || (!cl.length && !rl.length)) return E.VALUE;
    let rows = rl.length ? s.split(delimRe(rl, mode === 1)) : [s]; if (ig) rows = rows.filter((r) => r !== '');
    let grid = rows.map((r) => { let c = cl.length ? r.split(delimRe(cl, mode === 1)) : [r]; if (ig) c = c.filter((x) => x !== ''); return c; });
    if (ig) grid = grid.filter((r) => r.length); if (!grid.length) return E.CALC;
    const w = Math.max(...grid.map((r) => r.length)); const pv = pad === undefined ? E.NA : scalar(pad);
    return grid.map((r) => { const o = r.slice(); while (o.length < w) o.push(pv); return o; });
  }, 'TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with])', 'Splits text into rows and columns using delimiters.', { errs: true });
  const beforeAfter = (after) => (text, delim, inst, mm, me, nf) => {
    const s = str(scalar(text)); const n = cnt(scalar(inst), 1); if (isErr(n)) return n; const mode = cnt(scalar(mm), 0), mend = cnt(scalar(me), 0); if (isErr(mode)) return mode; if (isErr(mend)) return mend;
    if (n === 0 || Math.abs(n) > Math.max(1, s.length) + (s.length === 0 ? 1 : 0) || (mode !== 0 && mode !== 1) || (mend !== 0 && mend !== 1)) return E.VALUE;
    const dl = delimList(delim === undefined ? '' : delim); if (isErr(dl)) return dl;
    const miss = nf === undefined ? E.NA : scalar(nf);
    if (dl.length === 1 && dl[0] === '') return after ? (n > 0 ? s : '') : (n > 0 ? '' : s);
    const ds = dl.filter((x) => x !== ''); if (!ds.length) return miss;
    const ms = [...s.matchAll(delimRe(ds, mode === 1, true))].map((m) => ({ i: m.index, l: m[0].length }));
    let m;
    if (n > 0) { m = ms[n - 1]; if (!m && mend && n === ms.length + 1) m = { i: s.length, l: 0 }; } else { m = ms[ms.length + n]; if (!m && mend && -n === ms.length + 1) m = { i: 0, l: 0 }; }
    if (!m) return miss;
    return after ? s.slice(m.i + m.l) : s.slice(0, m.i);
  };
  reg('TEXTBEFORE', 2, 6, beforeAfter(false), 'TEXTBEFORE(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])', 'Returns the text before a delimiter.', { errs: true });
  reg('TEXTAFTER', 2, 6, beforeAfter(true), 'TEXTAFTER(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])', 'Returns the text after a delimiter.', { errs: true });

  // ---- ARRAYTOTEXT / VALUETOTEXT
  const strict = (v) => (v == null ? '' : typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : isErr(v) ? v.code : toStr(v));
  const concise = (v) => (isErr(v) ? v.code : str(v));
  reg('ARRAYTOTEXT', 1, 2, (a, f) => { const m = cnt(scalar(f), 0); if (isErr(m)) return m; if (m !== 0 && m !== 1) return E.VALUE; const arr = F.toArr2(a); return m === 0 ? arr.map((r) => r.map(concise).join(', ')).join(', ') : '{' + arr.map((r) => r.map(strict).join(',')).join(';') + '}'; }, 'ARRAYTOTEXT(array, [format])', 'Converts an array to text (0 concise, 1 strict).', { errs: true });
  reg('VALUETOTEXT', 1, 2, (v, f) => { const m = cnt(scalar(f), 0); if (isErr(m)) return m; if (m !== 0 && m !== 1) return E.VALUE; const x = scalar(v); return m === 0 ? concise(x) : strict(x); }, 'VALUETOTEXT(value, [format])', 'Converts any value to text (0 concise, 1 strict).', { errs: true });

  // ---- regular expressions (Excel 365)
  const mkRe = (pat, ci, flags) => { try { return new RegExp(pat, (flags || '') + (ci ? 'i' : '')); } catch (e) { return null; } };
  reg('REGEXTEST', 2, 3, (t, p, c) => { const ci = cnt(c, 0); if (isErr(ci)) return ci; const re = mkRe(str(p), ci === 1); return re ? re.test(str(t)) : E.VALUE; }, 'REGEXTEST(text, pattern, [case_sensitivity])', 'Tests whether text matches a regular expression.', { lift: true });
  reg('REGEXEXTRACT', 2, 4, (t, p, rm, c) => {
    const s = str(scalar(t)), mode = cnt(scalar(rm), 0), ci = cnt(scalar(c), 0); if (isErr(mode)) return mode; if (isErr(ci)) return ci; if (mode < 0 || mode > 2) return E.VALUE;
    const re = mkRe(str(scalar(p)), ci === 1, mode === 1 ? 'g' : ''); if (!re) return E.VALUE;
    if (mode === 1) { const all = [...s.matchAll(re)].map((m) => [m[0]]); return all.length ? all : E.NA; }
    const m = re.exec(s); if (!m) return E.NA; if (mode === 0) return m[0];
    return m.length > 1 ? [m.slice(1).map((x) => (x === undefined ? '' : x))] : [[m[0]]];
  }, 'REGEXEXTRACT(text, pattern, [return_mode], [case_sensitivity])', 'Extracts text matching a regular expression.', { errs: true });
  reg('REGEXREPLACE', 3, 5, (t, p, r, o, c) => {
    const s = str(t), rep = str(r), occ = cnt(o, 0), ci = cnt(c, 0); if (isErr(occ)) return occ; if (isErr(ci)) return ci;
    const re = mkRe(str(p), ci === 1, 'g'); if (!re) return E.VALUE; if (occ === 0) return s.replace(re, rep);
    const total = [...s.matchAll(re)].length; const target = occ > 0 ? occ : total + occ + 1; let k = 0;
    return s.replace(re, (...a) => { k++; if (k !== target) return a[0]; const groups = a.slice(1, a.findIndex((x) => typeof x === 'number')); return rep.replace(/\$(\$|&|\d{1,2})/g, (mm, g) => (g === '$' ? '$' : g === '&' ? a[0] : groups[+g - 1] === undefined ? '' : groups[+g - 1])); });
  }, 'REGEXREPLACE(text, pattern, replacement, [occurrence], [case_sensitivity])', 'Replaces text matching a regular expression.', { lift: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
