// Pointer-to-position mapping for the sheet's drag & drop — ported near-verbatim from the
// reference "Chord Sheet Maker" prototype. Maps a viewport point to *which line, which
// character, and which side* of any chords already sitting on that character — the side is
// what makes two chords at the same offset reorderable at all.
//
// Reads plain DOM (data-csm-* attributes set by InteractiveSheet), not React state, because
// it needs real layout — text measured with Range.getBoundingClientRect(), not anything a
// virtual DOM diff could give us.

const SNAP_PX = 7; // magnet radius to a word boundary

export interface DropHit {
  src: number;
  at: number;
  after: boolean;
  rect: { left: number; top: number; height: number };
  snapped?: boolean;
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

/** `dragCi`/`dragSrc` identify the chip currently being dragged (so it excludes itself when
 *  deciding which side of a rival chord to land on) — pass -1/-1 for a fresh palette chord
 *  that isn't in the document yet. */
export function hitTest(clientX: number, clientY: number, dragCi: number, dragSrc: number): DropHit | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-csm-line]'));
  if (!rows.length) return null;

  let row: HTMLElement | null = null;
  let rowD = Infinity;
  rows.forEach((r) => {
    const bb = r.getBoundingClientRect();
    if (!bb.height) return;
    // A row's catch area includes the chord strip drawn above its lyrics.
    const top = bb.top - 6;
    const d = clientY < top ? top - clientY : clientY > bb.bottom ? clientY - bb.bottom : 0;
    if (d < rowD) { rowD = d; row = r; }
  });
  if (!row || rowD > 22) return null;
  const foundRow: HTMLElement = row;

  const src = Number(foundRow.dataset.csmLine);

  // Chord-only (instrumental) line: there is no lyric to measure against, so the chips
  // themselves are the drop targets.
  const spans = Array.from(foundRow.querySelectorAll<HTMLElement>('[data-csm-anchor]'));
  if (!spans.length) {
    const chips = realChips(foundRow);
    if (!chips.length) return { src, at: 0, after: false, rect: rectOf(foundRow.getBoundingClientRect()) };
    let best = chips[0], bd = Infinity, after = false;
    chips.forEach((el) => {
      const bb = el.getBoundingClientRect();
      const mid = bb.left + bb.width / 2;
      const d = Math.abs(mid - clientX);
      if (d < bd) { bd = d; best = el; after = clientX > mid; }
    });
    const bb = best.getBoundingClientRect();
    return { src, at: Number(best.dataset.csmAt), after, rect: { left: after ? bb.right : bb.left, top: bb.top, height: bb.height } };
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

  let best = points[0], bestD = Math.abs(points[0].x - clientX);
  points.forEach((p) => { const d = Math.abs(p.x - clientX); if (d < bestD) { bestD = d; best = p; } });

  // Magnet to a word start, so chords land where a musician expects.
  let snapped: typeof points[number] | null = null, snapD = Infinity;
  points.forEach((p) => {
    if (!p.boundary) return;
    const d = Math.abs(p.x - clientX);
    if (d < snapD) { snapD = d; snapped = p; }
  });
  const pick = (snapped && snapD <= SNAP_PX) ? snapped : best;

  // Which side of the chords already parked on this character?
  const rivals = chipsAt(foundRow, pick.at, src, dragSrc, dragCi);
  let after: boolean;
  if (rivals.length) {
    const rb = rivals[rivals.length - 1].getBoundingClientRect();
    after = clientX > rb.left + rb.width / 2;
  } else {
    after = clientX > pick.x;
  }

  return { src, at: pick.at, after, rect: pick.rect, snapped: pick === snapped };
}

/** Keep the sheet scrolling when the drag reaches its edges. */
export function edgeScroll(clientY: number): void {
  const pane = document.querySelector<HTMLElement>('.csm-sheet-pane');
  if (!pane) return;
  const bb = pane.getBoundingClientRect();
  const zone = 60;
  if (clientY < bb.top + zone) pane.scrollTop -= Math.max(4, (bb.top + zone - clientY) / 4);
  else if (clientY > bb.bottom - zone) pane.scrollTop += Math.max(4, (clientY - (bb.bottom - zone)) / 4);
}

/** Generous margin: the sheet's own lines can sit flush with (or a hair past) the paper
 *  edge, so a strict bounds test turns a near-miss into an accidental delete. */
export function farFromPaper(x: number, y: number): boolean {
  const paper = document.querySelector<HTMLElement>('.csm-paper');
  if (!paper) return false;
  const bb = paper.getBoundingClientRect();
  const m = 48;
  return x < bb.left - m || x > bb.right + m || y < bb.top - m || y > bb.bottom + m;
}
