// Pure DOM helpers for the contenteditable ChordPro source editor — ported from the
// reference prototype's paintSource/readSource/chipHTML. Each `[Chord]` token renders as a
// `contenteditable="false"` chip span: the browser then treats it as one atomic unit for
// the caret and for Backspace/Delete, so a chip can't be edited character-by-character or
// left half-deleted. Everything here is imperative DOM, not React state — repainting via
// React on every keystroke would reset the caret to the start of the field each time.

const CHIP_ATTR = 'data-csm-chip';
const REMOVE_ATTR = 'data-csm-x';

interface ChipHostEl extends HTMLElement {
  _csmText?: string;
  _csmDisplay?: (stored: string) => string;
  _csmStore?: (shown: string) => string;
}

export function paintedText(el: HTMLElement): string | undefined {
  return (el as ChipHostEl)._csmText;
}

/** Installs the transpose-aware codec used to *display* chips in a key other than the one
 *  the source text is stored in: `display` maps a stored (base-key) token to its on-screen
 *  label, `store` is the inverse for a chord typed straight into the field. Both are no-ops
 *  when the sheet isn't transposed. readSource still returns base-key text either way — a
 *  chip's `data-csm-chip` attribute always holds the stored token, never the shown label,
 *  so caret/offset math (which counts `[Name]` from that attribute) is unaffected too. */
export function setChordCodec(
  el: HTMLElement,
  display?: (stored: string) => string,
  store?: (shown: string) => string,
): void {
  (el as ChipHostEl)._csmDisplay = display;
  (el as ChipHostEl)._csmStore = store;
}

function shownLabel(el: HTMLElement, stored: string): string {
  const fn = (el as ChipHostEl)._csmDisplay;
  return fn ? fn(stored) : stored;
}

/** Stamps the element's "last known text" without repainting — call this whenever the DOM
 *  and `text` are already in agreement (after a live edit was read back with readSource, or
 *  right after paintSource itself painted that exact text) so the next sync effect doesn't
 *  mistake an edit that originated *inside* the editor for an external change and repaint
 *  over it, which is what used to reset the caret to the start on every keystroke. */
export function markPainted(el: HTMLElement, text: string) {
  (el as ChipHostEl)._csmText = text;
}

/** `name` is the stored (base-key) token that goes in `data-csm-chip` and round-trips
 *  through readSource; `label`, when given, is the transposed text shown to the reader. */
export function buildChip(name: string, label?: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute(CHIP_ATTR, name);
  chip.contentEditable = 'false';
  chip.className = 'csm-chip mx-0.5 inline-flex items-center gap-0.5 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-0.5 align-baseline text-[0.92em] font-bold leading-normal text-primary';
  chip.style.userSelect = 'none';
  chip.appendChild(document.createTextNode(label ?? name));
  const remove = document.createElement('span');
  remove.setAttribute(REMOVE_ATTR, '1');
  remove.title = 'Remove chord';
  remove.className = 'ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded bg-primary/15 text-[11px] leading-none';
  remove.textContent = '×';
  chip.appendChild(remove);
  return chip;
}

/** Repaints the editor's whole content from plain ChordPro text — one <div> per line, each
 *  `[Chord]` token replaced by a chip. Only call this for a change that happened *outside*
 *  the editor's own typing (undo, drag-drop onto the sheet, a palette click) — see
 *  ChordProEditor's sync effect, which compares against `paintedText()` to tell the two
 *  apart. Repainting on the element's own `input` event would reset the caret every
 *  keystroke. */
export function paintSource(el: HTMLElement, text: string) {
  // A repaint is only ever for an *external* change now (see markPainted's doc comment) —
  // but it can still happen while the editor is focused (undo, a chip dropped on the sheet
  // preview, a click-to-insert from the palette). Preserve exactly what a focused text field
  // should never lose across a content swap: focus itself, the caret, and scroll position.
  const hadFocus = document.activeElement === el;
  const caret = hadFocus ? saveCaret(el) : null;
  const scrollTop = el.scrollTop;

  el.innerHTML = '';
  const lines = (text || '').split('\n');
  const re = /\[([^\]]*)\]/g;
  lines.forEach((line) => {
    const div = document.createElement('div');
    let i = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      if (m.index > i) div.appendChild(document.createTextNode(line.slice(i, m.index)));
      div.appendChild(buildChip(m[1], shownLabel(el, m[1])));
      i = m.index + m[0].length;
    }
    const rest = line.slice(i);
    if (rest) div.appendChild(document.createTextNode(rest));
    if (!div.childNodes.length) div.appendChild(document.createElement('br'));
    el.appendChild(div);
  });
  markPainted(el, text);

  if (caret) restoreCaret(el, caret);
  el.scrollTop = scrollTop;
}

