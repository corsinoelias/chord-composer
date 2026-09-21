import { memo, useMemo } from 'react';
import { type Chord } from '@/lib/musicTheory';
import { getTransposedChordName } from '@/lib/chordNotes';
import { BeatDots } from './BeatDots';
import { qualityClass } from '@/lib/chordColors';

/** Split a transposed chord name into [chordPart, bassNotePart | null] */
function splitChordName(chord: Chord, transposition: number, preferFlats: boolean): [string, string | null] {
  const full = getTransposedChordName(chord, transposition, preferFlats, true)
  const slash = full.indexOf('/')
  if (slash === -1) return [full, null]
  return [full.slice(0, slash), full.slice(slash)]  // bass part keeps the '/'
}

interface ChordBlockProps {
  chord: Chord;
  isPlaying: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  transposition?: number;
  /** Spell black keys as flats — set by the key the song is in. */
  preferFlats?: boolean;
  isOutOfScale?: boolean;
  /** Tempo and playback index, so the beat dots can fill themselves while it sounds. */
  bpm?: number;
  rawIndex?: number | string;
  /** The drag overlay renders at a fixed size instead of filling its grid cell. */
  fixedWidth?: boolean;
  /**
   * Where the chord sits in the song's key ("vi", "♭VII"), as the Android app shows it
   * under every chord. Borrowed chords read the same, only quieter.
   */
  degree?: { numeral: string; borrowed: boolean } | null;
}

export const ChordBlock = memo(function ChordBlock({
  chord,
  isPlaying,
  isSelected = false,
  isDragging,
  transposition = 0,
  preferFlats = false,
  isOutOfScale = false,
  bpm = 120,
  rawIndex = 0,
  fixedWidth = false,
  degree = null,
}: ChordBlockProps) {
  const quality = useMemo(() => qualityClass(chord.quality), [chord.quality]);
  // A chord written as a flat keeps reading as one even in a sharp key: someone who
  // typed Ab should not be shown G#.
  const [chordPart, bassPart] = useMemo(
    () => splitChordName(chord, transposition, preferFlats || chord.accidental === 'b'),
    [chord, transposition, preferFlats],
  );

  return (
    <span
      className={`cp-ch ${quality} ${isPlaying ? 'cp-on' : ''} ${isSelected ? 'cp-sel' : ''} ${
        isDragging ? 'cp-drag' : ''
      }`}
      style={{
        width: fixedWidth ? 120 : undefined,
        opacity: isOutOfScale && !isPlaying ? 0.4 : undefined,
      }}
    >
      <span className="flex min-w-0 max-w-full items-baseline gap-1">
        <span className="cp-cn">{chordPart}</span>
        {bassPart && <span className="cp-cb">{bassPart}</span>}
      </span>
      {degree && (
        <span className={`cp-deg ${degree.borrowed ? 'cp-bor' : ''}`}>{degree.numeral}</span>
      )}
      <BeatDots
        duration={chord.duration ?? 4}
        isActive={isPlaying}
        bpm={bpm}
        rawIndex={rawIndex}
      />
    </span>
  );
});
