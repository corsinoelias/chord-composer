// Pointer-to-position mapping for the sheet's drag & drop — ported near-verbatim from the
// reference "Chord Sheet Maker" prototype. Maps a viewport point to *which line, which
// character, and which side* of any chords already sitting on that character — the side is
// what makes two chords at the same offset reorderable at all.
//
// Reads plain DOM (data-csm-* attributes set by InteractiveSheet), not React state, because
// it needs real layout — text measured with Range.getBoundingClientRect(), not anything a
// virtual DOM diff could give us.
//
// hitTestSource (below) is the same idea for the ChordPro source editor — a second, much
// simpler surface a drag can land on, since the editor's contenteditable DOM already IS a
// live caret target the browser knows how to hit-test natively (caretRangeFromPoint). Both
// surfaces feed into hitTestAny, which useChordSheetDrag.ts calls unconditionally so a drag
// started from either one (palette, a sheet chip, an editor chip) can land on either.

import { resolvePosition } from './chordProEditorDom';

// Base catch thresholds, calibrated at the page's true 96dpi size (PaginatedPaper's
// `.csm-paper` at scale 1 — see pageScaleOf). The preview auto-fit-scales the whole page
// down to fit the pane (useFitScale), and `getBoundingClientRect()` reports post-transform
// (visual) coordinates — so a fixed pixel threshold shrinks the same way the text does, and
// on a narrow pane a couple of scaled-down text lines can fit inside what used to be a
// single line's catch zone. Every threshold below is this base value times pageScaleOf, so
// the catch area always covers the same *fraction* of a line, at any pane width.
const SNAP_PX = 7; // magnet radius to a word boundary
const CHORD_HEADROOM_PX = 24; // fallback catch area above a row with no chip yet to measure

export interface DropHit {
  src: number;
  at: number;
  after: boolean;
  rect: { left: number; top: number; height: number };
  snapped?: boolean;
  /** The destination visual line's own box (not the whole row it belongs to, which can
   *  span several wrapped visual lines) — for painting a soft highlight over the entire
   *  line a chord will land on, and for snapping the drag ghost chip onto it (see
   *  ChordDragGhost.tsx): the chip itself, locked onto the exact spot, is the feedback —
   *  nothing here needs reading. */
  lineRect: { left: number; top: number; width: number; height: number };
  /** True when `rect` is a lyric-baseline position a real chord chip would float *above*
   *  (`-top-[1.15em]`, see Slot in InteractiveSheet.tsx) — false on a chord-only line, where
   *  `rect` already *is* the in-flow chip's own box. The ghost needs to know which, or it
   *  renders floating above a row where real chips sit inline, landing nowhere near where
   *  the chord will actually appear. */
  floating: boolean;
  /** Set only on a chord-only line: the array index (among that line's *current* chords,
   *  dragged one still included) the moved/inserted chord should land at. `at`/`after`
   *  can't express this reliably there — adjacent brackets often share one character
   *  position with nothing between them — so useChordSheetDrag routes a hit with this set
   *  through moveChordToIndex/insertChordAtIndex instead of moveChord/insertChord. */
  chordIndex?: number;
  /** Set only for a hit on the ChordPro source editor (see hitTestSource) — `at` there is a
   *  *full-text* offset (bracket markup counted, matching chordProEditorDom's CaretPos), not
   *  the plain-lyrics offset moveChord/insertChord expect. Callers must convert it via
   *  chordSheetCore's fullOffsetToPlainOffset before using it; an unset zone (a plain sheet
   *  hit) is already in plain-offset space and needs no conversion. */
  zone?: 'source';
}

function rectOf(r: { left: number; top: number; height: number }) {
  return { left: r.left, top: r.top, height: r.height };
}

function realChips(row: Element): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('[data-csm-chip]')).filter(
    (el) => el.dataset.csmChip !== '' && el.dataset.csmAt !== '',
  );
}

