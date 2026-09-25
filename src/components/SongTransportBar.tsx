import { useState } from 'react';
import { ArrowRight, Loader2, Minus, Play, Plus, Repeat, SlidersHorizontal, Square, Timer, Type } from 'lucide-react';
import { usePlayback, usePlaybackPosition } from '@/contexts/PlaybackContext';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SongPillTime } from '@/components/SongPlayingPill';
import { SongKeyControl } from '@/components/SongKeyControl';
import { NotationSelector } from '@/components/NotationSelector';
import { DurationDots } from '@/components/DurationDots';
import { AutoscrollControl, TextSizeControl } from '@/components/SongReadingControls';
import { analytics } from '@/lib/analytics';
import type { SongNotation } from '@/lib/songNotation';

type Density = 'full' | 'compact' | 'chords';

const DENSITIES: ReadonlyArray<readonly [Density, string]> = [
  ['full', 'Lyrics + chords'],
  ['compact', 'Compact'],
  ['chords', 'Chords only'],
];

interface Props {
  songSlug: string;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  // What the bar says it will play (at rest) or is playing.
  sectionName: string | null;
  nowChord: string | null;
  nextChord: string | null;
  activeDuration: number;
  currentChordIndex: number;
  // Clock and progress — the same chord-count timeline SongPlayingPill used.
  baseChordOffset: number;
  totalChordSpan: number;
  cumulativeBeats: number[];
  totalBeats: number;
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  metronome: boolean;
  onMetronomeChange: (on: boolean) => void;
  loopArmed: boolean;
  canLoop: boolean;
  onToggleLoop: () => void;
  // Key (the phone's bar carries it; on wider screens it lives in the chart toolbar).
  transpose: number;
  onTransposeChange: (t: number) => void;
  keyName: (semitones: number) => string;
  capo: number;
  onCapoChange: (capo: number) => void;
  // Reading aids, which the phone keeps behind "Options" (the desktop toolbar shows them).
  autoScroll: boolean;
  onAutoScrollChange: (on: boolean) => void;
  scrollSpeed: number;
  onScrollSpeedChange: (speed: number) => void;
  textScale: number;
  onTextScaleChange: (scale: number) => void;
  // Reading options, which the phone keeps behind "Options".
  notation: SongNotation;
  onNotationChange: (n: SongNotation) => void;
  displayKey: string;
  density: Density;
  onDensityChange: (d: Density) => void;
  onOpenPractice: (surface: 'bar' | 'dock' | 'options') => void;
}

