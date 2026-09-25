import { ChevronsDown, Minus, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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

// A small segmented choice, the same look as the chart's view picker.
function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-secondary/60">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-foreground/80">
        {label}
        {hint && <small className="block text-[11px] text-muted-foreground">{hint}</small>}
      </span>
      {children}
    </div>
  );
}

// The "Aa" menu: how the chart is set. Everything here is the reader's, not the song's.
export function DisplayOptions(p: {
  textScale: number; onTextScaleChange: (v: number) => void;
  columns: 'auto' | '1' | '2'; onColumnsChange: (v: 'auto' | '1' | '2') => void;
  spacing: 'comfy' | 'compact'; onSpacingChange: (v: 'comfy' | 'compact') => void;
  accidentals: 'auto' | 'sharp' | 'flat'; onAccidentalsChange: (v: 'auto' | 'sharp' | 'flat') => void;
  hoverDiagrams: boolean; onHoverDiagramsChange: (v: boolean) => void;
  leftHanded: boolean; onLeftHandedChange: (v: boolean) => void;
  showColumns?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Text</p>
      <Row label="Text size"><TextSizeControl scale={p.textScale} onChange={p.onTextScaleChange} /></Row>
      {p.showColumns !== false && (
        <Row label="Columns"><Seg value={p.columns} onChange={p.onColumnsChange} options={[['auto', 'Auto'], ['1', '1'], ['2', '2']] as const} /></Row>
      )}
      <Row label="Spacing"><Seg value={p.spacing} onChange={p.onSpacingChange} options={[['comfy', 'Comfortable'], ['compact', 'Compact']] as const} /></Row>
      <Row label="Accidentals"><Seg value={p.accidentals} onChange={p.onAccidentalsChange} options={[['auto', 'Auto'], ['sharp', '♯'], ['flat', '♭']] as const} /></Row>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 mb-1 pt-3 border-t border-border">Diagrams</p>
      <Row label="Diagram on hover"><Switch checked={p.hoverDiagrams} onCheckedChange={p.onHoverDiagramsChange} aria-label="Diagram on hover" /></Row>
      <Row label="Left-handed"><Switch checked={p.leftHanded} onCheckedChange={p.onLeftHandedChange} aria-label="Left-handed diagrams" /></Row>
    </div>
  );
}
