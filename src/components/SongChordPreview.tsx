import { useState, useEffect } from 'react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
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

// The "what's sounding right now" visualizer — a piano/guitar diagram of the active chord (or
// the song's first chord before playback starts). Its own island, up near the top of the page
// (see [slug].astro), separate from ChordAside's "Chords used" list below the chart: burying
// this under a whole song's worth of chart used to mean scrolling past everything just to see
// it while playing.
export default function SongChordPreview({ chords, songKey }: Props) {
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
    const voicing = getGuitarVoicing(chordObj);
    if (notes.length === 0) return null;
    return { chord: nowPlayingChord, notes, voicing };
  })();

  if (!nowPlayingItem) return null;

  return (
    <div className="rounded-xl border border-border bg-primary/5 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground text-center mb-2">
        {isPlaying ? 'Now playing' : 'Chord preview'}
      </p>
      <div className="flex justify-center text-primary mb-3">
        <DurationDots duration={duration} isActive={isPlaying} bpm={bpm} uid="now-playing" rawIndex={rawIndex} size={9} />
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
  );
}
