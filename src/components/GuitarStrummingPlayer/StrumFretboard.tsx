import { useRef, type CSSProperties, type MutableRefObject, type RefObject } from 'react';
import type { FretboardGeometry } from '@/lib/guitarStrum/fretboardGeometry';

interface Props {
  geometry: FretboardGeometry;
  fbRef: RefObject<HTMLDivElement>;
  stringRefs: MutableRefObject<(SVGPathElement | null)[]>;
  showDiagram: boolean;
  chordName: string;
  chordNotes: string;
  countBeat: string;
  onPluck: (stringIndex: number) => void;
  onStrumDown: () => void;
  onStrumUp: () => void;
  showHint: boolean;
  onDismissHint: () => void;
}

const PRIMARY = 'hsl(262 83% 52%)';

export function StrumFretboard({
  geometry, fbRef, stringRefs, showDiagram, chordName, chordNotes, countBeat,
  onPluck, onStrumDown, onStrumUp, showHint, onDismissHint,
}: Props) {
  const draggingRef = useRef(false);
  const dragIndexRef = useRef(-1);

  const idxFromEvent = (e: React.PointerEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const yv = ((e.clientY - rect.top) / rect.height) * (geometry.height || rect.height);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(yv - geometry.ys[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return bestDist < geometry.gap * 0.62 ? best : -1;
  };

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    const i = idxFromEvent(e);
    dragIndexRef.current = i;
    if (i >= 0) onPluck(i);
  };
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    const i = idxFromEvent(e);
    if (i < 0 || i === dragIndexRef.current) return;
    if (dragIndexRef.current < 0) {
      onPluck(i);
    } else {
      const dir = i > dragIndexRef.current ? 1 : -1;
      for (let k = dragIndexRef.current + dir; k !== i + dir; k += dir) onPluck(k);
    }
    dragIndexRef.current = i;
  };
  const handleUp = () => { draggingRef.current = false; dragIndexRef.current = -1; };

  const roundBtn: CSSProperties = {
    flex: '0 0 auto', width: 44, height: 44, borderRadius: 999,
    border: '1px solid hsl(262 50% 70% / 0.35)', background: 'hsl(224 30% 18% / 0.8)',
    color: '#fff', fontSize: 19, cursor: 'pointer', pointerEvents: 'auto',
  };

  return (
    <div ref={fbRef} style={{ flex: '1 1 auto', minHeight: 170, position: 'relative', background: 'hsl(224 26% 11%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(110% 80% at 50% -10%, hsl(262 60% 34% / 0.5), transparent 62%)', pointerEvents: 'none' }} />

      <svg
        viewBox={geometry.viewBox}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      >
        <defs>
          <linearGradient id="csWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="hsl(28 40% 26%)" stopOpacity={0.5} />
            <stop offset={0.5} stopColor="hsl(24 35% 14%)" stopOpacity={0.18} />
            <stop offset={1} stopColor="hsl(20 30% 8%)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <rect x={geometry.board.x} y={geometry.board.y} width={geometry.board.w} height={geometry.board.h} fill="hsl(24 30% 12%)" />
        <rect x={geometry.board.x} y={geometry.board.y} width={geometry.board.w} height={geometry.board.h} fill="url(#csWood)" />
        <rect x={geometry.nut.x} y={geometry.nut.y} width={geometry.nut.w} height={geometry.nut.h} rx={2} fill="hsl(40 30% 86%)" />
        {geometry.fretLines.map((f, i) => (
          <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill="hsl(35 12% 60%)" />
        ))}
        {geometry.inlays.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="hsl(40 20% 90%)" opacity={0.13} />
        ))}
        {geometry.dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={PRIMARY} />
        ))}
        {geometry.strings.map((s, i) => (
          <path
            key={i}
            d={s.d}
            ref={el => { stringRefs.current[i] = el; }}
            fill="none"
            stroke="hsl(220 12% 72%)"
            strokeWidth={s.strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {geometry.dots.map((d, i) => (
          <span key={i} style={{
            position: 'absolute', left: `${d.leftPct}%`, top: `${d.topPct}%`, transform: 'translate(-50%, -50%)',
            color: '#fff', fontFamily: "'Space Mono', ui-monospace, monospace", fontWeight: 700, lineHeight: 1, fontSize: d.fontSize,
          }}>{d.label}</span>
        ))}
        {geometry.strings.map((s, i) => (
          <span key={i} style={{
            position: 'absolute', left: `${s.leftPct}%`, top: `${s.topPct}%`, transform: 'translate(-50%, -50%)',
            fontFamily: "'Space Mono', ui-monospace, monospace", fontWeight: 700, lineHeight: 1, fontSize: s.fontSize,
            color: s.muted ? 'hsl(220 12% 46%)' : 'hsl(40 25% 80%)',
          }}>{s.label}</span>
        ))}
      </div>

      {showDiagram && (
        <div style={{
          position: 'absolute', top: 12, right: 14, width: 104, background: 'hsl(224 30% 16% / 0.82)',
          border: '1px solid hsl(262 40% 60% / 0.28)', borderRadius: 12, padding: '8px 7px 6px',
          display: 'flex', flexDirection: 'column', gap: 3, backdropFilter: 'blur(6px)', pointerEvents: 'none',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', lineHeight: 1 }}>
            {geometry.diagram.marks.map((m, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 9, color: 'hsl(220 14% 70%)' }}>{m.sym}</span>
            ))}
          </div>
          <svg viewBox="0 0 130 112" style={{ width: '100%', height: 74 }}>
            <rect x={14} y={4} width={102} height={geometry.diagram.nutHeight} fill="hsl(40 30% 84%)" />
            {geometry.diagram.frets.map((f, i) => (
              <rect key={i} x={14} y={f.y} width={102} height={1.2} fill="hsl(220 14% 55%)" />
            ))}
            {geometry.diagram.strings.map((s, i) => (
              <rect key={i} x={s.x} y={6} width={1.2} height={100} fill="hsl(220 14% 48%)" />
            ))}
            {geometry.diagram.barre && (
              <rect x={geometry.diagram.barre.x} y={geometry.diagram.barre.y} width={geometry.diagram.barre.w} height={13} rx={6.5} fill="hsl(262 83% 66%)" />
            )}
            {geometry.diagram.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={7} fill="hsl(262 83% 66%)" />
            ))}
          </svg>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', lineHeight: 1 }}>
            {geometry.diagram.fingers.map((f, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'hsl(220 14% 70%)' }}>{f.n}</span>
            ))}
          </div>
          <span style={{ textAlign: 'center', fontSize: 9, letterSpacing: '0.06em', color: 'hsl(220 14% 62%)' }}>{geometry.diagram.positionLabel}</span>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 58, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'none' }}>
        <button type="button" onClick={onStrumDown} title="Strum down (↓)" style={roundBtn}>↓</button>
        <button type="button" onClick={onStrumUp} title="Strum up (↑)" style={roundBtn}>↑</button>
        <div style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9, marginLeft: 4 }}>
          <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{chordName}</span>
          <span style={{
            fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: '0.1em', color: 'hsl(262 55% 84%)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{chordNotes}</span>
        </div>
        <span style={{ flex: '0 1 auto', marginLeft: 'auto', textAlign: 'right', fontSize: 11, lineHeight: 1.3, color: 'hsl(220 14% 58%)' }}>
          Drag across the strings to strum · click = single note
        </span>
      </div>

      {showHint && (
        <div style={{
          position: 'absolute', right: 14, bottom: 66, maxWidth: 260, zIndex: 5,
          background: 'hsl(262 83% 52%)', color: '#fff', borderRadius: 12, padding: '11px 30px 11px 13px',
          fontSize: 12.5, lineHeight: 1.45, boxShadow: '0 12px 32px hsl(224 30% 10% / 0.45)',
          animation: 'cs-rise 160ms ease-out',
        }}>
          <button
            type="button" onClick={onDismissHint} title="Got it" aria-label="Dismiss hint"
            style={{
              position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 999,
              border: 'none', background: 'hsl(0 0% 100% / 0.18)', color: '#fff', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            }}
          >×</button>
          <strong>Drag across the strings</strong> to strum, just like a real guitar — click one
          string for a single note, or use the ↓ / ↑ arrow keys on your keyboard.
        </div>
      )}

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{
          fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 108, fontWeight: 700, color: '#fff',
          opacity: countBeat ? 1 : 0, animation: 'cs-pop 420ms ease-out', textShadow: '0 8px 40px hsl(262 83% 40% / 0.85)',
        }}>{countBeat}</span>
      </div>
    </div>
  );
}
