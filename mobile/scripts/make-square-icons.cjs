/* One-off: center-crop + resize to 1024×1024 for Expo app icon / adaptive icon. */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const assetsDir = path.join(__dirname, "..", "assets");

async function squareify(filename) {
  const p = path.join(assetsDir, filename);
  if (!fs.existsSync(p)) {
    console.warn("skip missing:", filename);
    return;
  }
  const meta = await sharp(p).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) return;
  const size = Math.min(w, h);
  const left = Math.floor((w - size) / 2);
  const top = Math.floor((h - size) / 2);
  await sharp(p)
    .extract({ left, top, width: size, height: size })
    .resize(1024, 1024)
    .png()
    .toFile(p + ".tmp");
  fs.renameSync(p + ".tmp", p);
  console.log("squared:", filename, `(${w}×${h} → 1024×1024)`);
}

(async () => {
  await squareify("icon.png");
  await squareify("adaptive-icon.png");
})();
