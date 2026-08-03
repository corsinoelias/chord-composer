import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString } from '@/lib/chordParser';
import { getDefaultInstrumentStates, type InstrumentState } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { createSection } from '@/lib/sections';
import { Play, Square, ChevronDown, ChevronUp, SkipBack, SkipForward, Repeat } from 'lucide-react';
import { SongPlayerBar } from '@/components/SongPlayerBar';
import { DurationDots } from '@/components/DurationDots';
import { parseLyricLine, extractChordsWithDuration, type Song } from '@/data/songs';
import ChordTooltip from '@/components/ChordTooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { playChordPreview, renderProgressionOffline } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { exportMidi } from '@/lib/midiExporter';
import { MUSICAL_STYLES } from '@/lib/styles';
import { analytics } from '@/lib/analytics';
import { encodeEditorSections, type EditorLinkSection } from '@/lib/editorLink';

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

  // Keep context BPM in sync for live tempo changes during playback
  useEffect(() => { setContextBpm(bpm); }, [bpm, setContextBpm]);

  // Keep context transposition in sync + notify ChordAside
  useEffect(() => {
    updatePlaybackOptions({ transposition: transpose });
    window.dispatchEvent(new CustomEvent('song-transpose', { detail: { semitones: transpose } }));
  }, [transpose, updatePlaybackOptions]);

  // Keep the Voz channel's manual mute/volume live during playback — engine OR's this with
  // the transpose-forced mute above (see isVocalEffectivelyMuted in audioEngine.ts).
  useEffect(() => {
    updatePlaybackOptions({ vocalMuted, vocalVolume });
  }, [vocalMuted, vocalVolume, updatePlaybackOptions]);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  // null = full song, number = which section index is playing solo
  const [playingSection, setPlayingSection] = useState<number | null>(null);
  // Index into whichever Section[] array is currently scheduled (0 for solo-section play,
  // the song-section index for full-song play) — null means "not looping a section"
  const [loopingSectionIndex, setLoopingSectionIndex] = useState<number | null>(null);
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

  const displayKey = useMemo(() => transpose === 0 ? song.key : transposeKey(song.key, transpose), [song.key, transpose]);

  const displayedSections = useMemo(() => {
    if (transpose === 0) return resolvedSections;
    const flats = FLAT_KEYS.has(displayKey);
    return resolvedSections.map(sec => ({
      ...sec,
      lines: sec.lines.map(line =>
        line.map(token => ({
          ...token,
          chord: token.chord ? transposeChordStr(token.chord, transpose, flats) : token.chord,
        }))
      ),
    }));
  }, [resolvedSections, transpose, displayKey]);

  // ── Sections in the shape the editor's ?data= param expects — one entry per
  // song section, preserving name/repeatCount/per-chord duration, using the
  // currently displayed (transposed) chord names ──────────────────────────────
  const editorSectionsData: EditorLinkSection[] = useMemo(() => {
    return displayedSections
      .map((section, si) => ({
        name: section.name,
        repeatCount: song.sections[si]?.repeatCount ?? 1,
        chords: section.lines.flatMap(line =>
          line.filter(t => t.chord).map(t => ({ c: t.chord, d: t.duration }))
        ),
      }))
      .filter(s => s.chords.length > 0);
  }, [displayedSections, song.sections]);

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
    return song.sections.map((section, si) =>
      buildPlayback(sectionStartIndices[si], sectionChordCounts[si], section.name, section.repeatCount ?? 1)
    );
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
  useEffect(() => {
    if (!isPlaying && !isLoading) { setPlayingSection(null); setLoopingSectionIndex(null); setQueuedSectionIndex(null); }
  }, [isPlaying, isLoading]);

  // ── Map the flat playback position (which advances across repeats) back to the
  // single rendered DOM token for highlighting/scrolling ──────────────────────
  const activeGlobal = useMemo(() => {
    if (!isPlaying || currentChordIndex < 0) return -1;
    if (playingSection !== null) {
      const count = sectionChordCounts[playingSection];
      if (count === 0) return -1;
      const repeatCount = song.sections[playingSection]?.repeatCount ?? 1;
      if (currentChordIndex >= count * repeatCount) return -1;
      return sectionStartIndices[playingSection] + (currentChordIndex % count);
    }
    for (let si = 0; si < song.sections.length; si++) {
      const count = sectionChordCounts[si];
      if (count === 0) continue;
      const start = sectionSpanOffsets[si];
      const span = count * (song.sections[si].repeatCount ?? 1);
      if (currentChordIndex >= start && currentChordIndex < start + span) {
        return sectionStartIndices[si] + ((currentChordIndex - start) % count);
      }
    }
    return -1;
  }, [isPlaying, currentChordIndex, playingSection, sectionChordCounts, sectionStartIndices, sectionSpanOffsets, song.sections]);

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

  // ── Which way the "jump back" pill needs to point — the active chord can end up above OR
  // below the viewport depending on which way the user scrolled, so a fixed arrow is wrong
  // half the time. Recomputed on scroll while the pill is showing. ──────────────────────────
  const [jumpDirection, setJumpDirection] = useState<'up' | 'down'>('down');

  useEffect(() => {
    if (!isPlaying || autoFollow) return;
    const updateDirection = () => {
      const el = chordRefs.current.get(activeGlobal);
      if (!el) return;
      setJumpDirection(el.getBoundingClientRect().top < window.innerHeight / 2 ? 'up' : 'down');
    };
    updateDirection();
    window.addEventListener('scroll', updateDirection, { passive: true });
    return () => window.removeEventListener('scroll', updateDirection);
  }, [isPlaying, autoFollow, activeGlobal]);

  // ── Notify ChordAside of the currently sounding chord (same event-bus pattern as transpose) ──
  const activeChordName = useMemo(() => {
    if (activeGlobal < 0) return null;
    const raw = allChordsFlat[activeGlobal];
    if (!raw) return null;
    return transpose === 0 ? raw : transposeChordStr(raw, transpose, FLAT_KEYS.has(displayKey));
  }, [activeGlobal, allChordsFlat, transpose, displayKey]);

  const activeDuration = activeGlobal >= 0 ? (allChordsWithDuration[activeGlobal]?.duration ?? 4) : 4;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('song-active-chord', {
      // rawIndex is the raw, ever-increasing playback index (not repeat-resolved) — it's what
      // DurationDots needs to correctly restart its fill on every chord instance, including
      // repeats of a section that land back on the same activeGlobal/DOM position.
      detail: { chord: activeChordName, isPlaying, duration: activeDuration, bpm, rawIndex: currentChordIndex },
    }));
  }, [activeChordName, isPlaying, activeDuration, bpm, currentChordIndex]);

  // ── Play full song ─────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying) { stop(); return; }
    if (allChordsFlat.length === 0) return;
    analytics.playSong(song.slug, song.title);
    setPlayingSection(null);
    setLoopingSectionIndex(null);
    setAutoFollow(true);
    setIsLoading(true);
    try {
      const fullSections = buildFullSongSections();
      await play(fullSections, {
        bpm, metronome: false, instruments, loop: true,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
        melodic: resolvedStyle.melodic,
        audioTrack: buildAudioTrack(fullSections),
      });
    } finally { setIsLoading(false); }
  }, [isPlaying, play, stop, allChordsFlat.length, bpm, song, transpose, buildFullSongSections, instruments, resolvedStyle, buildAudioTrack]);

  // ── Play single section ────────────────────────────────────────────────────
  // handlePlaySectionRef always holds the LATEST handlePlaySection — onEnded below needs to
  // call back into it to chain forward, but referencing the function by name from inside its
  // own useCallback body would be a stale closure (and an unlistable circular dependency);
  // a ref sidesteps both. Assigned during render (not an effect) so it's never one render
  // behind — the safe "always-up-to-date ref" pattern.
  const handlePlaySectionRef = useRef<(si: number, opts?: { keepContext?: boolean }) => void>(() => {});
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
      // keepContext (only ever passed by the onEnded chain below) skips the expensive
      // AudioContext close+reopen — safe here specifically because the previous section ended
      // on its own with nothing left scheduled, unlike a user cutting playback off mid-flight.
      // It's also what makes the transition instant: closing the context would invalidate the
      // guitar-soundfont/bass-sample caches (both keyed by AudioContext identity), forcing a
      // multi-second re-decode right as the next section is supposed to start (see
      // stopPlaybackKeepContext in audioEngine.ts).
      if (isPlaying) stop(opts?.keepContext ? { keepContext: true } : undefined);
      if (sectionChordCounts[si] === 0) return;
      analytics.playSongSection(song.slug, song.sections[si].name);
      setPlayingSection(si);
      setLoopingSectionIndex(null);
      setAutoFollow(true);
      setIsLoading(true);
      try {
      const sectionAudioRange = song.sections[si]?.audioRange;
      await play([buildPlayback(sectionStartIndices[si], sectionChordCounts[si], song.sections[si].name, song.sections[si].repeatCount ?? 1)], {
        // Soloing one section plays it once, then — like reaching that point during full-song
        // playback — carries on into whatever comes next (see onEnded), rather than just going
        // quiet. The Loop button is what makes it stick on one section instead; handled live via
        // loopingSectionIndex (see handleToggleLoop) rather than this static flag, so toggling
        // it mid-playback works without restarting.
        bpm, metronome: false, instruments, loop: false,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
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
          if (next !== null) handlePlaySectionRef.current(next, { keepContext: true });
          else stop();
        },
        // Only one section is ever scheduled here, so its own audioRange (if set) can be
        // treated as the whole clip for this play() call — a whole-song-scoped range
        // (song.audioWholeRange) has no well-defined slice for an isolated section preview.
        audioTrack: song.audioTrack && sectionAudioRange
          ? { url: song.audioTrack.url, wholeRange: sectionAudioRange }
          : undefined,
      });
    } finally { setIsLoading(false); }
    } finally { playSectionInFlightRef.current = false; }
  }, [isPlaying, playingSection, play, stop, bpm, song.slug, song.style, sectionStartIndices, sectionChordCounts, song.sections, transpose, buildPlayback, instruments, resolvedStyle, song.audioTrack, findPlayableNeighbor]);
  handlePlaySectionRef.current = handlePlaySection;

  // ── Deliver a queued section during FULL-SONG playback ──────────────────────────────────
  // Solo-section play has an explicit onEnded hook (above) that can check the queue directly
  // at the exact right moment — clean, no extra machinery. Full-song play has no such hook at
  // all (it's one continuous `loop: true` schedule; onEnded never fires), so the only external
  // signal available is activeSectionIndex changing on its own once the engine crosses into
  // the next section. When that happens with a queue pending, immediately redirect into solo
  // play of the queued section instead — `keepContext` makes this gapless, and the natural
  // next section will have been audible for at most a few ms (well inside the ~100ms scheduling
  // lookahead in audioEngine.ts), not long enough to be a perceptible glitch. Guarded to
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
    if (loopingSectionIndex !== null) {
      setLoopingSectionIndex(null);
      updatePlaybackOptions({ loopingSectionIndex: null });
    }
    setQueuedSectionIndex(si);
  }, [isPlaying, activeSectionIndex, queuedSectionIndex, loopingSectionIndex, handlePlaySection, updatePlaybackOptions]);

  // ── Prev / next section — jumps to the neighboring playable section, solo ──────────────
  const handlePrevSection = useCallback(() => {
    if (activeSectionIndex == null) return;
    const prev = findPlayableNeighbor(activeSectionIndex, -1);
    if (prev !== null) handlePlaySection(prev);
  }, [activeSectionIndex, findPlayableNeighbor, handlePlaySection]);

  const handleNextSection = useCallback(() => {
    if (activeSectionIndex == null) return;
    const next = findPlayableNeighbor(activeSectionIndex, 1);
    if (next !== null) handlePlaySection(next);
  }, [activeSectionIndex, findPlayableNeighbor, handlePlaySection]);

  // ── Loop the currently sounding section — index is relative to whichever Section[] array
  // is scheduled right now (0 for solo play, activeSectionIndex for full-song play) ─────────
  const handleToggleLoop = useCallback(() => {
    if (loopingSectionIndex !== null) {
      setLoopingSectionIndex(null);
      updatePlaybackOptions({ loopingSectionIndex: null });
      return;
    }
    if (activeSectionIndex == null) return;
    const idx = playingSection !== null ? 0 : activeSectionIndex;
    setLoopingSectionIndex(idx);
    updatePlaybackOptions({ loopingSectionIndex: idx });
    // Engaging a loop means "stay here indefinitely" — that's incompatible with an already-
    // queued section (see handleSectionCardTap), which would otherwise sit waiting forever.
    setQueuedSectionIndex(null);
  }, [loopingSectionIndex, playingSection, activeSectionIndex, updatePlaybackOptions]);

  // ── Export WAV ─────────────────────────────────────────────────────────────
  const handleExportWav = useCallback(async () => {
    setIsExportingWav(true);
    try {
      const sections = buildFullSongSections();
      const buffer = await renderProgressionOffline(sections, bpm, instruments, resolvedStyle, transpose);
      await encodeAndDownloadMp3(buffer, `${song.title} - ${song.artist}.wav`);
    } finally {
      setIsExportingWav(false);
    }
  }, [bpm, song, transpose, buildFullSongSections, instruments, resolvedStyle]);

  // ── Export MIDI ────────────────────────────────────────────────────────────
  const handleExportMidi = useCallback(() => {
    const sections = buildFullSongSections();
    exportMidi(sections, bpm, transpose, `${song.title} - ${song.artist}`);
  }, [bpm, song, transpose, buildFullSongSections]);

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
  const baseChordOffset = playingSection !== null ? sectionSpanOffsets[playingSection] : 0;

  const canGoPrevSection = activeSectionIndex != null && findPlayableNeighbor(activeSectionIndex, -1) !== null;
  const canGoNextSection = activeSectionIndex != null && findPlayableNeighbor(activeSectionIndex, 1) !== null;

  // ── For the mobile Sections panel's per-card progress ring — the active section's own span
  // (repeat-aware), and whether the current playback is a solo-section play (playbackPosition
  // already 0-based within it) vs full-song play (playbackPosition is global, needs localizing
  // by spanStart) — see SongSectionsTab.tsx's ActiveRing.
  const activeSectionSpanStart = activeSectionIndex != null ? sectionSpanOffsets[activeSectionIndex] : 0;
  const activeSectionSpanLength = activeSectionIndex != null
    ? sectionChordCounts[activeSectionIndex] * (song.sections[activeSectionIndex].repeatCount ?? 1)
    : 0;
  const isSoloSection = playingSection !== null;

  const editorUrl = `/chord-player/?data=${encodeEditorSections(editorSectionsData)}&bpm=${bpm}&style=${song.style}&title=${encodeURIComponent(`${song.title} - ${song.artist}`)}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={inline ? '' : 'pb-24'}>
      {/* ─ Player bar: top when inline, fixed-bottom when not ─ */}
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
        canGoPrevSection={canGoPrevSection}
        canGoNextSection={canGoNextSection}
        onPrevSection={handlePrevSection}
        onNextSection={handleNextSection}
        isLoopingSection={loopingSectionIndex !== null}
        onToggleLoop={handleToggleLoop}
        onPlayPause={handlePlay}
        onBpmChange={(v) => setBpm(v)}
        onTransposeChange={(v) => setTranspose(v)}
        onExportWav={handleExportWav}
        onExportMidi={handleExportMidi}
        editorUrl={editorUrl}
        inline={inline}
        showWavExport={song.slug !== 'hay-poder-yeshua-averly-morillo'}
        consoleOpen={consoleOpen}
        onToggleConsole={() => setConsoleOpen(v => !v)}
        isSoloSection={isSoloSection}
        activeSectionSpanStart={activeSectionSpanStart}
        activeSectionSpanLength={activeSectionSpanLength}
        instruments={instrumentStates}
        onInstrumentsChange={setInstrumentStates}
        hasVocalTrack={!!song.audioTrack}
        vocalMuted={vocalMuted}
        vocalVolume={vocalVolume}
        onVocalMutedChange={setVocalMuted}
        onVocalVolumeChange={setVocalVolume}
        vocalForcedMuted={vocalForcedMuted}
        originalBpm={song.bpm}
      />

      {/* ─ Vocal reference muted while transposed — can't follow the pitch shift yet ─ */}
      {song.audioTrack && transpose !== 0 && (
        <p className={`text-xs text-muted-foreground text-center italic ${inline ? 'px-5 pt-2' : 'pt-2'}`}>
          Referencia vocal silenciada — tono transpuesto
        </p>
      )}

      {/* ─ Resume auto-scroll pill — only once the user has scrolled away during playback ─ */}
      {!inline && isPlaying && !autoFollow && (
        <button
          onClick={() => setAutoFollow(true)}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/90 transition-colors"
        >
          {jumpDirection === 'up' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Now playing
        </button>
      )}

      {/* ─ Song chart ─ */}
      <div className={`space-y-6 ${inline ? 'mt-4 px-5 pb-5' : ''}`}>
        {displayedSections.map((section, si) => {
          const collapsed = collapsedSections.has(si);

          const isSectionPlaying = isPlaying && playingSection === si;
          const isActiveSection = activeSectionIndex === si;
          const isSectionPlayable = sectionChordCounts[si] > 0;

          return (
            <div
              key={si}
              // No child here needs edge-to-edge clipping to the rounded corners (the header
              // row has no background of its own), so overflow-hidden served no visual purpose
              // — it just risked silently clipping the last lyric line when content height came
              // in a pixel or two over the card's computed height on some browsers/font metrics.
              className={`rounded-xl border transition-colors
                ${isActiveSection ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}
              `}
            >
              {/* Section header */}
              <div className="flex items-center px-4 py-2.5 gap-2">
                {/* Collapse/expand area */}
                <button
                  onClick={() => toggleSection(si)}
                  className="flex-1 flex items-center justify-between text-left hover:bg-transparent transition-colors min-w-0"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs font-bold uppercase tracking-widest truncate
                      ${isActiveSection ? 'text-primary' : 'text-muted-foreground'}
                    `}>
                      {section.name}
                    </span>
                    {(song.sections[si].repeatCount ?? 1) > 1 && (
                      <span
                        title={`Repeats ${song.sections[si].repeatCount}×`}
                        className="shrink-0 text-[10px] font-bold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5"
                      >
                        ×{song.sections[si].repeatCount}
                      </span>
                    )}
                  </span>
                  {collapsed
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                    : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                  }
                </button>

                {/* Per-section play button */}
                {isSectionPlayable && (
                  <button
                    onClick={() => handlePlaySection(si)}
                    disabled={isLoading}
                    title={isSectionPlaying ? 'Stop' : `Play ${section.name}`}
                    className={`
                      shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-all
                      ${isSectionPlaying
                        ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                      }
                    `}
                  >
                    {isSectionPlaying
                      ? <Square className="w-3 h-3" />
                      : <Play className="w-3 h-3" />
                    }
                  </button>
                )}
              </div>

              {/* Section content. pb-6 (not pb-4) — measured line heights are fractional
                  (73.5px), meaning this box already sat at a near-zero-margin fit; different
                  browsers round subpixel layout differently, so give it real slack instead of
                  relying on an exact match. */}
              {!collapsed && (
                <div className="px-4 pb-6 space-y-3">
                  {section.lines.map((line, li) => {
                    if (line.length === 0) return null;

                    // Lines with only chords (no real lyrics) = chord-only display
                    const isChordOnlyLine = line.every(t => !t.lyrics.trim());

                    return (
                      <div key={li} className={`flex flex-wrap ${isChordOnlyLine ? 'gap-x-3 gap-y-1' : ''}`}>
                        {line.map((token, ti) => {
                          if (!token.chord && !token.lyrics.trim()) return null;

                          const isActive = isPlaying && token.globalIndex === activeGlobal;
                          const hasChord = token.chord !== '';

                          return (
                            <span
                              key={ti}
                              ref={hasChord ? el => {
                                if (el) chordRefs.current.set(token.globalIndex, el);
                                else chordRefs.current.delete(token.globalIndex);
                              } : undefined}
                              className="inline-flex flex-col items-start relative max-w-full min-w-0"
                              style={{ fontFamily: 'var(--font-mono, monospace)' }}
                            >
                              {/* Chord name row */}
                              {hasChord ? (
                                <Popover
                                  open={openTooltipIdx === token.globalIndex}
                                  onOpenChange={(open) => { if (!open) setOpenTooltipIdx(null); }}
                                >
                                  <PopoverTrigger asChild>
                                    {/* Real min-h-[44px] box (not a ::before hit-area hack — that
                                        enlarges the clickable region but automated touch-target
                                        audits measure the element's own bounding box, which the
                                        pseudo-element isn't part of). The -mt/-mb negative margins
                                        pull the extra height back out of the visual layout so the
                                        chord chart doesn't visibly grow — the real box overlaps
                                        into the row above/below instead of pushing them apart. */}
                                    <button
                                      type="button"
                                      className={`
                                        relative inline-flex items-center justify-center
                                        min-h-[44px] min-w-[1ch] -mt-[14px] -mb-[12px] px-0.5
                                        text-xs font-bold whitespace-pre transition-all duration-100
                                        cursor-pointer select-none
                                        ${isActive
                                          ? 'text-primary bg-primary/15 rounded scale-105'
                                          : 'text-primary/70 hover:text-primary'
                                        }
                                      `}
                                      onMouseEnter={() => setOpenTooltipIdx(token.globalIndex)}
                                      onClick={() => {
                                        const parsed = parseChordString(token.chord);
                                        if (parsed[0]) {
                                          analytics.playChordPreview(song.slug, token.chord, 'chart');
                                          playChordPreview(parsed[0]);
                                        }
                                      }}
                                    >
                                      {token.chord}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    side="top"
                                    sideOffset={10}
                                    collisionPadding={16}
                                    className="p-0 border-none shadow-none bg-transparent overflow-visible w-auto"
                                  >
                                    <ChordTooltip chord={token.chord} />
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <span className="invisible select-none inline-flex items-center h-[18px] text-xs font-bold whitespace-pre px-0.5" style={{ minWidth: '0' }}>.</span>
                              )}

                              {/* Duration dots — only while playing */}
                              {hasChord && isPlaying && <DurationDots duration={token.duration} isActive={isActive} bpm={bpm} uid={token.globalIndex} rawIndex={currentChordIndex} className="mt-0.5" />}

                              {/* Lyrics row */}
                              {!isChordOnlyLine && (
                                <span
                                  className={`
                                    text-sm leading-relaxed whitespace-pre-wrap break-words transition-colors duration-100
                                    ${isActive
                                      ? 'text-foreground font-medium'
                                      : 'text-muted-foreground'
                                    }
                                  `}
                                >
                                  {token.lyrics || (hasChord ? ' ' : '')}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Public export (wraps with PlaybackProvider) ──────────────────────────────
export default function SongChordPlayer({ song, inline }: { song: Song; inline?: boolean }) {
  return (
    <PlaybackProvider>
      <SongChordPlayerInner song={song} inline={inline} />
    </PlaybackProvider>
  );
}
