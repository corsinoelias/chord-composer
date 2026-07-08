import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString, serializeChords } from '@/lib/chordParser';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { MUSICAL_STYLES } from '@/lib/styles';
import { createSection } from '@/lib/sections';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { Play, Square, ExternalLink, Music2 } from 'lucide-react';
import { analytics } from '@/lib/analytics';

interface ChordEmbedProps {
  chords: string;
  bpm?: number;
  style?: string;
  title?: string;
  toolContext?: string;
}

function ChordEmbedInner({ chords, bpm = 100, style = 'pop_basic', title, toolContext }: ChordEmbedProps) {
  const { state: playbackState, play, stop } = usePlayback();
  const { isPlaying, currentChordIndex } = playbackState;
  const parsedChords = useMemo(() => parseChordString(chords), [chords]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const sectionRef = useRef([{
    ...createSection('Section A'),
    chords: parsedChords,
  }]);

  const selectedStyle = MUSICAL_STYLES.find(s => s.id === style) ?? MUSICAL_STYLES[0];
  // Apply the style's own instrument sound types (e.g. 'electric' guitar) — without this,
  // every instrument falls back to its generic default sound (guitar defaults to a soundfont
  // patch that loads over the network and can miss the first playback entirely).
  const instruments = getEffectiveInstruments(getDefaultInstrumentStates(), selectedStyle);

  const visualChord = useMemo(() => {
    if (isPlaying) return parsedChords[currentChordIndex] ?? parsedChords[0] ?? null;
    return parsedChords[selectedIdx] ?? parsedChords[0] ?? null;
  }, [isPlaying, currentChordIndex, selectedIdx, parsedChords]);

  const embedActiveNotes = useMemo(
    () => (visualChord ? getChordNotes(visualChord, 0) : []),
    [visualChord],
  );
  const embedGuitarVoicing = useMemo(
    () => (visualChord ? getGuitarVoicing(visualChord, 0) : null),
    [visualChord],
  );
  const embedChordName = useMemo(
    () => (visualChord ? getTransposedChordName(visualChord, 0) : ''),
    [visualChord],
  );

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }
    if (parsedChords.length === 0) return;
    if (toolContext) analytics.toolWidgetUsed(toolContext);
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
        melodic: selectedStyle.melodic,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, parsedChords, play, stop, bpm, instruments, selectedStyle, toolContext]);

  useEffect(() => {
    sectionRef.current = [{ ...createSection('Section A'), chords: parsedChords }];
  }, [chords]);

  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  const editorUrl = `/editor/?chords=${encodeURIComponent(serializeChords(parsedChords))}&bpm=${bpm}&style=${style}`;

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
            const isPlayingActive = isPlaying && currentChordIndex === i;
            const isSelected = !isPlaying && selectedIdx === i;
            return (
              <button
                key={chord.id}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`
                  inline-flex items-center justify-center min-w-[48px] px-3 py-1.5 rounded-lg
                  text-sm font-semibold border transition-all duration-150
                  ${isPlayingActive
                    ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-md'
                    : isSelected
                      ? 'bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30'
                      : 'bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5'
                  }
                `}
              >
                {chord.root}{chord.accidental}
                <span className="text-xs font-normal ml-0.5 opacity-75">
                  {chord.quality === 'maj' ? '' : chord.quality === 'min' ? 'm' : chord.quality}
                </span>
              </button>
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
            aria-label={title ? `Open "${title}" in Editor` : 'Open in Editor'}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors min-h-[44px] py-3"
          >
            Open in Editor
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Chord visualization */}
        {visualChord && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {embedGuitarVoicing && (
                <GuitarChordDiagram
                  voicing={embedGuitarVoicing}
                  chordName={embedChordName}
                  className="w-24 sm:w-28 flex-shrink-0"
                />
              )}
              <PianoKeyboard
                activeNotes={embedActiveNotes}
                chordName={embedGuitarVoicing ? undefined : embedChordName}
                className="w-full"
              />
            </div>
          </div>
        )}
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
