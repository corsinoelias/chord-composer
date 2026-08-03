interface SongTempoTabProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  displayKey: string;
}

// Same bpm/transpose state and callbacks the desktop bar already uses (SongPlayerBar.tsx's
// `hidden sm:flex` BPM/Transpose groups) — just a second, mobile-only, larger-touch-target
// rendering of the same controls, not a new source of truth.
export function SongTempoTab({ bpm, onBpmChange, transpose, onTransposeChange, displayKey }: SongTempoTabProps) {
  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-col items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tempo</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onBpmChange(Math.max(50, bpm - 4))}
            className="w-11 h-11 rounded-full border border-border text-lg font-bold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >−</button>
          <span className="w-24 text-center text-2xl font-bold tabular-nums">{bpm} <span className="text-sm font-medium text-muted-foreground">BPM</span></span>
          <button
            onClick={() => onBpmChange(Math.min(200, bpm + 4))}
            className="w-11 h-11 rounded-full border border-border text-lg font-bold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >+</button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tono</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onTransposeChange(Math.max(-6, transpose - 1))}
            disabled={transpose <= -6}
            className="w-11 h-11 rounded-full border border-border text-lg font-bold text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >−</button>
          <span className="w-24 text-center text-2xl font-bold tabular-nums select-none">
            {displayKey}
            {transpose !== 0 && (
              <span className="block text-sm font-medium text-muted-foreground">
                ({transpose > 0 ? '+' : ''}{transpose})
              </span>
            )}
          </span>
          <button
            onClick={() => onTransposeChange(Math.min(6, transpose + 1))}
            disabled={transpose >= 6}
            className="w-11 h-11 rounded-full border border-border text-lg font-bold text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >+</button>
        </div>
      </div>
    </div>
  );
}
