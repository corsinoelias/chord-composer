import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString } from '@/lib/chordParser';
import { getDefaultInstrumentStates, type InstrumentState } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { createSection } from '@/lib/sections';
import { Maximize2, Minimize2, Type } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SongPlayerBar } from '@/components/SongPlayerBar';
import { SongHeaderTransport } from '@/components/SongHeaderTransport';
import { SongPracticePanel } from '@/components/SongPracticePanel';
import { SongStructureMap } from '@/components/SongStructureMap';
import { NotationSelector } from '@/components/NotationSelector';
import { SongTransportBar } from '@/components/SongTransportBar';
import ChordAside from '@/components/ChordAside';
import { SongKeyControl } from '@/components/SongKeyControl';
import { AutoscrollControl, DisplayOptions } from '@/components/SongReadingControls';
import { useLeftHanded, setLeftHanded } from '@/lib/leftHanded';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { CountdownOverlay } from '@/components/CountdownOverlay';
import { LEGACY_PRACTICE_PANEL } from '@/lib/songPageFlags';
import { displayChord } from '@/lib/songNotation';
import { sectionShort } from '@/lib/sectionKind';
import { SongSectionChart } from '@/components/SongSectionChart';
import { SongChordsOnlyChart, type ChordOnlyRow } from '@/components/SongChordsOnlyChart';
import { parseLyricLine, extractChordsWithDuration, extractChordsFromSong, sectionArrangement, type Song } from '@/data/songs';
import { makeStyleLookup } from '@/lib/sectionPlayback';
import { downloadBlob } from '@/lib/mp3Encoder';
import { exportSongWav } from '@/lib/appEngine/player';
import { exportMidi } from '@/lib/midiExporter';
import { MUSICAL_STYLES } from '@/lib/styles';
import { analytics } from '@/lib/analytics';
import { buildSongEditorUrl, linkArrangement, type EditorLinkSection } from '@/lib/editorLink';
import { useSongNotation } from '@/hooks/useSongNotation';
import { useSyncedChordView } from '@/hooks/useSyncedChordView';
import type { SongNotation } from '@/lib/songNotation';

// What the chart shows: chords over lyrics, the words alone, or the chords alone.
type Density = 'full' | 'lyrics' | 'chords';
// The rest of the "Aa" menu — the reader's, remembered per browser.
interface DisplayPrefs {
  spacing: 'comfy' | 'compact';
  columns: 'auto' | '1' | '2';
  accidentals: 'auto' | 'sharp' | 'flat';
  hoverDiagrams: boolean;
}
const DISPLAY_DEFAULTS: DisplayPrefs = { spacing: 'comfy', columns: 'auto', accidentals: 'auto', hoverDiagrams: true };
const DISPLAY_KEY = 'song-display-prefs';

