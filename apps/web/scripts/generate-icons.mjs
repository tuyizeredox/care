/**
 * Renders every app icon from one geometry: the favicon, the Apple touch icon
 * and the PWA manifest icons. Run `npm run icons -w @orgflow/web` after
 * changing the mark, then commit the output.
 *
 * The mark is an open ring that closes on a single node: a task's journey,
 * and the one person holding it now. The in-app <LogoMark> in
 * src/components/brand.tsx draws the same shapes; keep the two in step.
 *
 * sharp is not a dependency of this package. It ships with Next.js, so it is
 * resolved from the workspace root.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RED_LIGHT = '#D6263B';
const RED_DARK = '#9A1526';

/** Glyph on a 512 canvas. LogoMark repeats these numbers. */
const GLYPH = {
  ring: 'M341.6 160.9A128 128 0 1 0 341.6 351.1',
  strokeWidth: 56,
  node: { cx: 384, cy: 256, r: 40 },
  // The node sits outside the ring, so the ink is off-centre; this re-centres it.
  offsetX: -6,
};

function svg({ size = 512, radius = 115, glyphScale = 1 }) {
  const { ring, strokeWidth, node, offsetX } = GLYPH;
  const t = `translate(${256 + offsetX} 256) scale(${glyphScale}) translate(-256 -256)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${RED_LIGHT}"/>
      <stop offset="1" stop-color="${RED_DARK}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.2" cy="0" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${radius}" fill="url(#sheen)"/>
  <g transform="${t}" fill="none">
    <path d="${ring}" stroke="#fff" stroke-width="${strokeWidth}" stroke-linecap="round"/>
    <circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="#fff"/>
  </g>
</svg>
`;
}

const png = (source, size) =>
  sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** An .ico that wraps PNG frames, which every current browser reads. */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
}

async function write(relative, data) {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log('  wrote', relative);
}

// Rounded tile for browser tabs, desktop shortcuts and the install dialog.
const tile = svg({});
// Full bleed for "maskable": the platform cuts its own shape, and the glyph
// must sit inside the central 80% safe zone.
const bleed = svg({ radius: 0, glyphScale: 0.84 });
// Small sizes get a bolder glyph so the ring and node stay separate at 16px.
const small = svg({ radius: 104, glyphScale: 1.1 });

await write('src/app/icon.svg', tile);
await write('src/app/apple-icon.png', await png(svg({ radius: 0, glyphScale: 0.9 }), 180));
await write(
  'src/app/favicon.ico',
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(small, size) })))),
);
await write('public/icons/icon-192.png', await png(tile, 192));
await write('public/icons/icon-512.png', await png(tile, 512));
await write('public/icons/maskable-192.png', await png(bleed, 192));
await write('public/icons/maskable-512.png', await png(bleed, 512));
