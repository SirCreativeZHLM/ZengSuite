# Todo (ZengTodo)

Lists, due dates and natural-language quick add, with a daily planning ritual. All data stays on your device (the app's data folder); there is no account, network access or telemetry. Binary `zengreminders`, id `com.zengbot.suite.reminders`.

## What it does
- **Sidebar**: six smart lists as tinted tiles with live counts (Today, Scheduled, All, Flagged, Completed, No Date), user lists with colour and icon, groups (folders), drag to reorder or into a group, templates (save a list, create lists from it), tag browser, search (`⌘F`; supports `#tag`, `is:flagged`, `is:done`).
- **Tasks**: inline title editing (Return = new row below, Tab = make subtask, Shift-Tab = outdent), notes, URL, due date with optional time, repeat (daily, weekdays, weekly, every 2 weeks, monthly, yearly, custom with end date or count), early alert, priority (`!`, `!!`, `!!!`), flag, tags, collapsible subtasks with progress, image attachments, list change, multi-select with a bulk bar, context menu and hover buttons.
- **Views**: sort (manual drag-and-drop, due, priority, title, created), group (list, due, priority, tag, time of day), show/hide completed. Today is split into Overdue / Morning / Afternoon / Evening / Tonight / No Time.
- **Quick add** parses as you type with highlighted tokens: `Pay rent every 1st at 9am !!! #home in Work`. Dates, times, repeats (incl. `until`, `for N weeks`, `x5`), priority, `#tags`, `in <list>` / `@list`, `🚩`, `remind me 15 minutes before`. `⌥Return` adds the text literally.
- **Alerts** while the app is running: banner (Complete / Snooze / Show) plus a WebAudio chime, an overdue section and an overdue badge in the toolbar and window title.
- **Completing** animates the checkbox (spring), collapses the row after 1 s and offers Undo. Repeating tasks advance to the next date.
- **Undo/redo** across edits, moves, imports and deletions (200 levels).
- **Data safety**: changes are written within 300 ms, flushed on close/blur; two rotating slots plus a daily backup, each checksummed, so a corrupted write is recovered from the previous one (a notice explains what happened; damaged data is kept as `db-corrupt`).

### Today's Three
An optional daily ritual (toolbar sparkles button, View > Plan Today's Three, `⌘⇧P`; turn it off in Settings). Open tasks are scored from due date, priority, flag, age and how many times they were postponed; the planner suggests candidates and you drag up to three into numbered slots (spring-animated cards; Return on a suggestion also works). The Today view then shows your three, with a local-only tally ("N shipped today · M-day streak"). 
- **Postpone with reason**: press `P` on a selection, then `1` Tomorrow, `2` This weekend, `3` Next week, `4` Someday (clears the date, adds `#someday`). Each postponement is counted.
- **Stuck detector**: a task postponed 3 or more times is marked "Stuck" and Todo offers to split it into subtasks.

## Formats
| Format | Import | Export |
| --- | --- | --- |
| iCalendar `.ics` (VTODO, RRULE, VALARM, PRIORITY, STATUS, CATEGORIES, RELATED-TO subtasks) | yes (also lists exported by other calendar/reminder apps) | per list or all |
| CSV | yes (header detection; handles `Subject/Due Date/Status`-style and `TYPE/CONTENT/INDENT/DATE`-style files, best effort) | per list or all |
| JSON backup (with images) | merge or replace | everything |
| Markdown checklist | yes | per list or all |
Print: File > Print (current view). Drag a file onto the window to import; dropping images attaches them to the selected task.

## Shortcuts
`⌘N` new task, `⇧⌘N` new list, `⌘F` search, `⌘L` quick add, `⇧⌘F` flag, `⌘⌥1/2/3` priority (`⌘⌥0` none), `⌘K` link, `Space` complete, `⌘⌫` delete, `↑↓` move, `⌘I` details, `⌘1-6` smart lists, `⌘Z/⇧⌘Z` undo/redo, `P` postpone, `⇧⌘P` plan Today's Three, `⇧⌘A` select all tasks.

## Known limits
- Alerts only fire while the app is running (no background daemon, no system notifications).
- Time zones are not modelled: `.ics` times with a `TZID` are read as local wall-clock time; exports use floating local times.
- Subtasks are one level deep. A monthly task on the 31st is clamped to the month's last day.
- `⌘A` selecting every task works in the browser build; in the native macOS menu use Edit > Select All Tasks (`⇧⌘A`).
- Images are downscaled to 1600 px and kept inside the app's store (large libraries make the backup big).
- Natural-language parsing is English-only; ambiguous clock times without am/pm are guessed (`at 5` = 17:00, `at 7` = 07:00).

## Development
`node scripts/dev.mjs reminders 5471` (browser), `node --test apps/reminders/tests/` (parser, recurrence, import/export, Today's Three tests), `cargo build --release -p zeng-reminders`.
