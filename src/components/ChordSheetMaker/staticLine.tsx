import type { CSSProperties } from 'react';
import { slotsOf, barTokens, formatChordParts, type DocLine, type ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import type { StyleLayout } from '@/lib/chordSheet/presets';
import { JUSTIFY, presetMeta } from './sheetChrome';
import { ChordOnlyLine } from './ChordOnlyLine';

// Read-only, non-interactive per-line rendering — the original body of SheetPaper, factored
// out so it can serve two purposes: (1) SheetPaper's own display, unchanged, and (2) the
// hidden measurement pass PaginatedPaper uses to figure out where page breaks land, even
// when the *visible* page is drawn by InteractiveSheet's draggable chips. Using this plain
// renderer for measurement (instead of the interactive one) keeps `data-csm-*` attributes —
// which the drag engine treats as real drop targets — out of the off-screen measurer.

export interface StaticLineCtx {
  displayKey: string;
  chartType: ChartNotation;
  chordName: (raw: string) => string;
  roleStyle: (role: 'heading' | 'section' | 'chords' | 'lyrics') => CSSProperties;
  layout: StyleLayout;
}

export function renderStaticChord(raw: string, ctx: StaticLineCtx) {
  const parts = formatChordParts(ctx.chordName(raw), ctx.displayKey, ctx.chartType);
  return (
    <span style={ctx.roleStyle('chords')} className="whitespace-nowrap">
      {parts.main}
      {parts.sup && <sup style={{ fontSize: '0.75em' }}>{parts.sup}</sup>}
      {parts.tail}
    </span>
  );
}

export function renderStaticLine(line: DocLine, key: number | string, ctx: StaticLineCtx) {
  if (line.blank) return <div key={key} className="h-2" />;
  if (line.chordsOnly) {
    return (
      <ChordOnlyLine
        key={key}
        tokens={barTokens(line)}
        align={ctx.layout.align}
        barColor={presetMeta(ctx.layout)}
        renderChord={(t) => renderStaticChord(t.chord, ctx)}
      />
    );
  }
  return (
    <div key={key} className="csm-line flex flex-wrap leading-[2.2]" style={{ justifyContent: JUSTIFY[ctx.layout.align], breakInside: 'avoid' }}>
      {slotsOf(line.plain, line.chords).map((slot, ti) => {
        if (!slot.chord) return <span key={ti} style={ctx.roleStyle('lyrics')}>{slot.lyric}</span>;
        return (
          <span key={ti} className="relative inline-block pr-0.5">
            <span className="absolute -top-[1.15em] left-0">{renderStaticChord(slot.chord, ctx)}</span>
            <span style={ctx.roleStyle('lyrics')}>{slot.lyric || '  '}</span>
          </span>
        );
      })}
    </div>
  );
}
