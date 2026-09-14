import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Play, Square, Copy, Check, Music, Download, FileMusic,
  Minus, Plus, Piano, Shuffle, Guitar, Keyboard,
} from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import {
  playProgression, stopProgression, playSingleChord, transposeChordName, displayChordName,
} from '@/lib/progressionPreview';
import { downloadProgressionMidi, downloadProgressionWav, editorUrl } from '@/lib/progressionExport';
import { analytics } from '@/lib/analytics';

const SURFACE = 'progressions_generator';

interface HeroPreset {
  name: string;
  shortLabel: string;
  romanSummary: string;
  chords: string[];
  roman: string[];
  genre: string;
  bpm: number;
  /** Real MUSICAL_STYLES id — used for the editor deep link and the WAV render. */
  style: string;
}

const HERO_PRESETS: HeroPreset[] = [
  {
    name: 'Pop Axis (I–V–VI–IV)', shortLabel: 'Pop Axis', romanSummary: 'I–V–VI–IV',
    chords: ['C', 'G', 'Am', 'F'], roman: ['I', 'V', 'VI', 'IV'],
    genre: 'Pop', bpm: 110, style: 'pop_1',
  },
  {
    name: 'Neo Soul Butter (IV–III–VI–V)', shortLabel: 'Neo-Soul', romanSummary: 'IV–III–VI–V',
    chords: ['Bbmaj9', 'Am7', 'Dm9', 'C9'], roman: ['IVmaj9', 'III7', 'VI9', 'V9'],
    genre: 'Neo Soul', bpm: 78, style: 'soul_rnb',
  },
  {
    // The gospel 7-3-6, rounded out with the ii it usually leads into. Worship and gospel
    // chord charts are where most of this site's search traffic lands, and the hero had
    // no preset that sounded like any of it.
    name: 'Gospel 7–3–6 (VII–III–VI)', shortLabel: 'Gospel', romanSummary: 'VII–III–VI',
    chords: ['Bm7b5', 'E7#9', 'Am11', 'Dm9'], roman: ['VIIø7', 'III7', 'VIm11', 'IIm9'],
    genre: 'Gospel', bpm: 72, style: 'soul_rnb',
  },
  {
    name: 'Jazz Cadence (II–V–I)', shortLabel: 'Jazz Cadence', romanSummary: 'II–V–I',
    chords: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], roman: ['II7', 'V7', 'Imaj7', 'Imaj7'],
    genre: 'Jazz', bpm: 95, style: 'jazz_light',
  },
  {
    name: 'Lo-Fi Chillhop (II–V–III–VI)', shortLabel: 'Lo-Fi Chill', romanSummary: 'II–V–III–VI',
    chords: ['Dm7', 'G7', 'Em7', 'Am7'], roman: ['II7', 'V7', 'III7', 'VI7'],
    genre: 'Lo-Fi', bpm: 82, style: 'soul_rnb',
  },
  {
    name: 'Cinematic Minor (I–VI–III–VII)', shortLabel: 'Cinematic Minor', romanSummary: 'I–VI–III–VII',
    chords: ['Am', 'F', 'C', 'G'], roman: ['I', 'VI', 'III', 'VII'],
    genre: 'Cinematic', bpm: 98, style: 'pop_1',
  },
  {
    name: 'Dark Phrygian (I–♭VI–IV–V)', shortLabel: 'Dark Phrygian', romanSummary: 'I–♭VI–IV–V',
    chords: ['Cm', 'Ab', 'Fm', 'G7'], roman: ['I', '♭VI', 'IV', 'V7'],
    genre: 'Trap', bpm: 130, style: 'hiphop_trap',
  },
  {
    name: '80s Synthwave (VI–V–IV–V)', shortLabel: 'Synthwave', romanSummary: 'VI–V–IV–V',
    chords: ['Am', 'G', 'F', 'G'], roman: ['VI', 'V', 'IV', 'V'],
    genre: 'Synthwave', bpm: 116, style: 'disco',
  },
  {
    name: 'Indie Anthem Drive (I–V–VI–IV)', shortLabel: 'Indie Anthem', romanSummary: 'I–V–VI–IV',
    chords: ['E', 'B', 'C#m', 'A'], roman: ['I', 'V', 'VI', 'IV'],
    genre: 'Indie Rock', bpm: 122, style: 'folk_indie',
  },
];

const OWNER = 'home-hero';

