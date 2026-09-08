import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Square, Download, Loader2 } from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes } from '@/lib/chordNotes';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { playProgression, playSingleChord, stopProgression, getPlayingOwner } from '@/lib/progressionPreview';
import { downloadProgressionMidi, downloadProgressionWav, editorUrl } from '@/lib/progressionExport';
import { analytics } from '@/lib/analytics';
import {
  buildPalette, FAMILY_STYLE, PALETTE_KEYS,
  type PaletteChord, type PaletteFamily, type PaletteKey,
} from '@/lib/gospelPalette';

const OWNER = 'gospel-palette';

/** The R&B style — closest thing the style catalog has to a gospel feel for the WAV render. */
const STYLE_ID = 'soul_rnb';

const BPM = 74;

function PlayGlyph({ active, playing }: { active: boolean; playing: boolean }) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors sm:h-7 sm:w-7 ${
        active
          ? 'border-transparent bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground group-hover:border-foreground group-hover:text-foreground'
      }`}
    >
      {playing
        ? <Square className="h-3 w-3 fill-current" />
        : <Play className="h-3.5 w-3.5 translate-x-px fill-current" />}
    </span>
  );
}

function LedgerRow({
  chord, active, playing, onPlay, romanWidth,
}: {
  chord: PaletteChord;
  active: boolean;
  playing: boolean;
  onPlay: (chord: PaletteChord) => void;
  romanWidth: string;
}) {
  const family = FAMILY_STYLE[chord.family];

  // The Roman column is wider on the tension and colour groups ("♭VIIm" against "ii"), so
  // its width rides in a custom property rather than forking the class list.
  const style = {
    '--roman': romanWidth,
    ...(active ? { background: family.tint, boxShadow: `inset 3px 0 0 0 ${family.accent}` } : {}),
  } as React.CSSProperties;

  return (
    <button
      type="button"
      onClick={() => onPlay(chord)}
      style={style}
      className={`group -mx-2 grid w-full grid-cols-[var(--roman)_1fr_2.25rem] items-center gap-x-3.5 gap-y-1 rounded-lg border-t border-border px-2 py-3 text-left transition-colors last:border-b sm:grid-cols-[var(--roman)_7.5rem_1fr_2.25rem] ${
        active ? '' : 'hover:bg-muted/50'
      }`}
    >
      <span className="col-start-1 row-start-1 font-mono text-[11px] font-bold text-muted-foreground">
        {chord.roman}
      </span>
      <span className="col-start-2 row-start-1 font-serif text-[17px] font-bold text-foreground">
        {chord.label}
      </span>
      <span className="col-start-2 row-start-2 text-xs leading-snug text-muted-foreground sm:col-start-3 sm:row-start-1">
        {chord.blurb}
      </span>
      <span className="col-start-3 row-span-2 row-start-1 justify-self-end sm:col-start-4 sm:row-span-1">
        <PlayGlyph active={active} playing={playing} />
      </span>
    </button>
  );
}

function GroupHeading({ family, title, aside, count }: {
  family: PaletteFamily; title: string; aside: string; count: string;
}) {
  return (
    <div className="flex items-baseline gap-3 pb-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FAMILY_STYLE[family].accent }} />
      <span className="font-serif text-xl font-bold text-foreground sm:text-[22px]">{title}</span>
      <span className="font-serif text-[12.5px] italic text-muted-foreground">{aside}</span>
      {/* Slot numbers are a nicety, and at 390px they wrap the heading onto two lines. */}
      <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">{count}</span>
    </div>
  );
}

export default function GospelChordPalette() {
  const [musicKey, setMusicKey] = useState<PaletteKey>('C');
  const [showPlain, setShowPlain] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [exporting, setExporting] = useState<'midi' | 'wav' | null>(null);

  const palette = useMemo(() => buildPalette(musicKey), [musicKey]);
  const homeRows = showPlain ? palette.homePlain : palette.home;

  // Selection is stored as an id, not a chord object, so it survives a transpose: the ids
  // are degrees ('ii', 'b7m'), and rebuilding the palette in another key keeps them.
  const activeChord = useMemo(() => {
    if (isPlaying && step !== null) return palette.example[step % palette.example.length];
    const all = [...palette.home, ...palette.homePlain, ...palette.tension, ...palette.colour];
    return all.find((c) => c.id === selectedId) ?? palette.home[0];
  }, [palette, selectedId, isPlaying, step]);

  const activeNotes = useMemo(() => {
    const chord = parseChordString(activeChord.symbol)[0];
    return chord ? getChordNotes(chord) : [];
  }, [activeChord]);

  const exampleSymbols = useMemo(() => palette.example.map((c) => c.symbol), [palette]);
  const exampleName = `${musicKey} gospel palette`;

  useEffect(() => () => { stopProgression(); }, []);

  // Another widget on the page (every progression card below is one) can take playback
  // over, and `playProgression` stops whatever was running without telling us. Without
  // this the Stop button would keep claiming to be playing something it no longer owns.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      if (getPlayingOwner() !== OWNER) {
        setIsPlaying(false);
        setStep(null);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const stop = useCallback(() => {
    stopProgression();
    setIsPlaying(false);
    setStep(null);
  }, []);

  const auditionChord = useCallback((chord: PaletteChord) => {
    stop();
    setSelectedId(chord.id);
    playSingleChord(chord.symbol);
    analytics.toolWidgetUsed('gospel-palette');
  }, [stop]);

  const toggleExample = useCallback(() => {
    if (isPlaying) { stop(); return; }
    setIsPlaying(true);
    setStep(0);
    playProgression(exampleSymbols, BPM, { owner: OWNER, onStep: setStep });
    analytics.playProgression(STYLE_ID);
  }, [isPlaying, stop, exampleSymbols]);

  const exportMidi = useCallback(() => {
    setExporting('midi');
    downloadProgressionMidi(exampleSymbols, exampleName, BPM);
    setExporting(null);
  }, [exampleSymbols, exampleName]);

  const exportWav = useCallback(async () => {
    setExporting('wav');
    try {
      await downloadProgressionWav(exampleSymbols, exampleName, BPM, STYLE_ID);
    } finally {
      setExporting(null);
    }
  }, [exampleSymbols, exampleName]);

  return (
    <section className="rounded-3xl border border-border bg-card px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-11">

      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <div className="grid items-end gap-6 pb-6 lg:grid-cols-[1.12fr_1fr] lg:gap-12">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            Gospel and neo-soul harmony
          </p>
          <h2 className="font-serif text-[30px] font-bold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-[46px]">
            The twenty-two chords a gospel player uses
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-[14.5px]" style={{ textWrap: 'pretty' }}>
          Seven of them belong to the key. Four break it on purpose. Four more are borrowed from the
          parallel minor. Everything gospel and neo-soul harmony does is some arrangement of those
          twenty-two — and every one plays here, in any of the twelve keys.
        </p>
      </div>

      {/* ── Settings line ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-3.5">
        <label className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">Key</span>
          <span className="relative inline-flex items-baseline">
            <select
              value={musicKey}
              onChange={(e) => setMusicKey(e.target.value as PaletteKey)}
              className="cursor-pointer appearance-none border-b border-foreground bg-transparent pb-px pr-5 font-serif text-base font-bold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {PALETTE_KEYS.map((k) => (
                <option key={k} value={k}>{k.replace('#', '♯').replace('b', '♭')} major</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-0 top-1.5 h-3 w-3 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </label>

        <span className="hidden h-5 w-px bg-border sm:block" />

        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">Voicing</span>
          <button
            type="button"
            onClick={() => setShowPlain((v) => !v)}
            className="border-b border-border pb-px text-[13.5px] font-semibold text-foreground transition-colors hover:border-foreground"
          >
            {showPlain ? 'Plain sevenths' : 'Gospel 9ths and 11ths'}
          </button>
        </div>

        <a href={editorUrl(exampleSymbols, BPM, STYLE_ID)} className="ml-auto text-[12.5px] font-semibold text-primary hover:underline">
          Open in the chord player →
        </a>
      </div>

      {/* ── Worked example ───────────────────────────────────────────── */}
      <div className="grid gap-7 border-b-2 border-foreground py-6 lg:grid-cols-[1fr_280px] lg:gap-11">
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">Worked example</span>
            <span className="font-serif text-[13px] italic text-muted-foreground">the four bars underneath most of the genre</span>
            {isPlaying && step !== null && (
              <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground">
                Bar {(step % palette.example.length) + 1} of {palette.example.length}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
            {palette.example.map((chord, i) => {
              const lit = isPlaying && step !== null && step % palette.example.length === i;
              const dimmed = isPlaying && !lit;
              return (
                <div
                  key={chord.id}
                  className={`flex flex-col gap-1 pb-1.5 transition-colors ${lit ? 'border-b-[3px]' : 'border-b-[3px] border-transparent'}`}
                  style={lit ? { borderColor: FAMILY_STYLE[chord.family].accent } : undefined}
                >
                  <span className={`font-serif text-[26px] font-bold leading-none tracking-tight sm:text-[30px] ${dimmed ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                    {chord.label}
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${dimmed ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                    {chord.roman}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleExample}
              className="inline-flex items-center gap-2.5 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              {isPlaying
                ? <><Square className="h-3 w-3 fill-current" /> Stop</>
                : <><Play className="h-3.5 w-3.5 fill-current" /> Play in {musicKey.replace('#', '♯').replace('b', '♭')}</>}
            </button>
            <span className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold text-muted-foreground">{BPM} BPM</span>
            <button
              type="button"
              onClick={exportMidi}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> MIDI
            </button>
            <button
              type="button"
              onClick={exportWav}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {exporting === 'wav'
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…</>
                : <><Download className="h-3.5 w-3.5" /> WAV</>}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:border-l lg:border-border lg:pl-11">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">Voicing</span>
            <span className="font-serif text-sm font-bold text-foreground">{activeChord.label}</span>
          </div>
          <PianoKeyboard activeNotes={activeNotes} className="w-full" />
          {/*
            Deliberately describes the notes and not a two-handed gospel voicing: the
            keyboard shows pitch classes in close position, which is also exactly what
            `playChordHold` sounds. Promising a split left/right voicing here would
            describe a feature the audio engine does not have yet.
          */}
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            The notes in the chord, in close position. Click any row below and this follows it.
          </p>
        </div>
      </div>

      {/* ── The ledger ───────────────────────────────────────────────── */}
      <div className="grid pt-7 lg:grid-cols-2 lg:gap-x-12">

        <div className="flex flex-col">
          <GroupHeading family="home" title="Home" aside="the seven chords of the key" count={showPlain ? '8–14' : '1–7'} />
          {homeRows.map((chord) => (
            <LedgerRow
              key={chord.id}
              chord={chord}
              active={activeChord.id === chord.id}
              playing={isPlaying && activeChord.id === chord.id}
              onPlay={auditionChord}
              romanWidth="3rem"
            />
          ))}
          <p className="mt-4 font-serif text-[13px] italic leading-relaxed text-muted-foreground">
            {showPlain
              ? 'These are the plain sevenths. '
              : 'These are the gospel voicings. '}
            <button
              type="button"
              onClick={() => setShowPlain((v) => !v)}
              className="font-sans font-semibold not-italic text-primary hover:underline"
            >
              {showPlain ? 'Show the 9ths and 11ths →' : 'Show the plain sevenths instead →'}
            </button>
          </p>
        </div>

        <div className="mt-10 flex flex-col lg:mt-0">
          <GroupHeading family="tension" title="Tension" aside="chords that break the key on purpose" count="15–18" />
          {palette.tension.map((chord) => (
            <LedgerRow
              key={chord.id}
              chord={chord}
              active={activeChord.id === chord.id}
              playing={isPlaying && activeChord.id === chord.id}
              onPlay={auditionChord}
              romanWidth="4rem"
            />
          ))}

          <div className="pt-6">
            <GroupHeading family="colour" title="Colour" aside={`borrowed from ${musicKey.replace('#', '♯').replace('b', '♭')} minor`} count="19–22" />
          </div>
          {palette.colour.map((chord) => (
            <LedgerRow
              key={chord.id}
              chord={chord}
              active={activeChord.id === chord.id}
              playing={isPlaying && activeChord.id === chord.id}
              onPlay={auditionChord}
              romanWidth="4rem"
            />
          ))}
          <p className="mt-4 font-serif text-[13px] italic leading-relaxed text-muted-foreground">
            Click any row to hear it in the current key. Change the key and all twenty-two transpose,
            spelled the way a chart would write them.
          </p>
        </div>

      </div>
    </section>
  );
}
