# People (ZengPeople)

Address book with a relationship rhythm for ZengSuite. Binary `zengcontacts`, id `com.zengbot.suite.contacts`, accent violet `#bf5af2`.

## Relationship rhythm (signature feature)
- Give any contact a cadence ("every 2 months"), a last-caught-up date, and a timeline of notes.
- **Catch up** view lists who is due (overdue or due within 3 days), most overdue first. Each row has one-tap Email, Call (`mailto:` / `tel:`) and "mark as caught up"; after opening mail or phone you get a toast to log the catch-up.
- Log a catch-up from the card with a date and a note, or add a plain note. Everything is undoable; timeline entries can be removed.
- Birthday and anniversary nudges: pills on the card, a "Coming up" list in the sidebar, and a once-a-day toast for today's dates.
- **People map**: an interactive constellation of contacts clustered by company or by group. Node size shows how recently you caught up, hollow dashed nodes are people you have not logged yet, a pulsing ring marks people who are due. Drag to pan, scroll or buttons to zoom, double-click to fit, click a node for a quick card (email, call, log, open).
- Rhythm data is stored in vCard exports as `X-ZENG-CADENCE`, `X-ZENG-LAST`, `X-ZENG-LOG` and in backups.

## Everything else
- Groups, smart groups (rules incl. "is due", company contains, birthday this month), favourites, search (names, company, notes, emails, addresses, phone digits), multi-select, drag contacts onto a group, delete with undo, change history.
- Card: tinted tile avatar or photo (crop with zoom/pan), tap-to-copy fields with open buttons, structured addresses, birthday, dates, related names, social, instant messages, notes, custom labels, phonetic names.
- Duplicate finder with per-field merge, clean-up of empty or invalid cards.
- Print lists, cards, envelopes (#10, DL) and labels (Avery 5160, A4 3x7).
- Import/export vCard 2.1/3.0/4.0 and CSV with a mapping dialog (Google Contacts and Outlook presets), `.zcontacts` backup/restore, drag files onto the window.
- Autosave (debounced, flushed on close) with a rolling backup if the store is unreadable.

## Shortcuts
New contact Cmd/Ctrl+N, new group Shift+N, find F, edit/done E (Return also finishes), delete Cmd+Backspace, log catch-up L, import O, export Shift+E, print P, select all Shift+A, Cmd+1..5 switch All / Favourites / Birthdays / Catch up / People map, arrows move the selection.

## Tests
`node apps/contacts/test/test.js` runs 380+ assertions on the vCard, CSV, rhythm and model code in `ui/lib/`.

## Known limits
- Remote photo URLs in vCards are kept raw, not fetched; large photos are re-encoded to 320 px JPEG.
- The map draws at most 700 people (most recent first).
- "Due" means the next catch-up date is today, past, or within 3 days; contacts never logged count from the day they were added.
- No sync, no accounts.