export default function HomeGenerator() {
  const [presetIndex, setPresetIndex] = useState(0);
  const [bpm, setBpm] = useState(HERO_PRESETS[0].bpm);
  const [transpose, setTranspose] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<'midi' | 'wav' | null>(null);
  const [showVoicing, setShowVoicing] = useState(false);
  const [voicingInstrument, setVoicingInstrument] = useState<'piano' | 'guitar'>('piano');

  const preset = HERO_PRESETS[presetIndex];

  // Transposition is derived, never stored as a second copy of the chords: the preset stays
  // the source of truth so repeated +1/-1 can't accumulate rounding in the note spelling.
  const chords = useMemo(
    () => preset.chords.map((c) => transposeChordName(c, transpose)),
    [preset, transpose],
  );

  // The chord whose voicing the piano/guitar panel is showing.
  const visualChord = useMemo(() => {
    const name = chords[activeStep ?? 0] ?? chords[0];
    return name ? parseChordString(name)[0] ?? null : null;
  }, [chords, activeStep]);

  const activeNotes = useMemo(() => (visualChord ? getChordNotes(visualChord) : []), [visualChord]);
  const guitarVoicing = useMemo(() => (visualChord ? getGuitarVoicing(visualChord) : null), [visualChord]);

  const start = useCallback((nextChords: string[], nextBpm: number) => {
    setIsPlaying(true);
    playProgression(nextChords, nextBpm, { owner: OWNER, onStep: setActiveStep });
  }, []);

  const stop = useCallback(() => {
    stopProgression();
    setIsPlaying(false);
    setActiveStep(null);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    analytics.previewPlayed(SURFACE, preset.name);
    start(chords, bpm);
  }, [isPlaying, stop, start, chords, bpm, preset]);

  const selectPreset = useCallback((index: number, autoPlay: boolean) => {
    stopProgression();
    setPresetIndex(index);
    setTranspose(0);
    setBpm(HERO_PRESETS[index].bpm);
    setActiveStep(null);
    if (autoPlay) {
      setIsPlaying(true);
      playProgression(HERO_PRESETS[index].chords, HERO_PRESETS[index].bpm, { owner: OWNER, onStep: setActiveStep });
    } else {
      setIsPlaying(false);
    }
  }, []);

  const randomize = useCallback(() => {
    let next = Math.floor(Math.random() * HERO_PRESETS.length);
    if (next === presetIndex) next = (next + 1) % HERO_PRESETS.length;
    selectPreset(next, isPlaying);
  }, [presetIndex, isPlaying, selectPreset]);

  const shiftTranspose = useCallback((semitones: number) => {
    setTranspose((prev) => {
      const next = prev + semitones;
      // Coalesced in analytics.ts, so a double-invoked updater still reports once.
      analytics.previewTransposed(SURFACE, preset.name, next);
      if (isPlaying) {
        start(preset.chords.map((c) => transposeChordName(c, next)), bpm);
      }
      return next;
    });
  }, [isPlaying, start, preset, bpm]);

  // Keyboard shortcuts read the latest handlers through a ref so the listener can be
  // registered once — rebinding it every render would drop keypresses mid-render.
  const handlers = useRef({ togglePlay, randomize, shiftTranspose });
  useEffect(() => {
    handlers.current = { togglePlay, randomize, shiftTranspose };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlers.current.togglePlay();
      } else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.current.randomize();
      } else if (e.code === 'ArrowLeft' && (e.metaKey || e.altKey || e.shiftKey)) {
        e.preventDefault();
        handlers.current.shiftTranspose(-1);
      } else if (e.code === 'ArrowRight' && (e.metaKey || e.altKey || e.shiftKey)) {
        e.preventDefault();
        handlers.current.shiftTranspose(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopProgression();
    };
  }, []);

  // A BPM change while playing has to restart the loop — the timer interval is baked in
  // when the loop starts, unlike the editor's bar-by-bar scheduler.
  const changeBpm = useCallback((next: number) => {
    const clamped = Math.max(40, Math.min(200, next));
    setBpm(clamped);
    if (isPlaying) start(chords, clamped);
  }, [isPlaying, start, chords]);

  const copyChords = useCallback(() => {
    navigator.clipboard.writeText(chords.join(' - ')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked — the chords are on screen anyway */ });
  }, [chords]);

  const exportMidiFile = useCallback(() => {
    setExporting('midi');
    analytics.previewExported(SURFACE, 'midi', preset.name);
    try {
      downloadProgressionMidi(chords, preset.shortLabel, bpm);
    } finally {
      window.setTimeout(() => setExporting(null), 600);
    }
  }, [chords, preset, bpm]);

  const exportWavFile = useCallback(async () => {
    setExporting('wav');
    analytics.previewExported(SURFACE, 'wav', preset.name);
    try {
      await downloadProgressionWav(chords, preset.shortLabel, bpm, preset.style);
    } finally {
      setExporting(null);
    }
  }, [chords, preset, bpm]);

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-7">

      {/* ── Preset chips ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Music className="h-3.5 w-3.5 text-primary" /> Progression formulas:
          </span>
          <button
            onClick={randomize}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            title="Randomize progression formula (shortcut: R)"
          >
            <Shuffle className="h-3 w-3" />
            <span>Randomize</span>
            <span className="hidden font-mono text-[10px] opacity-60 sm:inline">[R]</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
          {HERO_PRESETS.map((p, idx) => {
            const selected = presetIndex === idx;
            return (
              <button
                key={p.name}
                onClick={() => {
                  if (!selected) analytics.previewFormulaSelected(SURFACE, p.name);
                  selectPreset(idx, true);
                }}
                aria-pressed={selected}
                className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                    : 'border border-border bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <span>{p.shortLabel}</span>
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-card text-muted-foreground'
                }`}>
                  {p.romanSummary}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active formula bar ───────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
        <span className="truncate font-mono font-medium">
          Formula: <strong className="text-primary">{preset.name}</strong> ({preset.genre})
        </span>
        <span className="shrink-0 font-mono">Default: {preset.bpm} BPM</span>
      </div>

      {/* ── Chord tiles ──────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4 sm:gap-4">
        {chords.map((chord, idx) => {
          const current = activeStep === idx;
          return (
            <button
              key={`${chord}-${idx}`}
              onClick={() => { playSingleChord(chord); setActiveStep(idx); }}
              className={`group relative flex select-none flex-col items-center justify-center rounded-2xl border p-4 transition-all sm:p-6 ${
                current
                  ? 'scale-[1.03] border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/20'
                  : 'border-border bg-muted/50 hover:border-primary/40 hover:bg-muted'
              }`}
              title={`Click to hear ${displayChordName(chord)}`}
            >
              <span className={`mb-1 font-mono text-xs font-bold tracking-wider ${
                current ? 'text-primary-foreground/70' : 'text-muted-foreground'
              }`}>
                {preset.roman[idx] ?? `Step ${idx + 1}`}
              </span>
              <span className={`font-mono text-2xl font-bold tracking-tight sm:text-3xl ${
                current ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary'
              }`}>
                {displayChordName(chord)}
              </span>
              <span className={`mt-2 font-mono text-[10px] ${
                current ? 'text-primary-foreground/70' : 'text-muted-foreground'
              }`}>
                click to hear
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Step dots + voicing toggle ───────────────────────────────────── */}
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {chords.map((c, i) => (
            <span
              key={`dot-${c}-${i}`}
              className={`h-2 rounded-full transition-all duration-150 ${
                activeStep === i ? 'w-6 bg-primary ring-2 ring-primary/30' : 'w-2 bg-border'
              }`}
              title={`Step ${i + 1}: ${displayChordName(c)}`}
            />
          ))}
          <span className={`ml-1.5 font-mono text-[10px] ${
            isPlaying ? 'font-bold text-primary' : 'text-muted-foreground'
          }`}>
            {isPlaying ? `Step ${(activeStep ?? 0) + 1} of ${chords.length}` : 'Ready'}
          </span>
        </div>

        <button
          onClick={() => setShowVoicing((v) => !v)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            showVoicing
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {voicingInstrument === 'piano' ? <Piano className="h-3.5 w-3.5" /> : <Guitar className="h-3.5 w-3.5" />}
          <span>{showVoicing ? 'Hide voicings' : 'Visual voicings'}</span>
        </button>
      </div>

      {/* ── Voicing panel ────────────────────────────────────────────────── */}
      {showVoicing && (
        <div className="mb-6 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="mb-4 flex flex-col items-start justify-between gap-2.5 border-b border-border pb-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary">
                Current voicing: {displayChordName(chords[activeStep ?? 0] ?? chords[0])}
              </span>
              <span className="text-[10px] text-muted-foreground">(keys &amp; fretboard)</span>
            </div>

            <div className="flex items-center rounded-xl border border-border bg-card p-1">
              {(['piano', 'guitar'] as const).map((inst) => (
                <button
                  key={inst}
                  onClick={() => setVoicingInstrument(inst)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    voicingInstrument === inst
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {inst === 'piano' ? <Piano className="h-3 w-3" /> : <Guitar className="h-3 w-3" />}
                  <span>{inst}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center overflow-x-auto">
            {voicingInstrument === 'piano' ? (
              <PianoKeyboard activeNotes={activeNotes} chordName={displayChordName(chords[activeStep ?? 0])} />
            ) : guitarVoicing ? (
              <GuitarChordDiagram voicing={guitarVoicing} chordName={displayChordName(chords[activeStep ?? 0])} className="max-h-64" />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No standard guitar voicing for this chord — try the piano view.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Transport ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3.5 border-t border-border pt-4">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <button
            onClick={togglePlay}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-md transition-colors sm:py-2.5 ${
              isPlaying
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground shadow-primary/30 hover:bg-primary/90'
            }`}
          >
            {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            <span>{isPlaying ? 'Stop playback' : 'Play progression'}</span>
            <span className="hidden font-mono text-xs opacity-70 sm:inline">[Space]</span>
          </button>

          {/* Next to Play, not after Copy/MIDI/WAV: on the Sept 2026 home this link sat fourth
              in the export row and visitors reaching the Chord Player from it halved. */}
          <a
            href={editorUrl(chords, bpm, preset.style)}
            onClick={() => analytics.previewEditorOpened(SURFACE, preset.name)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-primary/30 px-5 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
          >
            Open in Chord Player →
          </a>

          <div className="flex min-h-[44px] items-center justify-between gap-1.5 rounded-xl border border-border bg-muted p-1.5 sm:justify-start">
            <span className="px-1 font-mono text-xs font-semibold text-muted-foreground">Transpose:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftTranspose(-1)}
                className="flex min-h-[34px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs font-bold transition-colors hover:bg-secondary"
                title="Transpose down 1 semitone (⌥ + ←)"
              >
                ♭ -1
              </button>
              <span className="min-w-[32px] px-1.5 text-center font-mono text-xs font-bold text-primary">
                {transpose === 0 ? 'Orig' : transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                onClick={() => shiftTranspose(1)}
                className="flex min-h-[34px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs font-bold transition-colors hover:bg-secondary"
                title="Transpose up 1 semitone (⌥ + →)"
              >
                ♯ +1
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-between gap-3 pt-2 sm:flex-row sm:items-center">
          {/* BPM */}
          <div className="flex min-h-[42px] items-center justify-between gap-2 rounded-xl border border-border bg-muted px-3 py-1.5 sm:justify-start">
            <span className="font-mono text-xs font-semibold text-muted-foreground">BPM:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => changeBpm(bpm - 5)}
                className="cursor-pointer rounded-md p-1 transition-colors hover:bg-secondary"
                title="Slow down 5 BPM"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                min={50}
                max={160}
                value={bpm}
                onChange={(e) => changeBpm(Number(e.target.value))}
                aria-label="Tempo in beats per minute"
                className="h-1.5 w-16 cursor-pointer accent-primary sm:w-20"
              />
              <span className="w-8 text-center font-mono text-xs font-bold text-primary">{bpm}</span>
              <button
                onClick={() => changeBpm(bpm + 5)}
                className="cursor-pointer rounded-md p-1 transition-colors hover:bg-secondary"
                title="Speed up 5 BPM"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Copy + exports */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyChords}
              className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs transition-colors hover:bg-secondary"
              title="Copy chords to clipboard"
            >
              {copied
                ? (<><Check className="h-3.5 w-3.5 text-success" /><span className="font-semibold text-success">Copied!</span></>)
                : (<><Copy className="h-3.5 w-3.5" /><span>Copy</span></>)}
            </button>

            <button
              onClick={exportMidiFile}
              disabled={exporting !== null}
              className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
              title="Download a standard MIDI file for your DAW"
            >
              <Download className="h-3.5 w-3.5" />
              <span>MIDI</span>
            </button>

            <button
              onClick={exportWavFile}
              disabled={exporting !== null}
              className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
              title="Render and download a WAV audio stem"
            >
              <FileMusic className="h-3.5 w-3.5" />
              <span>{exporting === 'wav' ? 'Rendering…' : 'WAV'}</span>
            </button>
          </div>
        </div>

        {/* Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5 opacity-60" /> Shortcuts:
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Space</kbd> Play/Stop</span>
            <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">R</kbd> Randomize</span>
            <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌥ + ← / →</kbd> Transpose</span>
          </span>
        </div>
      </div>
    </div>
  );
}
