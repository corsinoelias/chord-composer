const { chromium } = require('playwright');
const path = require('path');

async function capture(url, outputPath, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, fullPage: false });
  await browser.close();
  console.log(`Saved: ${outputPath}`);
}

(async () => {
  const url = process.argv[2] || 'http://localhost:4321/bass-tab/';
  const screenshotsDir = path.resolve(__dirname, '../screenshots');

  await capture(url, path.join(screenshotsDir, 'bass-tab-desktop-1280x800.png'), 1280, 800);
  await capture(url, path.join(screenshotsDir, 'bass-tab-mobile-390x844.png'), 390, 844);
})();
