import { useState, useEffect } from 'react';
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
import { DurationDots } from '@/components/DurationDots';

// ── Transpose helpers ─────────────────────────────────────────────────────────
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeChordStr(c: string, s: number, flats: boolean) {
  const slash = c.indexOf('/')
  const [chordPart, bassPart] = slash !== -1 ? [c.slice(0, slash), c.slice(slash + 1)] : [c, undefined]
  const m = chordPart.match(/^([A-G][#b]?)(.*)/)
  if (!m) return c
  const i = noteIndex(m[1])
  const transposed = (i === -1 ? m[1] : (flats ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12]) + m[2]
  if (!bassPart) return transposed
  const bm = bassPart.match(/^([A-G][#b]?)(.*)/)
  if (!bm) return transposed + '/' + bassPart
  const bi = noteIndex(bm[1])
  return transposed + '/' + (bi === -1 ? bm[1] : (flats ? FLATS : SHARPS)[((bi + s) % 12 + 12) % 12]) + bm[2]
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
}

// The "what's sounding right now" visualizer — a diagram of the active chord (or the song's
// first chord before playback starts). Its own island, up near the top of the page (see
// [slug].astro), separate from ChordAside's "Chords used" list below the chart: burying this
// under a whole song's worth of chart used to mean scrolling past everything just to see it
// while playing. Shows exactly ONE diagram at a time (view selector, not guitar+piano stacked)
// so the card stays compact instead of eating a screenful of vertical space.
export default function SongChordPreview({ chords, songKey }: Props) {
  const [view, setView] = useSyncedChordView('guitar');
  const [notation] = useSongNotation();
  const [semitones, setSemitones] = useState(0);
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rawIndex, setRawIndex] = useState(-1);
  const [duration, setDuration] = useState(4);
  const [bpm, setBpm] = useState(120);

  useEffect(() => {
    const handler = (e: Event) => {
      setSemitones((e as CustomEvent<{ semitones: number }>).detail.semitones);
    };
    window.addEventListener('song-transpose', handler);
    return () => window.removeEventListener('song-transpose', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ chord: string | null; isPlaying: boolean; duration: number; bpm: number; rawIndex: number }>).detail;
      setActiveChord(detail.chord);
      setIsPlaying(detail.isPlaying);
      setDuration(detail.duration);
      setBpm(detail.bpm);
      setRawIndex(detail.rawIndex);
    };
    window.addEventListener('song-active-chord', handler);
    return () => window.removeEventListener('song-active-chord', handler);
  }, []);

  const displayKey = semitones === 0 ? songKey : transposeKey(songKey, semitones);
  const useFlats = FLAT_KEYS.has(displayKey);
  const displayedChords = semitones === 0
    ? chords
    : chords.map(c => transposeChordStr(c, semitones, useFlats));

  const nowPlayingChord = activeChord ?? displayedChords[0] ?? null;
  const nowPlayingItem = (() => {
    if (!nowPlayingChord) return null;
    const parsed = parseChordString(nowPlayingChord);
    const chordObj = parsed[0] ?? null;
    if (!chordObj) return null;
    const notes = getChordNotes(chordObj);
    if (notes.length === 0) return null;
    const guitarVoicing = getGuitarVoicing(chordObj);
    const ukuleleVoicing = getUkuleleVoicing(chordObj);
    return { chord: nowPlayingChord, notes, guitarVoicing, ukuleleVoicing };
  })();

  if (!nowPlayingItem) return null;

  return (
    <div
      className={`rounded-2xl border bg-card overflow-hidden transition-colors
        ${isPlaying ? 'border-primary/30 shadow-sm shadow-primary/10' : 'border-border'}
      `}
    >
      {/* ── Header: live status + instrument selector — same selector as ChordAside's
          "Chords used", kept in sync via useSyncedChordView so switching either updates both. ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPlaying ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`}
          aria-hidden="true"
        />
        <p className={`text-[10px] font-bold uppercase tracking-widest ${isPlaying ? 'text-primary' : 'text-muted-foreground'}`}>
          {isPlaying ? 'Now playing' : 'Chord preview'}
        </p>
        <InstrumentViewSelector value={view} onChange={setView} className="ml-auto" />
      </div>

      {/* ── Body: chord identity on the left, diagram front and center on the right ── */}
      <div className="flex items-center gap-5 px-4 py-4">
        {/* min-w fixed regardless of chord name length ("B" vs "F#sus2") — otherwise this
            column's content-driven width changes the space left for the flex-1 diagram below
            to center in, and the diagram visibly drifts left/right as chords change. */}
        <div className="flex flex-col items-start gap-1.5 shrink-0 min-w-[110px]">
          <span className="text-2xl sm:text-3xl font-bold font-mono text-foreground tracking-tight leading-none">
            {displayChord(nowPlayingItem.chord, displayKey, notation)}
          </span>
          {/* Only for numbers. A "6m" says nothing about which chord to play, so it needs the
              name spelled out; "Sol♯m" already IS the name — printing "G#m" under it is the same
              word twice, and it made the card look like it was showing two different chords. */}
          {notation === 'number' && (
            <span className="text-xs font-medium font-mono text-muted-foreground leading-none">
              {nowPlayingItem.chord}
            </span>
          )}
          <span className="text-primary">
            <DurationDots duration={duration} isActive={isPlaying} bpm={bpm} uid="now-playing" rawIndex={rawIndex} size={7} />
          </span>
        </div>

        <div className="w-px self-stretch bg-border shrink-0" aria-hidden="true" />

        <div className="flex-1 flex justify-center">
          {view === 'piano' ? (
            <PianoKeyboard activeNotes={nowPlayingItem.notes} className="w-full max-w-[220px]" />
          ) : view === 'ukulele' ? (
            nowPlayingItem.ukuleleVoicing
              ? <GuitarChordDiagram voicing={nowPlayingItem.ukuleleVoicing} className="w-20" />
              : <p className="text-[10px] text-muted-foreground py-2">No ukulele voicing available</p>
          ) : (
            nowPlayingItem.guitarVoicing
              ? <GuitarChordDiagram voicing={nowPlayingItem.guitarVoicing} className="w-24" />
              : <p className="text-[10px] text-muted-foreground py-2">No guitar voicing available</p>
          )}
        </div>
      </div>
    </div>
  );
}
