import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString } from '@/lib/chordParser';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { createSection } from '@/lib/sections';
import { Play, Square, ChevronDown, ChevronUp } from 'lucide-react';
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

  // Keep context BPM in sync for live tempo changes during playback
  useEffect(() => { setContextBpm(bpm); }, [bpm, setContextBpm]);

  // Keep context transposition in sync + notify ChordAside
  useEffect(() => {
    updatePlaybackOptions({ transposition: transpose });
    window.dispatchEvent(new CustomEvent('song-transpose', { detail: { semitones: transpose } }));
  }, [transpose, updatePlaybackOptions]);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  // null = full song, number = which section index is playing solo
  const [playingSection, setPlayingSection] = useState<number | null>(null);
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

  // Apply the song's style's own instrument sound types (e.g. 'electric' guitar) — without
  // this, every instrument falls back to its generic default sound (guitar defaults to a
  // soundfont patch that loads over the network and can miss the first playback entirely).
  const instruments = useMemo(
    () => getEffectiveInstruments(getDefaultInstrumentStates(), resolvedStyle),
    [resolvedStyle],
  );

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

  // ── Reset playing section when playback stops ──────────────────────────────
  useEffect(() => { if (!isPlaying) setPlayingSection(null); }, [isPlaying]);

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
    setAutoFollow(true);
    setIsLoading(true);
    try {
      await play(buildFullSongSections(), {
        bpm, metronome: false, instruments,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
        melodic: resolvedStyle.melodic,
      });
    } finally { setIsLoading(false); }
  }, [isPlaying, play, stop, allChordsFlat.length, bpm, song, transpose, buildFullSongSections, instruments, resolvedStyle]);

  // ── Play single section ────────────────────────────────────────────────────
  const handlePlaySection = useCallback(async (si: number) => {
    if (isPlaying && playingSection === si) { stop(); return; }
    if (isPlaying) stop();
    if (sectionChordCounts[si] === 0) return;
    setPlayingSection(si);
    setAutoFollow(true);
    setIsLoading(true);
    try {
      await play([buildPlayback(sectionStartIndices[si], sectionChordCounts[si], song.sections[si].name, song.sections[si].repeatCount ?? 1)], {
        bpm, metronome: false, instruments,
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
        melodic: resolvedStyle.melodic,
      });
    } finally { setIsLoading(false); }
  }, [isPlaying, playingSection, play, stop, bpm, song.style, sectionStartIndices, sectionChordCounts, song.sections, transpose, buildPlayback, instruments, resolvedStyle]);

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

  // Progress depends on what's playing — spans include repeats, since that's the space
  // currentChordIndex actually advances through
  const activeSpan = playingSection !== null
    ? sectionChordCounts[playingSection] * (song.sections[playingSection]?.repeatCount ?? 1)
    : totalSpan;
  const progress = activeSpan > 0 ? Math.min(100, Math.round((currentChordIndex / (activeSpan - 1)) * 100)) : 0;

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
        progress={progress}
        allChordsCount={allChordsFlat.length}
        onPlayPause={handlePlay}
        onBpmChange={(v) => setBpm(v)}
        onTransposeChange={(v) => setTranspose(v)}
        onExportWav={handleExportWav}
        onExportMidi={handleExportMidi}
        editorUrl={editorUrl}
        inline={inline}
        showWavExport={song.slug !== 'hay-poder-yeshua-averly-morillo'}
      />

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
          const isActiveSection = isPlaying && (
            playingSection !== null
              ? playingSection === si
              : section.lines.some(line => line.some(t => t.globalIndex === activeGlobal))
          );
          const isSectionPlayable = sectionChordCounts[si] > 0;

          return (
            <div
              key={si}
              className={`rounded-xl border transition-colors overflow-hidden
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

              {/* Section content */}
              {!collapsed && (
                <div className="px-4 pb-4 space-y-3">
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
                              className="inline-flex flex-col items-start relative"
                              style={{ fontFamily: 'var(--font-mono, monospace)' }}
                            >
                              {/* Chord name row */}
                              {hasChord ? (
                                <Popover
                                  open={openTooltipIdx === token.globalIndex}
                                  onOpenChange={(open) => { if (!open) setOpenTooltipIdx(null); }}
                                >
                                  <PopoverTrigger asChild>
                                    <span
                                      className={`
                                        relative text-xs font-bold leading-none mb-0.5 whitespace-pre px-0.5
                                        transition-all duration-100 cursor-pointer select-none
                                        before:content-[''] before:absolute before:-inset-y-1.5 before:-inset-x-1.5
                                        ${isActive
                                          ? 'text-primary bg-primary/15 rounded px-1 py-0.5 scale-105 inline-block'
                                          : 'text-primary/70 hover:text-primary'
                                        }
                                      `}
                                      style={{ minWidth: '1ch' }}
                                      onMouseEnter={() => setOpenTooltipIdx(token.globalIndex)}
                                      onClick={() => {
                                        const parsed = parseChordString(token.chord);
                                        if (parsed[0]) playChordPreview(parsed[0]);
                                      }}
                                    >
                                      {token.chord}
                                    </span>
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
                                <span className="invisible select-none text-xs font-bold leading-none mb-0.5 whitespace-pre px-0.5" style={{ minWidth: '0' }}>.</span>
                              )}

                              {/* Duration dots — only while playing */}
                              {hasChord && isPlaying && <DurationDots duration={token.duration} isActive={isActive} bpm={bpm} uid={token.globalIndex} rawIndex={currentChordIndex} className="mt-0.5" />}

                              {/* Lyrics row */}
                              {!isChordOnlyLine && (
                                <span
                                  className={`
                                    text-sm leading-relaxed whitespace-pre transition-colors duration-100
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
