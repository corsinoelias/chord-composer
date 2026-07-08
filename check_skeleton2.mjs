import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Throttle CPU to slow down hydration so we can capture the skeleton mid-load
const client = await context.newCDPSession(page);
await client.send('Network.emulateNetworkConditions', {
  offline: false, latency: 200, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (200 * 1024) / 8,
});
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });

await page.goto('http://localhost:4322/editor/', { waitUntil: 'domcontentloaded' });
await page.screenshot({ path: 'skeleton-realistic.png' });

await page.waitForTimeout(6000);
try { await page.getByText('Skip').first().click({ timeout: 1000 }); } catch (e) {}
await page.waitForTimeout(500);
await page.screenshot({ path: 'skeleton-realistic-loaded.png', fullPage: true });

const skeletonGone = await page.evaluate(() => document.getElementById('editor-skeleton') === null);
console.log('skeleton removed after hydrate:', skeletonGone);

await browser.close();
