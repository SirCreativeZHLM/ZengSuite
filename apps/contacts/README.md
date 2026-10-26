# ZengContacts

Address book for ZengSuite (Apple Contacts + Outlook People). Binary `zengcontacts`, id `com.zengbot.suite.contacts`, accent violet `#bf5af2`.

## What it does
- Three columns: groups / smart groups, alphabetical list (section letters, sticky header, A-Z index, sort and display by first or last name), contact card.
- Read card: avatar or photo, tap-to-copy fields, action buttons for email, call (`tel:`), map, website and share, birthday countdown.
- Edit card: name parts, phonetic, nickname, company, department, job title, phones, emails, URLs, structured addresses, birthday (year optional), dates, related names, social profiles, instant messages, notes, custom labels, circular photo crop (zoom/pan), favourite, group membership.
- Search (names, company, notes, emails, addresses, phone digits ignoring punctuation), multi-select, drag contacts onto a group (pointer events), delete with undo toast, session change history with undo/redo.
- Smart groups with rules (company contains, birthday this month / next N days, has photo, in group, date added, ...), Birthdays view and upcoming-birthdays list.
- Duplicate finder and merge (union of fields, per-field conflict choice), clean-up suggestions for empty or invalid data.
- Print: lists, cards, envelopes (#10, DL), mailing labels (Avery 5160, A4 3x7), via print CSS.
- Import and export: vCard 2.1/3.0/4.0 (folding, QUOTED-PRINTABLE, charsets, photos, grouped `itemN.` properties and `X-ABLabel`, several cards per file, unknown properties preserved), CSV with field-mapping UI (Google and Outlook presets), export of selection / current list / group / all, `.zcontacts` backup (zip with JSON + vCard). Drag `.vcf`, `.csv`, `.zcontacts` onto the window.
- Data lives in `zeng.store` and is autosaved (debounced, flushed on close). Corrupt data falls back to a rolling backup.

## Shortcuts
New contact Cmd/Ctrl+N, new group Shift+N, find F, edit/done E (Return also finishes), delete Cmd+Backspace, import O, export Shift+E, print P, select all Shift+A, arrows/Home/End/PageUp/PageDown move the selection (Shift extends), Cmd+1/2/3 switch lists.

## Tests
`node apps/contacts/test/test.js` runs 300+ assertions on the vCard, CSV and model libraries (`ui/lib/`), including Apple, Google and Outlook style cards.

## Known limits
- Photos from vCards are re-encoded to at most 320 px JPEG when large; remote photo URLs are kept as raw properties, not fetched.
- vCard `PHOTO` of formats other than JPEG/PNG/GIF/WebP will not display.
- Birthday year 1604 (Apple's "no year" marker) is read as year-less.
- No sync or accounts; no ringtone fields. Smart groups cannot be drop targets.
- Relative-date features (birthdays) use the local clock at the time of viewing.
