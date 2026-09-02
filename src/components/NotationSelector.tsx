import { NOTATION_OPTIONS, type SongNotation } from '@/lib/songNotation';

interface Props {
  value: SongNotation;
  onChange: (n: SongNotation) => void;
  // The *transposed* key the degree numbers are counted from, so the hint follows the Pitch
  // control rather than the song's original key.
  displayKey: string;
  className?: string;
}

// How chord names are spelled, sitting in the same row as the density picker ("Lyrics + chords /
// Compact / Chords only") and deliberately wearing its exact styling: side by side they read as
// one group of "how do I want to read this chart" controls, which is what they are. It lives here
// rather than in the Practice panel because discoverability is the whole point — this was built
// after a reader had to write in and ask for number charts, and a control behind a collapsed
// button called "Practice" is one the next reader won't find either.
export function NotationSelector({ value, onChange, displayKey, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Without this a "1" means nothing, and since transposing moves the key but not the
          numbers, it has to name the *current* key rather than the song's original. Shown at
          every width on purpose: the header's "Key of …" chip is server-rendered and does not
          follow the Pitch control, so on mobile this is the only thing that says which key the
          numbers belong to. The parent wraps, so at very narrow widths it takes its own line
          rather than squeezing the buttons. */}
      {value === 'number' && (
        <span className="text-[10px] text-muted-foreground/80 whitespace-nowrap">
          relative to {displayKey}
        </span>
      )}
      <div className="inline-flex p-0.5 rounded-lg bg-secondary/60">
        {NOTATION_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            // The short labels can't explain themselves — "1 4 5" is meaningless to anyone who
            // has never seen a number chart.
            title={opt.title}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
              ${value === opt.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
