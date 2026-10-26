# ZengSuite — F*ck Microslop

A free, open-source office and creativity suite for **macOS, Windows and Linux**. Eleven real apps, each its own small native program with its own download. No Electron, no accounts, no ads, no telemetry, no subscription. MIT licensed.

| App | What it is | Signature feature |
|---|---|---|
| **Write** | word processor (`.docx` in/out) | Focus + Readability Lens |
| **Grid** | spreadsheets (`.xlsx` in/out) | Formula X-ray |
| **Stage** | presentations (`.pptx` in/out) | Remix |
| **Look** | PDF + image viewer, markup, signing | Clean Scan |
| **Text** | plain/rich text editor | Time-travel history |
| **Notes** | notes & knowledge base | Link Graph |
| **Canvas** | infinite whiteboard | Tidy |
| **Calendar** | calendar (`.ics`) | Time Balance |
| **Todo** | tasks & reminders | Today's Three |
| **People** | contacts (`.vcf`) | Relationship rhythm |
| **Calc** | calculator, graphing, scratch maths | Show Work |

Downloads: <https://zengbot.com/suite> and the [Releases](../../releases) page. Not code-signed yet: on macOS right-click the app and choose Open the first time; on Windows choose *More info → Run anyway*.

## How it is built
Rust workspace. `crates/zeng-shell` opens a native window (tao) with the operating system's own web view (wry: WKWebView / WebView2 / WebKitGTK) and serves each app's embedded UI over a private scheme. Native menus on macOS, native file dialogs everywhere, atomic saves. Each app is `apps/<id>/` (a ~20-line Rust crate + its `ui/`). Shared UI kit: `crates/zeng-shell/kit`. See `docs/KIT.md`.

```
cargo run -p zeng-text            # run one app
node scripts/dev.mjs text 5170    # or serve its UI in a browser for quick iteration
bash scripts/package.sh all       # dmg / zip / tar.gz into dist/
```
Linux needs `libwebkit2gtk-4.1` and GTK 3; Windows needs the WebView2 runtime (ships with Windows 11).

Not here yet: an email client, real-time cloud collaboration. Contributions welcome.

Trademarks belong to their owners; ZengSuite is an independent project and is not affiliated with Apple or Microsoft. Icons, names and designs here are original.
