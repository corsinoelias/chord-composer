import type { DragState } from './useChordSheetDrag';

// The only visual feedback a drag gets: a floating label that follows the pointer, and a
// thin caret bar that snaps to the exact character hitTest resolved. No per-word highlight —
// character precision makes one obvious impossible to misread. The label goes muted grey
// whenever there's no hit (over dead space, or off the paper entirely) as the only cue that
// releasing here won't land the chord — off the paper, it deletes it instead.
export function ChordDragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null;
  const hit = drag.hit;
  return (
    <div className="no-print pointer-events-none fixed inset-0 z-[65]">
      {hit && (
        <span
          className="fixed rounded-sm bg-primary"
          style={{
            left: hit.rect.left, top: hit.rect.top,
            width: 2, height: Math.max(18, hit.rect.height),
            boxShadow: '0 0 0 3px hsl(var(--primary) / 0.18)',
          }}
        />
      )}
      <span
        className={`fixed whitespace-nowrap rounded-lg px-2.5 py-1 font-mono text-[13px] font-bold text-white shadow-lg ${hit ? 'bg-primary' : 'bg-muted-foreground'}`}
        style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -140%)' }}
      >
        {drag.label}
      </span>
    </div>
  );
}
