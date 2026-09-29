// Builds the Google Play artwork for the Chord Player app — 8 phone screenshots per
// language plus the feature graphic — from the raw phone captures in
// screenshots/chord-player-app/{en,es}/, and the website's phone mockups too.
//
//   node scripts/store-art.mjs            # everything
//   node scripts/store-art.mjs --web      # only the website mockups
//   node scripts/store-art.mjs --play     # only the Play artwork
//
// Rendered in Chromium rather than drawn with an image library: the store art uses the
// app's own typefaces (Inter and Space Mono, read straight from the Flutter project) and
// real CSS gradients, shadows and text layout. Text painted onto a rectangle looks like
// text painted onto a rectangle.
//
// How to retake the raw captures is in the app repo, docs/ficha-play.md; uploading is
// `pwsh tool/publish_listing.ps1` there.
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
// ~/Documents/CodiFlash/ChordPlayer/chord-composer → ~/Projects/chord_sequencer.
const APP = path.resolve(SITE, '../../../../Projects/chord_sequencer');
const SHOTS = path.join(SITE, 'screenshots/chord-player-app');
const WEB_OUT = path.join(SITE, 'public/images/chord-player-app');
const MOCKUP = path.join(os.homedir(), 'Downloads/mockup-google-pixel-10-pro-2026-transparent.png');
const FONTS = url(path.join(APP, 'assets/fonts'));
const ICON = url(path.join(APP, 'assets/icon/icon.png'));

const only = process.argv.includes('--web') ? 'web' : process.argv.includes('--play') ? 'play' : 'all';

function url(p) {
  return 'file:///' + p.split(path.sep).join('/');
}

// Where the screen sits inside the mockup PNG, measured at its own 380x800.
const FRAME = { w: 380, h: 800, x: 15, y: 14, sw: 346, sh: 771, r: 42 };

/** The phone with a screenshot in it, on transparency, at `scale` times the mockup. */
async function framed(shot, scale) {
  const W = Math.round(FRAME.w * scale), H = Math.round(FRAME.h * scale);
  const sw = Math.round(FRAME.sw * scale), sh = Math.round(FRAME.sh * scale);
  const r = Math.round(FRAME.r * scale);
  const mockup = await sharp(MOCKUP).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" rx="${r}" ry="${r}"/></svg>`);
  const screen = await sharp(shot).resize(sw, sh, { kernel: 'lanczos3' })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: screen, left: Math.round(FRAME.x * scale), top: Math.round(FRAME.y * scale) },
      { input: mockup, left: 0, top: 0 },
    ]).png().toBuffer();
}

// The six section colours of the app (see AppColors.sectionPalette), one per slide: the
// set reads as one product and each slide still has a light of its own.
const slides = [
  { shot: 'song', file: 'song', accent: '#8B5CF6',
    en: ['YOUR SONG', 'Write it.<br>Hear it.'], es: ['TU CANCIÓN', 'Escríbela.<br>Óyela.'] },
  { shot: 'rhythms', file: 'rhythms', accent: '#25DA67',
    en: ['201 RHYTHMS', 'Salsa, bachata,<br>jazz, trap and more'], es: ['201 RITMOS', 'Salsa, bachata,<br>jazz, trap y más'] },
  { shot: 'rhythm-editor', file: 'rhythm-editor', accent: '#DF2060',
    en: ['THE GROOVE', 'Move a single<br>drum hit'], es: ['EL RITMO', 'Mueve un solo<br>golpe de batería'] },
  { shot: 'rhythm-piano', file: 'rhythm-piano', accent: '#FAB505',
    en: ['EVERY PART', 'Piano, bass, guitar,<br>synth: note by note'], es: ['CADA INSTRUMENTO', 'Piano, bajo, guitarra<br>y sinte, nota a nota'] },
  { shot: 'chord-editor', file: 'chord-editor', accent: '#2BD4BD',
    en: ['ANY CHORD', 'The right chord,<br>in your key'], es: ['CUALQUIER ACORDE', 'El acorde justo,<br>en tu tono'] },
  // The diagrams live at the foot of a sheet, so a whole phone would cut them off just
  // where the headline promises them. This slide shows that part of the screen, cropped
  // from the same capture and enlarged: the app's own pixels, at a size that reads.
  { shot: 'chord-diagram', file: 'chord-diagram', accent: '#FAB505', crop: { top: 1576, height: 600 },
    en: ['HOW TO PLAY IT', 'Piano and guitar<br>for every chord'], es: ['CÓMO SE TOCA', 'Piano y guitarra<br>en cada acorde'] },
  { shot: 'mixer', file: 'mixer', accent: '#2662D9',
    en: ['THE MIX', 'Sit the band<br>where you want it'], es: ['LA MEZCLA', 'Coloca la banda<br>a tu gusto'] },
  // Progressions rather than the example songs: those carry real artists' names, which
  // have no place in store art.
  { shot: 'progressions', file: 'progressions', accent: '#8B5CF6',
    en: ['A HEAD START', 'Progressions<br>ready to play'], es: ['EMPIEZA HECHO', 'Progresiones<br>listas para tocar'] },
];

