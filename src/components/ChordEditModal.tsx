import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type Chord, ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, type RootNote, type Accidental, type ChordQuality } from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { Trash2, Copy } from 'lucide-react';

interface ChordEditModalProps {
  chord: Chord | null;
  open: boolean;
  onClose: () => void;
  onSave: (chord: Chord) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onPreview?: (chord: Partial<Chord>) => void;
}

export function ChordEditModal({ chord, open, onClose, onSave, onDelete, onDuplicate, onPreview }: ChordEditModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);

  const triggerPreview = (newRoot: RootNote, newAccidental: Accidental, newQuality: ChordQuality) => {
    onPreview?.({ root: newRoot, accidental: newAccidental, quality: newQuality });
  };

  const previewChord = useMemo<Chord>(() => ({
    id: 'modal-preview', root, accidental, quality, duration,
  }), [root, accidental, quality, duration]);

  const activeNotes = useMemo(() => getChordNotes(previewChord), [previewChord]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord, 0), [previewChord]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, 0), [previewChord]);

  // Sync state when chord changes or modal opens
  useEffect(() => {
    if (chord && open) {
      setRoot(chord.root);
      setAccidental(chord.accidental);
      setQuality(chord.quality);
      setDuration(chord.duration);
    }
  }, [chord, open]);

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
      <DialogContent className="sm:max-w-lg bg-card border-border">
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
                  type="button"
                  onClick={() => {
                    setRoot(note);
                    triggerPreview(note, accidental, quality);
                  }}
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
                  type="button"
                  onClick={() => {
                    setAccidental(acc);
                    triggerPreview(root, acc, quality);
                  }}
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
                  type="button"
                  onClick={() => {
                    setQuality(q);
                    triggerPreview(root, accidental, q);
                  }}
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            {onDelete && (
              <Button 
                type="button" 
                variant="destructive" 
                size="icon"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                title="Delete chord"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {onDuplicate && (
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={() => {
                  onDuplicate();
                  onClose();
                }}
                title="Duplicate chord"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button type="button" onClick={handleSave} className="flex-1 sm:flex-none">Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
