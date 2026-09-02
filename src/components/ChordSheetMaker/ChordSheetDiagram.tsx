import { memo, useState } from 'react';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';
import { getChordDiagrams, type DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { playChord } from '@/lib/chordSheet/chordSheetCore';

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
        className="cursor-pointer rounded transition-transform hover:scale-105 active:scale-95"
      >
        <PianoChordDiagram chordName={chordName} className={className} />
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
      className="relative cursor-pointer rounded transition-transform hover:scale-105 active:scale-95"
    >
      <GuitarChordDiagram voicing={voicing} chordName={chordName} className={className} />
      {voicings.length > 1 && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
          {voicings.length}
        </span>
      )}
    </button>
  );
});