function chipsAt(row: Element, at: number, rowSrc: number, dragSrc: number, dragCi: number): HTMLElement[] {
  return realChips(row).filter(
    (el) => Number(el.dataset.csmAt) === at && !(rowSrc === dragSrc && Number(el.dataset.csmCi) === dragCi),
  );
}

/** How much smaller the page is rendering than its true 96dpi size — 1 on a roomy screen
 *  (PaginatedPaper never magnifies past 100%), less than 1 once useFitScale shrinks it to
 *  fit a narrow pane. `.csm-paper`'s inline `width` is always the real, unscaled px value
 *  (PaginatedPaper sets it from PAGE_PX), so comparing that to the rendered bounding box
 *  gives the live scale directly — no need to reach into React state from this DOM-only
 *  module. */
function pageScaleOf(el: Element): number {
  const paper = el.closest<HTMLElement>('.csm-paper');
  if (!paper) return 1;
  const real = parseFloat(paper.style.width || '');
  if (!real) return 1;
  const rendered = paper.getBoundingClientRect().width;
  return rendered / real;
}

/** `dragCi`/`dragSrc` identify the chip currently being dragged (so it excludes itself when
 *  deciding which side of a rival chord to land on) — pass -1/-1 for a fresh palette chord
 *  that isn't in the document yet. */
