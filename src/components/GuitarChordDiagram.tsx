import type { GuitarVoicing } from '@/data/guitarChords';

// ─── SVG coordinate constants (reverse-engineered from reference SVGs) ────────
const W = 235;
const H = 271;
const STRING_X = [30, 65, 100, 135, 170, 205] as const;
const FRET_Y    = [55, 104, 153, 202, 251]    as const; // 5 lines (nut + 4 frets)
const ROW_Y     = [79.5, 128.5, 177.5, 226.5] as const; // centers between fret pairs
const ABOVE_Y   = 35.4;   // y for open ○ and muted × markers
const DOT_R     = 16;     // finger dot radius
const OPEN_R    = 7;      // open string circle radius

// ─── Colors (dark-theme CSS variables) ────────────────────────────────────────
const C_LINE   = 'hsl(var(--border))';
const C_NUT    = 'hsl(var(--foreground))';
const C_DOT    = 'hsl(var(--primary))';
const C_DOT_TXT= 'hsl(var(--primary-foreground))';
const C_OPEN   = 'hsl(var(--foreground))';
const C_MUTED  = 'hsl(var(--muted-foreground))';
const C_LABEL  = 'hsl(var(--foreground))';

interface Props {
  voicing: GuitarVoicing;
  chordName?: string;
  className?: string;
}

export function GuitarChordDiagram({ voicing, chordName, className = '' }: Props) {
  const { frets, fingers, barre, baseFret } = voicing;

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
            strokeWidth={1}
          />
        ))}

        {/* ── Horizontal fret lines ── */}
        {FRET_Y.map((y, i) => (
          <line
            key={y}
            x1={STRING_X[0]} y1={y}
            x2={STRING_X[5]} y2={y}
            stroke={i === 0 && baseFret === 1 ? C_NUT : C_LINE}
            strokeWidth={i === 0 && baseFret === 1 ? 4 : 1}
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
                strokeWidth={2}
              />
            );
          }
          if (fret === -1) {
            const s = OPEN_R - 1;
            return (
              <g key={`muted-${si}`} stroke={C_MUTED} strokeWidth={2}>
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
          return (
            <rect
              x={x1 - 10}
              y={cy - DOT_R}
              width={x2 - x1 + 20}
              height={DOT_R * 2}
              rx={DOT_R}
              fill={C_DOT}
            />
          );
        })()}

        {/* ── Finger dots ── */}
        {frets.map((fret, si) => {
          if (fret <= 0) return null;
          const row = toRow(fret);
          if (row < 0 || row > 3) return null;
          const cx = STRING_X[si];
          const cy = ROW_Y[row];
          const finger = fingers[si];
          return (
            <g key={`dot-${si}`} fill={C_DOT}>
              <circle cx={cx} cy={cy} r={DOT_R} stroke="transparent" />
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
}
