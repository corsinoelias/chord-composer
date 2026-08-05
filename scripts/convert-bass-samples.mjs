/**
 * Convierte los bancos de bajo de WAV a MP3 mono y actualiza sus manifests.
 *
 *   node scripts/convert-bass-samples.mjs --dry
 *   node scripts/convert-bass-samples.mjs
 *   node scripts/convert-bass-samples.mjs --bitrate 128
 *
 * POR QUÉ. Los samples de bajo eran los únicos WAV de la app — el piano, la batería y las
 * guitarras ya eran MP3. Cada nota ocupaba 692 KB (PCM 16 bits, estéreo, 44,1 kHz, 3 s), y
 * los cuatro bancos sumaban 79 MB. Medido en una song page con 4G emulado, descargar el
 * banco entero eran 25 segundos hasta la primera nota; en 3G no llegaba a sonar.
 *
 * POR QUÉ MP3 Y NO OGG. Se probó en WebKit 26.4 —el motor del Safari actual, no uno
 * antiguo— y `audio/ogg` sale NO SOPORTADO en sus tres variantes. El 27 % de los usuarios
 * del sitio entra por Safari, y el 60 % de ellos va en Safari 26.x. Con OGG se habrían
 * quedado sin bajo. MP3 además ya es el formato del resto de la app.
 *
 * POR QUÉ MONO. En un registro tan grave la información estéreo aporta poco, y son 2x de
 * entrada antes de comprimir.
 *
 * Requiere un ffmpeg con encoder MP3. Se busca en PATH y, si no, en el paquete
 * `ffmpeg-static` (instalable con `npm i --no-save ffmpeg-static`). El ffmpeg que trae
 * Playwright NO sirve: es un build recortado para vídeo y no lleva libmp3lame.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = join(ROOT, 'public', 'samples');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const BITRATE = args.includes('--bitrate') ? args[args.indexOf('--bitrate') + 1] : '96';

function findFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { stdio: 'pipe' });
    return 'ffmpeg';
  } catch { /* no está en PATH, o está roto */ }
  const local = join(ROOT, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (existsSync(local)) return local;
  throw new Error('No hay ffmpeg utilizable. Instálalo, o: npm i --no-save ffmpeg-static');
}

const ffmpeg = findFfmpeg();
// Comprobar el encoder ANTES de tocar nada: un ffmpeg sin libmp3lame falla a mitad y deja
// los bancos medio convertidos.
const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (!/libmp3lame/.test(encoders)) {
  throw new Error(`El ffmpeg encontrado (${ffmpeg}) no lleva libmp3lame — no puede generar MP3.`);
}

const kb = (b) => (b / 1024).toFixed(0);
let totalBefore = 0;
let totalAfter = 0;

for (const dir of readdirSync(SAMPLES)) {
  const dirPath = join(SAMPLES, dir);
  if (!statSync(dirPath).isDirectory()) continue;
  const manifestPath = join(dirPath, 'manifest.json');
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const wavs = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.wav'));
  if (wavs.length === 0) {
    console.log(`${dir}: ya convertido, se omite`);
    continue;
  }

  let before = 0;
  let after = 0;
  for (const wav of wavs) {
    const src = join(dirPath, wav);
    const dst = src.replace(/\.wav$/i, '.mp3');
    before += statSync(src).size;
    if (!DRY) {
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-b:a', `${BITRATE}k`, dst]);
      after += statSync(dst).size;
      unlinkSync(src);
    }
  }

  // El manifest referencia los ficheros por nombre; sin esto el motor pediría .wav que ya
  // no existen y el bajo enmudecería.
  for (const entry of Object.values(manifest.notes)) {
    entry.file = entry.file.replace(/\.wav$/i, '.mp3');
  }
  if (!DRY) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  totalBefore += before;
  totalAfter += after;
  console.log(
    `${dir.padEnd(8)} ${String(wavs.length).padStart(3)} notas  ` +
    `${kb(before).padStart(7)} KB → ${DRY ? '(simulación)' : `${kb(after).padStart(6)} KB  (${(before / after).toFixed(1)}x)`}`,
  );
}

if (!DRY && totalAfter > 0) {
  console.log(`\ntotal: ${(totalBefore / 1048576).toFixed(1)} MB → ${(totalAfter / 1048576).toFixed(1)} MB ` +
    `(${(totalBefore / totalAfter).toFixed(1)}x menos, MP3 mono ${BITRATE} kbps)`);
}
