import { Play, Square, Download, Loader2, Volume2, VolumeX, Settings2, Grid3X3, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StyleSelector } from './StyleSelector';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { t } = useLanguage();

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-4 items-end">
        {/* Play Button - First */}
        <div className="flex items-center justify-center lg:justify-start">
          <button
            onClick={isPlaying ? onStop : onPlay}
            disabled={!hasChords || isExporting}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center
              transition-all duration-200 shadow-md hover:shadow-lg
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isPlaying 
                ? 'bg-destructive text-destructive-foreground hover:opacity-90' 
                : 'bg-primary text-primary-foreground hover:opacity-90'
              }
            `}
            aria-label={isPlaying ? t('stop') : t('play')}
          >
            {isPlaying ? <Square size={22} /> : <Play size={22} className="ml-0.5" />}
          </button>
        </div>

        {/* Middle: Controls */}
        <div className="flex flex-wrap items-end gap-4">
          {/* BPM Control */}
          <div className="min-w-[160px] max-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">
                {t('tempo')}
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

          {/* Metronome */}
          <div className="flex flex-col items-center gap-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('metronome')}
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
          
          {/* Transpose */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
              {t('transpose')}
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

          {/* Song Title */}
          <div className="flex-1 min-w-[150px] max-w-[250px]">
            <Label htmlFor="song-title" className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
              {t('songTitle')}
            </Label>
            <Input
              id="song-title"
              value={songTitle}
              onChange={(e) => onSongTitleChange(e.target.value)}
              placeholder="My Song"
              className="bg-background"
            />
          </div>
        </div>

        {/* Right: Export */}
        <div className="flex items-end">
          <Button
            onClick={onExport}
            disabled={!hasChords || isPlaying || isExporting}
            className="h-10 gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('exporting')}
              </>
            ) : (
              <>
                <Download size={16} />
                {t('export')}
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
          {t('instruments')}
        </Button>
        
        <Button variant="outline" size="sm" onClick={onOpenRhythmEditor} className="gap-1.5 h-8">
          <Grid3X3 className="h-3.5 w-3.5" />
          {t('editRhythm')}
        </Button>
        
        {onCreateNewRhythm && (
          <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            {t('newRhythm')}
          </Button>
        )}
      </div>
    </div>
  );
}
