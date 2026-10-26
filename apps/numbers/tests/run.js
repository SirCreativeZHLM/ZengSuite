// Runs every tests/test-*.js in its own process and prints a summary. Exit code 1 if any fails.
const fs = require('fs'), path = require('path'), cp = require('child_process');
let total = 0, bad = 0;
for (const f of fs.readdirSync(__dirname).filter((x) => /^test-.*\.js$/.test(x)).sort()) {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' }); process.stdout.write(r.stdout + r.stderr);
  const m = /(\d+) passed, (\d+) failed/.exec(r.stdout); if (m) { total += +m[1]; bad += +m[2]; } if (r.status) bad += m ? 0 : 1;
}
console.log(`\nTOTAL: ${total} assertions passed, ${bad} failed`); process.exit(bad ? 1 : 0);
