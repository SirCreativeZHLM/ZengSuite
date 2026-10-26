// Loads the engine into a node global (same files, same order as index.html).
const path = require('path'); const fs = require('fs');
globalThis.fflate = globalThis.fflate || require(path.join(__dirname, '..', '..', '..', 'crates', 'zeng-shell', 'kit', 'vendor', 'fflate.js'));
const dir = path.join(__dirname, '..', 'ui', 'engine');
for (const f of fs.readFileSync(path.join(dir, 'ORDER'), 'utf8').split(/\s+/).filter(Boolean)) { const p = path.join(dir, f); if (fs.existsSync(p)) require(p); }
module.exports = globalThis.ZN;
