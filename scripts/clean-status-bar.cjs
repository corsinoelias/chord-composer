// Tidies the status bar of a raw capture from the Pixel 8 Pro (1008x2244), whose SystemUI
// demo mode leaves the notification icons, the VPN key, vibrate and do-not-disturb in
// place, and shows the wifi with the "no internet" mark. Keeps the clock and the battery,
// paints the rest with the bar's own colour and draws a full wifi, lifted from the 1.1.0
// captures (status-bar-wifi.png), at the same gap from the battery it had there.
//
//   node scripts/clean-status-bar.cjs in.png out.png
const sharp = require('sharp');
const path = require('node:path');

const [, , src, dst] = process.argv;

(async () => {
  // The wifi as coverage: 0 on the bar, 1 where the icon is black.
  const wifi = await sharp(path.join(__dirname, 'status-bar-wifi.png')).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const W = wifi.info;
  const barBg = wifi.data[0];
  const cover = Array.from(wifi.data, (v) => Math.max(0, Math.min(1, (barBg - v) / barBg)));

  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => (y * info.width + x) * info.channels;
  // Between the icons, where the bar is only itself (dimmed, under a sheet).
  const bg = Array.from(data.subarray(px(500, 20), px(500, 20) + 3));
  const paint = (x0, x1, y0, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = px(x, y);
      for (let c = 0; c < 3; c++) data[i + c] = bg[c];
    }
  };
  paint(180, 420, 10, 110); // notification icons after the clock
  paint(580, 840, 10, 110); // VPN key, vibrate, do-not-disturb and the wifi
  // Icons stay black over a dimmed bar, so only the bar colour needs blending.
  const left = 778, top = 35;
  for (let y = 0; y < W.height; y++) for (let x = 0; x < W.width; x++) {
    const a = cover[y * W.width + x];
    if (!a) continue;
    const i = px(left + x, top + y);
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(bg[c] * (1 - a));
  }
  await sharp(data, { raw: info }).png().toFile(dst);
})();
