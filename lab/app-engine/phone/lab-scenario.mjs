// Drives Chrome on the connected phone over CDP and measures the app engine lab.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const ADB = 'C:/Users/Eliascorsino/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const adb = (...a) => execFileSync(ADB, ['-s', '39061FDJG0031X', ...a]).toString().trim();
const out = process.argv[2];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log('CONSOLE', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', (e) => log('PAGEERROR', e.message));
await page.goto('http://localhost:4322/lab/app-engine/', { waitUntil: 'load' });
// The dev toolbar floats over the page's lower buttons under `astro dev`.
await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
await page.bringToFront();
await page.click('#load');
await page.waitForSelector('#player:not([hidden])', { timeout: 60000 });
log('loaded:', 'startup', await page.textContent('#startup'), '| rate', await page.textContent('#rate'), '| latency', await page.textContent('#latency'), '| error:', (await page.textContent('#error')).trim() || 'none');

const summary = (h, from, to, label) => {
  const rows = h.filter((r) => r[0] >= from && r[0] <= to);
  if (rows.length < 2) return log(label, 'no records', rows.length);
  const wall = (rows.at(-1)[0] - rows[0][0]) / 1000;
  const audio = rows.at(-1)[1] - rows[0][1];
  let maxGap = 0; for (let i = 1; i < rows.length; i++) maxGap = Math.max(maxGap, rows[i][0] - rows[i - 1][0]);
  const silent = rows.filter((r) => r[2] < 0.02).length;
  const silentMs = rows.reduce((a, r) => a + (r[4] || 0), 0) * 128 / 48;
  const longestMs = Math.max(...rows.map((r) => r[5] || 0)) * 128 / 48;
  const dropouts = rows.filter((r) => (r[5] || 0) >= 4).length;
  const bars = new Set(rows.map((r) => `${(r[3] >> 16) & 0xff}.${(r[3] >> 13) & 7}.${(r[3] >> 24) & 0xf}`)).size;
  log(`${label}: DROPOUT silence ${silentMs.toFixed(0)} ms total, longest ${longestMs.toFixed(0)} ms, windows with a gap >=10ms ${dropouts} | wall ${wall.toFixed(1)} s, audio clock ${audio.toFixed(1)} s, records ${rows.length}, longest gap ${maxGap} ms, near-silent quarters ${silent}, distinct bars ${bars}, peak range ${Math.min(...rows.map(r=>r[2]))}-${Math.max(...rows.map(r=>r[2]))}`);
};

await page.click('#measure');
await wait(1500);
log('engine load (measured on the audio thread):', await page.textContent('#loadPct'));
await page.click('#play');
const t0 = Date.now();
await wait(20000);
log('20 s playing: drops', await page.textContent('#drops'), '|', await page.textContent('#where'));
await page.screenshot({ path: `${out}/phone-playing.png` });

// Main thread jammed 400 ms of every second.
await page.click('#stress');
const t1 = Date.now();
await wait(15000);
await page.click('#stress');
const t2 = Date.now();
log('after stress: drops', await page.textContent('#drops'));

// Screen off for 20 s.
adb('shell', 'input', 'keyevent', '26');
const t3 = Date.now();
await wait(20000);
adb('shell', 'input', 'keyevent', '224'); // wake
const t4 = Date.now();
await wait(3000);
log('screen state after wake:', adb('shell', 'dumpsys', 'power').split('\n').find((l) => l.includes('mWakefulness=')).trim());

// Home screen for 20 s, then back to Chrome.
adb('shell', 'input', 'keyevent', '3');
const t5 = Date.now();
await wait(20000);
adb('shell', 'monkey', '-p', 'com.android.chrome', '-c', 'android.intent.category.LAUNCHER', '1');
const t6 = Date.now();
await wait(4000);

const history = await page.evaluate(() => window.__lab.dump());
summary(history, t0, t1, 'normal');
summary(history, t1, t2, 'UI jammed');
summary(history, t3, t4, 'screen OFF');
summary(history, t5, t6, 'HOME (Chrome in background)');
log('final: drops', await page.textContent('#drops'));
await page.screenshot({ path: `${out}/phone-after.png` });
await page.click('#play'); // stop
await wait(500);
await page.close();
await browser.close();