// The feature graphic says one thing: the name, and a line. The phones say the rest.
const feature = {
  en: 'Your chords, played by a band.',
  es: 'Tus acordes, tocados por una banda.',
};

const css = `
/* The name wants a heavier cut than the app's own Inter files carry. */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@800&display=block');
@font-face { font-family: Inter; src: url('${FONTS}/Inter-Regular.ttf'); font-weight: 400 }
@font-face { font-family: Inter; src: url('${FONTS}/Inter-Medium.ttf'); font-weight: 500 }
@font-face { font-family: Inter; src: url('${FONTS}/Inter-SemiBold.ttf'); font-weight: 600 }
@font-face { font-family: Inter; src: url('${FONTS}/Inter-Bold.ttf'); font-weight: 700 }
@font-face { font-family: SpaceMono; src: url('${FONTS}/SpaceMono-Bold.ttf'); font-weight: 700 }
* { margin: 0; padding: 0; box-sizing: border-box }
body { background: #0B0618 }

.slide {
  position: relative; width: 1080px; height: 1920px; overflow: hidden;
  background: radial-gradient(120% 80% at 50% -10%, var(--glow) 0%, rgba(11,6,24,0) 62%),
              linear-gradient(168deg, #170E31 0%, #0D0720 55%, #140B2C 100%);
  font-family: Inter, sans-serif; color: #fff;
}
/* The step grid of the app's own rhythm icon, enormous and nearly invisible: texture that
   says "sequencer" without competing with the phone. */
.grid { position: absolute; inset: 0; opacity: .5;
  background-image: radial-gradient(circle at center, rgba(255,255,255,.055) 3px, transparent 3.5px);
  background-size: 48px 48px; mask-image: linear-gradient(#000 0%, transparent 58%) }
.halo { position: absolute; left: 50%; top: 640px; width: 1180px; height: 1180px;
  transform: translateX(-50%); border-radius: 50%; background: var(--accent); filter: blur(180px); opacity: .22 }

.copy { position: absolute; top: 132px; left: 84px; right: 84px; text-align: center }
.kicker { font-family: SpaceMono, monospace; font-weight: 700; font-size: 27px;
  letter-spacing: .26em; color: var(--accent) }
.rule { width: 72px; height: 6px; border-radius: 3px; background: var(--accent); margin: 26px auto 0 }
.headline { margin-top: 30px; font-weight: 700; font-size: 86px; line-height: 1.04;
  letter-spacing: -.028em; text-wrap: balance }

/* Big, and off the bottom edge: what sells the app is the interface being legible in a
   thumbnail, not the whole device being visible. */
.phone { position: absolute; left: 50%; top: 560px; width: 812px; transform: translateX(-50%);
  filter: drop-shadow(0 46px 70px rgba(0,0,0,.62)) drop-shadow(0 8px 18px rgba(0,0,0,.35)) }

/* A detail lifted out of a capture, shown as a card rather than inside a phone. */
.card { position: absolute; left: 50%; top: 640px; width: 916px; transform: translateX(-50%);
  border-radius: 36px; overflow: hidden; border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 50px 80px rgba(0,0,0,.6), 0 10px 22px rgba(0,0,0,.4) }
.card img { display: block; width: 100% }

/* ── Feature graphic ─────────────────────────────────────────────────────────── */
.feature { position: relative; width: 1024px; height: 500px; overflow: hidden;
  background: radial-gradient(70% 120% at 80% 30%, #3B1D8F 0%, rgba(59,29,143,0) 60%), #0E0A1F;
  font-family: Inter, sans-serif; color: #fff }
.feature .text { position: absolute; left: 72px; top: 150px; width: 470px }
.brand { display: flex; align-items: center; gap: 18px }
.brand img { width: 72px; height: 72px; border-radius: 18px }
.brand .name { font-size: 60px; font-weight: 800; letter-spacing: -.035em; line-height: 1 }
.tagline { margin-top: 22px; font-size: 27px; font-weight: 500; line-height: 1.25;
  letter-spacing: -.015em; color: #C9C2E6 }
/* Upright, and cut by the bottom edge: the song in front, its drums behind. */
.feature .phone { transform: none; width: 250px; filter: drop-shadow(0 30px 40px rgba(0,0,0,.35)) }
.feature .back { left: 600px; top: 92px; opacity: .96 }
.feature .front { left: 742px; top: 46px }
`;

