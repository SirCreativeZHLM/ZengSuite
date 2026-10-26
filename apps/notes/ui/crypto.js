/* Note locking: PBKDF2-SHA256 -> AES-256-GCM via WebCrypto. Only ciphertext is stored. */
(() => {
  const U = N.u; const C = (N.crypto = {});
  const ITER = 600000;
  const sub = () => { if (!(window.crypto && crypto.subtle)) throw new Error('This system does not provide encryption (WebCrypto unavailable).'); return crypto.subtle; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  C.derive = async (pw, salt, iter = ITER) => {
    const s = sub(); const base = await s.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return await s.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  };
  C.encBytes = async (key, bytes) => {
    const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await sub().encrypt({ name: 'AES-GCM', iv }, key, bytes));
    return { iv: U.b64(iv), ct };
  };
  C.decBytes = async (key, iv, ct) => new Uint8Array(await sub().decrypt({ name: 'AES-GCM', iv: U.unb64(iv) }, key, ct));
  // Lock: payload is any JSON-able value. Returns {lock, key}
  C.seal = async (payload, pw) => {
    const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await C.derive(pw, salt);
    const r = await C.encBytes(key, enc.encode(JSON.stringify(payload)));
    return { lock: { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: U.b64(salt), iv: r.iv, ct: U.b64(r.ct) }, key };
  };
  // Re-encrypt with an existing key + salt (autosave while unlocked).
  C.reseal = async (payload, key, lock) => {
    const r = await C.encBytes(key, enc.encode(JSON.stringify(payload)));
    return { ...lock, iv: r.iv, ct: U.b64(r.ct) };
  };
  C.openWithKey = async (lock, key) => JSON.parse(dec.decode(await C.decBytes(key, lock.iv, U.unb64(lock.ct))));
  // Open: throws on wrong password.
  C.open = async (lock, pw) => {
    const key = await C.derive(pw, U.unb64(lock.salt), lock.iter || ITER);
    let bytes; try { bytes = await C.decBytes(key, lock.iv, U.unb64(lock.ct)); } catch { throw new Error('wrong password'); }
    return { payload: JSON.parse(dec.decode(bytes)), key };
  };
})();
