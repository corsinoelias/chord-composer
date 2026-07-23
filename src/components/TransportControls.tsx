import { memo } from 'react';
import { Play, Square, Download, Loader2, Volume2, VolumeX, Settings2, Grid3X3, Plus, ChevronDown, Save } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StyleSelector } from './StyleSelector';
import { useIsMobile } from '@/hooks/use-mobile';

import { type StylePattern } from '@/lib/styles';

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
  onExportMidi: () => void;
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
  showSaveCta?: boolean;
  onSaveCtaClick?: () => void;
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
  onExportMidi,
  onBpmChange,
  onMetronomeToggle,
  onStyleChange,
  onSongTitleChange,
  onTranspositionChange,
  onOpenInstruments,
  onOpenRhythmEditor,
  onCreateNewRhythm,
  hasChords,
  showSaveCta = false,
  onSaveCtaClick,
}: TransportControlsProps) {
  const isMobile = useIsMobile();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        {/* Main Controls Row - Responsive layout */}
        <div className="p-3 sm:p-4 md:p-5">
          <div className="flex flex-col gap-4">
            {/* Top Row: Play + BPM + Actions */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Hero Play Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={isPlaying ? onStop : onPlay}
                    disabled={!hasChords || isExporting}
                    data-tour="play-button"
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

              {/* BPM Control — fills the rest of row 1 next to Play on mobile */}
              <div className="flex flex-col min-w-0 flex-1 sm:flex-none">
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
                  className="w-full sm:w-28 md:w-32 h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
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

              {/* Right Actions — own full-width row on mobile; the action buttons fill it
                  evenly (labels always shown) so it reads as a proper button bar, not a
                  sparse spread of tiny icons. Inline on the right at sm+. */}
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto sm:ml-auto shrink-0">
                {/* Metronome Toggle — compact, on the left */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 shrink-0">
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

                {/* Save CTA — appears once there's real work worth saving; fills evenly
                    alongside Export on mobile. One-time entrance animation on mount. */}
                {showSaveCta && (
                  <Button
                    onClick={onSaveCtaClick}
                    size={isMobile ? "sm" : "lg"}
                    variant="outline"
                    className="flex-1 sm:flex-none justify-center gap-1.5 sm:gap-2 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
                  >
                    <Save size={16} />
                    <span>Save</span>
                  </Button>
                )}

                {/* Export — split button: main action (WAV) + dropdown (MIDI). Fills the
                    remaining width on mobile. */}
                <div className="flex items-stretch shadow-md rounded-lg overflow-hidden flex-1 sm:flex-none" data-tour="export-button">
                  <Button
                    onClick={onExport}
                    disabled={!hasChords || isPlaying || isExporting}
                    size={isMobile ? "sm" : "lg"}
                    className="flex-1 justify-center gap-1.5 sm:gap-2 rounded-none rounded-l-lg border-r border-primary-foreground/20"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Exporting...</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>WAV</span>
                      </>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={!hasChords || isPlaying || isExporting}
                        size={isMobile ? "sm" : "lg"}
                        className="rounded-none rounded-r-lg px-2"
                        aria-label="More export options"
                      >
                        <ChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onExport} disabled={isExporting}>
                        <Download size={14} className="mr-2" />
                        Export WAV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onExportMidi}>
                        <Download size={14} className="mr-2" />
                        Export MIDI
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
            {/* Style picker gets its own full-width row on mobile so it (and the buttons
                below it) line up cleanly instead of cramming beside a fixed 180px box. */}
            <div data-tour="style-selector" className="basis-full sm:basis-auto min-w-0">
              <StyleSelector
                selectedStyleId={selectedStyleId}
                onStyleChange={onStyleChange}
                customStyles={customStyles}
                onCreateNew={onCreateNewRhythm}
                triggerClassName="w-full sm:w-[180px] h-9 bg-secondary border-border"
              />
            </div>

            <div className="h-6 w-px bg-border/70 mx-0.5 sm:mx-1 hidden xs:block" />
            
            {/* Labels shown on mobile too (not cryptic icon-only) — with the style picker
                on its own row above, these wrap cleanly as a labeled button group. */}
            <Button variant="ghost" size="sm" onClick={onOpenInstruments} className="gap-1.5 h-8 px-2.5 sm:px-3 text-xs sm:text-sm border border-border/50 sm:border-0">
              <Settings2 className="h-3.5 w-3.5" />
              <span>Instruments</span>
            </Button>

            <Button variant="ghost" size="sm" onClick={onOpenRhythmEditor} className="gap-1.5 h-8 px-2.5 sm:px-3 text-xs sm:text-sm border border-border/50 sm:border-0">
              <Grid3X3 className="h-3.5 w-3.5" />
              <span>Edit Rhythm</span>
            </Button>

            {onCreateNewRhythm && (
              <Button variant="ghost" size="sm" onClick={onCreateNewRhythm} className="gap-1.5 h-8 px-2.5 sm:px-3 text-xs sm:text-sm border border-border/50 sm:border-0">
                <Plus className="h-3.5 w-3.5" />
                <span>New</span>
              </Button>
            )}

            <div className="h-6 w-px bg-border/70 mx-0.5 sm:mx-1 hidden xs:block" />

            {/* Transpose Control — its own -/+ buttons already carry borders, so no chip
                wrapper here (would be border-in-border); just a clear label on mobile. */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                <span className="sm:hidden">Key</span><span className="hidden sm:inline">Transpose</span>
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
                <span className={`w-8 sm:w-10 text-center font-mono text-xs sm:text-sm font-medium ${transposition !== 0 ? 'text-primary' : ''}`}>
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
      </div>
    </TooltipProvider>
  );
});
