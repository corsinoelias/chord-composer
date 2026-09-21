import { useMemo } from 'react';

interface PianoKeyboardProps {
  activeNotes: string[];   // pitch classes, root first
  chordName?: string;
  className?: string;
  /**
   * `player` is the chord player's keyboard: separated, rounded keys, the chord's white
   * keys tinted in the accent rather than only dotted. `default` is the shared one every
   * other surface uses.
   */
  variant?: 'default' | 'player';
}

// ── Player variant geometry, straight off the redesign canvas ──────────────────────────
const P_W = 336;
const P_H = 100;
const P_WW = 23;        // white key width; they sit on a 24px pitch, so 1px of air between
const P_BW = 14;
const P_BH = 60;
const P_BLACK_X_IN_OCT = [17, 41, 89, 113, 137];
const P_OCT_W = 168;

const WW = 28;
const WH = 78;
const BW = 20;
const BH = 48;

// Fixed 2-octave layout: C to B × 2 — always the same span, regardless of chord
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

const TOTAL_W = WHITE_NOTES.length * WW;

// Marker radii — kept close to each other so the two forms read as "the same
// dot" at a glance. The hollow black-key ring is drawn a touch bigger than
// the solid white-key disc: an outline reads as lighter/smaller than a filled
// shape of the same radius (the eye weighs ink, not just the boundary), so
// this compensates rather than actually matching pixel-for-pixel.
const W_DOT_R = 7.5;
const B_DOT_R = 8;
const B_DOT_STROKE = 2.5;

// Fixed, theme-independent piano colors — a keyboard is a real-world object
// (always white/black keys), not a themed UI surface, so it stays legible
// against the app's background in both light and dark mode.
const WHITE_KEY_FILL = '#f4f4f5'; // zinc-100 — just enough off-white to read as a shape on a white card
const KEY_LINE = '#71717a';       // zinc-500 — one clean line per key boundary, no doubling
const BLACK_KEY_FILL = '#3f3f46'; // zinc-700 — dark but not ink-heavy

export function PianoKeyboard({ activeNotes, chordName, className = '', variant = 'default' }: PianoKeyboardProps) {
  const { white: wHighlight, black: bHighlight } = useMemo(
    () => computeHighlights(activeNotes),
    [activeNotes],
  );

  if (variant === 'player') {
    return (
      <svg
        viewBox={`0 0 ${P_W} ${P_H}`}
        width="100%"
        className={`block rounded-md ${className}`}
        aria-label={chordName ? `Piano keys for ${chordName}` : 'Piano keys'}
      >
        {WHITE_NOTES.map((_, i) => (
          <rect
            key={`w-${i}`}
            className={wHighlight.has(i) ? 'cp-ka' : 'cp-kw'}
            x={i * (P_WW + 1)} y={0} width={P_WW} height={P_H} rx={3}
          />
        ))}

        {[0, 1].flatMap(oct =>
          P_BLACK_X_IN_OCT.map((xOff, ki) => (
            <rect
              key={`b-${oct}-${ki}`}
              className={bHighlight.has(oct * 5 + ki) ? 'cp-kd' : 'cp-kb'}
              x={oct * P_OCT_W + xOff} y={0} width={P_BW} height={P_BH} rx={2}
            />
          )),
        )}

        {/* Markers: a solid disc low on a tinted white key, a light disc on a black one. */}
        {WHITE_NOTES.map((_, i) =>
          wHighlight.has(i) ? (
            <circle key={`wd-${i}`} className="cp-kd" cx={i * (P_WW + 1) + P_WW / 2} cy={86} r={6} />
          ) : null,
        )}
        {[0, 1].flatMap(oct =>
          P_BLACK_X_IN_OCT.map((xOff, ki) =>
            bHighlight.has(oct * 5 + ki) ? (
              <circle
                key={`bd-${oct}-${ki}`}
                cx={oct * P_OCT_W + xOff + P_BW / 2} cy={46} r={5}
                fill="#FFFFFF"
              />
            ) : null,
          ),
        )}
      </svg>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {chordName && (
        <span className="text-base font-bold text-primary tracking-tight">
          {chordName}
        </span>
      )}

      <svg
        viewBox={`0 0 ${TOTAL_W} ${WH}`}
        width="100%"
        style={{ maxWidth: TOTAL_W }}
        aria-hidden="true"
      >
        {/* Outer silhouette — one continuous stroke for the whole white-key row, instead of a
            stroked rect per key. Adjacent per-key strokes used to sit a couple pixels apart and
            read as a doubled line; a single outline has none of that. */}
        <rect x={0} y={0} width={TOTAL_W} height={WH} fill={WHITE_KEY_FILL} stroke={KEY_LINE} strokeWidth="1.5" />

        {/* Key dividers — one line per boundary, shared between neighbors */}
        {Array.from({ length: WHITE_NOTES.length - 1 }, (_, i) => (i + 1) * WW).map(x => (
          <line key={`div-${x}`} x1={x} y1={0} x2={x} y2={WH} stroke={KEY_LINE} strokeWidth="1" />
        ))}

        {/* Black keys — 2 octaves */}
        {[0, 1].flatMap(oct =>
          BLACK_X_IN_OCT.map((xOff, ki) => (
            <rect
              key={`b-${oct}-${ki}`}
              x={oct * OCT_W + xOff} y={0}
              width={BW} height={BH}
              rx={2}
              fill={BLACK_KEY_FILL}
            />
          )),
        )}

        {/* Dot markers — solid on white keys (dot fill contrasts against the light key),
            hollow on black keys (a solid dot would disappear against the dark key) */}
        {WHITE_NOTES.map((_, i) =>
          wHighlight.has(i) ? (
            <circle
              key={`wd-${i}`}
              cx={i * WW + WW / 2} cy={WH - W_DOT_R - 8}
              r={W_DOT_R}
              fill="hsl(var(--primary))"
            />
          ) : null,
        )}

        {[0, 1].flatMap(oct =>
          BLACK_X_IN_OCT.map((xOff, ki) => {
            const globalIdx = oct * 5 + ki;
            return bHighlight.has(globalIdx) ? (
              <circle
                key={`bd-${oct}-${ki}`}
                cx={oct * OCT_W + xOff + BW / 2} cy={BH - B_DOT_R - 5}
                r={B_DOT_R}
                fill={WHITE_KEY_FILL}
                stroke="hsl(var(--primary))"
                strokeWidth={B_DOT_STROKE}
              />
            ) : null;
          }),
        )}
      </svg>
    </div>
  );
}
