import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type Chord,
  ROOT_NOTES,
  CHORD_QUALITIES,
  QUALITY_LABELS,
  chordToMidiNotes,
  transposeNote,
  type RootNote,
  type Accidental,
  type ChordQuality,
} from '@/lib/musicTheory';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { qualityClass } from '@/lib/chordColors';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Minus, Plus, Trash2, Volume2 } from 'lucide-react';
// The chord player's tokens and primitives. Imported here, not only by the player page,
// because the song creator opens this same dialog.
import '@/styles/chord-player.css';
import { ChordPalette } from '@/components/ChordPalette';
import {
  chordsInKey,
  degreeOf,
  paletteModeFor,
  paletteTabFor,
  parseKeyName,
  pitchClassOf,
  type PaletteMode,
  type PaletteTab,
} from '@/lib/keyPalette';

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
  /** Where the chord is: "Verse · chord 3 of 4". Falls back to "Edit chord" / "New chord". */
  contextLabel?: string;
  /** Moves the chord one place earlier or later in its section; undefined at either end. */
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}

function parseBassNote(bn?: string): { root: RootNote | null; acc: Accidental } {
  if (!bn) return { root: null, acc: '' }
  const r = bn[0]?.toUpperCase() as RootNote
  if (!(ROOT_NOTES as readonly string[]).includes(r)) return { root: null, acc: '' }
  const acc: Accidental = bn[1] === '#' ? '#' : bn[1] === 'b' ? 'b' : ''
  return { root: r, acc }
}

/** The app's quality groups (chord_editor_sheet.dart), in the web's vocabulary. */
const QUALITY_GROUPS: { title: string; items: [ChordQuality, string][] }[] = [
  { title: 'Triads', items: [['maj', 'Major'], ['min', 'Minor'], ['dim', 'Dim'], ['aug', 'Aug'], ['sus2', 'Sus2'], ['sus4', 'Sus4']] },
  { title: '6ths & 7ths', items: [['6', '6'], ['7', '7'], ['maj7', 'Maj7'], ['min7', 'm7'], ['m7b5', 'm7♭5']] },
  { title: '9ths & 11ths', items: [['9', '9'], ['min9', 'm9'], ['add9', 'Add9'], ['min11', 'm11']] },
];
const GROUPED = new Set<ChordQuality>(QUALITY_GROUPS.flatMap((g) => g.items.map(([q]) => q)));
const MORE_QUALITIES = CHORD_QUALITIES.filter((q) => !GROUPED.has(q));

const ACCIDENTAL_ROW: { acc: Accidental; glyph: string; name: string }[] = [
  { acc: '', glyph: '♮', name: 'Natural' },
  { acc: '#', glyph: '♯', name: 'Sharp' },
  { acc: 'b', glyph: '♭', name: 'Flat' },
];

/** The family ink a chord name is written in (ChordSwatch.ink in the app). */
const INK: Record<string, string> = {
  '': 'var(--cp-majt)',
  'cp-min': 'var(--cp-mint)',
  'cp-sev': 'var(--cp-sevt)',
  'cp-sus': 'var(--cp-sust)',
  'cp-dim': 'var(--cp-dimt)',
  'cp-aug': 'var(--cp-augt)',
};

const MAX_BEATS = 8;
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const glyphs = (name: string) => name.replace('#', '♯').replace(/^([A-G])b$/, '$1♭');

function formatBeats(beats: number, barBeats: number): string {
  const whole = Math.floor(beats);
  const half = beats % 1 >= 0.5;
  const num = `${whole > 0 ? whole : ''}${half ? '½' : ''}` || '½';
  const bars = beats / barBeats;
  const barText = Number.isInteger(bars) && bars >= 1 ? ` · ${bars} bar${bars === 1 ? '' : 's'}` : '';
  return `${num} ${beats === 1 ? 'beat' : 'beats'}${barText}`;
}

/**
 * The chord editor, as the Android app draws it (lib/features/arrangement/
 * chord_editor_sheet.dart and the "Editor de acorde" artboard): where the chord is, its
 * name in its family colour and what it does in the key; a small keyboard that opens
 * how to play it; the chord picked from the key, from outside it or letter by letter;
 * how long it lasts; its bass and its place in the section.
 *
 * A bottom sheet on a phone, a centred panel on a wide screen — the same content in both.
 */
