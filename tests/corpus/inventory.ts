/**
 * What the real corpus actually uses: styles, sounds, chord qualities, variations. Decides
 * the order of work in docs/plan-paridad-web-app.md (phase 0) and lists every id that today
 * resolves through a silent fallback, which the shared catalog must keep as an explicit alias.
 *
 *   npm run corpus:inventory        (after npm run corpus:fetch)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MUSICAL_STYLES } from '../../src/lib/styles';
import { INSTRUMENTS } from '../../src/lib/instruments';
import { CHORD_QUALITIES } from '../../src/lib/musicTheory';
import { parseLyricLine } from '../../src/data/songs';
import { parseChordString } from '../../src/lib/chordParser';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const read = (name: string) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

/* eslint-disable @typescript-eslint/no-explicit-any */
const publicSongs: any[] = read('public-songs.json');
const progressions: any[] = read('progressions.json');

const styleIds = new Set(MUSICAL_STYLES.map((s) => s.id));
const soundIds = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, new Set(i.soundTypes.map((s) => s.id))]));

const count = () => new Map<string, number>();
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const table = (title: string, m: Map<string, number>, mark?: (k: string) => string) => {
  console.log(`\n${title}`);
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}${mark ? mark(k) : ''}`);
  }
};
const unknownStyle = (k: string) => (styleIds.has(k) ? '' : '   ← no existe: suena como pop_1');

// ── Public songs ────────────────────────────────────────────────────────────
const pubStyles = count();
const pubQualities = count();
for (const song of publicSongs) {
  bump(pubStyles, song.style ?? '(vacío)');
  for (const section of song.sections ?? []) {
    for (const line of section.lines ?? []) {
      for (const token of parseLyricLine(line)) {
        if (!token.chord) continue;
        for (const c of parseChordString(token.chord)) bump(pubQualities, c.quality);
      }
    }
  }
}

// ── Saved progressions ──────────────────────────────────────────────────────
const progStyles = count();
const progSounds = count();
const progQualities = count();
const withVariations = { songs: 0, sections: 0 };
let multiSection = 0;
let legacyMelodic = 0;
let customStyleRefs = 0;
let withSettings = 0;
for (const row of progressions) {
  const song = row.data ?? {};
  const style = song.styleId ?? '(vacío)';
  bump(progStyles, style);
  if (!styleIds.has(style)) customStyleRefs++;
  if (song.melodic) legacyMelodic++;
  if (Array.isArray(song.instrumentSettings) && song.instrumentSettings.length > 0) withSettings++;
  for (const inst of song.instrumentSettings ?? []) {
    const known = soundIds[inst.id]?.has(inst.soundTypeId);
    bump(progSounds, `${inst.id}:${inst.soundTypeId}${known ? '' : '  ← no existe'}`);
  }
  const sections = song.sections ?? [];
  if (sections.filter((s: any) => s.chords?.length).length >= 2) multiSection++;
  let usesVar = false;
  for (const s of sections) {
    if (s.bassVariationId || s.pianoVariationId || s.guitarVariationId) {
      withVariations.sections++;
      usesVar = true;
    }
    for (const c of s.chords ?? []) bump(progQualities, c.quality);
  }
  if (usesVar) withVariations.songs++;
}

const knownQuality = (k: string) => ((CHORD_QUALITIES as readonly string[]).includes(k) ? '' : '   ← no existe');

console.log(`Corpus: ${publicSongs.length} canciones públicas, ${progressions.length} progresiones`);
table('Estilos — canciones públicas', pubStyles, unknownStyle);
table('Estilos — progresiones', progStyles, unknownStyle);
console.log(
  `\n  ${customStyleRefs} progresiones apuntan a un estilo que no es de fábrica ("Mis ritmos" o id viejo).` +
    '\n  Sus ajustes viven solo en el localStorage del dueño: fuera de su navegador suenan como pop_1.',
);
console.log(`\nProgresiones con instrumentSettings guardados: ${withSettings}`);
table('Sonidos guardados (instrumento:sonido) — el editor los sustituye por los del estilo al abrir si el estilo no es rock_basic', progSounds);
table('Calidades de acorde — progresiones', progQualities, knownQuality);
table('Calidades de acorde — canciones públicas', pubQualities, knownQuality);
console.log(`\nProgresiones con 2+ secciones con acordes: ${multiSection}`);
console.log(`Variaciones melódicas por sección: ${withVariations.sections} secciones en ${withVariations.songs} progresiones`);
console.log(`Progresiones con song.melodic heredado (migración a retoque de estilo): ${legacyMelodic}`);
