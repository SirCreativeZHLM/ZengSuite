# Calc (ZengCalc)

One calculator with seven modes: **Basic**, **Scientific**, **Programmer**, **Converter**, **Date Calculation**, **Graphing**, **Scratch** (free-form lines with variables). Not a document app: no Save. Offline, no network, no telemetry.

## Highlights
- Exact decimal arithmetic (BigInt-based `Dec`): 0.1 + 0.2 = 0.3. Division and roots to 34 digits; trig/log/exp use doubles rounded to 15 digits.
- Hand-written parser (no `eval`): precedence, implicit multiplication (`2(3+4)`, `2pi`), `!`, `%`, `mod`, `nCr`, `nPr`, units in Scratch.
- Percent works the common way: `100+10%` = 110, `200-10%` = 180, `20% of 85` = 17.
- Programmer: 64/32/16/8-bit words, signed (two's complement) or unsigned, HEX/DEC/OCT/BIN synced, clickable bit grid, AND OR XOR NOT NAND NOR, shifts, rotates, wraps on overflow and flags it.
- Converter: length, area, volume, mass, temperature, speed, time, data, energy, pressure, angle, fuel economy, currency. Currency rates are typed in by you; nothing is fetched.
- Graphing: up to 6 functions of x, sliders for a, b, c, pan/zoom (drag, wheel, pinch) with momentum, trace, zeros, extrema, intersections, table of values.
- Scratch: lines like `rent = 1200`, `rent * 12 + 300`, `20% of 85`, `5 km in miles`, `sum`; live right-aligned results, autosave, export as text.
- Paper tape history (persisted), digit grouping toggle, optional click sound (off), text size 100-200%.

## Show Work (signature feature)
Every result can explain itself, offline, in any mode. Press **Show work** under the display (or Cmd/Ctrl+Shift+K, or the list icon on a history row):
- **Steps** in evaluation order, with the current operation highlighted, the operators colour-coded and numbered by precedence, and a plain reason ("× binds tighter than +", "inside parentheses", "10% of 100 is 10").
- **Tree** view of the same evaluation, with the same order badges.
- **What changed**: click a number in the expression (or drag it sideways, or use the arrow keys) to try another value. The result, the changed steps and the changed tree nodes update live and show the old value, the delta and the percentage.
- **Other modes**: Converter shows the unit-by-unit arithmetic (including temperature and your currency rates), Date shows month and day counting and clamping, Programmer shows each bitwise step in binary and says when a result wraps, Graphing explains the traced point, Scratch explains any line (click its result).
- **What-if slider (Scratch)**: pick a variable (chips under the editor, or the slider icon on its line). Dragging the slider re-evaluates every dependent line live and marks which lines changed; **Apply** writes the value back into the line.
- **Share**: copy as text, copy as an image card (PNG, in your current light or dark look), or save the image.

## Shortcuts
Cmd/Ctrl+1..7 modes, Cmd/Ctrl+Shift+H history, Cmd/Ctrl+Shift+K Show Work, Cmd/Ctrl+C copy result, paste parses numbers (thousands separators honoured), Enter or = equals, Esc clear, Backspace delete, Cmd/Ctrl +/-/0 text size. Scientific: `( ) ! ^ e p s o t l n q @ r m`. Programmer: hex digits, `& | ^ ~ < >`.

## Tests
`node apps/calculator/tests/run.js` (760+ assertions on the engines: precision, percent, trig modes, programmer overflow, conversions, dates, Scratch, Show Work).

## Known limits
- Transcendental functions are double precision (about 15 digits).
- Graphing is y = f(x) only; uniform axis scale.
- Scratch units: no compound units beyond built-in ones like km/h; multiplying two quantities is an error.
- Native window resize per mode uses a new additive `window_size` command in zeng-shell.
