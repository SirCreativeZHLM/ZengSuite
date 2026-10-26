# Text

A calm plain-text and rich-text editor. Free, offline, no account.

- Plain and rich modes (rich saves as HTML), find & replace, live word/character counts, tab-indent, zoom.
- Opens `.txt .md .log .json .csv .html .xml .yml .toml` and most source files; drop files on the window.
- **Signature: Time-travel history** (⇧⌘H). Every document keeps local snapshots as you work (idle-debounced, thinned automatically, named snapshots kept). Scrub a slider through past versions, see a line diff against what you have now, restore any version. Restoring first snapshots your current text, so it is undoable. Snapshots live in the app's own data folder on your machine, never uploaded.

Known limits: history is keyed by file path (renaming a file starts a new history); snapshots store whole text (capped at ~120 per file); find/replace in rich mode is find-only.
