import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(process.argv[2] || 'http://localhost:9222');
const page = await browser.contexts()[0].newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${process.argv[3] || 'http://localhost:4322'}/lab/app-engine/`, { waitUntil: 'load' });
const result = await page.evaluate(async () => {
  const get = (u) => fetch(`/lab/app-engine/${u}`).then((r) => r.arrayBuffer());
  const run = async (style) => {
    const [wasm, sf2, ...d] = await Promise.all([get('engine.wasm'), get('core.sf2'),
      ...['kick', 'snare', 'stick', 'hat', 'hatopen', 'crash'].map((n) => get(`drums/${n}.pcm`).then((b) => [n, b]))]);
    const w = new Worker('/lab/app-engine/bench-worker.js');
    const r = await new Promise((res) => { w.onmessage = (ev) => res(ev.data); w.postMessage({ wasm, sf2, drums: Object.fromEntries(d), seconds: 30, style }); });
    w.terminate();
    return r;
  };
  return { ua: navigator.userAgent, cores: navigator.hardwareConcurrency, pop: await run(0), reggaeton: await run(1) };
});
const f = (r) => `x${r.realtimeX.toFixed(1)} realtime | mean ${r.meanMs.toFixed(3)} ms | p50 ${r.p50Ms.toFixed(3)} | p99 ${r.p99Ms.toFixed(3)} | p99.9 ${r.p999Ms.toFixed(3)} | max ${r.maxMs.toFixed(2)} | >50% budget ${r.over50pct} | >budget ${r.overBudget} of ${Math.round(r.seconds*375)} (budget ${r.budgetMs.toFixed(2)} ms, timer res ${r.timerResolutionMs.toFixed(3)})`;
console.log('cores', result.cores);
console.log('pop      ', f(result.pop));
console.log('reggaeton', f(result.reggaeton));
await page.close();
await browser.close();
