#!/usr/bin/env node
/**
 * The SoundFont the sound audition plays its candidates from (/lab/sounds/,
 * docs/sonidos-comunes.md): every General MIDI program the study weighs, including those the
 * web does not ship today (Rhodes, organ, upright, fretless, strings, pad), cut from the app's
 * GeneralUser.sf2 the same way engine:sync cuts the web's.
 *
 *   npm run lab:audition
 *
 * Writes public/lab/sounds/audition.sf2, which is not committed (it is a listening tool, and
 * large). Env: CHORD_APP, the app repo (default C:/Users/Eliascorsino/Projects/chord_sequencer).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
/** Every program the audition offers (src/lib/appEngine/audition.ts CANDIDATES). */
export const AUDITION_PROGRAMS = [0, 1, 3, 4, 5, 16, 48, 89, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];
// The same release cap as the web's copy (engine-sync.mjs), so a candidate sounds as it would there.
const RELEASE_SECONDS = 0.12;

const out = path.join(root, 'public/lab/sounds');
fs.mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [
  path.join(root, 'scripts/sf2-subset.mjs'), path.join(app, 'assets/sf2/GeneralUser.sf2'),
  path.join(out, 'audition.sf2'), AUDITION_PROGRAMS.join(','), String(RELEASE_SECONDS),
], { stdio: 'inherit' });
