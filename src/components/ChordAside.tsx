import { useState, useEffect } from 'react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { playChordPreview } from '@/lib/audioEngine';
import { analytics } from '@/lib/analytics';

// ── Transpose helpers ─────────────────────────────────────────────────────────
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeNote(note: string, s: number, flats: boolean): string {
  const i = noteIndex(note); if (i === -1) return note;
  return (flats ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12];
}
function transposeChordStr(c: string, s: number, flats: boolean) {
  const slash = c.indexOf('/')
  const [chordPart, bassPart] = slash !== -1 ? [c.slice(0, slash), c.slice(slash + 1)] : [c, undefined]
  const m = chordPart.match(/^([A-G][#b]?)(.*)/)
  if (!m) return c
  const transposed = transposeNote(m[1], s, flats) + m[2]
  if (!bassPart) return transposed
  const bm = bassPart.match(/^([A-G][#b]?)(.*)/)
  if (!bm) return transposed + '/' + bassPart
  return transposed + '/' + transposeNote(bm[1], s, flats) + bm[2]
}
function transposeKey(key: string, s: number) {
  const minor = key.endsWith('m') && key.length > 1;
  const root = minor ? key.slice(0, -1) : key;
  const i = noteIndex(root); if (i === -1) return key;
  return (FLAT_KEYS.has(key) ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12] + (minor ? 'm' : '');
}

interface Props {
  chords: string[];
  songKey: string;
  songSlug: string;
}

type View = 'piano' | 'guitar';

export default function ChordAside({ chords, songKey, songSlug }: Props) {
  const [view, setView] = useState<View>('guitar');
  const [semitones, setSemitones] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      setSemitones((e as CustomEvent<{ semitones: number }>).detail.semitones);
    };
    window.addEventListener('song-transpose', handler);
    return () => window.removeEventListener('song-transpose', handler);
  }, []);

  const displayKey = semitones === 0 ? songKey : transposeKey(songKey, semitones);
  const useFlats = FLAT_KEYS.has(displayKey);
  const displayedChords = semitones === 0
    ? chords
    : chords.map(c => transposeChordStr(c, semitones, useFlats));

  const items = displayedChords
    .map(chord => {
      const parsed = parseChordString(chord);
      const chordObj = parsed[0] ?? null;
      const notes = chordObj ? getChordNotes(chordObj) : [];
      const voicing = chordObj ? getGuitarVoicing(chordObj) : null;
      return { chord, chordObj, notes, voicing };
    })
    .filter(item => item.chordObj && item.notes.length > 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Chords used
        </span>
        <span className="text-xs text-muted-foreground/50 font-mono tabular-nums">
          {items.length}
        </span>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0 ml-auto">
          {(['guitar', 'piano'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[10px] font-semibold px-2 py-1 capitalize transition-colors
                ${view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chord strip — always visible, horizontal scroll, one tap per chord to hear it.
          Diagrams stay small and chrome-free (no per-chord card/border) so the whole row
          reads as a strip you scan, not a list you have to open first. ── */}
      <div className="flex gap-5 overflow-x-auto px-4 py-4">
        {items.map(({ chord, chordObj, notes, voicing }) => (
          <button
            key={chord}
            type="button"
            onClick={() => {
              if (!chordObj) return;
              analytics.playChordPreview(songSlug, chord, 'aside');
              playChordPreview(chordObj);
            }}
            title={`Play ${chord}`}
            className="flex flex-col items-center gap-1.5 shrink-0 group"
          >
            <span className="text-sm font-bold text-primary group-hover:text-primary/80 transition-colors">
              {chord}
            </span>
            {view === 'piano' ? (
              <PianoKeyboard activeNotes={notes} className="w-36" />
            ) : voicing ? (
              <GuitarChordDiagram voicing={voicing} className="w-20" />
            ) : (
              <span className="w-20 h-24 flex items-center justify-center text-[9px] text-muted-foreground text-center">
                No voicing
              </span>
            )}
          </button>
        ))}
      </div>

    </div>
  );
}
