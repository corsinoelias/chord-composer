import { memo } from 'react';
import { PianoKeyboard } from './PianoKeyboard';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { InstrumentViewSelector } from './InstrumentViewSelector';
import { BeatDots } from './BeatDots';
import type { ChordView } from '@/hooks/useSyncedChordView';

interface ChordPreviewCardProps {
  isPlaying: boolean;
  chordName: string;
  /** Beats the chord lasts, plus the tempo and index its dots animate from. */
  duration: number;
  bpm: number;
  rawIndex: number | string;
  activeNotes: string[];
  guitarVoicing: Parameters<typeof GuitarChordDiagram>[0]['voicing'] | null;
  ukuleleVoicing: Parameters<typeof GuitarChordDiagram>[0]['voicing'] | null;
  view: ChordView;
  onViewChange: (v: ChordView) => void;
  className?: string;
}

/**
 * The top card of the right rail: the chord under the playhead, big, with the shape to
 * play it. Reads "Chord preview" when stopped and "Now playing" — ringed and pulsing —
 * while the song runs.
 */
export const ChordPreviewCard = memo(function ChordPreviewCard({
  isPlaying,
  chordName,
  duration,
  bpm,
  rawIndex,
  activeNotes,
  guitarVoicing,
  ukuleleVoicing,
  view,
  onViewChange,
  className = '',
}: ChordPreviewCardProps) {
  return (
    <section
      className={`cp-card px-4 pb-4 pt-4 lg:px-[18px] lg:pb-[18px] ${className}`}
      aria-label={isPlaying ? 'Now playing' : 'Chord preview'}
      style={
        isPlaying
          ? {
              borderColor: 'color-mix(in srgb, var(--cp-ac) 50%, transparent)',
              boxShadow: '0 0 0 4px color-mix(in srgb, var(--cp-ac) 10%, transparent)',
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <span className="cp-pd" />
          ) : (
            <span
              className="shrink-0"
              style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--cp-ln2)' }}
              aria-hidden="true"
            />
          )}
          <span className="cp-lbl" style={isPlaying ? { color: 'var(--cp-act)' } : undefined}>
            {isPlaying ? 'Now playing' : 'Chord preview'}
          </span>
        </div>
        <InstrumentViewSelector value={view} onChange={onViewChange} variant="seg" />
      </div>

      <div className="flex flex-col items-center gap-2.5 pb-5 pt-[22px]">
        <span className="cp-mono text-[52px] font-bold leading-none tracking-tight">
          {chordName || '—'}
        </span>
        <BeatDots
          duration={duration}
          isActive={isPlaying}
          bpm={bpm}
          rawIndex={rawIndex}
          style={{ color: 'var(--cp-act)' }}
        />
      </div>

      <div className="flex items-center justify-center">
        {view === 'piano' ? (
          <div className="cp-keys w-full">
            <PianoKeyboard
              activeNotes={activeNotes}
              chordName={chordName}
              variant="player"
              className="w-full"
            />
          </div>
        ) : view === 'ukulele' ? (
          ukuleleVoicing ? (
            <GuitarChordDiagram voicing={ukuleleVoicing} className="w-32 shrink-0" />
          ) : (
            <p className="py-2 text-xs" style={{ color: 'var(--cp-mu)' }}>No ukulele voicing available</p>
          )
        ) : guitarVoicing ? (
          <GuitarChordDiagram voicing={guitarVoicing} className="w-32 shrink-0" />
        ) : (
          <p className="py-2 text-xs" style={{ color: 'var(--cp-mu)' }}>No guitar voicing available</p>
        )}
      </div>
    </section>
  );
});
