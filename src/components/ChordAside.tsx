import { useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { InstrumentViewSelector } from '@/components/InstrumentViewSelector';
import { useSyncedChordView } from '@/hooks/useSyncedChordView';
import { useSongNotation } from '@/hooks/useSongNotation';
import { displayChord } from '@/lib/songNotation';
import { useHorizontalScrollArrows } from '@/hooks/useHorizontalScrollArrows';
import { playChordPreview } from '@/lib/appEngine/preview';
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

export default function ChordAside({ chords, songKey, songSlug }: Props) {
  const [view, setView] = useSyncedChordView('guitar');
  const [notation] = useSongNotation();
  const [semitones, setSemitones] = useState(0);
  const { ref: stripRef, canScrollLeft, canScrollRight, scrollByPage } = useHorizontalScrollArrows<HTMLDivElement>();

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
      const guitarVoicing = chordObj ? getGuitarVoicing(chordObj) : null;
      const ukuleleVoicing = chordObj ? getUkuleleVoicing(chordObj) : null;
      return { chord, chordObj, notes, guitarVoicing, ukuleleVoicing };
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
        <InstrumentViewSelector value={view} onChange={setView} className="ml-auto" />
      </div>

      {/* ── Chord strip — always visible, horizontal scroll, one tap per chord to hear it.
          Diagrams stay chrome-free at rest; on hover, the diagram itself "pops" into an
          elevated card with a play-button overlay (mirrors the reference chord-chart hover
          pattern) so the strip signals "click me to hear this" without extra copy. Native
          scrollbar hidden and replaced with prev/next arrows — same reasoning as Structure:
          a mouse has no drag/swipe gesture to move the strip once the scrollbar's gone. ── */}
      <div className="flex items-center gap-1 px-1 py-4">
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={!canScrollLeft}
          aria-label="Scroll chords left"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-opacity"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          ref={stripRef}
          className="flex gap-5 overflow-x-auto px-3 min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map(({ chord, chordObj, notes, guitarVoicing, ukuleleVoicing }) => (
            <button
              key={chord}
              type="button"
              onClick={() => {
                if (!chordObj) return;
                analytics.playChordPreview(songSlug, chord, 'aside');
                playChordPreview(chordObj);
              }}
              title={`Play ${chord}`}
              className="group relative flex flex-col items-center gap-1.5 shrink-0 hover:z-10"
            >
              <span className="text-sm font-bold text-primary group-hover:text-primary/80 transition-colors">
                {displayChord(chord, displayKey, notation)}
              </span>
              <div className="relative rounded-xl p-2 -m-2 transition-all duration-150 group-hover:bg-card group-hover:shadow-lg group-hover:shadow-black/10 group-hover:ring-1 group-hover:ring-border group-hover:-translate-y-0.5">
                {view === 'piano' ? (
                  <PianoKeyboard activeNotes={notes} className="w-36" />
                ) : view === 'ukulele' ? (
                  ukuleleVoicing ? (
                    <GuitarChordDiagram voicing={ukuleleVoicing} className="w-16" />
                  ) : (
                    <span className="w-16 h-24 flex items-center justify-center text-[9px] text-muted-foreground text-center">
                      No voicing
                    </span>
                  )
                ) : guitarVoicing ? (
                  <GuitarChordDiagram voicing={guitarVoicing} className="w-20" />
                ) : (
                  <span className="w-20 h-24 flex items-center justify-center text-[9px] text-muted-foreground text-center">
                    No voicing
                  </span>
                )}
                {/* Play overlay — only makes sense once there's something to actually hear */}
                {chordObj && (
                  <div className="absolute inset-2 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-foreground/85 text-background shadow-md">
                      <Play className="w-4 h-4 ml-0.5 fill-current" />
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={!canScrollRight}
          aria-label="Scroll chords right"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-opacity"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
