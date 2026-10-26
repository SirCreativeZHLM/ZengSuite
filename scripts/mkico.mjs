// Pack PNGs into a Windows .ico (PNG-compressed entries): node scripts/mkico.mjs out.ico 16.png 32.png ...
import fs from 'node:fs';
const [out, ...pngs] = process.argv.slice(2);
const imgs = pngs.map((p) => { const b = fs.readFileSync(p); return { b, w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; });
const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach((im, i) => { const o = 6 + 16 * i; head[o] = im.w >= 256 ? 0 : im.w; head[o + 1] = im.h >= 256 ? 0 : im.h; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(im.b.length, o + 8); head.writeUInt32LE(off, o + 12); off += im.b.length; });
fs.writeFileSync(out, Buffer.concat([head, ...imgs.map((i) => i.b)]));
