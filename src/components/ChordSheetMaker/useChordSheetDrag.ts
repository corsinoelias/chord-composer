import { useCallback, useRef, useState } from 'react';
import {
  moveChord, insertChord, removeChord, lineTokens, moveChordToIndex, insertChordAtIndex, fullOffsetToPlainOffset,
} from '@/lib/chordSheet/chordSheetCore';
import { hitTestAny, edgeScroll, farFromDropTargets, type DropHit } from './chordHitTest';

// The sheet's drag & drop — ported from the reference prototype's beginDrag/paletteDragStart
// (raw pointer events, not a DnD library): a chip drag reports its live hit-test result each
// move so the caller can paint a caret guide, and a release either moves/inserts the chord
// (hitTest found a spot) or removes it (released well clear of the paper) or snaps back
// (anything else). One hook, two entry points — an existing chip (beginDrag) and a fresh
// palette chord (beginPaletteDrag) — because both drive the same hitTest/edgeScroll engine
// and the same overlay. hitTestAny (chordHitTest.ts) covers two drop surfaces, the sheet
// preview and the ChordPro source editor, so every path below already works for both — the
// only surface-specific bit is plainAt, since a source-editor hit's `at` is in a different
// coordinate space (full text, brackets counted) than moveChord/insertChord expect.

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

/** `hit.at` from a source-editor hit is a full-text offset (brackets counted); everywhere
 *  else in this file expects moveChord/insertChord's plain-lyrics offset. A sheet hit is
 *  already in that space and passes through unchanged. */
function plainAt(hit: DropHit, text: string): number {
  if (hit.zone !== 'source') return hit.at;
  return fullOffsetToPlainOffset(text.split('\n')[hit.src] ?? '', hit.at);
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

    // hitTest (walks every character of a line with the Range API) and the setDrag
    // re-render it triggers only need to happen once per painted frame, not once per
    // pointermove — a high-polling-rate mouse or a touch surface can fire that well past
    // 60Hz. `move` just records the latest event; a single rAF per frame does the real work.
    let rafId = 0;
    let pending: PointerEvent | null = null;
    const flush = () => {
      rafId = 0;
      const ev = pending;
      if (!ev) return;
      edgeScroll(ev.clientX, ev.clientY);
      const off = farFromDropTargets(ev.clientX, ev.clientY);
      let hit: DropHit | null = null;
      if (!off) { try { hit = hitTestAny(ev.clientX, ev.clientY, ci, src); } catch { hit = null; } }
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, hit, off } : d));
    };

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
      pending = ev;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (holdTimer) clearTimeout(holdTimer);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);

      // A tap that never moved: select it (Phase 2 wires the nudge UI to this).
      if (!moved) { setSelected({ src, ci }); return; }
      setDrag(null);

      const { getText: read, onChange: apply, onFlash: flash } = optsRef.current;
      let hit: DropHit | null = null;
      try { hit = hitTestAny(ev.clientX, ev.clientY, ci, src); } catch { hit = null; }

      // Only a deliberate throw well clear of every drop surface deletes; anything else that
      // misses simply snaps back (the source text is untouched).
      if (!hit) {
        if (farFromDropTargets(ev.clientX, ev.clientY)) {
          apply(removeChord(read(), src, ci));
          navigator.vibrate?.(20);
          flash?.('Chord removed');
        }
        return;
      }
      navigator.vibrate?.(12);
      // `src` (this drag's origin line) and `hit.src` are always the same document-line-index
      // space regardless of which surface either one came from (sheet row order and the
      // editor's one-<div>-per-line order both mirror text.split('\n') directly), so this
      // comparison — and moveChord/insertChord below it — need no surface-specific branch.
      if (hit.src === src) {
        if (hit.chordIndex != null) {
          // chordIndex was computed against the row's *current* chords (the dragged one
          // still counted) — once it's spliced out, everything after its old slot shifts
          // down by one, so the target index needs the same adjustment.
          const target = hit.chordIndex > ci ? hit.chordIndex - 1 : hit.chordIndex;
          apply(moveChordToIndex(read(), src, ci, target));
        } else {
          apply(moveChord(read(), src, ci, plainAt(hit, read()), hit.after));
        }
      } else {
        const text = read();
        const name = lineTokens(text.split('\n')[src] || '').chords[ci]?.chord ?? '';
        const removed = removeChord(text, src, ci);
        if (hit.chordIndex != null) {
          apply(insertChordAtIndex(removed, hit.src, name, hit.chordIndex));
        } else {
          apply(insertChord(removed, hit.src, name, plainAt(hit, text), hit.after));
        }
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

    // Same per-frame throttle as beginDrag above.
    let rafId = 0;
    let pending: PointerEvent | null = null;
    const flush = () => {
      rafId = 0;
      const ev = pending;
      if (!ev) return;
      edgeScroll(ev.clientX, ev.clientY);
      const off = farFromDropTargets(ev.clientX, ev.clientY);
      let hit: DropHit | null = null;
      if (!off) { try { hit = hitTestAny(ev.clientX, ev.clientY, -1, -1); } catch { hit = null; } }
      setDrag({ src: -1, ci: -1, label, fresh: true, chord, x: ev.clientX, y: ev.clientY, hit, off });
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const far = Math.abs(ev.clientX - startX) >= DRAG_THRESHOLD || Math.abs(ev.clientY - startY) >= DRAG_THRESHOLD;
      if (!moved && !far) return;
      ev.preventDefault();
      moved = true;
      pending = ev;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return; // a plain click — the button's own onClick inserts at the cursor
      let hit: DropHit | null = null;
      try { hit = hitTestAny(ev.clientX, ev.clientY, -1, -1); } catch { hit = null; }
      if (!hit) return;
      const { getText: read, onChange: apply } = optsRef.current;
      if (hit.chordIndex != null) {
        apply(insertChordAtIndex(read(), hit.src, chord, hit.chordIndex));
      } else {
        apply(insertChord(read(), hit.src, chord, plainAt(hit, read()), hit.after));
      }
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  return { drag, selected, setSelected, beginDrag, beginPaletteDrag };
}
