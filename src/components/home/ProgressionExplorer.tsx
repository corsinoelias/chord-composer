import { useState, useMemo, useEffect, useCallback } from 'react';
import { Play, Square, Search, Heart, Music, Download, FileMusic, X, Shuffle, Copy, Check } from 'lucide-react';
import {
  FEATURED_PROGRESSIONS, PROGRESSION_GENRES, PROGRESSION_MOODS, PROGRESSION_KEYS,
  type FeaturedProgression,
} from '@/data/featuredProgressions';
import {
  playProgression, stopProgression, playSingleChord, transposeChordName, displayChordName,
} from '@/lib/progressionPreview';
import { downloadProgressionMidi, downloadProgressionWav, editorUrl } from '@/lib/progressionExport';
import { analytics, type PreviewSurface } from '@/lib/analytics';

const FAVORITES_KEY = 'cs_favorite_progressions';

/**
 * Favorites live in localStorage rather than Supabase on purpose: the explorer works fully
 * logged-out, and a heart that demanded an account would be the only thing on this page
 * that does. Reads are defensive — Safari private mode throws on access, and a corrupt
 * value should cost the favorites, not the whole section.
 */
function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

interface ProgressionExplorerProps {
  /**
   * Render just these cards, in this order, with no search or filters. The home uses it for
   * a short "most played" row that plays like the full explorer on /progressions/ without
   * shipping the browse UI a visitor there does not need.
   */
  onlyIds?: string[];
  surface?: PreviewSurface;
}

