import { memo } from 'react';
import type { GuitarVoicing } from '@/data/guitarChords';
import { useLeftHanded, mirrorVoicing } from '@/lib/leftHanded';

// The song page's chord diagrams, drawn exactly as the V4 prototype draws them: one 64×82 frame
// whatever the instrument (a ukulele's four strings spread over the same width as a guitar's
// six, so both read at one size), the nut as a bar, dots in the chord colour with the finger
// number in white, a barre as a pill, × / ○ above the strings and the fret number on the left
// when the shape sits up the neck. Colours come from the theme (primary), so both themes work.

const CHORD = 'hsl(var(--primary))';
const ON_CHORD = 'hsl(var(--primary-foreground))';
const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

export const FretDiagram = memo(function FretDiagram({ voicing: given, width = 64, className = '' }: {
  voicing: GuitarVoicing;
  width?: number;
  className?: string;
}) {
  const lefty = useLeftHanded();
  const { frets, fingers, barre, baseFret } = lefty ? mirrorVoicing(given) : given;
  const n = frets.length;
  const W = 64, H = 82, x0 = 12, y0 = 18;
  const played = frets.filter(f => f > 0);
  const start = Math.max(1, baseFret || 1);
  const rows = Math.max(4, played.length ? Math.max(...played) - start + 1 : 4);
  const sw = (W - x0 - 8) / (n - 1);
  const fh = (H - y0 - 6) / rows;
  const rowY = (f: number) => y0 + (f - start + 0.5) * fh;
  const inBarre = (i: number, f: number) => !!barre && f === barre.fret && i >= barre.fromString && i <= barre.toString;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W} className={className} aria-hidden="true">
      {start === 1
        ? <rect x={x0 - 0.5} y={y0 - 3} width={sw * (n - 1) + 1} height={3} rx={1} fill="currentColor" />
        : <text x={x0 - 4} y={y0 + fh * 0.65} fontSize={8} textAnchor="end" fill="currentColor" opacity={0.7} fontFamily={FONT}>{start}</text>}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <line key={`r${r}`} x1={x0} x2={x0 + sw * (n - 1)} y1={y0 + r * fh} y2={y0 + r * fh} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <line key={`s${i}`} x1={x0 + i * sw} x2={x0 + i * sw} y1={y0} y2={y0 + rows * fh} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} />
      ))}
      {barre && (
        <rect
          x={x0 + barre.fromString * sw - 4.5}
          y={rowY(barre.fret) - 4.5}
          width={(barre.toString - barre.fromString) * sw + 9}
          height={9}
          rx={4.5}
          fill={CHORD}
        />
      )}
      {frets.map((f, i) => {
        const x = x0 + i * sw;
        // Muted string: an × drawn as two strokes (a text glyph picked up the page's colour).
        if (f < 0) return (
          <path key={i} d={`M${x - 2.4} ${y0 - 11.4}L${x + 2.4} ${y0 - 6.6}M${x + 2.4} ${y0 - 11.4}L${x - 2.4} ${y0 - 6.6}`} stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.1} strokeLinecap="round" />
        );
        if (f === 0) return <circle key={i} cx={x} cy={y0 - 9} r={2.6} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.1} />;
        // Inside a barre only its first string gets a dot (with the "1"); the pill carries the rest.
        if (inBarre(i, f) && barre && i !== barre.fromString) return null;
        const y = rowY(f);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill={CHORD} />
            {fingers[i] > 0 && (
              <text x={x} y={y + 2.8} fontSize={7} fontWeight={700} textAnchor="middle" fill={ON_CHORD} fontFamily={FONT}>{fingers[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

// Pitch classes of the note names getChordNotes returns (sharps or flats).
const PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0,
};

// Two octaves from C, the chord laid out from its root upwards (root first in `notes`).
export const PianoDiagram = memo(function PianoDiagram({ notes, width = 118, className = '' }: {
  notes: string[];
  width?: number;
  className?: string;
}) {
  const W = 140, H = 52, ww = W / 14;
  const pcs = notes.map(nm => PC[nm.replace(/\d+$/, '')]).filter((p): p is number => p !== undefined);
  const root = pcs[0] ?? 0;
  const on = new Set(pcs.map(p => root + ((p - root + 12) % 12)));
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W} className={className} aria-hidden="true">
      {[0, 1].flatMap(o => whites.map((pc, i) => {
        const k = o * 12 + pc;
        return <rect key={`w${k}`} x={(o * 7 + i) * ww + 0.5} y={0.5} width={ww - 1} height={H - 1} rx={2} fill={on.has(k) ? CHORD : 'hsl(var(--card))'} stroke="currentColor" strokeOpacity={0.35} />;
      }))}
      {[0, 1].flatMap(o => blacks.map(([pc, wi]) => {
        const k = o * 12 + pc;
        const lit = on.has(k);
        return <rect key={`b${k}`} x={(o * 7 + wi + 1) * ww - ww * 0.3} y={0.5} width={ww * 0.6} height={H * 0.6} rx={1.5} fill={lit ? CHORD : 'currentColor'} stroke={lit ? 'hsl(var(--card))' : undefined} strokeWidth={lit ? 1 : undefined} />;
      }))}
    </svg>
  );
});
