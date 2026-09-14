import { useState, useMemo, useCallback, useEffect } from 'react';
import { Play, Square, ArrowRight } from 'lucide-react';
import { FEATURED_PROGRESSIONS } from '@/data/featuredProgressions';
import {
  playProgression, stopProgression, playSingleChord, transposeChordName, displayChordName,
} from '@/lib/progressionPreview';
import { editorUrl } from '@/lib/progressionExport';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { analytics } from '@/lib/analytics';

/**
 * The home hero's demo: press play, pick a formula, change the key, take it to the editor.
 *
 * Deliberately small. The Sept 2026 redesign put the full HomeGenerator here and engaged
 * sessions from the home fell from 77% to 61%, while visitors reaching /chord-player/ from
 * it fell from 184 to 82 a week: the generator answered the visit on the home instead of
 * handing it to the product. So there is no export, no BPM slider and no voicing panel --
 * those live on /progressions/ and in the Chord Player -- and "Open in Chord Player" is a
 * button next to Play, not a link after four other controls.
 */

// Card names in the catalog are long ("Contemporary Worship Elevation") and their numerals
// carry extensions ("IVmaj9–III7–VI9–V9"): correct on a card, but on a chip they are noise
// and they overflow the hero column. A chip gets one word and the bare degrees.
const PRESET_CHIPS: { id: string; label: string; degrees: string }[] = [
  { id: 'pop-axis', label: 'Pop Axis', degrees: 'I–V–VI–IV' },
  { id: 'worship-elevation', label: 'Worship', degrees: 'I–VI–IV–V' },
  { id: 'gospel-736', label: 'Gospel', degrees: 'VII–III–VI' },
  { id: 'neo-soul-dream', label: 'Neo-Soul', degrees: 'IV–III–VI–V' },
  { id: 'jazz-ii-v-i', label: 'Jazz', degrees: 'II–V–I' },
];

const PRESETS = PRESET_CHIPS.flatMap(({ id, label, degrees }) => {
  const p = FEATURED_PROGRESSIONS.find((f) => f.id === id);
  return p ? [{ ...p, label, degrees }] : [];
});

const SURFACE = 'home_hero';
const OWNER = 'home-hero-demo';

/** index.astro listens for this to point the hero CTA and the mobile bar at the same formula. */
export const HOME_FORMULA_EVENT = 'home:formula';

export default function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const preset = PRESETS[index];

  const chords = useMemo(
    () => preset.chords.map((c) => transposeChordName(c, transpose)),
    [preset, transpose],
  );
  const keyName = displayChordName(transposeChordName(preset.defaultKey, transpose));
  const href = editorUrl(chords, preset.bpm, preset.style);

  const activeNotes = useMemo(() => {
    const chord = parseChordString(chords[activeStep ?? 0] ?? chords[0])[0];
    return chord ? getChordNotes(chord) : [];
  }, [chords, activeStep]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(HOME_FORMULA_EVENT, {
      detail: { href, label: `${preset.label} · ${chords.map(displayChordName).join(' ')}` },
    }));
  }, [href, preset, chords]);

  useEffect(() => () => { stopProgression(); }, []);

  const start = useCallback((names: string[], bpm: number) => {
    setIsPlaying(true);
    playProgression(names, bpm, { owner: OWNER, onStep: setActiveStep });
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopProgression();
      setIsPlaying(false);
      setActiveStep(null);
      return;
    }
    analytics.previewPlayed(SURFACE, preset.name);
    start(chords, preset.bpm);
  }, [isPlaying, preset, chords, start]);

  const select = useCallback((next: number) => {
    if (next === index) return;
    const p = PRESETS[next];
    analytics.previewFormulaSelected(SURFACE, p.name);
    setIndex(next);
    setTranspose(0);
    setActiveStep(null);
    // Picking a formula is a request to hear it: start playing even if nothing was.
    start(p.chords.map((c) => transposeChordName(c, 0)), p.bpm);
  }, [index, start]);

  const shift = useCallback((delta: number) => {
    const next = transpose + delta;
    setTranspose(next);
    analytics.previewTransposed(SURFACE, preset.name, next);
    if (isPlaying) start(preset.chords.map((c) => transposeChordName(c, next)), preset.bpm);
  }, [transpose, isPlaying, preset, start]);

  if (!preset) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl shadow-primary/5">
      {/* Scrolls sideways on a phone; wraps onto two rows from sm up so nothing is cut off. */}
      <div
        className="flex gap-1.5 overflow-x-auto border-b border-border bg-muted/30 px-4 py-3 sm:flex-wrap sm:overflow-visible"
        role="group"
        aria-label="Progression formulas"
      >
        {PRESETS.map((p, i) => {
          const selected = i === index;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => select(i)}
              aria-pressed={selected}
              className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'border border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{p.label}</span>
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${selected ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                {p.degrees}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${chords.length}, minmax(0, 1fr))` }}>
          {chords.map((chord, i) => {
            const current = activeStep === i || (!isPlaying && activeStep === null && i === 0);
            return (
              <button
                key={`${chord}-${i}`}
                type="button"
                onClick={() => { playSingleChord(chord); setActiveStep(i); }}
                title={`Hear ${displayChordName(chord)}`}
                className={`flex h-16 min-w-0 select-none sm:h-20 flex-col items-center justify-center rounded-xl border px-1 transition-all ${
                  current
                    ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'border-border bg-muted/50 hover:border-primary/40 hover:bg-muted'
                }`}
              >
                <span className={`font-mono text-[10px] font-bold ${current ? 'text-primary-foreground/75' : 'text-primary'}`}>
                  {preset.romanNumerals[i] ?? ''}
                </span>
                <span className="truncate font-mono text-xl font-bold sm:text-2xl">{displayChordName(chord)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors ${
              isPlaying
                ? 'border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isPlaying
              ? (<><Square className="h-3.5 w-3.5 fill-current" /> Stop</>)
              : (<><Play className="h-3.5 w-3.5 fill-current" /> Play</>)}
          </button>

          <div className="flex min-h-[44px] items-center gap-0.5 rounded-xl border border-border bg-muted p-1 font-mono text-xs font-bold">
            <button type="button" onClick={() => shift(-1)} aria-label="Transpose down a semitone" className="min-h-[34px] cursor-pointer rounded-lg px-2.5 transition-colors hover:bg-secondary">♭</button>
            <span className="min-w-[56px] text-center text-primary">Key {keyName}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Transpose up a semitone" className="min-h-[34px] cursor-pointer rounded-lg px-2.5 transition-colors hover:bg-secondary">♯</button>
          </div>

          <span className="text-xs text-muted-foreground">{preset.bpm} BPM</span>

          <a
            href={href}
            onClick={() => analytics.previewEditorOpened(SURFACE, preset.name)}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/30 px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 sm:ml-auto sm:w-auto"
          >
            Open in Chord Player <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-4 hidden justify-center border-t border-border pt-4 sm:flex">
          <PianoKeyboard activeNotes={activeNotes} />
        </div>
      </div>
    </div>
  );
}
