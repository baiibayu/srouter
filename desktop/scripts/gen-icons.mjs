// Generates the desktop icons from the brand mark
// (client/src/assets/srouter-logo.svg) via sharp — the server workspace
// dependency, hoisted to the repo root. Renders the real SVG instead of
// hand-drawn primitives so the icons always match the current brand.
//
// Outputs:
//   assets/trayTemplate.png      16x16  black-on-transparent (macOS template)
//   assets/trayTemplate@2x.png   32x32
//   assets/appicon_1024.png      full-color app icon (win/linux)
//   assets/icon.icns             macOS icon: icns container with PNG entries
//                                ic07-ic14 (ic11/ic12 cover the 16px/32px
//                                retina slots; 16px non-retina scales ic11)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(__dirname, '../assets');
const logo = path.resolve(__dirname, '../../client/src/assets/srouter-logo.svg');
fs.mkdirSync(assets, { recursive: true });

// ── app icon (1024, HIG grid: art occupies ~824/1024 rounded rect) ────────
const SIZE = 1024;
const ART = 560; // rendered logo size; visible mark lands ~500px wide
const bg = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="100" y="100" width="824" height="824" rx="180" fill="#09090b"/></svg>`
);
const mark = await sharp(logo, { density: 600 }).resize(ART, ART).png().toBuffer();
const appicon = await sharp(bg)
  .composite([{ input: mark, top: (SIZE - ART) / 2, left: (SIZE - ART) / 2 }])
  .png()
  .toBuffer();
fs.writeFileSync(path.join(assets, 'appicon_1024.png'), appicon);

// ── tray template (black on transparent; macOS tints it) ──────────────────
// The mark's alpha becomes the mask, RGB forced to black.
for (const [px, name] of [
  [16, 'trayTemplate.png'],
  [32, 'trayTemplate@2x.png'],
]) {
  const raw = await sharp(logo, { density: 600 }).resize(px, px).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 0;
    raw[i + 1] = 0;
    raw[i + 2] = 0;
  }
  await sharp(raw, { raw: { width: px, height: px, channels: 4 } })
    .png()
    .toFile(path.join(assets, name));
}

// ── macOS icon.icns: 'icns' container, each entry = type + BE length + PNG ─
const be32 = n => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const entries = [];
for (const [type, px] of [
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic13', 256],
  ['ic09', 512],
  ['ic14', 512],
  ['ic10', 1024],
]) {
  const png =
    px === SIZE ? appicon : await sharp(appicon).resize(px, px).png().toBuffer();
  entries.push(Buffer.concat([Buffer.from(type, 'ascii'), be32(png.length + 8), png]));
}
const body = Buffer.concat(entries);
fs.writeFileSync(
  path.join(assets, 'icon.icns'),
  Buffer.concat([Buffer.from('icns', 'ascii'), be32(body.length + 8), body]),
);

console.log('icons written to', assets);
