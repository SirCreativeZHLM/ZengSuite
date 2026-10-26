/* ZengNumbers conditional formatting: rule evaluator (ZN.cf.evaluate), icon-set SVGs, rule validation / description. */
(function (G) {
  'use strict';
  const ZN = G.ZN; const F = ZN.F; const FM = ZN.formula; const { ZErr } = ZN; const CF = ZN.cf = {};
  const KEY = 16384;
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // ---------- colour helpers ----------
  const hex2rgb = (h) => { h = String(h || '#000000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (a) => '#' + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  const mix = (c1, c2, t) => { const a = hex2rgb(c1), b = hex2rgb(c2); return rgb2hex(a.map((x, i) => x + (b[i] - x) * t)); };
  CF.mix = mix;

  // ---------- statistics ----------
  const percentile = (s, p) => { if (!s.length) return null; if (p <= 0) return s[0]; if (p >= 1) return s[s.length - 1]; const pos = p * (s.length - 1), lo = Math.floor(pos); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo); };
  CF.percentile = percentile;
  const dupKey = (v) => (typeof v === 'number' ? 'n' + v : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'boolean' ? 'b' + v : null);
  function gather(sheet, rule, need) {
    const nums = [], dup = need.dup ? new Map() : null; const mr = sheet.maxRow();
    for (const rg of rule.ranges) {
      const re = Math.min(rg[2], mr), ce = Math.min(rg[3], sheet.cols.length - 1);
      for (let c = rg[1]; c <= ce; c++) {
        const col = sheet.cols[c]; if (!col) continue;
        const rEnd = Math.min(re, col.length - 1);
        for (let r = rg[0]; r <= rEnd; r++) {
          const x = col[r]; if (x === undefined) continue; const v = x.v;
          if (isNum(v)) nums.push(v);
          if (dup && v !== undefined && v !== null && v !== '' && !(v instanceof ZErr)) { const k = dupKey(v); if (k) dup.set(k, (dup.get(k) || 0) + 1); }
        }
      }
    }
    nums.sort((a, b) => a - b);
    const n = nums.length; let sum = 0; for (let i = 0; i < n; i++) sum += nums[i];
    const mean = n ? sum / n : 0; let ss = 0; for (let i = 0; i < n; i++) ss += (nums[i] - mean) * (nums[i] - mean);
    return { sorted: nums, n, min: n ? nums[0] : 0, max: n ? nums[n - 1] : 0, sum, mean, std: n > 1 ? Math.sqrt(ss / (n - 1)) : 0, dup };
  }

  // ---------- formula evaluation (relative to the rule's first cell) ----------
  const astCache = new Map();
  function parsed(text) {
    let a = astCache.get(text); if (a !== undefined) return a;
    try { a = FM.parse(text); } catch (e) { a = null; }
    if (astCache.size > 4000) astCache.clear(); astCache.set(text, a); return a;
  }
  function evalFormula(wb, sheet, text, r, c, r0, c0) {
    text = String(text).replace(/^\s*=/, ''); if (text === '') return null;
    const t = (r === r0 && c === c0) ? text : FM.translate(text, r - r0, c - c0);
    if (t === '#REF!') return ZN.E.REF;
    const ast = parsed(t); if (!ast) return ZN.E.VALUE;
    try { let v = FM.ev(ast, { wb, sheet, r, c, vars: null }); v = F.scalar(v); return v === undefined ? null : v; } catch (e) { return ZN.E.VALUE; }
  }
  const truthy = (v) => (v instanceof ZErr || v == null ? false : typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : typeof v === 'string' ? v.toUpperCase() === 'TRUE' : false);

  // ---------- dates ----------
  let todayOverride = null;
  CF.setToday = (n) => { todayOverride = n; };
  const today = () => (todayOverride != null ? todayOverride : Math.floor(ZN.date.now()));
  function dateTest(when, v) {
    if (!isNum(v)) return false; const d = Math.floor(v), t = today();
    const ym = (n) => ZN.date.toYMD(n); const T = ym(t), D = ym(d); if (!D || !T) return false;
    const wkStart = t - T.wd; // Sunday-based
    switch (when) {
      case 'today': return d === t; case 'yesterday': return d === t - 1; case 'tomorrow': return d === t + 1;
      case 'last7': return d <= t && d > t - 7;
      case 'thisweek': return d >= wkStart && d < wkStart + 7; case 'lastweek': return d >= wkStart - 7 && d < wkStart; case 'nextweek': return d >= wkStart + 7 && d < wkStart + 14;
      case 'thismonth': case 'lastmonth': case 'nextmonth': { const off = when === 'thismonth' ? 0 : when === 'lastmonth' ? -1 : 1; const idx = T.y * 12 + T.m - 1 + off; return D.y * 12 + D.m - 1 === idx; }
      case 'thisyear': return D.y === T.y; case 'lastyear': return D.y === T.y - 1; case 'nextyear': return D.y === T.y + 1;
    }
    return false;
  }

  // ---------- rule preparation ----------
  const ICON_N = (name) => parseInt(String(name || '3Arrows')[0], 10) || 3;
  const defaultThresholds = (n) => { const t = []; for (let i = 1; i < n; i++) t.push({ type: 'percent', v: Math.round(100 * i / n * (n === 3 ? 1 : 1)), gte: true }); if (n === 3) { t[0].v = 33; t[1].v = 67; } return t; };
  CF.defaultThresholds = defaultThresholds;
  const cache = new WeakMap();

  function prepare(wb, sheet, rule) {
    const sig = wb.version + '|' + sheet.id + '|' + JSON.stringify(rule);
    const hit = cache.get(rule); if (hit && hit.sig === sig) return hit.prep;
    const prep = build(wb, sheet, rule); cache.set(rule, { sig, prep }); return prep;
  }
  const styleFx = (rule) => { const s = rule.style || {}; const o = {}; for (const k of ['bg', 'fc', 'b', 'i', 'u', 'k']) if (s[k] !== undefined && s[k] !== null && s[k] !== false && s[k] !== 0) o[k] = s[k]; return o; };

  function build(wb, sheet, rule) {
    const r0 = rule.ranges[0][0], c0 = rule.ranges[0][1];
    const fx = (text, r, c) => evalFormula(wb, sheet, text, r, c, r0, c0);
    const operand = (x, r, c) => { if (typeof x === 'string') { if (x[0] === '=') return fx(x, r, c); if (F.NUMRE.test(x.trim())) return parseFloat(x); } return x; };
    const style = styleFx(rule); const has = Object.keys(style).length > 0;
    const yes = () => style;
    switch (rule.type) {
      case 'cell': {
        const op = rule.op || 'gt'; const dynamic = (typeof rule.v1 === 'string' && rule.v1[0] === '=') || (typeof rule.v2 === 'string' && rule.v2[0] === '=');
        let a = operand(rule.v1, r0, c0), b = operand(rule.v2, r0, c0);
        return (v, r, c) => {
          if (v instanceof ZErr) return null;
          if (dynamic) { a = operand(rule.v1, r, c); b = operand(rule.v2, r, c); }
          if (a instanceof ZErr || b instanceof ZErr) return null;
          const x = v == null ? 0 : v; // blanks compare as 0 like Excel
          if (a == null) a = 0;
          const c1 = F.cmp(x, a); let ok;
          switch (op) {
            case 'gt': ok = c1 > 0; break; case 'lt': ok = c1 < 0; break; case 'ge': ok = c1 >= 0; break; case 'le': ok = c1 <= 0; break;
            case 'eq': ok = F.eq(x, a); break; case 'ne': ok = !F.eq(x, a); break;
            case 'between': case 'notBetween': { const bb = b == null ? 0 : b; let lo = a, hi = bb; if (F.cmp(lo, hi) > 0) { const t = lo; lo = hi; hi = t; } const inn = F.cmp(x, lo) >= 0 && F.cmp(x, hi) <= 0; ok = op === 'between' ? inn : !inn; break; }
            default: ok = false;
          }
          return ok ? style : null;
        };
      }
      case 'text': {
        const t = String(rule.text == null ? '' : rule.text).toLowerCase(), op = rule.textOp || 'contains';
        return (v) => {
          if (v instanceof ZErr) return null; const s = (v == null ? '' : String(F.toStr(v))).toLowerCase();
          const ok = op === 'contains' ? s.includes(t) : op === 'notContains' ? !s.includes(t) : op === 'begins' ? s.startsWith(t) : op === 'ends' ? s.endsWith(t) : false;
          return ok ? style : null;
        };
      }
      case 'top': {
        const st = gather(sheet, rule, {}); const cnt = st.n; const k = Math.max(1, Math.min(cnt, rule.pct ? Math.floor(cnt * (rule.n || 10) / 100) : (rule.n || 10)));
        const th = !cnt ? null : rule.bottom ? st.sorted[k - 1] : st.sorted[cnt - k];
        return (v) => (th !== null && isNum(v) && (rule.bottom ? v <= th : v >= th) ? style : null);
      }
      case 'avg': {
        const st = gather(sheet, rule, {}); const sd = rule.std > 0 ? rule.std * st.std : 0; const lim = rule.above === false ? st.mean - sd : st.mean + sd;
        return (v) => { if (!isNum(v) || !st.n) return null; const ok = rule.above === false ? (rule.equal ? v <= lim : v < lim) : (rule.equal ? v >= lim : v > lim); return ok ? style : null; };
      }
      case 'dupes': {
        const st = gather(sheet, rule, { dup: true });
        return (v) => { if (v == null || v === '' || v instanceof ZErr) return null; const k = dupKey(v); if (!k) return null; const n = st.dup.get(k) || 0; return (rule.unique ? n === 1 : n > 1) ? style : null; };
      }
      case 'blanks': return (v) => (v == null || v === '' ? style : null);
      case 'noblanks': return (v) => (v == null || v === '' ? null : style);
      case 'errors': return (v) => (v instanceof ZErr ? style : null);
      case 'noerrors': return (v) => (v instanceof ZErr ? null : style);
      case 'date': return (v) => (dateTest(rule.when, v) ? style : null);
      case 'formula': return (v, r, c) => (truthy(fx(rule.formula, r, c)) ? style : null);
      case 'colorScale': {
        const st = gather(sheet, rule, {}); const stops = (rule.stops || []).slice(0, 3);
        if (stops.length < 2) return () => null;
        const vals = stops.map((s) => stopValue(s, st, fx, r0, c0)); const cols = stops.map((s) => s.color || '#ffffff');
        return (v) => {
          if (!isNum(v)) return null; let color;
          if (vals.some((x) => x == null)) return null;
          if (v <= vals[0]) color = cols[0];
          else if (v >= vals[vals.length - 1]) color = cols[cols.length - 1];
          else { let i = 0; while (i < vals.length - 2 && v > vals[i + 1]) i++; const span = vals[i + 1] - vals[i]; color = mix(cols[i], cols[i + 1], span > 0 ? (v - vals[i]) / span : 1); }
          return { bg: color };
        };
      }
      case 'dataBar': {
        const st = gather(sheet, rule, {}); if (!st.n) return () => null;
        const mn = stopValue(rule.min || { type: 'min' }, st, fx, r0, c0), mx = stopValue(rule.max || { type: 'max' }, st, fx, r0, c0);
        if (mn == null || mx == null) return () => null;
        const neg = mn < 0; const lo = mn, hi = neg ? Math.max(mx, 0) : mx; const span = hi - lo; const zeroAt = neg && span > 0 ? (0 - lo) / span : 0;
        const color = rule.color || '#638ec6', negColor = rule.negColor || '#ff453a'; const gradient = rule.gradient !== false;
        return (v) => {
          if (!isNum(v)) return null; let pct;
          if (neg) pct = span > 0 ? Math.min(1, Math.abs(v) / span) : 0; else pct = span > 0 ? Math.max(0, Math.min(1, (v - lo) / span)) : 1;
          if (neg) { const vv = Math.max(lo, Math.min(hi, v)); pct = span > 0 ? Math.abs(vv) / span : 0; }
          const o = { bar: { pct, color, neg: neg && v < 0, negColor, gradient, zeroAt, border: !!rule.border } };
          if (rule.showValue === false) o.showValue = false; return o;
        };
      }
      case 'iconSet': {
        const n = ICON_N(rule.name); const st = gather(sheet, rule, {}); const th = (rule.thresholds && rule.thresholds.length ? rule.thresholds : defaultThresholds(n)).slice(0, n - 1);
        const tv = th.map((t) => stopValue(t, st, fx, r0, c0));
        return (v) => {
          if (!isNum(v)) return null; let idx = 0;
          for (let k = n - 1; k >= 1; k--) { const t = tv[k - 1]; if (t == null) continue; const gte = !th[k - 1] || th[k - 1].gte !== false; if (gte ? v >= t : v > t) { idx = k; break; } }
          if (rule.reverse) idx = n - 1 - idx;
          const o = { icon: { set: rule.name || '3Arrows', idx, n } }; if (rule.showValue === false) o.showValue = false; return o;
        };
      }
    }
    return () => null;
  }
  function stopValue(s, st, fx, r0, c0) {
    if (!s) return null; const v = s.v;
    switch (s.type) {
      case 'min': return st.n ? st.min : null; case 'max': return st.n ? st.max : null;
      case 'num': { const x = typeof v === 'string' && v[0] === '=' ? fx(v, r0, c0) : +v; return isNum(x) ? x : null; }
      case 'percent': return st.n ? st.min + (st.max - st.min) * (+v) / 100 : null;
      case 'percentile': return st.n ? percentile(st.sorted, (+v) / 100) : null;
      case 'formula': { const x = fx(v, r0, c0); return isNum(x) ? x : null; }
    }
    return null;
  }

  // ---------- evaluate ----------
  CF.evaluate = function (wb, sheet, r1, c1, r2, c2) {
    const out = new Map(); const list = sheet && sheet.cf; if (!list || !list.length) return out;
    const rules = list.filter((r) => r && r.ranges && r.ranges.length).map((r, i) => [r, i]).sort((a, b) => ((a[0].priority || 0) - (b[0].priority || 0)) || (a[1] - b[1]));
    const stopped = new Set();
    for (const [rule] of rules) {
      let prep; try { prep = prepare(wb, sheet, rule); } catch (e) { continue; }
      const seen = rule.ranges.length > 1 ? new Set() : null;
      for (const rg of rule.ranges) {
        const a1 = Math.max(rg[0], r1), b1 = Math.max(rg[1], c1), a2 = Math.min(rg[2], r2), b2 = Math.min(rg[3], c2);
        for (let c = b1; c <= b2; c++) {
          const col = sheet.cols[c];
          for (let r = a1; r <= a2; r++) {
            const key = r * KEY + c; if (stopped.has(key)) continue; if (seen) { if (seen.has(key)) continue; seen.add(key); }
            const x = col ? col[r] : undefined; const v = x === undefined || x.v === undefined ? null : x.v;
            let e; try { e = prep(v, r, c); } catch (err) { e = null; }
            if (!e) continue;
            let t = out.get(key); if (!t) { t = {}; out.set(key, t); }
            for (const k of ['bg', 'fc', 'b', 'i', 'u', 'k']) if (e[k] !== undefined && t[k] === undefined) t[k] = e[k];
            if (e.bar && !t.bar) t.bar = e.bar; if (e.icon && !t.icon) t.icon = e.icon;
            if (e.showValue === false && t.showValue === undefined) t.showValue = false;
            if (rule.stop) stopped.add(key);
          }
        }
      }
    }
    for (const [k, t] of out) if (!Object.keys(t).length) out.delete(k);
    return out;
  };

  // ---------- icon sets ----------
  const RED = '#ff453a', YEL = '#ffbd0a', GRN = '#30c452', GRY = '#8e8e93', DGR = '#5b5b60', BLU = '#0a84ff';
  CF.iconSets = ['3Arrows', '3ArrowsGray', '3TrafficLights', '3Signs', '3Symbols', '3Flags', '4Arrows', '4ArrowsGray', '4Rating', '4TrafficLights', '5Arrows', '5ArrowsGray', '5Rating', '5Quarters', '3Stars', '3Triangles', '5Boxes'];
  const COL = { 3: [RED, YEL, GRN], 4: [RED, '#ff9f0a', YEL, GRN], 5: [RED, '#ff9f0a', YEL, '#a3d93b', GRN] };
  const arrow = (deg, col) => `<g transform="rotate(${deg} 8 8)"><path d="M8 2.2 13.2 8.4H9.6V13.6H6.4V8.4H2.8Z" fill="${col}" stroke="${col}" stroke-width=".6" stroke-linejoin="round"/></g>`;
  const circle = (col, ring) => `<circle cx="8" cy="8" r="6.2" fill="${col}"${ring ? ` stroke="${ring}" stroke-width="1"` : ''}/>`;
  const star = (cx, cy, R, r, fill, stroke, clip) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; p += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); } return `<path d="${p}Z" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"${clip || ''}/>`; };
  function body(set, idx, n) {
    const kind = set.replace(/^\d/, ''); const cols = COL[n] || COL[3]; const col = cols[Math.max(0, Math.min(n - 1, idx))];
    switch (kind) {
      case 'Arrows': { const deg = n === 3 ? [180, 90, 0] : n === 4 ? [180, 135, 45, 0] : [180, 135, 90, 45, 0]; return arrow(deg[idx], col); }
      case 'ArrowsGray': { const deg = n === 3 ? [180, 90, 0] : n === 4 ? [180, 135, 45, 0] : [180, 135, 90, 45, 0]; const g = ['#a8a8ae', '#8e8e93', '#6e6e73', '#4a4a4f', '#2c2c30']; return arrow(deg[idx], n === 3 ? ['#a8a8ae', '#76767b', '#3a3a3e'][idx] : g[Math.round(idx * 4 / (n - 1))]); }
      case 'TrafficLights': { if (n === 4) return circle(idx === 0 ? '#2c2c30' : cols[idx], 'rgba(0,0,0,.25)'); return circle(col, 'rgba(0,0,0,.2)'); }
      case 'Signs': return [`<path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="${RED}" stroke="${RED}" stroke-width=".8" stroke-linejoin="round"/>`, `<path d="M8 2 14.6 13.6H1.4Z" fill="${YEL}" stroke="${YEL}" stroke-width=".8" stroke-linejoin="round"/>`, circle(GRN)][idx];
      case 'Symbols': {
        const mark = [`<path d="M5.4 5.4 10.6 10.6M10.6 5.4 5.4 10.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>`, `<path d="M8 4.4V8.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="8" cy="11.2" r=".95" fill="#fff"/>`, `<path d="M4.8 8.2 7 10.4 11.4 5.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`][idx];
        return circle(COL[3][idx]) + mark;
      }
      case 'Flags': return `<path d="M3.6 14V2.4" stroke="${DGR}" stroke-width="1.2" stroke-linecap="round"/><path d="M3.8 3 13 3 10.8 6 13 9 3.8 9Z" fill="${COL[3][idx]}" stroke="${COL[3][idx]}" stroke-width=".8" stroke-linejoin="round"/>`;
      case 'Rating': { let s = ''; for (let i = 0; i < n; i++) { const h = 3 + i * (10 / (n - 1)) * 0.9, x = 2 + i * (12 / n), w = 12 / n - 1.2; s += `<rect x="${x.toFixed(2)}" y="${(14 - h).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx=".8" fill="${i <= idx ? BLU : '#c7c7cc'}"/>`; } return s; }
      case 'Quarters': { const f = idx / (n - 1); let s = `<circle cx="8" cy="8" r="6" fill="none" stroke="${DGR}" stroke-width="1.2"/>`; if (f >= 1) s += `<circle cx="8" cy="8" r="6" fill="${DGR}"/>`; else if (f > 0) { const a = -Math.PI / 2 + f * 2 * Math.PI; s += `<path d="M8 8V2A6 6 0 ${f > .5 ? 1 : 0} 1 ${(8 + 6 * Math.cos(a)).toFixed(2)} ${(8 + 6 * Math.sin(a)).toFixed(2)}Z" fill="${DGR}"/>`; } return s; }
      case 'Stars': {
        const stroke = '#e0a100', fill = idx === 2 ? YEL : 'none';
        if (idx === 1) return `<defs><clipPath id="zh${set}"><rect x="0" y="0" width="8" height="16"/></clipPath></defs>` + star(8, 8.4, 6.4, 2.7, 'none', stroke) + star(8, 8.4, 6.4, 2.7, YEL, stroke, ` clip-path="url(#zh${set})"`);
        return star(8, 8.4, 6.4, 2.7, fill, idx === 0 ? '#b0b0b5' : stroke);
      }
      case 'Triangles': return [`<path d="M2.6 4.6H13.4L8 13Z" fill="${RED}" stroke="${RED}" stroke-width=".8" stroke-linejoin="round"/>`, `<rect x="2.6" y="6.8" width="10.8" height="2.4" rx="1" fill="${YEL}"/>`, `<path d="M2.6 11.4H13.4L8 3Z" fill="${GRN}" stroke="${GRN}" stroke-width=".8" stroke-linejoin="round"/>`][idx];
      case 'Boxes': { const f = idx / (n - 1); const h = 11 * f; return `<rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="${DGR}" stroke-width="1.2"/>` + (f > 0 ? `<rect x="2.5" y="${(13.5 - h).toFixed(2)}" width="11" height="${h.toFixed(2)}" rx="${f >= 1 ? 2 : 0.6}" fill="${DGR}"/>` : ''); }
    }
    return circle(col);
  }
  CF.iconSVG = function (setName, idx, n, size) {
    setName = CF.iconSets.includes(setName) ? setName : '3Arrows'; n = n || ICON_N(setName); idx = Math.max(0, Math.min(n - 1, idx | 0)); size = size || 16;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" data-icon="${setName}:${idx}" aria-hidden="true">${body(setName, idx, n)}</svg>`;
  };

  // ---------- validation / description / defaults ----------
  const OPS = { gt: 'greater than', lt: 'less than', ge: 'greater than or equal to', le: 'less than or equal to', eq: 'equal to', ne: 'not equal to', between: 'between', notBetween: 'not between' };
  const WHEN = { today: 'today', yesterday: 'yesterday', tomorrow: 'tomorrow', last7: 'in the last 7 days', thisweek: 'this week', lastweek: 'last week', nextweek: 'next week', thismonth: 'this month', lastmonth: 'last month', nextmonth: 'next month', thisyear: 'this year', lastyear: 'last year', nextyear: 'next year' };
  const TYPES = ['cell', 'text', 'top', 'avg', 'dupes', 'blanks', 'noblanks', 'errors', 'noerrors', 'date', 'formula', 'colorScale', 'dataBar', 'iconSet'];
  const STOP_TYPES = ['min', 'max', 'num', 'percent', 'percentile', 'formula'];
  CF.types = TYPES;
  const rangeOk = (g) => Array.isArray(g) && g.length === 4 && g.every((x) => Number.isInteger(x) && x >= 0) && g[0] <= g[2] && g[1] <= g[3];
  CF.validateRule = function (rule) {
    if (!rule || typeof rule !== 'object') return 'Rule is missing';
    if (!TYPES.includes(rule.type)) return 'Unknown rule type';
    if (!Array.isArray(rule.ranges) || !rule.ranges.length || !rule.ranges.every(rangeOk)) return 'Choose a valid range to apply the rule to';
    const numOrF = (x) => x !== undefined && x !== null && x !== '' && (typeof x === 'number' || (typeof x === 'string' && x.trim() !== ''));
    switch (rule.type) {
      case 'cell': if (!OPS[rule.op]) return 'Choose a comparison'; if (!numOrF(rule.v1)) return 'Enter a value'; if ((rule.op === 'between' || rule.op === 'notBetween') && !numOrF(rule.v2)) return 'Enter both values'; break;
      case 'text': if (!['contains', 'notContains', 'begins', 'ends'].includes(rule.textOp)) return 'Choose a text condition'; if (rule.text === undefined || rule.text === '') return 'Enter the text to look for'; break;
      case 'top': if (!(rule.n >= 1) || !Number.isInteger(+rule.n)) return 'Enter a whole number of 1 or more'; if (rule.pct && rule.n > 100) return 'Percentage must be 100 or less'; break;
      case 'date': if (!WHEN[rule.when]) return 'Choose a date period'; break;
      case 'formula': { const t = String(rule.formula || '').replace(/^\s*=/, '').trim(); if (!t) return 'Enter a formula'; try { FM.parse(t); } catch (e) { return 'The formula is not valid'; } break; }
      case 'colorScale': { const s = rule.stops; if (!Array.isArray(s) || (s.length !== 2 && s.length !== 3)) return 'A colour scale needs 2 or 3 stops'; for (const x of s) { if (!STOP_TYPES.includes(x.type)) return 'Invalid stop type'; if (!/^#[0-9a-f]{3,6}$/i.test(x.color || '')) return 'Choose a colour for every stop'; if (['num', 'percent', 'percentile', 'formula'].includes(x.type) && !numOrF(x.v)) return 'Enter a value for every stop'; } break; }
      case 'dataBar': if (!/^#[0-9a-f]{3,6}$/i.test(rule.color || '')) return 'Choose a bar colour'; break;
      case 'iconSet': { if (!CF.iconSets.includes(rule.name)) return 'Choose an icon set'; const n = ICON_N(rule.name); if (rule.thresholds && rule.thresholds.length !== n - 1) return 'This icon set needs ' + (n - 1) + ' thresholds'; if (rule.thresholds) { for (const t of rule.thresholds) if (!['percent', 'num', 'percentile', 'formula'].includes(t.type) || !numOrF(t.v)) return 'Enter a value for every threshold'; } break; }
    }
    return null;
  };
  const rangesText = (rule) => (rule.ranges || []).map((g) => ZN.rangeAddr(g[0], g[1], g[2], g[3])).join(', ');
  const stopText = (s) => (s.type === 'min' ? 'lowest value' : s.type === 'max' ? 'highest value' : s.type === 'num' ? 'number ' + s.v : s.type === 'percent' ? s.v + '%' : s.type === 'percentile' ? s.v + 'th percentile' : 'formula ' + s.v);
  CF.describe = function (rule) {
    if (!rule) return '';
    const sty = rule.style ? [rule.style.bg ? 'fill ' + rule.style.bg : '', rule.style.fc ? 'text ' + rule.style.fc : '', rule.style.b ? 'bold' : '', rule.style.i ? 'italic' : '', rule.style.u ? 'underline' : '', rule.style.k ? 'strikethrough' : ''].filter(Boolean).join(', ') : '';
    let d;
    switch (rule.type) {
      case 'cell': d = 'Cell value ' + (OPS[rule.op] || rule.op) + ' ' + rule.v1 + ((rule.op === 'between' || rule.op === 'notBetween') ? ' and ' + rule.v2 : ''); break;
      case 'text': d = 'Text ' + ({ contains: 'contains', notContains: 'does not contain', begins: 'begins with', ends: 'ends with' }[rule.textOp] || rule.textOp) + ' “' + rule.text + '”'; break;
      case 'top': d = (rule.bottom ? 'Bottom ' : 'Top ') + rule.n + (rule.pct ? '%' : '') + ' values'; break;
      case 'avg': d = (rule.above === false ? 'Below' : 'Above') + (rule.equal ? ' or equal to' : '') + ' average' + (rule.std ? ' (' + rule.std + ' std dev)' : ''); break;
      case 'dupes': d = rule.unique ? 'Unique values' : 'Duplicate values'; break;
      case 'blanks': d = 'Blank cells'; break; case 'noblanks': d = 'Cells with content'; break; case 'errors': d = 'Cells with errors'; break; case 'noerrors': d = 'Cells without errors'; break;
      case 'date': d = 'Date ' + (WHEN[rule.when] || rule.when); break;
      case 'formula': d = 'Formula: =' + String(rule.formula || '').replace(/^\s*=/, ''); break;
      case 'colorScale': d = (rule.stops || []).length + '-colour scale: ' + (rule.stops || []).map(stopText).join(' → '); break;
      case 'dataBar': d = 'Data bars' + (rule.gradient === false ? ' (solid)' : ' (gradient)'); break;
      case 'iconSet': d = 'Icon set ' + rule.name + (rule.reverse ? ' (reversed)' : ''); break;
      default: d = 'Unknown rule';
    }
    return d + (sty ? ' — ' + sty : '') + (rule.ranges && rule.ranges.length ? ' — applies to ' + rangesText(rule) : '') + (rule.stop ? ' — stop if true' : '');
  };
  CF.defaultRule = function (type) {
    const base = { id: 'cf' + Math.random().toString(36).slice(2, 9), ranges: [], type, priority: 1 };
    const sty = { bg: '#ffc7ce', fc: '#9c0006' };
    switch (type) {
      case 'cell': return Object.assign(base, { op: 'gt', v1: 0, style: sty });
      case 'text': return Object.assign(base, { textOp: 'contains', text: '', style: sty });
      case 'top': return Object.assign(base, { n: 10, bottom: false, pct: false, style: { bg: '#c6efce', fc: '#006100' } });
      case 'avg': return Object.assign(base, { above: true, style: { bg: '#c6efce', fc: '#006100' } });
      case 'dupes': return Object.assign(base, { unique: false, style: sty });
      case 'date': return Object.assign(base, { when: 'today', style: { bg: '#ffeb9c', fc: '#9c5700' } });
      case 'formula': return Object.assign(base, { formula: '', style: sty });
      case 'colorScale': return Object.assign(base, { stops: [{ type: 'min', color: '#f8696b' }, { type: 'percentile', v: 50, color: '#ffeb84' }, { type: 'max', color: '#63be7b' }] });
      case 'dataBar': return Object.assign(base, { color: '#638ec6', negColor: '#ff453a', min: { type: 'min' }, max: { type: 'max' }, gradient: true, showValue: true });
      case 'iconSet': return Object.assign(base, { name: '3TrafficLights', thresholds: defaultThresholds(3), reverse: false, showValue: true });
      default: return Object.assign(base, { style: sty });
    }
  };
  CF.validateRule.types = TYPES; CF.describe.OPS = OPS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
