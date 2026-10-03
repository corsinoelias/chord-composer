#!/usr/bin/env node
/**
 * Checks the settings panel the way a person uses it, on a phone and on a wide screen.
 *
 *   npm run dev
 *   node scripts/check-settings.mjs [http://localhost:4321]
 *
 * Needs Chromium (playwright). Exits 1 when a check fails. It checks that:
 *   - Settings opens from ⋮ (a full-screen page on a phone, a dialog on a wide screen) and nothing
 *     runs off the side;
 *   - every control writes the key it has always written, and the page reads it back after a reload;
 *   - a long press on the Click capsule, and its caret, open the metronome sheet without flipping
 *     the switch, and "All settings" goes on to the page;
 *   - Play counts in unless Count-in is off, in which case it starts at once;
 *   - with a song playing, changing any setting sends the engine live commands only: never the song
 *     again, never a release — the opening of the rhythm editor once did, and the audio cut.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` — ${detail}`}`);
};
const store = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const json = async (page, key) => JSON.parse((await store(page, key)) ?? 'null');

async function open(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  // The dev server's own toolbar sits over the bottom of the page and takes the clicks.
  await page.addInitScript(() => {
    const hide = () => { const s = document.createElement('style'); s.textContent = 'astro-dev-toolbar{display:none!important}'; document.documentElement.appendChild(s); };
    if (document.documentElement) hide(); else document.addEventListener('DOMContentLoaded', hide);
  });
  await page.goto(`${base}/editor/`, { waitUntil: 'load', timeout: 120000 });
  await page.getByRole('button', { name: 'More' }).first().waitFor({ timeout: 60000 });
  return { context, page };
}
async function openSettings(page) {
  await page.getByRole('button', { name: 'More' }).first().click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Chord symbols', { exact: true }).waitFor();
  return dialog;
}
const overflowX = (page) => page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  return d ? d.scrollWidth - d.clientWidth : -1;
});

// ── Wide screen ──
{
  const { context, page } = await open({ width: 1280, height: 800 }, false);
  await page.getByRole('button', { name: 'More' }).first().click();
  check(await page.getByText('Chord symbols', { exact: true }).count() === 0, 'the ⋮ menu no longer holds the chord symbols');
  await page.keyboard.press('Escape');
  const dialog = await openSettings(page);
  const box = await dialog.boundingBox();
  check(box && box.width <= 641 && box.width > 400, 'wide: Settings is a dialog of at most 640 px', `width ${box?.width}`);
  check(await overflowX(page) <= 0, 'wide: nothing runs off the side');
  await context.close();
}

// ── Phone ──
{
  const { context, page } = await open({ width: 390, height: 844 }, true);
  let dialog = await openSettings(page);
  const box = await dialog.boundingBox();
  check(box && box.width === 390 && box.height === 844, 'phone: Settings fills the screen', JSON.stringify(box));
  check(await overflowX(page) <= 0, 'phone: nothing runs off the side');
  for (const name of ['Playback', 'Metronome']) check(await dialog.getByText(name, { exact: true }).count() > 0, `phone: "${name}" group is there`);
  check(await dialog.getByText(/Chord Sequencer \d/).count() === 0, 'phone: no app version line');

  // Each control writes what it always wrote.
  await dialog.getByRole('button', { name: 'Numbers' }).click();
  check((await json(page, 'chord-display-v1'))?.notation === 'number', 'Numbers → chord-display-v1');
  check(await dialog.getByRole('group', { name: 'Accidentals' }).getByRole('button').first().isDisabled(), 'accidentals are disabled for numbers');
  await dialog.getByRole('button', { name: /Chords$/ }).click();
  await dialog.getByRole('button', { name: '♭' }).click();
  check((await json(page, 'chord-display-v1'))?.accidentals === 'flat', '♭ → chord-display-v1');
  await dialog.getByRole('switch', { name: 'Count-in' }).click();
  check(await store(page, 'song-count-in') === '0', 'Count-in off → song-count-in 0');
  await dialog.getByRole('group', { name: 'Fade-in length' }).getByRole('button', { name: '8 s' }).click();
  check(await store(page, 'fade-in-seconds-v1') === '8', 'Fade-in 8 s → fade-in-seconds-v1');
  await dialog.getByRole('group', { name: 'Fade-out length' }).getByRole('button', { name: '2 s' }).click();
  check(await store(page, 'fade-seconds-v1') === '2', 'Fade-out 2 s → fade-seconds-v1');
  await dialog.getByRole('switch', { name: 'Accent the first beat' }).click();
  check((await json(page, 'click-settings-v1'))?.accent === false, 'Accent off → click-settings-v1');
  await dialog.getByRole('group', { name: 'Clicks per beat' }).getByRole('button', { name: '2' }).click();
  check((await json(page, 'click-settings-v1'))?.division === 2, 'Clicks per beat 2 → click-settings-v1');
  await dialog.getByRole('button', { name: /^Sound/ }).click();
  await page.getByRole('button', { name: 'Tambourine' }).click();
  const sound = (await json(page, 'click-settings-v1'))?.sound;
  check(typeof sound === 'number' && await page.getByRole('button', { name: 'Tambourine' }).getAttribute('aria-pressed') === 'true', 'Sound Tambourine → click-settings-v1, ticked');
  await page.keyboard.press('Escape');
  await dialog.getByRole('slider').fill('55');
  check(Math.abs(((await json(page, 'click-settings-v1'))?.volume ?? 0) - 0.55) < 0.011, 'Volume 55 → click-settings-v1');

  // They read back after a reload.
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'More' }).first().waitFor({ timeout: 60000 });
  dialog = await openSettings(page);
  check(await dialog.getByRole('switch', { name: 'Count-in' }).getAttribute('aria-checked') === 'false', 'after a reload: Count-in still off');
  check(await dialog.getByRole('group', { name: 'Fade-in length' }).getByRole('button', { name: '8 s' }).getAttribute('aria-pressed') === 'true', 'after a reload: Fade-in still 8 s');
  check(await dialog.getByRole('button', { name: /^Sound/ }).innerText().then((t) => t.includes('Tambourine')), 'after a reload: Sound still Tambourine');
  await dialog.getByRole('button', { name: 'Back' }).click();

  // The Click capsule: a long press and the caret open the sheet; a plain tap still flips it.
  const capsule = page.getByRole('button', { name: 'Metronome click' }).first();
  // Read straight from the page: while a sheet is open the rest of it is hidden from the accessibility tree.
  const pressed = () => page.evaluate(() => document.querySelector('[aria-label="Metronome click"]')?.getAttribute('aria-pressed'));
  const before = await pressed();
  const at = await capsule.boundingBox();
  await page.mouse.move(at.x + 10, at.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('In this song').waitFor({ timeout: 3000 }).catch(() => {});
  check(await sheet.getByText('In this song').count() > 0, 'a long press on Click opens the metronome sheet');
  check(await pressed() === before, 'the long press did not flip the click');
  await sheet.getByRole('button', { name: 'All settings' }).click();
  await page.getByRole('dialog').getByText('Chord symbols', { exact: true }).waitFor({ timeout: 3000 }).catch(() => {});
  check(await page.getByRole('dialog').getByText('Chord symbols', { exact: true }).count() > 0, '"All settings" goes on to the page');
  await page.getByRole('dialog').getByRole('button', { name: 'Back' }).click();
  await capsule.click();
  check(await pressed() !== before, 'a plain tap still flips the click');
  await page.getByRole('button', { name: 'Click settings' }).first().click();
  check(await page.getByRole('dialog').getByText('In this song').count() > 0, 'the caret opens the metronome sheet');
  await page.keyboard.press('Escape');

  // Play with the count-in off starts at once.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => window.__appEngine?.state?.playing, null, { timeout: 60000 }).catch(() => {});
  const counted = await page.evaluate(() => window.__appEngine?.state?.countInBeats ?? -1);
  check(counted === 0, 'Count-in off: Play starts with no count-in', `countInBeats ${counted}`);
  check(await page.getByText(/^[1-4]$/).count() === 0, 'Count-in off: no countdown overlay');

  // While it plays, settings only send live commands.
  await page.evaluate(() => {
    window.__sent = [];
    const e = window.__appEngine;
    const send = e.send.bind(e);
    e.send = (cmds) => { window.__sent.push(...cmds.map((c) => c[0])); return send(cmds); };
  });
  dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Numbers' }).click();
  await dialog.getByRole('button', { name: /Chords$/ }).click();
  await dialog.getByRole('switch', { name: 'Count-in' }).click();
  await dialog.getByRole('switch', { name: 'Accent the first beat' }).click();
  await dialog.getByRole('group', { name: 'Clicks per beat' }).getByRole('button', { name: '1' }).click();
  await dialog.getByRole('slider').fill('40');
  await dialog.getByRole('button', { name: 'Try it' }).click();
  await page.waitForTimeout(1500);
  const sent = await page.evaluate(() => window.__sent);
  const song = sent.filter((n) => ['setStep', 'clearTrack', 'previewOff', 'beginArrangement', 'section', 'chord', 'stop', 'load'].includes(n));
  check(song.length === 0, 'playing: settings send no song, no release and no stop', `sent ${[...new Set(song)].join(', ')}`);
  check(sent.length < 60, 'playing: settings do not flood the engine', `${sent.length} commands in 1.5 s`);
  check(await page.evaluate(() => window.__appEngine.state.playing), 'playing: the song is still playing');
  await context.close();
}

// ── The count-in, on ──
{
  const { context, page } = await open({ width: 390, height: 844 }, true);
  await page.evaluate(() => localStorage.setItem('song-count-in', '1'));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const counts = await page.waitForFunction(() => (window.__appEngine?.state?.countInBeats ?? 0) > 0, null, { timeout: 60000 }).then(() => true).catch(() => false);
  check(counts, 'Count-in on: Play counts a bar in first');
  await context.close();
}

await browser.close();
console.log(failed ? `\ncheck-settings: ${failed} failed` : '\ncheck-settings: ok');
process.exit(failed ? 1 : 0);
