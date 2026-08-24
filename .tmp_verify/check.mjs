import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', msg => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

await page.goto('http://localhost:4324/piano/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.vp-keyboard-frame', { timeout: 15000 });
await page.waitForTimeout(1000); // let hydration/animations settle

// 1. Octave label
const octaveText = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('span'));
  const el = spans.find(s => s.textContent && s.textContent.startsWith('Octave'));
  return el ? el.textContent : null;
});
console.log('OCTAVE_LABEL:', octaveText);

await page.screenshot({ path: '.tmp_verify/01_desktop.png' });

// find a white key and a black key
const keyInfo = await page.evaluate(() => {
  const container = document.querySelector('.vp-keyboard-frame > div');
  if (!container) return null;
  const children = Array.from(container.children);
  const white = children.find(el => el.style.position !== 'absolute');
  const black = children.find(el => el.style.position === 'absolute');
  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height * 0.75, w: r.width, h: r.height }; };
  return { white: white ? rectOf(white) : null, black: black ? rectOf(black) : null, count: children.length };
});
console.log('KEY_INFO:', JSON.stringify(keyInfo));

if (keyInfo && keyInfo.white) {
  await page.mouse.move(keyInfo.white.x, keyInfo.white.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.screenshot({ path: '.tmp_verify/02_white_key_held.png' });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.tmp_verify/03_white_key_released.png' });
}

if (keyInfo && keyInfo.black) {
  await page.mouse.move(keyInfo.black.x, keyInfo.black.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.screenshot({ path: '.tmp_verify/04_black_key_held.png' });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// 3. Songs panel -> play a song -> check for doubled artifacts
await page.click('button[title="Songs"]');
await page.waitForTimeout(300);
const playBtn = await page.locator('button:has-text("Play")').first();
if (await playBtn.count()) {
  await playBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '.tmp_verify/05_song_playing.png' });
}

console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
await browser.close();