export function ChordEditModal({
  chord,
  open,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onPreview,
  songKey,
  transposition = 0,
  preferFlats = false,
  defaultDuration = 4,
  contextLabel,
  onMoveEarlier,
  onMoveLater,
}: ChordEditModalProps) {
  const [root, setRoot] = useState<RootNote>('C');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [quality, setQuality] = useState<ChordQuality>('maj');
  const [duration, setDuration] = useState(2);
  const [bassRoot, setBassRoot] = useState<RootNote | null>(null);
  const [bassAccidental, setBassAccidental] = useState<Accidental>('');
  const [showAllQualities, setShowAllQualities] = useState(false);
  const [tab, setTab] = useState<PaletteTab>('key');
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('triads');
  const [shapesOpen, setShapesOpen] = useState(false);
  // songKey is the sounding key, the same "display space" the state below lives in.
  const keyInfo = useMemo(() => parseKeyName(songKey), [songKey]);

  const bassNote = bassRoot ? `${bassRoot}${bassAccidental}` : undefined;

  /** `newBassNote`: undefined keeps the current bass, null clears it. */
  const triggerPreview = (newRoot: RootNote, newAccidental: Accidental, newQuality: ChordQuality, newBassNote?: string | null) => {
    onPreview?.({
      root: newRoot,
      accidental: newAccidental,
      quality: newQuality,
      bassNote: newBassNote === null ? undefined : newBassNote ?? bassNote,
    });
  };

  // root/accidental/bassRoot/bassAccidental hold the *transposed* (perceived) pitch, not
  // the raw stored value — see the sync effect and handleSave.
  const previewChord = useMemo<Chord>(() => ({
    id: 'modal-preview', root, accidental, quality, duration,
    bassNote: bassRoot ? `${bassRoot}${bassAccidental}` : undefined,
  }), [root, accidental, quality, duration, bassRoot, bassAccidental]);

  // The key decides the spelling, except that picking ♭ by hand is a spelling request too.
  const flatSpelling = preferFlats || accidental === 'b';

  const activeNotes = useMemo(() => getChordNotes(previewChord, 0, flatSpelling), [previewChord, flatSpelling]);
  const guitarVoicing = useMemo(() => getGuitarVoicing(previewChord), [previewChord]);
  const chordDisplayName = useMemo(() => getTransposedChordName(previewChord, 0, flatSpelling, true), [previewChord, flatSpelling]);
  const degree = useMemo(
    () => (keyInfo ? degreeOf(pitchClassOf(root, accidental), quality, keyInfo) : null),
    [keyInfo, root, accidental, quality],
  );

  // Keys lit on the little keyboard: the chord from its root upward, over two octaves.
  const lit = useMemo(() => {
    const rootPc = pitchClassOf(root, accidental);
    const midi = chordToMidiNotes({ ...previewChord, bassNote: undefined });
    const keys = new Set<number>();
    for (const m of midi) {
      let n = rootPc + (m - midi[0]);
      while (n > 23) n -= 12;
      keys.add(n);
    }
    return keys;
  }, [previewChord, root, accidental]);

  // Sync state when the chord changes or the editor opens. The stored chord is always
  // untransposed, but a transposed song should show/preview/edit the note the user
  // actually hears — so we transpose into "display space" here and back out in handleSave.
  useEffect(() => {
    if (!open) return;
    setShapesOpen(false);
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
      const mode = paletteModeFor(chord.quality);
      setPaletteMode(mode);
      setTab(paletteTabFor(keyInfo, displayNote.root, displayNote.accidental, chord.quality, mode, false));
    } else {
      // A new chord starts on the key's own chord, the one a song leaves from and lands on.
      const tonic = keyInfo ? chordsInKey(keyInfo, 'triads')[0] : null;
      setRoot(tonic?.root ?? 'C');
      setAccidental(tonic?.accidental ?? '');
      setQuality(tonic?.quality ?? 'maj');
      setDuration(defaultDuration);
      setBassRoot(null);
      setBassAccidental('');
      setPaletteMode('triads');
      setTab(paletteTabFor(keyInfo, 'C', '', 'maj', 'triads', true));
    }
    // An uncommon quality already in use must be visible, so the list opens for it.
    setShowAllQualities(!!chord && !GROUPED.has(chord.quality));
    // keyInfo is read on open only: the key can't change while the editor is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chord, open, transposition, defaultDuration]);

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

  const pick = (newRoot: RootNote, newAccidental: Accidental, newQuality: ChordQuality) => {
    setRoot(newRoot);
    setAccidental(newAccidental);
    setQuality(newQuality);
    triggerPreview(newRoot, newAccidental, newQuality);
  };

  const setBeats = (b: number) => setDuration(Math.min(MAX_BEATS, Math.max(0.5, b)));
  const whole = Math.floor(duration);
  const half = duration % 1 >= 0.5;
  const ink = INK[qualityClass(quality)] ?? INK[''];
  const beatsLabel = formatBeats(duration, defaultDuration);

  const qualityButton = (q: ChordQuality, label: string) => (
    <button
      key={q}
      type="button"
      className={`cp-q ${quality === q ? 'cp-on' : ''}`}
      aria-pressed={quality === q}
      onClick={() => pick(root, accidental, q)}
    >
      {label}
    </button>
  );

  const manual = (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {ROOT_NOTES.map((note) => (
          <button
            key={note}
            type="button"
            className={`cp-note ${root === note ? 'cp-on' : ''}`}
            aria-pressed={root === note}
            onClick={() => pick(note, accidental, quality)}
          >
            {note}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {ACCIDENTAL_ROW.map(({ acc, glyph, name }) => (
          <button
            key={name}
            type="button"
            className={`cp-note ${accidental === acc ? 'cp-on' : ''}`}
            style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12.5 }}
            aria-pressed={accidental === acc}
            onClick={() => pick(root, acc, quality)}
          >
            <span className="mr-1 text-base">{glyph}</span>
            {name}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {QUALITY_GROUPS.map((group) => (
          <div key={group.title} className="flex gap-1.5">
            <span className="cp-grp">{group.title}</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {group.items.map(([q, label]) => qualityButton(q, label))}
            </div>
          </div>
        ))}
        <div className="flex gap-1.5">
          <span className="cp-grp">More</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {showAllQualities && MORE_QUALITIES.map((q) => qualityButton(q, QUALITY_LABELS[q]))}
            <button
              type="button"
              className="cp-q"
              style={{ borderStyle: 'dashed', color: 'var(--cp-act)', background: 'transparent' }}
              onClick={() => setShowAllQualities((v) => !v)}
              aria-expanded={showAllQualities}
            >
              {showAllQualities ? 'Fewer' : `${MORE_QUALITIES.length} more`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="cp-dlg flex max-h-[94dvh] w-full max-w-[560px] flex-col gap-0 rounded-[22px] p-0 max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:rounded-[22px]">
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-2 sm:px-5 sm:pt-5">
          <div className="cp-grab sm:hidden" aria-hidden="true" />

          {/* Where it is, what it is, what it does */}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="cp-lbl truncate">{contextLabel ?? (chord ? 'Edit chord' : 'New chord')}</span>
              <DialogTitle
                className="cp-mono m-0 truncate text-[38px] font-bold leading-[1.05]"
                style={{ color: ink }}
              >
                {chordDisplayName}
              </DialogTitle>
              <DialogDescription className="m-0 text-xs font-semibold" style={{ color: 'var(--cp-mu)' }}>
                {degree ? `${degree.numeral}${degree.borrowed ? ' · outside the key' : ''} · ` : ''}
                {beatsLabel}
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => setShapesOpen(true)}
              className="flex w-[132px] shrink-0 flex-col gap-[3px] border-0 bg-transparent p-0"
              aria-label={`How to play ${chordDisplayName} on piano and guitar`}
            >
              <span className="cp-mkeys h-[52px] w-[132px]">
                <span className="cp-w">
                  {Array.from({ length: 14 }, (_, i) => (
                    <span key={i} className={lit.has(Math.floor(i / 7) * 12 + WHITE_PCS[i % 7]) ? 'cp-on' : ''} />
                  ))}
                </span>
                {[0, 1].flatMap((o) =>
                  [0, 1, 3, 4, 5].map((b) => {
                    const i = o * 7 + b;
                    return (
                      <span
                        key={i}
                        className={`cp-b ${lit.has(o * 12 + WHITE_PCS[b] + 1) ? 'cp-on' : ''}`}
                        style={{ left: `${((i + 1) / 14) * 100}%` }}
                      />
                    );
                  }),
                )}
              </span>
              <span className="text-center text-[10px] font-semibold" style={{ color: 'var(--cp-act)' }}>
                Piano & guitar
              </span>
            </button>

            <button
              type="button"
              className="cp-sq flex-col gap-1 text-[10px] font-semibold"
              style={{ height: 66 }}
              onClick={() => triggerPreview(root, accidental, quality)}
              aria-label={`Hear ${chordDisplayName}`}
            >
              <Volume2 size={16} />
              Play
            </button>
          </div>

          <div className="sm:min-h-[262px]">
            <ChordPalette
              songKey={keyInfo}
              tab={tab}
              onTabChange={setTab}
              mode={paletteMode}
              onModeChange={setPaletteMode}
              root={root}
              accidental={accidental}
              quality={quality}
              onPick={pick}
              manual={manual}
            />
          </div>

          {/* How long it lasts */}
          <div className="flex flex-col gap-2 pt-2.5" style={{ borderTop: '1px solid var(--cp-ln)' }}>
            <div className="flex items-center gap-2">
              <span className="cp-lbl flex-1">Duration</span>
              <span className="cp-mono text-[13px] font-bold" style={{ color: 'var(--cp-act)' }}>{beatsLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="cp-sq" onClick={() => setBeats(duration - 0.5)} disabled={duration <= 0.5} aria-label="Half a beat shorter">
                <Minus size={16} />
              </button>
              <div className="grid flex-1 grid-cols-8 justify-items-center">
                {Array.from({ length: MAX_BEATS }, (_, k) => {
                  const n = k + 1;
                  const full = n <= whole;
                  const isHalf = !full && n === whole + 1 && half;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`cp-bd w-full ${full ? 'cp-f' : isHalf ? 'cp-h' : ''}`}
                      onClick={() => setBeats(duration === n ? n - 0.5 : n)}
                      aria-label={`${n} beat${n === 1 ? '' : 's'}`}
                    >
                      <span />
                    </button>
                  );
                })}
              </div>
              <button type="button" className="cp-sq" onClick={() => setBeats(duration + 0.5)} disabled={duration >= MAX_BEATS} aria-label="Half a beat longer">
                <Plus size={16} />
              </button>
            </div>
            <input
              className="cp-rg mx-2.5"
              type="range"
              min={0.5}
              max={MAX_BEATS}
              step={0.5}
              value={duration}
              onChange={(e) => setBeats(parseFloat(e.target.value))}
              aria-label="Duration in beats"
              style={{ ['--cp-p' as string]: `${((duration - 0.5) / (MAX_BEATS - 0.5)) * 100}%` }}
            />
          </div>

          {/* Its bass, and its place in the section */}
          <div className="flex items-center gap-1.5 pb-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 flex-1 items-center justify-between rounded-[10px] px-3 text-xs font-semibold"
                  style={{ border: '1px solid var(--cp-ln)', background: 'var(--cp-s2)', color: 'var(--cp-tx2)' }}
                >
                  <span>Bass</span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--cp-tx)' }}>
                    {bassRoot ? <b className="cp-mono">{glyphs(`${bassRoot}${bassAccidental}`)}</b> : "The chord's own"}
                    <ChevronDown size={14} />
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => {
                    setBassRoot(null);
                    setBassAccidental('');
                    triggerPreview(root, accidental, quality, null);
                  }}
                >
                  The chord's own
                </DropdownMenuItem>
                {(flatSpelling ? FLAT_NAMES : SHARP_NAMES).map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => {
                      setBassRoot(name[0] as RootNote);
                      setBassAccidental((name[1] ?? '') as Accidental);
                      triggerPreview(root, accidental, quality, name);
                    }}
                  >
                    <span className="cp-mono font-bold">{glyphs(name)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {(onMoveEarlier || onMoveLater) && (
              <>
                <span className="ml-1 text-[11px]" style={{ color: 'var(--cp-fa)' }}>Move</span>
                <button type="button" className="cp-sq" onClick={onMoveEarlier} disabled={!onMoveEarlier} aria-label="Move earlier">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="cp-sq" onClick={onMoveLater} disabled={!onMoveLater} aria-label="Move later">
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 px-4 pb-[18px] pt-2.5 sm:px-5" style={{ borderTop: '1px solid var(--cp-ln)' }}>
          {onDelete && (
            <button
              type="button"
              className="cp-sq"
              style={{ width: 46, height: 46, background: 'transparent', color: 'var(--cp-dg)', borderColor: 'color-mix(in srgb, var(--cp-dg) 35%, transparent)' }}
              onClick={() => { onDelete(); onClose(); }}
              aria-label="Delete chord"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              className="cp-sq"
              style={{ width: 46, height: 46, background: 'transparent' }}
              onClick={() => { onDuplicate(); onClose(); }}
              aria-label="Duplicate chord"
              title="Duplicate"
            >
              <Copy size={18} />
            </button>
          )}
          <button
            type="button"
            className="ml-auto h-[46px] rounded-xl border-0 bg-transparent px-3.5 text-sm font-semibold"
            style={{ color: 'var(--cp-tx2)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-[46px] rounded-xl border-0 px-6 text-[15px] font-bold text-white"
            style={{ background: 'var(--cp-ac)' }}
            onClick={handleSave}
          >
            Save
          </button>
        </div>

        {/* How to play it: the full keyboard and the guitar shape */}
        {shapesOpen && (
          <div className="absolute inset-0 z-10 flex items-end" style={{ background: 'rgba(20, 24, 31, 0.45)' }}>
            <div className="flex w-full flex-col gap-3 rounded-t-[22px] px-4 pb-[22px] pt-3.5" style={{ background: 'var(--cp-s1)' }}>
              <div className="flex items-center">
                <span className="flex-1 text-base font-bold">How to play {chordDisplayName}</span>
                <button
                  type="button"
                  className="h-9 rounded-[10px] border-0 px-3.5 text-[13px] font-bold text-white"
                  style={{ background: 'var(--cp-ac)' }}
                  onClick={() => setShapesOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="cp-keys w-full">
                <PianoKeyboard activeNotes={activeNotes} chordName={chordDisplayName} variant="player" />
              </div>
              {guitarVoicing && (
                <div className="flex justify-center">
                  <GuitarChordDiagram voicing={guitarVoicing} className="w-32" />
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
