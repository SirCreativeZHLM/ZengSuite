# Write (ZengWrite)

A free, offline word processor with real pages. Bundle id `com.zengbot.suite.pages`, binary `zengpages`, native format `.zpages`.

## What it does
- **Real pages.** One editable flow is laid out across separate sheets on a grey canvas. Paragraphs and table rows that cross a page boundary are split at the line / row where the page ends, with widow/orphan and keep-with-next handling, so pagination is visible while you type. Print and PDF output are built from the same layout (one clone per sheet, fixed `@page` size, margins applied inside the sheet), so they match the screen.
- **Page setup.** US Letter, A4, US Legal, A5 and custom sizes; portrait/landscape; margins; header/footer distance; 1-3 columns; headers and footers with page-number / page-count / date fields; different first page; first page number; page and column breaks. Zoom 25-400% (ctrl-wheel / pinch / slider / fit width / fit page).
- **Text.** Paragraph styles (Title, Subtitle, Heading 1-4, Body, Quote, Code, Caption + your own) that can be modified, reset, created from a selection and updated to match the selection. Font family (installed fonts are detected) and size, bold/italic/underline/strike, super/subscript, colour, highlight, small caps, case change, letter spacing, clear formatting, alignment incl. justify, line and paragraph spacing, indents and first-line indent, tabs, paragraph borders and shading.
- **Lists.** Bullets, numbered (1. a. i.), outline numbering (1.1.1) and checklists; correct renumbering, restart and continue.
- **Objects.** Tables (grid picker, add/remove/merge/split, header row, shading, borders, alignment, column resize by pointer, table styles), images (insert, paste, drop; resize handles; inline / left / right / break wrapping; alt text; captions; drag to move), shapes (rectangle, ellipse, triangle, line, arrow with fill/stroke), hyperlinks, bookmarks and cross-references, footnotes, automatic table of contents, equations (LaTeX-style source rendered as MathML).
- **Review.** Comments with replies and resolve (sidebar), track changes (typed insertions and deletions, accept / reject), find and replace with regex / case / whole word / highlight all, live word / character / page counts, the webview's spellcheck.
- **Focus + Readability Lens (signature feature).** Focus mode dims everything except the current paragraph or sentence, optional typewriter scrolling, chrome steps out of the way (Esc leaves). The Lens panel shows reading and speaking time, Flesch reading ease and Flesch-Kincaid grade, long sentences (adjustable threshold), possible passive voice, doubled and overused words (click a word to highlight every use), and a per-heading word-count outline. All local; the heuristics are tuned for English.
- **Templates.** File > New from Template: Blank, Letter, Resume, Report, Newsletter, Meeting Notes. The app itself always starts with a blank document.
- **Safety.** Draft autosave (every few seconds after an edit) with a recover prompt on the next launch; unsaved-changes guard on close/new/open.

## Formats
| Format | Open | Save / export |
|---|---|---|
| `.zpages` | yes | yes (native) |
| `.docx` | yes | yes |
| `.html` `.htm` | yes | yes (images embedded) |
| `.md` | yes (GFM subset, footnotes, `$math$`) | yes |
| `.txt` | yes | yes |
| `.rtf` | yes (basic) | yes (basic) |
| PDF | - | File > Export To > PDF opens the system print dialog; choose "Save as PDF" |

### `.zpages` is open
A zip archive:
```
document.html   the body content (our block model; see below)
meta.json       {format:"zpages", version:1, page, cols, colGap, diffFirst, pageStart, tab, hdr, ftr, styles, comments, media:{id:{file,mime}}}
media/<id>.<ext>  images referenced by <img data-m="id" src="media/...">
```
Block model: `p` / `h1`-`h4` blocks (`data-st` style name, `data-list` = b|n|m|c with `data-lv`, paragraph overrides as inline CSS custom properties `--il --ir --fi --sb --sa --lh`), `table` (`data-ts` style, `colgroup`), `div.pgbreak`, inline `b i u s sub sup a span ins del`, `span.cmt[data-cid]` comment anchors, `sup.fnr[data-fn]` footnote refs with `p[data-fnid]` notes after `hr.fnsep`, `span.eq[data-tex]`, `span.shp` shapes. Transient layout markup (`data-pg`, `.pgsp` spacers) is never saved.

### `.docx`
Hand-written OOXML (via the bundled fflate). Export: paragraphs, runs (font, size, colour, shading, caps, spacing), styles, multi-level lists with restart/continue, tables (spans, shading, borders, header rows), inline and anchored images, shapes (as pictures), hyperlinks, bookmarks, headers/footers with PAGE/NUMPAGES fields, different first page, page size/margins/columns, footnotes, comments with threading and resolved state, tracked changes, equations (OMML) and a TOC field. Import reads the same plus theme fonts, style inheritance, numbering definitions, anchored images (wrap), VML images, content controls, `fldSimple`, complex fields and OMML. It was checked by unzipping, XML-parsing every part, opening the result with python-docx and round-tripping through the importer. It has **not** been opened in Microsoft's or LibreOffice's renderer (neither is installed here).

## Shortcuts (Cmd on macOS, Ctrl elsewhere)
B/I/U, K link, Shift+7/8/9 numbered/bullets/checklist, [ ] indent, Alt+0-4 styles, Shift+L/E/R/J align, \ clear formatting, F find, G/Shift+G next/previous, Alt+M comment, Shift+T track changes, Alt+E equation, Shift+F focus mode, Alt+L lens, Alt+S sidebar, Alt+I inspector, +/-/0 zoom, Shift+N new from template. Tab / Shift+Tab move through table cells and indent lists.

## Known limits (honest list)
- Footnotes are placed at the end of the document (endnote style) and export as real footnotes; they do not reserve space at the bottom of the page where the reference is.
- In 2-3 column mode paragraphs and tables move to the next column as whole blocks (they are not split across columns); tables wider than a column are squeezed to it. Single-column documents split at the line.
- Table header rows are not repeated on following pages; a single table row taller than a page overflows.
- Track changes records typed text and deletions of text; paragraph-level edits, pasted content and formatting changes are not tracked. IME composition is not tracked.
- Floating objects are anchored to a paragraph (inline / left / right / break); there is no free positioning, no text boxes, no rotation or cropping. Nested tables, SmartArt, charts, WMF/EMF pictures and form fields are not imported.
- Equations support a practical subset of LaTeX (fractions, roots, scripts, big operators, Greek, matrices, delimiters, accents).
- PDF export is the system print path (no embedded PDF writer).
- Lists inside table cells are simple (no per-cell numbering definitions).
- `.rtf` and `.md` are lossy by nature (no styles, comments or tracked changes).
