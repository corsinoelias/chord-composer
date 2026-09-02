import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import {
  paintSource, readSource, paintedText, markPainted, insertChordAtCaret, tokenizeAtCaret,
  serializeSelection, replaceSelectionWithText, replaceAt, getSelectionPositions, type CaretPos,
} from './chordProEditorDom';

// Replaces the plain <textarea> ChordPro source editor with a contenteditable field where
// every `[Chord]` token renders as a chip (see chordProEditorDom.ts) instead of raw bracket
// text — click a chip's × to remove it, Backspace deletes one as a single unit since it's
// contenteditable=false. Deliberately not React-controlled character-by-character: painting
// on every keystroke would reset the caret to the start of the field each time, so typing
// mutates the DOM directly and only *tells* React what the new text is (onChange) — see
// the sync effect below for how an external change (undo, a chip dropped on the sheet
// preview) still gets repainted without disturbing normal typing.

export interface ChordProEditorHandle {
  /** Inserts a chip at the caret (or the end, if the editor isn't focused) and returns the
   *  resulting full text — the caller owns committing it (undo entry, state). */
  insertChordAtCaret: (chord: string) => string | null;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Wired to useChordSheetDrag's beginDrag, so an existing chip in this editor can be picked
   *  up and dropped elsewhere (another spot in the source, or the sheet preview) exactly like
   *  a sheet chip already can — see the onPointerDown delegation below for how `src`/`ci` are
   *  resolved for an imperatively-built chip that has no React handler of its own. */
  onBeginChipDrag?: (e: React.PointerEvent, src: number, ci: number, label: string) => void;
}

