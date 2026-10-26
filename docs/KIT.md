# ZengSuite app contract

Every app = a Rust crate in `apps/<id>/` + a web UI in `apps/<id>/ui/`. No Electron: `crates/zeng-shell` opens a native window and the OS web view (WKWebView / WebView2 / WebKitGTK) and serves `ui/` plus the shared `kit/` over `zeng://`. **Reference app: `apps/text`** (copy its Cargo.toml, src/main.rs, ui layout).

## Files an app must have
- `apps/<id>/Cargo.toml` — package `zeng-<id>`, `[[bin]] name = "zeng<id>"`, deps `zeng-shell`, `include_dir` (copy text's).
- `apps/<id>/src/main.rs` — only the `AppSpec` (name, `id: "com.zengbot.suite.<id>"`, window size) + `zeng_shell::run`.
- `apps/<id>/ui/index.html` + `app.js` + `app.css` (+ more files; all embedded in the binary). Load `/kit/zeng.css`, `/kit/icons.js`, `/kit/zeng.js` first.
- `apps/<id>/icon.svg` — 1024x1024 app icon, Apple-style rounded square (rx ~224) with gradient + an original glyph. Original art only, never Apple's.
- `apps/<id>/app.json` — `{"id","name","tagline","msEquivalent","accent","extensions":["zpages",...],"mime":...}` (used by packaging + website).

## The product rule
**The app is just the app.** No marketing, no upsell, no "About" pages selling anything, no telemetry, no sign-in, no network. First launch shows an empty/untitled document, not a splash. Everything works offline. File formats: native format is open JSON/zip/text, plus the Microsoft / standard formats listed in the brief for that app.

## Design rules (apple-design skill + impeccable "Operate" mode)
- Looks and moves like a first-party Mac app that also feels right on Windows/Linux: system fonts (Inter is bundled as the fallback), translucent toolbar, hairline separators, 28px controls, restrained colour, accent colour per app via `--accent`/`--accent-rgb` on `:root`.
- Toolbar: first child of `.zk-app` is `<div class="zk-toolbar zk-titlebar">` (on macOS the window has no title bar; this toolbar IS the title bar, traffic lights sit at its left, drag works automatically on blank areas). Put the document name in `<div class="zk-title" data-doc-title>`.
- Light + dark via the CSS tokens (never hard-code colours that break in dark mode). Honour reduced motion.
- Feedback on pointer-down, 1:1 direct manipulation (pointer events + `setPointerCapture`), interruptible springs (`zk.spring`) for anything gestural, critically-damped by default. Do **not** use HTML5 drag-and-drop for in-app dragging (the shell intercepts OS file drops); use pointer events.
- No `eval`, no `new Function`, no remote scripts/fonts/images/network (CSP blocks them). Vendor any library you need under `apps/<id>/ui/vendor/` (MIT/Apache/BSD only; keep the licence text next to it). Shared `kit/vendor/fflate.js` (zip/gzip) is available as global `fflate`.
- Keyboard: complete menus with standard accelerators; every toolbar action reachable from a menu; Tab order and `aria-label`s on icon buttons.
- Edge cases: huge docs, empty states, bad files (show `zk.alert`, never crash), unsaved-changes guard (kit does it if you use `zeng.doc`).

## Kit API (`/kit/zeng.js`, globals `zeng` and `zk`)
Boot: `await zeng.ready` → `zeng.info {name,id,version,platform:'mac'|'win'|'linux'}`; `zeng.isNative`; `zeng.platform`.
Documents: `const doc = zeng.doc({name, ext, filters, openExts, blank(), load(buf, ext, handle), save(ext)→string|Uint8Array|Blob, export:[{label, ext, run?}], print?, onOtherFiles?(handles)})` → `doc.new/open/save/saveAs/openHandle/markDirty/setClean/fileMenu()/ready/file/dirty`. Call `doc.markDirty()` on every edit. `load` throws on bad data. Title, dirty dot, close guard, recents, drop/open-with are handled.
Menus: `zeng.setMenus([{label:'File', items:[…]},…])`; item `{label, id?, accel:'CmdOrCtrl+Shift+S', run, checked?, enabled?, submenu?}` or `{separator:true}`. Native on macOS, in-page menubar on Windows/Linux/web. Re-call `zeng.setMenus` (or `zeng.refreshMenus()`) when checked/enabled state changes. Standard: `doc.fileMenu()`, `zeng.stdEdit({undo,redo,extra})` (pass your own undo/redo if you have a history stack). `zeng.shortcut(accel, fn)` for page-only keys.
Files: `zeng.files.open/saveDialog/saveAs/read/readText/write/url/listDir/reveal`, `zeng.onFiles(cb)` (return `false` if you consumed them). Handles are `{name, path?, file?}`; `zeng.files.url(h)` gives a URL usable in `<img>/<audio>/<video>/pdf.js`.
Storage: `await zeng.store.get(key, default)` / `set(key, jsonValue)` — per-app JSON in the user's config dir (use for settings and for apps whose data is a database: Notes, Calendar, Reminders, Contacts).
UI helpers: `zk.el('div.cls', {attrs}, ...kids)`, `zk.icon('name')` (Lucide subset in `kit/icons.js`; add names to `scripts/build-icons.mjs` + re-run: `node scripts/build-icons.mjs $(npm root -g)/lucide-static` or any lucide-static path), `zk.btn({icon,label,title,onClick})`, `zk.menu(items,{anchor|x,y})`, `zk.contextMenu(e, items)`, `zk.popover(anchor, el)`, `zk.sheet({title,message,body,buttons})→Promise`, `zk.alert/confirm/prompt`, `zk.toast`, `zk.spring`, `zk.project`, `zk.rubberband`, `zk.debounce`, `zk.clamp`, `zk.esc`, `zk.uid`.
CSS classes: `.zk-app .zk-toolbar .zk-titlebar .zk-secondary .zk-statusbar .zk-sidebar .zk-inspector .zk-row .zk-col .zk-fill .zk-seg .zk-btn(.icon/.bordered/.primary) .zk-input .zk-select .zk-switch .zk-check .zk-list-item .zk-section …` — read `crates/zeng-shell/kit/zeng.css`.
Other: `zeng.print()` (native print dialog; use `@media print` CSS), `zeng.fullscreen(on)`, `zeng.quit()`.

The kit is shared: additive, backwards-compatible fixes only (small Edit calls, never rewrite a kit file). Note anything bigger in `docs/KIT-REQUESTS.md`.

## Dev loop
- Browser (fast, scriptable with Playwright): `node scripts/dev.mjs <id> <port>` → `http://localhost:<port>`. In the browser, files use `<input>`/download.
- Native: `cargo build -p zeng-<id> && ./target/debug/zeng<id>`; screenshot with `screencapture -x out.png` (the window opens on the main display). Always check at least once natively before finishing (menus, open/save dialogs, dark mode).
- Verify by actually driving the UI (Playwright against the dev server): create content, save/reopen a file round trip, export each format and re-parse it, no console errors. Fix what you see.
