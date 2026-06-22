import { type NotePosition } from '@/hooks/useScalePlayback';

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

const C = {
  bar:    'hsl(220 10% 38%)',
  label:  'hsl(220 10% 50%)',
  dash:   'hsl(220 10% 16%)',
  future: 'hsl(220 10% 72%)',
  done:   'hsl(220 10% 30%)',
  active: '#fbbf24',
  root:   '#60a5fa',
};

interface ScaleTabProps {
  path: NotePosition[];
  currentIndex: number;
  isPlaying: boolean;
  bpm: number;
}

export function ScaleTab({ path, currentIndex, isPlaying, bpm }: ScaleTabProps) {
  if (!path.length) return null;

  // Standard guitar tab: each column = fret digits + 1 separator dash
  // e.g. fret 3  → "3-"  (2 chars), fret 12 → "12-" (3 chars)
  const colWidths = path.map(p => String(p.fret).length + 1);

  return (
    <div style={{
      background: '#07050a',
      borderRadius: 10,
      padding: '14px 16px',
      overflowX: 'auto',
      border: '1px solid hsl(224 15% 14%)',
    }}>
      {/* Tempo header */}
      <div style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        color: 'hsl(220 10% 48%)',
        marginBottom: 10,
        letterSpacing: '0.04em',
        userSelect: 'none',
      }}>
        ♩ = {bpm} bpm
      </div>

      <div style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 14,
        lineHeight: '24px',
        whiteSpace: 'pre',
        minWidth: 'max-content',
      }}>
        {STRING_LABELS.map((label, si) => (
          <div key={si} style={{ display: 'flex', alignItems: 'center' }}>
            {/* String label */}
            <span style={{ color: C.label, width: 14, textAlign: 'right', marginRight: 4, flexShrink: 0 }}>
              {label}
            </span>
            {/* Opening bar */}
            <span style={{ color: C.bar, flexShrink: 0 }}>|</span>

            {path.map((pos, i) => {
              const fretStr = String(pos.fret);
              const w       = colWidths[i];
              const isOnThisString = pos.stringIndex === si;
              const isActive = isPlaying && i === currentIndex;
              const isDone   = isPlaying && i < currentIndex;

              if (!isOnThisString) {
                return (
                  <span key={i} style={{ color: C.dash }}>
                    {'-'.repeat(w)}
                  </span>
                );
              }

              const noteColor = isActive ? C.active
                              : isDone   ? C.done
                              : i === 0  ? C.root
                              : C.future;

              return (
                <span key={i}>
                  <span style={{
                    color: noteColor,
                    fontWeight: isActive ? 700 : i === 0 ? 600 : 400,
                    transition: 'color 0.07s',
                  }}>
                    {fretStr}
                  </span>
                  {/* trailing separator dash(es) to fill column width */}
                  <span style={{ color: C.dash }}>
                    {'-'.repeat(w - fretStr.length)}
                  </span>
                </span>
              );
            })}

            {/* Closing bar */}
            <span style={{ color: C.bar }}>|</span>
          </div>
        ))}
      </div>
    </div>
  );
}
