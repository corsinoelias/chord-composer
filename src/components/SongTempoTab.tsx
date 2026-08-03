import { RotateCcw } from 'lucide-react';

interface SongTempoTabProps {
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  displayKey: string;
}

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
export function SongTempoTab({ bpm, originalBpm, onBpmChange, transpose, onTransposeChange, displayKey }: SongTempoTabProps) {
  return (
    <div className="flex border border-border rounded-2xl bg-secondary/30 px-4 py-3.5">
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
  );
}
