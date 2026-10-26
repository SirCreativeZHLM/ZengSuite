# ZengNotes ("Notes")

A fast, offline notes app: folders and tags, checklists, tables, code blocks, sketches, attachments, encrypted notes, a **Link Graph**, a **Daily note**, and **Related notes**. Everything is stored on your computer; there is no network access, account or telemetry.

Binary `zengnotes`, id `com.zengbot.suite.notes`, window 1120x760 (minimum 700x480). Accent `#ffd60a`.

## What it does
- **Three panes**: folders (nested), smart folders (All, Pinned, Checklists, With Attachments, Locked, Recently Deleted - 30-day purge) and tags; a note list (sort by modified / created / title, grouped by day, pinned section, snippet and thumbnail, compact mode, multi-select, drag notes onto folders); the editor.
- **Search** (⌘F): instant full-text across titles, bodies, tags and attachment names with highlighting in the list and in the open note. **Find in note** (⌘⌥F, ⌘G).
- **Editor**: title, three heading levels, bold / italic / underline / strike / inline code, quotes, bulleted / dashed / numbered lists with nesting, **checklists** (click the circle; optional "move checked items to the bottom"), tables (Tab to move, context menu for rows/columns), links (auto-detected; ⌘-click to open), horizontal rule, code blocks with syntax tint, image and file attachments (drag, paste or Insert menu; images preview inline, double-click to enlarge), **sketch blocks** (pen, marker, highlighter, eraser, lasso, smoothing; undoable like everything else).
- **Markdown shortcuts**: `# `, `## `, `### `, `- ` (dashed list), `* ` (bullets), `[] ` (checklist), `1. `, `> `, ```` ``` ```` + Return (code block), `---` + Return, and `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` followed by a space. Type `/` for the insert menu. `#tags` are recognised anywhere. `[[Title]]` links to another note (a picker opens as you type); linked notes show **backlinks**.
- **Undo / redo** is the app's own history, covering typing, formatting, checklist ticks, tables, attachments and sketch strokes.
- **Lock a note** with a password: PBKDF2-SHA256 (600,000 iterations) + AES-256-GCM through WebCrypto. Text and attachments are stored as ciphertext only. The title remains visible in the list. **If you forget the password the note cannot be recovered.** Locked notes re-lock after a chosen idle time or via Note > Lock All Notes Now.
- **Link Graph** (toolbar, View > Link Graph, ⌘⌥G): an interactive map of notes, `[[links]]` and `#tags`. Hand-written physics (Barnes-Hut repulsion, springs, gravity) on canvas, momentum pan, eased zoom (scroll / pinch / buttons), drag nodes, hover for a preview, click to open (tag diamonds filter the list). Filter by folder or tag, hide tags or unlinked notes, show just the neighbourhood of the current note (1-3 hops), search nodes. Smooth with 5,000 nodes (measured: ~4.5 ms physics + ~2 ms draw per frame).
- **Daily note** (⌘D, or the calendar button): opens or creates today's note in a "Daily" folder with a checklist and a link to the previous day.
- **Related notes**: a strip under each note, ranked by TF-IDF cosine similarity of the text, boosted by direct links and shared tags, with the reason shown.
- **Modes**: Distraction-Free (⌘⇧↩, Esc to leave), Sticky Style (compact cool-tinted card, ⌘⌥Y), font size (⌘+ / ⌘- / ⌘0), text width and list density in Settings (⌘,).
- **Data safety**: autosave 800 ms after the last change plus on blur / hide / close (the window waits for the flush before quitting); a visible "Saved" tick; every note record has two slots written alternately (first write goes to both) so a damaged file falls back to the previous copy; the index has three rotating copies; a damaged library offers restore from backup.

## Files and formats
- Library: `zeng.store` (one JSON per note, an index, search shards, attachment chunks, thumbnails). No Save command.
- **Back up / restore**: `.znotes` (a zip with `library.json` + `attachments/`); restore merges (newer copy wins) or replaces. Locked notes stay encrypted in backups.
- **Export**: Markdown (zip with an `attachments/` folder when needed), HTML (self-contained, images inlined), plain text, PDF (via the print dialog), whole library or one folder as Markdown zip.
- **Import**: Markdown (YAML front matter, task lists, tables, images relative to the file), plain text, HTML (including Word-style list markup), folders of files (structure becomes folders), `.enex` archives (notes, checklists, tags, attachments matched by MD5), Takeout notes (`.json` or the `.zip`, checklists, labels, pinned, attachments), Word `.docx` (headings, runs, lists, tables, images, links - best effort), and `.znotes` backups.
- **Sample library**: only through File > Import Sample Library (12 notes with links, a table, code, a sketch and two images). A fresh install starts with one blank note.

## Shortcuts
⌘N new note, ⌘⇧N new folder, ⌘D daily note, ⌘F search, ⌘⌥F find in note, ⌘⌫ delete note (undo from the toast; Recently Deleted keeps it 30 days), ⌘P pin, ⌘L lock, ⌘K link, ⌘⇧L checklist, ⌘⇧8 / 9 / 7 bulleted / dashed / numbered, ⌘⇧H / J / K heading levels, ⌘⇧A attach, ⌘⇧D sketch, ⌘⌥T table, ⌘⌥S show folders, ⌘⌥G link graph, ⌘1 / 2 / 3 focus folders / list / editor, ↑ ↓ Home End PageUp PageDown move through the list, ⇧ / ⌘-click multi-select. On Windows and Linux use Ctrl and Alt.

## Known limits (honest)
- Search covers the first 40,000 characters of each note. Locked notes are searchable by title only.
- The store has no delete or key listing, so purged notes leave empty files and a lost index can only be recovered from its three copies or a backup (see `docs/KIT-REQUESTS.md`). Attachments are base64 JSON: fine to tens of MB, slow beyond; the hard limit is 200 MB per file.
- Links match by title or id; renaming a note does not rewrite links that only know the old title.
- Scribble / handwriting recognition, OCR and scanning are not included. Word `.docx` import is best effort (no footnotes, comments or text boxes).
- Windows and Linux builds are untested locally (only macOS was run natively).
