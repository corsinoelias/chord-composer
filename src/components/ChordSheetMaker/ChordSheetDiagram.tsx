import { memo } from 'react';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';
import { getChordDiagram, type DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';

interface Props {
  chordName: string;
  instrument: DiagramInstrument | 'piano';
  className?: string;
}

/** Picks the right diagram renderer for the sheet's instrument. Renders nothing (rather
 *  than a placeholder) when a chord has no known voicing — same "no cross-quality
 *  fallback" rule PrintChordSheet.astro follows, so a chart never shows a wrong shape. */
export const ChordSheetDiagram = memo(function ChordSheetDiagram({ chordName, instrument, className }: Props) {
  if (instrument === 'piano') {
    return <PianoChordDiagram chordName={chordName} className={className} />;
  }
  const voicing = getChordDiagram(chordName, instrument);
  if (!voicing) return null;
  return <GuitarChordDiagram voicing={voicing} chordName={chordName} className={className} />;
});
