import { memo } from 'react';
import { Play, Square, RotateCcw, Download, Loader2, Volume2, VolumeX, Settings2, Grid3X3, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StyleSelector } from './StyleSelector';

import { StylePattern } from '@/lib/styles';

interface TransportControlsProps {
  isPlaying: boolean;
  isExporting: boolean;
  bpm: number;
  metronomeEnabled: boolean;
  selectedStyleId: string;
  songTitle: string;
  transposition: number;
  customStyles?: StylePattern[];
  onPlay: () => void;
  onStop: () => void;
  onReset: () => void;
  onExport: () => void;
  onBpmChange: (bpm: number) => void;
  onMetronomeToggle: (enabled: boolean) => void;
  onStyleChange: (styleId: string) => void;
  onSongTitleChange: (title: string) => void;
  onTranspositionChange: (semitones: number) => void;
  onOpenInstruments: () => void;
  onOpenRhythmEditor: () => void;
  onCreateNewRhythm?: () => void;
  hasChords: boolean;
}

/**
 * TransportControls Component
 * 
 * Provides playback controls (Play, Stop, Reset), tempo adjustment,
 * metronome toggle, and export functionality.
 * Memoized to prevent unnecessary re-renders.
 */
export const TransportControls = memo(function TransportControls({
  isPlaying,
  isExporting,
  bpm,
  metronomeEnabled,
  selectedStyleId,
  songTitle,
  transposition,
  customStyles = [],
  onPlay,
  onStop,
  onReset,
  onExport,
  onBpmChange,
  onMetronomeToggle,
  onStyleChange,
  onSongTitleChange,
  onTranspositionChange,
  onOpenInstruments,
  onOpenRhythmEditor,
  onCreateNewRhythm,
  hasChords,
}: TransportControlsProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        {/* Left: Song Info */}
        <div className="flex flex-wrap items-end gap-4">
          {/* Song Title */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="song-title" className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
              Song Title
            </Label>
            <Input
              id="song-title"
              value={songTitle}
              onChange={(e) => onSongTitleChange(e.target.value)}
              placeholder="My Song"
              className="bg-background"
            />
          </div>
          
          {/* Transpose */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
              Transpose
            </Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTranspositionChange(transposition - 1)}
                disabled={transposition <= -12}
                className="h-9 w-9 p-0"
              >
                -
              </Button>
              <span className="w-10 text-center font-mono text-sm">
                {transposition > 0 ? `+${transposition}` : transposition}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTranspositionChange(transposition + 1)}
                disabled={transposition >= 12}
                className="h-9 w-9 p-0"
              >
                +
              </Button>
            </div>
          </div>

          {/* BPM Control */}
          <div className="min-w-[160px] max-w-[200px]">
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
              disabled={isExporting}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Right: Playback & Export */}
        <div className="flex items-end gap-3">
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={isPlaying ? onStop : onPlay}
              disabled={!hasChords || isExporting}
              className={`
                w-11 h-11 rounded-full flex items-center justify-center
                transition-all duration-200 shadow-md hover:shadow-lg
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isPlaying 
                  ? 'bg-destructive text-destructive-foreground hover:opacity-90' 
                  : 'bg-primary text-primary-foreground hover:opacity-90'
                }
              `}
              aria-label={isPlaying ? 'Stop' : 'Play'}
            >
              {isPlaying ? <Square size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            
          </div>

          {/* Metronome */}
          <div className="flex flex-col items-center gap-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Metronome
            </Label>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50">
              {metronomeEnabled ? (
                <Volume2 size={14} className="text-muted-foreground" />
              ) : (
                <VolumeX size={14} className="text-muted-foreground" />
              )}
              <Switch
                id="metronome"
                checked={metronomeEnabled}
                onCheckedChange={onMetronomeToggle}
                disabled={isExporting}
                className="scale-90"
              />
            </div>
          </div>

          {/* Export */}
          <Button
            onClick={onExport}
            disabled={!hasChords || isPlaying || isExporting}
            className="h-10 gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} />
                Export
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Bottom row: Style & Rhythm controls */}
      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
        <StyleSelector 
          selectedStyleId={selectedStyleId} 
          onStyleChange={onStyleChange}
          customStyles={customStyles}
          onCreateNew={onCreateNewRhythm}
        />
        
        <div className="h-6 w-px bg-border mx-1" />
        
        <Button variant="outline" size="sm" onClick={onOpenInstruments} className="gap-1.5 h-8">
          <Settings2 className="h-3.5 w-3.5" />
          Instruments
        </Button>
        
        <Button variant="outline" size="sm" onClick={onOpenRhythmEditor} className="gap-1.5 h-8">
          <Grid3X3 className="h-3.5 w-3.5" />
          Edit Rhythm
        </Button>
        
        {onCreateNewRhythm && (
          <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>
    </div>
  );
});
