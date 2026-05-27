import { useMemo } from 'react';

interface PianoKeyboardProps {
  activeNotes: string[];
  chordName?: string;
  className?: string;
}

// Normalize flat note names to sharp equivalents for key matching
const FLAT_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
  'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function normalize(note: string): string {
  return FLAT_TO_SHARP[note] ?? note;
}

const WW = 32;   // white key width
const WH = 80;   // white key height
const BW = 20;   // black key width
const BH = 50;   // black key height

// Single octave — C to B
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Black key definitions: [pitch class, x offset within octave]
const BLACK_DEFS: [string, number][] = [
  ['C#', 21],
  ['D#', 53],
  ['F#', 117],
  ['G#', 149],
  ['A#', 181],
];

const TOTAL_WIDTH = WHITE_NOTES.length * WW; // 224

export function PianoKeyboard({ activeNotes, chordName, className = '' }: PianoKeyboardProps) {
  const activeSet = useMemo(
    () => new Set(activeNotes.map(normalize)),
    [activeNotes],
  );

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {chordName && (
        <span className="text-base font-bold font-mono text-foreground tracking-tight">
          {chordName}
        </span>
      )}

      <svg
        viewBox={`0 0 ${TOTAL_WIDTH} ${WH}`}
        width="100%"
        style={{ maxWidth: TOTAL_WIDTH }}
        aria-hidden="true"
      >
        {/* White keys */}
        {WHITE_NOTES.map((note, i) => {
          const active = activeSet.has(note);
          return (
            <rect
              key={`w-${i}`}
              x={i * WW + 1}
              y={0}
              width={WW - 2}
              height={WH}
              rx={3}
              fill={active ? 'hsl(var(--primary))' : 'hsl(220 14% 82%)'}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
          );
        })}

        {/* Note labels on active white keys */}
        {WHITE_NOTES.map((note, i) =>
          activeSet.has(note) ? (
            <text
              key={`wl-${i}`}
              x={i * WW + WW / 2}
              y={WH - 9}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="hsl(var(--primary-foreground))"
              style={{ userSelect: 'none' }}
            >
              {note}
            </text>
          ) : null,
        )}

        {/* Black keys */}
        {BLACK_DEFS.map(([note, xOff]) => {
          const active = activeSet.has(note);
          return (
            <rect
              key={`b-${note}`}
              x={xOff}
              y={0}
              width={BW}
              height={BH}
              rx={2}
              fill={active ? 'hsl(var(--primary))' : 'hsl(224 71% 8%)'}
            />
          );
        })}

        {/* Note labels on active black keys */}
        {BLACK_DEFS.map(([note, xOff]) =>
          activeSet.has(note) ? (
            <text
              key={`bl-${note}`}
              x={xOff + BW / 2}
              y={BH - 7}
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="hsl(var(--primary-foreground))"
              style={{ userSelect: 'none' }}
            >
              {note}
            </text>
          ) : null,
        )}
      </svg>

      {/* Note names row */}
      {activeNotes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          {activeNotes.map((note) => (
            <span
              key={note}
              className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30"
            >
              {note}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
