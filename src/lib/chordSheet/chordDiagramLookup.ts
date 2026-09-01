// Bridges a chord-name string (as it appears in ChordPro text, e.g. "F#m7b5") to this
// app's real, curated voicing lookups — reused as-is rather than re-deriving fret shapes
// from a flattened table the way the design prototype did (see chordSheetCore.ts's header
// comment for why).
import { parseChordString } from '@/lib/chordParser';
import { getGuitarVoicing, type GuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';

export type DiagramInstrument = 'guitar' | 'ukulele';

export function getChordDiagram(chordName: string, instrument: DiagramInstrument): GuitarVoicing | null {
  const parsed = parseChordString(chordName)[0] ?? null;
  if (!parsed) return null;
  return instrument === 'ukulele' ? getUkuleleVoicing(parsed, 0) : getGuitarVoicing(parsed, 0);
}
