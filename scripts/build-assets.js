// Copies local fonts and builds the icon sprite. Output is committed,
// so this only needs to run when the icon list or fonts change.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'src/public/assets');

const ICONS = [
  'menu', 'heart-pulse', 'layout-dashboard', 'calendar-days', 'stethoscope',
  'users', 'user-round', 'tags', 'settings', 'clock', 'plus', 'log-out',
  'circle-user', 'calendar-plus', 'shield-check', 'arrow-up-right', 'calendar-heart',
  'lock-keyhole', 'heart-handshake', 'clock-3', 'chevron-left', 'chevron-right',
  'x', 'pencil', 'trash-2', 'circle-check', 'circle-alert', 'info', 'calendar-check',
];
const FONT_WEIGHTS = [400, 500, 600];

function buildSprite() {
  const symbols = ICONS.map((name) => {
    const svg = fs.readFileSync(path.join(root, 'node_modules/lucide-static/icons', `${name}.svg`), 'utf8');
    const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<!--[\s\S]*?-->/g, '').trim();
    return `<symbol id="${name}" viewBox="0 0 24 24">${inner}</symbol>`;
  });
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
  fs.writeFileSync(path.join(assets, 'icons.svg'), sprite);
}

function copyFonts() {
  const src = path.join(root, 'node_modules/@fontsource/ibm-plex-sans/files');
  const dest = path.join(assets, 'fonts');
  for (const w of FONT_WEIGHTS) {
    const file = `ibm-plex-sans-latin-${w}-normal.woff2`;
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}

buildSprite();
copyFonts();
console.log(`Sprite: ${ICONS.length} icons, fonts: ${FONT_WEIGHTS.join(', ')}`);
