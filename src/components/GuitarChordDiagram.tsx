import { memo } from 'react';
import type { GuitarVoicing } from '@/data/guitarChords';

// ─── SVG coordinate constants (reverse-engineered from reference SVGs) ────────
// String x-positions are derived from the voicing's own string count (35px apart, 30px
// left padding) rather than hardcoded to 6 — that's what lets this same diagram render a
// 4-string ukulele voicing (see ukuleleChords.ts) with no separate component.
const STRING_SPACING = 35;
const PAD_X = 30;
const H = 271;
const FRET_Y    = [55, 104, 153, 202, 251]    as const; // 5 lines (nut + 4 frets)
const ROW_Y     = [79.5, 128.5, 177.5, 226.5] as const; // centers between fret pairs
const ABOVE_Y   = 35.4;   // y for open ○ and muted × markers
const DOT_R     = 16;     // finger dot radius
const OPEN_R    = 7;      // open string circle radius

// ─── Colors (dark-theme CSS variables) ────────────────────────────────────────
// Line color intentionally pulls from --muted-foreground (not --border) at fixed opacity —
// --border reads as near-invisible hairlines on this diagram's white/dark card background;
// this reads as a real string/fret line at a glance, closer to reference chord-chart UIs.
const C_LINE   = 'hsl(var(--muted-foreground) / 0.55)';
const C_NUT    = 'hsl(var(--foreground))';
const C_DOT    = 'hsl(var(--primary))';
const C_DOT_TXT= 'hsl(var(--primary-foreground))';
const C_OPEN   = 'hsl(var(--foreground))';
const C_MUTED  = 'hsl(var(--muted-foreground))';
const C_LABEL  = 'hsl(var(--foreground))';
// Halo behind finger dots/barre so they read as sitting ON TOP of the string lines instead of
// visually merging with them — matches how reference chord-chart apps punch a dot through the
// string. Falls back cleanly since it's just another filled shape, not a real cutout.
const C_HALO   = 'hsl(var(--card))';

interface Props {
  voicing: GuitarVoicing;
  chordName?: string;
  className?: string;
}

export const GuitarChordDiagram = memo(function GuitarChordDiagram({ voicing, chordName, className = '' }: Props) {
  const { frets, fingers, barre, baseFret } = voicing;
  const STRING_X = frets.map((_, i) => PAD_X + i * STRING_SPACING);
  const W = STRING_X[STRING_X.length - 1] + PAD_X;

  // Row index for an absolute fret (0-indexed within the 4 visible rows)
  const toRow = (fret: number) => fret - baseFret;

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {chordName && (
        <span className="text-base font-bold font-mono text-foreground tracking-tight">
          {chordName}
        </span>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W }}
        aria-hidden="true"
      >
        {/* ── Fret number label (when not at nut) ── */}
        {baseFret > 1 && (
          <text
            x={14.5}
            y={ROW_Y[0]}
            fontSize={16}
            fill={C_LABEL}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {baseFret}fr
          </text>
        )}

        {/* ── Vertical string lines ── */}
        {STRING_X.map(x => (
          <line
            key={x}
            x1={x} y1={FRET_Y[0]}
            x2={x} y2={FRET_Y[4]}
            stroke={C_LINE}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        {/* ── Horizontal fret lines ── */}
        {FRET_Y.map((y, i) => (
          <line
            key={y}
            x1={STRING_X[0]} y1={y}
            x2={STRING_X[STRING_X.length - 1]} y2={y}
            stroke={i === 0 && baseFret === 1 ? C_NUT : C_LINE}
            strokeWidth={i === 0 && baseFret === 1 ? 5 : 1.5}
            strokeLinecap="round"
          />
        ))}

        {/* ── Open / muted markers above nut ── */}
        {frets.map((fret, si) => {
          const x = STRING_X[si];
          if (fret === 0) {
            return (
              <circle
                key={`open-${si}`}
                cx={x} cy={ABOVE_Y} r={OPEN_R}
                fill="transparent"
                stroke={C_OPEN}
                strokeWidth={2.5}
              />
            );
          }
          if (fret === -1) {
            const s = OPEN_R - 1;
            return (
              <g key={`muted-${si}`} stroke={C_MUTED} strokeWidth={2.5} strokeLinecap="round">
                <line x1={x - s} y1={ABOVE_Y - s} x2={x + s} y2={ABOVE_Y + s} />
                <line x1={x + s} y1={ABOVE_Y - s} x2={x - s} y2={ABOVE_Y + s} />
              </g>
            );
          }
          return null;
        })}

        {/* ── Barre bar ── */}
        {barre && (() => {
          const row = toRow(barre.fret);
          if (row < 0 || row > 3) return null;
          const cy = ROW_Y[row];
          const x1 = STRING_X[barre.fromString];
          const x2 = STRING_X[barre.toString];
          const cx = (x1 + x2) / 2;
          // The finger holding the barre — read off whichever covered string is
          // actually stopped at the barre fret (they should all agree).
          const barreFinger = fingers.find((_, si) =>
            si >= barre.fromString && si <= barre.toString && frets[si] === barre.fret
          ) ?? 0;
          return (
            <g>
              <rect
                x={x1 - 10 - 2}
                y={cy - DOT_R - 2}
                width={x2 - x1 + 20 + 4}
                height={DOT_R * 2 + 4}
                rx={DOT_R + 2}
                fill={C_HALO}
              />
              <rect
                x={x1 - 10}
                y={cy - DOT_R}
                width={x2 - x1 + 20}
                height={DOT_R * 2}
                rx={DOT_R}
                fill={C_DOT}
              />
              {barreFinger > 0 && (
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight={100}
                  fill={C_DOT_TXT}
                  stroke={C_DOT_TXT}
                  strokeWidth={0.3}
                  style={{ userSelect: 'none' }}
                >
                  {barreFinger}
                </text>
              )}
            </g>
          );
        })()}

        {/* ── Finger dots ── */}
        {/* Skip strings already represented by the barre pill above — only strings actually
            stopped AT the barre fret are covered by it; a string inside the barre's string
            range but fretted higher by another finger (e.g. Bmin) still gets its own dot. */}
        {frets.map((fret, si) => {
          if (fret <= 0) return null;
          const isBarredHere = !!barre && fret === barre.fret && si >= barre.fromString && si <= barre.toString;
          if (isBarredHere) return null;
          const row = toRow(fret);
          if (row < 0 || row > 3) return null;
          const cx = STRING_X[si];
          const cy = ROW_Y[row];
          const finger = fingers[si];
          return (
            <g key={`dot-${si}`}>
              <circle cx={cx} cy={cy} r={DOT_R + 2} fill={C_HALO} />
              <circle cx={cx} cy={cy} r={DOT_R} fill={C_DOT} />
              {finger > 0 && (
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight={100}
                  fill={C_DOT_TXT}
                  stroke={C_DOT_TXT}
                  strokeWidth={0.3}
                  style={{ userSelect: 'none' }}
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
