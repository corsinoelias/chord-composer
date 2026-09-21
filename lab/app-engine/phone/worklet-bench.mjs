import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = await browser.contexts()[0].newPage();
await page.goto('http://localhost:4322/lab/app-engine/', { waitUntil: 'load' });
await page.bringToFront();
await page.click('#load');
await page.waitForSelector('#player:not([hidden])', { timeout: 60000 });
const bench = (blocks) => page.evaluate((blocks) => new Promise((resolve) => {
  const node = window.__lab.node; const prev = node.port.onmessage;
  node.port.onmessage = (ev) => { if (ev.data.type === 'bench') { node.port.onmessage = prev; resolve(ev.data); } else prev && prev(ev); };
  node.port.postMessage({ type: 'bench', blocks });
}), blocks);
for (let i = 0; i < 3; i++) {
  const r = await bench(3000);
  console.log(`worklet thread: ${r.blocks} blocks in ${r.ms.toFixed(1)} ms -> ${r.perBlockMs.toFixed(3)} ms/block = ${(r.perBlockMs / 2.6667 * 100).toFixed(1)} % of budget (performance.now in worklet: ${r.hasPerf})`);
}
await page.close(); await browser.close();
