import { useMemo } from 'react';
import {
  parseDoc, parseSheet, slotsOf, barTokens, uniqueChords,
  transposeChord, transposeKey, isFlatKey, formatChordParts,
  type ChartNotation, type DocSlot, type BarToken,
} from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { type StyleLayout } from '@/lib/chordSheet/presets';
import type { DragState } from './useChordSheetDrag';
import { SheetFrame } from './SheetFrame';
import { makeRoleStyle, presetMeta, JUSTIFY } from './sheetChrome';
import { ChordOnlyLine } from './ChordOnlyLine';

// The editor's live preview — same paper chrome as the read-only SheetPaper (via
// SheetFrame), but every chord is a drag handle and every character position on a lyric
// line is a potential drop target. `data-csm-line` / `data-csm-chip` / `data-csm-anchor`
// attributes below are what chordHitTest.ts reads to resolve a pointer position to an exact
// character — the drag gesture itself lives one level up, in useChordSheetDrag (shared with
// the "IN KEY" palette), so this component only renders the hooks it needs.

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
  drag: DragState | null;
  selected: { src: number; ci: number } | null;
  onBeginDrag: (e: React.PointerEvent, src: number, ci: number, label: string) => void;
}

export function InteractiveSheet({ text, title, artist, baseKey, semi, capo, instrument, chartType, layout, drag, selected, onBeginDrag }: Props) {
  const sections = useMemo(() => parseDoc(text), [text]);
  const displayKey = useMemo(() => transposeKey(baseKey, semi), [baseKey, semi]);
  const flats = isFlatKey(displayKey);
  const roleStyle = makeRoleStyle(layout);

  const chordName = (raw: string) => transposeChord(raw, semi, flats);
  const diagramChords = useMemo(
    () => uniqueChords(parseSheet(text)).map((c) => transposeChord(c, semi, flats)),
    [text, semi, flats],
  );

  return (
    <SheetFrame
      layout={layout}
      title={title}
      artist={artist}
      displayKey={displayKey}
      capo={capo}
      instrument={instrument}
      diagramChords={diagramChords}
    >
      {sections.map((section, si) => (
        <div key={si} style={{ breakInside: 'avoid' }}>
          {section.name && (
            <div className="csm-sec-title mb-2 uppercase tracking-widest" style={{ ...roleStyle('section'), fontSize: '10px' }}>
              {section.name}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {section.lines.map((line) => {
              if (line.chordsOnly) {
                return (
                  <ChordOnlyLine
                    key={line.src}
                    lineIndex={line.src}
                    tokens={barTokens(line)}
                    align={layout.align}
                    barColor={presetMeta(layout)}
                    renderChord={(t) => (
                      <BarChordCell
                        token={t}
                        line={line.src}
                        displayKey={displayKey}
                        chartType={chartType}
                        chordName={chordName}
                        roleStyle={roleStyle}
                        drag={drag}
                        selected={selected}
                        onBeginDrag={onBeginDrag}
                      />
                    )}
                  />
                );
              }
              // A blank line still renders one empty slot (chordSheetCore's slotsOf always
              // returns at least one) so it stays a real drop target — a chord can start a
              // brand-new line, not just move between lines that already have one.
              return (
                <div
                  key={line.src}
                  data-csm-line={line.src}
                  className="csm-line flex flex-wrap leading-[2.2]"
                  style={{ justifyContent: JUSTIFY[layout.align], breakInside: 'avoid', minHeight: line.blank ? '0.9em' : undefined }}
                >
                  {slotsOf(line.plain, line.chords).map((slot, idx) => (
                    <Slot
                      key={idx}
                      slot={slot}
                      line={line.src}
                      displayKey={displayKey}
                      chartType={chartType}
                      chordName={chordName}
                      roleStyle={roleStyle}
                      drag={drag}
                      selected={selected}
                      onBeginDrag={onBeginDrag}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </SheetFrame>
  );
}

interface ChipVisualProps {
  drag: DragState | null;
  selected: { src: number; ci: number } | null;
  onBeginDrag: (e: React.PointerEvent, src: number, ci: number, label: string) => void;
}

interface SlotProps extends ChipVisualProps {
  slot: DocSlot;
  line: number;
  displayKey: string;
  chartType: ChartNotation;
  chordName: (raw: string) => string;
  roleStyle: (role: 'heading' | 'section' | 'chords' | 'lyrics') => React.CSSProperties;
}

function Slot({ slot, line, displayKey, chartType, chordName, roleStyle, drag, selected, onBeginDrag }: SlotProps) {
  const lyric = slot.lyric || '  ';
  const parts = slot.chord ? formatChordParts(chordName(slot.chord), displayKey, chartType) : null;
  const label = parts ? parts.main + parts.sup + parts.tail : '';
  const isDragged = !!drag && !drag.fresh && drag.src === line && drag.ci === slot.ci;
  const isSelected = !!selected && selected.src === line && selected.ci === slot.ci;

  return (
    <span className="relative inline-block whitespace-pre pr-0.5">
      {slot.chord && slot.ci >= 0 && parts && (
        <button
          type="button"
          data-csm-chip={`${line}:${slot.ci}`}
          data-csm-at={String(slot.at)}
          data-csm-ci={String(slot.ci)}
          onPointerDown={(e) => { e.preventDefault(); onBeginDrag(e, line, slot.ci, label); }}
          className={`absolute -top-[1.15em] left-0 cursor-grab whitespace-nowrap rounded px-0.5 hover:bg-primary/10 active:cursor-grabbing ${isSelected ? 'bg-primary/15 ring-2 ring-primary' : ''}`}
          style={{ ...roleStyle('chords'), touchAction: 'none', opacity: isDragged ? 0.3 : 1 }}
          aria-label={`Move chord ${label}`}
        >
          {parts.main}
          {parts.sup && <sup style={{ fontSize: '0.75em' }}>{parts.sup}</sup>}
          {parts.tail}
        </button>
      )}
      <span data-csm-anchor={`${line}:${slot.at}`} style={roleStyle('lyrics')}>{lyric}</span>
    </span>
  );
}

interface BarChordCellProps extends ChipVisualProps {
  token: Extract<BarToken, { kind: 'chord' }>;
  line: number;
  displayKey: string;
  chartType: ChartNotation;
  chordName: (raw: string) => string;
  roleStyle: SlotProps['roleStyle'];
}

/** One chord on a chord-only line: an in-flow drag handle (unlike Slot's chip, which floats
 *  above a lyric). */
function BarChordCell({ token, line, displayKey, chartType, chordName, roleStyle, drag, selected, onBeginDrag }: BarChordCellProps) {
  const parts = formatChordParts(chordName(token.chord), displayKey, chartType);
  const label = parts.main + parts.sup + parts.tail;
  const isDragged = !!drag && !drag.fresh && drag.src === line && drag.ci === token.ci;
  const isSelected = !!selected && selected.src === line && selected.ci === token.ci;

  return (
    <button
      type="button"
      data-csm-chip={`${line}:${token.ci}`}
      data-csm-at={String(token.at)}
      data-csm-ci={String(token.ci)}
      onPointerDown={(e) => { e.preventDefault(); onBeginDrag(e, line, token.ci, label); }}
      className={`cursor-grab whitespace-nowrap rounded px-1 hover:bg-primary/10 active:cursor-grabbing ${isSelected ? 'bg-primary/15 ring-2 ring-primary' : ''}`}
      style={{ ...roleStyle('chords'), touchAction: 'none', opacity: isDragged ? 0.3 : 1 }}
      aria-label={`Move chord ${label}`}
    >
      {parts.main}
      {parts.sup && <sup style={{ fontSize: '0.75em' }}>{parts.sup}</sup>}
      {parts.tail}
    </button>
  );
}
