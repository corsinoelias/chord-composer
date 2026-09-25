import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';
import { FretDiagram, PianoDiagram } from '@/components/SongChordDiagram';
import { useSyncedChordView } from '@/hooks/useSyncedChordView';
import { displayChord, type SongNotation } from '@/lib/songNotation';

interface Props {
  chord: string; // e.g. "Am7" — always the real name; everything below derives from it
  notation?: SongNotation;
  displayKey?: string;
}

export default function ChordTooltip({ chord, notation = 'standard', displayKey = 'C' }: Props) {
  // No instrument toggle here on purpose — at w-56 there's barely room for the diagram itself,
  // let alone a three-way switch. Instead this just follows whatever's already selected in
  // "Chords used" / the song's chord preview, via the same cross-island synced view.
  const [view] = useSyncedChordView('guitar');

  const parsed = parseChordString(chord);
  const chordObj = parsed[0] ?? null;

  const notes = chordObj ? getChordNotes(chordObj) : [];
  const voicing = chordObj ? getGuitarVoicing(chordObj) : null;
  const ukuleleVoicing = chordObj ? getUkuleleVoicing(chordObj) : null;

  if (!chordObj || notes.length === 0) return null;

  // Laid out as the V4 prototype's chord pop-up: the name large on the left (with the real chord
  // under a number, or the hint that a click plays it), the diagram on the right. Tapping the chord
  // name in the chart is what plays it, so the pop-up needs no button of its own.
  const diagram = view === 'piano'
    ? <PianoDiagram notes={notes} width={124} />
    : view === 'ukulele'
      ? (ukuleleVoicing ? <FretDiagram voicing={ukuleleVoicing} width={72} /> : <p className="text-xs text-muted-foreground py-4">No ukulele voicing</p>)
      : (voicing ? <FretDiagram voicing={voicing} width={72} /> : <p className="text-xs text-muted-foreground py-4">No guitar voicing</p>);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xl text-foreground">
      <div className="min-w-[3.5rem]">
        <div className="text-[22px] font-extrabold leading-none text-primary">{displayChord(chord, displayKey, notation)}</div>
        <small className="block mt-1 text-[11.5px] font-medium text-muted-foreground">
          {notation === 'number' || notation === 'roman' ? chord : 'Click to hear'}
        </small>
      </div>
      {diagram}
    </div>
  );
}
