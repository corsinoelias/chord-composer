/**
 * Writes shared/catalog/*.json from the web's own code — the one source of truth the Flutter
 * app reads its styles, chord qualities, sounds and aliases from
 * (docs/plan-paridad-web-app.md, phase 2). Nothing here is edited by hand: change the web
 * code, run this, then run `dart run tool/sync_shared.dart` in the app.
 *
 *   npm run shared:export
 *
 * shared/VERSION holds a hash of the catalog; the app's test fails if its vendored copy
 * does not match the hash it declares, so a stale copy cannot go unnoticed.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSICAL_STYLES, getSlotsPerBar, generateBarPattern, type StylePattern } from '../src/lib/styles';
import { CHORD_QUALITIES, chordToMidiNotes, type ChordQuality } from '../src/lib/musicTheory';
import { getScale } from '../src/lib/bassScale';
import { INSTRUMENTS } from '../src/lib/instruments';
import { SONG_SCHEMA_VERSION } from '../src/lib/songs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared');
const CATALOG = join(ROOT, 'catalog');

/**
 * How each web sound is played by the app until it has the web's own samples (phase 4):
 * a SoundFont program (timbre 13) or one of its synth timbres, and for drums a kit index
 * into drumKits in the app's constants.dart. The one place this mapping lives.
 */
const APP_SOUND: Record<string, Record<string, { timbre?: number; program?: number; kit?: number }>> = {
  piano: {
    sampled: { timbre: 13, program: 0 }, acoustic: { timbre: 13, program: 0 }, bright: { timbre: 13, program: 1 },
    electric: { timbre: 13, program: 4 }, soft: { timbre: 13, program: 0 }, upright: { timbre: 13, program: 0 },
    honkytonk: { timbre: 13, program: 3 },
  },
  bass: {
    fender: { timbre: 13, program: 34 }, finger: { timbre: 13, program: 33 }, slap: { timbre: 13, program: 36 },
    muted: { timbre: 13, program: 33 }, synth: { timbre: 12 }, sub: { timbre: 10 },
    electric: { timbre: 12 }, picked: { timbre: 13, program: 34 },
  },
  guitar: {
    acoustic: { timbre: 13, program: 25 }, electric: { timbre: 13, program: 27 }, nylon: { timbre: 13, program: 24 },
    'sf2-steel': { timbre: 13, program: 25 }, 'sf2-nylon': { timbre: 13, program: 24 }, 'sf2-clean': { timbre: 13, program: 27 },
    'sf2-jazz': { timbre: 13, program: 26 }, 'sf2-muted': { timbre: 13, program: 28 }, 'sf2-distortion': { timbre: 13, program: 30 },
    'sf2-overdrive': { timbre: 13, program: 29 }, 'sf2-harmonics': { timbre: 13, program: 31 },
  },
  drums: {
    // 9 is the app's "Web" kit: the web's own acoustic recordings (export-drums-for-app.mjs).
    standard: { kit: 9 }, analog: { kit: 0 }, punch: { kit: 1 }, lofi: { kit: 0 },
    // Removed kits still saved in some songs; the web plays them through its fallback.
    rock: { kit: 9 }, jazz: { kit: 9 }, electronic: { kit: 4 },
  },
};

/**
 * Ids that resolve to another id. The web's silent fallbacks (an unknown style plays as
 * MUSICAL_STYLES[0]) become explicit here, and the app's own ids map onto the web style
 * that wins when both have one (docs/plan-paridad-web-app.md, rule 0).
 */
const STYLE_ALIASES: Record<string, string> = {
  // Web ids that no longer exist, still in public songs.
  pop_basic: 'pop_1',
  folk_strum: 'pop_1',
  // The app's ids before the catalog was shared.
  pop: 'pop_1',
  rock: 'rock_basic',
  blues: 'shuffle_blues',
  jazz: 'jazz_light',
  rnb: 'soul_rnb',
  reggae: 'Reggae_twostep',
  hiphop: 'hiphop_trap',
  folk: 'folk_indie',
  sixeight: 'pop_6_8',
  bossa: 'bossa_light',
};

