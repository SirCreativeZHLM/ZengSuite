/* Unit conversion tables + date calculation. Pure functions, no DOM. */
(function (g) {
  'use strict';
  const dep = typeof module !== 'undefined' && module.exports ? require('./dec.js') : g.ZC;
  const { Dec, CalcError } = dep;
  const F = (s) => { const [a, b] = String(s).split('/'); return b ? Dec.parse(a).div(Dec.parse(b)) : Dec.parse(a); };

  // category -> {name, base, units:[{id,label,names:[aliases], f}]}  value_in_base = value * f
  const raw = {
    length: ['Length', [
      ['m', 'Meters (m)', 'm meter meters metre metres', '1'], ['km', 'Kilometers (km)', 'km kilometer kilometers kilometre kilometres', '1000'],
      ['cm', 'Centimeters (cm)', 'cm centimeter centimeters centimetre centimetres', '0.01'], ['mm', 'Millimeters (mm)', 'mm millimeter millimeters millimetre millimetres', '0.001'],
      ['um', 'Micrometers (µm)', 'um µm micrometer micrometers micron microns', '0.000001'], ['nm', 'Nanometers (nm)', 'nm nanometer nanometers', '0.000000001'],
      ['mi', 'Miles (mi)', 'mi mile miles', '1609.344'], ['yd', 'Yards (yd)', 'yd yard yards', '0.9144'], ['ft', 'Feet (ft)', 'ft foot feet', '0.3048'],
      ['in', 'Inches (in)', 'inch inches "', '0.0254'], ['nmi', 'Nautical miles', 'nmi', '1852']]],
    area: ['Area', [
      ['m2', 'Square meters (m²)', 'm2 m² sqm', '1'], ['km2', 'Square kilometers (km²)', 'km2 km² sqkm', '1000000'], ['cm2', 'Square centimeters (cm²)', 'cm2 cm²', '0.0001'],
      ['mm2', 'Square millimeters (mm²)', 'mm2 mm²', '0.000001'], ['ha', 'Hectares (ha)', 'ha hectare hectares', '10000'], ['acre', 'Acres', 'acre acres', '4046.8564224'],
      ['ft2', 'Square feet (ft²)', 'ft2 ft² sqft', '0.09290304'], ['in2', 'Square inches (in²)', 'in2 in² sqin', '0.00064516'], ['yd2', 'Square yards (yd²)', 'yd2 yd²', '0.83612736'], ['mi2', 'Square miles (mi²)', 'mi2 mi² sqmi', '2589988.110336']]],
    volume: ['Volume', [
      ['L', 'Liters (L)', 'l L liter liters litre litres', '1'], ['mL', 'Milliliters (mL)', 'ml mL milliliter milliliters', '0.001'], ['m3', 'Cubic meters (m³)', 'm3 m³', '1000'],
      ['cm3', 'Cubic centimeters (cm³)', 'cm3 cm³ cc', '0.001'], ['gal', 'US gallons', 'gal gallon gallons', '3.785411784'], ['qt', 'US quarts', 'qt quart quarts', '0.946352946'],
      ['pt', 'US pints', 'pint pints', '0.473176473'], ['cup', 'US cups', 'cup cups', '0.2365882365'], ['floz', 'US fluid ounces', 'floz', '0.0295735295625'],
      ['tbsp', 'Tablespoons (US)', 'tbsp', '0.01478676478125'], ['tsp', 'Teaspoons (US)', 'tsp', '0.00492892159375'], ['galuk', 'UK gallons', 'galuk', '4.54609'],
      ['flozuk', 'UK fluid ounces', 'flozuk', '0.0284130625'], ['ft3', 'Cubic feet (ft³)', 'ft3 ft³', '28.316846592'], ['in3', 'Cubic inches (in³)', 'in3 in³', '0.016387064']]],
    mass: ['Mass', [
      ['kg', 'Kilograms (kg)', 'kg kilogram kilograms', '1'], ['g', 'Grams (g)', 'g gram grams', '0.001'], ['mg', 'Milligrams (mg)', 'mg milligram milligrams', '0.000001'],
      ['ug', 'Micrograms (µg)', 'ug µg', '0.000000001'], ['t', 'Metric tons (t)', 'tonne tonnes', '1000'], ['lb', 'Pounds (lb)', 'lb lbs pound pounds', '0.45359237'],
      ['oz', 'Ounces (oz)', 'oz ounce ounces', '0.028349523125'], ['st', 'Stone (st)', 'stone', '6.35029318'], ['ton', 'US tons', 'ton tons', '907.18474'], ['tonuk', 'UK tons', 'tonuk', '1016.0469088'], ['ct', 'Carats (ct)', 'carat carats', '0.0002']]],
    temperature: ['Temperature', [['C', 'Celsius (°C)', 'c celsius °c degc', '1'], ['F', 'Fahrenheit (°F)', 'f fahrenheit °f degf', '1'], ['K', 'Kelvin (K)', 'k kelvin', '1'], ['R', 'Rankine (°R)', 'rankine °r', '1']]],
    speed: ['Speed', [
      ['mps', 'Meters per second (m/s)', 'm/s mps', '1'], ['kmh', 'Kilometers per hour (km/h)', 'km/h kph kmh', '1000/3600'], ['mph', 'Miles per hour (mph)', 'mph mi/h', '0.44704'],
      ['kn', 'Knots (kn)', 'kn knot knots kt', '1852/3600'], ['fts', 'Feet per second (ft/s)', 'ft/s fps', '0.3048'], ['mach', 'Mach', 'mach', '340.29']]],
    time: ['Time', [
      ['s', 'Seconds (s)', 's sec secs second seconds', '1'], ['ms', 'Milliseconds (ms)', 'ms msec millisecond milliseconds', '0.001'], ['us', 'Microseconds (µs)', 'usec µs microsecond microseconds', '0.000001'],
      ['ns', 'Nanoseconds (ns)', 'ns nanosecond nanoseconds', '0.000000001'], ['min', 'Minutes (min)', 'min mins minute minutes', '60'], ['h', 'Hours (h)', 'h hr hrs hour hours', '3600'],
      ['d', 'Days (d)', 'd day days', '86400'], ['wk', 'Weeks (wk)', 'wk week weeks', '604800'], ['mo', 'Months (avg)', 'mo month months', '2629746'], ['yr', 'Years (avg)', 'yr year years', '31556952']]],
    data: ['Data', [
      ['bit', 'Bits', 'bit bits', '1/8'], ['B', 'Bytes (B)', 'byte bytes', '1'], ['KB', 'Kilobytes (KB)', 'kb KB', '1000'], ['MB', 'Megabytes (MB)', 'mb MB', '1000000'], ['GB', 'Gigabytes (GB)', 'gb GB', '1000000000'],
      ['TB', 'Terabytes (TB)', 'tb TB', '1000000000000'], ['PB', 'Petabytes (PB)', 'pb PB', '1000000000000000'], ['KiB', 'Kibibytes (KiB)', 'kib KiB', '1024'], ['MiB', 'Mebibytes (MiB)', 'mib MiB', '1048576'],
      ['GiB', 'Gibibytes (GiB)', 'gib GiB', '1073741824'], ['TiB', 'Tebibytes (TiB)', 'tib TiB', '1099511627776']]],
    energy: ['Energy', [
      ['J', 'Joules (J)', 'j joule joules', '1'], ['kJ', 'Kilojoules (kJ)', 'kj kilojoule kilojoules', '1000'], ['cal', 'Calories (cal)', 'cal calorie calories', '4.184'], ['kcal', 'Kilocalories (kcal)', 'kcal Cal', '4184'],
      ['Wh', 'Watt-hours (Wh)', 'wh', '3600'], ['kWh', 'Kilowatt-hours (kWh)', 'kwh', '3600000'], ['BTU', 'BTU', 'btu', '1055.05585262'], ['ftlb', 'Foot-pounds', 'ftlbf', '1.3558179483314'], ['eV', 'Electronvolts (eV)', 'ev', '0.0000000000000000001602176634']]],
    pressure: ['Pressure', [
      ['Pa', 'Pascals (Pa)', 'pa pascal pascals', '1'], ['kPa', 'Kilopascals (kPa)', 'kpa', '1000'], ['MPa', 'Megapascals (MPa)', 'mpa', '1000000'], ['bar', 'Bar', 'bar bars', '100000'], ['mbar', 'Millibar', 'mbar', '100'],
      ['atm', 'Atmospheres (atm)', 'atm', '101325'], ['psi', 'PSI', 'psi', '6894.757293168'], ['mmHg', 'mmHg', 'mmhg', '133.322387415'], ['inHg', 'inHg', 'inhg', '3386.389'], ['torr', 'Torr', 'torr', '101325/760']]],
    angle: ['Angle', [
      ['deg', 'Degrees (°)', 'deg degree degrees °', '1'], ['rad', 'Radians (rad)', 'rad radian radians', '180/3.14159265358979323846264338327950288'], ['grad', 'Gradians (grad)', 'grad gradian gradians gon', '0.9'],
      ['turn', 'Turns', 'turn turns rev', '360'], ['arcmin', 'Arcminutes', 'arcmin', '1/60'], ['arcsec', 'Arcseconds', 'arcsec', '1/3600']]],
    fuel: ['Fuel economy', [['l100', 'Liters per 100 km (L/100km)', 'l/100km', '1'], ['kml', 'Kilometers per liter (km/L)', 'km/l', '1'], ['mpg', 'Miles per gallon (US)', 'mpg', '1'], ['mpguk', 'Miles per gallon (UK)', 'mpguk', '1']]],
    currency: ['Currency', []],
  };
  const FUEL_K = { mpg: Dec.parse('235.214583333333333333333333333333'), mpguk: Dec.parse('282.480936331822222222222222222222') };
  const CATS = {}; const ALIAS = {};
  for (const id in raw) {
    const [name, list] = raw[id]; CATS[id] = { id, name, units: [] };
    for (const [uid, label, names, f] of list) {
      const u = { id: uid, label, cat: id, f: F(f), names: names.split(' ') }; CATS[id].units.push(u);
      for (const n of [...u.names, uid]) if (!(n in ALIAS) || ALIAS[n].cat === id) ALIAS[n] = u;
    }
  }
  // currencies are user-entered: rate = units of that currency per 1 unit of the reference currency (USD by default)
  let rates = {};
  const CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN'];
  function setRates(r) {
    rates = {}; CATS.currency.units = [];
    for (const k of Object.keys(ALIAS)) if (ALIAS[k].cat === 'currency') delete ALIAS[k];
    for (const code of Object.keys(r || {})) {
      const c = code.toUpperCase();
      let v = null; try { v = r[code] === '' || r[code] == null ? null : Dec.parse(String(r[code])); } catch (e) { v = null; }
      if (v && v.sign() <= 0) v = null;
      rates[c] = v;
      const u = { id: c, label: c, cat: 'currency', names: [c, c.toLowerCase()], rate: v };
      CATS.currency.units.push(u); ALIAS[c] = u; ALIAS[c.toLowerCase()] = u;
    }
  }
  setRates(Object.fromEntries(CODES.map((c) => [c, c === 'USD' ? '1' : ''])));

  const D = (x) => Dec.of(x);
  function tempToK(v, id) { v = D(v); return id === 'C' ? v.add('273.15') : id === 'F' ? v.add('459.67').mul(5).div(9) : id === 'R' ? v.mul(5).div(9) : v; }
  function tempFromK(k, id) { return id === 'C' ? k.sub('273.15') : id === 'F' ? k.mul(9).div(5).sub('459.67') : id === 'R' ? k.mul(9).div(5) : k; }
  function fuelToL100(v, id) { v = D(v); if (id === 'l100') return v; if (v.isZero()) throw new CalcError('Cannot divide by zero'); return (id === 'kml' ? Dec.parse('100') : FUEL_K[id]).div(v); }
  function fuelFromL100(v, id) { if (id === 'l100') return v; if (v.isZero()) throw new CalcError('Cannot divide by zero'); return (id === 'kml' ? Dec.parse('100') : FUEL_K[id]).div(v); }
  function unit(id) { const u = ALIAS[id] || ALIAS[String(id).toLowerCase()]; if (!u) throw new CalcError('Unknown unit ' + id); return u; }
  function convert(value, from, to) {
    const a = typeof from === 'string' ? unit(from) : from, b = typeof to === 'string' ? unit(to) : to; const v = D(value);
    if (a.cat !== b.cat) throw new CalcError('Cannot convert ' + a.cat + ' to ' + b.cat);
    if (a === b) return v;
    if (a.cat === 'temperature') return tempFromK(tempToK(v, a.id), b.id).roundSig(Dec.PREC);
    if (a.cat === 'fuel') return fuelFromL100(fuelToL100(v, a.id), b.id).roundSig(Dec.PREC);
    if (a.cat === 'currency') {
      if (!a.rate || !b.rate) throw new CalcError('Enter a rate for ' + (!a.rate ? a.id : b.id));
      return v.div(a.rate).mul(b.rate).roundSig(Dec.PREC);
    }
    return v.mul(a.f).div(b.f).roundSig(Dec.PREC);
  }

  // ---------------- dates (proleptic Gregorian, UTC-free civil math) ----------------
  const daysFromCivil = (y, m, d) => { y -= m <= 2 ? 1 : 0; const era = Math.floor(y / 400); const yoe = y - era * 400; const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; return era * 146097 + doe - 719468; };
  const civilFromDays = (z) => { z += 719468; const era = Math.floor(z / 146097); const doe = z - era * 146097; const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); let y = yoe + era * 400; const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); const mp = Math.floor((5 * doy + 2) / 153); const d = doy - Math.floor((153 * mp + 2) / 5) + 1; const m = mp + (mp < 10 ? 3 : -9); if (m <= 2) y++; return { y, m, d }; };
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  function parseISO(s) { const m = /^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim()); if (!m) throw new CalcError('Invalid date'); const y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) throw new CalcError('Invalid date'); return { y, m: mo, d }; }
  const toISO = ({ y, m, d }) => (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const dayNum = (o) => daysFromCivil(o.y, o.m, o.d);
  const weekday = (o) => ((dayNum(o) % 7) + 11) % 7; // 0 = Sunday (1970-01-01 was Thursday)
  function addMonths(o, n) { const t = o.y * 12 + (o.m - 1) + n; const y = Math.floor(t / 12), m = t - y * 12 + 1; return { y, m, d: Math.min(o.d, dim(y, m)) }; }
  function addToDate(o, { years = 0, months = 0, weeks = 0, days = 0 }, sign = 1) {
    let r = addMonths(o, sign * (years * 12 + months)); return civilFromDays(dayNum(r) + sign * (weeks * 7 + days));
  }
  // difference a -> b (b may be earlier: result.negative)
  function diffDates(a, b) {
    let neg = false; if (dayNum(a) > dayNum(b)) { [a, b] = [b, a]; neg = true; }
    let months = (b.y - a.y) * 12 + (b.m - a.m); let mid = addMonths(a, months);
    if (dayNum(mid) > dayNum(b)) { months--; mid = addMonths(a, months); }
    const days = dayNum(b) - dayNum(mid); const total = dayNum(b) - dayNum(a);
    // weekdays between (a inclusive, b exclusive)
    let wd = 0; const full = Math.floor(total / 7); wd = full * 5; for (let i = full * 7; i < total; i++) { const w = ((dayNum(a) + i) % 7 + 11) % 7; if (w !== 0 && w !== 6) wd++; }
    return { negative: neg, years: Math.floor(months / 12), months: months % 12, days, totalDays: total, weeks: Math.floor(total / 7), remDays: total % 7, weekdays: wd };
  }
  function addWeekdays(o, n) { let d = dayNum(o); const step = n < 0 ? -1 : 1; let left = Math.abs(n); while (left > 0) { d += step; const w = ((d % 7) + 11) % 7; if (w !== 0 && w !== 6) left--; } return civilFromDays(d); }

  const api = { CATS, ALIAS, convert, unit, setRates, getRates: () => rates, CODES, daysFromCivil, civilFromDays, isLeap, daysInMonth: dim, parseISO, toISO, dayNum, weekday, addMonths, addToDate, diffDates, addWeekdays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.ZC = Object.assign(g.ZC || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