/** Serializes the editor's live DOM back into plain ChordPro text — the inverse of
 *  paintSource. A chip typed manually (raw `[G]` text, not inserted as a chip) stays literal
 *  text until the next repaint, exactly like the reference — most chord entry goes through
 *  a chip anyway (palette or drag), so this is a minor, low-friction gap, not a bug. */
export function readSource(el: HTMLElement): string {
  function lineText(node: Node): string {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue ?? '';
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const en = n as HTMLElement;
        const chord = en.getAttribute(CHIP_ATTR);
        if (chord != null) out += `[${chord}]`;
        else if (en.tagName === 'BR') out += '';
        else out += lineText(en);
      }
    });
    return out;
  }
  const lines: string[] = [];
  let loose = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'DIV') {
      if (loose) { lines.push(loose); loose = ''; }
      lines.push(lineText(n));
    } else if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'BR') {
      lines.push(loose);
      loose = '';
    } else if (n.nodeType === Node.TEXT_NODE) {
      loose += n.nodeValue ?? '';
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const en = n as HTMLElement;
      const chord = en.getAttribute(CHIP_ATTR);
      loose += chord != null ? `[${chord}]` : lineText(en);
    }
  });
  if (loose) lines.push(loose);
  // Browsers substitute a non-breaking space (U+00A0) while typing into contenteditable —
  // normalize it back to a plain space in the serialized text. Written as an escape (not a
  // literal character) so it survives editors/linters that flag stray Unicode whitespace.
  return lines.join('\n').replace(/\u00a0/g, ' ');
}

function closestLine(el: HTMLElement, node: Node): HTMLElement | null {
  let n: Node | null = node;
  while (n && n.parentNode !== el) n = n.parentNode;
  return (n as HTMLElement) ?? null;
}

// ── Caret / selection position model ──
// A position is {line, offset} in the same terms readSource() serializes to — a chip counts
// as the full length of `[Name]`, never a fraction of it (it's contenteditable=false, so a
// live DOM selection can never land *inside* one, only immediately before or after). This
// lets caret save/restore and clipboard operations work entirely against plain ChordPro
// text — the same model the rest of the app already trusts — instead of re-deriving offsets
// from DOM structure every time.

export interface CaretPos { line: number; offset: number }

function measureNode(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').length;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const chord = el.getAttribute(CHIP_ATTR);
    if (chord != null) return `[${chord}]`.length;
    if (el.tagName === 'BR') return 0;
    let n = 0;
    el.childNodes.forEach((c) => { n += measureNode(c); });
    return n;
  }
  return 0;
}

/** Sums serialized length from the start of `line` up to (node, offset) — the inverse of
 *  walking readSource's own line-serializer, stopping partway through. `node` isn't always a
 *  text node: landing a caret right before/after an atomic, contenteditable=false chip is
 *  exactly the case a browser expresses as (containerElement, childIndex) rather than a text
 *  offset — Home on a chip-starting line, or a click/arrow-step onto either edge of any chip,
 *  routes through here with `node === line` itself. walk() has to be entered *at* `line` (not
 *  just at its children) so that shape gets the same `node === targetNode` match a text node
 *  gets — the previous version only ever called walk() on line's children, so `line` itself
 *  as the target silently fell through and returned the whole line's length instead. */
function offsetWithinLine(line: HTMLElement, targetNode: Node, targetOffset: number): number {
  let total = 0;
  function walk(node: Node): boolean {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += targetOffset;
      } else {
        const children = Array.from(node.childNodes);
        for (let i = 0; i < targetOffset && i < children.length; i++) total += measureNode(children[i]);
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) { total += (node.nodeValue ?? '').length; return false; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const chord = el.getAttribute(CHIP_ATTR);
      if (chord != null) { total += `[${chord}]`.length; return false; }
      if (el.tagName === 'BR') return false;
      for (const child of Array.from(el.childNodes)) if (walk(child)) return true;
      return false;
    }
    return false;
  }
  walk(line);
  return total;
}