export const ChordProEditor = forwardRef<ChordProEditorHandle, Props>(function ChordProEditor(
  { value, onChange, className, onBeginChipDrag },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  // Set between compositionstart/compositionend while an IME is mid-conversion (accents via
  // dead keys, Spanish ñ on some layouts, CJK input). The browser fires `input` events for
  // every intermediate candidate during that window — committing or tokenizing on those would
  // read a not-yet-final string, so onInput below no-ops until composition actually ends.
  const composingRef = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (paintedText(el) !== value) paintSource(el, value);
  }, [value]);

  const commit = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const text = readSource(el);
    // Stamp the text we just read as "already painted" *before* telling React about it — the
    // sync effect above compares against this to tell a normal keystroke (DOM and text already
    // agree, no repaint needed) from an external change (undo, a drag-drop from the sheet
    // preview) that still needs one. Without this, every keystroke looked external and
    // repainted the whole field, which is what reset the caret to the start on every key.
    markPainted(el, text);
    onChange(text);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    // Deliberately doesn't call `onChange` itself — insertion is a discrete action (like a
    // drag-drop onto the sheet), not a burst of typing, so the caller owns committing it
    // (its own undo entry) exactly like useChordSheetDrag's applyDragChange does. The
    // returned text will flow back down as the `value` prop and repaint this editor via the
    // sync effect above — a full repaint here is fine (unlike on every keystroke) since a
    // click, unlike typing, has no caret continuity to protect.
    insertChordAtCaret: (chord: string) => {
      const el = elRef.current;
      if (!el) return null;
      insertChordAtCaret(el, chord);
      return readSource(el);
    },
    focus: () => elRef.current?.focus(),
  }), []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const x = target.closest('[data-csm-x]');
    if (!x) return;
    e.preventDefault();
    x.closest('[data-csm-chip]')?.remove();
    commit();
  }, [commit]);

  // Picks up an existing chip for useChordSheetDrag's engine — the same one the sheet
  // preview's chips already use (see InteractiveSheet's per-chip onPointerDown), just
  // reached by delegation since these chips are imperative DOM (buildChip), not React nodes
  // with handlers of their own. `ci` — the chip's index among its line's chords, the same
  // model lineTokens produces — is recovered by counting chip siblings left-to-right, which
  // matches lineTokens exactly since both derive from the same left-to-right bracket scan.
  const onChipPointerDown = useCallback((e: React.PointerEvent) => {
    if (!onBeginChipDrag) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-csm-x]')) return; // the × button has its own click handling
    const chip = target.closest<HTMLElement>('[data-csm-chip]');
    const el = elRef.current;
    const line = chip?.parentElement;
    if (!chip || !el || !line || line.parentElement !== el) return;
    const src = Array.prototype.indexOf.call(el.children, line);
    const ci = Array.from(line.querySelectorAll('[data-csm-chip]')).indexOf(chip);
    if (src < 0 || ci < 0) return;
    e.preventDefault();
    onBeginChipDrag(e, src, ci, chip.getAttribute('data-csm-chip') ?? '');
  }, [onBeginChipDrag]);

  // Native `input` handler for ordinary typing (composition guarded — see composingRef).
  // tokenizeAtCaret is a cheap, best-effort DOM check (only inspects the caret's own text
  // node) run before every commit, so a hand-typed `[G]` becomes a real chip the instant its
  // closing bracket lands — exactly like a click-to-insert or a drop already produces one.
  const onInput = useCallback(() => {
    if (composingRef.current) return;
    const el = elRef.current;
    if (el) tokenizeAtCaret(el);
    commit();
  }, [commit]);

  const onCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const onCompositionEnd = useCallback(() => { composingRef.current = false; onInput(); }, [onInput]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = elRef.current;
    if (!el) return;

    // This editor has no rich-text model — readSource only ever understands chip spans and
    // plain text, so a native <b>/<i>/<u> from the browser's built-in formatting commands
    // would just vanish (or get read back as loose text) the next time anything repaints.
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // Replacing the live selection with a bare '\n' handles both the plain-caret case
      // (insert a line break) and Enter-while-text-is-selected (replace it with a break) in
      // one path — the old DOM-splice-based line split silently ignored an active selection.
      const next = replaceSelectionWithText(el, '\n');
      if (next != null) onChange(next);
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      const pos = getSelectionPositions(el);
      if (!pos) return;
      const collapsed = pos.start.line === pos.end.line && pos.start.offset === pos.end.offset;
      if (!collapsed) {
        // A selection spanning a line break: native deleteContents() strips each line's
        // content but leaves the <div> boundaries in place, so the remaining heads/tails
        // would land on two separate lines instead of joining into one — replaceAt already
        // does that join correctly (same path cut/paste use).
        e.preventDefault();
        const next = replaceSelectionWithText(el, '');
        if (next != null) onChange(next);
        return;
      }
      // Collapsed at a line boundary: mid-line Backspace/Delete (deleting one character, or
      // one whole chip — atomic since it's contenteditable=false) is already correct native
      // behavior and falls through untouched. Only right at the start/end of a line does
      // native block-merge behavior get inconsistent across browsers (and can corrupt the
      // one-<div>-per-line invariant everything else here relies on), so that one case is
      // done by hand: delete across the implicit newline, joining the two lines.
      const lines = readSource(el).split('\n');
      if (e.key === 'Backspace' && pos.start.offset === 0 && pos.start.line > 0) {
        e.preventDefault();
        const from: CaretPos = { line: pos.start.line - 1, offset: (lines[pos.start.line - 1] ?? '').length };
        onChange(replaceAt(el, from, pos.start, ''));
      } else if (e.key === 'Delete' && pos.start.offset === (lines[pos.start.line] ?? '').length && pos.start.line < lines.length - 1) {
        e.preventDefault();
        const to: CaretPos = { line: pos.start.line + 1, offset: 0 };
        onChange(replaceAt(el, pos.start, to, ''));
      }
    }
  }, [onChange]);

  // Copy/cut serialize the live selection to plain ChordPro text (`[G]like this`, the same
  // form the source ever holds) rather than letting the browser read chip DOM as visible
  // text — a chip's textContent includes its own "×" remove button, and native serialization
  // has no notion of `[brackets]` at all. Paste is the mirror: only ever plain text goes
  // back in (foreign HTML — Word spans, alien div nesting — is never trusted), re-tokenized
  // into chips exactly like the initial paintSource load. Both route through
  // replaceSelectionWithText, which already repaints and restores the caret, so `next` here
  // is the final text — no separate readSource/markPainted needed.
  const onCopy = useCallback((e: React.ClipboardEvent) => {
    const el = elRef.current;
    if (!el) return;
    const text = serializeSelection(el);
    if (text == null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  }, []);

  const onCut = useCallback((e: React.ClipboardEvent) => {
    const el = elRef.current;
    if (!el) return;
    const text = serializeSelection(el);
    if (text == null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    const next = replaceSelectionWithText(el, '');
    if (next != null) onChange(next);
  }, [onChange]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const el = elRef.current;
    if (!el) return;
    e.preventDefault();
    const raw = e.clipboardData.getData('text/plain');
    if (!raw) return;
    const normalized = raw.replace(/\r\n?/g, '\n');
    const next = replaceSelectionWithText(el, normalized);
    if (next != null) onChange(next);
  }, [onChange]);

  return (
    <div
      ref={elRef}
      data-csm-source="1"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      onInput={onInput}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onClick={onClick}
      onPointerDown={onChipPointerDown}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
      className={className}
    />
  );
});
