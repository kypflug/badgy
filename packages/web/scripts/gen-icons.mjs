// Generate PWA/favicon PNGs from the Badgy mark. Run: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const OUT = new URL('../public/', import.meta.url);
const SOURCE = new URL('../public/favicon.svg', import.meta.url);
const svg = readFileSync(SOURCE, 'utf8');
const match = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);

if (!match) throw new Error('favicon.svg needs a 0 0 width height viewBox');

const size = Number(match[1]);
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const safeInset = size * 0.09375;
const safeScale = (size - safeInset * 2) / size;

const wrap = (pad = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><g transform="translate(${pad} ${pad}) scale(${pad ? safeScale : 1})">${inner}</g></svg>`;

const png = (markup, outputSize) =>
  new Resvg(markup, { fitTo: { mode: 'width', value: outputSize } }).render().asPng();

writeFileSync(new URL('favicon-48.png', OUT), png(wrap(), 48));
writeFileSync(new URL('apple-touch-icon.png', OUT), png(wrap(), 180));
writeFileSync(new URL('icon-192.png', OUT), png(wrap(safeInset), 192));
writeFileSync(new URL('icon-512.png', OUT), png(wrap(safeInset), 512));
console.log('generated favicon-48, apple-touch-icon, icon-192, icon-512');
