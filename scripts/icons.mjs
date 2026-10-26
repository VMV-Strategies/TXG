// Generates PNG app icons from public/icons/icon.svg (original artwork).
import sharp from 'sharp';
import fs from 'node:fs';
const svg = fs.readFileSync('public/icons/icon.svg');
const targets = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];
for (const [name, size] of targets) await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}`);
// Maskable: add safe-zone padding on a solid background
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0b0b0f' } }).composite([{ input: inner, top: 56, left: 56 }]).png().toFile('public/icons/maskable-512.png');
console.log('icons written');
