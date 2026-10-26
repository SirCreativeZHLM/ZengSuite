/* ZengNumbers number-format engine (Excel format-code grammar) + typed-input parsing. Exposes ZN.fmt and ZN.parseValue. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const { ZErr } = ZN; const D = ZN.date;
  const fmt = ZN.fmt = {};
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  fmt.MONTHS = MONTHS; fmt.DAYS = DAYN;

  // ---------------------------------------------------------------- decimal helpers (15 significant digits like Excel)
  // value = 0.d * 10^e  (d: digits without leading/trailing zeros; '' for zero)
  function dec(x) {
    if (x === 0) return { d: '', e: 0 };
    const m = /^(\d)\.(\d+)e([+-]\d+)$/.exec(x.toExponential(14));
    return { d: (m[1] + m[2]).replace(/0+$/, ''), e: +m[3] + 1 };
  }
  function fixedD(o, n) { // -> {int, frac}; int '' when < 1; frac has exactly n digits (round half away from zero on the decimal digits)
    const d = o.d, e = o.e; let int, frac;
    if (d === '') return { int: '', frac: '0'.repeat(n) };
    if (e > 0) { int = d.length >= e ? d.slice(0, e) : d + '0'.repeat(e - d.length); frac = d.length > e ? d.slice(e) : ''; } else { int = ''; frac = '0'.repeat(-e) + d; }
    if (frac.length > n) {
      const up = frac.charCodeAt(n) >= 53; frac = frac.slice(0, n);
      if (up) {
        const arr = (int + frac).split(''); let i = arr.length - 1;
        for (; i >= 0; i--) { if (arr[i] === '9') arr[i] = '0'; else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); break; } }
        let all = arr.join(''); if (i < 0) all = '1' + all; int = all.slice(0, all.length - n); frac = all.slice(all.length - n);
      }
    } else frac += '0'.repeat(n - frac.length);
    return { int: int.replace(/^0+/, ''), frac };
  }
  const fixed = (x, n) => fixedD(dec(x), n);
  fmt.fixedDigits = fixed;
  // Excel-style ROUND to n decimals (n may be negative), half away from zero
  fmt.roundTo = (x, n) => { if (!isFinite(x)) return x; const neg = x < 0; let a = Math.abs(x), r; if (n >= 0) { const f = fixed(a, Math.min(n, 30)); r = parseFloat((f.int || '0') + '.' + f.frac); } else { const p = Math.pow(10, -n); r = Math.round(parseFloat((a / p).toPrecision(15))) * p; } return neg ? -r : r; };

  // General format: fit into maxChars characters
  function general(v, maxChars) {
    if (v === 0) return { text: '0', fits: true };
    const mc = maxChars || 11; const neg = v < 0, x = Math.abs(v); const o = dec(x); const e = o.e; const avail = mc - (neg ? 1 : 0);
    const sign = neg ? '-' : '';
    const sci = () => {
      const exp10 = e - 1; const ea = Math.abs(exp10); const elen = ea >= 100 ? 3 : 2; let nd = avail - 2 - (1 + 1 + elen); // "d." + "E+" + digits
      const fits = avail >= 1 + 2 + elen; if (nd < 0) nd = 0;
      let m = fixedD({ d: o.d, e: 1 }, nd), ex = exp10; if (m.int.length > 1) { ex++; m = fixedD({ d: '1', e: 1 }, nd); }
      const fr = m.frac.replace(/0+$/, ''); const es = String(Math.abs(ex)).padStart(2, '0');
      return { text: sign + m.int + (fr ? '.' + fr : '') + 'E' + (ex < 0 ? '-' : '+') + es, fits };
    };
    if (e > 0) {
      if (e > avail || e > 15) return sci();
      const nd = Math.max(0, Math.min(avail - e - 1, 15 - e)); const f = fixed(x, nd);
      if (f.int.length > avail || f.int.length > 15) return sci();
      const fr = f.frac.replace(/0+$/, ''); return { text: sign + f.int + (fr ? '.' + fr : ''), fits: true };
    }
    const nd = avail - 2;
    if (nd < 1 || e <= -8) return sci();
    const f = fixed(x, nd);
    if (f.int === '' && /^0*$/.test(f.frac)) return sci();
    const fr = f.frac.replace(/0+$/, ''); return { text: sign + (f.int || '0') + (fr ? '.' + fr : ''), fits: true };
  }
  fmt.general = (v, maxChars) => general(v, maxChars).text;

  // ---------------------------------------------------------------- format code compiler
  const COLORS = { black: '#000000', blue: '#0000ff', cyan: '#00ffff', green: '#00ff00', magenta: '#ff00ff', red: '#ff0000', white: '#ffffff', yellow: '#ffff00' };
  const PALETTE = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0', '#808080', '#9999ff', '#993366', '#ffffcc', '#ccffff', '#660066', '#ff8080', '#0066cc', '#ccccff', '#000080', '#ff00ff', '#ffff00', '#00ffff', '#800080', '#800000', '#008080', '#0000ff', '#00ccff', '#ccffff', '#ccffcc', '#ffff99', '#99ccff', '#ff99cc', '#cc99ff', '#ffcc99', '#3366ff', '#33cccc', '#99cc00', '#ffcc00', '#ff9900', '#ff6600', '#666699', '#969696', '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333'];
  const cache = new Map();
  const COND = /^(<=|>=|<>|<|>|=)\s*(-?\d*\.?\d+(?:[eE][+-]?\d+)?)$/;

  function splitSections(code) {
    const out = []; let cur = '', i = 0; const n = code.length;
    while (i < n) {
      const ch = code[i];
      if (ch === '"') { let j = code.indexOf('"', i + 1); if (j < 0) j = n - 1; cur += code.slice(i, j + 1); i = j + 1; continue; }
      if (ch === '\\' || ch === '_' || ch === '*') { cur += code.substr(i, 2); i += 2; continue; }
      if (ch === '[') { let j = code.indexOf(']', i); if (j < 0) j = n - 1; cur += code.slice(i, j + 1); i = j + 1; continue; }
      if (ch === ';') { out.push(cur); cur = ''; i++; continue; }
      cur += ch; i++;
    }
    out.push(cur); return out;
  }

  function tokenize(s, acc) {
    const T = acc || { tokens: [], color: null, cond: null };
    const tk = T.tokens; let i = 0; const n = s.length;
    while (i < n) {
      const ch = s[i];
      if (ch === '"') { let j = s.indexOf('"', i + 1); if (j < 0) j = n; tk.push({ t: 'lit', s: s.slice(i + 1, j) }); i = j + 1; continue; }
      if (ch === '\\') { if (i + 1 < n) tk.push({ t: 'lit', s: s[i + 1] }); i += 2; continue; }
      if (ch === '_') { tk.push({ t: 'pad', c: s[i + 1] || ' ' }); i += 2; continue; }
      if (ch === '*') { tk.push({ t: 'fill', c: s[i + 1] || ' ' }); i += 2; continue; }
      if (ch === '[') {
        let j = s.indexOf(']', i); if (j < 0) j = n; const c = s.slice(i + 1, j); i = j + 1; let m;
        if (COLORS[c.toLowerCase()]) T.color = COLORS[c.toLowerCase()];
        else if ((m = /^color\s*(\d+)$/i.exec(c))) { const k = +m[1]; if (k >= 1 && k <= 56) T.color = PALETTE[k - 1]; }
        else if ((m = COND.exec(c))) T.cond = { op: m[1], n: parseFloat(m[2]) };
        else if (c[0] === '$') {
          const r = c.slice(1); const x = r.indexOf('-'); const sym = x < 0 ? r : r.slice(0, x), loc = x < 0 ? '' : r.slice(x + 1).toUpperCase();
          if (loc === 'F800') tokenize('dddd, mmmm d, yyyy', T); else if (loc === 'F400') tokenize('h:mm:ss AM/PM', T); else if (sym) tk.push({ t: 'lit', s: sym });
        } else if ((m = /^(h+|m+|s+)$/i.exec(c))) tk.push({ t: 'el', k: m[1][0].toLowerCase(), n: m[1].length });
        continue;
      }
      if (ch === '0' || ch === '#' || ch === '?') { tk.push({ t: 'dg', c: ch }); i++; continue; }
      if (ch === '.') { tk.push({ t: 'dec' }); i++; continue; }
      if (ch === ',') { tk.push({ t: 'cm' }); i++; continue; }
      if (ch === '%') { tk.push({ t: 'pct' }); i++; continue; }
      if (ch === '/') { tk.push({ t: 'sl' }); i++; continue; }
      if (ch === '@') { tk.push({ t: 'at' }); i++; continue; }
      if ((ch === 'E' || ch === 'e') && (s[i + 1] === '+' || s[i + 1] === '-')) { tk.push({ t: 'exp', c: ch, sign: s[i + 1] }); i += 2; continue; }
      if ((ch === 'G' || ch === 'g') && s.substr(i, 7).toLowerCase() === 'general') { tk.push({ t: 'gen' }); i += 7; continue; }
      if (ch === 'A' || ch === 'a') { const m = /^(AM\/PM|A\/P)/i.exec(s.substr(i, 5)); if (m) { tk.push({ t: 'ap', s: m[1], lower: m[1][0] === 'a', short: m[1].length === 3 }); i += m[1].length; continue; } }
      const lc = ch.toLowerCase();
      if (lc === 'y' || lc === 'm' || lc === 'd' || lc === 'h' || lc === 's') { let j = i; while (j < n && s[j].toLowerCase() === lc) j++; tk.push({ t: 'd', k: lc, n: j - i }); i = j; continue; }
      if (ch >= '1' && ch <= '9') { tk.push({ t: 'lit', s: ch, dig: true }); i++; continue; }
      tk.push({ t: 'lit', s: ch }); i++;
    }
    return T;
  }
  const isDT = (t) => t.t === 'd' || t.t === 'el' || t.t === 'ap' || t.t === 'fs';
  function buildSection(str) {
    const T = tokenize(str); const tk = T.tokens;
    const hasDate = tk.some((t) => t.t === 'd' || t.t === 'ap' || t.t === 'el');
    let kind = 'num';
    if (hasDate) {
      kind = 'date';
      for (let i = 1; i < tk.length; i++) { // fractional seconds: s[s] '.' 0..
        if (tk[i].t === 'dec') { const p = tk[i - 1]; if (((p.t === 'd' && p.k === 's') || (p.t === 'el' && p.k === 's')) && tk[i + 1] && tk[i + 1].t === 'dg' && tk[i + 1].c === '0') { let j = i + 1; while (tk[j] && tk[j].t === 'dg' && tk[j].c === '0') j++; tk.splice(i, j - i, { t: 'fs', n: j - i - 1 }); } }
      }
      for (let i = 0; i < tk.length; i++) {
        const t = tk[i]; if (t.t !== 'd' || t.k !== 'm' || t.n > 2) continue;
        let p = i - 1; while (p >= 0 && !isDT(tk[p])) p--;
        if (p >= 0 && (tk[p].t === 'd' || tk[p].t === 'el') && tk[p].k === 'h') { t.k = 'n'; continue; }
        let q = i + 1; while (q < tk.length && !isDT(tk[q])) q++;
        if (q < tk.length && (tk[q].t === 'd' || tk[q].t === 'el') && tk[q].k === 's') t.k = 'n';
      }
    } else if (tk.some((t) => t.t === 'gen')) kind = 'gen';
    else if (tk.some((t) => t.t === 'at') && !tk.some((t) => t.t === 'dg')) kind = 'text';
    else {
      const sl = tk.findIndex((t) => t.t === 'sl');
      if (sl > 0 && tk[sl - 1].t === 'dg' && tk[sl + 1] && (tk[sl + 1].t === 'dg' || (tk[sl + 1].t === 'lit' && tk[sl + 1].dig))) kind = 'frac';
      else if (tk.some((t, i) => t.t === 'exp' && i > 0 && tk.slice(0, i).some((x) => x.t === 'dg'))) kind = 'sci';
    }
    return { tokens: tk, cond: T.cond, color: T.color, kind };
  }
  function compile(code) {
    let c = cache.get(code); if (c) return c;
    const raw = splitSections(code).slice(0, 4); const secs = raw.map(buildSection);
    c = { secs, nums: secs.length === 4 ? secs.slice(0, 3) : secs, text: null, textOnly: false, anyCond: secs.some((s) => s.cond) };
    if (secs.length === 4) c.text = secs[3]; else if (secs.length === 1 && secs[0].kind === 'text') { c.text = secs[0]; c.textOnly = true; }
    if (cache.size > 800) cache.clear(); cache.set(code, c); return c;
  }
  fmt.compile = compile;

  // ---------------------------------------------------------------- rendering
  function assemble(T, P, sign) {
    let out = sign || '', fill = null;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (P[i] !== undefined) out += P[i];
      else if (t.t === 'lit') out += t.s;
      else if (t.t === 'pad') out += ' ';
      else if (t.t === 'fill') { if (!fill) fill = { char: t.c, at: out.length }; }
    }
    return { text: out, fill };
  }
  function fillInt(T, idx, int, group, P) {
    const Pn = idx.length, I = int.length;
    for (let i = 0; i < Pn; i++) {
      const j = Pn - 1 - i; let s, real;
      if (j < I) { s = i === 0 ? int.slice(0, I - Pn + 1) : int[I - 1 - j]; real = true; } else { const c = T[idx[i]].c; s = c === '0' ? '0' : c === '?' ? ' ' : ''; real = c === '0'; }
      if (group && real) { let o = ''; for (let t = 0; t < s.length; t++) { const k = j + (s.length - 1 - t); o += s[t]; if (k > 0 && k % 3 === 0) o += ','; } s = o; }
      P[idx[i]] = s;
    }
  }
  function fillFrac(T, idx, frac, P) {
    let last = -1; for (let i = 0; i < idx.length; i++) if (frac[i] !== '0') last = i;
    for (let k = 0; k < idx.length; k++) { const c = T[idx[k]].c; P[idx[k]] = k <= last ? frac[k] : c === '0' ? '0' : c === '?' ? ' ' : ''; }
  }
  function analyze(sec) {
    const T = sec.tokens; const info = { int: [], frac: [], dec: -1, group: false, scale: 0, pct: 0, role: {} };
    for (let i = 0; i < T.length; i++) { if (T[i].t === 'dec' && info.dec < 0) info.dec = i; if (T[i].t === 'pct') info.pct++; }
    for (let i = 0; i < T.length; i++) if (T[i].t === 'dg') (info.dec >= 0 && i > info.dec ? info.frac : info.int).push(i);
    for (let i = 0; i < T.length; i++) {
      if (T[i].t !== 'cm') continue;
      const inInt = info.dec < 0 || i < info.dec; const before = T.slice(0, i).some((t) => t.t === 'dg'); const afterAny = T.slice(i + 1).some((t) => t.t === 'dg'); const afterInt = inInt && info.int.some((j) => j > i);
      if (inInt && before && afterInt) { info.group = true; info.role[i] = 'sep'; } else if (before && (inInt ? !afterInt : !afterAny)) { info.scale++; info.role[i] = 'scale'; } else info.role[i] = 'lit';
    }
    return info;
  }
  function renderNum(sec, v, sign) {
    const info = sec.info || (sec.info = analyze(sec)); const T = sec.tokens; const P = new Array(T.length);
    let x = v; if (info.pct) x *= Math.pow(100, info.pct); if (info.scale) x /= Math.pow(1000, info.scale);
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.t === 'dec') P[i] = '.'; else if (t.t === 'pct') P[i] = '%'; else if (t.t === 'sl') P[i] = '/'; else if (t.t === 'cm') P[i] = info.role[i] === 'lit' ? ',' : ''; else if (t.t === 'at' || t.t === 'exp') P[i] = ''; }
    if (info.int.length + info.frac.length === 0) return assemble(T, P, sign);
    const f = fixed(x, info.frac.length);
    if (info.int.length) fillInt(T, info.int, f.int, info.group, P); else if (f.int && info.dec >= 0) P[info.dec] = f.int + '.';
    fillFrac(T, info.frac, f.frac, P);
    return assemble(T, P, sign);
  }
  function renderSci(sec, v, sign) {
    const T = sec.tokens; const P = new Array(T.length); const ei = T.findIndex((t) => t.t === 'exp');
    let decI = -1; for (let i = 0; i < ei; i++) if (T[i].t === 'dec') { decI = i; break; }
    const intIdx = [], fracIdx = [], expIdx = [];
    for (let i = 0; i < T.length; i++) if (T[i].t === 'dg') (i > ei ? expIdx : decI >= 0 && i > decI ? fracIdx : intIdx).push(i);
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.t === 'dec') P[i] = '.'; else if (t.t === 'pct') P[i] = '%'; else if (t.t === 'cm' || t.t === 'at') P[i] = ''; else if (t.t === 'sl') P[i] = '/'; }
    const ni = Math.max(1, intIdx.length), nfr = fracIdx.length; let exp = 0, mant;
    if (v === 0) mant = { int: '', frac: '0'.repeat(nfr) };
    else {
      const o = dec(v); let exp10 = o.e - 1; let shift = ni > 1 ? ((exp10 % ni) + ni) % ni : 0; exp = exp10 - shift; mant = fixedD({ d: o.d, e: 1 + shift }, nfr);
      if (mant.int.length > shift + 1) { exp10++; shift = ni > 1 ? ((exp10 % ni) + ni) % ni : 0; exp = exp10 - shift; mant = fixedD({ d: '1', e: 1 + shift }, nfr); }
    }
    fillInt(T, intIdx, mant.int, false, P); fillFrac(T, fracIdx, mant.frac, P);
    const e = T[ei]; P[ei] = e.c + (exp < 0 ? '-' : e.sign === '+' ? '+' : '');
    const minD = expIdx.filter((i) => T[i].c === '0').length; const es = String(Math.abs(exp)).padStart(Math.max(minD, 1), '0');
    if (expIdx.length) { P[expIdx[0]] = es; for (let k = 1; k < expIdx.length; k++) P[expIdx[k]] = ''; } else P[ei] += es;
    return assemble(T, P, sign);
  }
  function renderFrac(sec, v, sign) {
    const T = sec.tokens; const P = new Array(T.length); const sl = T.findIndex((t) => t.t === 'sl');
    let a = sl - 1; const numIdx = []; while (a >= 0 && T[a].t === 'dg') numIdx.unshift(a--);
    const intIdx = []; for (let i = 0; i < a + 1; i++) if (T[i].t === 'dg') intIdx.push(i);
    const denTok = []; let b = sl + 1; while (b < T.length && (T[b].t === 'dg' || (T[b].t === 'lit' && T[b].dig))) denTok.push(b++);
    const chars = denTok.map((i) => (T[i].t === 'dg' ? T[i].c : T[i].s)); let fixedDen = null;
    if (chars.some((c) => c >= '1' && c <= '9')) fixedDen = parseInt(chars.map((c) => (/\d/.test(c) ? c : '0')).join(''), 10);
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.t === 'dec') P[i] = '.'; else if (t.t === 'pct') P[i] = '%'; else if (t.t === 'cm' || t.t === 'at') P[i] = ''; }
    let ip = 0, fr = v;
    if (intIdx.length) { ip = Math.floor(v + 1e-12 * 0); fr = v - ip; }
    let bn = 0, bd = 1;
    if (fixedDen) { bd = fixedDen; bn = Math.round(fr * bd); } else if (fr !== 0) {
      const maxD = Math.pow(10, Math.max(1, chars.length)) - 1; let be = Infinity;
      for (let d = 1; d <= maxD; d++) { const nn = Math.round(fr * d); const err = Math.abs(fr - nn / d); if (err < be - 1e-13) { be = err; bn = nn; bd = d; if (err < 1e-13) break; } }
    }
    if (intIdx.length && bn >= bd) { ip += Math.floor(bn / bd); bn = bn % bd; }
    let intStr = ip === 0 ? '' : String(ip); if (ip === 0 && bn === 0) intStr = '0';
    if (intIdx.length) fillInt(T, intIdx, intStr, false, P);
    const hide = intIdx.length && bn === 0;
    if (hide) { P[sl] = ' '; for (const i of numIdx) P[i] = ' '; for (let k = 0; k < denTok.length; k++) P[denTok[k]] = ' '; } else {
      const ns = String(bn); const m = numIdx.length;
      for (let k = 0; k < m; k++) { const c = T[numIdx[k]].c; const j = m - 1 - k; let s; if (j < ns.length) s = k === 0 ? ns.slice(0, ns.length - m + 1) : ns[ns.length - 1 - j]; else s = c === '0' ? '0' : c === '?' ? ' ' : ''; P[numIdx[k]] = s; }
      P[sl] = '/';
      if (!fixedDen) { const ds = String(bd); for (let k = 0; k < denTok.length; k++) { const c = T[denTok[k]].c; P[denTok[k]] = k < ds.length ? ds[k] : c === '0' ? '0' : c === '?' ? ' ' : ''; } }
    }
    return assemble(T, P, sign);
  }
  function renderDate(sec, v) {
    const T = sec.tokens; const P = new Array(T.length);
    const hasTime = T.some((t) => t.t === 'ap' || t.t === 'fs' || t.t === 'el' || (t.t === 'd' && (t.k === 'h' || t.k === 'n' || t.k === 's')));
    const fsN = Math.max(0, ...T.filter((t) => t.t === 'fs').map((t) => t.n)); const pw = Math.pow(10, fsN);
    let day, tsec = 0, total = 0;
    if (hasTime) { total = Math.round(v * 86400 * pw + 1e-7) / pw; day = Math.floor(total / 86400); tsec = total - day * 86400; if (tsec >= 86400) { day++; tsec = 0; } } else day = Math.floor(v);
    const ymd = D.toYMD(day); if (!ymd || v >= 2958466) return { bad: true, text: '####', fill: null };
    const h = Math.floor(tsec / 3600), mi = Math.floor((tsec % 3600) / 60), se = Math.floor(tsec % 60); const ap = T.some((t) => t.t === 'ap');
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (t.t === 'd') {
        const n = t.n; let s;
        switch (t.k) {
          case 'y': s = n <= 2 ? String(ymd.y % 100).padStart(2, '0') : String(ymd.y).padStart(4, '0'); break;
          case 'm': s = n === 1 ? String(ymd.m) : n === 2 ? String(ymd.m).padStart(2, '0') : n === 3 ? MONTHS[ymd.m - 1].slice(0, 3) : n === 4 ? MONTHS[ymd.m - 1] : MONTHS[ymd.m - 1][0]; break;
          case 'd': s = n === 1 ? String(ymd.d) : n === 2 ? String(ymd.d).padStart(2, '0') : n === 3 ? DAYN[ymd.wd].slice(0, 3) : DAYN[ymd.wd]; break;
          case 'h': { const hh = ap ? h % 12 || 12 : h; s = n === 1 ? String(hh) : String(hh).padStart(2, '0'); break; }
          case 'n': s = n === 1 ? String(mi) : String(mi).padStart(2, '0'); break;
          case 's': s = n === 1 ? String(se) : String(se).padStart(2, '0'); break;
        }
        P[i] = s;
      } else if (t.t === 'el') {
        const val = t.k === 'h' ? Math.floor(total / 3600) : t.k === 'm' ? Math.floor(total / 60) : Math.floor(total);
        P[i] = String(val).padStart(t.n, '0');
      } else if (t.t === 'ap') { const pm = h >= 12; let s = t.short ? (pm ? 'P' : 'A') : (pm ? 'PM' : 'AM'); P[i] = t.lower ? s.toLowerCase() : s; }
      else if (t.t === 'fs') { const fr = Math.round((tsec - Math.floor(tsec)) * pw); P[i] = '.' + String(fr).padStart(t.n, '0'); }
      else if (t.t === 'dg' || t.t === 'at' || t.t === 'exp') P[i] = '';
      else if (t.t === 'dec') P[i] = '.'; else if (t.t === 'cm') P[i] = ',';
      else if (t.t === 'sl') P[i] = '/'; else if (t.t === 'pct') P[i] = '%';
    }
    return assemble(T, P, '');
  }

  const mk = (text, color, align, isNumeric, extra) => Object.assign({ text, color: color || null, align: align || null, fill: null, isNumeric, fits: true }, extra);
  const testCond = (c, v) => (c.op === '<' ? v < c.n : c.op === '>' ? v > c.n : c.op === '<=' ? v <= c.n : c.op === '>=' ? v >= c.n : c.op === '=' ? v === c.n : v !== c.n);
  function pick(c, v) {
    const S = c.nums, n = S.length; if (n === 1) return { sec: S[0], abs: false };
    let idx = -1;
    if (!c.anyCond) idx = n === 2 ? (v >= 0 ? 0 : 1) : v > 0 ? 0 : v < 0 ? 1 : 2;
    else for (let i = 0; i < n; i++) { const s = S[i]; if (s.cond ? testCond(s.cond, v) : i === n - 1 ? true : i === 0 ? v > 0 : v < 0) { idx = i; break; } }
    if (idx < 0) idx = n - 1;
    return { sec: S[idx], abs: !c.anyCond && idx >= 1 && v < 0 };
  }
  function fmtString(value, code) {
    if (code === 'General') return mk(value, null, 'left', false);
    const c = compile(code); const sec = c.text; if (!sec) return mk(value, null, 'left', false);
    const P = sec.tokens.map((t) => (t.t === 'at' ? value : undefined)); const r = assemble(sec.tokens, P, '');
    return mk(r.text, sec.color, 'left', false, { fill: r.fill });
  }

  fmt.format = function format(value, code, opts) {
    if (code == null || code === '') code = 'General';
    if (value instanceof ZErr) return mk(value.code, null, 'center', false);
    if (value == null) return mk('', null, null, false);
    if (typeof value === 'boolean') return mk(value ? 'TRUE' : 'FALSE', null, 'center', false);
    if (typeof value === 'string') return fmtString(value, code);
    if (typeof value !== 'number') value = Number(value);
    if (!isFinite(value)) return mk('#NUM!', null, 'center', false);
    if (value === 0) value = 0;
    if (code === 'General' || code.toLowerCase() === 'general') { const g = general(value, (opts && opts.maxChars) || 11); return mk(g.text, null, 'right', true, { fits: g.fits }); }
    const c = compile(code);
    if (c.textOnly) return mk(general(value, 15).text, c.text.color, 'right', true);
    const { sec, abs } = pick(c, value); const neg = value < 0 && !abs && sec.kind !== 'date'; const x = Math.abs(value); const sign = neg ? '-' : '';
    let r;
    switch (sec.kind) {
      case 'date': if (value < 0) return mk('####', sec.color, 'right', true, { fits: false, bad: true }); r = renderDate(sec, x); if (r.bad) return mk('####', sec.color, 'right', true, { fits: false, bad: true }); break;
      case 'sci': r = renderSci(sec, x, sign); break;
      case 'frac': r = renderFrac(sec, x, sign); break;
      case 'gen': { const T = sec.tokens; const P = T.map((t) => (t.t === 'gen' ? general(x, 15).text : t.t === 'at' ? '' : undefined)); r = assemble(T, P, sign); break; }
      case 'text': { const T = sec.tokens; const P = T.map((t) => (t.t === 'at' ? general(value, 15).text : undefined)); r = assemble(T, P, ''); break; }
      default: r = renderNum(sec, x, sign);
    }
    return mk(r.text, sec.color, 'right', true, { fill: r.fill });
  };

  // ---------------------------------------------------------------- built-in codes
  fmt.builtinById = {
    0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '$#,##0_);($#,##0)', 6: '$#,##0_);[Red]($#,##0)', 7: '$#,##0.00_);($#,##0.00)', 8: '$#,##0.00_);[Red]($#,##0.00)',
    9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm',
    37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
    41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', 42: '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)', 43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 44: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
    45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
  };
  fmt.idByBuiltin = {}; for (const k of Object.keys(fmt.builtinById)) fmt.idByBuiltin[fmt.builtinById[k]] = +k;
  const B = fmt.builtinById;
  fmt.builtinList = [
    { cat: 'General', label: 'General', code: 'General' },
    { cat: 'Number', label: '0', code: '0' }, { cat: 'Number', label: '0.00', code: '0.00' }, { cat: 'Number', label: '#,##0', code: '#,##0' }, { cat: 'Number', label: '#,##0.00', code: '#,##0.00' },
    { cat: 'Number', label: '#,##0.00;(#,##0.00)', code: B[39] }, { cat: 'Number', label: '#,##0.00 red negatives', code: B[40] },
    { cat: 'Currency', label: '$#,##0', code: '$#,##0' }, { cat: 'Currency', label: '$#,##0.00', code: '$#,##0.00' }, { cat: 'Currency', label: '$#,##0.00;($#,##0.00)', code: B[7] }, { cat: 'Currency', label: '$#,##0.00 red negatives', code: B[8] },
    { cat: 'Currency', label: '€#,##0.00', code: '€#,##0.00' }, { cat: 'Currency', label: '£#,##0.00', code: '£#,##0.00' }, { cat: 'Currency', label: '¥#,##0', code: '¥#,##0' },
    { cat: 'Accounting', label: 'Accounting (no symbol)', code: B[43] }, { cat: 'Accounting', label: 'Accounting ($)', code: B[44] }, { cat: 'Accounting', label: 'Accounting ($, 0 decimals)', code: B[42] },
    { cat: 'Date', label: '3/14/2012', code: 'm/d/yyyy' }, { cat: 'Date', label: '14-Mar-12', code: 'd-mmm-yy' }, { cat: 'Date', label: '14-Mar', code: 'd-mmm' }, { cat: 'Date', label: 'Mar-12', code: 'mmm-yy' }, { cat: 'Date', label: '2012-03-14', code: 'yyyy-mm-dd' },
    { cat: 'Date', label: 'Wednesday, March 14, 2012', code: 'dddd, mmmm d, yyyy' }, { cat: 'Date', label: 'March 14, 2012', code: 'mmmm d, yyyy' }, { cat: 'Date', label: '14 March 2012', code: 'd mmmm yyyy' }, { cat: 'Date', label: 'March 2012', code: 'mmmm yyyy' }, { cat: 'Date', label: 'Wednesday', code: 'dddd' }, { cat: 'Date', label: '03/14/12', code: 'mm/dd/yy' },
    { cat: 'Time', label: '1:30 PM', code: 'h:mm AM/PM' }, { cat: 'Time', label: '1:30:55 PM', code: 'h:mm:ss AM/PM' }, { cat: 'Time', label: '13:30', code: 'h:mm' }, { cat: 'Time', label: '13:30:55', code: 'h:mm:ss' }, { cat: 'Time', label: '3/14/2012 13:30', code: 'm/d/yyyy h:mm' }, { cat: 'Time', label: '30:55', code: 'mm:ss' }, { cat: 'Time', label: '37:30:55 (elapsed)', code: '[h]:mm:ss' }, { cat: 'Time', label: '30:55.0', code: 'mm:ss.0' },
    { cat: 'Percentage', label: '0%', code: '0%' }, { cat: 'Percentage', label: '0.00%', code: '0.00%' },
    { cat: 'Fraction', label: 'Up to one digit (1/4)', code: '# ?/?' }, { cat: 'Fraction', label: 'Up to two digits (21/25)', code: '# ??/??' }, { cat: 'Fraction', label: 'As halves (1/2)', code: '# ?/2' }, { cat: 'Fraction', label: 'As quarters (2/4)', code: '# ?/4' }, { cat: 'Fraction', label: 'As eighths (4/8)', code: '# ?/8' }, { cat: 'Fraction', label: 'As sixteenths (8/16)', code: '# ??/16' },
    { cat: 'Scientific', label: '0.00E+00', code: '0.00E+00' }, { cat: 'Scientific', label: '0.0E+00', code: '0.0E+00' }, { cat: 'Scientific', label: '##0.0E+0', code: '##0.0E+0' },
    { cat: 'Text', label: '@', code: '@' },
    { cat: 'Custom', label: '0.0', code: '0.0' }, { cat: 'Custom', label: '#,##0,"K"', code: '#,##0,"K"' }, { cat: 'Custom', label: '0.0,,"M"', code: '0.0,,"M"' }, { cat: 'Custom', label: '[Blue]#,##0;[Red]-#,##0', code: '[Blue]#,##0;[Red]-#,##0' }, { cat: 'Custom', label: '0;-0;;@ (hide zeros)', code: '0;-0;;@' }, { cat: 'Custom', label: '000000', code: '000000' }, { cat: 'Custom', label: '0.00 "units"', code: '0.00 "units"' },
  ];

  fmt.isDate = (code) => { if (!code) return false; const c = compile(code); return c.nums.some((s) => s.kind === 'date'); };
  fmt.isText = (code) => code === '@';
  fmt.categoryOf = (code) => {
    if (!code || code.toLowerCase() === 'general') return 'General'; if (code === '@') return 'Text';
    const c = compile(code); const s0 = c.nums.find((s) => s.kind === 'date');
    if (s0) { const hasD = s0.tokens.some((t) => t.t === 'd' && (t.k === 'y' || t.k === 'm' || t.k === 'd')); return hasD ? 'Date' : 'Time'; }
    const all = c.secs.flatMap((s) => s.tokens);
    if (all.some((t) => t.t === 'exp')) return 'Scientific';
    if (c.secs[0].kind === 'frac') return 'Fraction';
    if (all.some((t) => t.t === 'pct')) return 'Percentage';
    if (all.some((t) => t.t === 'fill') && all.some((t) => t.t === 'pad')) return 'Accounting';
    if (/[$€£¥]/.test(code.replace(/"[^"]*"/g, '')) || /\[\$/.test(code)) return 'Currency';
    const stripped = code.replace(/\[(Red|Black|Blue|Green|Cyan|Magenta|White|Yellow)\]/gi, '').replace(/_./g, '');
    if (/^[0#?,.\-() ;]+$/.test(stripped) && /0/.test(stripped)) return 'Number';
    return 'Custom';
  };
  fmt.currencyCode = (symbol, decimals, negStyle) => {
    const d = decimals > 0 ? '.' + '0'.repeat(decimals) : ''; const sym = symbol == null ? '$' : String(symbol); const lit = /^[$€£¥]$/.test(sym) ? sym : sym ? '"' + sym.replace(/"/g, '') + '"' : '';
    const body = lit + '#,##0' + d; const ns = negStyle == null ? 0 : negStyle;
    if (ns === 1 || ns === 'paren') return body + '_);(' + body + ')';
    if (ns === 2 || ns === 'red') return body + '_);[Red](' + body + ')';
    if (ns === 3 || ns === 'redminus') return body + ';[Red]-' + body;
    return body;
  };
  fmt.adjustDecimals = (code, dir) => {
    if (!code || code.toLowerCase() === 'general') return dir > 0 ? '0.0' : '0';
    const c = compile(code); const raw = splitSections(code);
    const out = raw.map((sec, si) => {
      const cs = c.secs[si]; if (!cs || si > 2 || (cs.kind !== 'num' && cs.kind !== 'sci')) return sec;
      let decPos = -1, lastDigit = -1, lastFrac = -1, fracCount = 0, i = 0; const n = sec.length;
      while (i < n) {
        const ch = sec[i];
        if (ch === '"') { const j = sec.indexOf('"', i + 1); i = j < 0 ? n : j + 1; continue; }
        if (ch === '\\' || ch === '_' || ch === '*') { i += 2; continue; }
        if (ch === '[') { const j = sec.indexOf(']', i); i = j < 0 ? n : j + 1; continue; }
        if ((ch === 'E' || ch === 'e') && (sec[i + 1] === '+' || sec[i + 1] === '-')) break;
        if (ch === '.' && decPos < 0) decPos = i;
        if (ch === '0' || ch === '#' || ch === '?') { lastDigit = i; if (decPos >= 0) { lastFrac = i; fracCount++; } }
        i++;
      }
      if (lastDigit < 0) return sec;
      if (dir > 0) { if (decPos >= 0) { const at = lastFrac >= 0 ? lastFrac + 1 : decPos + 1; return sec.slice(0, at) + '0' + sec.slice(at); } return sec.slice(0, lastDigit + 1) + '.0' + sec.slice(lastDigit + 1); }
      if (decPos < 0 || fracCount === 0) return sec;
      if (fracCount === 1) return sec.slice(0, decPos) + sec.slice(lastFrac + 1);
      return sec.slice(0, lastFrac) + sec.slice(lastFrac + 1);
    });
    return out.join(';');
  };

  // ---------------------------------------------------------------- parsing typed input
  const NUMFAST = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const THOUS = /^([+-]?)(\d{1,3}(?:,\d{3})+)(?:\.(\d*))?$/;
  const PCT = /^([+-]?)(\d+\.?\d*|\.\d+)\s*%$/;
  const CUR = /^(\()?\s*([+-])?\s*([$€£¥])\s*([+-])?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d*))?\s*(\))?$/;
  const PAREN = /^\(\s*(\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+\.?\d*|\.\d+)\s*\)$/;
  const MIXED = /^([+-]?)(\d+)\s+(\d+)\/(\d+)$/;
  const TIMESPLIT = /^(.*?)(?:\s+|T)(\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?(?:\s*[AaPp][Mm])?|\d{1,2}\s*[AaPp][Mm])$/;
  const TIMEONLY = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}(?:\.\d+)?))?\s*(?:([AaPp])[Mm])?$/;
  const D_MDY = /^(\d{1,2})([\/\-])(\d{1,2})\2(\d{4}|\d{2})$/;
  const D_YMD = /^(\d{4})([\/\-])(\d{1,2})\2(\d{1,2})$/;
  const D_MD = /^(\d{1,2})[\/\-](\d{1,2})$/;
  const D_DMY = /^(\d{1,2})[\- ]([A-Za-z]{3,9})\.?(?:[\- ,]+\s*(\d{4}|\d{2}))?$/;
  const D_MYT = /^([A-Za-z]{3,9})\.?(?:-(\d{2}|\d{4})| (\d{4}))$/;
  const D_MDT = /^([A-Za-z]{3,9})\.?[\- ]\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}|\d{2}))?$/;
  const monthIdx = (w) => { w = w.toLowerCase(); if (w.length < 3) return 0; if (w === 'sept') return 9; for (let i = 0; i < 12; i++) if (MONTHS[i].toLowerCase().startsWith(w)) return i + 1; return 0; };
  const yr = (s) => (s.length === 4 ? +s : +s < 30 ? 2000 + +s : 1900 + +s);
  const decs = (s) => (s ? s.length : 0);
  const mkDate = (y, m, d) => {
    if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
    if (d > D.daysInMonth(y, m) && !(y === 1900 && m === 2 && d === 29)) return null;
    return y === 1900 && m === 2 && d === 29 ? 60 : D.fromYMD(y, m, d);
  };
  function parseDatePart(s) {
    let m;
    if ((m = D_MDY.exec(s))) { const v = mkDate(yr(m[4]), +m[1], +m[3]); return v == null ? null : { v, nf: 'm/d/yyyy' }; }
    if ((m = D_YMD.exec(s))) { const v = mkDate(+m[1], +m[3], +m[4]); return v == null ? null : { v, nf: m[2] === '-' ? 'yyyy-mm-dd' : 'm/d/yyyy' }; }
    if ((m = D_MD.exec(s))) { const v = mkDate(new Date().getFullYear(), +m[1], +m[2]); return v == null ? null : { v, nf: 'd-mmm' }; }
    if ((m = D_DMY.exec(s))) { const mo = monthIdx(m[2]); if (!mo) return null; const v = mkDate(m[3] ? yr(m[3]) : new Date().getFullYear(), mo, +m[1]); return v == null ? null : { v, nf: m[3] ? 'd-mmm-yy' : 'd-mmm' }; }
    if ((m = D_MYT.exec(s))) { const mo = monthIdx(m[1]); if (!mo) return null; const v = mkDate(yr(m[2] || m[3]), mo, 1); return v == null ? null : { v, nf: 'mmm-yy' }; }
    if ((m = D_MDT.exec(s))) { const mo = monthIdx(m[1]); if (!mo) return null; const v = mkDate(m[3] ? yr(m[3]) : new Date().getFullYear(), mo, +m[2]); return v == null ? null : { v, nf: m[3] ? 'd-mmm-yy' : 'd-mmm' }; }
    return null;
  }
  function parseTimePart(s) {
    const m = TIMEONLY.exec(s); if (!m) return null;
    const ap = m[4] ? m[4].toLowerCase() : null; if (m[2] === undefined && !ap) return null;
    let h = +m[1]; const mi = m[2] === undefined ? 0 : +m[2]; const se = m[3] === undefined ? 0 : parseFloat(m[3]);
    if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'p' ? 12 : 0); } else if (h > 23) return null;
    if (mi > 59 || se >= 60) return null;
    return { v: (h * 3600 + mi * 60 + se) / 86400, sec: m[3] !== undefined, ap: !!ap };
  }
  function parseTemporal(text) {
    const t = TIMEONLY.exec(text) && text.indexOf(':') >= 0 || /^\d{1,2}\s*[AaPp][Mm]$/.test(text) ? parseTimePart(text) : null;
    if (t) return { v: t.v, nf: t.ap ? (t.sec ? 'h:mm:ss AM/PM' : 'h:mm AM/PM') : (t.sec ? 'h:mm:ss' : 'h:mm') };
    const sp = TIMESPLIT.exec(text);
    if (sp) {
      const d = parseDatePart(sp[1].trim()); const tm = d && parseTimePart(sp[2]);
      if (d && tm) return { v: d.v + tm.v, nf: tm.ap ? 'm/d/yyyy h:mm AM/PM' : tm.sec ? 'm/d/yyyy h:mm:ss' : 'm/d/yyyy h:mm' };
      return null;
    }
    return parseDatePart(text);
  }
  const clean15 = (x) => parseFloat(x.toPrecision(15));
  const numNf = (grp, d, pre) => (pre || '') + (grp ? '#,##0' : '0') + (d ? '.' + '0'.repeat(d) : '');
  fmt.parse = function parse(text) {
    if (typeof text !== 'string') return null;
    let n = text.length; if (n === 0 || n > 64) return null;
    let c = text.charCodeAt(0);
    if (c <= 32 || text.charCodeAt(n - 1) <= 32) { text = text.trim(); n = text.length; if (!n) return null; c = text.charCodeAt(0); }
    let m;
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      if (NUMFAST.test(text)) return { v: parseFloat(text), nf: null };
      const last = text.charCodeAt(n - 1);
      if (last === 37 && (m = PCT.exec(text))) { const d = decs(m[2].split('.')[1]); const v = clean15(parseFloat(m[2]) / 100); return { v: m[1] === '-' ? -v : v, nf: d ? '0.' + '0'.repeat(d) + '%' : '0%' }; }
      if (text.indexOf(',') > 0 && (m = THOUS.exec(text))) { const v = parseFloat(m[2].replace(/,/g, '') + (m[3] ? '.' + m[3] : '')); return { v: m[1] === '-' ? -v : v, nf: numNf(true, decs(m[3])) }; }
      if ((c === 45 || c === 43) && (m = CUR.exec(text))) return curResult(m);
      if ((m = MIXED.exec(text))) { const dn = +m[4]; if (dn === 0) return null; const v = +m[2] + +m[3] / dn; return { v: m[1] === '-' ? -v : v, nf: m[4].length === 1 ? '# ?/?' : m[4].length === 2 ? '# ??/??' : '# ???/???' }; }
      const k = text.search(/[\/\-: ]/); if (k < 0) return null;
      return parseTemporal(text);
    }
    if (c === 36 || c === 0x20ac || c === 0xa3 || c === 0xa5 || c === 40) {
      if ((m = CUR.exec(text))) return curResult(m);
      if ((m = PAREN.exec(text))) { return { v: -parseFloat(m[1].replace(/,/g, '')), nf: null }; }
      return null;
    }
    if (c === 35) { if (/^#[A-Za-z/0-9!?_]+$/.test(text)) { const e = ZN.errFromCode(text); return e ? { v: e, nf: null } : null; } return null; }
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
      if (n === 4 || n === 5) { const u = text.toUpperCase(); if (u === 'TRUE') return { v: true, nf: null }; if (u === 'FALSE') return { v: false, nf: null }; }
      if (n < 5 || n > 30 || !/\d/.test(text)) return null;
      return parseTemporal(text);
    }
    return null;
  };
  function curResult(m) {
    const neg = !!(m[1] || m[2] === '-' || m[4] === '-'); const digits = m[5].replace(/,/g, '') + (m[6] ? '.' + m[6] : ''); const v = parseFloat(digits);
    return { v: neg ? -v : v, nf: numNf(true, decs(m[6]), m[3]) };
  }
  ZN.parseValue = fmt.parse;
})(typeof globalThis !== 'undefined' ? globalThis : this);
