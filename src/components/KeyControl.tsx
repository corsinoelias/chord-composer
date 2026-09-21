import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  keyLabel,
  mod12,

  MAJOR_KEY_NAMES,
  MINOR_KEY_NAMES,
  type DetectedKey,
  type KeyMode,
} from '@/lib/keyDetect';

interface KeyControlProps {
  /**
   * The key reading in force — the user's pick if they made one, otherwise what was
   * detected — as the chords are stored. Transposition is applied on top of it here.
   */
  base: DetectedKey | null;
  onModeChange: (mode: KeyMode) => void;
  transposition: number;
  /** The -/+ steppers: move by a semitone, leave the reading to detection. */
  onTranspositionChange: (semitones: number) => void;
  /** Choosing a tonic in the panel: transposes AND pins the reading. */
  onKeyPick: (semitones: number) => void;
  /** Desktop packs this into a dense toolbar row; everywhere else has room. */
  compact?: boolean;
  /**
   * `pill` is the player's own shape: one rounded slab holding − / key / +, per the
   * redesign. `default` keeps the outlined-button trio the other surfaces still use.
   */
  variant?: 'default' | 'pill';
}

/**
 * The transpose control, labelled with the key it actually lands in.
 *
 * -/+ still move one semitone at a time. The middle used to read the raw semitone offset
 * ("0", "+2"), which only means something if you already know the key you started in —
 * it now reads the sounding key and opens a picker, with the offset kept as a superscript
 * so a transposed song still says so.
 *
 * Picking a tonic is a transposition and nothing else; the major/minor toggle moves
 * between relatives (C ⇄ Am), which is a relabelling and leaves the audio alone. Neither
 * one ever rewrites the chords — but both pin the reading, so that from then on editing
 * the progression cannot re-detect its way into another key and respell the sheet.
 */
export function KeyControl({
  base,
  onModeChange,
  transposition,
  onTranspositionChange,
  onKeyPick,
  compact = false,
  variant = 'default',
}: KeyControlProps) {
  const [open, setOpen] = useState(false);

  const mode: KeyMode = base?.mode ?? 'major';
  // Tonic of the untransposed progression, so the grid measures its shifts from the same
  // place the label is named from.
  const baseTonic = base ? base.pitchClass : null;
  const soundingTonic = baseTonic === null ? null : mod12(baseTonic + transposition);
  const label = soundingTonic === null ? '—' : keyLabel(soundingTonic, mode);
  const offset = transposition > 0 ? `+${transposition}` : `${transposition}`;

  const names = mode === 'minor' ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES;

  const pickTonic = (target: number) => {
    if (baseTonic === null || target === soundingTonic) return;
    // Shortest way round the circle, so switching key never drags the song an octave away.
    onKeyPick(((target - baseTonic + 18) % 12) - 6);
  };

  const stepButton = compact ? 'h-6 w-6' : 'h-7 w-7';

  // The picker panel is identical in both shapes, so it is built once.
  const panel = (
    <PopoverContent className="w-60 p-3" align="center">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(['major', 'minor'] as KeyMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-md py-1 text-xs font-medium capitalize transition-colors ${
              mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1">
        {names.map((name, pitchClass) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              pickTonic(pitchClass);
              setOpen(false);
            }}
            className={`rounded-md border py-1.5 text-xs font-bold transition-all ${
              pitchClass === soundingTonic
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span>
          {transposition === 0
            ? 'Original key'
            : `${offset} semitone${Math.abs(transposition) === 1 ? '' : 's'}`}
        </span>
        {transposition !== 0 && baseTonic !== null && (
          <button
            type="button"
            onClick={() => onTranspositionChange(0)}
            className="font-medium text-primary hover:underline"
          >
            Back to {keyLabel(baseTonic, mode)}
          </button>
        )}
      </div>
    </PopoverContent>
  );

  if (variant === 'pill') {
    return (
      <div className="cp-pill">
        <button
          type="button"
          onClick={() => onTranspositionChange(transposition - 1)}
          disabled={transposition <= -12}
          aria-label="Transpose down one semitone"
        >
          <Minus size={16} />
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!base}
              aria-label={base ? `Key of ${label}. Change key` : 'Add chords to set a key'}
              className="cp-mono flex h-[30px] min-w-[40px] items-center justify-center gap-0.5 rounded-lg border-0 bg-transparent px-1 text-sm font-bold tabular-nums disabled:opacity-50"
              style={{ color: transposition !== 0 ? 'var(--cp-act)' : 'var(--cp-tx)' }}
            >
              {label}
              {transposition !== 0 && (
                <span className="mt-0.5 self-start text-[9px] leading-none opacity-70">{offset}</span>
              )}
            </button>
          </PopoverTrigger>
          {panel}
        </Popover>

        <button
          type="button"
          onClick={() => onTranspositionChange(transposition + 1)}
          disabled={transposition >= 12}
          aria-label="Transpose up one semitone"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTranspositionChange(transposition - 1)}
            disabled={transposition <= -12}
            className={`${stepButton} p-0 shrink-0`}
            aria-label="Transpose down one semitone"
          >
            -
          </Button>
        </TooltipTrigger>
        <TooltipContent>Transpose down</TooltipContent>
      </Tooltip>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!base}
            aria-label={base ? `Key of ${label}. Change key` : 'Add chords to set a key'}
            className={`flex items-center justify-center gap-0.5 rounded-md border border-transparent px-1.5 font-mono font-medium tabular-nums transition-colors
              hover:border-border hover:bg-secondary disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent
              ${compact ? 'h-6 min-w-[2.75rem] text-sm' : 'h-7 min-w-[3rem] text-sm'}
              ${transposition !== 0 ? 'text-primary' : ''}`}
          >
            {label}
            {transposition !== 0 && (
              <span className="text-[9px] leading-none self-start mt-0.5 opacity-70">{offset}</span>
            )}
          </button>
        </PopoverTrigger>

        {panel}
      </Popover>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTranspositionChange(transposition + 1)}
            disabled={transposition >= 12}
            className={`${stepButton} p-0 shrink-0`}
            aria-label="Transpose up one semitone"
          >
            +
          </Button>
        </TooltipTrigger>
        <TooltipContent>Transpose up</TooltipContent>
      </Tooltip>
    </div>
  );
}
