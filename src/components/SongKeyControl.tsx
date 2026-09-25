import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { analytics } from '@/lib/analytics';

export const MIN_TRANSPOSE = -6;
export const MAX_TRANSPOSE = 6;

interface Props {
  transpose: number;
  onTransposeChange: (t: number) => void;
  // Names the key `semitones` away from the original, spelled exactly as the chart spells it —
  // SongChordPlayer passes its own helper so this never becomes another sharps/flats table.
  keyName: (semitones: number) => string;
  songSlug: string;
  surface: 'toolbar' | 'dock';
  // Capo: the chart shows the shapes to play with it on; the sound stays in the key above.
  capo: number;
  onCapoChange: (capo: number) => void;
  className?: string;
}

const MAX_CAPO = 7;
// Open-position shapes a beginner already knows — the capo positions worth pointing out.
const EASY_SHAPES = new Set(['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm']);

// The key, always in reach: − [Key C ▾] +. Until Sep 2026 the only way to transpose a song was
// the Pitch stepper inside the Practice panel, and ~1% of visitors used it. The middle button
// opens every key at once, so going from C to G is one tap instead of five.
export function SongKeyControl({ transpose, onTransposeChange, keyName, songSlug, surface, capo, onCapoChange, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const big = surface === 'dock';

  // The "Key C" chip under the title is server-rendered; it asks for the picker with an event.
  // Both the toolbar's and the dock's control hear it, and only the one on screen answers.
  useEffect(() => {
    const onOpenKey = () => {
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      setOpen(true);
      analytics.songKeyOpened(songSlug, 'chip');
    };
    window.addEventListener('song-open-key', onOpenKey);
    return () => window.removeEventListener('song-open-key', onOpenKey);
  }, [songSlug]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) analytics.songKeyOpened(songSlug, surface);
  };

  // One button per pitch, from the original key's lowest shift to its highest: −5…+6 keeps
  // every key reachable inside the engine's −6…+6 range without listing F# and Gb twice.
  const shifts = Array.from({ length: 12 }, (_, i) => i - 5);
  const step = `grid place-items-center text-primary hover:bg-primary/10 disabled:opacity-35 disabled:pointer-events-none transition-colors ${big ? 'w-11 h-11 rounded-xl' : 'w-8 h-9 rounded-lg'}`;

  return (
    <>
    <div
      ref={rootRef}
      className={`inline-flex items-center rounded-xl border border-primary/25 bg-primary/[0.07] ${big ? 'h-11' : 'h-9'} ${className}`}
    >
      <button
        type="button"
        className={step}
        onClick={() => onTransposeChange(Math.max(MIN_TRANSPOSE, transpose - 1))}
        disabled={transpose <= MIN_TRANSPOSE}
        aria-label="Transpose down a semitone"
      >
        <Minus className="w-4 h-4" />
      </button>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 h-full px-1.5 text-primary rounded-lg hover:bg-primary/10 transition-colors ${big ? 'flex-1 justify-center' : ''}`}
            aria-label={`Key: ${keyName(transpose)}. Pick another key`}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Key</span>
            <span className="min-w-[1.75rem] text-center text-base font-extrabold">{keyName(transpose)}</span>
            {big && capo > 0 && <span className="text-[10px] font-semibold opacity-80 whitespace-nowrap">capo {capo}</span>}
            {!big && <ChevronDown className="w-3 h-3 opacity-70" />}
          </button>
        </PopoverTrigger>
        <PopoverContent side={big ? 'top' : 'bottom'} align="center" className="w-[min(20rem,calc(100vw-1.5rem))] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Key</p>
          <div className="grid grid-cols-6 gap-1.5">
            {shifts.map(s => {
              const current = s === transpose;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onTransposeChange(s); setOpen(false); }}
                  aria-pressed={current}
                  className={`relative h-10 rounded-lg border text-sm font-bold transition-colors
                    ${current ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-secondary'}`}
                >
                  {keyName(s)}
                  {s === 0 && (
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${current ? 'bg-primary-foreground' : 'bg-emerald-500'}`} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Original key · the chart and the playback move together
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-4 mb-1.5">Capo</p>
          <div className="flex flex-col max-h-56 overflow-y-auto -mx-1">
            {Array.from({ length: MAX_CAPO + 1 }, (_, c) => {
              const shapes = keyName(transpose - c);
              const current = c === capo;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onCapoChange(c); setOpen(false); }}
                  aria-pressed={current}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-left transition-colors
                    ${current ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-secondary'}`}
                >
                  {c === 0 ? 'No capo' : `Capo ${c}`}
                  <span className={`ml-auto text-xs ${current ? 'text-primary' : 'text-muted-foreground'}`}>
                    {shapes} shapes{c > 0 && EASY_SHAPES.has(shapes) ? ' · easy' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className={step}
        onClick={() => onTransposeChange(Math.min(MAX_TRANSPOSE, transpose + 1))}
        disabled={transpose >= MAX_TRANSPOSE}
        aria-label="Transpose up a semitone"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
    {/* The toolbar also gets a Capo button of its own: the same picker, but someone looking
        for "capo" should not have to guess that it lives behind the key. */}
    {!big && (
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`inline-flex items-center h-9 px-3 rounded-lg border text-xs font-semibold transition-colors ${capo > 0 ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
      >
        {capo > 0 ? `Capo ${capo}` : 'Capo'}
        <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
      </button>
    )}
    </>
  );
}
