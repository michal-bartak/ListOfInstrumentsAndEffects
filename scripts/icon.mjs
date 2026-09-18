// Render every icon output from the one master, ../icon/icon.svg.
//
// Nothing here is authored by hand except the master: the README mark is a resize and the REAPER
// toolbar icons are three tinted copies composited side by side. Edit the SVG, run
// `npm install && npm run icon`, commit what changes.
//
// This mirrors docs/scripts/icon.mjs in the AutoColor repo, minus the favicon and docs-logo
// outputs, which this repo has no site to serve. If a third script ever needs the same thing,
// lift it somewhere shared rather than copying it again.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MASTER = join(REPO, 'icon', 'icon.svg');

// REAPER toolbar icons are a 3-state horizontal strip of square cells. Measuring the strips REAPER
// ships in Data/toolbar_icons gives what the cells mean:
//
//   cell 1  normal
//   cell 2  the same art, ~14% lighter -- hover
//   cell 3  drawn while the button is held, or while a TOGGLE action is armed
//
// This script is a one-shot action, not a toggle, so cell 3 is only ever a click flash: the mark
// keeps its colours throughout and merely brightens. (AutoColor's AutoToggle is the other case --
// there cell 1 is greyed out and the colour is what says "running".)
const HOVER_LIFT = 18; // REAPER's own step, #818989 -> #939A9A: additive, not a ratio

// Hi-DPI is a subdirectory with the SAME filename, not a suffix: Data/toolbar_icons/150/x.png.
// Cell size 30 is the 1x; REAPER ships 45 (150) and 60 (200).
const TOOLBAR_CELLS = [
  { dir: '', cell: 30 },
  { dir: '150', cell: 45 },
  { dir: '200', cell: 60 },
];

// REAPER's own icons do not fill their cell: the median margin across the shipped ones is ~3.5px
// on a 30px cell. The master is drawn full-bleed so the README mark gets the whole box; the inset
// is added here, where it is wanted, by rendering the art smaller and padding back out.
const TOOLBAR_MARGIN = 3.5 / 30;

// Reaper/ mirrors REAPER's resource path, so the @provides lines in the script header can drop
// these straight into Data/toolbar_icons/ at install time and nobody copies anything by hand.
// The mxm_ prefix keeps them clear of the 500-odd icons REAPER ships in that same folder.
const TOOLBAR_DIR = join(REPO, 'Reaper', 'Data', 'toolbar_icons');
const TOOLBAR_NAME = 'mxm_toolbar_list_of_instruments_and_effects.png';

/** Map every stroke and fill colour in the SVG through `fn`. */
function recolour(svg, fn) {
  return svg.replace(
    /(stroke|fill)="(#[0-9A-Fa-f]{6})"/g,
    (_, attr, hex) => `${attr}="${fn(hex)}"`,
  );
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.min(255, v + amount));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const STATES = [
  (svg) => svg,
  (svg) => recolour(svg, (hex) => lighten(hex, HOVER_LIFT)),
  (svg) => recolour(svg, (hex) => lighten(hex, HOVER_LIFT * 2)),
];

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  console.log('  ' + path.replace(REPO + '/', ''));
}

const master = await readFile(MASTER, 'utf8');
console.log('Rendering from ' + MASTER.replace(REPO + '/', ''));

// 1. The README mark. A PNG, not the SVG: GitHub's markdown sanitiser is fussier about SVG.
await write(
  join(REPO, 'icon', 'instruments-effects-128.png'),
  await sharp(Buffer.from(master)).resize(128, 128).png().toBuffer(),
);

// 2. The REAPER toolbar strips, at every resolution.
for (const { dir, cell } of TOOLBAR_CELLS) {
  const margin = Math.round(cell * TOOLBAR_MARGIN);
  const box = cell - margin * 2;
  const cells = await Promise.all(
    STATES.map((state) =>
      sharp(Buffer.from(state(master)))
        .resize(box, box)
        .extend({
          top: margin,
          bottom: margin,
          left: margin,
          right: margin,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ),
  );
  const strip = await sharp({
    create: { width: cell * 3, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells.map((input, i) => ({ input, left: i * cell, top: 0 })))
    .png()
    .toBuffer();

  await write(join(TOOLBAR_DIR, dir, TOOLBAR_NAME), strip);
}
