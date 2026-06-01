import { useState } from 'react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';

interface Props {
  chord: string; // e.g. "Am7"
}

type View = 'piano' | 'guitar';

export default function ChordTooltip({ chord }: Props) {
  const [view, setView] = useState<View>('piano');

  const parsed = parseChordString(chord);
  const chordObj = parsed[0] ?? null;

  const notes = chordObj ? getChordNotes(chordObj) : [];
  const voicing = chordObj ? getGuitarVoicing(chordObj) : null;

  if (!chordObj || notes.length === 0) return null;

  return (
    <div className="w-56 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-bold text-foreground font-mono">{chord}</span>
        <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
          {(['piano', 'guitar'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-2 py-0.5 rounded-md transition-all capitalize
                ${view === v
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {v === 'piano' ? '🎹' : '🎸'}
            </button>
          ))}
        </div>
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
