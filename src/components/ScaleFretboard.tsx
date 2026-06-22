import { useMemo, useRef, useState, useEffect } from 'react';
import { pitchClassName } from '@/lib/scales';
import { type NotePosition } from '@/hooks/useScalePlayback';

const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
const STRING_LABELS   = ['e', 'B', 'G', 'D', 'A', 'E'];

// ── Visual constants ───────────────────────────────────────────────────────────
const LABEL_W  = 30;
const OPEN_W   = 38;
const NUT_W    = 8;
const CELL_W   = 56;   // wider cells for breathing room
const ROW_H    = 52;   // taller rows so 34px dots don't feel cramped
const HEADER_H = 28;
const DOT_SIZE = 34;   // was 28
const DOT_FONT = 12;   // was 10

const WOOD_BG  = 'linear-gradient(180deg,#160c03 0%,#231205 35%,#160c03 65%,#231205 100%)';
const WIRE_BG  = 'linear-gradient(180deg,#221a14 0%,#d4c090 42%,#f0e0b0 50%,#d4c090 58%,#221a14 100%)';
const NUT_GRAD = 'linear-gradient(90deg,#231005,#e8dcc0 25%,#f5f0dc 50%,#e8dcc0 75%,#231005)';

// Brighter, more visible strings
const STRING_GRADS = [
  'linear-gradient(180deg,#fff 0%,#e8e8e8 50%,#c4c4c4 100%)',
  'linear-gradient(180deg,rgba(255,255,255,.96) 0%,#e0e0e0 50%,#bcbcbc 100%)',
  'linear-gradient(180deg,rgba(255,255,255,.88) 0%,#d8c898 50%,#a88848 100%)',
  'linear-gradient(180deg,rgba(255,255,255,.82) 0%,#cebe80 50%,#98784a 100%)',
  'linear-gradient(180deg,rgba(255,255,255,.76) 0%,#c4ae68 50%,#8a6838 100%)',
  'linear-gradient(180deg,rgba(255,255,255,.68) 0%,#b8a060 50%,#7c5830 100%)',
];
const STRING_H = [1.5, 2, 2.5, 3, 4, 5.5];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ── Dot colors ────────────────────────────────────────────────────────────────
// All backgrounds are fully opaque for WCAG AA contrast against the dark wood
function dotStyle(
  isRoot: boolean,
  isActive: boolean,
  hasActivePlaying: boolean,
): React.CSSProperties {
  if (isActive) {
    return {
      background: '#fbbf24',
      boxShadow: '0 0 18px rgba(251,191,36,.95), 0 0 7px rgba(251,191,36,.7)',
      color: '#3d1a02',
      border: 'none',
      transform: `translate(-50%,-50%) scale(1.18)`,
    };
  }
  if (hasActivePlaying) {
    return {
      background: isRoot ? 'rgba(59,130,246,.50)' : 'rgba(155,150,140,.62)',
      boxShadow: 'none',
      color: isRoot ? 'rgba(255,255,255,.75)' : 'rgba(25,20,15,.65)',
      border: 'none',
    };
  }
  if (isRoot) {
    return {
      background: '#3b82f6',
      boxShadow: '0 0 12px rgba(59,130,246,.75), 0 0 4px rgba(59,130,246,.5)',
      color: '#ffffff',
      border: 'none',
    };
  }
  // Scale note: warm ivory/cream — solid, clearly visible on dark wood
  return {
    background: 'rgba(192,187,175,0.92)',
    boxShadow: '0 1px 3px rgba(0,0,0,.45)',
    color: '#1a1510',
    border: 'none',
  };
}

// ── Dot component ─────────────────────────────────────────────────────────────
interface DotProps {
  name: string;
  isRoot: boolean;
  isActive: boolean;
  hasActivePlaying: boolean;
}
function Dot({ name, isRoot, isActive, hasActivePlaying }: DotProps) {
  const s = dotStyle(isRoot, isActive, hasActivePlaying);
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      transform: s.transform ?? 'translate(-50%,-50%)',
      width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: DOT_FONT, fontWeight: 700, fontFamily: 'ui-monospace,monospace',
      zIndex: 10, transition: 'all 0.08s',
      flexShrink: 0,
      ...s,
    }}>
      {name}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface ScaleFretboardProps {
  rootPitchClass: number;
  scalePath: NotePosition[];
  activePosition?: NotePosition | null;
}

