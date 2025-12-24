import { Play, Square, RotateCcw, Download, Loader2 } from 'lucide-react';

interface TransportControlsProps {
  isPlaying: boolean;
  isExporting: boolean;
  bpm: number;
  onPlay: () => void;
  onStop: () => void;
  onReset: () => void;
  onExport: () => void;
  onBpmChange: (bpm: number) => void;
  hasChords: boolean;
}

/**
 * TransportControls Component
 * 
 * Provides playback controls (Play, Stop, Reset), tempo adjustment,
 * and export functionality.
 */
export function TransportControls({
  isPlaying,
  isExporting,
  bpm,
  onPlay,
  onStop,
  onReset,
  onExport,
  onBpmChange,
  hasChords,
}: TransportControlsProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? onStop : onPlay}
            disabled={!hasChords || isExporting}
            className={`
              w-12 h-12 rounded-full
              flex items-center justify-center
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isPlaying 
                ? 'bg-destructive text-destructive-foreground hover:opacity-90' 
                : 'bg-primary text-primary-foreground hover:opacity-90'
              }
              shadow-md hover:shadow-lg
            `}
            aria-label={isPlaying ? 'Stop' : 'Play'}
          >
            {isPlaying ? <Square size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          
          <button
            onClick={onReset}
            disabled={!hasChords || isPlaying || isExporting}
            className="
              w-10 h-10 rounded-full
              bg-secondary text-secondary-foreground
              flex items-center justify-center
              transition-all duration-200
              hover:bg-accent
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            aria-label="Reset"
          >
            <RotateCcw size={16} />
          </button>
        </div>
        
        {/* BPM Control */}
        <div className="flex-1 min-w-[180px] max-w-[280px]">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Tempo
            </label>
            <span className="font-mono text-sm font-medium">
              {bpm} BPM
            </span>
          </div>
          <input
            type="range"
            min={40}
            max={200}
            value={bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value))}
            disabled={isPlaying || isExporting}
            className="
              w-full h-2 bg-secondary rounded-lg 
              appearance-none cursor-pointer accent-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>40</span>
            <span>200</span>
          </div>
        </div>
        
        {/* Export Button */}
        <button
          onClick={onExport}
          disabled={!hasChords || isPlaying || isExporting}
          className="
            h-10 px-5 rounded-lg
            bg-primary text-primary-foreground
            font-medium text-sm
            flex items-center gap-2
            transition-all duration-200
            hover:opacity-90
            disabled:opacity-50 disabled:cursor-not-allowed
            shadow-sm
            ml-auto
          "
        >
          {isExporting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download size={16} />
              Export MP3
            </>
          )}
        </button>
      </div>
    </div>
  );
}
