/**
 * The rhythm editor's pattern strip (src/lib/patternStrip.ts):
 *   - the app's figures reached the web for every track, in rows the engine reads;
 *   - a figure put on a track is spelled by it, and a changed step no longer is;
 *   - a row one side does not name counts as silent, as the app's sameTrack.
 *
 *   npm run test:groove
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitLane, spells, type StripPattern } from '../../src/lib/patternStrip';
import { DRUM_ROWS } from '../../src/lib/appEngine/commands';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tabs = JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms/patterns.json'), 'utf8')).tabs as Record<string, { id: string; name: string; pattern: Record<string, number[]> }[]>;

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

for (const tab of ['drums', 'piano', 'guitar', 'bass', 'synth']) {
  const list = tabs[tab] ?? [];
  check(`${tab} has figures`, list.length >= 5, `${list.length}`);
  for (const f of list) {
    const rows = Object.keys(f.pattern);
    const known = tab === 'drums' ? rows.every((r) => (DRUM_ROWS as readonly string[]).includes(r)) : rows.every((r) => r === 'lane');
    check(`${tab} ${f.name}: rows the engine reads`, known, rows.join(','));
    check(`${tab} ${f.name}: plays something in its bar`, Object.values(f.pattern).some((l) => l.slice(0, 16).some(Boolean)));
  }
}

const figure = (rows: Record<string, number[]>): StripPattern => ({ id: 'f', name: 'f', bars: 1, rows: Object.fromEntries(Object.entries(rows).map(([r, l]) => [r, fitLane(l, 16)])) });
const rock = figure(tabs.drums[0].pattern);
const track = JSON.parse(JSON.stringify(rock.rows)) as Record<string, number[]>;
check('a figure put on a track is spelled by it', spells(track, 1, rock, 16));
check('with an empty row more, still', spells({ ...track, ride: new Array(16).fill(0) }, 1, rock, 16));
const changed = JSON.parse(JSON.stringify(track));
const row = Object.keys(changed)[0];
changed[row][1] = changed[row][1] ? 0 : 8421874;
check('a step changed, no longer', !spells(changed, 1, rock, 16));
check('two bars are not the one-bar figure', !spells(track, 2, rock, 16));

console.log(`${checks - failed}/${checks} pattern checks passed`);
if (failed) process.exit(1);
