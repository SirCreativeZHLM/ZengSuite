# Stage (ZengStage)

Presentation editor for ZengSuite: slide navigator, canvas with guides and snapping, 14 original themes, builds and transitions, full-screen presenting, and `.pptx` import/export. Offline, no accounts, no telemetry.

Binary `zengkeynote` · id `com.zengbot.suite.keynote` · native format `.zkey` · accent `#0a84ff`.

## Remix (signature feature)
**Remix** (toolbar, `Slide > Remix Slide…`, ⌥⌘R) re-lays-out the current slide into six designed variants, using rules rather than templates: it detects the title, bullets, images/charts/tables, a stand-out number and a quote, then arranges them with the deck's own fonts and colours.

| Variant | What it does |
| --- | --- |
| Hero | Full-bleed image with scrim and title (or a typographic hero when there is no image) |
| Split | Picture / panel on one half, title and points on the other |
| Big Number | The first figure it finds (`87% of users…`) set huge, rest as support |
| Grid | Points (and images) as numbered cards |
| Quote | A line to linger on, with attribution |
| Timeline | Points as steps along a line, alternating above and below |

Variants are previewed live as thumbnails in a spring-driven carousel (drag, flick, arrow keys, `1`–`6`, mouse wheel). The canvas morphs between variants (objects keep consistent names, so they glide). `Enter` applies, `Esc` cancels. **Whole deck** applies one variant to every slide for a consistent style (title and section slides keep their layout). It is one undo step. Shapes, lines and groups on the slide are left where they are; text, images, charts, tables and media are re-arranged.

## Editor
- Navigator with live thumbnails, multi-select, pointer drag-reorder with springs, sections, groups (indent/collapse), skip, duplicate, delete, copy/paste slides.
- Canvas: fit/zoom, rulers, drag-out guides, grid, smart guides and snapping, marquee, multi-select, resize/rotate (Shift keeps aspect or 15° steps, Alt resizes from centre), arrow-key nudge (Shift = 10), group/ungroup, lock, z-order, align/distribute, flip, copy/paste/duplicate (Alt-drag too), unlimited undo/redo (120 steps).
- Objects: rich text boxes (fonts, sizes, colours, highlight, lists, alignment, spacing, columns, shrink-to-fit, auto height, super/subscript, hyperlinks, slide-number/date fields), 94 shapes with adjust handles, lines and elbow/curved connectors that stay attached, images (insert, paste, drop, crop, mask to any shape, brightness/contrast/etc.), tables, charts (column, bar, line, area, pie, donut, scatter) with an editable data grid, audio and video, fills (solid, linear/radial gradient, image, opacity), borders, shadows, reflection, blur, opacity, speaker notes.
- Inspector tabs: **Design** (Look / Type / Place), **Motion**, **Deck**. Layouts and a master editor (`Deck > Edit Slide Layouts`), 14 themes (Clean, Midnight, Sunset, Editorial, Mono, Bold, Ocean, Forest, Graphite, Paper, Neon, Swiss, Blush, Slate) with editable palettes, slide size 16:9 / 4:3 / 16:10 / custom.
- Motion: transitions (dissolve, fade through colour, push, move in, reveal, wipe, cube, flip, zoom, magic move) and object builds (in / out / action: appear, fade, fly, scale, spin, wipe, blur, bounce, drop; pulse, grow, shrink, spin, wiggle, flash, motion path), start on click / with / after, duration, delay, easing, by paragraph, build-order list with mini timeline.
- Magic Move matches objects with the **same name** on consecutive slides (set the name under Design > Place > Object).

## Presenting
`Play` (⌥⌘P), full screen via `zeng.fullscreen`. Keys: → ↓ Space next · ← ↑ previous · `B` black · `W` white · `L` laser pointer · `O` slide overview · digits + Enter jump to slide · `?` help · Esc exit. Click / swipe to navigate. Loop and auto-advance (per slide or deck-wide) in the Deck tab and Motion tab.

**Presenter display** (current slide + next slide + notes + timer + clock): the shell can only open one window, so this is an **overlay mode** in the same window (`Play > Presenter Display`), not a second-screen window. **Rehearse** (`Play > Rehearse Slideshow`) records the time spent per slide and offers to save it as auto-advance timings.

## Formats
- **`.zkey`** (native, open): a zip with `deck.json` (size, theme, layouts, slides, options, media index) and `media/<id>.<ext>`. Colours are theme tokens (`bg fg mut a1…a6`) or `#rrggbb`; geometry is in points (960×540 for 16:9).
- **`.pptx` import and export**, hand-written OOXML. Export: master + layouts, slides, text with runs/lists/spacing, shapes (preset for simple ones, custom geometry for the rest), fills/gradients/pictures, lines with arrowheads, shadows, connectors with attachment, groups, tables, notes, transitions, hidden slides. Charts are exported as pictures that carry their data so they come back as editable charts when re-imported into Stage. Import: slides, layout/master decoration (kept as layout art), theme colours and fonts, placeholders with inherited geometry and text defaults, text runs, shapes (preset + custom geometry), pictures with crop, tables, charts (bar/line/area/pie/doughnut/scatter), notes, transitions, connectors, groups.
- **PDF**: `File > Export To > PDF…` opens the print dialog with one slide per page (`@page` = slide size); choose "Save as PDF".
- **PNG / JPEG** (current slide, or all slides as a zip) rendered with a canvas renderer.
- **HTML presentation**: one self-contained file (deck, media and the player embedded).

## Shortcuts (⌘ = Ctrl on Windows/Linux)
⌘N/O/S/⇧S file · ⌘Z/⇧⌘Z undo/redo · ⌘D duplicate · ⌥⌘A select all objects · ⌘B/I/U · ⌘]/[ order · ⌥⌘G group · ⌘L lock · ⌘K link · ⌥⌘R remix · ⌥⌘P play · ⇧⌘N new slide · Tab / ⇧Tab list level (in text) or next object.

## Known limits (honest list)
- Animations/builds are **not** written to `.pptx` (they are kept in `.zkey`); cube, flip, zoom and magic move export as a fade. Audio/video are not embedded in `.pptx` (placeholder box). Image adjustments are baked into the exported picture.
- `.pptx` import does not read SmartArt, OLE objects, EMF/WMF images, picture recolouring, arc segments inside custom geometry, or slide animations. Font availability follows the machine (Inter is bundled).
- Reflection is shown on screen and in the HTML export but not in PNG/JPEG/pptx. Table cell merge is import-only (no merge command).
- Rehearsal timings and the presenter display are single-window. No video export.
- PDF export uses the system print dialog (native print on macOS).
- Not validated against LibreOffice here (`soffice` not installed); `.pptx` output was checked by XML-parsing every part, unzip listing and a round trip through the importer.

## Develop
`node scripts/dev.mjs keynote 5191` · `cargo build --release -p zeng-keynote` (touch `src/main.rs` after UI-only edits so `include_dir` re-embeds).