/** Resolves an arbitrary DOM (node, offset) pair — from a live Selection, or from
 *  `document.caretRangeFromPoint` during a drag hit-test — into a {line, offset} position.
 *  Exported for chordHitTest.ts, which drives the sheet's drag & drop engine and needs the
 *  same conversion to let a drag land inside this editor too. */
export function resolvePosition(el: HTMLElement, node: Node, offset: number): CaretPos | null {
  const line = closestLine(el, node);
  if (!line) return null;
  const lineIndex = Array.prototype.indexOf.call(el.children, line);
  if (lineIndex < 0) return null;
  return { line: lineIndex, offset: offsetWithinLine(line, node, offset) };
}

/** The live caret position, or null if the selection isn't inside `el` (or there is none). */
export function saveCaret(el: HTMLElement): CaretPos | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;
  return resolvePosition(el, r.startContainer, r.startOffset);
}

/** Both ends of the live selection (equal to each other for a plain caret). A Range's start
 *  is always the earlier document position regardless of which way the user dragged, so
 *  these come back already in order. */
export function getSelectionPositions(el: HTMLElement): { start: CaretPos; end: CaretPos } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const start = resolvePosition(el, r.startContainer, r.startOffset);
  const end = resolvePosition(el, r.endContainer, r.endOffset);
  if (!start || !end) return null;
  return { start, end };
}

/** Places the caret at a saved position, clamping the line index if the text got shorter.
 *  Used after every repaint that happens while the editor is focused, so a re-render never
 *  has to reset the caret to the very start of the field. */
export function restoreCaret(el: HTMLElement, pos: CaretPos): void {
  const lines = Array.from(el.children) as HTMLElement[];
  if (!lines.length) return;
  const line = lines[Math.max(0, Math.min(pos.line, lines.length - 1))];
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = Math.max(0, pos.offset);
  let placed = false;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? '').length;
      if (remaining <= len) { range.setStart(node, remaining); placed = true; return true; }
      remaining -= len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el2 = node as HTMLElement;
      const chord = el2.getAttribute(CHIP_ATTR);
      if (chord != null) {
        const len = `[${chord}]`.length;
        if (remaining <= 0) { range.setStartBefore(el2); placed = true; return true; }
        if (remaining < len) { range.setStartAfter(el2); placed = true; return true; }
        remaining -= len;
        return false;
      }
      if (el2.tagName === 'BR') return false;
      for (const child of Array.from(el2.childNodes)) if (walk(child)) return true;
      return false;
    }
    return false;
  }
  for (const child of Array.from(line.childNodes)) { if (walk(child)) break; }
  if (!placed) { range.selectNodeContents(line); range.collapse(false); }
  else range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Inserts a chord chip at the current caret position — falls back to the end of the last
 *  line if the editor doesn't have a live selection inside it (e.g. focus was on the
 *  palette button that triggered this). Used by the "IN KEY" palette's click-to-insert. */
export function insertChordAtCaret(el: HTMLElement, chord: string): void {
  el.focus();
  const sel = window.getSelection();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (el.contains(r.commonAncestorContainer)) range = r.cloneRange();
  }
  if (!range) {
    range = document.createRange();
    const lastLine = el.lastElementChild ?? el;
    range.selectNodeContents(lastLine);
    range.collapse(false);
  }
  range.deleteContents();
  const chip = buildChip(chord, shownLabel(el, chord));
  range.insertNode(chip);
  range.setStartAfter(chip);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// ── Copy / cut / paste ──
// All three work purely on the plain ChordPro text (readSource's output) rather than DOM
// ranges, so `[Chord]like this` round-trips exactly through the system clipboard — a chip's
// serialized form, not its visible label — and a paste can never introduce foreign markup
// (Word spans, nested divs) into the editor: only ever plain text goes back in, re-tokenized
// into chips exactly like paintSource does for the initial load.

/** Splices `insertText` (already normalized to `\n`, may itself span several lines) into
 *  `lines` in place of the [start, end) range, joining/splitting lines as needed. Returns
 *  the resulting lines and the caret position right after the inserted text. Used for both
 *  paste (insertText = the clipboard's content) and delete/cut (insertText = ''). */
