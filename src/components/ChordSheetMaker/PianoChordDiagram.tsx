import { memo } from 'react';
import { pianoKeys } from '@/lib/chordSheet/chordSheetCore';

interface Props {
  chordName: string;
  className?: string;
}

const WHITE_W = 18;
const H = 60;
const BLACK_W = 11;
const BLACK_H = 36;

/** A compact one-octave key strip with the chord's tones highlighted — the piano
 *  equivalent of GuitarChordDiagram for chart cards. No existing component in the repo
 *  renders a plain (non-interactive) highlighted chord shape, so this is new but tiny. */
export const PianoChordDiagram = memo(function PianoChordDiagram({ chordName, className = '' }: Props) {
  const keys = pianoKeys(chordName);
  const width = WHITE_W * keys.white.length;

  return (
    <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} className={className} role="img" aria-label={`${chordName} on piano`}>
      {keys.white.map((k, i) => (
        <rect
          key={k.id}
          x={i * WHITE_W}
          y={0}
          width={WHITE_W - 1}
          height={H}
          rx={2}
          fill={k.on ? (k.root ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.35)') : 'hsl(var(--card))'}
          stroke="hsl(var(--border))"
        />
      ))}
      {keys.black.map((k) => (
        <rect
          key={k.id}
          x={(k.left / 100) * width - BLACK_W / 2}
          y={0}
          width={BLACK_W}
          height={BLACK_H}
          rx={1.5}
          fill={k.on ? (k.root ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.6)') : 'hsl(var(--foreground))'}
        />
      ))}
    </svg>
  );
});
