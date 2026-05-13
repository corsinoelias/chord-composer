import { memo, useState } from 'react';
import { Play, Square, Download, Loader2, Volume2, VolumeX, Settings2, Grid3X3, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StyleSelector } from './StyleSelector';
import { useIsMobile } from '@/hooks/use-mobile';

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
  currentStep?: number;
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
  const isMobile = useIsMobile();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        {/* Main Controls Row - Responsive layout */}
        <div className="p-3 sm:p-4 md:p-5">
          <div className="flex flex-col gap-4">
            {/* Top Row: Play + BPM + Actions */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Hero Play Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={isPlaying ? onStop : onPlay}
                    disabled={!hasChords || isExporting}
                    className={`
                      relative shrink-0 rounded-full flex items-center justify-center
                      transition-all duration-300 
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                      ${isMobile ? 'w-14 h-14' : 'w-16 h-16'}
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
                      <Square size={isMobile ? 18 : 22} fill="currentColor" />
                    ) : (
                      <Play size={isMobile ? 22 : 26} fill="currentColor" className="ml-1" />
                    )}
                    
                    {isPlaying && (
                      <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-20" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isPlaying ? 'Stop playback' : 'Start playback'}</TooltipContent>
              </Tooltip>

              {/* BPM Control */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="bpm-range" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tempo
                  </Label>
                  <span className="font-mono text-base sm:text-lg font-bold text-foreground tabular-nums">
                    {bpm}
                  </span>
                </div>
                <input
                  id="bpm-range"
                  type="range"
                  min={40}
                  max={200}
                  value={bpm}
                  onChange={(e) => onBpmChange(parseInt(e.target.value))}
                  disabled={isExporting}
                  className="w-20 sm:w-28 md:w-32 h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Tempo, ${bpm} beats per minute`}
                />
              </div>

              {/* Song Title - grows to fill space */}
              <div className="flex-1 min-w-0 hidden sm:block max-w-xs">
                <Label htmlFor="song-title" className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
                  Song Title
                </Label>
                <Input
                  id="song-title"
                  value={songTitle}
                  onChange={(e) => onSongTitleChange(e.target.value)}
                  placeholder="My Song"
                  className="bg-background/50 border-border/50 focus:border-primary h-9"
                />
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
                {/* Metronome Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-secondary/50 border border-border/50">
                      {metronomeEnabled ? (
                        <Volume2 size={14} className="text-primary" />
                      ) : (
                        <VolumeX size={14} className="text-muted-foreground" />
                      )}
                      <Label htmlFor="metronome" className="sr-only">Metronome</Label>
                      <Switch
                        id="metronome"
                        checked={metronomeEnabled}
                        onCheckedChange={onMetronomeToggle}
                        disabled={isExporting}
                        className="scale-75 sm:scale-90"
                        aria-label="Toggle metronome"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Toggle metronome</TooltipContent>
                </Tooltip>

                {/* Export Button */}
                <Button
                  onClick={onExport}
                  disabled={!hasChords || isPlaying || isExporting}
                  size={isMobile ? "sm" : "lg"}
                  className="gap-1.5 sm:gap-2 shadow-md"
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span className="hidden xs:inline">Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span className="hidden xs:inline">Export</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Mobile: Song Title row */}
            <div className="sm:hidden">
              <Input
                value={songTitle}
                onChange={(e) => onSongTitleChange(e.target.value)}
                placeholder="Song title..."
                className="bg-background/50 border-border/50 focus:border-primary h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Style & Rhythm Controls */}
        <div className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5 pt-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-xl bg-secondary/30 border border-border/50">
            <StyleSelector 
              selectedStyleId={selectedStyleId} 
              onStyleChange={onStyleChange}
              customStyles={customStyles}
              onCreateNew={onCreateNewRhythm}
            />
            
            <div className="h-6 w-px bg-border/70 mx-0.5 sm:mx-1 hidden xs:block" />
            
            <Button variant="ghost" size="sm" onClick={onOpenInstruments} className="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
              <Settings2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden xs:inline">Instruments</span>
            </Button>
            
            <Button variant="ghost" size="sm" onClick={onOpenRhythmEditor} className="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
              <Grid3X3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden xs:inline">Rhythm</span>
            </Button>
            
            {onCreateNewRhythm && (
              <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
                <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}

            {/* Advanced toggle */}
            <div className="ml-auto">
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm text-muted-foreground">
                    {advancedOpen ? <ChevronUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                    <span className="hidden xs:inline">More</span>
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>
        </div>

        {/* Advanced Options - Collapsible */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleContent>
            <div className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5 pt-0">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-muted/30 border border-border/50">
                {/* Transpose Control */}
                <div className="flex items-center gap-2 sm:gap-3">
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
                          className="h-7 sm:h-8 w-7 sm:w-8 p-0"
                          aria-label="Transpose down one semitone"
                        >
                          -
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Transpose down</TooltipContent>
                    </Tooltip>
                    <span className="w-8 sm:w-10 text-center font-mono text-xs sm:text-sm font-medium">
                      {transposition > 0 ? `+${transposition}` : transposition}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTranspositionChange(transposition + 1)}
                          disabled={transposition >= 12}
                          className="h-7 sm:h-8 w-7 sm:w-8 p-0"
                          aria-label="Transpose up one semitone"
                        >
                          +
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Transpose up</TooltipContent>
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