function replaceRange(lines: string[], start: CaretPos, end: CaretPos, insertText: string): { lines: string[]; caret: CaretPos } {
  const startLine = lines[start.line] ?? '';
  const endLine = lines[end.line] ?? '';
  const before = startLine.slice(0, start.offset);
  const after = endLine.slice(end.offset);
  const insertedLines = insertText.split('\n');
  insertedLines[0] = before + insertedLines[0];
  insertedLines[insertedLines.length - 1] += after;
  const out = [...lines.slice(0, start.line), ...insertedLines, ...lines.slice(end.line + 1)];
  const lastInserted = insertedLines[insertedLines.length - 1];
  return {
    lines: out,
    caret: { line: start.line + insertedLines.length - 1, offset: lastInserted.length - after.length },
  };
}

/** The live selection's text, in ChordPro form (`[G]like this`) — for the clipboard. Returns
 *  null when there's no selection inside `el`, or it's collapsed (nothing to copy/cut). */
export function serializeSelection(el: HTMLElement): string | null {
  const pos = getSelectionPositions(el);
  if (!pos) return null;
  const { start, end } = pos;
  if (start.line === end.line && start.offset === end.offset) return null;
  const lines = readSource(el).split('\n');
  if (start.line === end.line) return (lines[start.line] ?? '').slice(start.offset, end.offset);
  const parts = [(lines[start.line] ?? '').slice(start.offset)];
  for (let i = start.line + 1; i < end.line; i++) parts.push(lines[i] ?? '');
  parts.push((lines[end.line] ?? '').slice(0, end.offset));
  return parts.join('\n');
}

/** Core of every structural text edit that isn't plain character-by-character typing: swaps
 *  the [start, end) span of the document's plain text for `insertText`, repaints, and
 *  restores the caret right after what was inserted. Returns the resulting full text.
 *  `start === end` is a plain insert at the caret; `insertText === ''` is a delete. Shared by
 *  paste/cut (positions come from the live selection) and the Enter/Backspace/Delete
 *  handling below (positions are sometimes synthesized to span a line boundary). */
export function replaceAt(el: HTMLElement, start: CaretPos, end: CaretPos, insertText: string): string {
  const lines = readSource(el).split('\n');
  const { lines: outLines, caret } = replaceRange(lines, start, end, insertText);
  const newText = outLines.join('\n');
  paintSource(el, newText);
  restoreCaret(el, caret);
  return newText;
}

/** Replaces the live selection (or just inserts at the caret, if it's collapsed) with
 *  `insertText`. Returns null if there's no live selection inside `el` to act on. Used for
 *  paste (insertText = clipboard content) and cut (insertText = ''). */
export function replaceSelectionWithText(el: HTMLElement, insertText: string): string | null {
  const pos = getSelectionPositions(el);
  if (!pos) return null;
  return replaceAt(el, pos.start, pos.end, insertText);
}

/** If the caret sits immediately after a hand-typed `[Chord]` token (not a real chip — those
 *  are atomic, contenteditable=false spans a caret can't land inside), swaps that raw text
 *  for a real chip in place and leaves the caret right after it. Called on every keystroke
 *  (see ChordProEditor's onInput) — cheap, since it only ever inspects the one text node the
 *  caret is in — so typing `[G]` converts to a chip the instant the closing bracket lands,
 *  matching how a click-to-insert or a drag already produces one. Returns false (no-op) for
 *  anything else, including mid-typing states like `[G` with no closing bracket yet. */
export function tokenizeAtCaret(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return false;
  const text = node.nodeValue ?? '';
  const upto = text.slice(0, r.startOffset);
  const m = /\[([^[\]]+)\]$/.exec(upto);
  if (!m) return false;
  const matchStart = upto.length - m[0].length;
  // splitText(matchStart) leaves "...precedingText" in `node` and returns a new node holding
  // "[Chord]" plus whatever trailing text shares this text node after the caret; a second
  // split trims that new node down to exactly "[Chord]", leaving the trailing text (if any)
  // as its own sibling right after where the chip goes.
  const tail = (node as Text).splitText(matchStart);
  tail.splitText(m[0].length);
  // A chord typed straight in is in the *shown* (transposed) key — store it back in the
  // base key so readSource stays consistent, exactly like the palette's click-to-insert.
  const typed = m[1].trim();
  const store = (el as ChipHostEl)._csmStore;
  const chip = buildChip(store ? store(typed) : typed, typed);
  tail.parentNode?.replaceChild(chip, tail);
  const range = document.createRange();
  range.setStartAfter(chip);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