export function ScaleFretboard({
  rootPitchClass,
  scalePath,
  activePosition = null,
}: ScaleFretboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.getBoundingClientRect().width));
    ro.observe(el);
    setContainerW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const { startFret, endFret, showNut } = useMemo(() => {
    if (!scalePath.length) return { startFret: 0, endFret: 5, showNut: true };
    const frets = scalePath.map(p => p.fret);
    const mn = Math.min(...frets);
    const mx = Math.max(...frets);
    const sf = mn === 0 ? 0 : Math.max(0, mn - 1);
    return { startFret: sf, endFret: Math.min(15, mx + 1), showNut: sf === 0 };
  }, [scalePath]);

  const fretCols  = Array.from({ length: endFret - startFret + 1 }, (_, i) => startFret + i);
  const cellFrets = showNut ? fretCols.filter(f => f > 0) : fretCols;

  const naturalW = LABEL_W + (showNut ? OPEN_W + NUT_W : 0) + cellFrets.length * CELL_W;
  const naturalH = HEADER_H + ROW_H * 6;
  const scale    = Math.min(1, containerW / naturalW);

  const MARK_FRETS = new Set([3, 5, 7, 9, 12]);

  const positionLabel = startFret === 0
    ? 'Open position'
    : `${ROMAN[startFret] ?? `${startFret}th`} position  •  frets ${startFret}–${endFret}`;

  return (
    <div>
      {/* Scaled fretboard */}
      <div ref={containerRef} style={{ overflow: 'hidden', height: Math.round(naturalH * scale), borderRadius: 10 }}>
        <div style={{
          width: naturalW, height: naturalH,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          background: '#0d0908', overflow: 'hidden',
        }}>

          {/* ── Fret-number header ──────────────────────────────────────────── */}
          <div style={{
            display: 'flex', height: HEADER_H,
            background: 'hsl(224 22% 7%)',
            borderBottom: '1px solid hsl(224 18% 13%)',
          }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            {showNut && (
              <div style={{
                width: OPEN_W + NUT_W, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'hsl(220 10% 42%)', fontSize: 11, fontFamily: 'monospace',
              }}>
                0
              </div>
            )}
            {cellFrets.map(f => (
              <div key={f} style={{
                width: CELL_W, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: MARK_FRETS.has(f) ? 'hsl(220 10% 68%)' : 'hsl(220 10% 38%)',
                fontSize: 11, fontFamily: 'monospace',
                fontWeight: MARK_FRETS.has(f) ? 700 : 400,
              }}>
                {f}
              </div>
            ))}
          </div>

          {/* ── String rows ─────────────────────────────────────────────────── */}
          {STANDARD_TUNING.map((openMidi, si) => (
            <div key={si} style={{ display: 'flex', height: ROW_H, position: 'relative' }}>

              {/* String label */}
              <div style={{
                width: LABEL_W, flexShrink: 0, zIndex: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(224 22% 7%)',
                borderRight: '2px solid hsl(224 18% 13%)',
                color: 'hsl(220 10% 58%)',
                fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
              }}>
                {STRING_LABELS[si]}
              </div>

              {/* Open string column */}
              {showNut && (() => {
                const pc       = openMidi % 12;
                const onPath   = scalePath.some(p => p.stringIndex === si && p.fret === 0);
                const isRoot   = pc === rootPitchClass % 12;
                const isActive = activePosition?.stringIndex === si && activePosition?.fret === 0;
                const name     = onPath ? pitchClassName(pc, rootPitchClass) : '';
                return (
                  <div key="open" style={{ width: OPEN_W, flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'hsl(224 18% 8%)' }} />
                    <div style={{
                      position: 'absolute', left: 0, right: 0,
                      top: '50%', transform: 'translateY(-50%)',
                      height: STRING_H[si], background: STRING_GRADS[si],
                    }} />
                    {onPath && <Dot name={name} isRoot={isRoot} isActive={isActive} hasActivePlaying={activePosition !== null} />}
                  </div>
                );
              })()}

              {/* Nut */}
              {showNut && (
                <div style={{ width: NUT_W, flexShrink: 0, background: NUT_GRAD, zIndex: 3, boxShadow: '2px 0 8px rgba(0,0,0,.7)' }} />
              )}

              {/* Fret cells */}
              {cellFrets.map((fret, fi) => {
                const midi     = openMidi + fret;
                const pc       = midi % 12;
                const onPath   = scalePath.some(p => p.stringIndex === si && p.fret === fret);
                const isRoot   = pc === rootPitchClass % 12;
                const isActive = activePosition?.stringIndex === si && activePosition?.fret === fret;
                const name     = onPath ? pitchClassName(pc, rootPitchClass) : '';

                const leftBorder = !showNut && fi === 0
                  ? '3px solid rgba(200,180,140,.35)'
                  : 'none';

                return (
                  <div key={fret} style={{ width: CELL_W, flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: WOOD_BG, borderLeft: leftBorder }} />
                    <div style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      width: 2, background: WIRE_BG, zIndex: 2,
                    }} />
                    <div style={{
                      position: 'absolute', left: 0, right: 0,
                      top: '50%', transform: 'translateY(-50%)',
                      height: STRING_H[si], background: STRING_GRADS[si], zIndex: 1,
                    }} />
                    {onPath && (
                      <Dot name={name} isRoot={isRoot} isActive={isActive} hasActivePlaying={activePosition !== null} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Position label — outside the scaled div so it stays readable */}
      <p style={{
        textAlign: 'center',
        marginTop: 8,
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
        color: 'hsl(220 10% 45%)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {positionLabel}
      </p>
    </div>
  );
}
