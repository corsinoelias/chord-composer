import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Chord, ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, RootNote, Accidental, ChordQuality } from '@/lib/musicTheory';

interface ChordEditModalProps {
  chord: Chord | null;
  open: boolean;
  onClose: () => void;
  onSave: (chord: Chord) => void;
}

export function ChordEditModal({ chord, open, onClose, onSave }: ChordEditModalProps) {
  const [root, setRoot] = useState<RootNote>(chord?.root || 'C');
  const [accidental, setAccidental] = useState<Accidental>(chord?.accidental || '');
  const [quality, setQuality] = useState<ChordQuality>(chord?.quality || 'maj');
  const [duration, setDuration] = useState(chord?.duration || 2);

  // Sync state when chord changes
  if (chord && (chord.root !== root || chord.accidental !== accidental || chord.quality !== quality || chord.duration !== duration)) {
    setRoot(chord.root);
    setAccidental(chord.accidental);
    setQuality(chord.quality);
    setDuration(chord.duration);
  }

  const handleSave = () => {
    if (!chord) return;
    onSave({
      ...chord,
      root,
      accidental,
      quality,
      duration,
    });
    onClose();
  };

  const accidentalLabels: Record<Accidental, string> = {
    '': '♮',
    '#': '♯',
    'b': '♭',
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Chord</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Root Note */}
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

          {/* Accidental */}
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

          {/* Quality */}
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

          {/* Duration */}
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
