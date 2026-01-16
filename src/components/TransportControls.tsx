import { memo, useState } from 'react';
import { Play, Square, Download, Loader2, Volume2, VolumeX, Settings2, Grid3X3, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        {/* Main Controls Row */}
        <div className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start lg:items-center">
            {/* Hero Play Button */}
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={isPlaying ? onStop : onPlay}
                    disabled={!hasChords || isExporting}
                    className={`
                      relative w-16 h-16 rounded-full flex items-center justify-center
                      transition-all duration-300 
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                      ${isPlaying 
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 scale-100' 
                        : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-[var(--shadow-glow)]'
                      }
                    `}
                    style={{
                      boxShadow: isPlaying ? 'none' : 'var(--shadow-lg)',
                    }}
                    aria-label={isPlaying ? 'Stop' : 'Play'}
                  >
                    {isPlaying ? (
                      <Square size={22} fill="currentColor" />
                    ) : (
                      <Play size={26} fill="currentColor" className="ml-1" />
                    )}
                    
                    {/* Pulse animation when playing */}
                    {isPlaying && (
                      <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-20" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isPlaying ? 'Stop playback' : 'Start playback'}</TooltipContent>
              </Tooltip>

              {/* BPM Control - Compact */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tempo
                  </span>
                  <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                    {bpm}
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={200}
                  value={bpm}
                  onChange={(e) => onBpmChange(parseInt(e.target.value))}
                  disabled={isExporting}
                  className="w-32 h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Song Title - Flexible width */}
            <div className="flex-1 min-w-0 max-w-sm">
              <Label htmlFor="song-title" className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
                Song Title
              </Label>
              <Input
                id="song-title"
                value={songTitle}
                onChange={(e) => onSongTitleChange(e.target.value)}
                placeholder="My Song"
                className="bg-background/50 border-border/50 focus:border-primary"
              />
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3 ml-auto">
              {/* Metronome Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50">
                    {metronomeEnabled ? (
                      <Volume2 size={16} className="text-primary" />
                    ) : (
                      <VolumeX size={16} className="text-muted-foreground" />
                    )}
                    <Switch
                      id="metronome"
                      checked={metronomeEnabled}
                      onCheckedChange={onMetronomeToggle}
                      disabled={isExporting}
                      className="scale-90"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Toggle metronome click</TooltipContent>
              </Tooltip>

              {/* Export Button */}
              <Button
                onClick={onExport}
                disabled={!hasChords || isPlaying || isExporting}
                size="lg"
                className="gap-2 shadow-md"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span className="hidden sm:inline">Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <span className="hidden sm:inline">Export</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Style & Rhythm Controls */}
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border/50">
            <StyleSelector 
              selectedStyleId={selectedStyleId} 
              onStyleChange={onStyleChange}
              customStyles={customStyles}
              onCreateNew={onCreateNewRhythm}
            />
            
            <div className="h-6 w-px bg-border/70 mx-1 hidden sm:block" />
            
            <Button variant="ghost" size="sm" onClick={onOpenInstruments} className="gap-1.5 h-8">
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Instruments</span>
            </Button>
            
            <Button variant="ghost" size="sm" onClick={onOpenRhythmEditor} className="gap-1.5 h-8">
              <Grid3X3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit Rhythm</span>
            </Button>
            
            {onCreateNewRhythm && (
              <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}

            {/* Advanced toggle */}
            <div className="ml-auto">
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground">
                    {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">More</span>
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>
        </div>

        {/* Advanced Options - Collapsible */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleContent>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/50">
                {/* Transpose Control */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Transpose
                  </Label>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTranspositionChange(transposition - 1)}
                          disabled={transposition <= -12}
                          className="h-8 w-8 p-0"
                        >
                          -
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Transpose down one semitone</TooltipContent>
                    </Tooltip>
                    <span className="w-10 text-center font-mono text-sm font-medium">
                      {transposition > 0 ? `+${transposition}` : transposition}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTranspositionChange(transposition + 1)}
                          disabled={transposition >= 12}
                          className="h-8 w-8 p-0"
                        >
                          +
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Transpose up one semitone</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
});
