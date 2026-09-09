import { ChordSheetDiagram } from './ChordSheetDiagram';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import type { StyleLayout } from '@/lib/chordSheet/presets';
import { formatChord, type ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import { makeRoleStyle, presetRule, presetMeta } from './sheetChrome';

// The chart's chord-diagram block, shared by SheetFrame (the single-page preview) and
// PaginatedPaper (the paginated one) so the two can't drift apart.
//
// Modelled on the "Chords used" panel on a song page (src/components/ChordAside.tsx): a
// labelled, counted block rather than an unbounded field of diagrams. That matters more
// here than it does there — a chart seeded from the Songs catalogue routinely has 10-12
// distinct chords, and at the old size the block filled the whole viewport before a
// single lyric line appeared.
//
// One deliberate difference from ChordAside: that panel scrolls horizontally, this one
// wraps. A sheet is meant to be printed, and anything parked off-screen in a scroll
// container never reaches the paper.

interface Props {
  layout: StyleLayout;
  instrument: DiagramInstrument | 'piano';
  /** Already transposed to the sounding key. */
  chords: string[];
  /** For the captions only — the diagram itself is always looked up by the real chord
   *  name, since a fretboard shape has no Nashville-number equivalent. */
  chartType: ChartNotation;
  displayKey: string;
}

export function DiagramStrip({ layout, instrument, chords, chartType, displayKey }: Props) {
  if (!chords.length) return null;
  const roleStyle = makeRoleStyle(layout);
  const cellW = instrument === 'piano' ? 160 : 60;

  return (
    <div className="mb-6 border-b pb-4" style={{ borderColor: presetRule(layout) }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: presetMeta(layout) }}
        >
          Chords used
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: presetMeta(layout) }}>
          {chords.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2.5">
        {chords.map((c) => (
          // Fixed cell width, not a height cap: each diagram SVG is width:100% with its own
          // aspect ratio, so constraining the height left the cell sizing itself from
          // indeterminate content — which is why the strip packed two-per-row across a
          // half-empty page. The width differs by instrument because the shapes do: a
          // fretboard is roughly square (235x271), a two-octave keyboard is a 5:1 ribbon,
          // so an identical cell would render the piano as an unreadable sliver.
          <div key={c} className="flex flex-col items-center gap-0.5" style={{ width: cellW }}>
            {/* Caption follows the chart's notation, the way the song pages' "Chords used"
                strip does (ChordAside.tsx) — otherwise a Nashville chart reads "4maj7" in
                the body and "Dmaj7" over the same diagram two inches above. */}
            <span style={{ ...roleStyle('chords'), fontSize: '12px', lineHeight: 1.2 }}>
              {formatChord(c, displayKey, chartType)}
            </span>
            <ChordSheetDiagram chordName={c} instrument={instrument} className="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
