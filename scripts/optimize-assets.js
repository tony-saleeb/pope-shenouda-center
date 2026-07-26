/**
 * scripts/optimize-assets.js
 *
 * Image optimization script backing up originals to public/_originals/
 * and re-compressing background, logos, icons, and favicons.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ORIGINALS_DIR = path.join(PUBLIC_DIR, '_originals');

// Ensure public/_originals exists
if (!fs.existsSync(ORIGINALS_DIR)) {
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
}

// Backup list of original assets
const FILES_TO_BACKUP = [
  'bg.png',
  'favicon.ico',
  'icon.png',
  'logo-shenouda.png',
  'logo-aristotle.png',
  'logo-coptic.png',
  'logo-cultural.png',
];

// Leftover SVGs to clean up
const LEFTOVER_SVGS = ['next.svg', 'vercel.svg', 'file.svg', 'globe.svg', 'window.svg'];

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  console.log('📦 Backing up original assets to public/_originals/...\n');

  for (const filename of FILES_TO_BACKUP) {
    const srcPath = path.join(PUBLIC_DIR, filename);
    const backupPath = path.join(ORIGINALS_DIR, filename);
    if (fs.existsSync(srcPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(srcPath, backupPath);
    }
  }

  const results = [];

  // 1. bg.png -> public/bg.webp (1600px wide, quality 72)
  const bgOriginalSize = fs.statSync(path.join(ORIGINALS_DIR, 'bg.png')).size;
  await sharp(path.join(ORIGINALS_DIR, 'bg.png'))
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(path.join(PUBLIC_DIR, 'bg.webp'));
  const bgNewSize = fs.statSync(path.join(PUBLIC_DIR, 'bg.webp')).size;
  results.push({ name: 'bg.webp', oldSize: bgOriginalSize, newSize: bgNewSize });

  // 2. Logos -> public/<name>.webp (2x rendered dimensions, quality 82)
  const logoConfig = [
    { srcName: 'logo-shenouda.png', outName: 'logo-shenouda.webp', width: 140, height: 140 },
    { srcName: 'logo-aristotle.png', outName: 'logo-aristotle.webp', width: 180, height: 120 },
    { srcName: 'logo-coptic.png', outName: 'logo-coptic.webp', width: 150, height: 150 },
    { srcName: 'logo-cultural.png', outName: 'logo-cultural.webp', width: 150, height: 150 },
  ];

  for (const logo of logoConfig) {
    const origPath = path.join(ORIGINALS_DIR, logo.srcName);
    const outPath = path.join(PUBLIC_DIR, logo.outName);
    const oldSize = fs.statSync(origPath).size;

    await sharp(origPath)
      .resize({ width: logo.width, height: logo.height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82 })
      .toFile(outPath);

    const newSize = fs.statSync(outPath).size;
    results.push({ name: logo.outName, oldSize, newSize });
  }

  // 3. icon.png -> public/icon.png (512x512 PNG)
  const iconOrigPath = path.join(ORIGINALS_DIR, 'icon.png');
  const iconOldSize = fs.statSync(iconOrigPath).size;
  const iconTempPath = path.join(PUBLIC_DIR, 'icon_temp.png');
  await sharp(iconOrigPath)
    .resize({ width: 512, height: 512, fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(iconTempPath);
  fs.renameSync(iconTempPath, path.join(PUBLIC_DIR, 'icon.png'));
  const iconNewSize = fs.statSync(path.join(PUBLIC_DIR, 'icon.png')).size;
  results.push({ name: 'icon.png', oldSize: iconOldSize, newSize: iconNewSize });

  // 4. favicon.ico -> public/favicon.ico (32x32)
  const favOrigPath = path.join(ORIGINALS_DIR, 'favicon.ico');
  const favOldSize = fs.statSync(favOrigPath).size;
  const favTempPath = path.join(PUBLIC_DIR, 'favicon_temp.ico');
  await sharp(favOrigPath)
    .resize({ width: 32, height: 32, fit: 'contain' })
    .png()
    .toFile(favTempPath);
  fs.renameSync(favTempPath, path.join(PUBLIC_DIR, 'favicon.ico'));
  const favNewSize = fs.statSync(path.join(PUBLIC_DIR, 'favicon.ico')).size;
  results.push({ name: 'favicon.ico', oldSize: favOldSize, newSize: favNewSize });

  // 5. Clean up leftover SVGs
  console.log('🧹 Removing unused leftover SVGs...');
  for (const svgName of LEFTOVER_SVGS) {
    const svgPath = path.join(PUBLIC_DIR, svgName);
    if (fs.existsSync(svgPath)) {
      fs.unlinkSync(svgPath);
      console.log(`   Deleted ${svgName}`);
    }
  }

  // 6. Delete old unoptimized PNGs from public root (they live in _originals now)
  const unoptimizedPngs = ['bg.png', 'logo-shenouda.png', 'logo-aristotle.png', 'logo-coptic.png', 'logo-cultural.png'];
  for (const pngName of unoptimizedPngs) {
    const p = path.join(PUBLIC_DIR, pngName);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  // Summary Table
  console.log('\n📊 Optimization Summary:\n');
  console.log(
    'File Name'.padEnd(22) +
    'Original'.padStart(12) +
    'Optimized'.padStart(12) +
    'Savings'.padStart(12) +
    'Reduction'.padStart(12)
  );
  console.log('-'.repeat(70));

  let totalOld = 0;
  let totalNew = 0;

  for (const row of results) {
    totalOld += row.oldSize;
    totalNew += row.newSize;
    const diff = row.oldSize - row.newSize;
    const pct = ((diff / row.oldSize) * 100).toFixed(1);

    console.log(
      row.name.padEnd(22) +
      formatSize(row.oldSize).padStart(12) +
      formatSize(row.newSize).padStart(12) +
      formatSize(diff).padStart(12) +
      `${pct}%`.padStart(12)
    );
  }

  const totalDiff = totalOld - totalNew;
  const totalPct = ((totalDiff / totalOld) * 100).toFixed(1);

  console.log('-'.repeat(70));
  console.log(
    'TOTAL'.padEnd(22) +
    formatSize(totalOld).padStart(12) +
    formatSize(totalNew).padStart(12) +
    formatSize(totalDiff).padStart(12) +
    `${totalPct}%`.padStart(12)
  );

  console.log('\n✨ Asset optimization completed successfully!');
}

main().catch((err) => {
  console.error('Fatal error in asset optimization:', err);
  process.exit(1);
});
