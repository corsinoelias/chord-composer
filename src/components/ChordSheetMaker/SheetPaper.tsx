import { useMemo } from 'react';
import {
  parseDoc, parseSheet, transposeChord, transposeKey, isFlatKey,
  uniqueChords, type ChartNotation, type DocLine,
} from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { type StyleLayout } from '@/lib/chordSheet/presets';
import { SheetFrame } from './SheetFrame';
import { PaginatedPaper } from './PaginatedPaper';
import { makeRoleStyle } from './sheetChrome';
import { renderStaticLine, type StaticLineCtx } from './staticLine';

interface Props {
  text: string;
  title: string;
  artist: string;
  baseKey: string;
  semi: number;
  capo: number;
  instrument: DiagramInstrument | 'piano';
  chartType: ChartNotation;
  layout: StyleLayout;
  /** Overrides the preset's page-width cap — Stage mode widens the column so big type
   *  wraps less. Ignored when `paginate` is set (pages are real 96dpi size, auto-scaled to fit). */
  maxWidthPx?: number;
  /** Canva-style real multi-page layout instead of one flowing "paper" card. Off by
   *  default so Stage Mode (a single continuous auto-scroll) is unaffected; the public
   *  chart view and the editor's preview turn it on. */
  paginate?: boolean;
}

/** The rendered "paper" — read-only chart used by the public `/chord-sheet-maker/[slug]`
 *  view and (via the shared SheetFrame chrome) mirrored by the editor's interactive
 *  preview. Reads the raw ChordPro source non-destructively: transposition and notation
 *  are display-time transforms (same principle as PrintChordSheet.astro's `transpose`
 *  prop), the stored text never changes because the key was nudged. Colors/fonts come
 *  from `layout`'s preset — literal values, not the site's --primary/--card tokens,
 *  because this is printed/shared content, not app chrome (see presets.ts). */
export function SheetPaper({ text, title, artist, baseKey, semi, capo, instrument, chartType, layout, maxWidthPx, paginate }: Props) {
  const sections = useMemo(() => parseDoc(text), [text]);
  const displayKey = useMemo(() => transposeKey(baseKey, semi), [baseKey, semi]);
  const flats = isFlatKey(displayKey);
  const roleStyle = makeRoleStyle(layout);

  const chordName = (raw: string) => transposeChord(raw, semi, flats);

  const diagramChords = useMemo(
    () => uniqueChords(parseSheet(text)).map((c) => transposeChord(c, semi, flats)),
    [text, semi, flats],
  );

  const staticCtx: StaticLineCtx = { displayKey, chartType, chordName, roleStyle, layout };
  const renderLine = (line: DocLine) => renderStaticLine(line, line.src, staticCtx);

  if (paginate) {
    return (
      <PaginatedPaper
        layout={layout}
        title={title}
        artist={artist}
        displayKey={displayKey}
        capo={capo}
        instrument={instrument}
        diagramChords={diagramChords}
        sections={sections}
        renderLine={renderLine}
        staticCtx={staticCtx}
      />
    );
  }

  return (
    <SheetFrame
      layout={layout}
      title={title}
      artist={artist}
      displayKey={displayKey}
      capo={capo}
      instrument={instrument}
      diagramChords={diagramChords}
      chartType={chartType}
      maxWidthPx={maxWidthPx}
    >
      {sections.map((section, si) => (
        <div key={si} style={{ breakInside: 'avoid' }}>
          {section.name && (
            <div className="csm-sec-title mb-2 uppercase tracking-widest" style={{ ...roleStyle('section'), fontSize: '10px' }}>
              {section.name}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {section.lines.map((line, li) => renderStaticLine(line, li, staticCtx))}
          </div>
        </div>
      ))}
    </SheetFrame>
  );
}
