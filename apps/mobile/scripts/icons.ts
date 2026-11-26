// pnpm --filter @feedr/mobile icons: draws the app icon for every palette and points app.json at
// the files. Run it after adding a palette or changing a palette's colours, and commit the result.
//
// The mark is a block "F" with a square tucked under its middle arm, drawn in the palette's accent
// on its background. iOS shows the light or dark file to match the Home Screen, and a grey one when
// icons are tinted. The default palette's icon is the primary icon; the others are alternate icons
// that appearance.tsx switches to when someone picks that palette.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { defaultPalette, paletteNames, palettes, type PaletteName } from '../src/palettes.ts';

const root = resolve(import.meta.dirname, '..');
const size = 1024;

/** The mark's rectangles on the 1024 grid: [x, y, width, height]. Verticals are 108, horizontals 98. */
const mark = [
  [299, 269, 108, 486], // stem
  [299, 269, 352, 98], // top arm
  [299, 457, 314, 98], // middle arm
  [616, 647, 108, 108], // square, level with the foot of the stem
] as const;

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** An opaque 1024×1024 PNG of the mark. iOS rejects icons with an alpha channel, so it's RGB only. */
function png(background: string, ink: string): Buffer {
  const [bg, fg] = [rgb(background), rgb(ink)];
  const row = size * 3 + 1; // each row starts with a filter byte of 0
  const pixels = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = mark.some(([mx, my, w, h]) => x >= mx && x < mx + w && y >= my && y < my + h);
      pixels.set(on ? fg : bg, y * row + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(file: string, data: Buffer) {
  writeFileSync(resolve(root, file), data);
  console.log(`Wrote ${file}`);
}

// iOS greys the tinted icon and colours it itself, so one white-on-black file serves every palette.
const tinted = './assets/icons/tinted.png';
write(tinted, png('#000000', '#ffffff'));

/** Draws a palette's light and dark icons and returns the trio iOS needs. */
function draw(name: PaletteName) {
  const light = `./assets/icons/${name.toLowerCase()}-light.png`;
  const dark = `./assets/icons/${name.toLowerCase()}-dark.png`;
  // `accent`, not `accentFill`: the mark is read like text, and Yolk's yellow fill vanishes on white.
  write(light, png(palettes[name].light.bg, palettes[name].light.accent));
  write(dark, png(palettes[name].dark.bg, palettes[name].dark.accent));
  return { light, dark, tinted };
}

const primary = draw(defaultPalette);
const alternates = paletteNames.filter((name) => name !== defaultPalette).map((name) => ({ name, ios: draw(name) }));

const appJson = resolve(root, 'app.json');
const app = JSON.parse(readFileSync(appJson, 'utf8'));
app.expo.icon = primary.light; // web and anything that doesn't take variants
app.expo.ios.icon = primary;
const plugins: unknown[] = app.expo.plugins.filter(
  (plugin: unknown) => !(Array.isArray(plugin) && plugin[0] === 'expo-alternate-app-icons'),
);
app.expo.plugins = [...plugins, ['expo-alternate-app-icons', alternates]];
writeFileSync(appJson, `${JSON.stringify(app, null, 2)}\n`);
console.log('Updated app.json');
