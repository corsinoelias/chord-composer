import type { DragState } from './useChordSheetDrag';

// Visual feedback for a drag: nothing to read, only to watch. The chip itself is the
// feedback — while there's nowhere to land it trails the pointer, and the moment hitTest
// finds a spot it snaps and locks onto the *exact* character position on the sheet, in the
// same chip styling a placed chord actually has. Watching it lock into place tells you
// where it will land far faster than parsing a label would; a soft highlight over the whole
// destination line adds a second, coarser cue for "which line" at a glance. Muted grey
// (instead of primary) is the only state that still needs reading — it means off the page,
// release here deletes instead of moving.
export function ChordDragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null;
  const hit = drag.hit;
  const snapped = !!hit;

  return (
    <div className="no-print pointer-events-none fixed inset-0 z-[65]">
      {hit && (
        <span
          className="fixed rounded-md bg-primary/10 ring-1 ring-primary/25 transition-[left,top,width,height] duration-100 ease-out"
          style={{ left: hit.lineRect.left, top: hit.lineRect.top, width: hit.lineRect.width, height: hit.lineRect.height }}
        />
      )}
      <span
        className={`fixed whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[13px] font-bold shadow-lg transition-[left,top,transform] duration-100 ease-out ${
          snapped
            ? 'scale-105 border-primary/40 bg-primary text-primary-foreground'
            : 'border-muted-foreground/30 bg-muted-foreground text-white'
        }`}
        style={{
          left: hit ? hit.rect.left : drag.x,
          top: hit ? hit.rect.top : drag.y,
          // A lyric line's `rect` is the text baseline a real chip floats *above* — shift
          // the ghost up to match. A chord-only line's `rect` already *is* the in-flow
          // chip's own box, so the ghost sits right on it, at the same height as its
          // neighbors — shifting it up there would float it above the row it's landing on.
          transform: !hit ? 'translate(-50%, -140%)' : hit.floating ? 'translate(0, -100%)' : 'translate(0, 0)',
        }}
      >
        {drag.label}
      </span>
    </div>
  );
}
