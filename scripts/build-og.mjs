#!/usr/bin/env node
// Renders 1200x630 Open Graph images into site/og/ with headless Chromium (playwright-core).
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/build-og.mjs
// Chromium is looked up in ~/Library/Caches/ms-playwright (override with CHROMIUM_PATH).
import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const data = JSON.parse(readFileSync(join(site, 'data/apps.json'), 'utf8'));
const req = createRequire(process.env.PLAYWRIGHT_CORE ? process.env.PLAYWRIGHT_CORE + '/' : join(homedir(), 'ZoltOS/website/node_modules/'));
const { chromium } = req('playwright-core');
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const shell = readdirSync(cache).find((d) => d.startsWith('chromium_headless_shell'));
const executablePath = process.env.CHROMIUM_PATH || join(cache, shell, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const font = (f) => 'file://' + join(site, 'fonts', f);
const css = `@font-face{font-family:B;src:url(${font('bricolage.woff2')});font-weight:200 800}
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:#0b0b0a;color:#f3efe6;font-family:B;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.brand{font:600 28px B;color:#b7b2a6;letter-spacing:-.01em}
h1{font:800 200px/.86 B;letter-spacing:-.04em}h1 span{background:var(--hi);color:#0b0b0a;border-radius:.14em;padding:0 .07em}
h2{font:700 56px/1.05 B;letter-spacing:-.03em;max-width:760px}
p{font-size:28px;color:#b7b2a6;margin-top:14px;max-width:760px}
.bar{position:absolute;left:0;top:0;width:100%;height:14px;background:var(--hi)}
img{position:absolute;right:72px;top:96px;width:300px;height:300px;border-radius:23%}`;
const pages = [{ id: 'default', hi: '#e4ff3f', html: '<div class="brand">ZengSuite</div><div><h1>F<span>*</span>ck<br>Microslop</h1></div><p style="margin:0">Free forever. Open source. Native on macOS, Windows and Linux.</p>' },
  ...data.apps.map((a) => ({ id: a.id, hi: a.accent, html: `<div class="brand">ZengSuite</div><img src="file://${join(site, 'img/icons', a.id + '.svg')}"><div><h2 style="font-size:150px;line-height:.9;font-weight:800;letter-spacing:-.04em">${a.name}</h2><h2 style="margin-top:20px">${a.replaces[0].toUpperCase() + a.replaces.slice(1)}.</h2></div><p style="margin:0">Free, open source, for macOS, Windows and Linux.</p>` }))];
mkdirSync(join(site, 'og'), { recursive: true });
const b = await chromium.launch({ executablePath, headless: true });
const tmp = join(tmpdir(), 'zengsuite-og.html');
const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const p of pages) {
  writeFileSync(tmp, `<!doctype html><meta charset=utf-8><style>${css}:root{--hi:${p.hi}}</style><body><div class="bar"></div>${p.html}</body>`);
  await pg.goto('file://' + tmp);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: join(site, 'og', p.id + '.jpg'), type: 'jpeg', quality: 84 });
}
await b.close();
rmSync(tmp, { force: true });
console.log('og images:', pages.length);
