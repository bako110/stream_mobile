const sharp = require('sharp');
const path  = require('path');

const SRC  = path.resolve(__dirname, '../src/assets/images/stream_logo_light.png');
const BASE = path.resolve(__dirname, '../android/app/src/main/res');

const DENSITIES = [
  { dir: 'mipmap-mdpi',    icon: 48,  fg: 108 },
  { dir: 'mipmap-hdpi',    icon: 72,  fg: 162 },
  { dir: 'mipmap-xhdpi',   icon: 96,  fg: 216 },
  { dir: 'mipmap-xxhdpi',  icon: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', icon: 192, fg: 432 },
];

async function run() {
  for (const { dir, icon, fg } of DENSITIES) {
    const outDir = path.join(BASE, dir);

    // ic_launcher.png & ic_launcher_round.png
    await sharp(SRC).resize(icon, icon).toFile(path.join(outDir, 'ic_launcher.png'));
    await sharp(SRC).resize(icon, icon).toFile(path.join(outDir, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png — logo centré avec padding transparent (66% de la taille)
    const logoSize  = Math.round(fg * 0.66);
    const pad       = Math.round((fg - logoSize) / 2);
    const resized   = await sharp(SRC).resize(logoSize, logoSize).toBuffer();

    await sharp({
      create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: resized, top: pad, left: pad }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));

    console.log(`${dir}: icon=${icon}px  foreground=${fg}px ✓`);
  }
  console.log('\nTous les icônes générés !');
}

run().catch(err => { console.error(err); process.exit(1); });
