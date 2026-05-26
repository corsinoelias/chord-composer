import { useState, useCallback, useEffect, useRef } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString, serializeChords } from '@/lib/chordParser';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { MUSICAL_STYLES } from '@/lib/styles';
import { createSection } from '@/lib/sections';
import { Play, Square, ExternalLink, Music2 } from 'lucide-react';

interface ChordEmbedProps {
  chords: string;
  bpm?: number;
  style?: string;
  title?: string;
}

function ChordEmbedInner({ chords, bpm = 100, style = 'pop_basic', title }: ChordEmbedProps) {
  const { state: playbackState, play, stop } = usePlayback();
  const { isPlaying, currentChordIndex } = playbackState;
  const parsedChords = parseChordString(chords);
  const [isLoading, setIsLoading] = useState(false);
  const sectionRef = useRef([{
    ...createSection('Section A'),
    chords: parsedChords,
  }]);

  const instruments = getDefaultInstrumentStates();
  const selectedStyle = MUSICAL_STYLES.find(s => s.id === style) ?? MUSICAL_STYLES[0];

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }
    if (parsedChords.length === 0) return;
    setIsLoading(true);
    try {
      await play(sectionRef.current, {
        bpm,
        metronome: false,
        instruments,
        styleId: selectedStyle.id,
        transposition: 0,
        liveEditedStyle: null,
        customStyles: [],
        loopingSectionIndex: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, parsedChords, play, stop, bpm, instruments, selectedStyle]);

  useEffect(() => {
    sectionRef.current = [{ ...createSection('Section A'), chords: parsedChords }];
  }, [chords]);

  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  const editorUrl = `/editor?chords=${encodeURIComponent(serializeChords(parsedChords))}&bpm=${bpm}&style=${style}`;

  if (parsedChords.length === 0) return null;

  return (
    <div className="not-prose my-6 rounded-xl border border-border bg-card overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
          <Music2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
      )}

      <div className="px-4 py-3">
        {/* Chord blocks */}
        <div className="flex flex-wrap gap-2 mb-3">
          {parsedChords.map((chord, i) => {
            const isActive = isPlaying && currentChordIndex === i;
            return (
              <div
                key={chord.id}
                className={`
                  inline-flex items-center justify-center min-w-[48px] px-3 py-1.5 rounded-lg
                  text-sm font-semibold border transition-all duration-150
                  ${isActive
                    ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-md'
                    : 'bg-background text-foreground border-border'
                  }
                `}
              >
                {chord.root}{chord.accidental}
                <span className="text-xs font-normal ml-0.5 opacity-75">
                  {chord.quality === 'maj' ? '' : chord.quality === 'min' ? 'm' : chord.quality}
                </span>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              disabled={isLoading}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${isPlaying
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isPlaying ? (
                <><Square className="w-3.5 h-3.5" /> Stop</>
              ) : (
                <><Play className="w-3.5 h-3.5" /> Play</>
              )}
            </button>
            <span className="text-xs text-muted-foreground">{bpm} BPM · {selectedStyle.name}</span>
          </div>

          <a
            href={editorUrl}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
          >
            Open in Editor
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ChordEmbed(props: ChordEmbedProps) {
  return (
    <PlaybackProvider>
      <ChordEmbedInner {...props} />
    </PlaybackProvider>
  );
}
