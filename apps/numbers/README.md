# Grid (ZengGrid)

A spreadsheet for macOS, Windows and Linux: a canvas grid that stays at 60 fps on 100,000 rows, a hand-written formula engine with 480+ functions, tables, conditional formatting, charts, and **Formula X-ray**. Fully offline, no accounts, no telemetry.

Binary `zengnumbers`, id `com.zengbot.suite.numbers`, native format `.znumbers`.

## Formula X-ray (signature feature)
`View › Formula X-ray` (toolbar magnifier, Cmd/Ctrl+Alt+X). Select any cell and animated arrows flow into it from the cells and ranges it uses (blue) and out to the formulas that use it (green). A card explains the formula in plain English ("Adds Amount (B2:B10) where Category (A2:A10) equals “Food”"), lists what it uses and what uses it, and offers:
- **Trace to source** – follows the whole chain of precedents to the typed-in input cells, tints every contributing cell and lists the sources with their values.
- **Hard-coded number warning** – an amber marker on the cell and a list of numbers typed straight into the formula (e.g. `*1.08`); **Name it** turns the number into a named constant and rewrites the formula.
- **Name this range** – one click replaces a reference such as `B2:B10` with a name like `Amount` in the formula.
Arrows animate only when motion is allowed (reduced-motion shows static arrows).

## What is in it
- **Grid**: sparse column-major storage, native scrolling, selection / multi-range / keyboard (arrows, Tab/Enter, Shift-select, Ctrl+arrows, F2, Esc, Ctrl+D/R, Alt+=, Ctrl+; …), formula bar with name box, in-cell editing with colour-coded references, point-and-click references, function autocomplete and argument hints, fill handle (series, patterns, formula adjustment), drag-move cells (references to moved cells are updated), copy/cut/paste (internal rich, TSV, HTML, from/to other apps), insert/delete rows and columns, resize / auto-fit, hide/unhide, freeze panes, merge, zoom, undo/redo for everything, find/replace (regex, all sheets).
- **Formulas**: tokenizer + parser + dependency graph with incremental recalculation, cycle detection (`#CIRC!`), cross-sheet references, named ranges, structured table references, dynamic arrays with spill (FILTER, SORT, UNIQUE, SEQUENCE, …), LET/LAMBDA/MAP/REDUCE. No `eval`.
- **Formatting**: full number-format codes, fonts, fills, borders, alignment, conditional formatting (cell rules, scales, data bars, icon sets, formulas), data validation with dropdowns, cell styles, tables with banding/total row/filters, sort and filter, pivot summary, duplicates, text-to-columns, goal seek.
- **Charts**: own SVG renderer (column, bar, line, area, pie, donut, scatter, combo, stacked), move/resize with the pointer, live updating, sparklines.
- **Inspector** (Cell / Table / Chart), status bar Sum/Average/Count/Min/Max, templates (Blank, Budget, Invoice, Loan calculator, Checklist).

## Files
Open and save `.znumbers` (zip with `workbook.json`, `meta.json`, `README.txt`; open and documented), `.xlsx` (hand-written reader/writer), `.csv` / `.tsv` (delimiter and encoding detection). Export `.xlsx .csv .tsv .html .json`, PDF via the print dialog.

## Tests
`node tests/run.js` runs ~2,200 assertions against the engine (functions, formats, IO round trips, tools, charts, X-ray, templates). UI behaviour was driven with headless Chromium.

## Known limits
- Charts are written to `.xlsx` but not read back from it; images, comments, hyperlinks and pivot caches in imported `.xlsx` files are ignored. Extended data-bar/icon-set extensions are ignored.
- LAMBDA parameters are not written with Excel's internal prefix, so they may not round-trip into other spreadsheet apps.
- SUBTOTAL 1–11 does not honour filtered rows (101–111 skip hidden rows). Multi-area references are not supported.
- Pivot summaries are static tables (re-run to refresh). Cell comments and print layout options (headers, page breaks) are not implemented.
- Not verified against other spreadsheet apps in this environment (no LibreOffice installed); `.xlsx` output was checked with XML parsing and an independent reader.
