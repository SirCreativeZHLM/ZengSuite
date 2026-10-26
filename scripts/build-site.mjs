#!/usr/bin/env node
// Generates the static ZengSuite website into site/ from site/data/apps.json. No dependencies.
//   node scripts/build-site.mjs
// Hand-written (not generated): site/css, site/js, site/fonts, site/img/<app>-{light,dark}.webp (screenshots, dropped in by the lead).
// Generated: every .html, sitemap.xml, robots.txt, site/img/icons/<id>.svg (copied from apps/<id>/icon.svg when present).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const data = JSON.parse(readFileSync(join(site, 'data/apps.json'), 'utf8'));
const { version, repo, origin, base, platforms } = data;
const apps = data.apps;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (rel, text) => { const p = join(site, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

/* ---------- per-app prep: app.json overrides, icons, screenshots ---------- */
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
for (const a of apps) {
  const dir = join(root, 'apps', a.id);
  a.fromApp = false;
  try {
    const j = JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8'));
    a.fromApp = true;
    if (/^#[0-9a-f]{6}$/i.test(j.accent || '')) a.accent = j.accent;
    if (Array.isArray(j.extensions) && j.extensions.length) a.formats = j.extensions.slice(0, 8); // real formats win over the placeholder list
  } catch {}
  a.ink = lum(a.accent) > .28 ? '#0b0b0a' : '#ffffff';
  const icon = join(dir, 'icon.svg');
  a.realIcon = existsSync(icon);
  if (a.realIcon) copyFileSync(icon, join(site, `img/icons/${a.id}.svg`));
  else write(`img/icons/${a.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.accent}"/><stop offset="1" stop-color="${a.accent}" stop-opacity=".62"/></linearGradient></defs><rect width="1024" height="1024" rx="224" fill="url(#g)"/><text x="512" y="690" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="560" fill="${a.ink}">${esc(a.name[0])}</text></svg>\n`);
  const has = (t) => existsSync(join(site, `img/${a.id}-${t}.webp`));
  a.dark = has('dark') ? 'dark' : has('light') ? 'light' : null;
  a.light = has('light') ? 'light' : has('dark') ? 'dark' : null;
}

/* ---------- urls ---------- */
const rel = (p) => `https://github.com/${repo}/releases/download/v${version}/${p}`;
const appUrl = (a, p) => rel(`${a.product}-${version}-${p.key}.${p.ext}`);
const bundleUrl = (p) => rel(`ZengSuite-${version}-${p.key}.${p.ext}`);
const bundleFile = (p) => `ZengSuite-${version}-${p.key}.${p.ext}`;
const P = (path) => `${base}${path}`;

/* ---------- partials ---------- */
const sizeSpan = (kind, a) => `<span data-size="${kind}">${(kind === 'all' ? data.sizes.all : a?.sizeMB) ?? 'X'}</span>`;

function shot(a, { eager = false, hidden = false, dim = '' } = {}) {
  const alt = `${a.product} on macOS: ${a.line}`;
  const img = (t) => `<picture class="${t}"><img src="${P(`/img/${a.id}-${a[t]}.webp`)}" width="1600" height="1000" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></picture>`;
  const inner = a.dark
    ? img('dark') + img('light')
    : `<div class="ph"><div><img src="${P(`/img/icons/${a.id}.svg`)}" width="120" height="120" alt=""><p>The ${esc(a.name)} screenshot goes here.</p></div></div>`;
  return `<div class="shot" data-app="${a.id}" style="--app:${a.accent}"${hidden ? ' hidden' : ''}>${inner}</div>`;
}

function dlBlock(items, label) {
  return `<div class="dl" data-dl>` + platforms.map((p) => {
    const [u, f] = items(p);
    return `<a data-p="${p.key}" href="${u}" rel="noopener" aria-label="Download ${esc(label)} for ${p.label} ${p.arch}"><span class="os">${p.label}</span><span class="meta">${p.arch}</span><span class="file">${esc(f)}</span></a>`;
  }).join('') + `</div>`;
}

function kbds(spec) {
  return spec.split('+').map((t) => t === 'Mod' ? '<kbd data-mod>Ctrl</kbd>' : t === 'Alt' ? '<kbd data-alt>Alt</kbd>' : `<kbd>${esc(t)}</kbd>`).join('');
}

const nav = `<nav class="sitenav" aria-label="ZengSuite">
<a href="${P('/')}">ZengSuite</a><a href="${P('/#apps')}">Apps</a><a href="${P('/download/')}">Download</a><a href="${P('/about/')}">About</a><a href="https://github.com/${repo}" rel="noopener">Source on GitHub</a><a href="https://github.com/${repo}/blob/main/LICENSE" rel="noopener">MIT license</a>
</nav>`;

function layout({ path, title, desc, body, og = 'default', bodyStyle = '', fab = true, robots = '', crumbName = 'ZengSuite' }) {
  const canon = origin + P(path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#000000">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<link rel="canonical" href="${canon}">
<link rel="icon" href="${P('/icon.svg')}" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ZengSuite">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${origin}${P(`/og/${og}.jpg`)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${P('/fonts/bricolage.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/zb.css">
<link rel="stylesheet" href="${P('/css/suite.css')}">
<script src="/zb.js" defer></script>
<script src="${P('/js/suite.js')}" defer></script>
</head>
<body${bodyStyle ? ` style="${bodyStyle}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
<div data-zb-top data-zb-name="${esc(crumbName)}" data-zb-links="Apps|${P('/#apps')},Download|${P('/download/')},About|${P('/about/')}"></div>
<main id="main">
${body}
</main>
${nav}
<div data-zb-foot data-zb-note="ZengSuite is free software under the MIT license. Not affiliated with Microsoft or Apple."></div>
${fab ? `<a class="btn primary fab" href="#download">Download</a>\n` : ''}</body>
</html>
`;
}

/* ---------- landing ---------- */
function landing() {
  const hero = apps[0];
  const rows = apps.map((a, i) => `<li><a class="row${i === 0 ? ' on' : ''}" href="${P(`/${a.id}/`)}" data-app="${a.id}" data-cap="${esc(a.product + ': ' + a.line)}" style="--ac:${a.accent}"><img src="${P(`/img/icons/${a.id}.svg`)}" width="52" height="52" alt="" loading="lazy"><span><b>${esc(a.name)}</b><small>${esc(a.replaces)}</small></span><span class="go" aria-hidden="true">&rarr;</span></a></li>`).join('\n');
  const stage = apps.map((a, i) => shot(a, { hidden: i !== 0 })).join('\n');
  const body = `
<div class="wrap hero">
  <h1><span class="w"><span>F<span class="star">*</span>ck</span></span> <span class="w"><span>Microslop</span></span></h1>
  <p class="sub">Free forever. Open source. <em>Native on macOS, Windows and Linux.</em></p>
  <div class="actions" data-scope>
    <a class="btn primary" href="#download" data-primary="ZengSuite">Download everything</a>
    <a class="btn" href="#apps">See the apps</a>
  </div>
  <p class="fine">Version ${version}. MIT license. No account, no ads, no tracking.</p>
</div>
<figure class="big-shot reveal">${shot(hero, { eager: true })}<figcaption>${esc(hero.product)}, one of ${apps.length} apps. Each is a separate download.</figcaption></figure>

<section class="letter" aria-label="Why this exists">
<div class="wrap">
<p>You bought a computer. Then somebody wanted ten dollars a month to let you write a letter on it.</p>
<p>So we made the apps. <mark>Eleven of them</mark>: documents, spreadsheets, slides, a PDF reader, notes, a whiteboard, a calendar, reminders, contacts, a calculator and a text editor. They open the files you already have and save files other people can open.</p>
<p class="dim"><mark>They cost nothing</mark> and they will keep costing nothing. No account to make, no cloud to sign into, no trial that ends, no feature hiding behind a button that says Upgrade. The code is MIT licensed. Read it, change it, hand it to your friends.</p>
<p>That is the whole pitch. It is free. Go on.</p>
<p class="sig">The ZengBot people</p>
</div>
</section>

<section id="apps" class="hr">
<div class="wrap">
<h2>Eleven apps. No catch.</h2>
<p class="lead" style="margin-top:18px">Each app is its own small download, so you install only what you use.</p>
<div class="index">
<ul class="rows">
${rows}
</ul>
<div class="stage" aria-hidden="false">
${stage}
<p data-cap>${esc(hero.product + ': ' + hero.line)}</p>
</div>
</div>
</div>
</section>

<section id="download" class="band" data-scope>
<div class="wrap">
<h2>Download everything.</h2>
<p class="lead" style="margin-top:18px">One bundle per platform with all ${apps.length} apps, about ${sizeSpan('app')} MB each. Or <a href="${P('/download/')}">pick apps one at a time</a>.</p>
${dlBlock((p) => [bundleUrl(p), bundleFile(p)], 'ZengSuite')}
<p class="fine" style="margin-top:22px">Version ${version}. The builds are not code-signed yet, so macOS and Windows may ask you to confirm the first launch.</p>
</div>
</section>

<section>
<div class="wrap two">
<h2>Not Electron. Not a browser in a trench coat.</h2>
<div>
<p>Each app is a small <strong>Rust</strong> program that opens a native window and uses the web view your operating system already has: WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux. No bundled copy of Chrome, so an app is about ${sizeSpan('app')} MB and starts when you click it.</p>
<p>Everything works offline. The apps make no network calls and send nothing anywhere.</p>
</div>
</div>
</section>

<section class="hr">
<div class="wrap two">
<h2>What is not here yet.</h2>
<div>
<p><strong>No email client.</strong> There is no replacement for Mail or Outlook yet.</p>
<p><strong>No real-time cloud collaboration.</strong> Two people cannot type in the same document at once. Files are files: send them, or keep them in a folder you sync yourself.</p>
<p>This is version ${version}. Expect rough edges, and <a href="https://github.com/${repo}/issues" rel="noopener">tell us about them</a>. <a href="${P('/about/')}">The honest list</a> is on the About page.</p>
</div>
</div>
</section>

<section class="hr end">
<div class="wrap">
<h2>It's free. That's it.</h2>
<div class="actions" style="margin-top:34px"><a class="btn primary" href="#download">Download</a><a class="btn" href="https://github.com/${repo}" rel="noopener">Read the source</a></div>
</div>
</section>`;
  return layout({
    path: '/', title: 'ZengSuite: F*ck Microslop. Free office apps for Mac, Windows and Linux',
    desc: `ZengSuite is a free, open source set of ${apps.length} apps for documents, spreadsheets, slides, PDFs, notes and more. Native on macOS, Windows and Linux. No account, no subscription.`,
    body,
  });
}

/* ---------- app page ---------- */
function appPage(a, i) {
  const others = apps.filter((x) => x !== a);
  const body = `
<div class="wrap app-hero" data-scope>
  <img class="icon" src="${P(`/img/icons/${a.id}.svg`)}" width="168" height="168" alt="">
  <div>
    <h1>${esc(a.name)}</h1>
    <p class="prod">${esc(a.product)}</p>
    <p class="repl"><span>${esc(a.replaces[0].toUpperCase() + a.replaces.slice(1))}.</span></p>
    <p class="lead">${esc(a.line)}</p>
    <div class="actions"><a class="btn app" href="#download" data-primary="${esc(a.product)}">Download ${esc(a.product)}</a><a class="btn" href="${P('/')}">All apps</a></div>
  </div>
</div>
<figure class="big-shot reveal">${shot(a, { eager: true })}<figcaption>${esc(a.product)} on macOS.</figcaption></figure>

<section>
<div class="wrap">
<h2>What it does</h2>
<ul class="caps" style="margin-top:36px">
${a.caps.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('\n')}
</ul>
</div>
</section>

<section class="hr">
<div class="wrap facts">
${a.formats.length ? `<div><h2>Formats</h2><ul class="fmts">${a.formats.map((f) => `<li>.${esc(f)}</li>`).join('')}</ul><p class="fine" style="margin-top:14px">The first one is what it reads and writes best.</p></div>` : `<div><h2>Formats</h2><p class="lead">Nothing to open or save. It is a calculator.</p></div>`}
<div><h2>Keyboard</h2><ul class="keys">${a.keys.map(([l, k]) => `<li><span>${esc(l)}</span><span>${kbds(k)}</span></li>`).join('')}</ul></div>
</div>
</section>

<section id="download" class="band" data-scope>
<div class="wrap">
<h2>Get ${esc(a.name)}.</h2>
<p class="lead" style="margin-top:18px">Free, about ${sizeSpan('app', a)} MB, no account. Pick your system; the other platforms are right there too.</p>
${dlBlock((p) => [appUrl(a, p), `${a.product}-${version}-${p.key}.${p.ext}`], a.product)}
<p class="fine" style="margin-top:22px">Version ${version}, MIT license. Want the whole set? <a href="${P('/#download')}">Download everything</a>.</p>
</div>
</section>

<section class="hr">
<div class="wrap">
<h2>The rest of the suite</h2>
<div class="next">${others.map((x) => `<a href="${P(`/${x.id}/`)}"><img src="${P(`/img/icons/${x.id}.svg`)}" width="30" height="30" alt="" loading="lazy">${esc(x.name)}</a>`).join('')}</div>
</div>
</section>`;
  return layout({
    path: `/${a.id}/`, title: `${a.product}: ${a.replaces}`,
    desc: `${a.product} is a free, open source app for macOS, Windows and Linux. ${a.line}`,
    body, og: a.id, crumbName: a.name,
    bodyStyle: `--app:${a.accent};--app-ink:${a.ink};--hi:${a.accent};--hi-ink:${a.ink}`,
  });
}

/* ---------- download page ---------- */
function downloadPage() {
  const head = platforms.map((p) => `<th scope="col">${p.label}<br>${p.arch} (.${p.ext})</th>`).join('');
  const cells = (url, label) => platforms.map((p) => `<td data-p="${p.key}" data-pl="${p.label} ${p.arch}"><a href="${url(p)}" rel="noopener" aria-label="Download ${esc(label)} for ${p.label} ${p.arch}">.${p.ext}</a></td>`).join('');
  const row = (a) => `<tr><th scope="row"><a href="${P(`/${a.id}/`)}"><img src="${P(`/img/icons/${a.id}.svg`)}" width="34" height="34" alt="" loading="lazy">${esc(a.name)}</a></th>${cells((p) => appUrl(a, p), a.product)}</tr>`;
  const body = `
<div class="wrap page-h"><h1>Download</h1><p class="lead">Every app, every platform, direct from GitHub Releases. Version ${version}. Free.</p></div>
<section id="download" class="band" data-scope style="margin-top:32px">
<div class="wrap">
<h2>All ${apps.length} apps in one go.</h2>
${dlBlock((p) => [bundleUrl(p), bundleFile(p)], 'ZengSuite')}
<p class="fine" style="margin-top:22px">The builds are not code-signed yet, so macOS and Windows may ask you to confirm the first launch.</p>
</div>
</section>
<section>
<div class="wrap">
<h2>Or one app at a time</h2>
<div class="mscroll"><table class="matrix"><thead><tr><th scope="col">App</th>${head}</tr></thead><tbody>
${apps.map(row).join('\n')}
</tbody></table></div>
<p class="fine" style="margin-top:24px">Files are named <code>Zeng&lt;App&gt;-${version}-&lt;platform&gt;.&lt;ext&gt;</code>. Everything lives in the <a href="https://github.com/${repo}/releases/tag/v${version}" rel="noopener">v${version} release</a>.</p>
</div>
</section>`;
  const html = layout({ path: '/download/', title: 'Download ZengSuite: all apps, all platforms', desc: `Download every ZengSuite app for macOS, Windows and Linux, or the whole bundle. Free, version ${version}.`, body, fab: false, og: 'default', crumbName: 'Download' });
  return html;
}

/* ---------- about ---------- */
function aboutPage() {
  const body = `
<div class="wrap page-h"><h1>Why it's free.</h1><p class="lead">Because writing a letter should not be a subscription.</p></div>
<div class="wrap prose" style="padding-bottom:96px">
<h2>The short version</h2>
<p>Everyone needs a word processor, a spreadsheet and a way to show slides. Those are solved problems, and charging rent for them forever is a choice, not a necessity. We would rather make them and give them away.</p>
<h2>MIT licensed</h2>
<p>All of the code is under the <a href="https://github.com/${repo}/blob/main/LICENSE" rel="noopener">MIT license</a>. Use it, change it, sell it, fork it. There is no paid edition and no feature that is held back for one.</p>
<h2>No telemetry, no accounts</h2>
<p>The apps do not phone home. No analytics, no crash reporter, no sign-in, no ads, no upsell screens. They work offline and they never need a network. All the marketing is on this website, and none of it is in the software.</p>
<h2>How to contribute</h2>
<ul>
<li><strong>Use it and report what breaks.</strong> <a href="https://github.com/${repo}/issues" rel="noopener">Open an issue</a> with the app, your system and the file that misbehaved, if you can share it.</li>
<li><strong>Send a pull request.</strong> Each app is a small Rust crate with a web UI on top of a shared kit; the contract is written down in <code>docs/KIT.md</code> in the repository.</li>
<li><strong>Test on your platform.</strong> Windows and Linux testing is the most useful thing a stranger can do.</li>
<li><strong>Tell people.</strong> That is how free software wins.</li>
</ul>
<h2>Honest known limits</h2>
<ul>
<li>This is version ${version}. It is young software and it has rough edges.</li>
<li>Word, Excel and PowerPoint files open and save, but very complex documents may lose features. Keep an original around for anything important.</li>
<li>Most development happens on a Mac, so the Windows and Linux builds may be rougher.</li>
<li>The builds are not code-signed or notarised yet. Your system will ask you to confirm the first launch.</li>
<li>There is no email client and no real-time collaboration in the cloud.</li>
<li>There is no automatic updater. Download the new version when you want it.</li>
</ul>
<h2>Names</h2>
<p>ZengSuite is an independent project. It is not made by, or affiliated with, Microsoft or Apple. Product names are used only to say what each app is a replacement for.</p>
</div>`;
  return layout({ path: '/about/', title: 'About ZengSuite: why it is free, MIT, no telemetry', desc: 'Why ZengSuite is free forever: MIT licensed, no telemetry, no accounts, how to contribute, and an honest list of what does not work yet.', body, fab: false, crumbName: 'About' });
}

function notFound() {
  const body = `<div class="wrap page-h" style="min-height:50vh"><h1>Nothing here.</h1><p class="lead">That page does not exist, which is the one thing about this site that is not free of charge. Well, it is. It is just empty.</p><div class="actions" style="margin-top:28px"><a class="btn primary" href="${P('/')}">Back to ZengSuite</a><a class="btn" href="${P('/download/')}">Downloads</a></div></div>`;
  return layout({ path: '/404.html', title: 'Not found: ZengSuite', desc: 'This page does not exist.', body, fab: false, robots: 'noindex' });
}

/* ---------- write everything ---------- */
write('index.html', landing());
apps.forEach((a, i) => write(`${a.id}/index.html`, appPage(a, i)));
write('download/index.html', downloadPage());
write('about/index.html', aboutPage());
// served by the worker as the site-wide 404 page; links are absolute so it works at any depth
write('404.html', notFound());
write('icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e4ff3f"/><path d="M32 12v40M14.7 22l34.6 20M14.7 42l34.6-20" stroke="#0b0b0a" stroke-width="7" stroke-linecap="round"/></svg>\n`);
const urls = ['/', ...apps.map((a) => `/${a.id}/`), '/download/', '/about/'];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${origin}${P(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${origin}${P('/sitemap.xml')}\n`);
console.log(`built ${urls.length} pages; screenshots: ${apps.filter((a) => a.dark).length}/${apps.length}; real icons: ${apps.filter((a) => a.realIcon).length}/${apps.length}; app.json found: ${apps.filter((a) => a.fromApp).length}`);
