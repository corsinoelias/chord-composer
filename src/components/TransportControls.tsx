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
 */
export function TransportControls({
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
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
      {/* Song Title */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
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
        <div className="w-32">
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
            <span className="w-12 text-center font-mono text-sm">
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
      </div>

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
        
        {/* Metronome Toggle */}
        <div className="flex items-center gap-2">
          {metronomeEnabled ? (
            <Volume2 size={16} className="text-muted-foreground" />
          ) : (
            <VolumeX size={16} className="text-muted-foreground" />
          )}
          <Switch
            id="metronome"
            checked={metronomeEnabled}
            onCheckedChange={onMetronomeToggle}
            disabled={isExporting}
          />
          <Label htmlFor="metronome" className="text-sm text-muted-foreground cursor-pointer">
            Metronome
          </Label>
        </div>

        {/* Style Selector */}
        <StyleSelector 
          selectedStyleId={selectedStyleId} 
          onStyleChange={onStyleChange}
          customStyles={customStyles}
          onCreateNew={onCreateNewRhythm}
        />

        {/* Instruments Button */}
        <Button variant="outline" size="sm" onClick={onOpenInstruments} className="gap-2">
          <Settings2 className="h-4 w-4" />
          Instruments
        </Button>
        
        {/* Edit Rhythm Button */}
        <Button variant="outline" size="sm" onClick={onOpenRhythmEditor} className="gap-2">
          <Grid3X3 className="h-4 w-4" />
          Edit Rhythm
        </Button>
        
        {/* Create New Rhythm Button */}
        {onCreateNewRhythm && (
          <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-2">
            <Plus className="h-4 w-4" />
            New Rhythm
          </Button>
        )}
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
            disabled={isExporting}
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
              Export WAV
            </>
          )}
        </button>
      </div>
    </div>
  );
}
