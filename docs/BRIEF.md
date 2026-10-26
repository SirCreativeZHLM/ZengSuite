# Brief for every app builder (read with docs/KIT.md)

You own exactly one directory: `apps/<id>/`. You are building a **complete, shippable, free, open-source** replacement for the named Apple + Microsoft 365 app. Aim for what a person doing real work expects from Pages/Word, not a demo: breadth of features, correctness, polish, speed. Work autonomously until it is genuinely done; do not stop at a skeleton. Do not ask the user questions; make sensible decisions.

## Environment rules (important)
- macOS, repo at `~/ZengSuite`, Rust 1.99, Node 26, Python 3.14. Everything runs offline once vendored; get libraries with `npm i` into a scratch dir (use the scratchpad dir named in your system prompt, never the repo) and copy only the dist files + LICENSE into `apps/<id>/ui/vendor/`. Keep binaries small: don't vendor anything you don't ship.
- **Desktops:** the user keeps Desktop 3 for terminal work and Desktop 2 for GUI. Never switch Spaces. Native app windows you launch appear on the current Space, which is right. Test in a browser with **headless** Playwright (`npm i playwright-core` in scratch; chromium is at `~/Library/Caches/ms-playwright/chromium-*`; use `chromium.launch({executablePath, headless:true})`), not the shared Playwright MCP browser. Always `pkill` any native app you launched when done.
- Other agents are building the other apps at the same time in the same repo and the same `target/` dir. Only edit your own `apps/<id>/`. Kit edits: small additive `Edit`s only. Cargo may block briefly on the shared build lock; that's normal. Never run `cargo clean`, never `git add/commit/push` (the lead commits), never touch other apps or `site/`.
- No Electron, no network at runtime, no telemetry, no eval. Only MIT/BSD/Apache/ISC/OFL-licensed vendored code, with licence files.
- No marketing inside the app. No Apple/Microsoft trademarks or artwork in the UI or icon (feature names like "Heading 1" are fine). The app name shown in the UI is the short name ("Pages"); binaries/downloads are "ZengPages".

## Definition of done
1. Feature list in your spec is implemented and actually works (drive it with Playwright; make real files; round-trip them; re-parse exports with an independent tool when possible, e.g. python zipfile / `unzip -l` / XML parse / `qpdf --check` / `pdfinfo` if present).
2. `cargo build --release -p zeng-<id>` succeeds with no warnings you introduced, and the **native** binary was launched once, screenshotted (`screencapture -x`), and looked right in light and dark (toggle with `osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to true'` and restore the original setting afterwards).
3. No console errors/uncaught exceptions during a normal session; keyboard-complete; no layout overflow at the minimum window size; empty/error states handled.
4. Files present: `Cargo.toml`, `src/main.rs`, `ui/**`, `icon.svg`, `app.json`, plus `README.md` (what it does, formats, shortcuts, known limits — honest) and `sample/` with 1–2 small real sample files in the native format if applicable.
5. Final message to the lead (≤ 25 lines): what works, what is deliberately not done, formats supported, and any kit gaps hit. Be honest about untested/partial things; do not claim verification you didn't run.

## Visual quality bar
Study how Apple's apps look: generous but dense-enough layout, translucent toolbar, tiny hairlines, SF-style type scale (13px UI, 11px secondary), 28px controls, 8px radii, springs on sheets/popovers, selected states in accent colour. Use the `apple-design` skill principles (response, direct manipulation, interruptibility, restraint). Make it beautiful at 1x and 2x, in light and dark.

## Disk budget (hard rule)
The user must keep ≥130 GB free. Whole-suite build output must stay under ~3 GB. Never create node_modules inside the repo; in scratch, delete `node_modules` after copying what you vendor. No video/large binary fixtures (>5 MB). Don't build for other targets or architectures locally (CI does that). `.cargo/config.toml` already disables incremental builds and debug info — keep it. Delete test artefacts (screenshots, generated big docs) when done.