export function hitTest(clientX: number, clientY: number, dragCi: number, dragSrc: number): DropHit | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-csm-line]'));
  if (!rows.length) return null;

  // Only bail out once the pointer is genuinely off every page (farFromPaper's own 48px
  // margin) — everywhere else, always resolve to the *nearest* line, however far. Rejecting
  // by a fixed distance from any one row used to lose the drag in ordinary empty space
  // still on the page (a wide gap between sections, a run of blank lines): the caret would
  // vanish mid-drag, and a release there silently did nothing instead of landing the chord.
  if (farFromPaper(clientX, clientY)) return null;

  const scale = pageScaleOf(rows[0]);
  const chordHeadroom = CHORD_HEADROOM_PX * scale;
  const snapPx = SNAP_PX * scale;
  const lineSlop = 2 * scale;

  // Row selection has to weigh X as well as Y: in a 2-column layout, a row in the *other*
  // column commonly sits at the exact same Y band (CSS columns start both columns at the
  // same top and fill independently) — a Y-only distance treats that tie as a match and,
  // since DOM order is column-1-first, column 1 always won. Being outside a row
  // horizontally (dx > 0, i.e. in the wrong column or the gutter between them) has to
  // dominate a merely-close vertical distance, so it's weighted far more heavily.
  let row: HTMLElement | null = null;
  let bestScore = Infinity;
  rows.forEach((r) => {
    const bb = r.getBoundingClientRect();
    if (!bb.height || !bb.width) return;
    // A row's catch area includes the chord strip drawn above its lyrics — measured for
    // real from any chip already floating there, not guessed. A row with no chip yet still
    // needs headroom for a *new* one to land, so it falls back to a fixed (scaled) estimate.
    const chipEls = realChips(r);
    let top = bb.top;
    if (chipEls.length) {
      chipEls.forEach((el) => { const cb = el.getBoundingClientRect(); if (cb.top < top) top = cb.top; });
    } else {
      top -= chordHeadroom;
    }
    const dy = clientY < top ? top - clientY : clientY > bb.bottom ? clientY - bb.bottom : 0;
    const dx = clientX < bb.left ? bb.left - clientX : clientX > bb.right ? clientX - bb.right : 0;
    const score = dx * 6 + dy;
    if (score < bestScore) { bestScore = score; row = r; }
  });
  if (!row) return null;
  const foundRow: HTMLElement = row;
  const rowBb = foundRow.getBoundingClientRect();

  const src = Number(foundRow.dataset.csmLine);

  // Chord-only (instrumental) line: there is no lyric to measure against, so the chips
  // themselves are the drop targets.
  const spans = Array.from(foundRow.querySelectorAll<HTMLElement>('[data-csm-anchor]'));
  if (!spans.length) {
    // The chip being dragged is still in the DOM at its original spot (only dimmed, not
    // removed — see InteractiveSheet's `isDragged` opacity) and has to be excluded here,
    // exactly like chipsAt() already excludes it for the lyric branch below: otherwise a
    // small drag toward a neighboring chord frequently still resolves "nearest" back to the
    // dragged chip's own untouched position, which both makes the ghost look stuck (no
    // visible feedback as you drag) and silently turns the drop into a no-op.
    const chips = realChips(foundRow).filter((el) => !(src === dragSrc && Number(el.dataset.csmCi) === dragCi));
    if (!chips.length) {
      return { src, at: 0, after: false, rect: rectOf(rowBb), lineRect: rowBb, floating: false, chordIndex: 0 };
    }
    // Same wrap-awareness as the lyric branch below: a chord-only line's chips can also
    // wrap into several visual rows (gap-y-1), so pick the nearest one by Y first and only
    // compare X among chips on *that* row.
    let chipLineD = Infinity;
    chips.forEach((el) => {
      const bb = el.getBoundingClientRect();
      const mid = bb.top + bb.height / 2;
      const d = Math.abs(mid - clientY);
      if (d < chipLineD) chipLineD = d;
    });
    const lineChips = chips.filter((el) => {
      const bb = el.getBoundingClientRect();
      return Math.abs((bb.top + bb.height / 2) - clientY) <= chipLineD + lineSlop;
    });
    let best = lineChips[0], bd = Infinity, after = false;
    lineChips.forEach((el) => {
      const bb = el.getBoundingClientRect();
      const mid = bb.left + bb.width / 2;
      const d = Math.abs(mid - clientX);
      if (d < bd) { bd = d; best = el; after = clientX > mid; }
    });
    const bb = best.getBoundingClientRect();
    const bandTop = Math.min(...lineChips.map((el) => el.getBoundingClientRect().top));
    const bandBottom = Math.max(...lineChips.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height; }));
    const targetCi = Number(best.dataset.csmCi);
    return {
      src, at: Number(best.dataset.csmAt), after,
      rect: { left: after ? bb.right : bb.left, top: bb.top, height: bb.height },
      lineRect: { left: rowBb.left, top: bandTop, width: rowBb.width, height: bandBottom - bandTop },
      floating: false,
      chordIndex: after ? targetCi + 1 : targetCi,
    };
  }

  // Every character boundary in the row, measured for real.
  const points: { at: number; x: number; rect: { left: number; top: number; height: number }; boundary: boolean }[] = [];
  spans.forEach((span) => {
    const start = Number((span.getAttribute('data-csm-anchor') || '0:0').split(':')[1]);
    const text = span.textContent || '';
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    const tn = walker.nextNode();
    const box = span.getBoundingClientRect();
    if (!tn || !tn.textContent?.length || !text.length) {
      points.push({ at: start, x: box.left, rect: rectOf(box), boundary: true });
      return;
    }
    const r = document.createRange();
    const len = tn.textContent.length;
    for (let i = 0; i <= len; i++) {
      let cr: DOMRect;
      try { r.setStart(tn, i); r.setEnd(tn, i); cr = r.getBoundingClientRect(); }
      catch { continue; }
      const wordStart = i === 0 || i === len || (/\s/.test(text[i - 1]) && !/\s/.test(text[i]));
      points.push({ at: start + i, x: cr.left || box.left, rect: cr.height ? rectOf(cr) : rectOf(box), boundary: wordStart });
    }
  });
  if (!points.length) return null;

  // A row wraps into several visual lines in a narrow column — its own points then span
  // multiple Y bands, and matching by X alone (ignoring Y) can pick a character on the
  // wrong visual line entirely (whichever one happens to have a character near this X).
  // Find the closest visual line by Y first, then only compare X among *its* points.
  let lineD = Infinity;
  points.forEach((p) => {
    const mid = p.rect.top + p.rect.height / 2;
    const d = Math.abs(mid - clientY);
    if (d < lineD) lineD = d;
  });
  const linePoints = points.filter((p) => Math.abs((p.rect.top + p.rect.height / 2) - clientY) <= lineD + lineSlop);

  let best = linePoints[0], bestD = Math.abs(linePoints[0].x - clientX);
  linePoints.forEach((p) => { const d = Math.abs(p.x - clientX); if (d < bestD) { bestD = d; best = p; } });

  // Magnet to a word start, so chords land where a musician expects.
  let snapped: typeof points[number] | null = null, snapD = Infinity;
  linePoints.forEach((p) => {
    if (!p.boundary) return;
    const d = Math.abs(p.x - clientX);
    if (d < snapD) { snapD = d; snapped = p; }
  });
  const pick = (snapped && snapD <= snapPx) ? snapped : best;

  // Which side of the chords already parked on this character?
  const rivals = chipsAt(foundRow, pick.at, src, dragSrc, dragCi);
  let after: boolean;
  if (rivals.length) {
    const rb = rivals[rivals.length - 1].getBoundingClientRect();
    after = clientX > rb.left + rb.width / 2;
  } else {
    after = clientX > pick.x;
  }

  const bandTop = Math.min(...linePoints.map((p) => p.rect.top)) - chordHeadroom * 0.5;
  const bandBottom = Math.max(...linePoints.map((p) => p.rect.top + p.rect.height));
  return {
    src, at: pick.at, after, rect: pick.rect, snapped: pick === snapped,
    lineRect: { left: rowBb.left, top: bandTop, width: rowBb.width, height: bandBottom - bandTop },
    floating: true,
  };
}

