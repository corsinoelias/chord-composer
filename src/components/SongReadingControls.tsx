import { ChevronsDown, Minus, Plus } from 'lucide-react';

export const MIN_TEXT_SCALE = 80;
export const MAX_TEXT_SCALE = 160;
export const MIN_SCROLL_SPEED = 1;
export const MAX_SCROLL_SPEED = 10;

const stepBtn = 'w-7 h-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-35 disabled:pointer-events-none transition-colors';

// Autoscroll: a toggle, and — once it is on — its speed right beside it, so slowing down
// never means hunting for a settings panel with both hands on a guitar.
// `compact` drops the word and keeps the icon (the desktop toolbar is short of room).
export function AutoscrollControl({ on, onChange, speed, onSpeedChange, compact = false, className = '' }: {
  on: boolean;
  compact?: boolean;
  onChange: (on: boolean) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center h-9 rounded-lg border transition-colors ${on ? 'border-primary/35 bg-primary/10' : 'border-border bg-card'} ${className}`}>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        title="Scroll the chart by itself"
        className={`inline-flex items-center gap-1.5 h-full px-2.5 rounded-lg text-xs font-semibold transition-colors ${on ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <ChevronsDown className="w-4 h-4" />
        <span className={compact ? 'sr-only' : ''}>Autoscroll</span>
      </button>
      {on && (
        <span className="inline-flex items-center pr-1">
          <button type="button" className={stepBtn} onClick={() => onSpeedChange(Math.max(MIN_SCROLL_SPEED, speed - 1))} disabled={speed <= MIN_SCROLL_SPEED} aria-label="Scroll slower">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="min-w-[1.25rem] text-center text-xs font-bold text-primary tabular-nums" aria-label={`Speed ${speed}`}>{speed}</span>
          <button type="button" className={stepBtn} onClick={() => onSpeedChange(Math.min(MAX_SCROLL_SPEED, speed + 1))} disabled={speed >= MAX_SCROLL_SPEED} aria-label="Scroll faster">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

// Chart text size, in 10% steps.
export function TextSizeControl({ scale, onChange, className = '' }: {
  scale: number;
  onChange: (scale: number) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center h-9 px-1 rounded-lg border border-border bg-card ${className}`} title="Text size">
      <button type="button" className={`${stepBtn} text-xs font-bold`} onClick={() => onChange(Math.max(MIN_TEXT_SCALE, scale - 10))} disabled={scale <= MIN_TEXT_SCALE} aria-label="Smaller text">
        A−
      </button>
      <span className="min-w-[2.75rem] text-center text-xs font-semibold tabular-nums">{scale}%</span>
      <button type="button" className={`${stepBtn} text-sm font-bold`} onClick={() => onChange(Math.min(MAX_TEXT_SCALE, scale + 10))} disabled={scale >= MAX_TEXT_SCALE} aria-label="Larger text">
        A+
      </button>
    </div>
  );
}
