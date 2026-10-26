# ZengCanvas

An infinite, GPU-friendly canvas for ideas: sketch, diagram, plan, present. Free, offline, no account. Part of ZengSuite (app id `freeform`, binary `zengfreeform`, files `.zfree`).

## Signature features

**Tidy.** Select a pile of objects and pick a mode from the bar that appears along the bottom. Hovering a mode previews it live: everything glides there on a spring, and glides back when you move off. Click to commit (one undo step). Groups move as one unit; locked objects and frames are left alone.

| Mode | What it does |
|---|---|
| Grid | Reading-order rows and columns, sized to the pile's shape |
| Row / Column | One tidy line, evenly spaced |
| Radial | A hub (the object nearest the middle) with rings around it |
| Tree | Top-down tree. Uses your existing connectors as the hierarchy, or builds one and adds connectors |
| Mind map | Branches left and right of a root, curved connectors |
| Colours | Clusters objects by fill / stroke colour, each cluster gridded |
| Rhythm | Snaps rows to a common baseline, equalises gaps, and equalises sizes of similar objects |

**Rough to neat.** Select hand-drawn strokes and press *Rough to neat* (⌥⌘R): wobbly rectangles, ellipses, triangles, diamonds and straight lines become crisp shapes in the same place; short strokes near the end of a line become arrowheads; line ends that touch a shape become attached connectors. Anything it can't read stays as drawn.

## Everything else

- **Canvas**: infinite pan (wheel / two-finger, space-drag, hand tool, middle-drag, momentum), pinch / ⌘-wheel zoom with rubber-banded limits, zoom to fit / selection, minimap, optional rulers, dot / grid / blank backgrounds, custom canvas colour. Rendering is Canvas2D with culling, level-of-detail and a layer cache, so a drag only repaints what moves.
- **Drawing**: pen (pressure from the device, otherwise speed-based width), marker, highlighter, pencil, area/stroke eraser, lasso. Hold the pen still to snap a wobbly shape or line.
- **Objects**: 26 shapes (basic, arrows, speech bubble, cloud, flowchart set) with rich text inside, text boxes (bold / italic / underline / strike, size, colour, font), notes with folded corners that shrink text to fit, tables, frames (export and present separately), link cards (title + URL, no network), images, emoji stamps, connectors (straight / elbow / curved, six arrowheads, labels) that attach to ports and follow their shapes.
- **Arrange**: group, lock, z-order, align, distribute, snap guides, ⌥-drag duplicate, copy/paste across boards and in from other apps (text, URLs become link cards, images, SVG), style inspector (fill, stroke, width, dash, opacity, shadow, font), eyedropper, unlimited undo within the session (memory-capped), command palette (⌘K).
- **Boards**: several boards per file (tabs along the bottom). **Present** steps through frames (←/→, Esc exits). Laser pointer tool.
- **Autosave**: a draft is written a couple of seconds after each edit; after a crash the next launch offers to recover it.

## Files and formats

| Format | In | Out |
|---|---|---|
| `.zfree` (native) | yes | yes |
| PNG / JPEG (1–4×, transparent PNG, selection / frame / whole board, light or dark) | images are placed | yes |
| SVG | basic shapes, paths, text, embedded images | real vector |
| PDF | – | vector, through the system print dialog ("Save as PDF"); all frames can be pages |
| JSON | yes | yes (images inlined as base64) |
| Copy as PNG | – | clipboard (⇧⌘C) |

`.zfree` is a zip: `board.json` (format `zengcanvas`, version 1: `boards[]` each with `objects[]`, `bg`, `view`; `media{}` maps ids to `media/<id>.<ext>` files), the original image bytes under `media/`, and a small `preview.png`. Object coordinates are world units; `rot` is radians about the box centre; stroke `pts` are `[x, y, widthMultiplier, …]` relative to the object's box; fields beginning with `_` never reach disk.

## Shortcuts

V select · G hand (or hold Space) · P pen · M marker · H highlighter · B pencil · E eraser · L lasso · S shapes · R rectangle · O ellipse · T text · N note · C connector · F frame · ⇧T table · I image · ⇧E stamp · W laser · D eyedropper · ⌘K palette · ⌘D duplicate · ⌘G / ⇧⌘G group / ungroup · ⌘L lock · ⌘[ ⌘] order · ⇧1 fit · ⇧2 zoom to selection · ⌘± zoom · ⌥⌘T tidy as grid · ⌥⌘R rough to neat · ⇧⌘E export · ⌥⌘P present · arrows nudge (⇧ = 10).

## Known limits

- PDF goes through the print dialog rather than writing a file directly.
- Groups are one level deep. Tidy treats frames as fixed and does not carry frame contents.
- Rough to neat reads upright shapes only (no rotated rectangles) and leaves curves and scribbles alone.
- SVG import ignores gradients (uses the first stop), filters, masks, `<use>` and CSS classes.
- Table cells hold plain text. Link cards are never opened (no network).
- Tested in Chromium (headless) and the macOS web view; Windows and Linux web views are untested.