/** Keep whichever pane the pointer is over scrolling when the drag reaches its edges — the
 *  sheet preview, or (given an x too, since the source editor sits in its own column) the
 *  ChordPro source editor. */
export function edgeScroll(clientX: number, clientY: number): void {
  const sheetPane = document.querySelector<HTMLElement>('.csm-sheet-pane');
  const sourcePane = document.querySelector<HTMLElement>('[data-csm-source]');
  const pane = [sheetPane, sourcePane].find((el) => {
    if (!el) return false;
    const bb = el.getBoundingClientRect();
    return bb.width > 0 && clientX >= bb.left && clientX <= bb.right;
  });
  if (!pane) return;
  const bb = pane.getBoundingClientRect();
  const zone = 60;
  if (clientY < bb.top + zone) pane.scrollTop -= Math.max(4, (bb.top + zone - clientY) / 4);
  else if (clientY > bb.bottom - zone) pane.scrollTop += Math.max(4, (clientY - (bb.bottom - zone)) / 4);
}

/** Generous margin: the sheet's own lines can sit flush with (or a hair past) the paper
 *  edge, so a strict bounds test turns a near-miss into an accidental delete. The Canva-
 *  style preview renders one `.csm-paper` per page, so "far from paper" means far from
 *  *every* page, not just the first one found. */
export function farFromPaper(x: number, y: number): boolean {
  const papers = Array.from(document.querySelectorAll<HTMLElement>('.csm-paper'));
  if (!papers.length) return false;
  const m = 48;
  return papers.every((paper) => {
    const bb = paper.getBoundingClientRect();
    return x < bb.left - m || x > bb.right + m || y < bb.top - m || y > bb.bottom + m;
  });
}

/** Same generous margin, for the ChordPro source editor — see farFromPaper. `[data-csm-source]`
 *  can match more than one element at once (the desktop pane stays mounted, just CSS-hidden,
 *  while MobileChrome's full-screen source editor is also open) — a hidden one reports a
 *  zero-size rect, which can never contain a real pointer position, so it's excluded rather
 *  than special-cased. */
