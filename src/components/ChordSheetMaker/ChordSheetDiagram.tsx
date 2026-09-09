import { memo, useState } from 'react';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { getChordDiagrams, type DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { chordNoteNames, playChord } from '@/lib/chordSheet/chordSheetCore';

interface Props {
  chordName: string;
  instrument: DiagramInstrument | 'piano';
  className?: string;
}

/** Picks the right diagram renderer for the sheet's instrument and makes it interactive:
 *  a click plays the chord (playChord, the same oscillator preview the "IN KEY" palette
 *  uses); on guitar/ukulele, where the curated database usually holds several real
 *  fingerings for one chord, a click also cycles to the next one — so a player who doesn't
 *  like the diagram's default shape can tap through alternates instead of being stuck with
 *  it. Renders nothing (rather than a placeholder) when a chord has no known voicing at
 *  all — same "no cross-quality fallback" rule PrintChordSheet.astro follows, so a chart
 *  never shows a wrong shape. */
export const ChordSheetDiagram = memo(function ChordSheetDiagram({ chordName, instrument, className }: Props) {
  const [index, setIndex] = useState(0);

  if (instrument === 'piano') {
    return (
      <button
        type="button"
        onClick={() => playChord(chordName)}
        title={`Play ${chordName}`}
        className="w-full cursor-pointer rounded transition-transform hover:scale-105 active:scale-95"
      >
        {/* The same two-octave keyboard the song pages draw (ChordAside, ChordTooltip),
            not a private one-octave strip — a C/E on a single octave has nowhere to put
            the bass note, and two different pictures of "the piano shape for this chord"
            across one site is a bug in itself. */}
        <PianoKeyboard activeNotes={chordNoteNames(chordName)} className={className} />
      </button>
    );
  }

  const voicings = getChordDiagrams(chordName, instrument);
  if (!voicings.length) return null;
  const voicing = voicings[index % voicings.length];

  return (
    <button
      type="button"
      onClick={() => {
        playChord(chordName);
        if (voicings.length > 1) setIndex((i) => (i + 1) % voicings.length);
      }}
      title={voicings.length > 1 ? `Play ${chordName} — click for another fingering (${(index % voicings.length) + 1}/${voicings.length})` : `Play ${chordName}`}
      className="group relative w-full cursor-pointer rounded transition-transform hover:scale-105 active:scale-95"
    >
      {/* chordName is deliberately NOT passed: GuitarChordDiagram would render its own
          hard-coded `text-foreground` label, and the callers (SheetFrame, PaginatedPaper)
          already print the name in the sheet's own preset font and colour. Passing both
          printed it twice. Piano has no built-in label either, so leaving the caption to
          the caller keeps all three instruments consistent. */}
      <GuitarChordDiagram voicing={voicing} className={className} />
      {/* How many alternate fingerings this chord has — a control, not musical data. It
          used to render as a bare number in a filled badge, which at this size reads like
          a fret number or a scale degree sitting on the chord. Now it says what it counts,
          only shows on hover, and carries `no-print`: it's an editor affordance, and it
          was previously printing onto the sheet. */}
      {voicings.length > 1 && (
        <span className="no-print pointer-events-none absolute -right-1 -top-1 rounded-full border border-border bg-card px-1 py-px text-[8px] font-semibold leading-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {voicings.length} shapes
        </span>
      )}
    </button>
  );
});
