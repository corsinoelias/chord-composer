import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { useSyncedChordView } from '@/hooks/useSyncedChordView';
import { playChordPreview } from '@/lib/audioEngine';
import { Play } from 'lucide-react';
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

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (chordObj) playChordPreview(chordObj);
  }

  return (
    <div className="w-56 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-sm font-bold text-foreground font-mono">
          {displayChord(chord, displayKey, notation)}
        </span>
        {/* Numbers only — the translation back to the sounding chord is what makes a number
            chart learnable. Solfège needs no gloss: "Sol♯m" and "G#m" are the same name in two
            alphabets, so showing both just reads as a contradiction. */}
        {notation === 'number' && (
          <span className="text-[11px] font-medium text-muted-foreground font-mono">{chord}</span>
        )}
        <button
          onClick={handlePlay}
          title="Play chord"
          className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Play className="w-3 h-3 fill-primary" />
        </button>
      </div>

      {/* Notes */}
      <div className="flex gap-1 px-3 pt-2">
        {notes.map(n => (
          <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
            {n}
          </span>
        ))}
      </div>

      {/* Visualization */}
      <div className="p-3">
        {view === 'piano' ? (
          <PianoKeyboard activeNotes={notes} className="w-full" />
        ) : view === 'ukulele' ? (
          ukuleleVoicing ? (
            <GuitarChordDiagram voicing={ukuleleVoicing} className="w-full" />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No ukulele voicing available
            </p>
          )
        ) : voicing ? (
          <GuitarChordDiagram voicing={voicing} className="w-full" />
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No guitar voicing available
          </p>
        )}
      </div>
    </div>
  );
}