function farFromSource(x: number, y: number): boolean {
  const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-csm-source]')).filter((el) => {
    const bb = el.getBoundingClientRect();
    return bb.width > 0 && bb.height > 0;
  });
  if (!editors.length) return true;
  const m = 48;
  return editors.every((el) => {
    const bb = el.getBoundingClientRect();
    return x < bb.left - m || x > bb.right + m || y < bb.top - m || y > bb.bottom + m;
  });
}

/** True once a drag is clear of *every* drop surface — the sheet preview and the source
 *  editor alike — the signal useChordSheetDrag uses to delete on release instead of snapping
 *  back. */
export function farFromDropTargets(x: number, y: number): boolean {
  return farFromPaper(x, y) && farFromSource(x, y);
}

/** Maps a viewport point to a position inside the ChordPro source editor, if it's there —
 *  unlike the sheet's hitTest, this doesn't need to measure text by hand: the browser's own
 *  caretRangeFromPoint (Firefox: caretPositionFromPoint) already resolves a point to a live
 *  caret position in a contenteditable field, and chordProEditorDom's resolvePosition turns
 *  that into a {line, offset}. `at` on the returned hit is in *full-text* offset terms (a
 *  chip counts as `[Name]`.length) — see DropHit.zone's doc comment for why callers need to
 *  convert it before handing it to moveChord/insertChord. Always resolves to `after: true`
 *  (insert after anything already at that exact offset) rather than the sheet's word-boundary
 *  snap + rival-chord-side logic — a reasonable default for plain text, refinable with the
 *  nudge control already in the toolbar for the rare exact-tie case. */
export function hitTestSource(clientX: number, clientY: number): DropHit | null {
  const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-csm-source]'));
  const el = editors.find((e) => {
    const bb = e.getBoundingClientRect();
    return bb.width > 0 && bb.height > 0 && clientX >= bb.left && clientX <= bb.right && clientY >= bb.top && clientY <= bb.bottom;
  });
  if (!el) return null;

  const doc = el.ownerDocument;
  const caretFromPoint = (doc as { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint;
  const caretPosFromPoint = (doc as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint;
  let range: Range | null = null;
  if (caretFromPoint) {
    range = caretFromPoint.call(doc, clientX, clientY);
  } else if (caretPosFromPoint) {
    const p = caretPosFromPoint.call(doc, clientX, clientY);
    if (p) { range = doc.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true); }
  }
  if (!range || !el.contains(range.startContainer)) return null;

  const pos = resolvePosition(el, range.startContainer, range.startOffset);
  if (!pos) return null;
  const lineEl = (Array.from(el.children) as HTMLElement[])[pos.line];
  if (!lineEl) return null;

  const caretRect = range.getBoundingClientRect();
  const lineBb = lineEl.getBoundingClientRect();
  // A collapsed range right at a line's start/end (or on an empty line) sometimes reports a
  // zero-size rect — fall back to the line's own box so the ghost still has somewhere to land.
  const rect = caretRect.width || caretRect.height
    ? { left: caretRect.left, top: caretRect.top, height: caretRect.height || lineBb.height }
    : { left: lineBb.left, top: lineBb.top, height: lineBb.height };

  return {
    src: pos.line, at: pos.offset, after: true, rect,
    lineRect: { left: lineBb.left, top: lineBb.top, width: lineBb.width, height: lineBb.height },
    floating: false, zone: 'source',
  };
}

/** The one entry point useChordSheetDrag calls — tries the source editor first (its bounding
 *  box is authoritative: if the pointer is over it, that's where the drag lands) and falls
 *  back to the sheet preview's own, more lenient hitTest otherwise. A drag started from
 *  either surface (palette, a sheet chip, an editor chip) can land on either this way. */
export function hitTestAny(clientX: number, clientY: number, dragCi: number, dragSrc: number): DropHit | null {
  return hitTestSource(clientX, clientY) ?? hitTest(clientX, clientY, dragCi, dragSrc);
}
