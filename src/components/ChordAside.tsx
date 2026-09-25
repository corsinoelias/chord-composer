import { useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, ChevronDown, Pin } from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
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

const PIN_KEY = 'song-strip-pinned';
const FOLD_KEY = 'song-strip-folded';

interface Props {
  chords: string[];
  songKey: string;
  songSlug: string;
  className?: string;
}

export default function ChordAside({ chords, songKey, songSlug, className = '' }: Props) {
  const [view, setView] = useSyncedChordView('guitar');
  const [notation] = useSongNotation();
  const [semitones, setSemitones] = useState(0);
  // With a capo the strip draws shapes (semitones already includes it); a tap still has to
  // sound the chord the song plays, `capo` semitones above the shape.
  const [capo, setCapo] = useState(0);
  // The chord sounding now and the one after it (SongChordPlayer's song-active-chord event),
  // marked Now / Next on the diagrams so the strip doubles as the player's chord display.
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [nextChord, setNextChord] = useState<string | null>(null);
  // Pinned = the strip stays on screen under the chart toolbar while you scroll (md and up;
  // on a phone the bottom bar already shows the chord now and next). Remembered per browser.
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try { setPinned(localStorage.getItem(PIN_KEY) === '1'); } catch { /* storage blocked */ }
  }, []);
  // Folded = just the header row; the chart moves up. Remembered per browser, like pinning.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try { setFolded(localStorage.getItem(FOLD_KEY) === '1'); } catch { /* storage blocked */ }
  }, []);
  const toggleFolded = () => {
    const next = !folded;
    setFolded(next);
    try { localStorage.setItem(FOLD_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    try { localStorage.setItem(PIN_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
    analytics.songStripPinned(songSlug, next);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ chord: string | null; next?: string | null; isPlaying: boolean }>).detail;
      setActiveChord(d.isPlaying ? d.chord : null);
      setNextChord(d.isPlaying ? d.next ?? null : null);
    };
    window.addEventListener('song-active-chord', handler);
    return () => window.removeEventListener('song-active-chord', handler);
  }, []);
  const { ref: stripRef, canScrollLeft, canScrollRight, scrollByPage } = useHorizontalScrollArrows<HTMLDivElement>();

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ semitones: number; capo?: number }>).detail;
      setSemitones(d.semitones);
      setCapo(d.capo ?? 0);
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
    // Pinned: sticks right under SongChordPlayer's toolbar (--song-toolbar-h) until the chart ends.
    <div
      className={`-mx-4 sm:-mx-6 md:mx-0 border-y md:border md:rounded-xl border-border bg-card overflow-hidden ${className} ${pinned
        ? 'md:sticky md:z-20 md:top-[calc(var(--song-nav-h,4rem)+var(--song-toolbar-h,3.5rem))] md:shadow-[0_10px_22px_-16px_rgba(0,0,0,0.45)]'
        : ''}`}
    >

      {/* ── Header ── */}
      <div className={`flex items-center gap-2 pl-3.5 pr-2 py-1.5 ${folded ? '' : 'border-b border-border/60'}`}>
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Chords
        </span>
        <span className="text-[11px] font-semibold text-foreground/70 bg-secondary rounded-md px-1.5 tabular-nums">
          {items.length}
        </span>
        <div className="ml-auto inline-flex p-0.5 rounded-lg bg-secondary/60" role="group" aria-label="Instrument">
          {(['guitar', 'piano', 'ukulele'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={togglePinned}
          aria-pressed={pinned}
          title={pinned ? 'Let the diagrams scroll with the page' : 'Keep the diagrams on screen while you scroll'}
          className={`hidden md:grid place-items-center w-7 h-7 rounded-md transition-colors ${pinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleFolded}
          aria-expanded={!folded}
          title={folded ? 'Show the chord diagrams' : 'Hide the chord diagrams'}
          className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${folded ? '-rotate-90' : ''}`} />
        </button>
      </div>

      {/* ── Chord strip — always visible, horizontal scroll, one tap per chord to hear it.
          Diagrams stay chrome-free at rest; on hover, the diagram itself "pops" into an
          elevated card with a play-button overlay (mirrors the reference chord-chart hover
          pattern) so the strip signals "click me to hear this" without extra copy. Native
          scrollbar hidden and replaced with prev/next arrows — same reasoning as Structure:
          a mouse has no drag/swipe gesture to move the strip once the scrollbar's gone. ── */}
      {!folded && <div className={`flex items-center gap-1 px-1 ${pinned ? 'py-2 md:py-1' : 'py-2'}`}>
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
          className="flex gap-2 md:gap-5 overflow-x-auto px-1 md:px-3 min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map(({ chord, chordObj, notes, guitarVoicing, ukuleleVoicing }) => {
            const isNow = chord === activeChord;
            const isNext = !isNow && chord === nextChord;
            return (
            <button
              key={chord}
              type="button"
              onClick={() => {
                if (!chordObj) return;
                analytics.playChordPreview(songSlug, chord, 'aside');
                const sounding = capo === 0 ? chordObj : parseChordString(transposeChordStr(chord, capo, useFlats))[0] ?? chordObj;
                playChordPreview(sounding);
              }}
              title={`Play ${chord}`}
              className={`group relative flex flex-col items-center gap-1 shrink-0 hover:z-10 rounded-xl px-1.5 pt-0.5 pb-1.5 border transition-colors
                ${isNow ? 'border-primary bg-primary/[0.07]' : isNext ? 'border-dashed border-primary/50' : 'border-transparent'}`}
            >
              <span className={`h-3 text-[9px] font-bold uppercase tracking-widest leading-3 ${isNow ? 'text-primary' : 'text-muted-foreground'}`}>
                {isNow ? 'Now' : isNext ? 'Next' : ''}
              </span>
              <span className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors">
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
                  <GuitarChordDiagram voicing={guitarVoicing} className={pinned ? 'w-12 md:w-14' : 'w-12 md:w-16'} />
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
            );
          })}
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
      </div>}

    </div>
  );
}
