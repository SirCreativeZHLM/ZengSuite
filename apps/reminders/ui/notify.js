/* In-app alerts at due time (banner + WebAudio chime) and the overdue badge in the window title. */
(function () {
  const A = ZR.A, V = ZR.views, D = ZR.dates, h = zk.el, ST = ZR.store; let ctx = null;
  const sounds = (A.sounds = {
    unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch {} },
    note(freq, t0, dur, vol = 0.18) { if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination); const t = ctx.currentTime + t0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.start(t); o.stop(t + dur + 0.05); const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = 'sine'; o2.frequency.value = freq * 2.01; o2.connect(g2); g2.connect(ctx.destination); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.01); g2.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.6); o2.start(t); o2.stop(t + dur); },
    chime() { sounds.unlock(); sounds.note(880, 0, 0.7); sounds.note(1318.5, 0.16, 0.9); sounds.note(1760, 0.34, 1.1, 0.12); },
    tick() { if (!A.setting('sound', true)) return; sounds.unlock(); sounds.note(1568, 0, 0.12, 0.06); },
  });
  const allDayMin = () => D.minutes(A.setting('allDayTime', '09:00')) ?? 540;
  const shown = new Map(); const box = A.$('#banners');
  function whenText(r, at, early) { const dt = A.dueText(r); return early ? `${A.earlyText(early).replace(' before', '')} — due ${dt}` : `Due ${dt}`; }
  function banner(r, key, at, early) {
    if (shown.has(key)) return; const close = () => { const b = shown.get(key); if (!b) return; shown.delete(key); b.classList.add('out'); setTimeout(() => b.remove(), 260); };
    const snooze = (mins) => { close(); ST.commit('Snooze', (d) => d.set(r.id, { snooze: mins === 'tomorrow' ? D.at(D.addDays(D.today(), 1), '09:00').getTime() : Date.now() + mins * 60000 })); };
    const b = h('.zr-banner', { role: 'alert' }, h('.ico', zk.icon('bell', 16)), h('.bd', h('.t', r.title), h('.s', whenText(r, at, early)), h('.ac', h('button.zk-btn', { type: 'button', onclick: () => { close(); A.toggleDone([r.id], true); } }, 'Complete'), h('button.zk-btn', { type: 'button', onclick: (e) => zk.menu([{ label: '5 minutes', run: () => snooze(5) }, { label: '15 minutes', run: () => snooze(15) }, { label: '1 hour', run: () => snooze(60) }, { label: 'Tomorrow 9:00 AM', run: () => snooze('tomorrow') }], { anchor: e.currentTarget }) }, 'Snooze'), h('button.zk-btn', { type: 'button', onclick: () => { close(); A.setView({ k: 'smart', id: 'today' }); A.select(r.id); A.revealId = r.id; } }, 'Show'))), h('button.zk-btn.icon.x', { type: 'button', 'aria-label': 'Dismiss', onclick: close }, zk.icon('x', 12)));
    shown.set(key, b); box.append(b); while (box.children.length > 5) box.firstChild.remove();
  }
  A.banner = banner;
  let first = true;
  function tick() {
    const now = Date.now(); const S = A.S(); const fired = []; const patch = {}; let missed = 0;
    for (const id in S.reminders) {
      const r = S.reminders[id]; if (r.done || !r.due) continue; const base = D.at(r.due, r.time, allDayMin()).getTime();
      const cands = []; if (r.early > 0) cands.push([base - r.early * 60000, `${id}|${r.due}|${r.time}|e${r.early}`, r.early]); cands.push([base, `${id}|${r.due}|${r.time}|d`, 0]); if (r.snooze) cands.push([r.snooze, `${id}|snz${r.snooze}`, 0]);
      for (const [at, key, early] of cands) {
        if (at > now || S.fired[key]) continue; patch[key] = now;
        if (now - at > 15 * 60000 && !key.includes('snz')) { if (first) missed++; continue; } if (early && base <= now) continue;
        fired.push([r, key, at, early]);
      }
    }
    if (Object.keys(patch).length) ST.meta((s) => { Object.assign(s.fired, patch); const cut = now - 14 * 86400000; for (const k in s.fired) if (s.fired[k] < cut) delete s.fired[k]; });
    if (fired.length) { fired.forEach(([r, k, at, e]) => banner(r, k, at, e)); if (A.setting('sound', true)) sounds.chime(); }
    if (first && missed) A.toast(`${missed} reminder${missed === 1 ? ' is' : 's are'} overdue`, { label: 'Show', run: () => A.setView({ k: 'smart', id: 'today' }), ms: 8000 });
    first = false; badge();
  }
  function badge() {
    const n = V.counts(A.S(), new Date()).overdue; const b = A.$('#badge'); b.classList.toggle('zk-hidden', !n); b.textContent = String(n); b.setAttribute('aria-label', `${n} overdue`);
    const t = n ? `(${n}) Todo` : 'Todo'; if (document.title !== t) { document.title = t; if (zeng.isNative) window.ipc.postMessage(JSON.stringify({ cmd: 'title', title: t })); }
  }
  A.badge = badge; A.renderers.chrome = badge; A.A_tick = tick;
  A.$('#badge').addEventListener('click', () => A.setView({ k: 'smart', id: 'today' }));
  let day = D.today(); setInterval(() => { tick(); const t = D.today(); if (t !== day) { day = t; A.render(true); } else if (!A.editingEl) A.render(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); A.render(); } });
})();
