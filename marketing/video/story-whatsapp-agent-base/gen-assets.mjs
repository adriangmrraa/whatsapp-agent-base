/**
 * Generates the PNG assets for this composition with sharp.
 * Mascot marks follow the pipeline narrative:
 *   m1 chat · m2 tenants · m3 providers · m4 AI · m5 done
 * Run from the repo root or this folder:
 *   node marketing/video/story-whatsapp-agent-base/gen-assets.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const imgDir = path.join(here, 'assets', 'img');
fs.mkdirSync(imgDir, { recursive: true });

const INK = '#0F1217';
const PANEL = '#151A21';
const GREEN = '#25D366';
const SOL = '#F7D116';
const PAPER = '#F5F3EE';

// Rounded-square badge with a glyph in the middle.
const badge = (glyph, accent = GREEN, size = 720) => {
  const r = Math.round(size * 0.22);
  const g = size * 0.16;
  const s = size - g * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect x="${g}" y="${g}" width="${s}" height="${s}" rx="${r}" fill="${PANEL}" stroke="${accent}" stroke-width="14"/>
    ${glyph}
  </svg>`;
};

const glyphs = {
  // chat bubble + lines
  chat: `<g transform="translate(190 210)">
      <rect x="0" y="0" width="340" height="220" rx="52" fill="${GREEN}"/>
      <path d="M80 220 l-26 74 96 -74" fill="${GREEN}"/>
      <path d="M66 66 h208 M66 122 h140" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
    </g>`,
  // tenant layers
  tenants: `<g transform="translate(160 190)">
      <rect x="0" y="0" width="400" height="120" rx="26" fill="none" stroke="${SOL}" stroke-width="14"/>
      <rect x="0" y="110" width="400" height="120" rx="26" fill="none" stroke="${SOL}" stroke-width="14"/>
      <rect x="0" y="220" width="400" height="120" rx="26" fill="${SOL}"/>
      <circle cx="60" cy="60" r="20" fill="${SOL}"/>
      <circle cx="60" cy="170" r="20" fill="${SOL}"/>
      <circle cx="60" cy="280" r="20" fill="${INK}"/>
    </g>`,
  // plug / link between two nodes
  providers: `<g transform="translate(160 230)">
      <circle cx="70" cy="130" r="66" fill="none" stroke="${GREEN}" stroke-width="16"/>
      <circle cx="330" cy="130" r="66" fill="${GREEN}"/>
      <path d="M140 130 h120" stroke="${GREEN}" stroke-width="22" stroke-linecap="round"/>
      <path d="M70 88 v84 M70 88 h-0" stroke="${GREEN}" stroke-width="0"/>
    </g>`,
  // lightning bolt
  bolt: `<path d="M395 130 L235 400 h95 L265 590 L495 300 h-105 L485 130 z" fill="${SOL}"/>`,
  // check
  done: `<path d="M190 380 L310 500 L545 245" fill="none" stroke="${GREEN}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>`,
};

// message bubble that walks the route (inbound → reply)
const walker = `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="230" viewBox="0 0 184 230">
  <rect x="12" y="8" width="160" height="150" rx="42" fill="${GREEN}"/>
  <path d="M58 158 l-16 62 62 -62" fill="${GREEN}"/>
  <path d="M44 64 h96 M44 104 h62" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
</svg>`;

// floating card: `</>` api mark (amber on panel)
const floatApi = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect x="18" y="18" width="264" height="264" rx="48" fill="${PANEL}" stroke="${SOL}" stroke-width="8"/>
  <path d="M110 105 L70 150 l40 45 M190 105 l40 45 -40 45 M165 95 l-30 110" fill="none" stroke="${SOL}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// floating card: lock (green on panel)
const floatLock = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect x="18" y="18" width="264" height="264" rx="48" fill="${PANEL}" stroke="${GREEN}" stroke-width="8"/>
  <rect x="92" y="132" width="116" height="96" rx="18" fill="${GREEN}"/>
  <path d="M110 132 v-22 a40 40 0 0 1 80 0 v22" fill="none" stroke="${GREEN}" stroke-width="14"/>
  <circle cx="150" cy="180" r="12" fill="${INK}"/>
</svg>`;

const jobs = [
  ['m1.png', badge(glyphs.chat, GREEN)],
  ['m2.png', badge(glyphs.tenants, SOL)],
  ['m3.png', badge(glyphs.providers, GREEN)],
  ['m4.png', badge(glyphs.bolt, SOL)],
  ['m5.png', badge(glyphs.done, GREEN)],
  ['walker.png', walker],
  ['float-api.png', floatApi],
  ['float-lock.png', floatLock],
];

for (const [name, svg] of jobs) {
  const out = path.join(imgDir, name);
  await sharp(Buffer.from(svg), { density: 300 }).png().toFile(out);
  console.log(`✓ ${name}`);
}
console.log('done');
