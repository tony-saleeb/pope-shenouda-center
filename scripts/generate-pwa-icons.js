/**
 * Regenerate PWA / favicon assets from logo-shenouda.png on a solid black canvas.
 * Run: node scripts/generate-pwa-icons.js
 */
const sharp = require('sharp');
const path = require('path');

const LOGO = path.join(__dirname, '..', 'public', 'logo-shenouda.png');
const BLACK = '#000000';

async function writeIcon(size, dest) {
  await sharp(LOGO)
    .resize(size, size, { fit: 'contain', background: BLACK })
    .flatten({ background: BLACK })
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

(async () => {
  await writeIcon(512, path.join(__dirname, '..', 'public', 'icon.png'));
  await writeIcon(180, path.join(__dirname, '..', 'public', 'apple-icon.png'));
  console.log('PWA icons written (black background, no transparency)');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
