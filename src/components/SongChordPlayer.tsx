import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { parseChordString } from '@/lib/chordParser';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { createSection } from '@/lib/sections';
import { Play, Square, ExternalLink, Music2, ChevronDown, ChevronUp } from 'lucide-react';
import { parseLyricLine, extractChordsWithDuration, type Song } from '@/data/songs';

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
  const { state, play, stop } = usePlayback();
  const { isPlaying, currentChordIndex } = state;
  const [isLoading, setIsLoading] = useState(false);
  const [bpm, setBpm] = useState(song.bpm);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const chordRefs = useRef<Map<number, HTMLElement>>(new Map());

  // ── Parse all sections and assign global chord indices ─────────────────────
  const { resolvedSections, allChordsFlat } = useMemo(() => {
    const allChords: string[] = [];
    let idx = 0;

    const sections: ResolvedSection[] = song.sections.map(section => ({
      name: section.name,
      lines: section.lines.map(line => {
        const tokens = parseLyricLine(line);
        return tokens.map(token => {
          if (token.chord) {
            allChords.push(token.chord);
            return { ...token, globalIndex: idx++ };
          }
          return { ...token, globalIndex: -1 };
        });
      }),
    }));

    return { resolvedSections: sections, allChordsFlat: allChords };
  }, [song]);

  // ── Build single section for the playback engine (with per-chord durations) ─
  const playbackSection = useMemo(() => {
    const chordsWithDur = extractChordsWithDuration(song);
    const parsedChords = chordsWithDur.flatMap(({ chord, duration }) => {
      const parsed = parseChordString(chord);
      return parsed.map(c => ({ ...c, duration }));
    });
    return [{ ...createSection('Song'), chords: parsedChords }];
  }, [song]);

  // ── Auto-scroll to active chord ────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || currentChordIndex < 0) return;
    const el = chordRefs.current.get(currentChordIndex);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChordIndex, isPlaying]);

  // ── Playback handlers ──────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying) { stop(); return; }
    if (allChordsFlat.length === 0) return;
    setIsLoading(true);
    try {
      await play(playbackSection, {
        bpm,
        metronome: false,
        instruments: getDefaultInstrumentStates(),
        styleId: song.style,
        transposition: 0,
        liveEditedStyle: null,
        customStyles: [],
        loopingSectionIndex: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, play, stop, playbackSection, bpm, song.style, allChordsFlat.length]);

  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const progress = allChordsFlat.length > 0
    ? Math.min(100, Math.round((currentChordIndex / (allChordsFlat.length - 1)) * 100))
    : 0;

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
                Key: {song.key}
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
        {resolvedSections.map((section, si) => {
          const collapsed = collapsedSections.has(si);
          const isActiveSection = isPlaying &&
            section.lines.some(line => line.some(t => t.globalIndex === currentChordIndex));

          return (
            <div
              key={si}
              className={`rounded-xl border transition-colors overflow-hidden
                ${isActiveSection ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}
              `}
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(si)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/30 transition-colors"
              >
                <span className={`text-xs font-bold uppercase tracking-widest
                  ${isActiveSection ? 'text-primary' : 'text-muted-foreground'}
                `}>
                  {section.name}
                </span>
                {collapsed
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>

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

                          const isActive = isPlaying && token.globalIndex === currentChordIndex;
                          const hasChord = token.chord !== '';

                          return (
                            <span
                              key={ti}
                              ref={hasChord ? el => {
                                if (el) chordRefs.current.set(token.globalIndex, el);
                                else chordRefs.current.delete(token.globalIndex);
                              } : undefined}
                              className="inline-flex flex-col items-start"
                              style={{ fontFamily: 'var(--font-mono, monospace)' }}
                            >
                              {/* Chord name row */}
                              <span
                                className={`
                                  text-xs font-bold leading-none mb-0.5 whitespace-pre px-0.5
                                  transition-all duration-100
                                  ${hasChord
                                    ? isActive
                                      ? 'text-primary bg-primary/15 rounded px-1 py-0.5 scale-105 inline-block'
                                      : 'text-primary/70'
                                    : 'invisible select-none'
                                  }
                                `}
                                style={{ minWidth: hasChord ? '1ch' : '0' }}
                              >
                                {hasChord ? token.chord : '.'}
                              </span>

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
