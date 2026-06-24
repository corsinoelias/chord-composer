import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, type RootNote, type Accidental, type ChordQuality, createChord, type Chord } from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { playChordPreview as playPreviewFromEngine } from '@/lib/audioEngine';


interface AddChordModalProps {
  open: boolean;
  sectionName: string;
  onClose: () => void;
  onAdd: (chord: Chord) => void;
}

export function AddChordModal({ open, sectionName, onClose, onAdd }: AddChordModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  const [bassRoot, setBassRoot] = useState<RootNote | null>(null);
  const [bassAccidental, setBassAccidental] = useState<Accidental>('');

  // Play a preview sound when chord changes - uses the same engine as ChordEditModal
  const playChordPreview = useCallback((r: RootNote, acc: Accidental, q: ChordQuality) => {
    const tempChord: Chord = { id: 'preview', root: r, accidental: acc, quality: q, duration: 2 };
    playPreviewFromEngine(tempChord);
  }, []);

  const handleRootChange = (note: RootNote) => {
    setRoot(note);
    playChordPreview(note, accidental, quality);
  };

  const handleAccidentalChange = (acc: Accidental) => {
    setAccidental(acc);
    playChordPreview(root, acc, quality);
  };

  const handleQualityChange = (q: ChordQuality) => {
    setQuality(q);
    playChordPreview(root, accidental, q);
  };

  const handleAdd = () => {
    const newChord = createChord(root, accidental, quality, duration);
    const bassNote = bassRoot ? `${bassRoot}${bassAccidental}` : undefined;
    onAdd({ ...newChord, bassNote });
    onClose();
  };

  const accidentalLabels: Record<Accidental, string> = {
    '': '♮',
    '#': '♯',
    'b': '♭',
  };

  const previewChord = useMemo<Chord>(() => ({
    id: 'modal-preview', root, accidental, quality, duration,
    bassNote: bassRoot ? `${bassRoot}${bassAccidental}` : undefined,
  }), [root, accidental, quality, duration, bassRoot, bassAccidental]);

  const activeNotes = useMemo(() => getChordNotes(previewChord), [previewChord]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord, 0), [previewChord]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, 0), [previewChord]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Add Chord to {sectionName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Root Note */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Root Note</label>
            <div className="flex flex-wrap gap-1">
              {ROOT_NOTES.map(note => (
                <button
                  key={note}
                  onClick={() => handleRootChange(note)}
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
                  onClick={() => handleAccidentalChange(acc)}
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
                  onClick={() => handleQualityChange(q)}
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

          {/* Bass Note (slash chord) */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Bass Note</label>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { setBassRoot(null); setBassAccidental(''); }}
                className={`px-2.5 h-9 rounded-md font-mono text-xs transition-all duration-150 ${
                  bassRoot === null
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                }`}
              >
                Default
              </button>
              {ROOT_NOTES.map(note => (
                <button
                  key={note}
                  type="button"
                  onClick={() => setBassRoot(note)}
                  className={`w-9 h-9 rounded-md font-mono font-medium text-sm transition-all duration-150 ${
                    bassRoot === note
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                >
                  {note}
                </button>
              ))}
            </div>
            {bassRoot !== null && (
              <div className="flex gap-1 mt-1.5">
                {ACCIDENTALS.map(acc => (
                  <button
                    key={acc || 'natural'}
                    type="button"
                    onClick={() => setBassAccidental(acc)}
                    className={`w-12 h-9 rounded-md font-mono font-medium text-sm transition-all duration-150 ${
                      bassAccidental === acc
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary text-secondary-foreground hover:bg-accent'
                    }`}
                  >
                    {accidentalLabels[acc]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Duration: {duration === 0.5 ? '½' : duration % 1 === 0.5 ? `${Math.floor(duration)}½` : duration} {duration === 1 ? 'beat' : 'beats'}
            </label>
            <input
              type="range"
              min={0.5}
              max={8}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>½</span>
              <span>8</span>
            </div>
          </div>

          {/* Chord visualization */}
          <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {guitarVoicing && (
                <GuitarChordDiagram
                  voicing={guitarVoicing}
                  chordName={chordDisplayName}
                  className="w-24 sm:w-28 flex-shrink-0"
                />
              )}
              <PianoKeyboard
                activeNotes={activeNotes}
                chordName={guitarVoicing ? undefined : chordDisplayName}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd}>Add Chord</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
