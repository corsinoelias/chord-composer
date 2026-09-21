import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { type Chord, ROOT_NOTES, ACCIDENTALS, CHORD_QUALITIES, COMMON_CHORD_QUALITIES, QUALITY_LABELS, transposeNote, type RootNote, type Accidental, type ChordQuality } from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { Trash2, Copy, Plus, X } from 'lucide-react';
// The chord player's tokens and primitives. Imported here, not only by the player page,
// because the song creator opens this same dialog.
import '@/styles/chord-player.css';
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
  const [showAllQualities, setShowAllQualities] = useState(false);

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
    // An uncommon quality already in use must be visible, so the list opens for it.
    setShowAllQualities(!!chord && !COMMON_CHORD_QUALITIES.includes(chord.quality));
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

  const beatsState = (n: number, val: number): 'full' | 'half' | 'empty' => {
    const f = Math.floor(val);
    if (n <= f) return 'full';
    if (n === f + 1 && val % 1 >= 0.5) return 'half';
    return 'empty';
  };
  const formatDur = (d: number) => {
    const f = Math.floor(d), h = d % 1 >= 0.5;
    const num = f > 0 ? (h ? `${f}½` : `${f}`) : '½';
    return `${num} ${d === 1 ? 'beat' : 'beats'}`;
  };
  const shownDuration = hoverValue ?? duration;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="cp-dlg flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[880px] flex-col gap-0 rounded-[20px] p-0 sm:rounded-[20px]">
        {/* Header band */}
        <div className="cp-dlg-head">
          <div className="flex items-baseline gap-3">
            <span className="cp-lbl">{chord ? 'Edit chord' : 'New chord'}</span>
            <DialogTitle className="cp-mono m-0 text-2xl font-bold" style={{ color: 'var(--cp-tx)' }}>
              {chordDisplayName}
            </DialogTitle>
          </div>
          <button className="cp-btn cp-ib cp-gh" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_300px] md:overflow-hidden">
          <div className="flex flex-col gap-[22px] px-[18px] py-[22px] md:overflow-y-auto md:px-7">
            <InKeyChordStrip
              songKey={songKey}
              root={root}
              accidental={accidental}
              quality={quality}
              variant="player"
              onPick={(newRoot, newAccidental, newQuality) => {
                setRoot(newRoot);
                setAccidental(newAccidental);
                setQuality(newQuality);
                triggerPreview(newRoot, newAccidental, newQuality);
              }}
            />

            <div className="flex flex-wrap gap-x-7 gap-y-5">
              <div className="flex flex-col gap-2.5">
                <span className="cp-lbl">Root note</span>
                <div className="flex flex-wrap gap-1.5">
                  {ROOT_NOTES.map(note => (
                    <button
                      key={note}
                      type="button"
                      className={`cp-key ${root === note ? 'cp-on' : ''}`}
                      aria-pressed={root === note}
                      onClick={() => { setRoot(note); triggerPreview(note, accidental, quality); }}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="cp-lbl">Accidental</span>
                <div className="flex gap-1.5">
                  {ACCIDENTALS.map(acc => (
                    <button
                      key={acc || 'natural'}
                      type="button"
                      className={`cp-key ${accidental === acc ? 'cp-on' : ''}`}
                      aria-pressed={accidental === acc}
                      aria-label={acc === '#' ? 'Sharp' : acc === 'b' ? 'Flat' : 'Natural'}
                      style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18 }}
                      onClick={() => { setAccidental(acc); triggerPreview(root, acc, quality); }}
                    >
                      {accidentalLabels[acc]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="cp-lbl">Quality</span>
              <div className="flex flex-wrap gap-1.5">
                {(showAllQualities ? CHORD_QUALITIES : COMMON_CHORD_QUALITIES).map(q => (
                  <button
                    key={q}
                    type="button"
                    className={`cp-chip ${quality === q ? 'cp-on' : ''}`}
                    aria-pressed={quality === q}
                    onClick={() => { setQuality(q); triggerPreview(root, accidental, q); }}
                  >
                    {QUALITY_LABELS[q]}
                  </button>
                ))}
                <button
                  type="button"
                  className="cp-chip"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--cp-act)', borderStyle: 'dashed' }}
                  onClick={() => setShowAllQualities(v => !v)}
                  aria-expanded={showAllQualities}
                >
                  {showAllQualities ? 'Fewer' : `More qualities (${CHORD_QUALITIES.length - COMMON_CHORD_QUALITIES.length})`}
                </button>
              </div>
            </div>

            {/* Bass note (slash chord) */}
            {!bassExpanded ? (
              <button
                type="button"
                className="cp-btn w-full justify-start"
                style={{ border: '1.5px dashed var(--cp-ln2)', color: 'var(--cp-tx2)', fontWeight: 500 }}
                onClick={() => setBassExpanded(true)}
              >
                <Plus size={16} />
                Add bass note (slash chord)
              </button>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="cp-lbl">Bass note</span>
                  {bassRoot === null && (
                    <button
                      type="button"
                      className="cp-btn cp-gh"
                      style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      onClick={() => setBassExpanded(false)}
                    >
                      Hide
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`cp-chip ${bassRoot === null ? 'cp-on' : ''}`}
                    style={{ height: 44 }}
                    onClick={() => { setBassRoot(null); setBassAccidental(''); onPreview?.({ root, accidental, quality, bassNote: undefined }); }}
                  >
                    Default
                  </button>
                  {ROOT_NOTES.map(note => (
                    <button
                      key={note}
                      type="button"
                      className={`cp-key ${bassRoot === note ? 'cp-on' : ''}`}
                      onClick={() => { setBassRoot(note); onPreview?.({ root, accidental, quality, bassNote: `${note}${bassAccidental}` }); }}
                    >
                      {note}
                    </button>
                  ))}
                </div>
                {bassRoot !== null && (
                  <div className="flex gap-1.5">
                    {ACCIDENTALS.map(acc => (
                      <button
                        key={acc || 'natural'}
                        type="button"
                        className={`cp-key ${bassAccidental === acc ? 'cp-on' : ''}`}
                        onClick={() => { setBassAccidental(acc); onPreview?.({ root, accidental, quality, bassNote: bassRoot ? `${bassRoot}${acc}` : undefined }); }}
                      >
                        {accidentalLabels[acc]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duration: the left half of a beat sets a half-beat */}
            <div className="flex flex-col gap-3">
              <span className="cp-lbl">
                Duration
                <span
                  className="ml-1.5 text-xs normal-case tracking-normal"
                  style={{ color: hoverValue !== null ? 'var(--cp-act)' : 'var(--cp-tx)' }}
                >
                  {formatDur(shownDuration)}
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }, (_, i) => {
                  const n = i + 1;
                  const state = beatsState(n, shownDuration);
                  const preview = hoverValue !== null && state !== beatsState(n, duration);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} beat${n === 1 ? '' : 's'}`}
                      className={`cp-beat ${state === 'full' ? 'cp-f' : state === 'half' ? 'cp-h' : ''} ${preview ? 'cp-p' : ''}`}
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
                    />
                  );
                })}
              </div>
              <input
                className="cp-rg w-full"
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                aria-label="Duration in beats"
                style={{ ['--cp-p' as string]: `${((duration - 0.5) / 7.5) * 100}%` }}
              />
            </div>
          </div>

          {/* Preview rail */}
          <aside
            className="flex flex-col gap-[18px] px-[18px] py-[22px] md:overflow-y-auto"
            style={{ background: 'var(--cp-s2)', borderLeft: '1px solid var(--cp-ln)' }}
          >
            <span className="cp-lbl">Preview</span>
            <span className="cp-mono text-center text-[44px] font-bold leading-none tracking-tight">
              {chordDisplayName}
            </span>
            {guitarVoicing && (
              <div
                className="flex flex-col items-center gap-2 rounded-[14px] px-2.5 pb-2.5 pt-3.5"
                style={{ background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)' }}
              >
                <span className="cp-lbl">Guitar</span>
                <GuitarChordDiagram voicing={guitarVoicing} className="w-28" />
              </div>
            )}
            <div
              className="flex flex-col items-center gap-2 rounded-[14px] px-3 pb-3 pt-3.5"
              style={{ background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)' }}
            >
              <span className="cp-lbl">Piano</span>
              <div className="cp-keys w-full">
                <PianoKeyboard activeNotes={activeNotes} chordName={chordDisplayName} variant="player" />
              </div>
            </div>
          </aside>
        </div>

        {/* Footer band */}
        <div className="cp-dlg-foot">
          <div className="flex items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                className="cp-btn"
                style={{ color: 'var(--cp-dg)', borderColor: 'color-mix(in srgb, var(--cp-dg) 40%, transparent)' }}
                onClick={() => { onDelete(); onClose(); }}
              >
                <Trash2 size={18} />
                Delete
              </button>
            )}
            {onDuplicate && (
              <button type="button" className="cp-btn" onClick={() => { onDuplicate(); onClose(); }}>
                <Copy size={18} />
                Duplicate
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="cp-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="cp-btn cp-pri" style={{ padding: '0 26px' }} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
