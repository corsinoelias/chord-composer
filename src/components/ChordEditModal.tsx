import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type Chord, ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, QUALITY_LABELS, transposeNote, type RootNote, type Accidental, type ChordQuality } from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { Trash2, Copy } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { InKeyChordStrip } from '@/components/InKeyChordStrip';

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
  preferFlats?: boolean;
  /** Beats a brand-new chord starts with — one bar of the song's time signature. */
  defaultDuration?: number;
}

function parseBassNote(bn?: string): { root: RootNote | null; acc: Accidental } {
  if (!bn) return { root: null, acc: '' }
  const r = bn[0]?.toUpperCase() as RootNote
  if (!(ROOT_NOTES as readonly string[]).includes(r)) return { root: null, acc: '' }
  const acc: Accidental = bn[1] === '#' ? '#' : bn[1] === 'b' ? 'b' : ''
  return { root: r, acc }
}

export function ChordEditModal({ chord, open, onClose, onSave, onDelete, onDuplicate, onPreview, songKey, transposition = 0, preferFlats = false, defaultDuration = 4 }: ChordEditModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  const [bassRoot, setBassRoot] = useState<RootNote | null>(null);
  const [bassAccidental, setBassAccidental] = useState<Accidental>('');
  const [bassExpanded, setBassExpanded] = useState(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const triggerPreview = (newRoot: RootNote, newAccidental: Accidental, newQuality: ChordQuality, newBassNote?: string) => {
    onPreview?.({ root: newRoot, accidental: newAccidental, quality: newQuality, bassNote: newBassNote ?? bassNote });
  };

  // root/accidental/bassRoot/bassAccidental below hold the *transposed* (perceived)
  // pitch, not the raw stored value — see the sync effect and handleSave.
  const previewChord = useMemo<Chord>(() => ({
    id: 'modal-preview', root, accidental, quality, duration,
    bassNote: bassRoot ? `${bassRoot}${bassAccidental}` : undefined,
  }), [root, accidental, quality, duration, bassRoot, bassAccidental]);

  // The key decides the spelling, except that picking ♭ by hand is a spelling request too.
  const flatSpelling = preferFlats || accidental === 'b';

  const activeNotes = useMemo(() => getChordNotes(previewChord, 0, flatSpelling), [previewChord, flatSpelling]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord), [previewChord]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, 0, flatSpelling), [previewChord, flatSpelling]);

  // Sync state when chord changes or modal opens. The stored chord is always
  // untransposed, but a transposed song should show/preview/edit the note the
  // user actually hears — so we transpose into "display space" here and
  // transpose back out in handleSave.
  useEffect(() => {
    if (!open) return;
    if (chord) {
      const displayNote = transposeNote(chord.root, chord.accidental, transposition, chord.accidental === 'b');
      setRoot(displayNote.root);
      setAccidental(displayNote.accidental);
      setQuality(chord.quality);
      setDuration(chord.duration);
      const { root: br, acc: ba } = parseBassNote(chord.bassNote);
      if (br) {
        const displayBass = transposeNote(br, ba, transposition, ba === 'b');
        setBassRoot(displayBass.root);
        setBassAccidental(displayBass.accidental);
      } else {
        setBassRoot(null);
        setBassAccidental('');
      }
      setBassExpanded(br !== null);
    } else {
      setRoot('C');
      setAccidental('');
      setQuality('maj');
      setDuration(defaultDuration);
      setBassRoot(null);
      setBassAccidental('');
      setBassExpanded(false);
    }
  }, [chord, open, transposition, defaultDuration]);

  const bassNote = bassRoot ? `${bassRoot}${bassAccidental}` : undefined;

  const handleSave = () => {
    const rawNote = transposeNote(root, accidental, -transposition, accidental === 'b');
    let rawBassNote: string | undefined;
    if (bassRoot) {
      const rawBass = transposeNote(bassRoot, bassAccidental, -transposition, bassAccidental === 'b');
      rawBassNote = `${rawBass.root}${rawBass.accidental}`;
    }
    onSave({
      id: chord?.id ?? 'new',
      root: rawNote.root,
      accidental: rawNote.accidental,
      quality,
      duration,
      bassNote: rawBassNote,
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
          <InKeyChordStrip
            songKey={songKey}
            root={root}
            accidental={accidental}
            quality={quality}
            onPick={(newRoot, newAccidental, newQuality) => {
              setRoot(newRoot);
              setAccidental(newAccidental);
              setQuality(newQuality);
              triggerPreview(newRoot, newAccidental, newQuality);
            }}
          />

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
            {!bassExpanded ? (
              <button
                type="button"
                onClick={() => setBassExpanded(true)}
                className="w-full text-left text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-3 py-2 transition-colors"
              >
                + Add bass note (slash chord)
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">Bass Note</label>
                  {bassRoot === null && (
                    <button
                      type="button"
                      onClick={() => setBassExpanded(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Hide
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => { setBassRoot(null); setBassAccidental(''); onPreview?.({ root, accidental, quality, bassNote: undefined }); }}
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
                      onClick={() => { setBassRoot(note); onPreview?.({ root, accidental, quality, bassNote: `${note}${bassAccidental}` }); }}
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
                        onClick={() => { setBassAccidental(acc); onPreview?.({ root, accidental, quality, bassNote: bassRoot ? `${bassRoot}${acc}` : undefined }); }}
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
              </>
            )}
          </div>

          {/* Duration */}
          {(() => {
            const displayVal = hoverValue ?? duration;
            const formatDur = (d: number) => {
              const f = Math.floor(d), h = d % 1 >= 0.5;
              const num = f > 0 ? (h ? `${f}½` : `${f}`) : '½';
              return `${num} ${d === 1 ? 'beat' : 'beats'}`;
            };
            const getState = (n: number, val: number): 'full' | 'half' | 'empty' => {
              const f = Math.floor(val);
              if (n <= f) return 'full';
              if (n === f + 1 && val % 1 >= 0.5) return 'half';
              return 'empty';
            };
            return (
              <div>
                <label className="block text-xs text-muted-foreground mb-2">
                  Duration — <span className={`font-medium ${hoverValue !== null ? 'text-primary' : 'text-foreground'}`}>{formatDur(displayVal)}</span>
                </label>
                <div className="relative">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Array.from({ length: 8 }, (_, i) => {
                      const n = i + 1;
                      const state = getState(n, displayVal);
                      const isChange = hoverValue !== null && state !== getState(n, duration);
                      const colorClass = state === 'empty'
                        ? 'text-muted-foreground/30'
                        : isChange ? 'text-primary/50' : 'text-primary';
                      return (
                        <button
                          key={n}
                          type="button"
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const isLeft = e.clientX - rect.left < rect.width / 2;
                            setHoverValue(Math.max(isLeft ? n - 0.5 : n, 0.5));
                          }}
                          onMouseLeave={() => setHoverValue(null)}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const isLeft = e.clientX - rect.left < rect.width / 2;
                            setDuration(Math.max(isLeft ? n - 0.5 : n, 0.5));
                          }}
                          className="active:scale-95"
                        >
                          <svg width="22" height="22" viewBox="0 0 20 20" className={colorClass}>
                            {state === 'full' && <circle cx="10" cy="10" r="10" fill="currentColor" />}
                            {state === 'half' && <>
                              <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M10,1 A9,9 0 0,0 10,19 Z" fill="currentColor" />
                            </>}
                            {state === 'empty' && <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />}
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                  <Slider
                    className="mt-3"
                    value={[duration]}
                    min={0.5}
                    max={8}
                    step={0.5}
                    onValueChange={([val]) => setDuration(val)}
                  />
                </div>
              </div>
            );
          })()}

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