/** The app's older chord type names. */
const QUALITY_ALIASES: Record<string, string> = { m9: 'min9', m11: 'min11' };

/**
 * The rows exactly as the web engine plays them (generateBarPattern: loop slice, the
 * interaction rules that soften the hi-hat under the snare), one entry per bar of the loop,
 * and the phrase-end bar with the fill applied. The app builds its presets from these
 * rather than re-implementing the rules, so a web rule change reaches it on the next export.
 */
function rendered(style: StylePattern) {
  const loopBars = style.loopBars ?? 1;
  const bars = Array.from({ length: loopBars }, (_, b) => generateBarPattern(style, b + 1, 1_000_000));
  const fillBar = generateBarPattern(style, 4, 4);
  const fillRows = Object.keys(style.fill?.pattern ?? {});
  return {
    bars,
    fill: {
      position: style.fill?.position ?? 12,
      rows: Object.fromEntries(fillRows.map((row) => [row, (fillBar as unknown as Record<string, number[]>)[row]])),
    },
  };
}

function main() {
  mkdirSync(CATALOG, { recursive: true });

  const styles = MUSICAL_STYLES.map((s) => ({ ...s, slotsPerBar: getSlotsPerBar(s), rendered: rendered(s) }));

  const chords = Object.fromEntries(
    (CHORD_QUALITIES as readonly ChordQuality[]).map((quality) => {
      const notes = chordToMidiNotes({ id: 'x', root: 'C', accidental: '', quality, duration: 4 });
      return [quality, { intervals: notes.map((n) => n - 60), scale: getScale(quality) }];
    }),
  );

  const sounds = Object.fromEntries(
    INSTRUMENTS.map((inst) => [
      inst.id,
      {
        default: inst.defaultSoundType,
        sounds: inst.soundTypes.map((t) => ({
          id: t.id,
          name: t.name,
          source: t.sf2Instrument ? 'soundfont' : t.samplePath || t.useSamples ? 'samples' : 'synth',
          ...(t.samplePath ? { samplePath: t.samplePath } : {}),
          ...(t.sf2Instrument ? { sf2Instrument: t.sf2Instrument } : {}),
          octaveOffset: t.octaveOffset,
          app: APP_SOUND[inst.id]?.[t.id] ?? null,
        })),
        legacy: Object.fromEntries(
          Object.entries(APP_SOUND[inst.id] ?? {}).filter(([id]) => !inst.soundTypes.some((t) => t.id === id)),
        ),
      },
    ]),
  );

  const files: Record<string, unknown> = {
    'styles.json': { styles },
    'chords.json': {
      // Web voicing (musicTheory.chordToMidiNotes): root in octave 4 (C4 = 60 … B4 = 71),
      // intervals added on top, slash bass moved below the rest.
      rootMidi: { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 },
      qualities: chords,
      // Melodic degrees 1–8 index into `scale` (bassScale.getScale), relative to the root.
    },
    'sounds.json': sounds,
    'aliases.json': { styles: STYLE_ALIASES, qualities: QUALITY_ALIASES },
  };

  const hash = createHash('sha256');
  for (const [name, value] of Object.entries(files)) {
    const text = JSON.stringify(value, null, 1) + '\n';
    writeFileSync(join(CATALOG, name), text);
    hash.update(name).update(text);
  }
  const version = { songSchemaVersion: SONG_SCHEMA_VERSION, catalogHash: hash.digest('hex').slice(0, 16) };
  writeFileSync(join(ROOT, 'VERSION.json'), JSON.stringify(version, null, 1) + '\n');
  console.log(`shared/ escrito: ${styles.length} estilos, ${Object.keys(chords).length} calidades, hash ${version.catalogHash}`);
}

main();
