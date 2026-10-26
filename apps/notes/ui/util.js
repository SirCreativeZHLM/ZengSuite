/* ZengNotes utilities. Global namespace N. */
window.N = window.N || {};
(() => {
  const U = (N.u = {});
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.b64 = (bytes) => {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };
  U.unb64 = (str) => { const s = atob(str); const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; };
  U.size = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  U.ext = (n) => ((n.match(/\.([^.\\/]+)$/) || [])[1] || '').toLowerCase();
  U.base = (n) => n.replace(/\.[^.\\/]+$/, '');
  U.safeName = (n) => (String(n).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 80) || 'Untitled');
  U.mimeOf = (name) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime', zip: 'application/zip', json: 'application/json', html: 'text/html' }[U.ext(name)] || 'application/octet-stream');
  U.extOfMime = (m) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'application/pdf': 'pdf', 'text/plain': 'txt', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4' }[m] || (m && m.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5));
  U.isImage = (t) => /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|avif)$/.test(t || '');
  U.sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  U.dayGroup = (ts, now = Date.now()) => {
    const d = new Date(ts), n = new Date(now); const startN = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const days = Math.floor((startN - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
    if (days <= 0) return ['0', 'Today']; if (days === 1) return ['1', 'Yesterday']; if (days < 8) return ['7', 'Previous 7 Days']; if (days < 31) return ['30', 'Previous 30 Days'];
    if (d.getFullYear() === n.getFullYear()) return ['m' + d.getFullYear() + '-' + d.getMonth(), MONTHS[d.getMonth()]];
    return ['y' + d.getFullYear(), String(d.getFullYear())];
  };
  U.shortDate = (ts, now = Date.now()) => {
    const d = new Date(ts), n = new Date(now);
    if (U.sameDay(d, n)) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const days = (n - d) / 864e5; if (days < 7 && days >= 0) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { year: '2-digit', month: 'numeric', day: 'numeric' });
  };
  U.longDate = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' });
  U.dateOnlyKey = (ts) => { const d = new Date(ts); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };
  U.hash16 = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff; return h % 16; };

  // Escape a RegExp source.
  U.reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // MD5 (needed to match Evernote ENEX <en-media hash>). Returns hex string.
  U.md5 = (bytes) => {
    const K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const len = bytes.length, total = ((len + 8) >> 6) * 64 + 64; const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
    const dv = new DataView(buf.buffer); dv.setUint32(total - 8, (len << 3) >>> 0, true); dv.setUint32(total - 4, Math.floor(len / 536870912), true);
    let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    const rol = (x, c) => (x << c) | (x >>> (32 - c));
    for (let o = 0; o < total; o += 64) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; } else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) | 0; A = D; D = C; C = B;
        B = (B + rol(F, S[(i >> 4) * 4 + (i & 3)])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16), ov = new DataView(out.buffer); ov.setInt32(0, a0, true); ov.setInt32(4, b0, true); ov.setInt32(8, c0, true); ov.setInt32(12, d0, true);
    return [...out].map((x) => x.toString(16).padStart(2, '0')).join('');
  };

  // Read a File/Blob/handle -> Uint8Array
  U.readHandle = async (h) => new Uint8Array(await zeng.files.read(h));
  U.blobToBytes = async (b) => new Uint8Array(await b.arrayBuffer());
  U.loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = url; });
  // Downscale an image blob to maxDim, returns {bytes,type,w,h}
  U.shrinkImage = async (bytes, type, maxDim = 2400, minBytes = 3 * 1048576) => {
    if (!/^image\/(png|jpeg|webp|bmp)$/.test(type)) return { bytes, type };
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    try {
      const im = await U.loadImage(url); const w = im.naturalWidth, h = im.naturalHeight;
      if (bytes.length < minBytes && Math.max(w, h) <= maxDim) return { bytes, type, w, h };
      const s = Math.min(1, maxDim / Math.max(w, h)); const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, type === 'image/png' && bytes.length < minBytes ? 'image/png' : 'image/jpeg', 0.86));
      if (!blob) return { bytes, type, w, h };
      const nb = await U.blobToBytes(blob); if (nb.length >= bytes.length && Math.max(w, h) <= maxDim) return { bytes, type, w, h };
      return { bytes: nb, type: blob.type, w: cv.width, h: cv.height };
    } catch { return { bytes, type }; } finally { URL.revokeObjectURL(url); }
  };
  U.thumbFrom = (el, size = 112) => {
    try {
      const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height; if (!w || !h) return null;
      const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); const s = Math.max(size / w, size / h);
      c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.drawImage(el, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
      return cv.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
  };
  U.download = (name, data, type) => zeng.files.write({ name }, data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' }));
  U.plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
})();
