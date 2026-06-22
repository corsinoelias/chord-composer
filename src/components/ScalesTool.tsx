import { useState, useMemo } from 'react';
import { ScaleSelector, type ScaleFilterState } from './ScaleSelector';
import { ScaleFretboard } from './ScaleFretboard';
import { ScaleTab } from './ScaleTab';
import {
  SCALES, SCALE_CATEGORIES, getScalesByCategory, getScaleNoteNames,
} from '@/lib/scales';
import {
  useScalePlayback, buildScaleNotes, buildScalePath,
  type PlayDirection,
} from '@/hooks/useScalePlayback';
import { Button } from '@/components/ui/button';
import { Play, Square, ChevronDown, Repeat2 } from 'lucide-react';

const INTERVAL_DEGREE: Record<number, string> = {
  0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♯4', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7',
};
const DEGREE_LABEL: Record<string, string> = {
  '1': 'Root', '♭2': '♭2nd', '2': '2nd', '♭3': '♭3rd', '3': '3rd',
  '4': '4th', '♯4': '♯4th', '5': '5th', '♯5': '♯5th', '6': '6th',
  '♭7': '♭7th', '7': '7th',
};

const PRIMARY_CATS = new Set(['Essential', 'Church Modes']);

const DEFAULT: ScaleFilterState = {
  rootPitchClass: 0,
  scaleName: 'Major Scale',
  intervals: SCALES.find(s => s.name === 'Major Scale')!.intervals,
};

const BPM_MIN = 40;
const BPM_MAX = 200;
const BPM_STEP = 5;

