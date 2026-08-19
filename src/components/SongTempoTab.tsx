import { useEffect, useState } from 'react';
import { RotateCcw, Triangle } from 'lucide-react';

// Same small transpose-label helper duplicated across the song-page components (ChordAside.tsx,
// SongChordPreview.tsx, SongChordPlayer.tsx, SongHeaderActions.tsx) — needed here to label every
// option in the Pitch dropdown, not just whichever one is currently selected.
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeKey(key: string, s: number) {
  const minor = key.endsWith('m') && key.length > 1;
  const root = minor ? key.slice(0, -1) : key;
  const i = noteIndex(root); if (i === -1) return key;
  return (FLAT_KEYS.has(key) ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12] + (minor ? 'm' : '');
}

const MIN_BPM = 50;
const MAX_BPM = 200;
const MIN_TRANSPOSE = -6;
const MAX_TRANSPOSE = 6;

interface SongTempoTabProps {
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  songKey: string;
  metronome: boolean;
  onMetronomeChange: (enabled: boolean) => void;
}

function StepperShell({ label, onReset, resetDisabled, children }: {
  label: string;
  onReset: () => void;
  resetDisabled: boolean;
  children: React.ReactNode;
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
        {children}
      </div>
    </div>
  );
}

const stepBtnClass = 'w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-secondary/60 text-sm font-bold hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

// Typing a BPM was previously impossible — only ±4 nudges — which is slow when you know exactly
// what tempo you want. A local text buffer lets the field sit empty/mid-edit without forcing an
// invalid clamp on every keystroke; the real value only commits on blur or Enter.
function BpmStepper({ bpm, onBpmChange, onReset, resetDisabled }: {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onReset: () => void;
  resetDisabled: boolean;
}) {
  const [text, setText] = useState(String(bpm));
  useEffect(() => { setText(String(bpm)); }, [bpm]);

  const commit = () => {
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) onBpmChange(Math.min(MAX_BPM, Math.max(MIN_BPM, n)));
    else setText(String(bpm));
  };

  return (
    <StepperShell label="BPM" onReset={onReset} resetDisabled={resetDisabled}>
      <button type="button" onClick={() => onBpmChange(Math.max(MIN_BPM, bpm - 4))} className={stepBtnClass}>−</button>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        min={MIN_BPM}
        max={MAX_BPM}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
        className="flex-1 min-w-0 text-center text-sm font-extrabold tabular-nums bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onBpmChange(Math.min(MAX_BPM, bpm + 4))} className={stepBtnClass}>+</button>
    </StepperShell>
  );
}

// Pitch is a discrete set of 13 semitone offsets, not free text — a dropdown listing every key
// by name (not just the current one) is a more direct way to "pick a key" than clicking ± up to
// six times to get there, while the ± buttons stay for quick one-semitone nudges.
function PitchStepper({ transpose, onTransposeChange, onReset, resetDisabled, songKey }: {
  transpose: number;
  onTransposeChange: (t: number) => void;
  onReset: () => void;
  resetDisabled: boolean;
  songKey: string;
}) {
  return (
    <StepperShell label="Pitch" onReset={onReset} resetDisabled={resetDisabled}>
      <button
        type="button"
        onClick={() => onTransposeChange(Math.max(MIN_TRANSPOSE, transpose - 1))}
        disabled={transpose <= MIN_TRANSPOSE}
        className={stepBtnClass}
      >−</button>
      <select
        value={transpose}
        onChange={e => onTransposeChange(Number(e.target.value))}
        className="flex-1 min-w-0 text-center text-sm font-extrabold tabular-nums bg-transparent outline-none cursor-pointer"
      >
        {Array.from({ length: MAX_TRANSPOSE - MIN_TRANSPOSE + 1 }, (_, i) => MIN_TRANSPOSE + i).map(s => (
          <option key={s} value={s} className="text-foreground bg-card">
            {transposeKey(songKey, s)}{s !== 0 ? ` (${s > 0 ? '+' : ''}${s})` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onTransposeChange(Math.min(MAX_TRANSPOSE, transpose + 1))}
        disabled={transpose >= MAX_TRANSPOSE}
        className={stepBtnClass}
      >+</button>
    </StepperShell>
  );
}

// One bordered card, two columns (Pitch, BPM) divided by a hairline. Reset restores that
// column's value to the song's original (transpose -> 0, BPM -> the song's own default tempo).
export function SongTempoTab({ bpm, originalBpm, onBpmChange, transpose, onTransposeChange, songKey, metronome, onMetronomeChange }: SongTempoTabProps) {
  return (
    <div className="border border-border rounded-2xl bg-secondary/30 px-4 py-3.5">
      <div className="flex">
        <PitchStepper
          transpose={transpose}
          onTransposeChange={onTransposeChange}
          onReset={() => onTransposeChange(0)}
          resetDisabled={transpose === 0}
          songKey={songKey}
        />
        <div className="w-px bg-border mx-4" />
        <BpmStepper
          bpm={bpm}
          onBpmChange={onBpmChange}
          onReset={() => onBpmChange(originalBpm)}
          resetDisabled={bpm === originalBpm}
        />
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
