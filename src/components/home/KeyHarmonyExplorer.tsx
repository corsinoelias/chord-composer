import { useState, useEffect, useCallback } from 'react';
import { Play, Square, ArrowRight } from 'lucide-react';
import { playProgression, stopProgression, playSingleChord, displayChordName } from '@/lib/progressionPreview';
import { editorUrl } from '@/lib/progressionExport';

interface DiatonicKey {
  key: string;
  type: 'Major';
  relative: string;
  accidentals: string;
  diatonicChords: { degree: string; chord: string; function: string }[];
  formulas: { name: string; roman: string[]; chords: string[] }[];
}

const KEYS: DiatonicKey[] = [
  {
    key: 'C', type: 'Major', relative: 'A minor', accidentals: 'Natural (0 sharps / flats)',
    diatonicChords: [
      { degree: 'I', chord: 'C', function: 'Tonic' },
      { degree: 'II', chord: 'Dm', function: 'Supertonic' },
      { degree: 'III', chord: 'Em', function: 'Mediant' },
      { degree: 'IV', chord: 'F', function: 'Subdominant' },
      { degree: 'V', chord: 'G', function: 'Dominant' },
      { degree: 'VI', chord: 'Am', function: 'Submediant' },
      { degree: 'VII°', chord: 'Bdim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'Pop Axis Anthem', roman: ['I', 'V', 'VI', 'IV'], chords: ['C', 'G', 'Am', 'F'] },
      { name: 'Jazz II–V–I Cadence', roman: ['II7', 'V7', 'Imaj7'], chords: ['Dm7', 'G7', 'Cmaj7'] },
      { name: 'Classic Rock Drive', roman: ['I', 'IV', 'V', 'IV'], chords: ['C', 'F', 'G', 'F'] },
      { name: 'Nostalgic Folk', roman: ['VI', 'IV', 'I', 'V'], chords: ['Am', 'F', 'C', 'G'] },
    ],
  },
  {
    key: 'G', type: 'Major', relative: 'E minor', accidentals: '1 sharp (F♯)',
    diatonicChords: [
      { degree: 'I', chord: 'G', function: 'Tonic' },
      { degree: 'II', chord: 'Am', function: 'Supertonic' },
      { degree: 'III', chord: 'Bm', function: 'Mediant' },
      { degree: 'IV', chord: 'C', function: 'Subdominant' },
      { degree: 'V', chord: 'D', function: 'Dominant' },
      { degree: 'VI', chord: 'Em', function: 'Submediant' },
      { degree: 'VII°', chord: 'F#dim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'Uplifting Pop', roman: ['I', 'V', 'VI', 'IV'], chords: ['G', 'D', 'Em', 'C'] },
      { name: 'Jazz Cadence', roman: ['II7', 'V7', 'Imaj7'], chords: ['Am7', 'D7', 'Gmaj7'] },
      { name: 'Acoustic Soul', roman: ['I', 'VI', 'II', 'V'], chords: ['G', 'Em', 'Am', 'D'] },
    ],
  },
  {
    key: 'D', type: 'Major', relative: 'B minor', accidentals: '2 sharps (F♯, C♯)',
    diatonicChords: [
      { degree: 'I', chord: 'D', function: 'Tonic' },
      { degree: 'II', chord: 'Em', function: 'Supertonic' },
      { degree: 'III', chord: 'F#m', function: 'Mediant' },
      { degree: 'IV', chord: 'G', function: 'Subdominant' },
      { degree: 'V', chord: 'A', function: 'Dominant' },
      { degree: 'VI', chord: 'Bm', function: 'Submediant' },
      { degree: 'VII°', chord: 'C#dim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'Worship Anthem', roman: ['I', 'VI', 'IV', 'V'], chords: ['D', 'Bm', 'G', 'A'] },
      { name: 'Epic Ballad', roman: ['I', 'V', 'VI', 'IV'], chords: ['D', 'A', 'Bm', 'G'] },
      { name: 'Pure Melancholy', roman: ['VI', 'IV', 'I', 'V'], chords: ['Bm', 'G', 'D', 'A'] },
    ],
  },
  {
    key: 'A', type: 'Major', relative: 'F♯ minor', accidentals: '3 sharps (F♯, C♯, G♯)',
    diatonicChords: [
      { degree: 'I', chord: 'A', function: 'Tonic' },
      { degree: 'II', chord: 'Bm', function: 'Supertonic' },
      { degree: 'III', chord: 'C#m', function: 'Mediant' },
      { degree: 'IV', chord: 'D', function: 'Subdominant' },
      { degree: 'V', chord: 'E', function: 'Dominant' },
      { degree: 'VI', chord: 'F#m', function: 'Submediant' },
      { degree: 'VII°', chord: 'G#dim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'Rock Groove', roman: ['I', 'IV', 'V', 'IV'], chords: ['A', 'D', 'E', 'D'] },
      { name: 'Modern Indie', roman: ['I', 'V', 'VI', 'IV'], chords: ['A', 'E', 'F#m', 'D'] },
    ],
  },
  {
    key: 'F', type: 'Major', relative: 'D minor', accidentals: '1 flat (B♭)',
    diatonicChords: [
      { degree: 'I', chord: 'F', function: 'Tonic' },
      { degree: 'II', chord: 'Gm', function: 'Supertonic' },
      { degree: 'III', chord: 'Am', function: 'Mediant' },
      { degree: 'IV', chord: 'Bb', function: 'Subdominant' },
      { degree: 'V', chord: 'C', function: 'Dominant' },
      { degree: 'VI', chord: 'Dm', function: 'Submediant' },
      { degree: 'VII°', chord: 'Edim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'Neo Soul Groove', roman: ['IVmaj7', 'III7', 'II7', 'Imaj7'], chords: ['Bbmaj7', 'Am7', 'Gm7', 'Fmaj7'] },
      { name: 'Warm Acoustic', roman: ['I', 'V', 'VI', 'IV'], chords: ['F', 'C', 'Dm', 'Bb'] },
    ],
  },
  {
    key: 'Bb', type: 'Major', relative: 'G minor', accidentals: '2 flats (B♭, E♭)',
    diatonicChords: [
      { degree: 'I', chord: 'Bb', function: 'Tonic' },
      { degree: 'II', chord: 'Cm', function: 'Supertonic' },
      { degree: 'III', chord: 'Dm', function: 'Mediant' },
      { degree: 'IV', chord: 'Eb', function: 'Subdominant' },
      { degree: 'V', chord: 'F', function: 'Dominant' },
      { degree: 'VI', chord: 'Gm', function: 'Submediant' },
      { degree: 'VII°', chord: 'Adim', function: 'Leading tone' },
    ],
    formulas: [
      { name: 'R&B Stepdown', roman: ['I', 'VI', 'II', 'V'], chords: ['Bb', 'Gm', 'Cm', 'F'] },
      { name: 'Jazz Blues Cycle', roman: ['I7', 'IV7', 'I7', 'V7'], chords: ['Bb7', 'Eb7', 'Bb7', 'F7'] },
    ],
  },
];

const FORMULA_BPM = 100;

export default function KeyHarmonyExplorer() {
  const [keyIndex, setKeyIndex] = useState(0);
  const [playingFormula, setPlayingFormula] = useState<number | null>(null);
  const [activeChord, setActiveChord] = useState<string | null>(null);

  const current = KEYS[keyIndex];

  useEffect(() => () => { stopProgression(); }, []);

  const selectKey = useCallback((idx: number) => {
    stopProgression();
    setPlayingFormula(null);
    setKeyIndex(idx);
  }, []);

  const auditionChord = useCallback((chord: string) => {
    playSingleChord(chord, 700);
    setActiveChord(chord);
    window.setTimeout(() => setActiveChord(null), 500);
  }, []);

  const toggleFormula = useCallback((chords: string[], idx: number) => {
    if (playingFormula === idx) {
      stopProgression();
      setPlayingFormula(null);
      return;
    }
    setPlayingFormula(idx);
    playProgression(chords, FORMULA_BPM, { owner: `formula-${idx}` });
  }, [playingFormula]);

  return (
    <div>
      {/* Key selector */}
      <div className="mb-8 flex items-center justify-center gap-2 overflow-x-auto pb-2">
        {KEYS.map((k, idx) => (
          <button
            key={k.key}
            onClick={() => selectKey(idx)}
            aria-pressed={keyIndex === idx}
            className={`flex shrink-0 cursor-pointer flex-col items-center rounded-2xl border px-5 py-2.5 transition-colors ${
              keyIndex === idx
                ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <span className="font-mono text-lg font-bold">{k.key}</span>
            <span className="text-[10px] uppercase tracking-wide opacity-80">{k.type}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Diatonic chords */}
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
            <h3 className="font-serif text-xl font-bold text-foreground">
              The 7 chords in {current.key} {current.type.toLowerCase()}
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground">{current.accidentals}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {current.diatonicChords.map((c) => (
              <button
                key={c.degree}
                onClick={() => auditionChord(c.chord)}
                title={`${c.function} — click to hear ${displayChordName(c.chord)}`}
                className={`flex flex-col items-center rounded-xl border px-2 py-3 transition-all ${
                  activeChord === c.chord
                    ? 'scale-105 border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/50 hover:border-primary/40 hover:bg-muted'
                }`}
              >
                <span className={`font-mono text-[10px] font-bold ${
                  activeChord === c.chord ? 'text-primary-foreground/70' : 'text-primary'
                }`}>
                  {c.degree}
                </span>
                <span className="font-mono text-base font-bold">{displayChordName(c.chord)}</span>
                <span className={`mt-0.5 text-[9px] uppercase tracking-wide ${
                  activeChord === c.chord ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}>
                  {c.function}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Relative minor: <strong className="text-foreground">{current.relative}</strong> — the same seven chords,
            resting on VI instead of I.
          </p>
        </div>

        {/* Formulas in this key */}
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <h3 className="mb-4 border-b border-border pb-3 font-serif text-xl font-bold text-foreground">
            Progressions in {current.key}
          </h3>

          <div className="flex flex-col gap-2.5">
            {current.formulas.map((f, idx) => {
              const isPlayingThis = playingFormula === idx;
              return (
                <div
                  key={f.name}
                  className={`rounded-2xl border p-3 transition-colors ${
                    isPlayingThis ? 'border-primary bg-primary/5' : 'border-border bg-muted/40'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{f.name}</p>
                      <p className="font-mono text-[11px] text-primary">{f.roman.join(' – ')}</p>
                    </div>
                    <button
                      onClick={() => toggleFormula(f.chords, idx)}
                      aria-label={isPlayingThis ? `Stop ${f.name}` : `Play ${f.name}`}
                      className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                        isPlayingThis
                          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {isPlayingThis
                        ? <Square className="h-3.5 w-3.5 fill-current" />
                        : <Play className="h-3.5 w-3.5 fill-current" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {f.chords.map((chord, i) => (
                      <span
                        key={`${f.name}-${chord}-${i}`}
                        className="rounded-lg border border-border bg-card px-2 py-0.5 font-mono text-xs font-semibold text-foreground"
                      >
                        {displayChordName(chord)}
                      </span>
                    ))}
                    <a
                      href={editorUrl(f.chords, FORMULA_BPM, 'pop_1')}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      Edit <ArrowRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
