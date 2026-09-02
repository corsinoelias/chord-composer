import { Fragment, type ReactNode } from 'react';
import type { BarToken } from '@/lib/chordSheet/chordSheetCore';
import type { StyleLayout } from '@/lib/chordSheet/presets';
import { JUSTIFY } from './sheetChrome';

type ChordCell = Extract<BarToken, { kind: 'chord' }>;

interface Props {
  tokens: BarToken[];
  align: StyleLayout['align'];
  /** Colour for the `|` bar marks (usually the preset's "meta" grey). */
  barColor: string;
  renderChord: (token: ChordCell, index: number) => ReactNode;
  /** Editor only — marks the row as a drag/drop hit-test target (chordHitTest.ts reads
   *  `[data-csm-line]`). Omitted by the read-only SheetPaper. */
  lineIndex?: number;
  /** Mobile edit mode only — tapping the row (not a chord chip) opens the line-edit sheet. */
  onLineClick?: () => void;
}

/** A line that carries only chords + bar marks (`[G] [C] | [G] [D]`). Its whitespace is
 *  typing noise, so it's laid out on an even grid instead of positioned like a lyric line —
 *  `[G][C][G] [D]` and `[G] [C] [G] [D]` render identically. Shared by the read-only
 *  SheetPaper and the editor's InteractiveSheet; only the chord cell differs (a plain span
 *  vs. a drag handle), passed in via `renderChord`. */
export function ChordOnlyLine({ tokens, align, barColor, renderChord, lineIndex, onLineClick }: Props) {
  return (
    <div
      className={`csm-line flex flex-wrap items-baseline gap-x-4 gap-y-1 leading-[2.2] ${onLineClick ? 'cursor-text rounded hover:bg-primary/5' : ''}`}
      data-csm-line={lineIndex}
      onClick={onLineClick}
      style={{ justifyContent: JUSTIFY[align], breakInside: 'avoid' }}
    >
      {tokens.map((t, i) =>
        t.kind === 'bar' ? (
          <span key={i} aria-hidden className="select-none opacity-70" style={{ color: barColor }}>|</span>
        ) : (
          <Fragment key={i}>{renderChord(t, i)}</Fragment>
        ),
      )}
    </div>
  );
}