async function buildPlay(browser, lang, frames, tmp) {
  const out = path.join(SHOTS, `play-${lang === 'en' ? 'en' : 'es'}`);
  fs.mkdirSync(out, { recursive: true });
  // The listing script uploads every PNG here: last time's slides must not linger.
  for (const old of fs.readdirSync(out)) if (old.endsWith('.png')) fs.rmSync(path.join(out, old));
  const tagline = feature[lang];
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>` +
    slides.map((s, i) => `<div class="slide" id="s${i}" style="--accent:${s.accent};--glow:${s.accent}2E">
      <div class="grid"></div><div class="halo"></div>
      <div class="copy">
        <div class="kicker">${s[lang][0]}</div><div class="rule"></div>
        <div class="headline">${s[lang][1]}</div>
      </div>
      ${s.crop
        ? `<div class="card"><img src="${url(frames[s.shot + '-detail'])}"></div>`
        : `<img class="phone" src="${url(frames[s.shot])}">`}
    </div>`).join('') +
    `<div class="feature" id="feature">
      <div class="text">
        <div class="brand"><img src="${ICON}"><div class="name">Chord Player</div></div>
        <div class="tagline">${tagline}</div>
      </div>
      <img class="phone back" src="${url(frames['rhythm-editor'])}">
      <img class="phone front" src="${url(frames.song)}">
    </div>`;

  const file = path.join(tmp, `store-${lang}.html`);
  fs.writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(url(file));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  for (const [i, s] of slides.entries()) {
    await page.locator(`#s${i}`).screenshot({ path: path.join(out, `${String(i + 1).padStart(2, '0')}-${s.file}.png`) });
  }
  await page.locator('#feature').screenshot({ path: path.join(out, 'feature-graphic.png') });
  await page.close();
}

/** The website's gallery: the same phones, 2x, on transparency. */
async function buildWeb(frames) {
  fs.mkdirSync(WEB_OUT, { recursive: true });
  for (const name of Object.keys(frames)) {
    await sharp(frames[name]).resize(760, 1600, { kernel: 'lanczos3' })
      .webp({ quality: 88 }).toFile(path.join(WEB_OUT, `${name}.webp`));
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-art-'));
try {
  const browser = only === 'web' ? null : await chromium.launch();
  for (const lang of ['en', 'es']) {
    const frames = {};
    for (const s of slides) {
      const raw = path.join(SHOTS, lang, `${s.shot}.png`);
      if (!fs.existsSync(raw)) { console.log('missing', raw); continue; }
      const file = path.join(tmp, `${lang}-${s.shot}.png`);
      fs.writeFileSync(file, await framed(raw, 3.2));
      frames[s.shot] = file;
      if (s.crop) {
        const { width } = await sharp(raw).metadata();
        const detail = path.join(tmp, `${lang}-${s.shot}-detail.png`);
        await sharp(raw).extract({ left: 0, top: s.crop.top, width, height: s.crop.height })
          .png().toFile(detail);
        frames[`${s.shot}-detail`] = detail;
      }
    }
    // The website keeps whole phones, including the slide the store shows as a detail.
    if (only !== 'play' && lang === 'en') {
      await buildWeb(Object.fromEntries(
        Object.entries(frames).filter(([name]) => !name.endsWith('-detail'))));
    }
    if (only !== 'web') await buildPlay(browser, lang, frames, tmp);
  }
  await browser?.close();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('store art ok');