export function ScalesTool() {
  const [filter, setFilter]           = useState<ScaleFilterState | null>(DEFAULT);
  const [bpm, setBpm]                 = useState(80);
  const [direction, setDirection]     = useState<PlayDirection>('asc');
  const [loop, setLoop]               = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);

  const { isPlaying, activePosition, currentNoteIndex, totalNotes, play, stop } =
    useScalePlayback({
      rootPitchClass: filter?.rootPitchClass ?? 0,
      intervals: filter?.intervals ?? [],
      bpm,
    });

  const displayPath = useMemo(() => {
    if (!filter || !filter.intervals.length) return [];
    const notes = buildScaleNotes(filter.rootPitchClass, filter.intervals);
    const seq   = direction === 'desc' ? [...notes].reverse() : notes;
    return buildScalePath(seq, direction);
  }, [filter, direction]);

  const noteNames = filter ? getScaleNoteNames(filter.rootPitchClass, filter.intervals) : [];

  const activePC = activePosition ? activePosition.midi % 12 : null;
  const activeIntervalIdx = (activePC !== null && filter)
    ? filter.intervals.findIndex(iv => (filter.rootPitchClass + iv) % 12 === activePC)
    : -1;
  const activeDegree   = activeIntervalIdx >= 0
    ? (INTERVAL_DEGREE[filter!.intervals[activeIntervalIdx]] ?? '1')
    : '1';
  const activeNoteName = activeIntervalIdx >= 0 ? noteNames[activeIntervalIdx] : noteNames[0];

  const visibleCats = showAllCats
    ? SCALE_CATEGORIES
    : SCALE_CATEGORIES.filter(c => PRIMARY_CATS.has(c));
  const hiddenCount = SCALES.filter(s => !PRIMARY_CATS.has(s.category)).length;

  const clampBpm = (v: number) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));

  return (
    <div className="space-y-5">

      {/* ── Scale selector ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <ScaleSelector value={filter} onChange={setFilter} />
      </section>

      {/* ── Degrees reference ───────────────────────────────────────────────── */}
      {filter && noteNames.length > 0 && (
        <section className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
            Scale degrees
          </p>
          <div className="flex gap-2 flex-wrap">
            {filter.intervals.map((interval, i) => {
              const pc       = (filter.rootPitchClass + interval) % 12;
              const isActive = activePC === pc;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {INTERVAL_DEGREE[interval]}
                  </span>
                  <span className={`
                    text-sm font-bold font-mono px-2.5 py-1 rounded-md transition-all duration-75
                    ${isActive
                      ? 'bg-amber-400 text-amber-950 scale-110 shadow-sm'
                      : i === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }
                  `}>
                    {noteNames[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Playback + Tab + Fretboard ──────────────────────────────────────── */}
      {filter && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-5">

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">

            {/* Direction */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              {(['asc', 'desc'] as PlayDirection[]).map(d => (
                <button
                  key={d}
                  onClick={() => { if (isPlaying) stop(); setDirection(d); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    direction === d
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d === 'asc' ? '↑ Ascending' : '↓ Descending'}
                </button>
              ))}
            </div>

            {/* BPM control */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button
                onClick={() => setBpm(b => clampBpm(b - BPM_STEP))}
                className="w-7 h-7 flex items-center justify-center text-base text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                aria-label="Decrease BPM"
              >
                −
              </button>
              <div className="flex flex-col items-center px-2 min-w-[52px]">
                <span className="text-sm font-bold tabular-nums leading-tight">{bpm}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">BPM</span>
              </div>
              <button
                onClick={() => setBpm(b => clampBpm(b + BPM_STEP))}
                className="w-7 h-7 flex items-center justify-center text-base text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                aria-label="Increase BPM"
              >
                +
              </button>
            </div>

            {/* Loop toggle */}
            <button
              onClick={() => setLoop(l => !l)}
              title={loop ? 'Loop on — click to turn off' : 'Loop off — click to turn on'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                loop
                  ? 'bg-primary/15 border-primary/50 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Repeat2 className="h-3.5 w-3.5" />
              Loop
            </button>

            {/* Play / Stop */}
            <Button
              size="sm"
              variant={isPlaying ? 'secondary' : 'default'}
              className="gap-2 min-w-24"
              onClick={() => isPlaying ? stop() : play(direction, loop)}
            >
              {isPlaying
                ? <><Square className="h-3.5 w-3.5 fill-current" /> Stop</>
                : <><Play   className="h-3.5 w-3.5 fill-current" /> Play</>
              }
            </Button>
          </div>

          {/* Now Playing panel */}
          {isPlaying && activeNoteName && (
            <div className="rounded-xl bg-muted/50 border border-border px-5 py-4 flex items-center gap-6">
              <div className="flex flex-col items-center gap-0.5 min-w-[4rem]">
                <span className="text-xs text-muted-foreground">{DEGREE_LABEL[activeDegree] ?? activeDegree}</span>
                <span className="text-4xl font-extrabold tracking-tight leading-none">{activeNoteName}</span>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  Note {currentNoteIndex + 1} of {totalNotes}
                  {loop && <span className="ml-2 text-primary">· Loop</span>}
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: totalNotes }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all duration-75 ${
                        i < currentNoteIndex  ? 'bg-primary/35'
                        : i === currentNoteIndex ? 'bg-amber-400 scale-125'
                        : 'bg-muted-foreground/18'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab */}
          <ScaleTab
            path={displayPath}
            currentIndex={currentNoteIndex}
            isPlaying={isPlaying}
            bpm={bpm}
          />

          {/* Fretboard */}
          <ScaleFretboard
            rootPitchClass={filter.rootPitchClass}
            scalePath={displayPath}
            activePosition={activePosition}
          />

          {/* Legend */}
          <div className="flex gap-5 text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-[#3b82f6]" />
              Root
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'rgba(192,187,175,0.92)', border: '1px solid rgba(0,0,0,.15)' }} />
              Scale note
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-amber-400" />
              Playing
            </div>
          </div>
        </section>
      )}

      {/* ── Scale catalog ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">Scale Library</h2>
          <span className="text-xs text-muted-foreground">{SCALES.length} scales total</span>
        </div>

        <div className="space-y-5">
          {visibleCats.map(cat => (
            <div key={cat}>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {getScalesByCategory(cat).map(scale => (
                  <button
                    key={scale.name}
                    onClick={() =>
                      setFilter(prev => ({
                        rootPitchClass: prev?.rootPitchClass ?? 0,
                        scaleName: scale.name,
                        intervals: scale.intervals,
                      }))
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      filter?.scaleName === scale.name
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:border-primary/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {scale.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!showAllCats ? (
          <button
            onClick={() => setShowAllCats(true)}
            className="mt-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
            Show {hiddenCount} more scales (World, Modes, Arpeggios, Advanced…)
          </button>
        ) : (
          <button
            onClick={() => setShowAllCats(false)}
            className="mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Show less
          </button>
        )}
      </section>
    </div>
  );
}
