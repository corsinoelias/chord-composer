// Same scenario as phone.mjs, on the CURRENT web player (/chord-player/), measured by a tap
// worklet connected wherever the page connects to the speakers.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const ADB = 'C:/Users/Eliascorsino/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const adb = (...a) => execFileSync(ADB, ['-s', '39061FDJG0031X', ...a]).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();
await page.addInitScript(() => {
  const Base = window.AudioContext;
  const connect = AudioNode.prototype.connect;
  window.AudioContext = class extends Base {
    constructor(...args) {
      super(...args);
      window.__tapCtx = this;
      this.__tap = this.audioWorklet.addModule('/lab/app-engine/tap-worklet.js').then(() => {
        const tap = new AudioWorkletNode(this, 'tap');
        const mute = this.createGain(); mute.gain.value = 0;
        connect.call(tap, mute); connect.call(mute, this.destination);
        window.__tapNode = tap;
        return tap;
      });
    }
  };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const result = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode && this.context.__tap) this.context.__tap.then((tap) => connect.call(this, tap));
    return result;
  };
  window.__dump = () => new Promise((res) => { window.__tapNode.port.onmessage = (e) => res(e.data); window.__tapNode.port.postMessage('dump'); });
});
page.on('pageerror', (e) => log('PAGEERROR', e.message));
await page.goto('http://localhost:4322/chord-player/', { waitUntil: 'load' });
await page.bringToFront();
await wait(4000);
await page.getByRole('button', { name: 'Play', exact: true }).first().click();
await wait(3000);
log('web player playing; tap attached:', await page.evaluate(() => !!window.__tapNode));

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
  let run = 0, longest = 0; for (const r of rows) { run = r[2] < 0.02 ? run + 1 : 0; longest = Math.max(longest, run); }
  log(`${label}: DROPOUT silence ${silentMs.toFixed(0)} ms total, longest ${longestMs.toFixed(0)} ms, windows with a gap >=10ms ${dropouts} | wall ${wall.toFixed(1)} s, audio clock ${audio.toFixed(1)} s, records ${rows.length}, near-silent quarters ${silent} (longest silence ${(longest * 0.25).toFixed(2)} s), peak ${Math.min(...rows.map(r=>r[2]))}-${Math.max(...rows.map(r=>r[2]))}`);
};

const t0 = Date.now();
await wait(20000);
const t1 = Date.now();
await page.evaluate(() => { window.__jam = setInterval(() => { const u = performance.now() + 400; while (performance.now() < u) {} }, 1000); });
await wait(15000);
await page.evaluate(() => clearInterval(window.__jam));
const t2 = Date.now();
adb('shell', 'input', 'keyevent', '26');
const t3 = Date.now();
await wait(20000);
adb('shell', 'input', 'keyevent', '224');
const t4 = Date.now();
await wait(3000);
adb('shell', 'input', 'keyevent', '3');
const t5 = Date.now();
await wait(20000);
adb('shell', 'monkey', '-p', 'com.android.chrome', '-c', 'android.intent.category.LAUNCHER', '1');
const t6 = Date.now();
await wait(4000);
const h = await page.evaluate(() => window.__dump());
summary(h, t0, t1, 'normal');
summary(h, t1, t2, 'UI jammed');
summary(h, t3, t4, 'screen OFF');
summary(h, t5, t6, 'HOME (Chrome in background)');
await page.getByRole('button', { name: 'Stop', exact: true }).first().click().catch(() => {});
await page.close();
await browser.close();
