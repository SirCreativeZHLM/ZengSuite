# ZengCalculator

One calculator with seven modes: **Basic**, **Scientific**, **Programmer**, **Converter**, **Date Calculation**, **Graphing**, **Notes** (Math Notes). Not a document app: no Save. Offline, no network, no telemetry.

## Highlights
- Exact decimal arithmetic (BigInt-based `Dec`): 0.1 + 0.2 = 0.3. Division and roots to 34 digits; trig/log/exp use doubles rounded to 15 digits.
- Hand-written parser (no `eval`): precedence, implicit multiplication (`2(3+4)`, `2pi`), `!`, `%`, `mod`, `nCr`, `nPr`, units in Notes.
- Percent follows Apple/Windows: `100+10%` = 110, `200-10%` = 180, `20% of 85` = 17.
- Programmer: 64/32/16/8-bit words, signed (two's complement) or unsigned, HEX/DEC/OCT/BIN synced, clickable bit grid, AND OR XOR NOT NAND NOR, shifts, rotates, wraps on overflow and flags it.
- Converter: length, area, volume, mass, temperature, speed, time, data, energy, pressure, angle, fuel economy, currency. Currency rates are typed in by you; nothing is fetched.
- Graphing: up to 6 functions of x, sliders for a, b, c, pan/zoom (drag, wheel, pinch) with momentum, trace, zeros, extrema, intersections, table of values.
- Notes: lines like `rent = 1200`, `rent * 12 + 300`, `20% of 85`, `5 km in miles`, `sum`; live right-aligned results, autosave, export as text.
- Paper tape history (persisted), digit grouping toggle, optional click sound (off), text size 100-200%.

## Shortcuts
Cmd/Ctrl+1..7 modes, Cmd/Ctrl+Shift+H history, Cmd/Ctrl+C copy result, paste parses numbers (thousands separators honoured), Enter or = equals, Esc clear, Backspace delete, Cmd/Ctrl +/-/0 text size. Scientific: `( ) ! ^ e p s o t l n q @ r m`. Programmer: hex digits, `& | ^ ~ < >`.

## Tests
`node apps/calculator/tests/run.js` (650+ assertions on the engines: precision, percent, trig modes, programmer overflow, conversions, dates, notes).

## Known limits
- Transcendental functions are double precision (about 15 digits).
- Graphing is y = f(x) only; uniform axis scale.
- Notes units: no compound units beyond built-in ones like km/h; multiplying two quantities is an error.
- Native window resize per mode uses a new additive `window_size` command in zeng-shell.
