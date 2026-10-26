# Look (ZengLook)

PDF and image viewer with markup, signing, page tools and **Clean Scan**. Free, offline, no accounts, no telemetry.
Binary `zengpreview`, id `com.zengbot.suite.preview`.

## Opens
PDF, PNG, JPEG, GIF, WebP, BMP, SVG, TIFF*, AVIF, ICO. (*TIFF/AVIF depend on the system web view.)

## PDF
- Vendored pdf.js (Apache-2.0) for display, text layer, forms; pdf-lib (MIT) for writing.
- Continuous / single / two-page layouts, fit width/page, pinch / Ctrl+wheel / ⌘± zoom, reading mode (invert), presentation.
- Only visible pages are rendered; canvases are released when scrolled away (tested on a 260-page file).
- Sidebar: page thumbnails (drag to reorder, multi-select, rotate, delete, insert, extract), outline, markup list, search results, attachments. Document info is editable.
- Search with highlights and a results list. Password-protected PDFs prompt for the password.
- Markup: highlight, underline, strikethrough, notes, text boxes, rectangle, ellipse, line, arrow, pen, signature (draw or type, stored locally), eraser box, redaction, form filling (text, checkbox, radio, dropdown). Undo/redo.
- Save writes real PDF annotations with appearance streams (other viewers show them) and keeps an editable copy of each markup inside the annotation (`ZengData`), so Look can edit them again when reopened. "Export > Flattened PDF" burns markup into page content.
- Merge/insert PDFs and images (Insert Pages, or drop onto the thumbnail strip in a browser), split by range, extract, compress, export pages as PNG/JPEG, print, crop pages (CropBox), rotation (saved).

## Images
Zoom, pan with momentum, previous/next in the folder, contact sheet, slideshow, rotate/flip, crop with aspect presets, adjust (exposure, contrast, saturation, temperature, sharpen), resize + export (PNG/JPEG/WebP with quality and size estimate), markup (same tools plus loupe), copy to clipboard, EXIF panel (own parser, no network), combine images into a PDF.

## Clean Scan
File > Clean Scan… (⇧⌘K). Take photos of paper, get clean PDF pages.
Automatic page-edge detection with draggable corners (magnifier while dragging), perspective correction with real page-aspect recovery (snaps to A4/Letter), automatic straightening, shadow removal, looks: Colour / Paper white / Grey / Ink black, multi-page batches (reorder/remove), optional offline OCR that adds an invisible searchable text layer (English; Tesseract.js, Apache-2.0, ~6 MB of vendored files in `ui/vendor/ocr`).

## Honest limits
- Redaction burns the whole page to a picture (all text, links and fields on that page are lost). "Eraser" only covers content with white.
- Saving after reordering/deleting/inserting rebuilds the file page by page: bookmarks and interactive form structure of the original are not carried over. In-place saves (no structure change) keep everything.
- Password-protected PDFs can be read and marked up, but pdf-lib cannot rewrite them: Save offers a flattened (picture-only) copy.
- Markup is only editable again in files last saved by Look. Foreign annotations are displayed, kept, and not editable.
- Non-Latin text in text boxes is stored as a picture in the appearance stream (the text itself is in `Contents`).
- Saving a JPEG in place re-encodes it and drops EXIF. Animated GIFs show animated but any edit keeps the first frame only.
- OCR: English only, a few seconds per page; page-edge detection needs contrast between page and surface (otherwise drag the corners).
- TIFF decoding relies on the OS web view (not available in WebView2).

## Shortcuts
V select · H highlight · U underline · S strike · N note · T text · R rect · O ellipse · L line · A arrow · D draw · G sign · X redact · E eraser · M loupe (images)
⌘O open · ⌘S save · ⇧⌘S save as · ⌘F find · ⌘G next match · ⌘± / ⌘0 zoom · ← → pages/images · ⇧⌘K Clean Scan · Delete removes the selected markup
