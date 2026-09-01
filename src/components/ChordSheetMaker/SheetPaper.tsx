import { useMemo } from 'react';
import {
  parseDoc, parseSheet, slotsOf, barTokens, transposeChord, transposeKey, isFlatKey,
  uniqueChords, formatChordParts, type ChartNotation,
} from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { type StyleLayout } from '@/lib/chordSheet/presets';
import { SheetFrame } from './SheetFrame';
import { makeRoleStyle, presetMeta, JUSTIFY } from './sheetChrome';
import { ChordOnlyLine } from './ChordOnlyLine';

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
   *  wraps less. */
  maxWidthPx?: number;
}

/** The rendered "paper" — read-only chart used by the public `/chord-sheet-maker/[slug]`
 *  view and (via the shared SheetFrame chrome) mirrored by the editor's interactive
 *  preview. Reads the raw ChordPro source non-destructively: transposition and notation
 *  are display-time transforms (same principle as PrintChordSheet.astro's `transpose`
 *  prop), the stored text never changes because the key was nudged. Colors/fonts come
 *  from `layout`'s preset — literal values, not the site's --primary/--card tokens,
 *  because this is printed/shared content, not app chrome (see presets.ts). */
export function SheetPaper({ text, title, artist, baseKey, semi, capo, instrument, chartType, layout, maxWidthPx }: Props) {
  const sections = useMemo(() => parseDoc(text), [text]);
  const displayKey = useMemo(() => transposeKey(baseKey, semi), [baseKey, semi]);
  const flats = isFlatKey(displayKey);
  const roleStyle = makeRoleStyle(layout);

  const chordName = (raw: string) => transposeChord(raw, semi, flats);

  const diagramChords = useMemo(
    () => uniqueChords(parseSheet(text)).map((c) => transposeChord(c, semi, flats)),
    [text, semi, flats],
  );

  const renderChord = (raw: string) => {
    const parts = formatChordParts(chordName(raw), displayKey, chartType);
    return (
      <span style={roleStyle('chords')} className="whitespace-nowrap">
        {parts.main}
        {parts.sup && <sup style={{ fontSize: '0.75em' }}>{parts.sup}</sup>}
        {parts.tail}
      </span>
    );
  };

  return (
    <SheetFrame
      layout={layout}
      title={title}
      artist={artist}
      displayKey={displayKey}
      capo={capo}
      instrument={instrument}
      diagramChords={diagramChords}
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
            {section.lines.map((line, li) => {
              if (line.blank) return <div key={li} className="h-2" />;
              if (line.chordsOnly) {
                return (
                  <ChordOnlyLine
                    key={li}
                    tokens={barTokens(line)}
                    align={layout.align}
                    barColor={presetMeta(layout)}
                    renderChord={(t) => renderChord(t.chord)}
                  />
                );
              }
              return (
                <div
                  key={li}
                  className="csm-line flex flex-wrap leading-[2.2]"
                  style={{ justifyContent: JUSTIFY[layout.align], breakInside: 'avoid' }}
                >
                  {slotsOf(line.plain, line.chords).map((slot, ti) => {
                    if (!slot.chord) return <span key={ti} style={roleStyle('lyrics')}>{slot.lyric}</span>;
                    return (
                      <span key={ti} className="relative inline-block pr-0.5">
                        <span className="absolute -top-[1.15em] left-0">{renderChord(slot.chord)}</span>
                        <span style={roleStyle('lyrics')}>{slot.lyric || '  '}</span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </SheetFrame>
  );
}
