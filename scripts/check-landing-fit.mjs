#!/usr/bin/env node
/**
 * Checks that /chord-player-app/ reads one screen at a time: every block marked data-fit is
 * at most one screen tall (the viewport minus the sticky navbar, and below 1024px minus the
 * sticky install bar wherever it can show) at every size below, and
 * data-fit-lg the same from 1024px up. It also checks that the hero's Play badge is on the
 * first screen, that nothing is wider than the page, and — with the use tabs showing, from
 * 768px — that each of the six panels fits, not only the first.
 *
 * Needs a running server (npm run dev, or a preview of the build) and Playwright's Chromium.
 *
 *   npm run check:landing-fit
 *   node scripts/check-landing-fit.mjs --url http://localhost:4321/chord-player-app/
 */
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const at = argv.indexOf('--url');
const url = at >= 0 ? argv[at + 1] : 'http://localhost:4321/chord-player-app/';

// The usual screens, from the smallest common Android phone to a full-HD desktop. More can be
// added for one run: --viewports 375x667,1536x864
const VIEWPORTS = [
  [360, 740], [375, 667], [390, 844], [412, 915], [768, 1024], [1024, 768], [1280, 720], [1366, 768],
  [1440, 900], [1920, 1080],
];
const extra = argv.indexOf('--viewports');
if (extra >= 0) VIEWPORTS.push(...argv[extra + 1].split(',').map((v) => v.split('x').map(Number)));

const browser = await chromium
  .launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

// Phones are measured as the phone they are: the install bar only shows on Android, so a
// 375px-wide screen is measured as an iPhone and the other phone widths as Android.
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const agentFor = (width) => (width === 375 ? IPHONE : width < 1024 ? ANDROID : undefined);

for (const [width, height] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width, height }, userAgent: agentFor(width) });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
  await page.evaluate(() => document.fonts.ready);

  const measure = () => page.evaluate(() => {
    const nav = Math.round(document.querySelector('header')?.getBoundingClientRect().height ?? 0);
    const label = (el) => el.id || el.closest('[id]')?.id || el.className.toString().split(' ').slice(0, 3).join('.');
    const shown = (el) => el.getClientRects().length > 0;
    // Below 1024px the sticky install bar covers the bottom of the screen everywhere but in
    // the hero (before the badge scrolls away) and at the closing call to action (where it
    // hides): every other block has to fit above it.
    const bar = document.querySelector('[data-sticky-cta]');
    const barCost = bar && getComputedStyle(bar).display !== 'none'
      ? Math.round(bar.getBoundingClientRect().height + parseFloat(getComputedStyle(bar).bottom))
      : 0;
    const covered = (el) => barCost && !el.closest('[data-hero]') && !el.closest('[data-end-cta]');
    const blocks = [...document.querySelectorAll('[data-fit]')].filter(shown)
      .map((el) => ({ what: label(el), h: Math.round(el.getBoundingClientRect().height), room: innerHeight - nav - (covered(el) ? barCost : 0) }));
    const lgBlocks = innerWidth >= 1024
      ? [...document.querySelectorAll('[data-fit-lg]')].filter(shown).map((el) => ({ what: `${label(el)} (lg)`, h: Math.round(el.getBoundingClientRect().height), room: innerHeight - nav }))
      : [];
    const cta = document.querySelector('[data-hero-cta]').getBoundingClientRect();
    // Wider than the page, outside anything that scrolls or clips sideways on purpose.
    const wide = [...document.querySelectorAll('main *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= innerWidth + 1 || !shown(el)) return false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false;
      }
      return true;
    }).map(label);
    return { nav, barCost, usable: innerHeight - nav, blocks: [...blocks, ...lgBlocks], ctaBottom: Math.round(cta.bottom), wide: [...new Set(wide)].slice(0, 5) };
  });

  const m = await measure();
  console.log(`\n${width}x${height}${width === 375 ? ' (iPhone)' : width < 1024 ? ' (Android)' : ''}  screen ${m.usable}px under a ${m.nav}px navbar${m.barCost ? `, ${m.barCost}px install bar` : ''}`);
  for (const b of m.blocks) {
    const ok = b.h <= b.room + 1;
    console.log(`  ${ok ? '✓' : '✗'} ${b.what.padEnd(28)} ${String(b.h).padStart(5)}px of ${b.room}`);
    if (!ok) failures++;
  }
  if (m.ctaBottom > height) fail(`hero Play badge ends at ${m.ctaBottom}px, below the first screen (${height}px)`);
  else console.log(`  ✓ hero Play badge on the first screen (ends at ${m.ctaBottom}px)`);
  if (m.wide.length) fail(`wider than the page: ${m.wide.join(', ')}`);

  // With tabs (768px and up) only one panel shows: open each and measure the section again.
  if (width >= 768) {
    const ids = await page.$$eval('[data-use-tab]', (tabs) => tabs.map((t) => t.dataset.useTab));
    for (const id of ids) {
      await page.click(`[data-use-tab="${id}"]`);
      const h = await page.$eval('#made-for', (el) => Math.round(el.getBoundingClientRect().height));
      const ok = h <= m.usable - m.barCost + 1;
      if (!ok) failures++;
      console.log(`  ${ok ? '✓' : '✗'} made-for with ${id.padEnd(15)} ${String(h).padStart(5)}px`);
    }
  }
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nEvery block fits its screen.');
process.exit(failures ? 1 : 0);
