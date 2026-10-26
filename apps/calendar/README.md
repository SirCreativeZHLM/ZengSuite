# ZengCalendar

A free, offline calendar for macOS, Windows and Linux. Part of ZengSuite. Binary `zengcalendar`, id `com.zengbot.suite.calendar`. No account, no network, no telemetry.

Data is a small database in the app's config folder (one JSON file per calendar, saved as you edit; there is no Save command). Everything moves in and out as standard `.ics` files.

## What it does
- **Views**: Day, Work Week, Week, multi-day (2-14 days), Month, Year, List. Mini-month and calendar list (colours, show/hide, groups, create/rename/recolour/delete), week numbers (ISO 8601 when weeks start Monday, otherwise "week 1 contains Jan 1"), first weekday, 12/24 h, month/day names from `Intl`. Current-time line, all-day row, column-packed overlapping events, events crossing midnight, travel time, animated period/view changes (off with reduced motion), print (Week/Month).
- **Events**: drag on the grid to create (snap 5-60 min), double-click, quick add in plain language (`Lunch with Sam tomorrow 1pm for 1h at Cafe`, `Standup every weekday 9:30am`), drag to move (across days, into/out of the all-day row), drag edges to resize, hold Option/Alt while dropping to duplicate, context menu, undo/redo, copy/paste. Editor: title, location, all-day, start/end with time zones (floating, UTC or any IANA zone, separate end zone), repeat, alerts, URL, notes, attendees, travel time, availability, colour override, categories.
- **Repeat** (RFC 5545): daily/weekly/monthly/yearly with INTERVAL, BYDAY (including `2TU`, `-1FR`), BYMONTHDAY, BYMONTH, BYSETPOS, COUNT, UNTIL, exceptions, extra dates, plus a raw RRULE field. Editing or deleting asks: This Event / This and Future Events / All Events.
- **Alerts**: at time, 5/10/15/30/60 min, 2 h, 1-2 days, 1 week (all-day events also "9:00 the day before"). In-app banners with Snooze while the app runs; alerts that fired while it was closed appear in a **Missed Alerts** list at launch (Calendar menu too). There are no system notifications.
- **Search** (title, location, notes, attendees, categories; accent- and case-insensitive), **Find Free Time**, **holiday calendars** for US, UK, CA, AU, DE, FR, JP, CN, IN, BR computed by rule for any year (no data files), optional approximate **moon phases**.
- **Time Balance** (right sidebar, "Balance" tab, Cmd/Ctrl+B): for the visible week or month, time by calendar (donut) and by category (stacked bar), a meeting-load meter (meetings, i.e. events with attendees or the category "Meeting", as a share of working hours; overlaps counted once), a day-by-day free-time ribbon with the longest window marked, and **Focus blocks**. A thin green strip on the right edge of each working day in Day/Week views shows free windows: drag along it to protect that time as a focus block (click protects the window, up to 4 h). Focus blocks are ordinary busy events marked `X-ZENG-FOCUS`, so they export and round-trip. Quick add, the editor, drags and Find Free Time respect them (you are asked before double-booking; Find Free Time can be told to ignore them). A weekly goal (default 10 h) shows progress; "Protect time..." proposes the longest free windows.
- **Import / export**: `.ics` import (VEVENT with RRULE/EXDATE/RDATE/RECURRENCE-ID/VTIMEZONE/VALARM/ATTENDEE/CATEGORIES, line unfolding, escaping, unknown and `X-` properties kept verbatim) and strict RFC 5545 export per calendar, for everything, or for one event. Outlook CSV import/export (English headers; date order auto-detected). Open or drop an `.ics`/`.csv` on the window or app icon and choose "Import into" an existing or new calendar. Re-importing a file updates events with the same UID instead of duplicating.
- **Subscribe from file**: subscribing to a URL needs a network, which this app never uses. Instead, *Subscribe from File* creates a read-only calendar that mirrors a local `.ics`; *Refresh Subscriptions* (Cmd/Ctrl+R) re-reads the file (its remembered path in the native app) and adds, updates (by UID) and removes events. Nothing refreshes by itself.

## Keyboard
Left/Right previous/next period, T today, 1 Day, 2 Work Week, 3 Week, 4 Multi-day, 5 Month, 6 Year, 7 List, N quick add, Return edit, Delete delete, Cmd/Ctrl+F search, Cmd/Ctrl+Shift+F free time, Cmd/Ctrl+N new event, Cmd/Ctrl+Z undo, Cmd/Ctrl+C / V copy/paste event, Cmd/Ctrl+D duplicate, Cmd/Ctrl+B Time Balance, Cmd/Ctrl+, preferences.

## Known limits (honest list)
- Invitations cannot be sent or answered; attendees are stored and exported only.
- Alerts are in-app only and only fire while the app is running (missed ones are listed at the next launch).
- VTIMEZONE blocks without an IANA/Windows name become a fixed offset (no DST rules); Windows zone names are mapped through a built-in table. Exported VTIMEZONEs list explicit transitions rather than RRULEs. `RANGE=THISANDFUTURE` overrides are read as single-occurrence overrides; `RDATE;VALUE=PERIOD` and unsupported RRULEs are preserved as raw properties but not expanded.
- Holidays: national dates only. Lunisolar holidays exist for China (computed with `Intl`, and the new year from an astronomical new-moon calculation); India has no Diwali/Holi/Eid, and no country has regional holidays. Moon phases are accurate to minutes in theory, labelled approximate in the app.
- Outlook CSV has no recurrence: exported rows are the individual occurrences in a chosen date range. Only English column headers are read.
- The week view needs a window of at least 760 px; the sidebar hides itself below 860 px (toggle it from the toolbar).
- Tested on macOS (native window, light and dark) and in Chromium; Windows and Linux builds are not tested here.

## Tests
`node apps/calendar/test/run.mjs` (no dependencies): parse/serialize/parse round trips, a strict independent RFC 5545 output validator, RFC 5545 section 3.8.5.3 examples, 160 generated RRULEs cross-checked against python-dateutil answers (`test/fixtures/dateutil-cases.json`), time zones around DST gaps/overlaps, overlap layout, free-time maths, holidays/moon, CSV, quick-add parsing, Time Balance maths, edit/delete scopes with undo, alerts, and a 5,000-event/200-series expansion benchmark (about 30 ms warm for a month).

## Layout
`ui/lib/` pure logic (time, iCalendar, holidays, CSV, quick add, balance), `ui/core.js` state and undo, `views.js`, `interact.js`, `editor.js`, `dialogs.js`, `io.js`, `balance.js`, `app.js`. `sample/` has a small `.ics` and an Outlook-style `.csv`.
