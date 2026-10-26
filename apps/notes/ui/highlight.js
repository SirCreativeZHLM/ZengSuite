/* Tiny syntax tinting for code blocks. tokens(text, lang) -> [{s,e,c}] with c in kw|str|com|num|fn */
(() => {
  const H = (N.hl = {});
  const KW = {
    js: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined interface type enum implements public private protected readonly',
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self',
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected new delete this nullptr true false bool using fn let mut impl trait pub use mod match loop where func package defer go chan map range var interface',
    sh: 'if then else elif fi for while do done case esac function in return export local echo cd ls set unset source alias exit',
    sql: 'select from where insert into values update set delete create table drop alter join left right inner outer on group by order having limit as and or not null primary key distinct union count',
    web: 'html head body div span class id style script href src import from export const let var function return if else for while true false null',
    swift: 'func let var if else guard return struct class enum protocol extension import init self nil true false switch case default for in while do try catch throw throws async await public private static final override some any',
  };
  const ALIAS = { javascript: 'js', typescript: 'js', ts: 'js', jsx: 'js', tsx: 'js', node: 'js', json: 'js', python: 'py', rb: 'py', ruby: 'py', java: 'c', cpp: 'c', 'c++': 'c', cs: 'c', csharp: 'c', go: 'c', rust: 'c', rs: 'c', kotlin: 'c', php: 'c', bash: 'sh', zsh: 'sh', shell: 'sh', yaml: 'sh', yml: 'sh', toml: 'sh', html: 'web', css: 'web', xml: 'web' };
  const cache = {};
  const kwSet = (g) => (cache[g] ||= new Set(KW[g].split(' ')));
  H.group = (lang) => { lang = (lang || '').toLowerCase(); return KW[lang] ? lang : ALIAS[lang] || 'js'; };
  H.tokens = (text, lang) => {
    const g = H.group(lang), kws = kwSet(g), out = [];
    const hashCom = g === 'py' || g === 'sh'; const dashCom = g === 'sql';
    const n = text.length; let i = 0;
    const isId = (c) => /[A-Za-z0-9_$]/.test(c);
    while (i < n) {
      const c = text[i], c2 = text[i + 1];
      if ((c === '/' && c2 === '/' && g !== 'sh' && g !== 'py') || (hashCom && c === '#') || (dashCom && c === '-' && c2 === '-')) { let e = text.indexOf('\n', i); if (e < 0) e = n; out.push({ s: i, e, c: 'com' }); i = e; continue; }
      if (c === '/' && c2 === '*') { let e = text.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; out.push({ s: i, e, c: 'com' }); i = e; continue; }
      if (c === '<' && text.startsWith('<!--', i) && g === 'web') { let e = text.indexOf('-->', i); e = e < 0 ? n : e + 3; out.push({ s: i, e, c: 'com' }); i = e; continue; }
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1; while (j < n && text[j] !== c && (c === '`' || text[j] !== '\n')) { if (text[j] === '\\') j++; j++; }
        j = Math.min(n, j + 1); out.push({ s: i, e: j, c: 'str' }); i = j; continue;
      }
      if (/[0-9]/.test(c) && (i === 0 || !isId(text[i - 1]))) { let j = i + 1; while (j < n && /[0-9a-fx._]/i.test(text[j])) j++; out.push({ s: i, e: j, c: 'num' }); i = j; continue; }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1; while (j < n && isId(text[j])) j++; const w = text.slice(i, j);
        if (kws.has(w) || (g === 'sql' && kws.has(w.toLowerCase()))) out.push({ s: i, e: j, c: 'kw' });
        else if (text[j] === '(') out.push({ s: i, e: j, c: 'fn' });
        i = j; continue;
      }
      i++;
    }
    return out;
  };
  H.html = (text, lang) => {
    const t = H.tokens(text, lang); let o = '', p = 0;
    for (const k of t) { o += N.u.esc(text.slice(p, k.s)) + `<span class="tk-${k.c}">${N.u.esc(text.slice(k.s, k.e))}</span>`; p = k.e; }
    return o + N.u.esc(text.slice(p));
  };
})();
