import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { DurationDots } from '@/components/DurationDots';
import { playChordPreview } from '@/lib/audioEngine';

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
}

type View = 'piano' | 'guitar';

export default function ChordAside({ chords, songKey }: Props) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<View>('piano');
  const [semitones, setSemitones] = useState(0);
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeKey, setActiveKey] = useState(-1);
  const [duration, setDuration] = useState(4);
  const [bpm, setBpm] = useState(120);

  // Collapse "Chords used" by default on desktop (>=1024px, matches the `lg:` layout
  // breakpoint) so it doesn't compete for attention with the Now Playing visualizer.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setOpen(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setSemitones((e as CustomEvent<{ semitones: number }>).detail.semitones);
    };
    window.addEventListener('song-transpose', handler);
    return () => window.removeEventListener('song-transpose', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ chord: string | null; isPlaying: boolean; duration: number; bpm: number; key: number }>).detail;
      setActiveChord(detail.chord);
      setIsPlaying(detail.isPlaying);
      setDuration(detail.duration);
      setBpm(detail.bpm);
      setActiveKey(detail.key);
    };
    window.addEventListener('song-active-chord', handler);
    return () => window.removeEventListener('song-active-chord', handler);
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

  const nowPlayingChord = activeChord ?? displayedChords[0] ?? null;
  const nowPlayingItem = (() => {
    if (!nowPlayingChord) return null;
    const parsed = parseChordString(nowPlayingChord);
    const chordObj = parsed[0] ?? null;
    if (!chordObj) return null;
    const notes = getChordNotes(chordObj);
    const voicing = getGuitarVoicing(chordObj);
    if (notes.length === 0) return null;
    return { chord: nowPlayingChord, notes, voicing };
  })();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Now playing visualizer ── */}
      {nowPlayingItem && (
        <div className="px-3 py-3 border-b border-border bg-primary/5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground text-center mb-2">
            {isPlaying ? 'Now playing' : 'Chord preview'}
          </p>
          <div className="flex justify-center text-primary mb-3">
            <DurationDots key={activeKey} duration={duration} isActive={isPlaying} bpm={bpm} uid={activeKey} size={9} />
          </div>
          <div className="flex flex-col items-center gap-3">
            {nowPlayingItem.voicing && (
              <GuitarChordDiagram voicing={nowPlayingItem.voicing} chordName={nowPlayingItem.chord} className="w-24" />
            )}
            <PianoKeyboard
              activeNotes={nowPlayingItem.notes}
              chordName={nowPlayingItem.voicing ? undefined : nowPlayingItem.chord}
              className="w-full max-w-[220px]"
            />
          </div>
        </div>
      )}

      {/* ── Header / accordion toggle ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left group"
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Chords used
          </span>
          <span className="text-xs text-muted-foreground/50 font-mono tabular-nums">
            {items.length}
          </span>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
          }
        </button>

        {/* piano / guitar toggle — only visible when open */}
        {open && (
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {(['piano', 'guitar'] as View[]).map(v => (
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
        )}
      </div>

      {/* ── Chord list ── */}
      {open && (
        <div className="border-t border-border divide-y divide-border/40 max-h-[70vh] overflow-y-auto">
          {items.map(({ chord, chordObj, notes, voicing }) => (
            <div key={chord} className="px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold font-mono text-foreground">{chord}</span>
                <button
                  onClick={() => chordObj && playChordPreview(chordObj)}
                  title={`Play ${chord}`}
                  className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Play className="w-3 h-3" />
                </button>
              </div>

              {view === 'piano' ? (
                <PianoKeyboard activeNotes={notes} className="w-full" />
              ) : voicing ? (
                <GuitarChordDiagram voicing={voicing} className="w-full" />
              ) : (
                <p className="text-[10px] text-muted-foreground text-center py-3">
                  No voicing available
                </p>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