export default function ProgressionExplorer({ onlyIds, surface = 'progressions_explorer' }: ProgressionExplorerProps) {
  const showFilters = !onlyIds;
  const source = useMemo(
    () => (onlyIds
      ? onlyIds.flatMap((id) => FEATURED_PROGRESSIONS.filter((p) => p.id === id))
      : FEATURED_PROGRESSIONS),
    // Callers pass a literal array; joining keeps a new-but-equal array from re-running this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onlyIds?.join(',')],
  );
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState<string>('All');
  const [mood, setMood] = useState<string>('All');
  const [musicKey, setMusicKey] = useState<string>('All');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [transpositions, setTranspositions] = useState<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Starts empty so the server-rendered markup and the first client render agree; the real
  // value arrives in an effect. Seeding from localStorage during render would hydrate a
  // different tree than the one Astro shipped.
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { setFavorites(readFavorites()); }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  useEffect(() => () => { stopProgression(); }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return source.filter((p) => {
      if (genre !== 'All' && p.genre !== genre) return false;
      if (mood !== 'All' && p.mood !== mood) return false;
      if (musicKey !== 'All' && p.defaultKey !== musicKey) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.chords.join(' ').toLowerCase().includes(needle) ||
        p.romanNumerals.join(' ').toLowerCase().includes(needle) ||
        p.popularExamples.some((e) => e.toLowerCase().includes(needle))
      );
    });
  }, [source, search, genre, mood, musicKey]);

  // Every name goes through transposeChordName even at zero semitones, so the spelling
  // never switches style the moment someone presses ♯ — see the note on that function.
  const chordsFor = useCallback(
    (p: FeaturedProgression) => p.chords.map((c) => transposeChordName(c, transpositions[p.id] ?? 0)),
    [transpositions],
  );

  const togglePlay = useCallback((p: FeaturedProgression) => {
    if (playingId === p.id) {
      stopProgression();
      setPlayingId(null);
      setActiveStep(null);
      return;
    }
    analytics.previewPlayed(surface, p.name);
    setPlayingId(p.id);
    setActiveStep(0);
    playProgression(chordsFor(p), p.bpm, { owner: p.id, onStep: setActiveStep });
  }, [playingId, chordsFor, surface]);

  const shiftTranspose = useCallback((p: FeaturedProgression, delta: number) => {
    setTranspositions((prev) => {
      const next = { ...prev, [p.id]: (prev[p.id] ?? 0) + delta };
      analytics.previewTransposed(surface, p.name, next[p.id]);
      if (playingId === p.id) {
        playProgression(
          p.chords.map((c) => transposeChordName(c, next[p.id])),
          p.bpm,
          { owner: p.id, onStep: setActiveStep },
        );
      }
      return next;
    });
  }, [playingId, surface]);

  const playRandom = useCallback(() => {
    if (filtered.length === 0) return;
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    analytics.previewPlayed(surface, pick.name);
    stopProgression();
    setPlayingId(pick.id);
    setActiveStep(0);
    playProgression(chordsFor(pick), pick.bpm, { owner: pick.id, onStep: setActiveStep });
    document.getElementById(`progression-${pick.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filtered, chordsFor, surface]);

  const copyChords = useCallback((p: FeaturedProgression) => {
    navigator.clipboard.writeText(chordsFor(p).join(' - ')).then(() => {
      setCopiedId(p.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => { /* clipboard blocked */ });
  }, [chordsFor]);

  const exportWav = useCallback(async (p: FeaturedProgression) => {
    analytics.previewExported(surface, 'wav', p.name);
    setExportingId(p.id);
    try {
      await downloadProgressionWav(chordsFor(p), p.name, p.bpm, p.style);
    } finally {
      setExportingId(null);
    }
  }, [chordsFor, surface]);

  const hasFilters = genre !== 'All' || mood !== 'All' || musicKey !== 'All' || search !== '';
  const resetFilters = () => { setGenre('All'); setMood('All'); setMusicKey('All'); setSearch(''); };

  return (
    <div>
      {showFilters && (<>
      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="mx-auto mb-6 max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search progressions, chords, or songs…"
            aria-label="Search chord progressions"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-border bg-muted/40 p-4">
        <div className="mb-3 flex items-center gap-1.5 overflow-x-auto border-b border-border pb-3">
          <span className="mr-2 shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Genre:
          </span>
          {PROGRESSION_GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              aria-pressed={genre === g}
              className={`cursor-pointer whitespace-nowrap rounded-xl px-3 py-1 text-xs font-semibold transition-colors ${
                genre === g
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="mr-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Mood:
            </span>
            {PROGRESSION_MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                aria-pressed={mood === m}
                className={`cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-0.5 text-xs transition-colors ${
                  mood === m
                    ? 'border border-primary/20 bg-primary/10 font-bold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Key:
            </span>
            <div className="flex flex-wrap gap-1">
              {PROGRESSION_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setMusicKey(k)}
                  aria-pressed={musicKey === k}
                  className={`cursor-pointer rounded-lg px-2 py-0.5 font-mono text-xs font-bold transition-colors ${
                    musicKey === k
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Result count / actions ───────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>Showing {filtered.length} chord progression{filtered.length === 1 ? '' : 's'}</span>
          {filtered.length > 0 && (
            <button
              onClick={playRandom}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <Shuffle className="h-3 w-3" /> Play random
            </button>
          )}
        </div>
        {hasFilters && (
          <button onClick={resetFilters} className="cursor-pointer font-medium text-primary hover:underline">
            Reset filters
          </button>
        )}
      </div>

      </>)}
      
      {/* ── Cards ────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-12 text-center">
          <Music className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">No chord progressions match those filters</p>
          <p className="mt-1 text-xs text-muted-foreground">Try widening the genre, or clear the search term.</p>
          <button
            onClick={resetFilters}
            className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const isPlayingThis = playingId === p.id;
            const chords = chordsFor(p);
            const offset = transpositions[p.id] ?? 0;
            const isFav = favorites.includes(p.id);

            return (
              <div
                key={p.id}
                id={`progression-${p.id}`}
                className={`group flex flex-col justify-between rounded-3xl border bg-card p-5 transition-colors ${
                  isPlayingThis ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'
                }`}
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a
                        href={`/progressions/${p.genreSlug}/`}
                        className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                        title={`All ${p.genre} chord progressions`}
                      >
                        {p.genre}
                      </a>
                      <span className="rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {p.mood}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.bpm} BPM</span>
                    </div>

                    <button
                      onClick={() => toggleFavorite(p.id)}
                      aria-pressed={isFav}
                      aria-label={isFav ? `Remove ${p.name} from favorites` : `Save ${p.name} to favorites`}
                      className="cursor-pointer p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Heart className={`h-4 w-4 ${isFav ? 'fill-destructive text-destructive' : ''}`} />
                    </button>
                  </div>

                  <h3 className="font-serif text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.description}</p>

                  <div className="my-4 grid grid-cols-4 gap-2">
                    {chords.map((chord, i) => {
                      const stepActive = isPlayingThis && activeStep === i;
                      return (
                        <button
                          key={`${p.id}-${chord}-${i}`}
                          onClick={() => playSingleChord(chord)}
                          title={`Audition ${displayChordName(chord)}`}
                          className={`flex select-none flex-col items-center justify-center rounded-xl border px-1 py-2.5 transition-all ${
                            stepActive
                              ? 'scale-105 border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-muted/50 hover:border-primary/40 hover:bg-muted'
                          }`}
                        >
                          <span className={`font-mono text-[10px] font-bold ${
                            stepActive ? 'text-primary-foreground/70' : 'text-primary'
                          }`}>
                            {p.romanNumerals[i] ?? `(${i + 1})`}
                          </span>
                          <span className="font-mono text-sm font-bold">{displayChordName(chord)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Heard in: </span>
                    {p.popularExamples.join(' · ')}
                  </p>
                </div>

                {/* Card transport */}
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePlay(p)}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                        isPlayingThis
                          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {isPlayingThis
                        ? (<><Square className="h-3.5 w-3.5 fill-current" /> Stop</>)
                        : (<><Play className="h-3.5 w-3.5 fill-current" /> Play</>)}
                    </button>

                    <div className="flex items-center gap-0.5 rounded-xl border border-border bg-muted p-1">
                      <button
                        onClick={() => shiftTranspose(p, -1)}
                        aria-label={`Transpose ${p.name} down a semitone`}
                        className="cursor-pointer rounded-lg px-2 py-1 font-mono text-xs font-bold transition-colors hover:bg-secondary"
                      >
                        ♭
                      </button>
                      <span className="min-w-[26px] text-center font-mono text-[10px] font-bold text-primary">
                        {offset === 0 ? '0' : offset > 0 ? `+${offset}` : offset}
                      </span>
                      <button
                        onClick={() => shiftTranspose(p, 1)}
                        aria-label={`Transpose ${p.name} up a semitone`}
                        className="cursor-pointer rounded-lg px-2 py-1 font-mono text-xs font-bold transition-colors hover:bg-secondary"
                      >
                        ♯
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyChords(p)}
                      title="Copy chords"
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] transition-colors hover:bg-secondary"
                    >
                      {copiedId === p.id
                        ? <Check className="h-3 w-3 text-success" />
                        : <Copy className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => { analytics.previewExported(surface, 'midi', p.name); downloadProgressionMidi(chords, p.name, p.bpm); }}
                      title="Download MIDI"
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] font-semibold transition-colors hover:bg-secondary"
                    >
                      <Download className="h-3 w-3" /> MIDI
                    </button>
                    <button
                      onClick={() => exportWav(p)}
                      disabled={exportingId === p.id}
                      title="Render and download WAV"
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
                    >
                      <FileMusic className="h-3 w-3" /> {exportingId === p.id ? '…' : 'WAV'}
                    </button>
                    <a
                      href={editorUrl(chords, p.bpm, p.style)}
                      onClick={() => analytics.previewEditorOpened(surface, p.name)}
                      className="ml-auto text-[11px] font-semibold text-primary hover:underline"
                    >
                      Open in editor →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
