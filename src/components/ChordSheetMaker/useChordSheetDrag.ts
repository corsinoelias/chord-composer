import { useCallback, useRef, useState } from 'react';
import { moveChord, insertChord, removeChord, lineTokens } from '@/lib/chordSheet/chordSheetCore';
import { hitTest, edgeScroll, farFromPaper, type DropHit } from './chordHitTest';

// The sheet's drag & drop — ported from the reference prototype's beginDrag/paletteDragStart
// (raw pointer events, not a DnD library): a chip drag reports its live hit-test result each
// move so the caller can paint a caret guide, and a release either moves/inserts the chord
// (hitTest found a spot) or removes it (released well clear of the paper) or snaps back
// (anything else). One hook, two entry points — an existing chip (beginDrag) and a fresh
// palette chord (beginPaletteDrag) — because both drive the same hitTest/edgeScroll engine
// and the same overlay.

const DRAG_THRESHOLD = 6; // px before a press becomes a drag
const TOUCH_HOLD_MS = 320; // touch must hold before a drag arms, so the sheet can still scroll

export interface DragState {
  /** Line index of the chip being moved, or -1 for a fresh palette chord. */
  src: number;
  /** Chord index within that line, or -1 for a fresh palette chord. */
  ci: number;
  label: string;
  /** True for a palette chord that isn't in the document yet. */
  fresh?: boolean;
  /** Stored (base-key) chord name — only carried for a fresh palette drag. */
  chord?: string;
  x: number;
  y: number;
  hit: DropHit | null;
  off: boolean;
}

interface Options {
  /** Always reads the latest source text — avoids stale closures across a long-lived drag. */
  getText: () => string;
  onChange: (next: string) => void;
  onFlash?: (msg: string) => void;
}

export function useChordSheetDrag({ getText, onChange, onFlash }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selected, setSelected] = useState<{ src: number; ci: number } | null>(null);
  const optsRef = useRef({ getText, onChange, onFlash });
  optsRef.current = { getText, onChange, onFlash };

  /** Start dragging a chord already sitting in the document. */
  const beginDrag = useCallback((e: React.PointerEvent, src: number, ci: number, label: string) => {
    const startX = e.clientX, startY = e.clientY;
    const pointerId = e.pointerId;
    const touch = e.pointerType === 'touch';
    let moved = false;
    let armed = !touch;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    // On touch the sheet must still scroll, so a drag only arms after a hold.
    if (touch) {
      holdTimer = setTimeout(() => {
        armed = true;
        navigator.vibrate?.(14);
        setDrag({ src, ci, label, x: startX, y: startY, hit: null, off: false });
        setSelected(null);
      }, TOUCH_HOLD_MS);
    }

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const far = Math.abs(ev.clientX - startX) >= DRAG_THRESHOLD || Math.abs(ev.clientY - startY) >= DRAG_THRESHOLD;
      if (!armed) { if (far && holdTimer) { clearTimeout(holdTimer); holdTimer = null; } return; }
      if (!moved && !far && !touch) return;
      ev.preventDefault();
      if (!moved) {
        moved = true;
        navigator.vibrate?.(8);
        setDrag({ src, ci, label, x: ev.clientX, y: ev.clientY, hit: null, off: false });
        setSelected(null);
      }
      edgeScroll(ev.clientY);
      const off = farFromPaper(ev.clientX, ev.clientY);
      let hit: DropHit | null = null;
      if (!off) { try { hit = hitTest(ev.clientX, ev.clientY, ci, src); } catch { hit = null; } }
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, hit, off } : d));
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);

      // A tap that never moved: select it (Phase 2 wires the nudge UI to this).
      if (!moved) { setSelected({ src, ci }); return; }
      setDrag(null);

      const { getText: read, onChange: apply, onFlash: flash } = optsRef.current;
      let hit: DropHit | null = null;
      try { hit = hitTest(ev.clientX, ev.clientY, ci, src); } catch { hit = null; }

      // Only a deliberate throw well clear of the page deletes; anything else that misses
      // simply snaps back (the source text is untouched).
      if (!hit) {
        if (farFromPaper(ev.clientX, ev.clientY)) {
          apply(removeChord(read(), src, ci));
          navigator.vibrate?.(20);
          flash?.('Chord removed');
        }
        return;
      }
      navigator.vibrate?.(12);
      if (hit.src === src) {
        apply(moveChord(read(), src, ci, hit.at, hit.after));
      } else {
        const text = read();
        const name = lineTokens(text.split('\n')[src] || '').chords[ci]?.chord ?? '';
        apply(insertChord(removeChord(text, src, ci), hit.src, name, hit.at, hit.after));
      }
      setSelected(null);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  /** Start dragging a fresh chord out of the "IN KEY" palette — it doesn't exist in the
   *  document yet, so a release without a hit is simply a no-op (nothing to delete), and a
   *  tap with no movement falls through to the chip's own onClick (insert at the cursor). */
  const beginPaletteDrag = useCallback((e: React.PointerEvent, chord: string, label: string) => {
    if (e.button != null && e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    const pointerId = e.pointerId;
    let moved = false;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const far = Math.abs(ev.clientX - startX) >= DRAG_THRESHOLD || Math.abs(ev.clientY - startY) >= DRAG_THRESHOLD;
      if (!moved && !far) return;
      ev.preventDefault();
      moved = true;
      edgeScroll(ev.clientY);
      const off = farFromPaper(ev.clientX, ev.clientY);
      let hit: DropHit | null = null;
      if (!off) { try { hit = hitTest(ev.clientX, ev.clientY, -1, -1); } catch { hit = null; } }
      setDrag({ src: -1, ci: -1, label, fresh: true, chord, x: ev.clientX, y: ev.clientY, hit, off });
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return; // a plain click — the button's own onClick inserts at the cursor
      let hit: DropHit | null = null;
      try { hit = hitTest(ev.clientX, ev.clientY, -1, -1); } catch { hit = null; }
      if (!hit) return;
      const { getText: read, onChange: apply } = optsRef.current;
      apply(insertChord(read(), hit.src, chord, hit.at, hit.after));
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  return { drag, selected, setSelected, beginDrag, beginPaletteDrag };
}