// Isolated so only the bar re-renders at animation-frame rate (usePlaybackPosition updates
// ~60x/sec) — the same split SongPlayerBar makes with ProgressFill.
function Progress({ baseChordOffset, totalChordSpan, className }: { baseChordOffset: number; totalChordSpan: number; className: string }) {
  const { state } = usePlayback();
  const playbackPosition = usePlaybackPosition();
  const position = baseChordOffset + Math.max(0, playbackPosition);
  const pct = state.isPlaying && totalChordSpan > 0 ? Math.min(100, (position / totalChordSpan) * 100) : 0;
  return (
    <div className={`relative overflow-hidden bg-secondary ${className}`} aria-hidden="true">
      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

// The song page's one playback surface, fixed to the bottom at every width (Sep 2026 redesign).
// Replaces the header's Play/Practice pair and the floating "now playing" pill: play, where you
// are, the chord now and the one coming, tempo, click, loop and the door into Practice (the same
// SongPracticePanel, opened in a sheet). On a phone it is also where the key lives, because the
// chart toolbar that carries the key on wider screens would cost a second fixed bar there.
export function SongTransportBar(p: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const live = p.isPlaying;

  const playButton = (size: string) => (
    <button
      type="button"
      onClick={p.onPlayPause}
      disabled={p.isLoading}
      aria-label={p.isPlaying ? 'Stop' : 'Play the chords'}
      className={`${size} shrink-0 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 hover:bg-primary/90 transition-colors disabled:opacity-60`}
    >
      {p.isLoading
        ? <Loader2 className="w-5 h-5 animate-spin" />
        : p.isPlaying
          ? <Square className="w-4 h-4 fill-current" />
          : <Play className="w-5 h-5 ml-0.5 fill-current" />}
    </button>
  );

  const iconBtn = 'w-9 h-9 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-35 disabled:pointer-events-none';
  const pressed = 'text-primary bg-primary/10 hover:text-primary';

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      {/* ── md and up: one row ── */}
      <div className="hidden md:flex items-center gap-4 max-w-6xl mx-auto px-6 py-2.5">
        {playButton('w-11 h-11')}
        <button
          type="button"
          onClick={p.onToggleLoop}
          disabled={!p.canLoop}
          aria-pressed={p.loopArmed}
          title={p.loopArmed ? 'Looping this section' : 'Loop the section that is playing'}
          className={`${iconBtn} ${p.loopArmed ? pressed : ''}`}
        >
          <Repeat className="w-[18px] h-[18px]" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 text-[13px]">
            <span className="font-semibold text-foreground truncate">
              {live ? p.sectionName : `Ready${p.sectionName ? ` · ${p.sectionName}` : ''}`}
            </span>
            <span className="ml-auto shrink-0">
              <SongPillTime baseChordOffset={p.baseChordOffset} cumulativeBeats={p.cumulativeBeats} totalBeats={p.totalBeats} bpm={p.bpm} />
            </span>
          </div>
          <Progress baseChordOffset={p.baseChordOffset} totalChordSpan={p.totalChordSpan} className="mt-1.5 h-1.5 rounded-full" />
        </div>
        {p.nowChord && (
          <div className="flex items-center gap-4 px-4 border-x border-border self-stretch">
            <div className="flex flex-col items-start gap-1 min-w-[3rem]">
              <span className="text-xl font-extrabold text-primary leading-none">{p.nowChord}</span>
              <span className="text-primary">
                <DurationDots duration={p.activeDuration} isActive={live} bpm={p.bpm} uid="bar-now" rawIndex={p.currentChordIndex} size={6} />
              </span>
            </div>
            {p.nextChord && (
              <div className="text-xs text-muted-foreground leading-tight">
                Next
                <b className="block text-[15px] text-foreground/80">{p.nextChord}</b>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-0.5" title="Tempo">
          <button type="button" className={iconBtn} onClick={() => p.onBpmChange(Math.max(50, p.bpm - 2))} aria-label="Slower">
            <Minus className="w-4 h-4" />
          </button>
          <span className="min-w-[4.25rem] text-center font-semibold tabular-nums">
            {p.bpm}<small className="ml-1 text-[11px] font-medium text-muted-foreground">BPM</small>
          </span>
          <button type="button" className={iconBtn} onClick={() => p.onBpmChange(Math.min(200, p.bpm + 2))} aria-label="Faster">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => p.onMetronomeChange(!p.metronome)}
          aria-pressed={p.metronome}
          title="Metronome"
          className={`${iconBtn} ${p.metronome ? pressed : ''}`}
        >
          <Timer className="w-[18px] h-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => p.onOpenPractice('bar')}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Practice
        </button>
      </div>

      {/* ── Phones: the dock ── */}
      <div className="md:hidden px-3">
        {live && (
          <>
            <Progress baseChordOffset={p.baseChordOffset} totalChordSpan={p.totalChordSpan} className="-mx-3 h-[3px]" />
            <div className="flex items-center gap-2.5 pt-2">
              <div className="flex flex-col items-start gap-1 min-w-[2.5rem]">
                <span className="text-[22px] font-extrabold text-primary leading-none">{p.nowChord}</span>
                <span className="text-primary">
                  <DurationDots duration={p.activeDuration} isActive={live} bpm={p.bpm} uid="dock-now" rawIndex={p.currentChordIndex} size={5} />
                </span>
              </div>
              {p.nextChord && (
                <>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-base font-bold text-foreground/75" aria-label={`Next chord ${p.nextChord}`}>{p.nextChord}</span>
                </>
              )}
              <div className="ml-auto min-w-0 text-right leading-tight">
                <span className="block text-[12.5px] font-semibold text-foreground/80 truncate max-w-[10rem]">{p.sectionName}</span>
                <SongPillTime baseChordOffset={p.baseChordOffset} cumulativeBeats={p.cumulativeBeats} totalBeats={p.totalBeats} bpm={p.bpm} />
              </div>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 py-2">
          {playButton('w-11 h-11')}
          <SongKeyControl
            surface="dock"
            transpose={p.transpose}
            onTransposeChange={p.onTransposeChange}
            keyName={p.keyName}
            songSlug={p.songSlug}
            capo={p.capo}
            onCapoChange={p.onCapoChange}
            className="flex-1 max-w-[12rem]"
          />
          <span className="flex-1" />
          {p.autoScroll && (
            <button
              type="button"
              onClick={() => p.onAutoScrollChange(false)}
              aria-label="Stop autoscroll"
              className="inline-flex items-center justify-center gap-1 h-11 w-11 shrink-0 rounded-xl border border-primary/35 bg-primary/10 text-primary text-[13px] font-semibold"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="sr-only">Scroll</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOptionsOpen(true); analytics.songOptionsOpened(p.songSlug); }}
            className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl border border-border bg-card text-[13px] font-semibold text-muted-foreground"
          >
            <Type className="w-[18px] h-[18px]" />
            <span className={p.autoScroll || p.capo > 0 ? 'sr-only' : 'max-[360px]:hidden'}>Options</span>
          </button>
        </div>
      </div>

      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto">
          <SheetTitle className="text-base">Options</SheetTitle>
          <div className="mt-4 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Chord names</p>
              <NotationSelector value={p.notation} onChange={p.onNotationChange} displayKey={p.displayKey} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Show</p>
              <div className="flex p-0.5 rounded-lg bg-secondary/60">
                {DENSITIES.map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => p.onDensityChange(d)}
                    aria-pressed={p.density === d}
                    className={`flex-1 px-2 py-2 rounded-md text-xs font-semibold transition-colors
                      ${p.density === d ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Autoscroll</span>
              <AutoscrollControl on={p.autoScroll} onChange={(on) => { p.onAutoScrollChange(on); if (on) setOptionsOpen(false); }} speed={p.scrollSpeed} onSpeedChange={p.onScrollSpeedChange} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Text size</span>
              <TextSizeControl scale={p.textScale} onChange={p.onTextScaleChange} />
            </div>
            <button
              type="button"
              onClick={() => { setOptionsOpen(false); p.onOpenPractice('options'); }}
              className="flex items-center justify-between w-full px-3.5 py-3 rounded-xl bg-secondary/70 text-sm font-semibold text-foreground"
            >
              Practice: sections, mixer, tempo, export
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
