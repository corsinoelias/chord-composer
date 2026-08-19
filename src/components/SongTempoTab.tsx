import { RotateCcw, Triangle } from 'lucide-react';

interface SongTempoTabProps {
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  displayKey: string;
  metronome: boolean;
  onMetronomeChange: (enabled: boolean) => void;
}

// Percent-of-original tempo, alongside the absolute BPM stepper — practising a part slowly is
// the whole reason to loop it, and "90%" is how players think about that, not "65 BPM". The
// presets round to a whole BPM so the stepper's own value never shows a fraction.
const SPEED_PRESETS = [0.75, 0.9, 1] as const;

function StepperColumn({ label, value, onReset, resetDisabled, onDecrement, onIncrement, decrementDisabled, incrementDisabled }: {
  label: string;
  value: string;
  onReset: () => void;
  resetDisabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          title={`Reset ${label.toLowerCase()}`}
          className="w-[22px] h-[22px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-1 rounded-full border border-border bg-card p-1">
        <button
          onClick={onDecrement}
          disabled={decrementDisabled}
          className="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-secondary/60 text-sm font-bold hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >−</button>
        <span className="flex-1 text-center text-sm font-extrabold tabular-nums">{value}</span>
        <button
          onClick={onIncrement}
          disabled={incrementDisabled}
          className="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-secondary/60 text-sm font-bold hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >+</button>
      </div>
    </div>
  );
}

// One bordered card, two columns (Pitch, BPM) divided by a hairline — matches the reference
// exactly: label + reset button row, rounded stepper pill below. Reset restores that column's
// value to the song's original (transpose -> 0, BPM -> the song's own default tempo).
export function SongTempoTab({ bpm, originalBpm, onBpmChange, transpose, onTransposeChange, displayKey, metronome, onMetronomeChange }: SongTempoTabProps) {
  return (
    <div className="border border-border rounded-2xl bg-secondary/30 px-4 py-3.5">
      <div className="flex">
        <StepperColumn
          label="Pitch"
          value={displayKey}
          onReset={() => onTransposeChange(0)}
          resetDisabled={transpose === 0}
          onDecrement={() => onTransposeChange(Math.max(-6, transpose - 1))}
          onIncrement={() => onTransposeChange(Math.min(6, transpose + 1))}
          decrementDisabled={transpose <= -6}
          incrementDisabled={transpose >= 6}
        />
        <div className="w-px bg-border mx-4" />
        <StepperColumn
          label="BPM"
          value={String(bpm)}
          onReset={() => onBpmChange(originalBpm)}
          resetDisabled={bpm === originalBpm}
          onDecrement={() => onBpmChange(Math.max(50, bpm - 4))}
          onIncrement={() => onBpmChange(Math.min(200, bpm + 4))}
        />
      </div>

      {/* Speed presets — computed against the song's OWN tempo, not the current one, so
          tapping 75% twice doesn't compound down to 56%. Marked active by exact match on the
          rounded target, which is also what the ± stepper writes, so nudging BPM by hand
          simply clears the highlight instead of leaving a lying one. */}
      <div className="flex gap-1.5 mt-3">
        {SPEED_PRESETS.map(pct => {
          const target = Math.round(originalBpm * pct);
          const active = bpm === target;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => onBpmChange(Math.min(200, Math.max(50, target)))}
              className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors border
                ${active
                  ? 'border-primary/35 bg-primary/15 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                }
              `}
            >
              {Math.round(pct * 100)}%
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onMetronomeChange(!metronome)}
        aria-pressed={metronome}
        className="flex items-center gap-2.5 w-full mt-2.5 px-3 h-11 rounded-xl border border-border bg-card transition-colors hover:bg-accent/40"
      >
        <Triangle className={`w-4 h-4 shrink-0 ${metronome ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-xs font-semibold">Metronome</span>
        {/* Plain span, not a Switch component — this is inside a <button>, and nesting an
            interactive control in another is invalid and swallows the outer click. */}
        <span className={`ml-auto w-9 h-5 rounded-full shrink-0 relative transition-colors ${metronome ? 'bg-primary' : 'bg-secondary'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow-sm transition-all ${metronome ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>
    </div>
  );
}
