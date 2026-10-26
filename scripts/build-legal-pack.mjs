// Builds a "legal library pack": a folder of plain-text statutes, split into
// browser-friendly parts, that you drag into Document Library → Add documents.
//
// The pack is built from source texts you supply locally. It is NOT bundled
// with the app and is not committed to the repository (see .gitignore).
//
//   node scripts/build-legal-pack.mjs <out-dir> <source-dir> [<source-dir> ...] [--all]
//
// Without --all only the core set used by the tax, corporate and NFP engines is
// included. Files larger than MAX_PART bytes are split on line boundaries so
// each part indexes quickly in the browser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_PART = 3_000_000;
const CORE = [
  /Income_Tax_Act\.txt$/,
  /Income_Tax_Regulations/,
  /Income_Tax_Application_Rules/,
  /Canada-United_States_Tax_Convention_Act/,
  /Excise_Tax_Act/,
  /Canada_Not-for-profit_Corporations_Act/,
  /Canada_Business_Corporations_Act/,
  /Canada_Pension_Plan/,
  /Employment_Insurance_Act/,
  /Investment_Canada_Act/,
  /Global_Minimum_Tax_Act/,
  /Multilateral_Instrument/,
  /^26USC_ch001/,
  /^26USC_ch006[01]/,
  /^26CFR_Part1_0[5-8]of15/,
  /^26CFR_part-0301/,
];

const args = process.argv.slice(2);
const all = args.includes('--all');
const [out, ...sources] = args.filter((a) => a !== '--all');
if (!out || !sources.length) {
  console.error('Usage: node scripts/build-legal-pack.mjs <out-dir> <source-dir> [...] [--all]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const manifest = { format: 'threex-legal-pack', version: 1, createdAt: new Date().toISOString(), files: [] };
for (const dir of sources) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.txt')) continue;
    if (!all && !CORE.some((re) => re.test(name))) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const sha256 = crypto.createHash('sha256').update(text).digest('hex');
    const parts = split(text);
    parts.forEach((p, i) => {
      const file = parts.length > 1 ? name.replace(/\.txt$/, `__part${String(i + 1).padStart(2, '0')}of${String(parts.length).padStart(2, '0')}.txt`) : name;
      fs.writeFileSync(path.join(out, file), p);
      manifest.files.push({ file, source: name, part: i + 1, parts: parts.length, bytes: Buffer.byteLength(p), sourceSha256: sha256 });
    });
  }
}
fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
const total = manifest.files.reduce((a, f) => a + f.bytes, 0);
console.log(`Legal pack: ${manifest.files.length} files, ${(total / 1e6).toFixed(1)} MB → ${out}`);

function split(text) {
  if (Buffer.byteLength(text) <= MAX_PART) return [text];
  const lines = text.split('\n');
  const parts = [];
  let cur = [];
  let size = 0;
  for (const l of lines) {
    const b = Buffer.byteLength(l) + 1;
    if (size + b > MAX_PART && cur.length) {
      parts.push(cur.join('\n'));
      cur = [];
      size = 0;
    }
    cur.push(l);
    size += b;
  }
  if (cur.length) parts.push(cur.join('\n'));
  return parts;
}
