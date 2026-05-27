import { useMemo } from 'react';

interface PianoKeyboardProps {
  activeNotes: string[];   // pitch classes, root first
  chordName?: string;
  className?: string;
}

const WW = 28;
const WH = 78;
const BW = 18;
const BH = 48;

// Fixed 2-octave layout: C to B × 2
const WHITE_NOTES = ['C','D','E','F','G','A','B','C','D','E','F','G','A','B'];
// Semitone position of each white key (C4=0 … B5=23)
const WHITE_POS   = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];

const BLACK_NOTES_2 = ['C#','D#','F#','G#','A#','C#','D#','F#','G#','A#'];
// Semitone position of each black key
const BLACK_POS_2   = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];

// SVG x offset for each black key (same formula for both octaves)
const OCT_W = 7 * WW;
const BLACK_X_IN_OCT = [
  1*WW - BW/2 - 1,  // C#
  2*WW - BW/2 - 1,  // D#
  4*WW - BW/2 - 1,  // F#
  5*WW - BW/2 - 1,  // G#
  6*WW - BW/2 - 1,  // A#
];

const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};
function normalize(n: string) { return FLAT_TO_SHARP[n] ?? n; }

const NOTE_TO_SEM: Record<string, number> = {
  C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11,
};
const SEM_TO_NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Keys sorted by ascending pitch position
const ALL_KEYS_SORTED = [
  ...WHITE_POS.map((pos, i) => ({ pos, idx: i, type: 'white' as const, note: WHITE_NOTES[i] })),
  ...BLACK_POS_2.map((pos, i) => ({ pos, idx: i, type: 'black' as const, note: BLACK_NOTES_2[i] })),
].sort((a, b) => a.pos - b.pos);

/**
 * Each chord note is highlighted exactly ONCE, in ascending order starting
 * from the root. This prevents the "6 keys for C major" confusion.
 */
function computeHighlights(activeNotes: string[]) {
  const white = new Set<number>();
  const black = new Set<number>();
  if (!activeNotes.length) return { white, black };

  const rootSem = NOTE_TO_SEM[normalize(activeNotes[0])] ?? 0;

  // Unique semitones sorted by ascending interval from root
  const semitones = [...new Set(activeNotes.map(n => NOTE_TO_SEM[normalize(n)] ?? 0))]
    .sort((a, b) => ((a - rootSem + 12) % 12) - ((b - rootSem + 12) % 12));

  let currentPos = -1;

  for (const sem of semitones) {
    const name = SEM_TO_NOTE[sem];
    const key = ALL_KEYS_SORTED.find(k => k.note === name && k.pos > currentPos);
    if (key) {
      key.type === 'white' ? white.add(key.idx) : black.add(key.idx);
      currentPos = key.pos;
    }
  }

  return { white, black };
}

const TOTAL_W = WHITE_NOTES.length * WW; // 392

export function PianoKeyboard({ activeNotes, chordName, className = '' }: PianoKeyboardProps) {
  const { white: wHighlight, black: bHighlight } = useMemo(
    () => computeHighlights(activeNotes),
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
        viewBox={`0 0 ${TOTAL_W} ${WH}`}
        width="100%"
        style={{ maxWidth: TOTAL_W }}
        aria-hidden="true"
      >
        {/* White keys */}
        {WHITE_NOTES.map((note, i) => {
          const active = wHighlight.has(i);
          return (
            <rect
              key={`w-${i}`}
              x={i * WW + 1} y={0}
              width={WW - 2} height={WH}
              rx={3}
              fill={active ? 'hsl(var(--primary))' : 'hsl(220 14% 82%)'}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
          );
        })}

        {/* Labels on active white keys */}
        {WHITE_NOTES.map((note, i) =>
          wHighlight.has(i) ? (
            <text
              key={`wl-${i}`}
              x={i * WW + WW / 2} y={WH - 9}
              textAnchor="middle" fontSize="9" fontWeight="700"
              fill="hsl(var(--primary-foreground))"
              style={{ userSelect: 'none' }}
            >
              {note}
            </text>
          ) : null,
        )}

        {/* Black keys — 2 octaves */}
        {[0, 1].flatMap(oct =>
          BLACK_X_IN_OCT.map((xOff, ki) => {
            const globalIdx = oct * 5 + ki;
            const active = bHighlight.has(globalIdx);
            return (
              <rect
                key={`b-${oct}-${ki}`}
                x={oct * OCT_W + xOff} y={0}
                width={BW} height={BH}
                rx={2}
                fill={active ? 'hsl(var(--primary))' : 'hsl(224 71% 8%)'}
              />
            );
          }),
        )}

        {/* Labels on active black keys */}
        {[0, 1].flatMap(oct =>
          BLACK_X_IN_OCT.map((xOff, ki) => {
            const globalIdx = oct * 5 + ki;
            return bHighlight.has(globalIdx) ? (
              <text
                key={`bl-${oct}-${ki}`}
                x={oct * OCT_W + xOff + BW / 2} y={BH - 7}
                textAnchor="middle" fontSize="8" fontWeight="700"
                fill="hsl(var(--primary-foreground))"
                style={{ userSelect: 'none' }}
              >
                {BLACK_NOTES_2[globalIdx]}
              </text>
            ) : null;
          }),
        )}
      </svg>

      {/* Note pills */}
      {activeNotes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          {activeNotes.map(note => (
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
