import type { GuitarVoicing } from '@/data/guitarChords';
import { STRING_LABELS } from './strumTheory';

export interface FretDot {
  cx: number; cy: number; r: number; label: string;
  leftPct: number; topPct: number; fontSize: number;
}
export interface StringLine {
  d: string; strokeWidth: number; label: string; muted: boolean;
  leftPct: number; topPct: number; fontSize: number;
}
export interface FretboardGeometry {
  width: number; height: number; viewBox: string;
  ys: number[]; x0: number; x1: number; gap: number;
  board: { x: number; y: number; w: number; h: number };
  nut: { x: number; y: number; w: number; h: number };
  fretLines: { x: number; y: number; w: number; h: number }[];
  inlays: { x: number; y: number; r: number }[];
  dots: FretDot[];
  strings: StringLine[];
  diagram: {
    dots: { x: number; y: number }[];
    marks: { x: number; sym: string }[];
    fingers: { x: number; n: string }[];
    barre: { x: number; y: number; w: number } | null;
    frets: { y: number }[];
    strings: { x: number }[];
    nutHeight: number;
    positionLabel: string;
  };
}

/** String thickness (px, before scaling), low E -> high e — matches STRING_MIDI order. */
const STRING_WEIGHT = [5, 4.3, 3.6, 2.9, 2.3, 1.8];

/** Pure layout computation for the fretboard SVG + inset chord-diagram badge, driven by
 * the fretboard panel's measured container size. Kept framework-free so it's cheap to
 * recompute in a useMemo without re-deriving JSX. */
export function computeFretboardGeometry(voicing: GuitarVoicing, containerW: number, containerH: number): FretboardGeometry {
  const W = Math.max(360, containerW || 1000);
  const H = Math.max(180, containerH || 300);
  const gutter = 30;
  const nutW = Math.max(5, Math.round(W * 0.006));
  const footerH = 58;
  const usable = Math.max(112, H - footerH);
  const gap = Math.max(20, Math.min(40, (usable - 32) / 5));
  const padY = Math.max(6, (usable - gap * 5) / 2);
  const x0 = gutter + nutW;
  const slotW = (W - x0 - 4) / 5;
  // Row 0 (top) is the thinnest/highest-pitch string (high e), row 5 (bottom) is the
  // thickest/lowest-pitch string (low E) — matches standard tab reading order and this
  // site's own bass-tab convention. GuitarVoicing.frets itself stays low-E-first
  // (index 0); only the on-screen row each data index lands in is flipped here, via
  // `5 - i`, so nothing downstream (dots, string refs, vibration) needs to know about it.
  const ys = [0, 1, 2, 3, 4, 5].map(i => +(padY + (5 - i) * gap).toFixed(1));
  const dotR = Math.min(gap * 0.4, slotW * 0.3, 21);
  const sScale = Math.min(1.4, Math.max(0.7, gap / 44));
  const x1 = W - 2;

  const dots: FretDot[] = [];
  for (let i = 0; i < 6; i++) {
    const fret = voicing.frets[i];
    if (fret <= 0) continue;
    const row = fret - voicing.baseFret;
    if (row < 0 || row >= 5) continue;
    const cx = +(x0 + (row + 0.5) * slotW).toFixed(1);
    dots.push({
      cx, cy: ys[i], r: +dotR.toFixed(1), label: String(fret),
      leftPct: (cx / W) * 100, topPct: (ys[i] / H) * 100, fontSize: Math.round(dotR * 0.88),
    });
  }

  const strings: StringLine[] = [0, 1, 2, 3, 4, 5].map(i => ({
    d: `M${x0} ${ys[i]} L${x1} ${ys[i]}`,
    strokeWidth: +(STRING_WEIGHT[i] * sScale).toFixed(2),
    label: voicing.frets[i] < 0 ? '✕' : STRING_LABELS[i],
    muted: voicing.frets[i] < 0,
    leftPct: (gutter / 2 / W) * 100,
    topPct: (ys[i] / H) * 100,
    fontSize: Math.max(11, Math.round(Math.min(14, gap * 0.34))),
  }));

  const dgDots: { x: number; y: number }[] = [];
  const dgMarks: { x: number; sym: string }[] = [];
  const dgFingers: { x: number; n: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 20.4;
    const fret = voicing.frets[i];
    dgMarks.push({ x, sym: fret < 0 ? '✕' : fret === 0 ? '○' : '' });
    if (fret > 0) {
      const row = fret - voicing.baseFret;
      if (row >= 0 && row < 4) dgDots.push({ x, y: 6 + (row + 0.5) * 25 });
    }
    dgFingers.push({ x, n: voicing.fingers?.[i] ? String(voicing.fingers[i]) : '' });
  }
  let dgBarre: { x: number; y: number; w: number } | null = null;
  if (voicing.barre) {
    const row = voicing.barre.fret - voicing.baseFret;
    if (row >= 0 && row < 4) {
      const xa = 14 + voicing.barre.fromString * 20.4;
      const xb = 14 + voicing.barre.toString * 20.4;
      dgBarre = { x: xa - 6, y: 6 + (row + 0.5) * 25 - 6.5, w: xb - xa + 12 };
    }
  }

  return {
    width: W, height: H, viewBox: `0 0 ${W} ${H}`,
    ys, x0, x1, gap,
    board: { x: x0, y: +(padY - gap * 0.5).toFixed(1), w: W - x0 - 2, h: +(gap * 6).toFixed(1) },
    nut: { x: gutter, y: +(padY - gap * 0.58).toFixed(1), w: nutW, h: +(gap * 6.16).toFixed(1) },
    fretLines: [1, 2, 3, 4].map(k => ({
      x: +(x0 + k * slotW).toFixed(1), y: +(padY - gap * 0.5).toFixed(1),
      w: Math.max(2, Math.round(W * 0.003)), h: +(gap * 6).toFixed(1),
    })),
    inlays: [2.5, 4.5].map(k => ({
      x: +(x0 + k * slotW).toFixed(1), y: +(padY + gap * 2.5).toFixed(1), r: Math.max(5, Math.round(gap * 0.15)),
    })),
    dots, strings,
    diagram: {
      dots: dgDots, marks: dgMarks, fingers: dgFingers, barre: dgBarre,
      frets: [1, 2, 3, 4].map(k => ({ y: 6 + k * 25 })),
      strings: [0, 1, 2, 3, 4, 5].map(i => ({ x: 14 + i * 20.4 })),
      nutHeight: voicing.baseFret === 1 ? 4 : 1.2,
      positionLabel: voicing.baseFret > 1 ? `fret ${voicing.baseFret}` : '',
    },
  };
}
