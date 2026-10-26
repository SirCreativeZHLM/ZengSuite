/* ZengSuite site: OS detection for download buttons, modifier-key labels, app preview on the landing page. No dependencies. */
(() => {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  const plat = ((uad && uad.platform) || navigator.platform || '').toLowerCase();
  const mobile = /android|iphone|ipad|ipod/i.test(ua) || (uad && uad.mobile);
  let os = '';
  if (!mobile) {
    if (/mac/.test(plat) || /Macintosh/.test(ua)) os = 'macos';
    else if (/win/.test(plat) || /Windows/.test(ua)) os = 'windows';
    else if (/linux|cros|x11/.test(plat + ua.toLowerCase())) os = 'linux';
  }
  const arm = /aarch64|arm64|\barm\b/i.test(ua);
  const key = { macos: 'macos-arm64', windows: 'windows-x64', linux: arm ? 'linux-arm64' : 'linux-x86_64' }[os] || '';
  const names = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  const root = document.documentElement;
  if (os) root.dataset.os = os;

  if (key) {
    document.querySelectorAll('[data-p="' + key + '"]').forEach((el) => el.classList.add('you'));
    document.querySelectorAll('a[data-primary]').forEach((a) => {
      const scope = a.closest('[data-scope]') || document;
      const t = scope.querySelector('.dl a[data-p="' + key + '"]') || document.querySelector('.dl a[data-p="' + key + '"]');
      if (!t) return;
      a.href = t.href;
      a.textContent = 'Download ' + (a.dataset.primary || '') + ' for ' + names[os];
      a.removeAttribute('data-primary');
    });
  }

  // "Mod" is Command on a Mac and Ctrl everywhere else.
  const mod = os === 'macos' ? '⌘' : 'Ctrl';
  document.querySelectorAll('[data-mod]').forEach((el) => { el.textContent = mod; });
  if (os === 'macos') document.querySelectorAll('[data-alt]').forEach((el) => { el.textContent = '⌥'; });

  // Landing page: hovering or focusing an app row swaps the big preview.
  const rows = document.querySelectorAll('.row[data-app]');
  const shots = document.querySelectorAll('.stage .shot[data-app]');
  const cap = document.querySelector('.stage [data-cap]');
  if (rows.length && shots.length) {
    const show = (id) => {
      rows.forEach((r) => r.classList.toggle('on', r.dataset.app === id));
      shots.forEach((s) => { s.hidden = s.dataset.app !== id; });
      const r = document.querySelector('.row[data-app="' + id + '"]');
      if (cap && r) cap.textContent = r.dataset.cap;
    };
    rows.forEach((r) => {
      r.addEventListener('mouseenter', () => show(r.dataset.app));
      r.addEventListener('focus', () => show(r.dataset.app));
    });
  }
})();
