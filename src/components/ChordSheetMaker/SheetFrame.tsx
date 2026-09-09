import type { ReactNode } from 'react';
import { DiagramStrip } from './DiagramStrip';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { type StyleLayout } from '@/lib/chordSheet/presets';
import type { ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import { makeRoleStyle, presetPaper, presetRule, presetMeta, PAPER_MAX_WIDTH } from './sheetChrome';

// Shared "paper" chrome for both the read-only chart (SheetPaper) and the editor's
// interactive preview (InteractiveSheet). Only the line body differs between the two —
// everything around it (paper frame, title block, diagram strips, columns) is identical,
// so a chart looks the same while you're editing it as it does once published.

interface Props {
  layout: StyleLayout;
  title: string;
  artist: string;
  displayKey: string;
  capo: number;
  instrument: DiagramInstrument | 'piano';
  /** Already transposed to the sounding key. */
  diagramChords: string[];
  /** Spelling for the diagram captions — the body lines are formatted by the caller. */
  chartType: ChartNotation;
  /** Overrides the preset's page-width cap (Stage mode). */
  maxWidthPx?: number;
  children: ReactNode;
}

export function SheetFrame({ layout, title, artist, displayKey, capo, instrument, diagramChords, chartType, maxWidthPx, children }: Props) {
  const roleStyle = makeRoleStyle(layout);

  const diagramsStrip = <DiagramStrip layout={layout} instrument={instrument} chords={diagramChords} chartType={chartType} displayKey={displayKey} />;

  return (
    <div
      className={`csm-paper mx-auto rounded-2xl border p-8 shadow-sm ${layout.pageSize === 'a4' ? 'csm-page-a4' : 'csm-page-letter'}`}
      style={{ maxWidth: maxWidthPx ?? PAPER_MAX_WIDTH[layout.pageSize], background: presetPaper(layout), borderColor: presetRule(layout) }}
    >
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b pb-4" style={{ borderColor: presetRule(layout) }}>
        <div>
          <h1 style={roleStyle('heading')}>{title || 'Untitled'}</h1>
          {artist && <p className="mt-0.5 text-sm" style={{ color: presetMeta(layout) }}>{artist}</p>}
        </div>
        <div className="shrink-0 text-right font-mono text-xs leading-relaxed" style={{ color: presetMeta(layout) }}>
          <div>Key <strong style={{ fontSize: '13px', color: layout.fonts.chords.color }}>{displayKey}</strong></div>
          {capo > 0 && <div>Capo {capo}</div>}
        </div>
      </div>

      {layout.diagramSpot === 'top' && diagramsStrip}

      <div style={layout.columns === 2 ? { columnCount: 2, columnGap: '2rem' } : undefined}>
        <div className="space-y-5">{children}</div>
      </div>

      {layout.diagramSpot === 'bottom' && diagramsStrip}
    </div>
  );
}
