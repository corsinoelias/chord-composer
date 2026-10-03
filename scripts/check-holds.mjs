#!/usr/bin/env node
/**
 * Checks sf2-subset.mjs's idea of which presets hold their note against the engine's own
 * (channelHolds in engine/vendor/native_audio.cpp, asked of tsf itself), over every melodic
 * preset of the app's GeneralUser.sf2. Not in the build: it needs a native C++ compiler and
 * the app repo.
 *
 *   node scripts/check-holds.mjs      (CHORD_APP: the app repo; CXX: the compiler, default clang++)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.CHORD_APP || path.resolve(root, '../chord-sequencer-flutter-app');
const font = path.join(app, 'assets/sf2/GeneralUser.sf2');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holds-'));

fs.writeFileSync(path.join(tmp, 'holds.cpp'), `
#define TSF_IMPLEMENTATION
#include "tsf.h"
#include <cstdio>
int main(int, char** argv) {
  tsf* f = tsf_load_filename(argv[1]);
  if (!f) return 1;
  for (int i = 0; i < f->presetNum; ++i) {
    const tsf_preset& p = f->presets[i];
    bool holds = false;
    for (int r = 0; r < p.regionNum && !holds; ++r) {
      const tsf_region& g = p.regions[r];
      holds = g.loop_mode != TSF_LOOPMODE_NONE && g.loop_start < g.loop_end && g.ampenv.sustain >= .1f;
    }
    printf("%d %d %d\\n", (int)p.bank, (int)p.preset, holds ? 1 : 0);
  }
}`);
execFileSync(process.env.CXX || 'clang++', ['-O1', '-std=c++17', `-I${path.join(root, 'engine/vendor')}`, '-o', path.join(tmp, 'holds'), path.join(tmp, 'holds.cpp')], { stdio: 'inherit' });
const engine = new Map(execFileSync(path.join(tmp, 'holds'), [font]).toString().trim().split('\n')
  .map((l) => l.split(' ').map(Number)).filter(([bank]) => bank < 120).map(([b, p, h]) => [`${b}:${p}`, h]));

const list = path.join(tmp, 'ours.json');
execFileSync(process.execPath, [path.join(root, 'scripts/sf2-subset.mjs'), font, path.join(tmp, 'x.sf2'), 'all', '0.12'], { env: { ...process.env, HOLDS_LIST: list }, stdio: 'ignore' });
const ours = JSON.parse(fs.readFileSync(list, 'utf8')).filter(([bank]) => bank < 120);
const wrong = ours.filter(([b, p, h]) => engine.get(`${b}:${p}`) !== h).map(([b, p]) => `${b}:${p}`);
fs.rmSync(tmp, { recursive: true, force: true });
if (wrong.length || ours.length !== engine.size) {
  console.error(`check:holds: ${wrong.length} presets differ from the engine's rule (${ours.length} of ${engine.size} compared): ${wrong.join(' ')}`);
  process.exit(1);
}
console.log(`check:holds: ok — ${ours.length} presets, ${ours.filter((x) => x[2]).length} hold their note, none differs from the engine`);
