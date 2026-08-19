import { type Chord, type ChordQuality, chordToMidiNotes } from '@/lib/musicTheory';
import ukuleleVoicingsDb from './chordVoicingsUkulele.json';
import type { GuitarVoicing } from './guitarChords';

// GCEA tuning, 4 strings — reuses the GuitarVoicing shape (it's instrument-agnostic: just
// frets/fingers/barre/baseFret) so GuitarChordDiagram renders either without a separate type.
export type UkuleleVoicing = GuitarVoicing;

// Same curated-DB quality key mapping as guitarChords.ts's DB_QUALITY_KEY — the ukulele
// voicing DB (chordVoicingsUkulele.json) was built with the same ~29 "standard" chord-type
// keys, so no algorithmic fallback exists here (unlike guitar's movable E/A shapes): a
// quality/root pair with no curated ukulele voicing just returns null.
//
// Unlike the guitar DB, entry order here is NOT reliably "easiest first" — e.g. plain 'C'
// lists a fret-5 barre shape at index 0 and the near-nut x,0,0,3 shape at index 2 (~8% of
// entries are out of order this way). getUkuleleVoicing() picks the lowest-position entry
// itself instead of trusting index 0.
const DB_QUALITY_KEY: Partial<Record<ChordQuality, string>> = {
  maj: '', min: 'm', '5': '5', '6': '6', '7': '7', maj7: 'Maj7',
  '9': '9', maj9: 'Maj9', '11': '11', '13': '13', maj13: 'Maj13',
  min6: 'm6', min7: 'm7', min9: 'm9', min11: 'm11', min13: 'm13',
  sus2: 'sus2', sus4: 'sus4', dim: 'dim', aug: 'aug', '6/9': '69',
  '7sus4': '7sus4', '7b5': '7b5', '7b9': '7b9', add9: 'add9',
  dim7: 'dim7', m7b5: 'm7b5', '7#9': '7#9', maj11: 'Maj11',
};

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function midiToFlatName(midi: number, transposition: number): string {
  return FLAT_NAMES[((midi + transposition) % 12 + 12) % 12];
}

interface DbVoicingEntry { p: string; f: string }
type UkuleleVoicingsDb = { GCEA: Record<string, DbVoicingEntry[]> };

function computeBaseFret(frets: number[]): number {
  const played = frets.filter(f => f > 0);
  if (played.length === 0) return 1;
  const maxF = Math.max(...played);
  if (maxF <= 4) return 1;
  return Math.min(...played);
}

// Lowest-position entry — the smallest "highest fretted string" across the voicing, so an
// open/near-nut shape always wins over a barre further up the neck.
function maxPlayedFret(entry: DbVoicingEntry): number {
  const frets = entry.p.split(',').map(t => (t === 'x' ? -1 : parseInt(t, 10)));
  const played = frets.filter(f => f > 0);
  return played.length ? Math.max(...played) : 0;
}

function pickEasiest(entries: DbVoicingEntry[]): DbVoicingEntry {
  return entries.reduce((best, e) => (maxPlayedFret(e) < maxPlayedFret(best) ? e : best));
}

function fromDbEntry(entry: DbVoicingEntry): UkuleleVoicing | null {
  const frets = entry.p.split(',').map(t => (t === 'x' ? -1 : parseInt(t, 10)));
  if (frets.length !== 4 || frets.some(isNaN)) return null;
  const digits = String(entry.f || '').replace(/[^0-9]/g, '');
  const fingers = new Array(4).fill(0);
  let di = 0;
  for (let s = 0; s < 4; s++) if (frets[s] > 0) { const d = digits[di++]; if (d && d !== '0') fingers[s] = +d; }

  const groups: Record<string, number[]> = {};
  fingers.forEach((f, s) => {
    if (f > 0) { const k = f + '@' + frets[s]; (groups[k] = groups[k] || []).push(s); }
  });
  let barre: UkuleleVoicing['barre'];
  for (const k in groups) {
    if (groups[k].length > 1) {
      const [finger, fret] = k.split('@').map(Number);
      barre = { fret, fromString: Math.min(...groups[k]), toString: Math.max(...groups[k]) };
      break;
    }
  }
  return { frets, fingers, barre, baseFret: computeBaseFret(frets) };
}

export function getUkuleleVoicing(chord: Chord, transposition = 0): UkuleleVoicing | null {
  const key = DB_QUALITY_KEY[chord.quality];
  if (key === undefined) return null;
  const midiNotes = chordToMidiNotes(chord);
  const rootName = midiToFlatName(midiNotes[0], transposition);
  const entries = (ukuleleVoicingsDb as UkuleleVoicingsDb).GCEA[rootName + key];
  if (!entries || !entries.length) return null;
  return fromDbEntry(pickEasiest(entries));
}
