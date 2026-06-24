// Generate PWA/favicon PNGs from the Badgy mark. Run: node scripts/gen-icons.mjs
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const OUT = new URL('../public/', import.meta.url);

const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#296eeb"/><stop offset=".5" stop-color="#6cebe2"/><stop offset="1" stop-color="#34cfa9"/>
</linearGradient></defs>`;

const svg = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
  <path d="M168 266l62 62L348 196" fill="none" stroke="#fff" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const png = (markup, size) =>
  new Resvg(markup, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(new URL('icon-512.png', OUT), png(svg(0), 512));
writeFileSync(new URL('icon-192.png', OUT), png(svg(0), 192));
writeFileSync(new URL('apple-touch-icon.png', OUT), png(svg(96), 180));
writeFileSync(new URL('favicon-48.png', OUT), png(svg(96), 48));
console.log('generated icon-512, icon-192, apple-touch-icon, favicon-48');
