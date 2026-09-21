import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, COMMON_CHORD_QUALITIES, QUALITY_LABELS, transposeNote, type RootNote, type Accidental, type ChordQuality, createChord, type Chord } from '@/lib/musicTheory';
import { InKeyChordStrip } from '@/components/InKeyChordStrip';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { playChordPreview as playPreviewFromEngine } from '@/lib/audioEngine';
import { Slider } from '@/components/ui/slider';


interface AddChordModalProps {
  open: boolean;
  sectionName: string;
  onClose: () => void;
  onAdd: (chord: Chord) => void;
  songKey?: string;
  transposition?: number;
  preferFlats?: boolean;
}

export function AddChordModal({ open, sectionName, onClose, onAdd, songKey, transposition = 0, preferFlats = false }: AddChordModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [showAllQualities, setShowAllQualities] = useState(false);
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  const [bassRoot, setBassRoot] = useState<RootNote | null>(null);
  const [bassAccidental, setBassAccidental] = useState<Accidental>('');
  const [bassExpanded, setBassExpanded] = useState(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  // Play a preview sound when chord changes - uses the same engine as ChordEditModal
  const playChordPreview = useCallback((r: RootNote, acc: Accidental, q: ChordQuality, bn?: string) => {
    const tempChord: Chord = { id: 'preview', root: r, accidental: acc, quality: q, duration: 2, bassNote: bn };
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

  // root/accidental/bassRoot/bassAccidental hold the *transposed* (perceived) pitch, the
  // note the picker shows and previews — same convention as ChordEditModal. Chords are
  // stored untransposed, so the offset comes back off here; without this, adding "C" to a
  // song transposed +2 stored a C that then sounded as D.
  const handleAdd = () => {
    const rawNote = transposeNote(root, accidental, -transposition, accidental === 'b');
    const newChord = createChord(rawNote.root, rawNote.accidental, quality, duration);
    let bassNote: string | undefined;
    if (bassRoot) {
      const rawBass = transposeNote(bassRoot, bassAccidental, -transposition, bassAccidental === 'b');
      bassNote = `${rawBass.root}${rawBass.accidental}`;
    }
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

  // The key decides the spelling, except that picking ♭ by hand is a spelling request too.
  const flatSpelling = preferFlats || accidental === 'b';

  const activeNotes = useMemo(() => getChordNotes(previewChord, 0, flatSpelling), [previewChord, flatSpelling]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord, 0), [previewChord]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, 0, flatSpelling), [previewChord, flatSpelling]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border p-0 gap-0 flex flex-col max-h-[92dvh] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="text-foreground pr-6">
            Add <span className="text-primary">{chordDisplayName}</span> to {sectionName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
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
              playChordPreview(newRoot, newAccidental, newQuality);
            }}
          />

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
              {(showAllQualities || !COMMON_CHORD_QUALITIES.includes(quality) ? CHORD_QUALITIES : COMMON_CHORD_QUALITIES).map(q => (
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
              <button
                type="button"
                onClick={() => setShowAllQualities(v => !v)}
                aria-expanded={showAllQualities}
                className="px-2 h-8 rounded-md text-xs border border-dashed border-primary/40 text-primary hover:bg-primary/5"
              >
                {showAllQualities ? 'Fewer' : `More qualities (${CHORD_QUALITIES.length - COMMON_CHORD_QUALITIES.length})`}
              </button>
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
                    onClick={() => { setBassRoot(null); setBassAccidental(''); playChordPreview(root, accidental, quality, undefined); }}
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
                      onClick={() => { setBassRoot(note); playChordPreview(root, accidental, quality, `${note}${bassAccidental}`); }}
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
                        onClick={() => { setBassAccidental(acc); playChordPreview(root, accidental, quality, bassRoot ? `${bassRoot}${acc}` : undefined); }}
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

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd}>Add Chord</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