// ─── Transpose helpers ────────────────────────────────────────────────────────
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeNote(n: string, s: number, flats: boolean) {
  const i = noteIndex(n); if (i === -1) return n;
  return (flats ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12];
}
function transposeChordStr(c: string, s: number, flats: boolean) {
  const slash = c.indexOf('/')
  const [chordPart, bassPart] = slash !== -1 ? [c.slice(0, slash), c.slice(slash + 1)] : [c, undefined]
  const m = chordPart.match(/^([A-G][#b]?)(.*)/)
  if (!m) return c
  const transposed = transposeNote(m[1], s, flats) + m[2]
  if (!bassPart) return transposed
  const bm = bassPart.match(/^([A-G][#b]?)(.*)/)
  if (!bm) return transposed + '/' + bassPart
  return transposed + '/' + transposeNote(bm[1], s, flats) + bm[2]
}
function transposeKey(key: string, s: number) {
  const minor = key.endsWith('m') && key.length > 1;
  const root = minor ? key.slice(0, -1) : key;
  const newRoot = transposeNote(root, s, FLAT_KEYS.has(key));
  return newRoot + (minor ? 'm' : '');
}

// ─── Token with resolved global index ────────────────────────────────────────
interface ResolvedToken {
  chord: string;
  lyrics: string;
  duration: number;
  globalIndex: number; // -1 if no chord
}

interface ResolvedSection {
  name: string;
  lines: ResolvedToken[][];
}

// ─── Inner component (needs PlaybackContext) ──────────────────────────────────
function SongChordPlayerInner({ song, inline = false }: { song: Song; inline?: boolean }) {
  const { state, play, stop, setBpm: setContextBpm, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex } = state;
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [bpm, setBpm] = useState(song.bpm);
  const [transpose, setTranspose] = useState(0);
  // Mobile performance console: Drawer open state + the "Voz" mixer channel's manual
  // mute/volume (independent of, and OR'd with, the transpose-forced mute below).
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [vocalMuted, setVocalMuted] = useState(false);
  const [vocalVolume, setVocalVolume] = useState(1);
  const vocalForcedMuted = transpose !== 0;
  // Click track. Off by default — a song page is a listening surface first — but it is the
  // one control that makes looping a section for practice actually useful, so it lives next
  // to tempo/key rather than behind the mixer.
  const [metronome, setMetronome] = useState(false);
  // Practice panel (Sections/Mixer/Tempo/Export) — collapsed by default, opened from the
  // header's Practice button. Density — which of the three ways to render the chart itself.
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [density, setDensity] = useState<Density>('full');
  const [display, setDisplay] = useState<DisplayPrefs>(DISPLAY_DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISPLAY_KEY);
      if (raw) setDisplay({ ...DISPLAY_DEFAULTS, ...JSON.parse(raw) });
    } catch { /* storage blocked or bad JSON */ }
  }, []);
  const updateDisplay = useCallback((patch: Partial<DisplayPrefs>) => {
    setDisplay(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);
  // How chord names are spelled (standard / Nashville numbers / Do-Re-Mi). Purely a display
  // layer: it never reaches the audio engine, the editor deep-link or the exports, all of which
  // keep working off the real chord names.
  const [notationPref, setNotation] = useSongNotation();
  // SongCreator's inline preview has no chart-view row to put the picker in, and an author
  // checking the chords they just typed wants to see those chords — not their degrees in
  // whatever notation they last read a song page in.
  const notation = inline ? 'standard' : notationPref;

  // The header transport and Practice panel are Astro-rendered markup outside this island, but
  // both need PlaybackContext and this component's own state, so they can't be their own
  // islands — a portal is the seam, same pattern the old desktop rail used. Resolved after
  // mount (there is no DOM during SSR). No matchMedia gating needed here: unlike the rail this
  // replaces (a different control set below vs above `lg`), there is exactly one panel now at
  // every width, so a single lookup on mount is enough.
  const [headerTransportTarget, setHeaderTransportTarget] = useState<HTMLElement | null>(null);
  const [practicePanelTarget, setPracticePanelTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (inline) return;
    setHeaderTransportTarget(document.getElementById('song-header-transport'));
    setPracticePanelTarget(document.getElementById('song-practice-panel'));
  }, [inline]);

  // Keep context BPM in sync for live tempo changes during playback
  useEffect(() => { setContextBpm(bpm); }, [bpm, setContextBpm]);

  // The key everything on the page is read in. Declared up here, above the broadcast below,
  // because that effect ships it to the non-React listeners too.
  const displayKey = useMemo(() => transpose === 0 ? song.key : transposeKey(song.key, transpose), [song.key, transpose]);
  // The key picker's labels, spelled by the same helper as displayKey above.
  const keyName = useCallback((s: number) => s === 0 ? song.key : transposeKey(song.key, s), [song.key]);

  // Capo. The song still SOUNDS in displayKey (audio, exports, the editor link and the "Key of"
  // chip all keep `transpose`); what changes is what the chart asks you to play — the shapes,
  // `capo` semitones below. Everything drawn on the page that names a chord (the chart, the
  // diagram strip, the bottom bar) reads shapeShift / shapeKey instead.
  const [capo, setCapo] = useState(0);
  // A capo is a fretted-instrument thing: with the diagrams on piano it neither shows nor
  // changes a chord (the choice is kept for when guitar or ukulele comes back).
  const [chordView] = useSyncedChordView('guitar');
  const capoApplies = chordView !== 'piano';
  const effCapo = capoApplies ? capo : 0;
  const shapeShift = transpose - effCapo;
  const shapeKey = useMemo(() => shapeShift === 0 ? song.key : transposeKey(song.key, shapeShift), [song.key, shapeShift]);
  const handleCapoChange = useCallback((c: number) => {
    setCapo(c);
    analytics.songCapoChanged(song.slug, c);
  }, [song.slug]);
  // ── Reading aids: autoscroll and text size. Speed and size are the reader's, not the song's,
  // so they are remembered per browser; autoscroll itself always starts off. ──────────────
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [textScale, setTextScale] = useState(100);
  useEffect(() => {
    try {
      const sp = Number(localStorage.getItem('song-autoscroll-speed'));
      if (sp >= 1 && sp <= 10) setScrollSpeed(sp);
      const ts = Number(localStorage.getItem('song-text-size'));
      if (ts >= 80 && ts <= 160) setTextScale(ts);
    } catch { /* storage blocked */ }
  }, []);
  const handleAutoScrollChange = useCallback((on: boolean) => {
    setAutoScroll(on);
    analytics.songAutoscrollToggled(song.slug, on, scrollSpeed);
  }, [song.slug, scrollSpeed]);
  const handleScrollSpeedChange = useCallback((sp: number) => {
    setScrollSpeed(sp);
    try { localStorage.setItem('song-autoscroll-speed', String(sp)); } catch { /* storage blocked */ }
  }, []);
  const handleTextScaleChange = useCallback((ts: number) => {
    setTextScale(ts);
    try { localStorage.setItem('song-text-size', String(ts)); } catch { /* storage blocked */ }
    analytics.songTextSizeChanged(song.slug, ts);
  }, [song.slug]);

  // The scroll itself. Pauses while a song plays (following the playhead already moves the page)
  // and switches off once the end of the chart is in view. Keeps the screen awake while it runs,
  // where the browser allows it — both hands are on the instrument.
  const chartBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll || isPlaying) return;
    let raf = 0;
    let last = 0;
    let carry = 0;
    const step = (ts: number) => {
      const dt = last ? Math.min(64, ts - last) : 0;
      last = ts;
      carry += dt * (0.006 + scrollSpeed * 0.0075); // ≈ 13 px/s at 1, 28 at 3, 81 at 10
      const px = Math.floor(carry);
      if (px >= 1) { window.scrollBy(0, px); carry -= px; }
      const body = chartBodyRef.current;
      const atEnd = body
        ? body.getBoundingClientRect().bottom < window.innerHeight * 0.6
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atEnd) { setAutoScroll(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, isPlaying, scrollSpeed]);
  // Stage mode: the chart, its diagrams and the bar, nothing else (the page's CSS hides the
  // rest under body.song-stage), full screen where the browser allows it. F toggles it, Esc
  // leaves, and leaving the browser's full screen leaves it too.
  const [stage, setStage] = useState(false);
  const handleStageChange = useCallback((on: boolean) => {
    setStage(on);
    analytics.songStageToggled(song.slug, on);
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* not allowed here */ }
  }, [song.slug]);
  useEffect(() => {
    if (inline) return;
    document.body.classList.toggle('song-stage', stage);
    if (stage) window.scrollTo({ top: 0 });
    return () => document.body.classList.remove('song-stage');
  }, [stage, inline]);
  useEffect(() => {
    if (inline) return;
    const onFullscreen = () => { if (!document.fullscreenElement) setStage(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'f' || e.key === 'F') handleStageChange(!document.body.classList.contains('song-stage'));
      else if (e.key === 'Escape' && document.body.classList.contains('song-stage')) handleStageChange(false);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
    };
  }, [inline, handleStageChange]);

  useEffect(() => {
    if (!(autoScroll || stage) || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => { /* refused */ });
    return () => { lock?.release().catch(() => {}); };
  }, [autoScroll, stage]);

  // A chord name as drawn → the chord that actually sounds, for the tap-to-hear previews.
  const soundingChord = useCallback(
    (name: string) => effCapo === 0 ? name : transposeChordStr(name, effCapo, FLAT_KEYS.has(displayKey)),
    [effCapo, displayKey],
  );

  // Keep context transposition in sync + notify ChordAside.
  // `displayKey` rides along so listeners don't have to re-derive it: the header's "Key of …"
  // chip is plain Astro markup with no transpose helper of its own, and the copies that do exist
  // disagree about sharps-vs-flats (they pick the spelling from the source key, chordSheetCore
  // picks it from the destination). Shipping the value this component already computed is the
  // only way the chip and the chart are guaranteed to name the key identically.
  useEffect(() => {
    updatePlaybackOptions({ transposition: transpose });
    // `semitones` is what the diagram strip draws — the capo shapes; `displayKey` stays the
    // sounding key for the chip; `capo` lets ChordAside's previews sound at the real pitch.
    window.dispatchEvent(new CustomEvent('song-transpose', {
      detail: { semitones: shapeShift, displayKey, capo: effCapo, transpose },
    }));
  }, [transpose, shapeShift, effCapo, displayKey, updatePlaybackOptions]);

  // ── Listening telemetry ──────────────────────────────────────────────────────
  // song_audio_ready / song_play_failed / song_play_progress / song_play_stopped — see
  // analytics.ts for what each answers. isPlayingRef mirrors state.isPlaying so the
  // async code below (which runs after awaits/timeouts, outside any render) always
  // reads the current value instead of one closed over at click time.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const playAttemptIdRef = useRef(0);
  const playedMsRef = useRef(0); // cumulative time actually spent playing, this page visit
  const playSegmentStartRef = useRef<number | null>(null);
  const firedMilestonesRef = useRef(new Set<'10s' | '30s' | '60s' | '180s'>());
  // Set to 'ended' right before the one stop() call that represents a solo-section chain
  // running out of neighbors to play next (see handlePlaySection's onEnded below); left at
  // the 'user' default for every other stop() — including the internal stop()-then-play()
  // handoffs between chained sections, which the debounce below filters out before this
  // ref would ever be read for them.
  const stopReasonRef = useRef<'user' | 'ended'>('user');
  const stopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wraps a play() call to report how long it took to actually start (or whether it
  // silently didn't). PlaybackContext.play() never rejects — it swallows its own errors
  // (see the try/catch around startPlayback there) — so a try/catch here would never see
  // a failure; checking isPlayingRef a beat after the promise settles is the only signal
  // available from outside the engine. The 50ms delay is slack for React to commit the
  // isPlaying state change (from either the success or the swallowed-error path) before
  // it's read; attemptId guards against reporting on a click that a newer one superseded.
  const trackPlayAttempt = useCallback((playPromise: Promise<void>) => {
    const attemptId = ++playAttemptIdRef.current;
    const clickedAt = performance.now();
    playPromise.then(() => {
      setTimeout(() => {
        if (playAttemptIdRef.current !== attemptId) return;
        if (!isPlayingRef.current) { analytics.songPlayFailed(song.slug, 'play'); return; }
        const latencyMs = performance.now() - clickedAt;
        const bucket = latencyMs < 1000 ? '<1s' : latencyMs < 3000 ? '1-3s' : '>3s';
        analytics.songAudioReady(song.slug, bucket, latencyMs);
      }, 50);
    });
  }, [song.slug]);

  // Accumulates listening time across pauses/section changes and reports the stop that
  // ends a listen. Debounced 400ms on the false transition — keepContext section-to-
  // section handoffs (stop() immediately followed by play() for the next section, see
  // handlePlaySection below) flip isPlaying false→true well inside that window, so they
  // never get mistaken for the user actually stopping. 400ms, not something tighter,
  // because that's what keepContext exists to make fast in the first place.
  useEffect(() => {
    if (isPlaying) {
      if (stopDebounceRef.current) { clearTimeout(stopDebounceRef.current); stopDebounceRef.current = null; }
      playSegmentStartRef.current = performance.now();
    } else {
      // No open play segment means nothing was playing: this is the mount-time run (or a
      // repeat false), not a stop. Without this guard every song page view reported a
      // song_play_stopped 400ms after load — 1,687 "stops" vs 276 plays in Aug–Sep 2026.
      if (playSegmentStartRef.current === null) return;
      playedMsRef.current += performance.now() - playSegmentStartRef.current;
      playSegmentStartRef.current = null;
      stopDebounceRef.current = setTimeout(() => {
        stopDebounceRef.current = null;
        analytics.songPlayStopped(song.slug, stopReasonRef.current);
        stopReasonRef.current = 'user';
      }, 400);
    }
  }, [isPlaying, song.slug]);

  // One row in GA4 per milestone per page visit, on cumulative play time (pausing and
  // resuming several times still counts toward the same total) — this is the curve that
  // answers "how long does a listen actually last", the thing a hard cutoff needs to know
  // before picking a number.
  useEffect(() => {
    if (!isPlaying) return;
    const THRESHOLDS: Array<['10s' | '30s' | '60s' | '180s', number]> = [
      ['10s', 10_000], ['30s', 30_000], ['60s', 60_000], ['180s', 180_000],
    ];
    const id = setInterval(() => {
      const segmentMs = playSegmentStartRef.current !== null ? performance.now() - playSegmentStartRef.current : 0;
      const elapsed = playedMsRef.current + segmentMs;
      for (const [label, ms] of THRESHOLDS) {
        if (elapsed >= ms && !firedMilestonesRef.current.has(label)) {
          firedMilestonesRef.current.add(label);
          analytics.songPlayProgress(song.slug, label);
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }, [isPlaying, song.slug]);

  // 'navigated' is fired straight from pagehide rather than through the debounce above —
  // there's no time left for a 400ms timer once the page is unloading. gtag queues its own
  // events on pagehide via sendBeacon (see the comment on analytics.ts's flushPendingTracks),
  // so this still reaches GA4 even though nothing runs after this handler returns.
  useEffect(() => {
    const handlePageHide = () => {
      if (!isPlayingRef.current) return;
      if (stopDebounceRef.current) { clearTimeout(stopDebounceRef.current); stopDebounceRef.current = null; }
      analytics.songPlayStopped(song.slug, 'navigated');
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [song.slug]);

  // Keep the Voz channel's manual mute/volume live during playback — engine OR's this with
  // the transpose-forced mute above (see the vocal's muted() in PlaybackContext.tsx).
  useEffect(() => {
    updatePlaybackOptions({ vocalMuted, vocalVolume });
  }, [vocalMuted, vocalVolume, updatePlaybackOptions]);

  // Metronome is re-read from optionsRef by the scheduler each bar (getMetronome), so this
  // toggles the click on and off mid-playback without a restart, exactly like bpm.
  useEffect(() => { updatePlaybackOptions({ metronome }); }, [metronome, updatePlaybackOptions]);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  // null = full song, number = which section index is playing solo
  const [playingSection, setPlayingSection] = useState<number | null>(null);
  // Full-song playback started part-way through (the bar's timeline was clicked): the flat
  // position, repeats counted, that the engine's chord 0 stands for. null = from the top.
  const [seekOffset, setSeekOffset] = useState<number | null>(null);
  // The bar's loop button cycles off → this section → the whole song. `loopTarget` below is the
  // section half; this is the song half. A ref too: onEnded reads it long after play() ran.
  // One bar counted in on the engine's cowbell before Play (or a section's ▷) starts the music —
  // on by default, like the prototype; the reader's choice is remembered. `counting` shows the
  // big 4-3-2-1 while the engine counts.
  const [countIn, setCountIn] = useState(true);
  const countInRef = useRef(true);
  countInRef.current = countIn;
  const [counting, setCounting] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('song-count-in') === '0') setCountIn(false); } catch { /* storage blocked */ }
  }, []);
  const handleCountInChange = useCallback((on: boolean) => {
    setCountIn(on);
    try { localStorage.setItem('song-count-in', on ? '1' : '0'); } catch { /* storage blocked */ }
  }, []);
  const [songLoop, setSongLoop] = useState(false);
  const songLoopRef = useRef(false);
  songLoopRef.current = songLoop;
  // Which SONG section is armed to loop — a song.sections index, deliberately NOT an index
  // into whatever Section[] happens to be scheduled right now. That distinction is what lets
  // the loop be armed while stopped (tap ⟳ on the chorus, then press Play): there is no
  // scheduled array to index into yet. It survives stop/start; handlePlaySection and
  // handleToggleLoop translate it into the engine's frame of reference at each play() call
  // and live update (0 when a single section is scheduled, the song index otherwise).
  const [loopTarget, setLoopTarget] = useState<number | null>(null);
  // Read synchronously by handlePlaySection, which can be invoked in the SAME tick that arms
  // a loop (arming one on a section that isn't the one sounding re-schedules straight away).
  // The `loopTarget` state closed over at that moment is still the old value; the ref isn't.
  // Same always-up-to-date-ref pattern as queuedSectionIndexRef below.
  const loopTargetRef = useRef<number | null>(null);
  loopTargetRef.current = loopTarget;
  // song.sections index the user tapped in the mobile Sections panel WHILE something else was
  // already sounding — instead of interrupting immediately, it waits its turn and takes over
  // as soon as the current section (or its loop) reaches a natural end. See
  // handleSectionCardTap/queuedSectionIndexRef below.
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);
  const queuedSectionIndexRef = useRef<number | null>(null);
  queuedSectionIndexRef.current = queuedSectionIndex;
  // which chord tooltip is open (by globalIndex); hover opens, click-outside closes
  const [openTooltipIdx, setOpenTooltipIdx] = useState<number | null>(null);
  const chordRefs = useRef<Map<number, HTMLElement>>(new Map());

  // ── Parse all sections and assign global chord indices ─────────────────────
  const { resolvedSections, allChordsFlat, sectionStartIndices, sectionChordCounts } = useMemo(() => {
    const allChords: string[] = [];
    const startIndices: number[] = [];
    const chordCounts: number[] = [];
    let idx = 0;

    const sections: ResolvedSection[] = song.sections.map(section => {
      startIndices.push(idx);
      let count = 0;
      const lines = section.lines.map(line => {
        const tokens = parseLyricLine(line);
        return tokens.map(token => {
          if (token.chord) { allChords.push(token.chord); count++; return { chord: token.chord, lyrics: token.lyrics, duration: token.duration, globalIndex: idx++ }; }
          return { chord: token.chord, lyrics: token.lyrics, duration: token.duration, globalIndex: -1 };
        });
      });
      chordCounts.push(count);
      return { name: section.name, lines };
    });

    return { resolvedSections: sections, allChordsFlat: allChords, sectionStartIndices: startIndices, sectionChordCounts: chordCounts };
  }, [song]);

  // ── Repeat-aware offsets — how many chord instances play before section i, incl. repeats ──
  // Each rendered lyric/chord token exists once in the DOM (sectionStartIndices above), but a
  // repeated section is scheduled multiple times back-to-back by the audio engine, so the flat
  // playback position (currentChordIndex) advances past sectionChordCounts[i] on every repeat.
  const { sectionSpanOffsets, totalSpan } = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    song.sections.forEach((section, si) => {
      offsets.push(acc);
      acc += sectionChordCounts[si] * (section.repeatCount ?? 1);
    });
    return { sectionSpanOffsets: offsets, totalSpan: acc };
  }, [song.sections, sectionChordCounts]);

  const allChordsWithDuration = useMemo(() => extractChordsWithDuration(song), [song]);

  const resolvedStyle = useMemo(
    () => MUSICAL_STYLES.find(s => s.id === song.style) ?? MUSICAL_STYLES[0],
    [song.style],
  );

  // User-editable mute/solo/volume per instrument (mobile performance console's Mixer tab).
  // Style-specific sound types are layered on top via getEffectiveInstruments below, not
  // stored here, so switching styles never clobbers a user's manual mixer adjustments.
  const [instrumentStates, setInstrumentStates] = useState<InstrumentState[]>(getDefaultInstrumentStates());

  // Apply the song's style's own instrument sound types (e.g. 'electric' guitar) — without
  // this, every instrument falls back to its generic default sound (guitar defaults to a
  // soundfont patch that loads over the network and can miss the first playback entirely).
  const instruments = useMemo(
    () => getEffectiveInstruments(instrumentStates, resolvedStyle),
    [instrumentStates, resolvedStyle],
  );

  // Live-patch mute/solo/volume into the running scheduler without restarting playback — same
  // pattern as the bpm/transposition sync effects above.
  useEffect(() => { updatePlaybackOptions({ instruments }); }, [instruments, updatePlaybackOptions]);

  // Sharps or flats: the key's own spelling unless the reader picked one in "Aa".
  const spellFlats = useCallback((key: string) =>
    display.accidentals === 'flat' ? true : display.accidentals === 'sharp' ? false : FLAT_KEYS.has(key),
  [display.accidentals]);
  // Every chord moved `shift` semitones, spelled with flats or sharps.
  const shiftSections = useCallback((shift: number, flats: boolean, respell = false) => {
    if (shift === 0 && !respell) return resolvedSections;
    return resolvedSections.map(sec => ({
      ...sec,
      lines: sec.lines.map(line =>
        line.map(token => ({
          ...token,
          chord: token.chord ? transposeChordStr(token.chord, shift, flats) : token.chord,
        }))
      ),
    }));
  }, [resolvedSections]);
  // What the chart draws (capo shapes) vs what sounds (the editor link must get the latter).
  const displayedSections = useMemo(
    () => shiftSections(shapeShift, spellFlats(shapeKey), display.accidentals !== 'auto'),
    [shiftSections, shapeShift, spellFlats, shapeKey, display.accidentals],
  );
  const soundingSections = useMemo(() => shiftSections(transpose, FLAT_KEYS.has(displayKey)), [shiftSections, transpose, displayKey]);
  // One chord name as the chart draws it.
  const shapeName = useCallback(
    (raw: string) => shapeShift === 0 && display.accidentals === 'auto' ? raw : transposeChordStr(raw, shapeShift, spellFlats(shapeKey)),
    [shapeShift, shapeKey, spellFlats, display.accidentals],
  );

  // ── Sections in the shape the editor's ?data= param expects — one entry per
  // song section, preserving name/repeatCount/per-chord duration, using the
  // currently displayed (transposed) chord names ──────────────────────────────
  const editorSectionsData: EditorLinkSection[] = useMemo(() => {
    return soundingSections
      .map((section, si) => ({
        name: section.name,
        repeatCount: song.sections[si]?.repeatCount ?? 1,
        chords: section.lines.flatMap(line =>
          line.filter(t => t.chord).map(t => ({ c: t.chord, d: t.duration }))
        ),
        ...(song.sections[si] ? linkArrangement(song.sections[si]) : {}),
      }))
      .filter(s => s.chords.length > 0);
  }, [soundingSections, song.sections]);

  // ── Build one playback Section for a range of resolved chords ──────────────
  const buildPlayback = useCallback((startGlobal: number, count: number, label: string, repeatCount = 1) => {
    const chordsWithDur = allChordsWithDuration.slice(startGlobal, startGlobal + count);
    const parsed = chordsWithDur.flatMap(({ chord, duration }) =>
      parseChordString(chord).map(c => ({ ...c, duration }))
    );
    return { ...createSection(label), chords: parsed, repeatCount };
  }, [allChordsWithDuration]);

  // ── Build one Section per song section, preserving identity + repeatCount ──
  // (rather than flattening the whole song into one Section) so the audio engine's
  // own per-section repeat loop handles repeats instead of duplicating chord data here.
  const buildFullSongSections = useCallback(() => {
    return song.sections.map((section, si) => ({
      ...buildPlayback(sectionStartIndices[si], sectionChordCounts[si], section.name, section.repeatCount ?? 1),
      ...sectionArrangement(section),
    }));
  }, [song.sections, sectionStartIndices, sectionChordCounts, buildPlayback]);

  // ── Vocal reference audio track for a full-song play() call — buildPlayback() mints a
  // fresh Section.id per call, so sectionRanges has to be keyed off the SAME playback
  // Section[] just built, matched by array position against song.sections' own audioRange.
  const buildAudioTrack = useCallback((playbackSections: { id: string }[]) => {
    if (!song.audioTrack) return undefined;
    if (song.audioWholeRange) return { url: song.audioTrack.url, wholeRange: song.audioWholeRange };
    const sectionRanges: Record<string, { startSec: number; endSec: number }> = {};
    playbackSections.forEach((sec, i) => {
      const range = song.sections[i]?.audioRange;
      if (range) sectionRanges[sec.id] = range;
    });
    return Object.keys(sectionRanges).length > 0 ? { url: song.audioTrack.url, sectionRanges } : undefined;
  }, [song.audioTrack, song.audioWholeRange, song.sections]);

  // ── Reset playing section when playback stops — but not while a switch is already in
  // flight (handlePlay/handlePlaySection call stop() then immediately start a new play(),
  // which commits isPlaying:false for one render before play() sets it back to true; without
  // the isLoading guard this effect would fire on that transient false and wipe out the
  // playingSection the new play() call had just set, e.g. breaking prev/next-section jumps) ──
  // `loopTarget` is deliberately NOT reset here: an armed loop is a user intention about the
  // song, not about the current playback run, so it has to survive Stop and be there on the
  // next Play. Only the two genuinely run-scoped values are cleared.
  useEffect(() => {
    if (!isPlaying && !isLoading) { setPlayingSection(null); setQueuedSectionIndex(null); setSeekOffset(null); }
  }, [isPlaying, isLoading]);

  // ── Map the flat playback position (which advances across repeats) back to the
  // single rendered DOM token for highlighting/scrolling ──────────────────────
  // A flat playback position → the rendered token it lands on. Also asked one step ahead, for
  // the bar's "next chord".
  const globalAt = useCallback((flat: number) => {
    if (flat < 0) return -1;
    if (playingSection === null && seekOffset !== null) flat += seekOffset;
    if (playingSection !== null) {
      const count = sectionChordCounts[playingSection];
      if (count === 0) return -1;
      const repeatCount = song.sections[playingSection]?.repeatCount ?? 1;
      if (flat >= count * repeatCount) return -1;
      return sectionStartIndices[playingSection] + (flat % count);
    }
    for (let si = 0; si < song.sections.length; si++) {
      const count = sectionChordCounts[si];
      if (count === 0) continue;
      const start = sectionSpanOffsets[si];
      const span = count * (song.sections[si].repeatCount ?? 1);
      if (flat >= start && flat < start + span) {
        return sectionStartIndices[si] + ((flat - start) % count);
      }
    }
    return -1;
  }, [playingSection, seekOffset, sectionChordCounts, sectionStartIndices, sectionSpanOffsets, song.sections]);

  const activeGlobal = useMemo(
    () => (!isPlaying || currentChordIndex < 0) ? -1 : globalAt(currentChordIndex),
    [isPlaying, currentChordIndex, globalAt],
  );

  // ── Which song section is currently sounding — single source of truth for the section
  // header highlight, the timeline markers, and the prev/next/loop transport buttons ──────
  const activeSectionIndex = useMemo(() => {
    if (!isPlaying) return null;
    if (playingSection !== null) return playingSection;
    if (activeGlobal < 0) return null;
    const idx = resolvedSections.findIndex(section =>
      section.lines.some(line => line.some(t => t.globalIndex === activeGlobal))
    );
    return idx === -1 ? null : idx;
  }, [isPlaying, playingSection, resolvedSections, activeGlobal]);

  // ── Section markers for the timeline — position of each section's start as a percent of
  // the full song's span (repeat-aware, matches how `progress` itself is computed) ─────────
  const sectionMarkers = useMemo(() => {
    if (totalSpan === 0) return [];
    return song.sections
      .map((section, si) => ({
        sectionIndex: si,
        name: section.name,
        startPercent: (sectionSpanOffsets[si] / totalSpan) * 100,
      }))
      .filter((_, si) => sectionChordCounts[si] > 0);
  }, [song.sections, sectionSpanOffsets, sectionChordCounts, totalSpan]);

  // ── Structure map data — sectionMarkers plus each entry's own repeatCount, one chip per
  // song.sections entry (a repeated section further down the array is its own chip) ─────────
  const structureItems = useMemo(() => sectionMarkers.map(m => ({
    sectionIndex: m.sectionIndex,
    name: m.name,
    repeatCount: song.sections[m.sectionIndex]?.repeatCount ?? 1,
  })), [sectionMarkers, song.sections]);

  // ── Beat-weighted cumulative position, for the floating pill's real elapsed/total time ────
  // sectionSpanOffsets/totalSpan above are chord-COUNT based (one unit per chord token,
  // regardless of how many beats it lasts) — that's fine for a progress bar's fill %, but wrong
  // for a clock. This mirrors that same section/repeat loop, summing each chord's own
  // `duration` (in beats) instead of counting 1 per chord, so index i here lines up with the
  // exact same flat position `baseChordOffset + playbackPosition` already used everywhere else.
  const { cumulativeBeatsAtChordIndex, totalBeats } = useMemo(() => {
    const cum: number[] = [0];
    let acc = 0;
    song.sections.forEach((section, si) => {
      const count = sectionChordCounts[si];
      const repeats = section.repeatCount ?? 1;
      const durations = allChordsWithDuration
        .slice(sectionStartIndices[si], sectionStartIndices[si] + count)
        .map(c => c.duration);
      for (let r = 0; r < repeats; r++) {
        for (let i = 0; i < count; i++) {
          acc += durations[i] ?? 0;
          cum.push(acc);
        }
      }
    });
    return { cumulativeBeatsAtChordIndex: cum, totalBeats: acc };
  }, [song.sections, sectionChordCounts, sectionStartIndices, allChordsWithDuration]);

  // ── Verbatim-repeat detection — a section is a "repeat" of an earlier one only when its name
  // AND its raw lines (lyrics+chord tags, pre-parse) match exactly, not just the name (two
  // different bridges both called "Bridge" must never collapse into one). Drives the dashed
  // reference card in SongSectionChart for the "Lyrics + chords"/"Compact" densities. ─────────
  const sectionIsRepeatOf = useMemo(() => {
    const seen = new Map<string, number>();
    return song.sections.map((section, si) => {
      const key = `${section.name} ${JSON.stringify(section.lines)}`;
      const firstIdx = seen.get(key);
      if (firstIdx === undefined) { seen.set(key, si); return null; }
      return firstIdx;
    });
  }, [song.sections]);

  // ── "Chords only" density data — the transposed chords per section, no lyrics ──────────────
  const chordOnlyRows = useMemo<ChordOnlyRow[]>(() => {
    return displayedSections
      .map((section, si) => ({
        sectionIndex: si,
        name: section.name,
        repeatCount: song.sections[si]?.repeatCount ?? 1,
        chords: section.lines.flatMap(line =>
          line.filter(t => t.chord).map(t => ({ chord: t.chord, globalIndex: t.globalIndex }))
        ),
      }))
      .filter(row => row.chords.length > 0);
  }, [displayedSections, song.sections]);

  // ── Prev/next section — skips sections with no chords (nothing to play) ─────────────────
  const findPlayableNeighbor = useCallback((from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (i >= 0 && i < song.sections.length) {
      if (sectionChordCounts[i] > 0) return i;
      i += dir;
    }
    return null;
  }, [song.sections.length, sectionChordCounts]);

  // ── Auto-scroll to active chord — pauses the moment the user scrolls manually, so it
  // doesn't fight someone trying to read ahead. `wheel`/`touchmove` only ever fire from real
  // user input (scrollIntoView never dispatches them), so this can't self-trigger. ──────────
  const [autoFollow, setAutoFollow] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const disableFollow = () => setAutoFollow(false);
    window.addEventListener('wheel', disableFollow, { passive: true });
    window.addEventListener('touchmove', disableFollow, { passive: true });
    return () => {
      window.removeEventListener('wheel', disableFollow);
      window.removeEventListener('touchmove', disableFollow);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || activeGlobal < 0 || !autoFollow) return;
    chordRefs.current.get(activeGlobal)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeGlobal, isPlaying, autoFollow]);

  // ── Following resumes by itself once the chord that is playing is back on screen (the reader
  // scrolled back to it). There used to be a floating "Now playing" button for this; it sat
  // over the chart, so it went (Sep 2026). ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || autoFollow) return;
    const check = () => {
      const el = chordRefs.current.get(activeGlobal);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.15 && r.bottom < window.innerHeight * 0.75) setAutoFollow(true);
    };
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [isPlaying, autoFollow, activeGlobal]);

  // ── Notify ChordAside of the currently sounding chord (same event-bus pattern as transpose) ──
  const activeChordName = useMemo(() => {
    if (activeGlobal < 0) return null;
    const raw = allChordsFlat[activeGlobal];
    return raw ? shapeName(raw) : null;
  }, [activeGlobal, allChordsFlat, shapeName]);

  const activeDuration = activeGlobal >= 0 ? (allChordsWithDuration[activeGlobal]?.duration ?? 4) : 4;

  // ── What the bottom bar shows: the chord now and the next one, in the reader's notation.
  // At rest it previews the start of the song (first chord → second), so the bar never sits
  // empty and already says what Play will do. ──────────────────────────────────────────────
  const chordLabel = useCallback((g: number) => {
    const raw = g >= 0 ? allChordsFlat[g] : undefined;
    if (!raw) return null;
    return displayChord(shapeName(raw), shapeKey, notation);
  }, [allChordsFlat, shapeName, shapeKey, notation]);
  const barNowChord = isPlaying ? chordLabel(activeGlobal) : chordLabel(0);
  // The same chord by name (capo shapes, letters) — the bar draws its diagram.
  const barNowName = (() => {
    const raw = allChordsFlat[isPlaying ? activeGlobal : 0];
    return raw ? shapeName(raw) : null;
  })();
  const barNextChord = isPlaying
    ? chordLabel(globalAt(currentChordIndex + 1))
    : chordLabel(allChordsFlat.length > 1 ? 1 : -1);
  const firstPlayableSection = sectionChordCounts.findIndex(c => c > 0);
  // "Chorus (2 of 3)" when a section name comes back later in the song.
  const sectionLabel = (si: number) => {
    const name = song.sections[si]?.name;
    if (!name) return null;
    const same = song.sections.filter(s => s.name === name).length;
    if (same < 2) return name;
    const nth = song.sections.slice(0, si + 1).filter(s => s.name === name).length;
    return `${name} (${nth} of ${same})`;
  };
  const barSectionName = isPlaying
    ? (activeSectionIndex !== null ? sectionLabel(activeSectionIndex) : null)
    : sectionLabel(firstPlayableSection);

  // The chord after it, same spelling — ChordAside marks it "Next" in the diagram strip.
  const nextChordName = useMemo(() => {
    if (!isPlaying) return null;
    const raw = allChordsFlat[globalAt(currentChordIndex + 1)];
    return raw ? shapeName(raw) : null;
  }, [isPlaying, allChordsFlat, globalAt, currentChordIndex, shapeName]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('song-active-chord', {
      // rawIndex is the raw, ever-increasing playback index (not repeat-resolved) — it's what
      // DurationDots needs to correctly restart its fill on every chord instance, including
      // repeats of a section that land back on the same activeGlobal/DOM position.
      detail: { chord: activeChordName, next: nextChordName, isPlaying, duration: activeDuration, bpm, rawIndex: currentChordIndex },
    }));
  }, [activeChordName, nextChordName, isPlaying, activeDuration, bpm, currentChordIndex]);

  // handlePlaySectionRef always holds the LATEST handlePlaySection — onEnded below needs to
  // call back into it to chain forward, but referencing the function by name from inside its
  // own useCallback body would be a stale closure (and an unlistable circular dependency);
  // a ref sidesteps both. Assigned during render (not an effect) so it's never one render
  // behind — the safe "always-up-to-date ref" pattern. Declared up here (rather than next to
  // handlePlaySection below) because handlePlay also routes through it, see the armed-loop
  // branch immediately below.
  const handlePlaySectionRef = useRef<(si: number, opts?: { keepContext?: boolean }) => void>(() => {});

  // ── Play full song ─────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying) { stop(); return; }
    if (allChordsFlat.length === 0) return;
    // An armed loop is a statement about what the user wants to hear NEXT, so pressing Play
    // with one armed starts on that section rather than from the top of the song — otherwise
    // arming the chorus and hitting Play would make you sit through the intro and both verses
    // before the loop you asked for ever engages.
    if (loopTarget !== null && sectionChordCounts[loopTarget] > 0) {
      handlePlaySectionRef.current(loopTarget);
      return;
    }
    analytics.playSong(song.slug, song.title);
    startSongRef.current(0, { countIn: true });
  }, [isPlaying, stop, allChordsFlat.length, song, loopTarget, sectionChordCounts]);

  // ── The whole song from a flat position (0 = the top; repeats counted) ──────────────────
  // The engine has no "jump to", so starting part-way means scheduling the song from there:
  // the rest of the current section pass, its remaining repeats, then every later section —
  // what section play already does, one section wider. From the top with the song loop on,
  // the engine loops by itself; otherwise the pass ends in onEnded, which either goes round
  // again from the top (song loop switched on meanwhile) or stops.
  const startSongRef = useRef<(offset: number, opts?: { countIn?: boolean }) => void>(() => {});
  const startSong = useCallback(async (offset: number, opts?: { countIn?: boolean }) => {
    if (allChordsFlat.length === 0 || totalSpan === 0) return;
    const flat = Math.max(0, Math.min(totalSpan - 1, Math.floor(offset)));
    if (isPlaying) stop();
    const full = buildFullSongSections();
    let sections = full;
    if (flat > 0) {
      const si = song.sections.findIndex((s, i) => {
        const start = sectionSpanOffsets[i];
        const span = sectionChordCounts[i] * (s.repeatCount ?? 1);
        return span > 0 && flat >= start && flat < start + span;
      });
      if (si < 0) return;
      const count = sectionChordCounts[si];
      const into = flat - sectionSpanOffsets[si];
      const pass = Math.floor(into / count);
      const at = into % count;
      const sec = song.sections[si];
      const repeats = sec.repeatCount ?? 1;
      sections = [
        { ...buildPlayback(sectionStartIndices[si] + at, count - at, sec.name, 1), ...sectionArrangement(sec) },
        ...(repeats - 1 - pass > 0 ? [{ ...buildPlayback(sectionStartIndices[si], count, sec.name, repeats - 1 - pass), ...sectionArrangement(sec) }] : []),
        ...full.slice(si + 1),
      ];
      // A section loop is scheduled against the whole song; from mid-song it has nothing to hold.
      if (loopTargetRef.current !== null) { loopTargetRef.current = null; setLoopTarget(null); }
    }
    setPlayingSection(null);
    setSeekOffset(flat > 0 ? flat : null);
    setAutoFollow(true);
    setIsLoading(true);
    const withCountIn = !!opts?.countIn && countInRef.current;
    if (withCountIn) setCounting(true);
    try {
      const playPromise = play(sections, {
        countIn: withCountIn,
        bpm, metronome, instruments, loop: flat === 0 && songLoopRef.current,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
        melodic: resolvedStyle.melodic,
        audioTrack: flat === 0 ? buildAudioTrack(full) : undefined,
        onEnded: () => {
          if (songLoopRef.current) { startSongRef.current(0); return; }
          stopReasonRef.current = 'ended';
          stop();
        },
      });
      trackPlayAttempt(playPromise);
      await playPromise;
    } finally { setIsLoading(false); }
  }, [allChordsFlat.length, totalSpan, isPlaying, stop, buildFullSongSections, song.sections, song.style, sectionSpanOffsets, sectionChordCounts, sectionStartIndices, buildPlayback, play, bpm, metronome, instruments, transpose, resolvedStyle, buildAudioTrack, trackPlayAttempt]);
  startSongRef.current = startSong;

  // The song loop switched off while the engine was looping the song by itself: stop when it
  // comes round to the top instead of starting over.
  const prevChordIndexRef = useRef(-1);
  useEffect(() => {
    const prev = prevChordIndexRef.current;
    prevChordIndexRef.current = currentChordIndex;
    if (!isPlaying || songLoop || playingSection !== null || seekOffset !== null) return;
    if (prev > 0 && currentChordIndex >= 0 && currentChordIndex < prev) { stopReasonRef.current = 'ended'; stop(); }
  }, [currentChordIndex, isPlaying, songLoop, playingSection, seekOffset, stop]);

  const handleToggleLoopRef = useRef<(si?: number) => void>(() => {});

  // ── Play single section ────────────────────────────────────────────────────
  // Synchronous reentrancy guard — `isLoading` (React state) already disables the section-card
  // buttons while a play() call is in flight, but that disabling only takes effect once React
  // re-renders with the new value. Tapping a card several times in the same tick/microtask
  // (e.g. a fast double-tap, or several cards in quick succession) can fire multiple overlapping
  // handlePlaySection calls before that re-render ever happens — each one stops+restarts
  // independently, audible as several sections' worth of instruments all playing at once. A
  // ref has no such delay: it's read/written synchronously, so the second call in the same tick
  // sees it as already true and bails out immediately, no race window at all.
  const playSectionInFlightRef = useRef(false);
  const handlePlaySection = useCallback(async (si: number, opts?: { keepContext?: boolean }) => {
    if (isPlaying && playingSection === si) { stop(); return; }
    if (playSectionInFlightRef.current) return;
    playSectionInFlightRef.current = true;
    try {
      // keepContext (only ever passed by the onEnded chain below) dates from the web engine,
      // which closed its AudioContext on a stop; the app's engine never does, so chaining into
      // the next section is immediate either way.
      if (isPlaying) stop(opts?.keepContext ? { keepContext: true } : undefined);
      if (sectionChordCounts[si] === 0) return;
      analytics.playSongSection(song.slug, song.sections[si].name);
      // Counted in when someone presses a section's ▷, not when one section chains into the next.
      const withCountIn = countInRef.current && !opts?.keepContext;
      if (withCountIn) setCounting(true);
      setPlayingSection(si);
      setAutoFollow(true);
      setIsLoading(true);
      try {
      const sectionAudioRange = song.sections[si]?.audioRange;
      const sectionPlayPromise = play([{ ...buildPlayback(sectionStartIndices[si], sectionChordCounts[si], song.sections[si].name, song.sections[si].repeatCount ?? 1), ...sectionArrangement(song.sections[si]) }], {
        // Soloing one section plays it once, then — like reaching that point during full-song
        // playback — carries on into whatever comes next (see onEnded), rather than just going
        // quiet. The Loop button is what makes it stick on one section instead; handled live via
        // loopingSectionIndex (see handleToggleLoop) rather than this static flag, so toggling
        // it mid-playback works without restarting.
        // Exactly ONE section is scheduled here, so the engine's loop index for it is 0 —
        // that is the whole reason loopTarget is kept as a song.sections index and translated
        // at the boundary instead of being stored in the engine's frame of reference.
        bpm, metronome, instruments, loop: false, countIn: withCountIn,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [],
        loopingSectionIndex: loopTargetRef.current === si ? 0 : null,
        melodic: resolvedStyle.melodic,
        onEnded: () => {
          // A section queued via the mobile Sections panel (see handleSectionCardTap) takes
          // priority over the natural next-neighbor chain — that's the whole point of queueing
          // instead of jumping immediately. Read via ref (not the `queuedSectionIndex` state
          // closed over at play()-call time) since this callback can fire long after this
          // specific handlePlaySection call was made, with the queue having changed since.
          const queued = queuedSectionIndexRef.current;
          if (queued !== null) {
            setQueuedSectionIndex(null);
            handlePlaySectionRef.current(queued, { keepContext: true });
            return;
          }
          const next = findPlayableNeighbor(si, 1);
          if (next !== null) { handlePlaySectionRef.current(next, { keepContext: true }); return; }
          // No next section to chain into — this is a genuine "the listen finished on its
          // own" stop, not the user cutting it off. See stopReasonRef above.
          stopReasonRef.current = 'ended';
          stop();
        },
        // Only one section is ever scheduled here, so its own audioRange (if set) can be
        // treated as the whole clip for this play() call — a whole-song-scoped range
        // (song.audioWholeRange) has no well-defined slice for an isolated section preview.
        audioTrack: song.audioTrack && sectionAudioRange
          ? { url: song.audioTrack.url, wholeRange: sectionAudioRange }
          : undefined,
      });
      trackPlayAttempt(sectionPlayPromise);
      await sectionPlayPromise;
    } finally { setIsLoading(false); }
    } finally { playSectionInFlightRef.current = false; }
  }, [isPlaying, playingSection, play, stop, bpm, metronome, song.slug, song.style, sectionStartIndices, sectionChordCounts, song.sections, transpose, buildPlayback, instruments, resolvedStyle, song.audioTrack, findPlayableNeighbor, trackPlayAttempt]);
  handlePlaySectionRef.current = handlePlaySection;

  // ── Deliver a queued section during FULL-SONG playback ──────────────────────────────────
  // Solo-section play has an explicit onEnded hook (above) that can check the queue directly
  // at the exact right moment — clean, no extra machinery. Full-song play has no such hook at
  // all (it's one continuous `loop: true` schedule; onEnded never fires), so the only external
  // signal available is activeSectionIndex changing on its own once the engine crosses into
  // the next section. When that happens with a queue pending, immediately redirect into solo
  // play of the queued section instead — `keepContext` makes this gapless, and the natural
  // next section will have been audible for at most a few tens of ms (the engine reports its
  // position ~30 times a second), not long enough to be a perceptible glitch. Guarded to
  // solo-mode-off specifically so this never double-fires alongside the onEnded path above.
  const prevActiveSectionIndexRef = useRef<number | null>(activeSectionIndex);
  useEffect(() => {
    const prev = prevActiveSectionIndexRef.current;
    prevActiveSectionIndexRef.current = activeSectionIndex;
    if (playingSection !== null) return; // solo mode already handled via onEnded above
    if (queuedSectionIndex === null) return;
    if (prev === activeSectionIndex) return; // no natural transition happened yet
    if (activeSectionIndex === queuedSectionIndex) { setQueuedSectionIndex(null); return; }
    if (activeSectionIndex !== null) {
      const target = queuedSectionIndex;
      setQueuedSectionIndex(null);
      handlePlaySection(target, { keepContext: true });
    }
  }, [activeSectionIndex, playingSection, queuedSectionIndex, handlePlaySection]);

  // ── Section card tap from the mobile Sections panel — queues instead of interrupting ────
  // Tapping the section that's ALREADY sounding is a no-op (not a stop/restart — the panel is
  // for navigation, not an alternate stop button; Play/Stop already owns that). Tapping a
  // DIFFERENT section while something is playing queues it to take over as soon as the current
  // one reaches a natural end, rather than cutting it off immediately; tapping the already-
  // queued card again cancels the queue. A loop on the current section would otherwise repeat
  // it forever and the queue would never get its turn, so engaging a queue cancels any active
  // loop (handleToggleLoop does the symmetric thing: engaging a loop cancels any pending queue).
  const handleSectionCardTap = useCallback((si: number) => {
    if (!isPlaying) { handlePlaySection(si); return; }
    if (si === activeSectionIndex) return;
    if (si === queuedSectionIndex) { setQueuedSectionIndex(null); return; }
    if (loopTarget !== null) {
      loopTargetRef.current = null;
      setLoopTarget(null);
      updatePlaybackOptions({ loopingSectionIndex: null });
    }
    setQueuedSectionIndex(si);
  }, [isPlaying, activeSectionIndex, queuedSectionIndex, loopTarget, handlePlaySection, updatePlaybackOptions]);

  // ── Arm / disarm the loop on a section ─────────────────────────────────────────────────
  // `si` is a song.sections index; omitting it targets whatever is sounding (the transport's
  // own loop button). Crucially this does NOT require playback to be running — arming while
  // stopped is the point, and handlePlay picks the armed section up as its starting point.
  const handleToggleLoop = useCallback((si?: number) => {
    const target = si ?? activeSectionIndex;
    if (target == null || sectionChordCounts[target] === 0) return;

    const next = loopTargetRef.current === target ? null : target;
    loopTargetRef.current = next;
    setLoopTarget(next);
    analytics.songLoopToggled(song.slug, song.sections[target]?.name ?? '', next !== null);
    // Engaging a loop means "stay here indefinitely" — that's incompatible with an already-
    // queued section (see handleSectionCardTap), which would otherwise sit waiting forever.
    if (next !== null) setQueuedSectionIndex(null);

    if (!isPlaying) return;

    // Full-song playback: the scheduled Section[] IS song.sections, so the index maps 1:1 and
    // the loop can be engaged live — it simply takes effect when playback reaches that section.
    if (playingSection === null && seekOffset === null) {
      updatePlaybackOptions({ loopingSectionIndex: next });
      return;
    }
    // Solo-section playback: only that one section is scheduled, so it is index 0 and nothing
    // else is loopable in place. Disarming, or arming the section already sounding, is a live
    // update; arming a DIFFERENT one can only mean "take me there", which needs a real
    // re-schedule (no keepContext — the user is cutting the current section off mid-flight,
    // and the already-scheduled audio has to be killed with the context).
    if (next === null || next === playingSection) {
      updatePlaybackOptions({ loopingSectionIndex: next === null ? null : 0 });
      return;
    }
    handlePlaySectionRef.current(next);
  }, [activeSectionIndex, sectionChordCounts, isPlaying, playingSection, seekOffset, updatePlaybackOptions, song.slug, song.sections]);
  handleToggleLoopRef.current = handleToggleLoop;

  // The bar's loop button: off → the section playing (or the first, when stopped) → the whole
  // song → off.
  const loopMode: 'off' | 'section' | 'song' = loopTarget !== null ? 'section' : songLoop ? 'song' : 'off';
  const handleCycleLoop = useCallback(() => {
    if (loopTargetRef.current !== null) {
      handleToggleLoopRef.current(loopTargetRef.current);
      setSongLoop(true);
      return;
    }
    if (songLoopRef.current) { setSongLoop(false); return; }
    const target = activeSectionIndex ?? sectionChordCounts.findIndex(c => c > 0);
    if (target >= 0) handleToggleLoopRef.current(target);
  }, [activeSectionIndex, sectionChordCounts]);

  // ── Export WAV ─────────────────────────────────────────────────────────────
  const handleExportWav = useCallback(async () => {
    setIsExportingWav(true);
    const began = performance.now();
    try {
      const sections = buildFullSongSections();
      // Built-in styles only for public songs ("Mis ritmos" belong to the editor).
      // The file is what the player plays: the same engine, in a Worker.
      downloadBlob(await exportSongWav({
        song: { sections, bpm, transposition: transpose, instrumentSettings: instruments },
        style: resolvedStyle,
        lookup: makeStyleLookup([], () => null),
      }), `${song.title} - ${song.artist}.wav`);
      analytics.songExportWav(song.slug, performance.now() - began);
    } catch (error) {
      console.error('[EXPORT] song WAV failed', error);
      analytics.songExportWavFailed(song.slug);
    } finally {
      setIsExportingWav(false);
    }
  }, [bpm, song, transpose, buildFullSongSections, instruments, resolvedStyle]);

  // ── Export MIDI ────────────────────────────────────────────────────────────
  const handleExportMidi = useCallback(() => {
    const sections = buildFullSongSections();
    exportMidi(sections, bpm, transpose, `${song.title} - ${song.artist}`);
    analytics.songExportMidi(song.slug);
  }, [bpm, song, transpose, buildFullSongSections]);

  // Wraps setTranspose so every entry point into the Pitch stepper (the practice panel's
  // SongTempoTab today, the inline preview's SongPlayerBar) reports the same event —
  // see analytics.songTransposed for why it's coalesced.
  const handleTransposeChange = useCallback((v: number) => {
    setTranspose(v);
    analytics.songTransposed(song.slug, v);
  }, [song.slug]);

  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  // Where the currently-playing Section[]'s own chord-count position sits within the full
  // song's timeline — 0 when playing/looping the full song (currentChordIndex is already
  // full-song-relative there), or that song-section's own offset when soloing one section
  // (buildPlayback's array always counts from 0, so without this the bar would restart from
  // the left edge every time instead of showing where that section actually falls, e.g. a
  // chorus at the song's midpoint). SongPlayerBar combines this with the live chord index
  // and a real-time fraction itself (see ProgressFill) so the fill animates continuously
  // instead of snapping once per chord.
  const baseChordOffset = playingSection !== null ? sectionSpanOffsets[playingSection] : (seekOffset ?? 0);

  // ── For the mobile Sections panel's per-card progress ring — the active section's own span
  // (repeat-aware), and whether the current playback is a solo-section play (playbackPosition
  // already 0-based within it) vs full-song play (playbackPosition is global, needs localizing
  // by spanStart) — see SongSectionsTab.tsx's ActiveRing.
  const activeSectionSpanStart = activeSectionIndex != null ? sectionSpanOffsets[activeSectionIndex] : 0;
  const activeSectionSpanLength = activeSectionIndex != null
    ? sectionChordCounts[activeSectionIndex] * (song.sections[activeSectionIndex].repeatCount ?? 1)
    : 0;
  const isSoloSection = playingSection !== null;

  // Passes the transposed sections and the listener's current BPM, so the editor opens
  // with exactly what they were hearing rather than the song's written pitch/tempo.
  const editorUrl = buildSongEditorUrl(song, { bpm, sections: editorSectionsData });

  // Mixer changes are reported per channel rather than as one "user touched the mixer" event:
  // which channel gets muted is the interesting signal (muting Keys to play the piano part is
  // a different session from muting Drums because the click is annoying).
  const handleInstrumentsChange = useCallback((next: InstrumentState[]) => {
    const prev = instrumentStates;
    const changed = next.find((inst, i) => {
      const before = prev[i];
      return before && (before.muted !== inst.muted || before.solo !== inst.solo || before.volume !== inst.volume);
    });
    if (changed) {
      const before = prev.find(p => p.id === changed.id);
      const action = before && before.muted !== changed.muted ? 'mute'
        : before && before.solo !== changed.solo ? 'solo'
        : 'volume';
      analytics.songMixerChanged(song.slug, changed.id, action);
    }
    setInstrumentStates(next);
  }, [instrumentStates, song.slug]);

  const handleMetronomeChange = useCallback((enabled: boolean) => {
    setMetronome(enabled);
    analytics.songMetronomeToggled(song.slug, enabled);
  }, [song.slug]);

  const handleDensityChange = useCallback((next: Density) => {
    setDensity(next);
    analytics.songDensityChanged(song.slug, next);
  }, [song.slug]);

  const handleNotationChange = useCallback((next: SongNotation) => {
    setNotation(next);
    analytics.songNotationChanged(song.slug, next);
  }, [setNotation, song.slug]);

  // The diagram strip (rendered here, under the toolbar) lists each chord once, in order.
  const uniqueChords = useMemo(() => [...new Set(extractChordsFromSong(song))], [song]);
  // The bar's timeline: each playable section and its share of the song.
  const timelineSegments = useMemo(() => song.sections
    .map((s, si) => ({ sectionIndex: si, name: s.name, span: sectionChordCounts[si] * (s.repeatCount ?? 1) }))
    .filter(s => s.span > 0), [song.sections, sectionChordCounts]);
  // "56 bars · 3:18" at the end of the song map.
  const songSummary = useMemo(() => {
    const secs = Math.round(totalBeats * 60 / (bpm || 1));
    return `${Math.round(totalBeats / 4)} bars · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }, [totalBeats, bpm]);

  // The toolbar sticks under the site header; ChordAside's pinned strip sticks under the toolbar,
  // so it needs the toolbar's live height (--song-toolbar-h) — the row wraps at narrower widths.
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--song-toolbar-h', `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The other-keys table under the chart (plain Astro markup) asks for a key with an event.
  useEffect(() => {
    if (inline) return;
    const onSet = (e: Event) => {
      const s = (e as CustomEvent<{ semitones: number }>).detail?.semitones;
      if (typeof s !== 'number' || !Number.isFinite(s)) return;
      analytics.songKeyOpened(song.slug, 'table');
      handleTransposeChange(Math.max(-6, Math.min(6, s)));
    };
    window.addEventListener('song-set-transpose', onSet);
    return () => window.removeEventListener('song-set-transpose', onSet);
  }, [inline, song.slug, handleTransposeChange]);

  const leftHanded = useLeftHanded();
  // The "Aa" menu, shared by the desktop toolbar and the phone's Options sheet.
  const displayOptions = (showColumns: boolean) => (
    <DisplayOptions
      showColumns={showColumns}
      textScale={textScale} onTextScaleChange={handleTextScaleChange}
      columns={display.columns} onColumnsChange={(columns) => updateDisplay({ columns })}
      spacing={display.spacing} onSpacingChange={(spacing) => updateDisplay({ spacing })}
      accidentals={display.accidentals} onAccidentalsChange={(accidentals) => updateDisplay({ accidentals })}
      hoverDiagrams={display.hoverDiagrams} onHoverDiagramsChange={(hoverDiagrams) => updateDisplay({ hoverDiagrams })}
      leftHanded={leftHanded} onLeftHandedChange={setLeftHanded}
    />
  );

  const handleOpenPractice = useCallback((surface: 'bar' | 'dock' | 'options') => {
    setPracticeOpen(true);
    analytics.songPracticeOpened(song.slug, surface);
  }, [song.slug]);

  // Everything SongPracticePanel needs, shared by its two homes: the sheet the bottom bar opens,
  // and — with LEGACY_PRACTICE_PANEL on — the old inline panel under the header.
  const practicePanelProps = {
    sectionMarkers,
    activeSectionIndex,
    onSelectSection: handleSectionCardTap,
    queuedSectionIndex,
    isPlaying,
    loopTargetIndex: loopTarget,
    onToggleLoop: handleToggleLoop,
    isLoading,
    isSoloSection,
    activeSectionSpanStart,
    activeSectionSpanLength,
    instruments: instrumentStates,
    onInstrumentsChange: handleInstrumentsChange,
    hasVocalTrack: !!song.audioTrack,
    vocalMuted,
    vocalVolume,
    onVocalMutedChange: setVocalMuted,
    onVocalVolumeChange: setVocalVolume,
    vocalForcedMuted,
    bpm,
    originalBpm: song.bpm,
    onBpmChange: setBpm,
    transpose,
    onTransposeChange: handleTransposeChange,
    songKey: song.key,
    metronome,
    onMetronomeChange: handleMetronomeChange,
    songSlug: song.slug,
    allChordsCount: allChordsFlat.length,
    isExportingWav,
    onExportWav: handleExportWav,
    onExportMidi: handleExportMidi,
    editorUrl,
    showWavExport: true,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {inline ? (
        /* ─ SongCreator's preview dialog — unchanged top transport bar ─ */
        <SongPlayerBar
          song={song}
          isPlaying={isPlaying}
          isLoading={isLoading}
          isExportingWav={isExportingWav}
          bpm={bpm}
          transpose={transpose}
          displayKey={displayKey}
          baseChordOffset={baseChordOffset}
          totalChordSpan={totalSpan}
          allChordsCount={allChordsFlat.length}
          sectionMarkers={sectionMarkers}
          activeSectionIndex={activeSectionIndex}
          onSeekSection={handlePlaySection}
          onPanelSectionTap={handleSectionCardTap}
          queuedSectionIndex={queuedSectionIndex}
          loopTargetIndex={loopTarget}
          onToggleLoop={handleToggleLoop}
          onPlayPause={handlePlay}
          onBpmChange={(v) => setBpm(v)}
          onTransposeChange={handleTransposeChange}
          onExportWav={handleExportWav}
          onExportMidi={handleExportMidi}
          editorUrl={editorUrl}
          inline={inline}
          showWavExport
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen(v => !v)}
          isSoloSection={isSoloSection}
          activeSectionSpanStart={activeSectionSpanStart}
          activeSectionSpanLength={activeSectionSpanLength}
          instruments={instrumentStates}
          onInstrumentsChange={handleInstrumentsChange}
          metronome={metronome}
          onMetronomeChange={handleMetronomeChange}
          hasVocalTrack={!!song.audioTrack}
          vocalMuted={vocalMuted}
          vocalVolume={vocalVolume}
          onVocalMutedChange={setVocalMuted}
          onVocalVolumeChange={setVocalVolume}
          vocalForcedMuted={vocalForcedMuted}
          originalBpm={song.bpm}
        />
      ) : (
        <>
          {/* ─ Header transport (Play/Stop + Practice door) — portalled into the now
              non-sticky song header in [slug].astro ─ */}
          {headerTransportTarget && createPortal(
            <SongHeaderTransport
              isPlaying={isPlaying}
              isLoading={isLoading}
              onPlayPause={handlePlay}
              practiceOpen={practiceOpen}
              onTogglePractice={() => setPracticeOpen(v => !v)}
              showPractice={LEGACY_PRACTICE_PANEL}
            />,
            headerTransportTarget,
          )}

          {LEGACY_PRACTICE_PANEL ? (
            /* ─ The pre-Sep-2026 Practice panel, expanding in normal document flow ─ */
            practicePanelTarget && createPortal(
              <SongPracticePanel open={practiceOpen} {...practicePanelProps} />,
              practicePanelTarget,
            )
          ) : (
            /* ─ The same panel, opened from the bottom bar ─ */
            <Sheet open={practiceOpen} onOpenChange={setPracticeOpen}>
              <SheetContent
                side="bottom"
                className="mx-auto max-w-2xl rounded-t-2xl px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto"
              >
                <SheetTitle className="text-base">Practice</SheetTitle>
                <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-3.5 py-2.5">
                  <span className="text-sm font-medium">Count-in (1 bar)<small className="block text-xs font-normal text-muted-foreground">Four clicks before the music starts</small></span>
                  <Switch checked={countIn} onCheckedChange={handleCountInChange} aria-label="Count-in" />
                </div>
                <SongPracticePanel open {...practicePanelProps} />
              </SheetContent>
            </Sheet>
          )}

          {/* Portalled to <body> (headerTransportTarget doubles as the "mounted" signal): this
              island lives inside the Chords tab panel, and the bar has to stay put on Lyrics. */}
          {headerTransportTarget && createPortal(<SongTransportBar
            songSlug={song.slug}
            isPlaying={isPlaying}
            isLoading={isLoading}
            onPlayPause={handlePlay}
            sectionName={barSectionName}
            nowChord={barNowChord}
            nowChordName={barNowName}
            nextChord={barNextChord}
            activeDuration={activeDuration}
            currentChordIndex={currentChordIndex}
            baseChordOffset={baseChordOffset}
            totalChordSpan={totalSpan}
            cumulativeBeats={cumulativeBeatsAtChordIndex}
            totalBeats={totalBeats}
            bpm={bpm}
            originalBpm={song.bpm}
            onBpmChange={setBpm}
            metronome={metronome}
            onMetronomeChange={handleMetronomeChange}
            loopMode={loopMode}
            loopLabel={loopTarget !== null ? sectionShort(song.sections[loopTarget]?.name ?? '') : 'ALL'}
            loopTitle={loopTarget !== null ? `Loop: ${song.sections[loopTarget]?.name}` : songLoop ? 'Loop: whole song' : 'Loop: off'}
            onToggleLoop={handleCycleLoop}
            onSeek={(flat) => startSongRef.current(flat)}
            transpose={transpose}
            onTransposeChange={handleTransposeChange}
            keyName={keyName}
            capo={effCapo}
            showCapo={capoApplies}
            onCapoChange={handleCapoChange}
            autoScroll={autoScroll}
            onAutoScrollChange={handleAutoScrollChange}
            scrollSpeed={scrollSpeed}
            onScrollSpeedChange={handleScrollSpeedChange}
            textScale={textScale}
            onTextScaleChange={handleTextScaleChange}
            stage={stage}
            onStageChange={handleStageChange}
            displayOptions={displayOptions(false)}
            notation={notation}
            onNotationChange={handleNotationChange}
            displayKey={shapeKey}
            density={density}
            onDensityChange={handleDensityChange}
            onOpenPractice={handleOpenPractice}
            segments={timelineSegments}
          />, document.body)}
        </>
      )}

      {/* ─ Vocal reference muted while transposed — can't follow the pitch shift yet ─ */}
      {song.audioTrack && transpose !== 0 && (
        <p className={`text-xs text-muted-foreground text-center italic ${inline ? 'px-5 pt-2' : 'pt-2'}`}>
          Referencia vocal silenciada — tono transpuesto
        </p>
      )}

      {/* ─ The count-in: 4, 3, 2, 1 from the engine's own clock (CountdownOverlay reads it) ─ */}
      {!inline && counting && (
        <CountdownOverlay
          onComplete={() => setCounting(false)}
          onCancel={() => { setCounting(false); stop(); }}
        />
      )}

      {/* ─ Song chart ─ */}
      <div className={inline ? 'mt-4 px-5 pb-5' : ''}>
        {!inline && (<>
          {/* The song map: the arrangement in order, in section colours. It scrolls with the page;
              the toolbar under it is what stays. */}
          <div className="mb-3 md:mb-0 py-2.5 border-t md:border-y border-border">
            <SongStructureMap
              items={structureItems}
              activeSectionIndex={activeSectionIndex}
              queuedSectionIndex={queuedSectionIndex}
              onSelect={handleSectionCardTap}
              summary={songSummary}
              spans={structureItems.map(it => ({ start: sectionSpanOffsets[it.sectionIndex], span: sectionChordCounts[it.sectionIndex] * it.repeatCount }))}
              baseChordOffset={baseChordOffset}
            />
          </div>
          {/* From md up this row is the chart's toolbar and stays under the site header while you
              read (--song-nav-h: the navbar's 64px, 0 in stage mode). The key leads the row: it is
              the control this page most needs people to find. On phones the row scrolls with the
              page and the key lives in the bottom bar instead, so there is one fixed bar, not two.
              Its height goes to --song-toolbar-h for ChordAside's pinned strip, which sits under it. */}
          <div ref={toolbarRef} className="hidden md:flex flex-wrap items-center gap-2.5 mb-4 md:sticky md:top-[var(--song-nav-h,4rem)] md:z-30 md:-mx-3 md:px-3 md:py-2 md:bg-background/95 md:backdrop-blur-md md:border-b md:border-border">
            <div className="hidden md:flex items-center gap-1 shrink-0">
              <SongKeyControl
                surface="toolbar"
                transpose={transpose}
                onTransposeChange={handleTransposeChange}
                keyName={keyName}
                songSlug={song.slug}
                capo={capo}
                onCapoChange={handleCapoChange}
                showCapo={capoApplies}
              />
              {transpose !== 0 && (
                <button
                  type="button"
                  onClick={() => handleTransposeChange(0)}
                  className="px-2 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                >
                  Back to {song.key}
                </button>
              )}
            </div>
              <NotationSelector
                value={notation}
                onChange={handleNotationChange}
                displayKey={shapeKey}
              />
              <div className="inline-flex p-0.5 rounded-lg bg-secondary/60">
                {([
                  ['full', 'Chords + lyrics'],
                  ['lyrics', 'Lyrics'],
                  ['chords', 'Chords'],
                ] as const).map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDensityChange(d)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                      ${density === d ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="hidden md:block flex-1" />
              <AutoscrollControl
                className="hidden md:inline-flex"
                on={autoScroll}
                onChange={handleAutoScrollChange}
                speed={scrollSpeed}
                onSpeedChange={handleScrollSpeedChange}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Text and diagrams"
                    className={`hidden md:inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${textScale !== 100 ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                  >
                    <Type className="w-4 h-4" />
                    {textScale !== 100 && <span className="tabular-nums">{textScale}%</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-3">
                  {displayOptions(true)}
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => handleStageChange(!stage)}
                aria-pressed={stage}
                title={stage ? 'Leave stage mode (Esc)' : 'Stage mode: only the chart, full screen (F)'}
                className={`hidden md:inline-grid place-items-center w-9 h-9 rounded-lg border transition-colors ${stage ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
              >
                {stage ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
          </div>
          {uniqueChords.length > 0 && (
            <ChordAside chords={uniqueChords} songKey={song.key} songSlug={song.slug} className="mb-6" />
          )}
        </>)}

        {/* The chart body. Text size is a zoom on this block only — the chart mixes several
            fixed Tailwind sizes, and zoom scales them all (and the layout) together, while the
            sticky toolbar above keeps its size. */}
        <div ref={chartBodyRef} style={!inline && textScale !== 100 ? { zoom: textScale / 100 } : undefined}>
        {!inline && density === 'chords' ? (
          <SongChordsOnlyChart
            rows={chordOnlyRows}
            activeSectionIndex={activeSectionIndex}
            activeGlobal={activeGlobal}
            isPlaying={isPlaying}
            isLoading={isLoading}
            loopTargetIndex={loopTarget}
            onPlaySection={handlePlaySection}
            onToggleLoop={handleToggleLoop}
            isSectionPlaying={(si) => isPlaying && playingSection === si}
            songSlug={song.slug}
            notation={notation}
            displayKey={shapeKey}
            soundingChord={soundingChord}
          />
        ) : (
          <div className={inline ? '' : display.columns === '1' ? '' : display.columns === '2' ? 'md:columns-2 md:gap-10' : 'lg:columns-2 lg:gap-12'}>
            {displayedSections.map((section, si) => {
              const repeatOfIdx = sectionIsRepeatOf[si];
              return (
                <SongSectionChart
                  key={si}
                  section={section}
                  repeatCount={song.sections[si]?.repeatCount ?? 1}
                  isActiveSection={activeSectionIndex === si}
                  isSectionPlaying={isPlaying && playingSection === si}
                  isSectionPlayable={sectionChordCounts[si] > 0}
                  isSectionLoopArmed={loopTarget === si}
                  collapsed={collapsedSections.has(si)}
                  onToggleCollapse={() => toggleSection(si)}
                  onPlaySection={() => handlePlaySection(si)}
                  onToggleLoop={() => handleToggleLoop(si)}
                  isLoading={isLoading}
                  isPlaying={isPlaying}
                  activeGlobal={activeGlobal}
                  currentChordIndex={currentChordIndex}
                  bpm={bpm}
                  songSlug={song.slug}
                  notation={notation}
                  displayKey={shapeKey}
                  soundingChord={soundingChord}
                  compact={!inline && display.spacing === 'compact'}
                  lyricsOnly={!inline && density === 'lyrics'}
                  hoverDiagrams={display.hoverDiagrams}
                  chordRefs={chordRefs}
                  openTooltipIdx={openTooltipIdx}
                  onOpenTooltip={setOpenTooltipIdx}
                  repeatOfName={!inline && repeatOfIdx !== null ? song.sections[repeatOfIdx]?.name ?? null : null}
                />
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ─── Public export (wraps with PlaybackProvider) ──────────────────────────────
// The WAV button renders a whole song in a Worker with the app's engine (well under a second
// for most songs, 2.7 s for a 2:47 one), so every song page offers it.
export default function SongChordPlayer(
  { song, inline }: { song: Song; inline?: boolean },
) {
  return (
    <PlaybackProvider>
      <SongChordPlayerInner song={song} inline={inline} />
    </PlaybackProvider>
  );
}
