import { usePlayback } from '@/contexts/PlaybackContext';
import { type Song, formatDuration, getSongDuration } from '@/lib/songs';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { Button } from '@/components/ui/button';
import { Play, Square, Volume2, VolumeX, X, Music2 } from 'lucide-react';

interface MiniPlayerProps {
  song: Song;
  onClose: () => void;
}

export function MiniPlayer({ song, onClose }: MiniPlayerProps) {
  const { state, play, stop, setBpm, setMetronomeEnabled } = usePlayback();

  const totalChords = song.sections.reduce((sum, s) => sum + s.chords.length, 0);
  const progressPct = state.isPlaying && totalChords > 0
    ? ((state.currentChordIndex + 1) / totalChords) * 100
    : 0;

  const duration = formatDuration(getSongDuration({ ...song, bpm: state.bpm }));

  const handlePlayPause = async () => {
    if (state.isPlaying) {
      stop();
    } else {
      await play(song.sections, {
        bpm: state.bpm,
        metronome: state.metronomeEnabled,
        instruments: song.instrumentSettings.length > 0
          ? song.instrumentSettings
          : getDefaultInstrumentStates(),
        styleId: song.styleId,
        transposition: song.transposition,
      });
    }
  };

  const handleClose = () => {
    stop();
    onClose();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      {/* Progress bar */}
      <div className="h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">
        {/* Song info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Music2 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">{song.title}</p>
            <p className="text-xs text-muted-foreground">{duration} · {song.sections.length} {song.sections.length === 1 ? 'section' : 'sections'}</p>
          </div>
        </div>

        {/* Center controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setMetronomeEnabled(!state.metronomeEnabled)}
            title={state.metronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
          >
            {state.metronomeEnabled
              ? <Volume2 className="h-4 w-4" />
              : <VolumeX className="h-4 w-4" />
            }
          </Button>

          <Button
            onClick={handlePlayPause}
            size="icon"
            className="h-10 w-10 rounded-full"
            variant={state.isPlaying ? 'destructive' : 'default'}
          >
            {state.isPlaying
              ? <Square className="h-4 w-4 fill-current" />
              : <Play className="h-4 w-4 fill-current ml-0.5" />
            }
          </Button>
        </div>

        {/* BPM controls — hidden on small screens */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 text-sm font-bold"
            onClick={() => setBpm(Math.max(40, state.bpm - 4))}
          >
            −
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-16 text-center tabular-nums">
            {state.bpm} BPM
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 text-sm font-bold"
            onClick={() => setBpm(Math.min(200, state.bpm + 4))}
          >
            +
          </Button>
        </div>

        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          onClick={handleClose}
          title="Close player"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
