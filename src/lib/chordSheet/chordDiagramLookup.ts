// Bridges a chord-name string (as it appears in ChordPro text, e.g. "F#m7b5") to this
// app's real, curated voicing lookups — reused as-is rather than re-deriving fret shapes
// from a flattened table the way the design prototype did (see chordSheetCore.ts's header
// comment for why).
import { parseChordString } from '@/lib/chordParser';
import { getGuitarVoicing, getGuitarVoicings, type GuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing, getUkuleleVoicings } from '@/data/ukuleleChords';

export type DiagramInstrument = 'guitar' | 'ukulele';

export function getChordDiagram(chordName: string, instrument: DiagramInstrument): GuitarVoicing | null {
  const parsed = parseChordString(chordName)[0] ?? null;
  if (!parsed) return null;
  return instrument === 'ukulele' ? getUkuleleVoicing(parsed, 0) : getGuitarVoicing(parsed, 0);
}

/** Every known fingering for a chord, easiest first — for the diagram strip's click-to-
 *  cycle. Always at least the one getChordDiagram() would return (falls back to that single
 *  shape when the curated database has no alternates), so callers never need to also call
 *  getChordDiagram() themselves. */
export function getChordDiagrams(chordName: string, instrument: DiagramInstrument): GuitarVoicing[] {
  const parsed = parseChordString(chordName)[0] ?? null;
  if (!parsed) return [];
  const many = instrument === 'ukulele' ? getUkuleleVoicings(parsed, 0) : getGuitarVoicings(parsed, 0);
  if (many.length) return many;
  const single = getChordDiagram(chordName, instrument);
  return single ? [single] : [];
}
