import { useState } from 'react';
import { ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, RootNote, Accidental, ChordQuality, createChord, Chord } from '@/lib/musicTheory';
import { Plus } from 'lucide-react';

interface ChordSelectorProps {
  onAddChord: (chord: Chord) => void;
}

/**
 * ChordSelector Component
 * 
 * A panel for selecting and adding new chords to the progression.
 * Allows selection of root note, accidental, chord quality, and duration.
 */
export function ChordSelector({ onAddChord }: ChordSelectorProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  
  const handleAdd = () => {
    const newChord = createChord(root, accidental, quality, duration);
    onAddChord(newChord);
  };

  const accidentalLabels: Record<Accidental, string> = {
    '': '♮',
    '#': '♯',
    'b': '♭',
  };

  const getChordName = () => {
    const accDisplay = accidental === '#' ? '♯' : accidental === 'b' ? '♭' : '';
    return `${root}${accDisplay}${quality}`;
  };
  
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wide">
        Add Chord
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Root Note Selection */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Root Note</label>
          <div className="flex flex-wrap gap-1">
            {ROOT_NOTES.map(note => (
              <button
                key={note}
                onClick={() => setRoot(note)}
                className={`
                  w-9 h-9 rounded-md font-mono font-medium text-sm
                  transition-all duration-150
                  ${root === note 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }
                `}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Accidental Selection */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Accidental</label>
          <div className="flex gap-1">
            {ACCIDENTALS.map(acc => (
              <button
                key={acc || 'natural'}
                onClick={() => setAccidental(acc)}
                className={`
                  w-12 h-9 rounded-md font-mono font-medium text-sm
                  transition-all duration-150
                  ${accidental === acc 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }
                `}
              >
                {accidentalLabels[acc]}
              </button>
            ))}
          </div>
        </div>
        
        {/* Chord Quality Selection */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Quality</label>
          <div className="flex flex-wrap gap-1">
            {CHORD_QUALITIES.map(q => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`
                  px-2 h-8 rounded-md font-mono text-xs
                  transition-all duration-150
                  ${quality === q 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }
                `}
              >
                {QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
        </div>
        
        {/* Duration Selection */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">
            Duration: {duration} {duration === 1 ? 'beat' : 'beats'}
          </label>
          <input
            type="range"
            min={1}
            max={8}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span>
            <span>8</span>
          </div>
        </div>
      </div>
      
      {/* Add Button */}
      <button
        onClick={handleAdd}
        className="
          w-full py-3 rounded-lg
          bg-primary text-primary-foreground
          font-medium text-sm
          flex items-center justify-center gap-2
          hover:opacity-90 transition-opacity
          shadow-sm
        "
      >
        <Plus size={18} />
        Add {getChordName()}
      </button>
    </div>
  );
}
