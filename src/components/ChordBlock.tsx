import { memo, useMemo } from 'react';
import { type Chord } from '@/lib/musicTheory';
import { BeatDots } from './BeatDots';
import { qualityClass } from '@/lib/chordColors';
import { chordNameParts, useChordDisplay } from '@/lib/chordDisplay';
import { type DetectedKey } from '@/lib/keyDetect';

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
   * The song's key as stored, for writing the chord as a number or a numeral (the app's
   * Ajustes › Cifrado). Without it those fall back to the chord's name.
   */
  songKey?: DetectedKey | null;
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
  songKey = null,
}: ChordBlockProps) {
  const quality = useMemo(() => qualityClass(chord.quality), [chord.quality]);
  const display = useChordDisplay();
  // One name, in the notation chosen, set as a chord chart sets it: the root large, its
  // accidental and extension small and raised, the bass quieter after it.
  const p = useMemo(
    () => chordNameParts(chord, display, { transposition, keyFlats: preferFlats, key: songKey }),
    [chord, display, transposition, preferFlats, songKey],
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
      <span className="flex min-w-0 max-w-full items-baseline">
        <span className="cp-cn">
          {p.before && <sup className="cp-up cp-acc">{p.before}</sup>}
          {p.root}
          {p.accidental && <sup className="cp-up cp-acc">{p.accidental}</sup>}
          {p.minor && <span className="cp-min-m">{p.minor}</span>}
          {p.extension && <sup className="cp-up cp-ext">{p.extension}</sup>}
        </span>
        {p.bass && <span className="cp-cb">{p.bass}</span>}
      </span>
      <BeatDots
        duration={chord.duration ?? 4}
        isActive={isPlaying}
        bpm={bpm}
        rawIndex={rawIndex}
      />
    </span>
  );
});
