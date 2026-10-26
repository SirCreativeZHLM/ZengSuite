// Serve one app in a normal browser for fast UI work/testing:  node scripts/dev.mjs <app> [port]
// (/ -> apps/<app>/ui, /kit -> crates/zeng-shell/kit). File dialogs fall back to <input>/download.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2]; const port = +(process.argv[3] || 5170);
if (!app) { console.error('usage: node scripts/dev.mjs <app> [port]'); process.exit(1); }
const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', pdf: 'application/pdf', wasm: 'application/wasm', mp3: 'audio/mpeg' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const base = p.startsWith('/kit/') ? path.join(root, 'crates/zeng-shell/kit', p.slice(5)) : path.join(root, 'apps', app, 'ui', p);
  const file = p === '/__file' ? u.searchParams.get('p') : base;
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[file.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b); });
}).listen(port, () => console.log(`${app}: http://localhost:${port}`));
