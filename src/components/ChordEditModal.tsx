import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type Chord, ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, type RootNote, type Accidental, type ChordQuality } from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { Trash2, Copy } from 'lucide-react';
import { getDiatonicChords } from '@/lib/musicKeys';

// Parse simple diatonic chord strings ("Am", "Bdim", "F#") into component parts
function parseDiatonic(str: string): { root: RootNote; acc: Accidental; qual: ChordQuality } | null {
  const m = str.match(/^([A-G])([#b]?)(m|dim)?$/);
  if (!m) return null;
  const qual: ChordQuality = m[3] === 'dim' ? 'dim' : m[3] === 'm' ? 'min' : 'maj';
  return { root: m[1] as RootNote, acc: (m[2] ?? '') as Accidental, qual };
}

interface ChordEditModalProps {
  chord: Chord | null;
  open: boolean;
  onClose: () => void;
  onSave: (chord: Chord) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onPreview?: (chord: Partial<Chord>) => void;
  songKey?: string;
  transposition?: number;
}

function parseBassNote(bn?: string): { root: RootNote | null; acc: Accidental } {
  if (!bn) return { root: null, acc: '' }
  const r = bn[0]?.toUpperCase() as RootNote
  if (!(ROOT_NOTES as readonly string[]).includes(r)) return { root: null, acc: '' }
  const acc: Accidental = bn[1] === '#' ? '#' : bn[1] === 'b' ? 'b' : ''
  return { root: r, acc }
}

export function ChordEditModal({ chord, open, onClose, onSave, onDelete, onDuplicate, onPreview, songKey, transposition = 0 }: ChordEditModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  const [bassRoot, setBassRoot] = useState<RootNote | null>(null);
  const [bassAccidental, setBassAccidental] = useState<Accidental>('');

  const diatonicChords = useMemo(
    () => songKey ? getDiatonicChords(songKey) : [],
    [songKey]
  );

  const triggerPreview = (newRoot: RootNote, newAccidental: Accidental, newQuality: ChordQuality) => {
    onPreview?.({ root: newRoot, accidental: newAccidental, quality: newQuality });
  };

  const previewChord = useMemo<Chord>(() => ({
    id: 'modal-preview', root, accidental, quality, duration,
    bassNote: bassRoot ? `${bassRoot}${bassAccidental}` : undefined,
  }), [root, accidental, quality, duration, bassRoot, bassAccidental]);

  const activeNotes = useMemo(() => getChordNotes(previewChord, transposition), [previewChord, transposition]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord, transposition), [previewChord, transposition]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, transposition), [previewChord, transposition]);

  // Sync state when chord changes or modal opens
  useEffect(() => {
    if (!open) return;
    if (chord) {
      setRoot(chord.root);
      setAccidental(chord.accidental);
      setQuality(chord.quality);
      setDuration(chord.duration);
      const { root: br, acc: ba } = parseBassNote(chord.bassNote);
      setBassRoot(br);
      setBassAccidental(ba);
    } else {
      setRoot('C');
      setAccidental('');
      setQuality('maj');
      setDuration(4);
      setBassRoot(null);
      setBassAccidental('');
    }
  }, [chord, open]);

  const bassNote = bassRoot ? `${bassRoot}${bassAccidental}` : undefined;

  const handleSave = () => {
    onSave({
      id: chord?.id ?? 'new',
      root,
      accidental,
      quality,
      duration,
      bassNote,
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
      <DialogContent className="sm:max-w-lg bg-card border-border flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground">{chordDisplayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
          {/* In-key quick-pick */}
          {diatonicChords.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <label className="block text-[11px] font-semibold text-primary/70 uppercase tracking-widest mb-2">
                In key of {songKey}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {diatonicChords.map(c => {
                  const parsed = parseDiatonic(c);
                  if (!parsed) return null;
                  const isActive = root === parsed.root && accidental === parsed.acc && quality === parsed.qual;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setRoot(parsed.root);
                        setAccidental(parsed.acc);
                        setQuality(parsed.qual);
                        triggerPreview(parsed.root, parsed.acc, parsed.qual);
                      }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all
                        ${isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary'
                        }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  onClick={() => { setBassRoot(note); }}
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

        <DialogFooter className="flex-col sm:flex-row gap-2 shrink-0">
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
