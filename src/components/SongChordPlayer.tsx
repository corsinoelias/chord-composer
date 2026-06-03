import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString } from '@/lib/chordParser';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { createSection } from '@/lib/sections';
import { Play, Square, ExternalLink, Music2, ChevronDown, ChevronUp } from 'lucide-react';
import { parseLyricLine, extractChordsWithDuration, type Song } from '@/data/songs';
import ChordTooltip from '@/components/ChordTooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { playChordPreview } from '@/lib/audioEngine';

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
  const m = c.match(/^([A-G][#b]?)(.*)/); if (!m) return c;
  return transposeNote(m[1], s, flats) + m[2];
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
  globalIndex: number; // -1 if no chord
}

interface ResolvedSection {
  name: string;
  lines: ResolvedToken[][];
}

// ─── Inner component (needs PlaybackContext) ──────────────────────────────────
function SongChordPlayerInner({ song }: { song: Song }) {
  const { state, play, stop, setBpm: setContextBpm, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex } = state;
  const [isLoading, setIsLoading] = useState(false);
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
          if (token.chord) { allChords.push(token.chord); count++; return { ...token, globalIndex: idx++ }; }
          return { ...token, globalIndex: -1 };
        });
      });
      chordCounts.push(count);
      return { name: section.name, lines };
    });

    return { resolvedSections: sections, allChordsFlat: allChords, sectionStartIndices: startIndices, sectionChordCounts: chordCounts };
  }, [song]);

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

  // ── Build playback chords for a range ─────────────────────────────────────
  function buildPlayback(startGlobal: number, count: number, label: string) {
    const chordsWithDur = extractChordsWithDuration(song).slice(startGlobal, startGlobal + count);
    const parsed = chordsWithDur.flatMap(({ chord, duration }) =>
      parseChordString(chord).map(c => ({ ...c, duration }))
    );
    return [{ ...createSection(label), chords: parsed }];
  }

  // ── Reset playing section when playback stops ──────────────────────────────
  useEffect(() => { if (!isPlaying) setPlayingSection(null); }, [isPlaying]);

  // ── Auto-scroll to active chord ────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || currentChordIndex < 0) return;
    const globalIdx = playingSection !== null
      ? sectionStartIndices[playingSection] + currentChordIndex
      : currentChordIndex;
    chordRefs.current.get(globalIdx)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChordIndex, isPlaying, playingSection, sectionStartIndices]);

  // ── Play full song ─────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying) { stop(); return; }
    if (allChordsFlat.length === 0) return;
    setPlayingSection(null);
    setIsLoading(true);
    try {
      await play(buildPlayback(0, allChordsFlat.length, 'Song'), {
        bpm, metronome: false, instruments: getDefaultInstrumentStates(),
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
      });
    } finally { setIsLoading(false); }
  }, [isPlaying, play, stop, allChordsFlat.length, bpm, song.style]);

  // ── Play single section ────────────────────────────────────────────────────
  const handlePlaySection = useCallback(async (si: number) => {
    if (isPlaying && playingSection === si) { stop(); return; }
    if (isPlaying) stop();
    if (sectionChordCounts[si] === 0) return;
    setPlayingSection(si);
    setIsLoading(true);
    try {
      await play(buildPlayback(sectionStartIndices[si], sectionChordCounts[si], song.sections[si].name), {
        bpm, metronome: false, instruments: getDefaultInstrumentStates(),
        styleId: song.style, transposition: transpose, liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
      });
    } finally { setIsLoading(false); }
  }, [isPlaying, playingSection, play, stop, bpm, song.style, sectionStartIndices, sectionChordCounts, song.sections]);

  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  // Progress depends on what's playing
  const activeCount = playingSection !== null ? sectionChordCounts[playingSection] : allChordsFlat.length;
  const progress = activeCount > 0 ? Math.min(100, Math.round((currentChordIndex / (activeCount - 1)) * 100)) : 0;

  const editorUrl = `/editor?chords=${encodeURIComponent(allChordsFlat.slice(0, 32).join('-'))}&bpm=${bpm}&style=${song.style}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ─ Header card ─ */}
      <div className="rounded-xl border border-border bg-card mb-6 overflow-hidden">

        {/* Meta */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Music2 className="w-4 h-4 text-primary shrink-0" />
                <h1 className="text-xl font-bold text-foreground">{song.title}</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                {song.artist}
                {song.album && <span className="mx-1.5">·</span>}
                {song.album && <span className="italic">{song.album}</span>}
                {song.year && <span className="ml-1.5 text-xs">({song.year})</span>}
              </p>
            </div>

            {/* Key / Capo badges */}
            <div className="flex flex-wrap gap-1.5 justify-end shrink-0">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                Key: {displayKey}{transpose !== 0 && <span className="ml-1 opacity-60 font-normal">({transpose > 0 ? '+' : ''}{transpose})</span>}
              </span>
              {song.capo && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                  Capo: {song.capo}{song.capo === 1 ? 'st' : song.capo === 2 ? 'nd' : song.capo === 3 ? 'rd' : 'th'} fret
                </span>
              )}
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                {bpm} BPM
              </span>
            </div>
          </div>
        </div>

        {/* Transport */}
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlay}
              disabled={isLoading}
              className={`
                inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isPlaying
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }
              `}
            >
              {isPlaying
                ? <><Square className="w-3.5 h-3.5" /> Stop</>
                : <><Play className="w-3.5 h-3.5" /> {isLoading ? 'Loading…' : 'Play song'}</>
              }
            </button>

            {/* BPM control */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBpm(b => Math.max(50, b - 4))}
                className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 text-xs font-bold transition-colors"
              >−</button>
              <span className="text-xs text-muted-foreground w-14 text-center">{bpm} BPM</span>
              <button
                onClick={() => setBpm(b => Math.min(200, b + 4))}
                className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 text-xs font-bold transition-colors"
              >+</button>
            </div>

            {/* Key transposition */}
            <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-background">
              <button
                onClick={() => setTranspose(t => Math.max(-6, t - 1))}
                disabled={transpose <= -6}
                className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 text-xs font-bold transition-colors"
                title="Transpose down"
              >−</button>
              <span className="text-xs text-muted-foreground w-16 text-center select-none">{displayKey}{transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose})` : ''}</span>
              <button
                onClick={() => setTranspose(t => Math.min(6, t + 1))}
                disabled={transpose >= 6}
                className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 text-xs font-bold transition-colors"
                title="Transpose up"
              >+</button>
            </div>
          </div>

          <a
            href={editorUrl}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
          >
            Open in Editor
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-border/40">
          <div
            className="h-full bg-primary transition-all duration-300 ease-linear"
            style={{ width: isPlaying ? `${progress}%` : '0%' }}
          />
        </div>
      </div>

      {/* ─ Song chart ─ */}
      <div className="space-y-6">
        {displayedSections.map((section, si) => {
          const collapsed = collapsedSections.has(si);

          // Which global index is "active" right now
          const activeGlobal = isPlaying
            ? (playingSection !== null ? sectionStartIndices[playingSection] + currentChordIndex : currentChordIndex)
            : -1;

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
                  <span className={`text-xs font-bold uppercase tracking-widest truncate
                    ${isActiveSection ? 'text-primary' : 'text-muted-foreground'}
                  `}>
                    {section.name}
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
                                        text-xs font-bold leading-none mb-0.5 whitespace-pre px-0.5
                                        transition-all duration-100 cursor-pointer select-none
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
export default function SongChordPlayer({ song }: { song: Song }) {
  return (
    <PlaybackProvider>
      <SongChordPlayerInner song={song} />
    </PlaybackProvider>
  );
}
