# Competitive feature inventory (clean-room)

Purpose: a checklist of WHAT Apple's built-in and iWork-style apps do for users, to find gaps in ZengSuite. Facts only; no code, artwork, template content or string tables were copied. Menu/command labels are short command names (not copyrightable expression).

## Method and confidence

- Source of facts: static, read-only inspection of installed bundles (`/Applications/*Creator Studio.app`, `/System/Applications/*.app`). Nothing was run, patched, instrumented or modified.
- Info.plist document types / UTIs / URL schemes: read via REA `open_bundle_resources` + `inspect_plist` (Pages) and plutil JSON conversion (others).
- Menu-bar command titles: compiled `MainMenu` nib title strings (REA `decode_interface_builder` was tried but did not surface the main menu nib within bounds, so titles were taken from the nib's string table). **Titles are listed in nib order; menu nesting is inferred from the standard menu layout, not decoded**. Items marked (sub) are known submenu entries.
- Template counts: `TemplatesInfo.plist` (names only), counted as unique non-RTL entries. Localisations: count of `*.lproj` directories (includes `Base`).
- ZengSuite side: compared against `docs/BRIEF.md`, `docs/KIT.md`, existing READMEs (Calc, People only) and a keyword scan of each `apps/<id>/ui`. The scan is a heuristic (a keyword hit does not prove the feature is complete; a miss may be a naming difference). **Verify each "gap" before building.**
- Not covered: runtime behaviour, Intelligence/cloud features' internals, iCloud collaboration protocol, theme artwork.
- Version context: Pages/Numbers/Keynote 15.4 "Creator Studio" (min macOS 26), system apps from macOS 27.0 (Preview 11.0, Calendar 27.0, Reminders 7.0, Contacts 14.0, Notes 4.13, Freeform 5.0, Calculator 12.0).

---

## 1. Pages  ->  ZengSuite "Write" (`apps/pages`)

### Formats
- Native: `.pages` (package or single file), `.pages-tef` (alt), templates `.template`.
- Read/edit: Word `.doc .dot .docx .dotx .docm .dotm`. View: plain text, RTF, RTFD, iBooks Author `.iba/.book`, Notes archive (`.notesarchive`).
- Export (File > Export To submenu): PDF, Word, Plain Text, RTF, EPUB (plus "Publish to Apple Books", "Export a sample of your book", cover image export), Pages (older version), Reduce File Size, Change File Type (single file / package), Set/Change Password. Export options: with comments, smart annotations; "Export Document in Background".
- URL schemes: `com.apple.iwork.pages-share`, `...pages-edit-in`. AppleScript enabled. 40 localisations (incl. Base), 298 accessibility strings.
- Templates: about 212 unique non-RTL templates in 12 categories (Basic 6, Reports 36, Education 26, Certificates 21, Organizers 38, Newsletters 10, Brochures 11, Business 15, Posters & Flyers 31, Letters 30, Resumes 18, Misc 3; names repeat across categories). Both word-processing and page-layout document modes ("Convert to Page Layout").

### Menu checklist
- **Pages (app)**: About, Settings, Services, Hide/Quit, Language & Region, Privacy & Analytics.
- **File**: New, New from Template Chooser, Open, Open Recent, Close, Save, Save As, Revert To, Export To, Save as Template, Set/Change Password, Reduce File Size, Page Setup, Print, Mail Merge, Convert to Page Layout, Start Writing (Intelligence), Manage Shared Document, Show Sync Status, Publish to Apple Books.
- **Edit**: Undo, Redo, Cut/Copy/Paste, Paste and Match Style, Paste and Preserve Style, Paste Formula Results, Delete, Clear All, Duplicate Selection, Select All, Deselect All; Track Changes, Accept/Reject Change, Remove Highlights and Comments, Remove Smart Annotations; Find (Find Next/Previous, Use Selection for Find/Replace, Jump to Selection, Hide Find Panel); Spelling and Grammar (check while typing, grammar with spelling, auto-correct); Substitutions (smart quotes, dashes, web/email and phone links, text replacement); Transformations (upper/lower/capitalize, full width); Speech; EndNote Citations (Annotated, APA 6th, Author-Date, Chicago 16th, MHRA, Numbered, Turabian, Vancouver; Show All Fields); Add/Edit Link (Webpage, Email, Phone, Bookmark, Page); Author Color; Manage Bookmark Suggestions.
- **Insert**: Table, Chart (2D/3D/interactive types), Text Box, Shape (library), Line/connection lines/Draw with Pen, Image/Photo, Image Gallery, Image Playground, Generate Image, Movie, Web Video, Record Audio, Audio, Comment, Highlight, Link, Footnote/Endnote, Equation (LaTeX/MathML), Formula (Sum/Average/Min/Max/Count/Product, New Formula), Page, Page Break, Line Break, Column Break, Section Break, Section, Page Number, Page Count, Date & Time, Table of Contents, Bookmark, Mail Merge Field, EndNote Citation, Headers & Footers (Basic/Plain/Sums), Choose File, Browse Content Hub, Photo/Video/Music browsers.
- **Format**: Font (Bold/Italic/Underline/Strikethrough, Bigger/Smaller, Replace Fonts), Character Spacing (Tighten/Loosen), Ligature, Baseline (super/sub/raise/lower), Capitalization (All Caps, Small Caps, Title Case, Start Case), Text (alignment, justify, reverse direction, indent levels), Table submenu (add/delete rows and columns, header/footer rows and columns, repeat header rows, resize/distribute, merge/unmerge cells, autofill, select, conditional highlighting), Chart submenu (type, data editor, title, legend, axes, series labels), Shapes and Lines (make editable, unite/intersect/subtract/exclude, sharp/smooth points, break apart, save to My Shapes), Image (mask, mask with shape, remove background, super resolution, generate from image, adjust image, optimize movie), Copy/Paste Style, Create Style, Advanced (define text/media placeholder, set default text box appearance), Phonetic Guide Text, Document Setup, Reapply Page Template, Create Page Template From This Page.
- **Arrange**: Bring Forward/to Front, Send Backward/to Back, Group/Ungroup, Lock/Unlock, Align Objects, Distribute Objects, Flip H/V, Section Layouts, Move Objects to Section Layout, Make Layout Objects Selectable.
- **View**: Show/Hide Toolbar, Customize Toolbar, Document Setup/Inspector panes, Comments & Changes pane, Page Thumbnails, Table of Contents navigator, Show Ruler, Guides, Show Invisibles, Show Layout, Show Word Count, Show Warnings, Zoom (Fit Page, Fit Width, One Page, Two Pages, In/Out, Actual Size, Zoom to Selection), Two Pages View, Hide Comments, Smart Annotations, Show Next/Previous Annotation, Show Participant Cursors, Edit Page Templates, Show Page Template Guides, Presenter Mode, Enter Screen View, Text Size.
- **Go To / Window / Help**: First/Last/Next/Previous Page; Minimize, Zoom, Bring All to Front; Pages Help, Formulas and Functions Help, Keyboard Shortcuts, Feedback.

### Toolbar / inspector categories (from nib names)
Format (Style/Text/Layout), Document (Document/Section/Layout), Text, Table, Chart, Shape, Image, Arrange, Cell format, Comments, Accessibility description, Align/Distribute, Arrow, Callout, 3D object rotation, Activity stream/collaboration.

### Gaps to check in ZengSuite Write
Keyword scan shows Write has: styles, footnotes (3 files), TOC, track changes/comments, headers, columns, page break, equations, templates (2), find, images, charts/shapes (1 file each), docx import/export, focus/readability.
- Not found / unverified: **mail merge** (0 hits), **EPUB export** (0), **word count in-UI** (0 hits, verify), **PDF export** (0 hits; may be via print), password protection, endnotes/citation styles, bookmarks UI (1), section breaks/section layouts (1), page-layout mode (free-form objects on a page), page templates/master pages, text boxes/shapes library with boolean ops, image masks/background removal, Formula in doc tables, table header rows repeat / autofill, conditional highlighting, phonetic guides, smart annotations, Reduce File Size, template chooser (breadth: Apple ships ~200), ruler/guides, two-page view, page thumbnails sidebar, author colors, iBooks/RTF/RTFD/Notes-archive import.

---

## 2. Numbers  ->  ZengSuite "Grid" (`apps/numbers`)

### Formats
- Native: `.numbers` (+ `.numbers-tef`), templates `.nmbtemplate`.
- Read/edit: Excel `.xls .xlt .xla .xlam .xlsx .xlsm .xltx .xltm` (incl. macro-enabled and add-in as viewer), CSV, TSV.
- Export (File > Export To): PDF, Excel, CSV, TSV, Numbers (older version). Print Without Preview, Reduce File Size, password.
- 40 localisations; 298 accessibility strings; AppleScript enabled; permissions: Contacts, Photos, Microphone.
- Templates: about 80 unique in 6 categories (Basic 9, Budgets 13, Personal Finance 10, Personal 20, Business 18, Education 14). Basic includes blank, table+chart, pivot basics, simple charts, checklist, form, categories.

### Menu checklist (beyond the Pages items above)
- **File**: New/Open/Save/Revert, Export To, Save as Template, Set Password, Print, Manage Shared Spreadsheet.
- **Edit**: Paste Formula Results, Copy Snapshot, Select Parent, Edit Cell as Formula, Magic Fill, Insert Current Date/Time, Transpose Rows and Columns, Wrap Text, Autofill (right/left/down/up, from row above/column before), Copied Rows/Columns.
- **Insert**: Table, Chart (2D/3D/interactive), Text Box, Shape, Line, Image, Movie, Audio, Comment, Formula submenu (Sum/Average/Min/Max/Count/Product), New Formula, Equation, Checklist, Stock/Stock Quote, Web Video, Sheet (Insert Sheet).
- **Table** (Format > Table in nib order): add rows/columns, delete, Header/Footer rows and columns, **Freeze Header Rows/Columns**, Hide/Unhide Rows/Columns, resize to fit, distribute evenly, merge/unmerge, **Sort** (Apply Sort Rules, Sort Options, Sort Groups, Sort Values), **Filter** (Turn Filters On, Show Filter Options), **Categories** (Add Category for Column, Add Row to Group, Create Group for Row, Turn Categories On, Promote/Demote, Remove, Collapse/Expand all groups), **Pivot tables** (Create Pivot Table on new sheet / current sheet / for selected cells; Show Pivot Options; Refresh Pivot Table; Create Table for Source Data), Conditional Highlighting, Reverse Table Direction, Select (row, column, first/last value, extend).
- **Organize (sheets)**: New Sheet, Duplicate, Rename, Delete, Hide/Unhide, Tab Colors, Sheet Options, Reverse Sheet Direction, First/Last/Next/Previous Sheet.
- **Format**: Font, Text, Cell format inspectors (Currency, Percent, Fraction, Scientific, Numeral System, Date/Time, Duration, Checkbox, Slider, Stepper, Pop-up menu, Rating, Text), Cell borders, Cell text style, Chart inspectors (axis, gridlines, labels, series, error bars, trendlines-class panes, 3D scene, interactive options), Copy/Paste Style, Create Style.
- **View**: Show Rulers, Guides, Zoom, Comments pane, Hide Inspector/Toolbar, Show Formula/function Help, Next/Previous Comment.
- **Function library**: a built-in Function Help bundle; Formulas and Functions Help. (Apple documents ~250+ functions; count not extracted here.)

### Gaps to check in ZengSuite Grid
Grid has (scan): pivot, conditional formatting, data validation, charts, sparklines, goal seek, named ranges, freeze, filters, xlsx/csv/tsv/json/html export, templates, ~11 function modules, checkbox, slider. Strong coverage.
- Not found / unverified: stepper and pop-up-menu cell types (stepper 0 hits), star rating, **categories (row grouping) with collapse** (6 hits - verify), **Magic Fill**, transposition, stock/currency live data (needs network - deliberate no), **interactive charts**, 3D charts, **tab colour ok / sheet hide** (ok), snapshot copy, formula-result paste (Paste Special exists), password protection, comments/threads (2 hits), images/shapes over sheet (1 hit), numeral systems (Arabic, Chinese), duration format, fractions (present), **checklist templates**, Numbers `.numbers` import (proprietary IWA; not recommended), `.xls` legacy import, PDF/print layout per sheet, page-layout "print view".

---

## 3. Keynote  ->  ZengSuite "Stage" (`apps/keynote`)

### Formats
- Native: `.key` (+ `.key-tef`), themes `.kth`, `.kpf` (viewer, legacy), `.kpdc`.
- Read/edit: PowerPoint `.ppt .pptx .pptm .pps .ppsx .ppsm .pot .potx .potm`.
- Export (File > Export To): PDF, PowerPoint, Movie, Animated GIF, Images (PNG/JPEG/TIFF), HTML, Keynote (older version), Reduce File Size. Print handouts/with notes; "Print each build" options in strings.
- 40 localisations; 298 a11y strings; permissions: Camera, Apple Music, Microphone, Contacts, Photos.
- Themes/templates: about 92 unique themes in 12 categories (Basic 5, Business 12, Education 9, Creative 18, Personal 14, Dynamic 7, Minimal 14, Bold 14, Editorial 8, Portfolio 6, Craft 6, Textured 9).

### Menu checklist (beyond Pages)
- **File**: New from Theme Chooser, Change Theme, Save Theme, Revert, Export To, Manage Shared Presentation, Record/Clear Recording, Print.
- **Edit/Insert**: all Pages inserts plus Live Video, Slide Numbers, New Slide, Skip Slide, Generate Slides from Text / Generate Presenter Notes (Intelligence), Equation, Chart, Table, Shape, Line, Text, Image, Movie, Audio, Comment.
- **Slide**: New Slide, Skip Slide, Change Master/Layout, Reapply Layout to Slide, Edit Slide Layouts, Define as Text/Media Placeholder, Show Slide Numbers on All Slides, First/Previous/Next/Last Slide, Expand/Collapse (outline levels), Clean Up Slide, Zoom to Fit Content.
- **Format**: all text/shape/table/chart/image formatting as in Pages, plus Copy/Paste Animation, Make Motion Path from Shape.
- **Animate** (menu and inspector): Add Build In, Add Build Out, Add Action, Add Transition, Show Build Order, Show Object List, Auto-Center. Effect names present in strings (about 60): Appear, Dissolve, Fade & Move, Fly In/Out, Move In/Out, Pop, Scale, Spin, Swing, Twirl, Twist, Blur, Bounce, Magic Move, Object Flip, Page Flip, Cube, Confetti, Flash Bulbs, Blinds, Color Planes, Comet, Crumble, Diffuse, Drift, Fall Apart, Grid, Lens Flare, Line Draw, Orbital, Shimmer, Sparkle, Swoosh, Text Animation (by character), etc.
- **Play**: Play Slideshow, Play Multi-Presenter Slideshow, Play Recorded Slideshow, in fullscreen/in window, Record Slideshow, Clear Recording, Rehearse Slideshow, Presenter Display in Window, Customize Presenter Display.
- **View**: Navigator, Outline, Slide Only, Light Table, Show Presenter Notes, Rulers, Guides (Layout Guides, Copy/Paste Guides, Clear All Guides on Slide), Show Build Order, Fit Slide, Comments pane, Inspector.
- Build triggers: On Click, With Previous, After Previous, After Transition; Start Audio/Movie options; Auto-advance; Loop; Keynote Live (remote) not enumerated.

### Gaps to check in ZengSuite Stage
Stage has (scan): transitions (3 files), builds (6), Magic Move (2), presenter view/notes (4/6), layouts/masters (11), themes (11), charts, tables, gif/movie/audio, pptx, laser pointer.
- Not found / unverified: **outline view** (0), **light table/slide sorter** (0 hits; Navigator may exist), **comments** (0), multi-presenter and recorded slideshows, rehearse (2 hits, verify), **Live Video**, motion paths from shapes, text animation by character, copy/paste animation, object list / build-order inspector (verify), slide numbers on all slides, skip slide, sections (hierarchy indent exists), interactive/linked slides ("Add Hyperlink" exists), PDF with notes, handouts, HTML export (present), Movie export (not seen), image export (PNG/JPEG zip present), `.ppt`/`.pps`/`.potx` import, Intelligence-style "generate slides from outline" (offline equivalent: outline-to-slides import).

---

## 4. Preview  ->  ZengSuite "Look" (`apps/preview`)

### Formats
- Edit (Info.plist role Editor): PDF, JPEG (+ rJPEG), PNG, TIFF, BMP, GIF, TGA, SGI, ICNS, JPEG 2000.
- Viewer: PDF bundles, OFD, Illustrator `.ai`, RAW, HEIF/HEIC/HEICS/AVIF/AVCI, PBM/PGM/PPM/PFM, PVR, ASTC, KTX/KTX2, WebP, DDS, XBM, OpenEXR, JPEG XL, ICO, Photoshop, MacPaint, FlashPix, fax, Radiance (HDR), MPO, PICT, **3D**: USD/USDZ, glTF/GLB, MaterialX, OpenVDB, Alembic, STL, URDF/GDF, PLY; folders.
- Export As: JPEG, JPEG 2000, OpenEXR, PNG, TIFF, HEIC, PDF (Export as PDF), also Export Selected Pages; Quartz filters (not enumerated). 44 localisations.

### Menu checklist
- **File**: New from Clipboard, Open, Open Recent, Close Window/Selected, Save, Revert to Saved, Enter Password, Edit Permissions, Import from Scanner/Camera, Take Screenshot (From Selection/Window/Entire Screen), Export As, Export as PDF, Preview on Apple Vision Pro, Print.
- **Edit**: Undo/Redo, Cut/Copy/Paste, Delete, Select All, Invert Selection, Deactivate; Insert (Page from Scanner, Page from File, Blank Page); Move to Trash; Find/Find Next/Previous/Use Selection/Jump; Spelling and Grammar; Speech.
- **View**: Hide Sidebar; sidebar modes Thumbnails, Table of Contents, Highlights and Notes, Bookmarks, Contact Sheet; Continuous Scroll, Single Page, Two Pages; Show Image Background; Use Dark Appearance for PDF; Actual Size, Zoom to Fit, Zoom In/Out (and "All" variants), Zoom to Selection; Show Markup Toolbar; Slideshow; Full Screen.
- **Go**: Previous/Next Page, Go to Page, Back/Forward, Previous/Next Document, Up/Down, Previous/Next Item.
- **Tools**: Show Inspector, Show Magnifier, Adjust Color, Adjust Size, **Annotate** (Highlight Text, Underline Text, Strike Through Text, Rectangle, Oval, Line, Arrow, Polygon, Star, Text, Speech Bubble, Mask, Loupe, Note, Signature), Selection tools (Automatic, Rectangular, Text), Redact, Crop, Rotate Left/Right, Flip H/V, Remove Background, Assign Profile, Soft Proof with Profile, Add Bookmark, Show Location Info, Show Object Properties, 3D Manipulator (Move, Rotate, Scale, Adjust Pivot, view Top/Bottom/Left/Right/Front/Reset), 3D Rendering, Add to Scene.
- Other capabilities visible in strings/menus: PDF form fill, signatures (from trackpad/camera/Continuity), live text selection in images, page rearrangement by drag in sidebar, combine PDFs by dropping, password encrypt with permissions.

### Gaps to check in ZengSuite Look
Look has (scan): redact (6), sign, forms (6), scan (Clean Scan), crop, markup/annotations, page ops (extract/insert/delete/combine/compress/split), password, bookmarks (1), thumbnails, contact sheet, colour adjust, metadata.
- Not found / unverified: **OCR / selectable text in images** (0 hits; Apple has Live Text), HEIC/HEIF write and read (0 hits for heic), RAW read, WebP/AVIF read (in app.json), JPEG 2000/TGA/ICNS/EXR/DDS/ICO read, Photoshop/AI viewer, **3D model view**, soft proof / colour profiles, Table of Contents sidebar (verify), highlights-and-notes sidebar, "Use Dark Appearance for PDF" (Reading Mode Invert exists), loupe/magnifier (loupe exists), image-from-camera / screenshot import, Location Info, signature from camera, edit permissions on PDF, batch export of multi images, Quick Look-style folder browsing, speech, slideshow of images (slideshow listed), "Next/Previous Document" in a multi-doc window, drag-to-reorder pages in sidebar (verify), speech bubble/star/polygon shapes.

---

## 5. Notes  ->  ZengSuite "Notes" (`apps/notes`)

### Formats
- Read/write: `.notesarchive` (Notes Archive), AirDrop document, `com.apple.notes.note`. View: ENEX (Evernote), plain text, HTML, RTF, RTFD, Stickies export; Markdown import and export (menus); Export To: Archive, PDF, Markdown, **Open in Pages**.
- Structured attachment kinds (UTIs): table, to-do (checklist), gallery, rich text, sketch, mention, hashtag, link, **math result** and **graph expression**, document scan archive, PDF paper doc.
- URL schemes `notes`, `applenotes`. 45 localisations. Permissions: Contacts, Photos, Notifications, Microphone.

### Menu checklist
- **File**: New Note, New Folder, New Smart Folder, Close, Share, Manage Shared Note, Import to Notes, Import Markdown, Export To (Archive/PDF/Markdown/Pages), Pin Note, Lock Note, Duplicate Note, Print, Close All Locked Notes.
- **Edit**: Undo/Redo, Cut/Copy, **Copy as Markdown**, Paste (match/retain style, **Paste as Markdown**), Delete, Rename, Select All, Attach File, Add Link, Insert Divider Line, Record Audio, Rename Attachment, Find, Note List Search, Find and Replace, Spelling, Substitutions (Smart Copy/Paste, quotes, lists, dashes, links, **tags**), Transformations, Speech.
- **Format**: Heading, Subheading, Body, Monostyled, Bulleted/Dashed/Numbered List, Block Quote, Checklist (Mark as Checked, Move Item up/down), Table (Convert to Text, Reverse Direction), Show Note As Light Background, Font (bold/italic/underline/strikethrough, **Highlight**, size, baseline, colours), Copy/Paste/Remove Style, Alignment, Writing Direction, Indentation, **Math Results** (Insert Results, Suggest Results).
- **View**: as List / as Gallery, Recent Notes, Sort By (Default, Date Edited, Date Created, Title; newest/oldest), Group By Date, Show Note Count, Attachments Browser, Show in Note, Attachment View sizes, Highlights, Note Activity, Folder Activity, Zoom, Expand/Collapse Sections, Hide Sidebar/Toolbar.
- **Window**: Keep on Top, Photo Browser. **Help**: Using Tags, Using Smart Folders; Clear Local Data.
- Also: Smart Folders (tags, dates, etc.), Convert Folder to Smart Folder, folder Check All / Uncheck All / Delete Checked / Move Checked to Bottom, note-to-note links, mentions (collaboration), locked notes.

### Gaps to check in ZengSuite Notes
Notes has (scan): link graph/backlinks (7), tags (7), lock/encrypt (9), markdown, checklists, tables, sketch/draw (8), pin, templates, math (9), ENEX (4), attachments, HTML/Markdown/PDF/plain exports, folders/subfolders, backup/restore.
- Not found / unverified: **Smart Folders** (0 hits), **document scan** (0), **audio recording** (1), **mentions** (0), Stickies/RTF/RTFD import, Notes Archive format, "Attachments Browser" gallery, "Group by date" (present), note activity/history, shared notes (no network: deliberate), Open-in-Pages equivalent (export to Write `.zpages`), AirDrop-equivalent export, speech, quick note (system-wide), Copy as Markdown, Paste as Markdown, sections (expand/collapse headings), Photo Browser, light-background toggle for dark mode, Keep on Top (present as Distraction-Free only).

---

## 6. Freeform  ->  ZengSuite "Canvas" (`apps/freeform`)

### Formats
- Native: `.board` (+ `.folder`). No document types registered in Info.plist beyond exported UTIs. Exports (menu): Export Board as PDF, Export Scenes as PDF, Print Board/Scenes; image export of selection.
- 95 localisation entries (loctable-based). URL schemes `freeform`, `...freeform-edit-in`. Permissions: Contacts, Photos, Camera. Brush set in resources: Basic, Basic Rounded, Basic Square, Chalk, Crayon, Dry Brush, Feathered, Pen, Pencil (9 names).

### Menu checklist
- **File**: New Board, New Window, New Tab, Close, Rename, Duplicate, Add to Favorites, Share, Manage Shared Board, Export Board as PDF, Export Scenes as PDF, Print Board, Print Scenes.
- **Insert**: Sticky Note, Shape (rectangle, rounded rectangle, oval, triangle, right triangle, arrow, double arrow, diamond, quote bubble, callout, polygon, star), Text Box, Table, **Drawing** (Pencil, pen tools), Line (arrowhead, connection lines), Choose Photo or Video, Image Playground, Generate Image, Generate from Image, Link, Choose File, camera/scan import.
- **Edit**: Undo/Redo, Cut/Copy/Paste, Paste and Match Style, Copy as Text, Duplicate, Delete, Select All, Deselect All, Select Parent, Clear All, Find, Translate, Spelling, Substitutions, Speech.
- **Format**: Font, Text, Paragraph, Writing Direction, Indentation, Autosize Text, **Shadow**, **Round Corners**, Constrain Proportions, Resize (rows/columns to fit), Table row/column ops, Mask with Shape, Edit/Reset Mask, Remove Background, Super Resolution, Remove Watermarks, Copy/Paste Style, **Save as Insert Style**, Shapes and Lines (unite, subtract, intersect, exclude, make editable, break apart, smooth/sharp point, toggle line type), Change Shape, Merge/Separate (table cells), Lock/Unlock, Loop (media).
- **Arrange**: Bring/Send forward/back, Group/Ungroup, Align (H/V, left/center/right/top/middle/bottom), Distribute (evenly, horizontally/vertically), Move Objects to Board, Use Groups.
- **View**: as Icons / as List (board browser), Sort By (Date, Name, Kind, Shared By; asc/desc), Show Connectors, **Show Grid**, **Snap to Grid**, **Snap to Shapes**, Guides (Center, Edge), Relative Sizing, Relative Spacing, Haptic Feedback, Zoom (In, Out, Actual Size, Zoom to Selection, **Zoom to Fit Content**), **Scenes** (Add Scene, Next/Previous Scene, Hide Scene Navigator), Hide Collaboration Activity, Tab Bar, Show All Tabs, Sidebar, Full Screen.

### Gaps to check in ZengSuite Canvas
Canvas has (scan): sticky notes, connectors, frames (Present Frames), pen/draw tools, minimap, tables, images, shapes, link cards, group, lock, snap, grid, stamps, PDF/PNG/JPEG/SVG/JSON export, Command Palette.
- Not found / unverified: **scenes** (0 hits; frames may cover), **shadow / round corners / mask**, **save as insert style**, boolean shape ops, drag-to-resize table with merge, relative sizing/spacing, centre/edge guides, board browser sort by kind, tabs/multiple windows, translate (offline: not feasible), Remove Background, collaboration (deliberate no), file/media embeds (video/audio), print scenes, favourites, text autosize.

---

## 7. Calendar  ->  ZengSuite "Calendar" (`apps/calendar`)

### Formats
- Read/write: `.ics` (editor), `.vcs/.vcal` (viewer), Calendar Backup `.icbu` (editor), model package. URL schemes `webcal`, `ical`. Subscriptions, holiday calendars. 44 localisations. Permissions: Camera, Location.

### Menu checklist
- **File**: New Event, New Calendar, New Calendar Group, New Family Calendar, New Calendar Subscription, New Holiday Calendar, Import, Export, Export Event, Calendar Archive, Close, Print.
- **Edit**: Undo/Redo, Cut/Copy/Paste, Delete, Select All, Duplicate, Edit Event, Mark as Completed (reminders in calendar), Get Info, Show Inspector, Merge Calendar, Publish / Stop Publishing / Send Publication Email, Share / Stop Sharing / Resend Invitations, Search, Spelling and Grammar.
- **View**: By Day, By Week, By Month, By Year, Next/Previous, Go to Today, Go to Date, Go to Next/Previous Occurrence, Zoom In/Out, Show Calendar List, Show Notifications, Show List View, Show All-Day Events, Show Declined Events, Show Completed Reminders, Show Travel Time, Refresh Calendars, Full Screen, Availability Panel.
- **Window**: Calendar, Contacts, Availability Panel. **Help**: Keyboard Shortcuts, Accounts, Add Account.
- Event features implied by strings/plist: invitees, availability, travel time, time zones, location, alerts, attachments, URLs, natural-language quick add, birthdays calendar, calendar colours and groups.

### Gaps to check in ZengSuite Calendar
Calendar has (scan): day/week/month/year views, recurrence, attendees, alerts, travel time, time zones, ICS, subscriptions, holidays, availability, natural language, Time Balance, Outlook CSV export.
- Not found / unverified: **List view**, Go to Date, Go to next occurrence, **calendar groups**, **family calendar** (needs accounts: no), publish/share (no network: deliberate), `.vcs` import, `.icbu` backup archive, Merge Calendar, declined-event toggle, completed-reminders overlay (link to Todo), invitations send (iMIP via `mailto:` possible), Get Info popover parity, week-numbers, "Show notifications", per-calendar default alerts, event attachments, conference link field.

---

## 8. Reminders  ->  ZengSuite "Todo" (`apps/reminders`)

### Formats
- Native list type `com.apple.reminders.list`; URL scheme `x-apple-reminderkit`; list templates (Save as Template, View Templates). Sharing and assignments are cloud features. 45 localisations. Permissions: Contacts, Photos, Camera, Notifications, Location, Siri.

### Menu checklist
- **File**: New Reminder, New List, New Group, New Section, Share List, Manage Shared List, Save as Template, View Templates, Print, Close, Pin List, Convert to Smart List, Create Smart List, Edit Sections.
- **Edit**: Undo/Redo, Cut/Copy/Paste, Select All, Delete, Mark as Completed, Mark Due Date As (Today, Tomorrow, This Weekend, Next Week), Mark All Overdue to Today, Move to Section / New Section with Selection, Indent/Outdent Reminder (subtasks), Flag, Priority (Low, Medium, High, Urgent), Add Tag, Assign, Auto-Categorize, Find, Spelling, Substitutions, Bullets and Numbering (bulleted, dashed, numbered), Data Detectors, Smart Links, Smart Copy/Paste.
- **View**: as List / as Columns, Show Completed, Show All Subtasks / Hide All Subtasks, Sort By, Group by Time, Show Info, Show Sidebar, Show Smart List.
- **Go To** system lists: Today, Scheduled, All, Flagged, Assigned, Completed; Tags browser.
- Smart Lists with filter rules (tags, dates, priority, flagged, location, list); templates; Siri integration.

### Gaps to check in ZengSuite Todo
Todo has (scan): subtasks, sections (3), tags (10), flags, priority, recurrence, templates, groups, columns (2), CSV/ICS/JSON/MD import and export, quick add (natural language), Today's Three.
- Not found / unverified: **Smart Lists with rules** (1 hit), **location-based** (0), **notifications** (0 hits; due alerts), "Mark All Overdue to Today", Assign (no network: deliberate), Auto-Categorize (offline heuristic possible), per-list sort/group persisted, "Group by Time", "This Weekend / Next Week" quick-date, completed list view, attachments (4 hits), early-reminder offsets, Pin List, URL field, list colour/emoji, Kanban columns (verify), Print.

---

## 9. Contacts  ->  ZengSuite "People" (`apps/contacts`; README exists)

### Formats
- View/import: vCard (`public.vcard`), LDIF (`.ldif .ldi`), `.abcdp`/`.abcdg` card data, **Backup `.abbu`** (editor), folders. Exports: vCard, Contacts Archive, Export as PDF, Print (lists, cards, envelopes, labels). Server/Directory (LDAP) search, Twitter/profile fields. URL schemes `addressbook`. 45 localisations.

### Menu checklist
- **File**: New Card, New Group, New Smart List, New Group From Selection, New Smart List from Current Search, Import, Export (vCard, Contacts Archive, Export as PDF), Print, Share My Card.
- **Edit**: Undo/Redo, Cut/Copy/Paste, Delete, Select All, Find, Edit Card, Edit Smart List, Edit Distribution List, Rename List, Remove From List, Clear Custom Image, Choose Custom Image, Open in Separate Window.
- **Card**: Go to My Card, Make This My Card, Mark as a Company, Reorder Last Name Before First, **Phonetic First/Last Name/Company**, Add Field (Prefix, Middle Name, Suffix, Nickname, Maiden Name, Job Title, Department, Phone, Email, URL, Birthday, Date, Related Name, Instant Message, Address, Profile, **Lunar Birthday**), Edit Template, Merge Selected Cards, **Look for Duplicates**, Go to Previous/Next Card.
- **View**: show groups, hide groups, Show Last Import Group, Enter Full Screen. **Window/Help**: standard; Accounts, Add Account, Refresh Accounts; Time Machine/Archive browsing (debug items ignored).

### Gaps to check in ZengSuite People
People (per README) covers: groups, smart groups, duplicates and merge, vCard 2.1/3.0/4.0, CSV mapping, `.zcontacts` backup, print envelopes/labels, birthdays, phonetic, nicknames, related names, photo crop.
- Not found / unverified: **LDIF import**, `.abbu` import, **"My Card"**, Lunar birthday, "Mark as Company" (company flag? README mentions company), Distribution List type, Export as PDF, directory services (LDAP, deliberate no), Share My Card, "Show Last Import Group" (import group), custom field templates ("Edit Template"), `.abcdp` read, Reorder Last Name Before First (display option present), Copy Contact URL, Smart List from current search (verify).

---

## 10. Calculator  ->  ZengSuite "Calc" (`apps/calculator`; README exists)

### Formats
None (no documents). 42 localisations. Modes (strings): Basic, Scientific, Programmer, **Math Notes**, unit/currency conversion ("Recent Units", currency rates), RPN Mode, history with day-range grouping (Previous 7/30 days), Memory (store/recall/add/clear), Always on Top, Arabic Math input, Copy Expression/Result, paper tape history.

### Command checklist (strings, not a nib menu)
- Basic: add/subtract/multiply/divide, percent, change sign, clear / all clear, memory (M+, M-, MR, MC), thousands separator toggle, decimal places.
- Scientific: trig, inverse, hyperbolic and inverse hyperbolic, degrees/radians, log base 10/2/y, ln, exp, 10^x, 2^x, 1/x, x^2/x^3/x^y, cube root, factorial, random number, pi, e, Enter Exponent, alternate (2nd) functions.
- Programmer: Hex/Dec/Oct/Bin, bitwise AND/OR/XOR/NOT/NOR, rotate left/right, shift, byte flip, byte on/off, ASCII value, show/hide binary view, word size.
- Math Notes: inline expressions, graph expression (Notes `calculategraphexpression` UTI), insert results.
- RPN mode: stack rotate up/down, Enter, drop.
- History pane, Convert (category, input/result unit, recent units).

### Gaps to check in ZengSuite Calc
Calc (README) has: Basic, Scientific, Programmer, Converter, Date Calculation, Graphing, Notes (Math Notes), paper tape, exact decimals, Show Work signature.
- Not found / unverified: **RPN mode**, memory registers (verify), **Always on top**, Arabic math input, byte flip / byte on-off, ASCII value, copy expression / last result, history day grouping, recent units, live currency rates (deliberate: manual rates), 3D / parametric graphing (Apple's Math Notes graphs), variables with units across lines (present).

---

## 11. Text  ->  ZengSuite "Text" (`apps/text`)

Competitor reference: TextEdit (Notepad-class). Not installed as a separate inspected bundle in this pass (TextEdit at `/System/Applications/TextEdit.app` was not inspected). From the brief: plain and rich text, line endings, encodings, find/replace. Known TextEdit user features (not evidence-backed here): rich/plain toggle, RTF/RTFD/Word/ODT/HTML read-write, wrap to page, spell/grammar, lists, tables, images, "Show Properties", encodings picker, Services, Print.
Gaps to check in ZengSuite Text (scan, small UI: 77 lines): Markdown preview (0), encoding picker (0), line numbers (0), word wrap toggle (0), syntax highlighting (0), print (0), autosave (0), .rtf/.odt/.docx save, lists/tables/images in rich mode.

---

## Cross-app Top 25 missing features worth adding (prioritised)

Priority = user value for a free Office/iWork replacement x feasibility offline x not already covered. Each should be verified against the current app first.

1. **Mail merge (Write)** - letters/labels from People or CSV; Pages and Word both have it.
2. **PDF export + EPUB export (Write)** - one-click PDF with comments option; EPUB for books.
3. **Smart Folders and Smart Lists with rule builders (Notes, Todo)** - tags/dates/priority filters; high daily value.
4. **OCR / Live Text in Look** - selectable text in scanned images and PDFs (offline OCR such as tesseract.js-class, check licence).
5. **Outline view + slide sorter (Light Table) (Stage)** - fast structuring; Keynote's main authoring modes.
6. **Comments / review in Stage and Grid** - threaded comments with author colour.
7. **Page templates, section layouts and page-layout mode (Write)** - master pages, headers/footers per section, flyers and posters.
8. **Template chooser breadth** - Apple ships roughly 212 (Pages), 80 (Numbers), 92 (Keynote) templates/themes; ship at least 30/20/20 original ones with the same categories (Reports, Letters, Resumes, Budgets, Education...).
9. **Movie / animated GIF / image-sequence export (Stage)** - Movie export is missing in the scan; GIF/PNG/JPEG exist.
10. **Recorded and multi-presenter slideshow, rehearsal timer (Stage)** - at least record narration + timings locally.
11. **Notifications for due/start times (Todo, Calendar)** - system notifications; location reminders are optional.
12. **Calendar List view, Go to Date, calendar groups, `.vcs` and `.icbu`-style backup import (Calendar)**.
13. **Scenes (Canvas)** - ordered views/frames with presentation and "Export Scenes as PDF"; Canvas has frames already, add navigator.
14. **Shape tools: boolean ops, shadow, round corners, image mask/remove background (Write, Stage, Canvas)** - shared kit feature.
15. **Heic/RAW/JPEG 2000/WebP/AVIF/DDS/TGA decode and write HEIC/PNG/JPEG/TIFF/JPEG2000 export (Look)**; at least read HEIC/AVIF/RAW preview where the OS web view allows.
16. **Document scanning import and Quick Scan clean-up flow end-to-end (Notes, Look)** - camera/file scan to attachment.
17. **Workbook features: Magic Fill/autofill series, categories with collapse, stepper/popup/rating cell types (Grid)** - parity with Numbers controls.
18. **Password protection for documents (Write, Grid, Stage)** - AES via open standard (ZIP AES or OOXML agile encryption).
19. **RPN mode, memory registers, Always on Top, history day grouping (Calc)** - cheap, frequently requested.
20. **Footnotes + endnotes + citation styles (APA/MLA/Chicago) and bibliography (Write)** - Pages has EndNote styles; implement CSL-lite.
21. **Text animation by character, motion paths, Copy/Paste Animation, Object List (Stage)** - Keynote signature polish.
22. **Dictionary of conversions and data detectors: recent units, auto-detect dates/phones/links across Notes/Todo/Calendar** - consistent "smart links" behaviour.
23. **LDIF/`.abbu` import, "My Card", company flag, Export as PDF (People)**.
24. **Encoding picker, wrap toggle, line numbers, Markdown preview, RTF/ODT save (Text)** - TextEdit/Notepad parity.
25. **Accessibility pass: image descriptions inspector, VoiceOver-friendly object labels, reduce motion, high contrast across all apps** - Apple apps expose roughly 300 accessibility strings each plus an Accessibility Description inspector; add alt-text fields for images/shapes/charts and verify keyboard-only operation.

---

## Where we deliberately differ (signature features, not in Apple/Microsoft apps)

- **Write**: Focus mode + Readability Lens (live readability and structure view while writing) instead of Apple's Intelligence-based "Start Writing".
- **Grid**: Formula X-ray (visual dependency and evaluation tracing of any cell's formula), instead of opaque calculation.
- **Stage**: Remix (re-theme and re-layout a deck in one action) instead of cloud/AI slide generation.
- **Look**: Clean Scan (de-skew, de-noise and tidy scans offline) instead of Live Text/Continuity-only import.
- **Notes**: Link Graph (note-to-note backlinks as a navigable graph) instead of shared/cloud-centric notes.
- **Canvas**: Tidy (auto-arrange and align freeform objects) instead of manual-only layout and collaboration.
- **Calendar**: Time Balance (distribution of time across calendars/categories) instead of account-synced sharing.
- **Todo**: Today's Three (commit to at most three daily priorities) instead of unlimited Today list.
- **People**: Relationship rhythm (cadence reminders for staying in touch) instead of a passive address book.
- **Calc**: Show Work (step-by-step derivation of each result) instead of result-only display.
- **Text**: Time-travel history (version scrubber for every document) instead of single-state autosave.

General deliberate differences: no accounts, no cloud collaboration, no telemetry, no network at runtime; native formats are open (JSON/zip/text) with real import/export of .docx/.xlsx/.pptx/.pdf/.ics/.vcf/.csv; Apple proprietary containers (`.pages`/`.numbers`/`.key` IWA, `.board`) are not targeted for import.

## Tool evidence summary

- Useful: `open_bundle_resources`, `inspect_plist` (document types, UTIs, URL schemes, permissions), `decode_interface_builder` (confirmed nib inventory; MainMenu nib omitted by document limits, so titles came from the nib string table).
- Not used: `inspect_asset_catalog`, `inspect_macho`/`list_strings` (menu titles available without opening binaries), `observe_native_ui` (no app running; GUI not launched).
- Limitations: menu nesting not decoded; system-app plist reads used plutil after the REA session was bound to Pages; Freeform/Calculator keyboard shortcut tables not extracted.
