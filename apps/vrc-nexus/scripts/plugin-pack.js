'use strict';
/* Packs a plugin folder into a .nxp file:  node scripts/plugin-pack.js <folder> [out.nxp]
 * Without arguments it builds the bundled example (plugins/src/text-plugin → plugins/text-plugin.nxp). */
const fs = require('fs');
const path = require('path');
const { writeZip, readZip } = require('../backend/nxp');
const { checkManifest } = require('../backend/plugins');

const src = path.resolve(process.argv[2] || path.join(__dirname, '..', 'plugins', 'src', 'text-plugin'));
const files = {};
(function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (e.isFile()) files[r] = fs.readFileSync(path.join(dir, e.name));
    }
})(src, '');
const m = checkManifest(files, require('../backend/vrchat').VERSION);
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'plugins', m.id + '.nxp'));
const zip = writeZip(files);
readZip(zip);   // Selbstprüfung
fs.writeFileSync(out, zip);
console.log('✔ ' + m.name + ' ' + m.version + ' → ' + path.relative(process.cwd(), out) + ' (' + zip.length + ' bytes, ' + Object.keys(files).length + ' files)');
