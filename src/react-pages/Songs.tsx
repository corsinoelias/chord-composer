import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Song } from '@/lib/songs';
import type { Chord } from '@/lib/musicTheory';
import { getSongs, deleteSongWithSync, duplicateSong } from '@/lib/songStorage';
import { MiniPlayer } from '@/components/MiniPlayer';
import { AuthModal } from '@/components/AuthModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowRight, Copy, Download, FolderOpen, LayoutGrid, Loader2, LogIn, MoreVertical, Music2, Play,
  Plus, Search, Square, Trash2, Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { useAccountState } from '@/hooks/useAccountState';
import { usePlayback } from '@/contexts/PlaybackContext';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { MUSICAL_STYLES } from '@/lib/styles';
import { getCustomStyles } from '@/lib/customStyles';
import { detectKey, keyLabel } from '@/lib/keyDetect';
import { getTransposedChordName } from '@/lib/chordNotes';
import { qualityClass } from '@/lib/chordColors';
import { keyPrefersFlats } from '@/lib/musicKeys';
import '@/styles/chord-player.css';

/** A chord family's hue, filled solid — the app's song strips and swatches. */
const HUE: Record<string, string> = {
  '': 'var(--cp-maj)',
  'cp-min': 'var(--cp-min)',
  'cp-sev': 'var(--cp-sev)',
  'cp-sus': 'var(--cp-sus)',
  'cp-dim': 'var(--cp-dim)',
  'cp-aug': 'var(--cp-aug)',
};
const hueOf = (chord: Chord) => HUE[qualityClass(chord.quality)] ?? HUE[''];

/** What the library shows about a song, worked out once per song. */
interface SongFacts {
  styleName: string;
  key: string | null;
  flats: boolean;
  chords: Chord[];
  /** The first two sections, for the strip on the "continue" card. */
  strip: Chord[][];
}

function factsOf(song: Song): SongFacts {
  const style = MUSICAL_STYLES.find((s) => s.id === song.styleId) ?? getCustomStyles().find((s) => s.id === song.styleId);
  const detected = detectKey(song.sections);
  const key = detected ? keyLabel(detected.pitchClass + song.transposition, detected.mode) : null;
  return {
    styleName: style?.name ?? 'Custom rhythm',
    key,
    flats: key ? keyPrefersFlats(key) : false,
    chords: song.sections.flatMap((s) => s.chords),
    strip: song.sections.slice(0, 2).map((s) => s.chords.slice(0, 4)).filter((c) => c.length > 0),
  };
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

const RECENT_DAYS = 7;
type Filter = 'all' | 'recent';

/**
 * My songs, as the Android app draws it (lib/features/library/library_screen.dart and
 * the "Mis canciones" artboard): a title with the new-song button, search, filters, the
 * song you were last on as a card to pick it up again, then every song as a row — a
 * swatch of its chords, its progression, and its style, tempo, key and age.
 */
const Songs = () => {
  const { markAsReturningUser } = useFirstTimeUser();
  const { isLoggedIn, isLoading: authLoading, refresh: refreshAuth } = useAccountState();
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<Song | null>(null);
  const [activeSong, setActiveSong] = useState<Song | null>(null);

  const { state: playbackState, play, stop } = usePlayback();
  const isLoading = authLoading || songsLoading;

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setSongsLoading(false);
      return;
    }
    getSongs().then(cloudSongs => {
      setSongs(cloudSongs);
      if (cloudSongs.length > 0) markAsReturningUser();
      setSongsLoading(false);
    });
  }, [authLoading, isLoggedIn, markAsReturningUser]);

  const refreshSongs = useCallback(async () => {
    setSongs(await getSongs());
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setSongsLoading(true);
    refreshAuth();
    refreshSongs().finally(() => setSongsLoading(false));
  }, [refreshAuth, refreshSongs]);

  // Newest first, as the app lists them.
  const sorted = useMemo(
    () => [...songs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [songs],
  );
  const facts = useMemo(() => new Map(sorted.map((s) => [s.id, factsOf(s)])), [sorted]);

  const filteredSongs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const since = Date.now() - RECENT_DAYS * 86400000;
    return sorted.filter((song) => {
      if (filter === 'recent' && new Date(song.updatedAt).getTime() < since) return false;
      if (!query) return true;
      const f = facts.get(song.id)!;
      return [song.title, f.styleName, f.key ?? ''].some((text) => text.toLowerCase().includes(query));
    });
  }, [sorted, facts, searchQuery, filter]);

  const lastSong = sorted[0] ?? null;

  const handlePlay = useCallback(async (song: Song) => {
    if (activeSong?.id === song.id && playbackState.isPlaying) {
      stop();
      return;
    }
    setActiveSong(song);
    await play(song.sections, {
      bpm: song.bpm,
      metronome: song.metronomeEnabled,
      instruments: song.instrumentSettings.length > 0 ? song.instrumentSettings : getDefaultInstrumentStates(),
      styleId: song.styleId,
      transposition: song.transposition,
    });
  }, [activeSong, playbackState.isPlaying, play, stop]);

  const handleClosePlayer = useCallback(() => {
    setActiveSong(null);
  }, []);

  const handleCreateNew = useCallback(() => { window.location.href = '/chord-player'; }, []);
  const songHref = (songId: string) => `/chord-player/${songId}`;

  const handleDuplicate = useCallback(async (song: Song) => {
    const duplicate = await duplicateSong(song.id);
    if (duplicate) { await refreshSongs(); toast.success(`Duplicated "${song.title}"`); }
  }, [refreshSongs]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await deleteSongWithSync(deleteConfirm.id);
    await refreshSongs();
    toast.success(`Deleted "${deleteConfirm.title}"`);
    setDeleteConfirm(null);
  }, [deleteConfirm, refreshSongs]);

  const handleExport = useCallback((song: Song) => {
    window.location.href = `/chord-player/${song.id}?export=true`;
  }, []);

  const isSongPlaying = (song: Song) => activeSong?.id === song.id && playbackState.isPlaying;
  const nameOf = (chord: Chord, song: Song, f: SongFacts) => getTransposedChordName(chord, song.transposition, f.flats, true);
  const metaOf = (song: Song, f: SongFacts) =>
    [f.styleName, `${song.bpm} BPM`, f.key, timeAgo(song.updatedAt)].filter(Boolean).join(' · ');

  const songMenu = (song: Song) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cp-icb" style={{ width: 32 }} aria-label={`${song.title} options`}>
          <MoreVertical size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { window.location.href = songHref(song.id); }}>
          <FolderOpen size={14} className="mr-2" />Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePlay(song)}>
          {isSongPlaying(song) ? <Square size={14} className="mr-2" /> : <Play size={14} className="mr-2" />}
          {isSongPlaying(song) ? 'Stop' : 'Play'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDuplicate(song)}>
          <Copy size={14} className="mr-2" />Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport(song)}>
          <Download size={14} className="mr-2" />Export WAV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setDeleteConfirm(song)} style={{ color: 'var(--cp-dg)' }}>
          <Trash2 size={14} className="mr-2" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const card = { background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', borderRadius: 16 } as const;
  const newButton = (
    <button
      onClick={handleCreateNew}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 text-white"
      style={{ background: 'var(--cp-ac)', boxShadow: '0 6px 18px color-mix(in srgb, var(--cp-ac) 30%, transparent)' }}
      aria-label="New song"
      title="New song"
    >
      <Plus size={20} />
    </button>
  );

  return (
    <div className="cp min-h-[70vh]">
      <main className={`mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 sm:py-10 ${activeSong ? 'pb-28' : ''}`}>
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[26px] font-extrabold tracking-[-0.02em]">My songs</h1>
          {isLoggedIn && newButton}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--cp-mu)' }} />
          </div>

        ) : !isLoggedIn ? (
          /* Sign-in gate */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--cp-acs)', color: 'var(--cp-act)' }}>
              <LogIn className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-bold">Sign in to see your songs</h2>
            <p className="mb-8 max-w-sm text-sm" style={{ color: 'var(--cp-mu)' }}>
              Create an account to save chord progressions and access them from any device.
            </p>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex h-12 items-center gap-2 rounded-xl border-0 px-6 font-bold text-white"
              style={{ background: 'var(--cp-ac)' }}
            >
              <LogIn className="h-4 w-4" />
              Sign in / Sign up
            </button>
          </div>

        ) : songs.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--cp-acs)', color: 'var(--cp-act)' }}>
              <Music2 className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-bold">No songs yet</h2>
            <p className="mb-8 max-w-sm text-sm" style={{ color: 'var(--cp-mu)' }}>
              Write your first progression in the chord player — pick a rhythm, add chords and hear the band play them.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <button
                onClick={handleCreateNew}
                className="flex h-12 items-center gap-2 rounded-xl border-0 px-6 font-bold text-white"
                style={{ background: 'var(--cp-ac)' }}
              >
                <Plus className="h-4 w-4" />
                New song
              </button>
              <a href="/songs/" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--cp-mu)' }}>
                Browse song charts
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-14 grid w-full max-w-xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
              {[
                { Icon: LayoutGrid, title: 'Sections & chords', desc: 'Build verses and choruses, reorder them freely' },
                { Icon: Waves, title: '20+ rhythm styles', desc: 'Pop, rock, jazz, Latin — with real audio' },
                { Icon: Download, title: 'Export audio', desc: 'Download your song as a WAV file' },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="p-4" style={card}>
                  <Icon size={20} className="mb-2" style={{ color: 'var(--cp-act)' }} />
                  <p className="mb-1 text-sm font-semibold">{title}</p>
                  <p className="text-xs" style={{ color: 'var(--cp-mu)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>

        ) : (
          <>
            <label
              className="flex h-11 items-center gap-2 rounded-xl px-3"
              style={{ background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
            >
              <Search size={17} />
              <input
                placeholder="Search by name, style or key"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border-0 bg-transparent text-sm outline-none"
                style={{ color: 'var(--cp-tx)' }}
                aria-label="Search songs"
              />
            </label>

            <div className="flex gap-1.5">
              {([['all', 'All'], ['recent', 'Recent']] as [Filter, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                  className="h-8 rounded-full px-3 text-xs font-semibold"
                  style={filter === id
                    ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)', border: '1px solid var(--cp-tx)' }
                    : { background: 'transparent', color: 'var(--cp-tx2)', border: '1px solid var(--cp-ln)' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Pick up where you left off */}
            {lastSong && filter === 'all' && !searchQuery.trim() && (() => {
              const f = facts.get(lastSong.id)!;
              return (
                <>
                  <span className="cp-lbl mt-1">Continue where you left off</span>
                  <div
                    className="flex flex-col gap-2.5 p-3"
                    style={{
                      ...card,
                      borderColor: 'color-mix(in srgb, var(--cp-ac) 50%, transparent)',
                      background: 'linear-gradient(160deg, color-mix(in srgb, var(--cp-ac) 12%, var(--cp-s1)), var(--cp-s1) 60%)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <a href={songHref(lastSong.id)} className="flex min-w-0 flex-1 flex-col gap-[3px] no-underline" style={{ color: 'inherit' }}>
                        <span className="truncate text-[17px] font-bold">{lastSong.title}</span>
                        <span className="text-xs" style={{ color: 'var(--cp-mu)' }}>{metaOf(lastSong, f)}</span>
                      </a>
                      <button
                        onClick={() => handlePlay(lastSong)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 text-white"
                        style={{ background: 'var(--cp-ac)' }}
                        aria-label={isSongPlaying(lastSong) ? `Stop ${lastSong.title}` : `Play ${lastSong.title}`}
                      >
                        {isSongPlaying(lastSong)
                          ? <Square size={16} fill="currentColor" strokeWidth={0} />
                          : <Play size={18} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
                      </button>
                      {songMenu(lastSong)}
                    </div>
                    {f.strip.length > 0 && (
                      <a href={songHref(lastSong.id)} className="flex h-[22px] gap-[3px] no-underline" aria-hidden="true" tabIndex={-1}>
                        {f.strip.map((part, p) => (
                          <span key={p} className="flex flex-1 gap-[3px]" style={p > 0 ? { marginLeft: 6 } : undefined}>
                            {part.map((chord, i) => (
                              <span
                                key={i}
                                className="cp-mono flex min-w-0 flex-1 items-center overflow-hidden rounded-[5px] pl-[5px] text-[10px] font-bold"
                                style={{ background: hueOf(chord), color: '#14181F' }}
                              >
                                <span className="truncate">{nameOf(chord, lastSong, f)}</span>
                              </span>
                            ))}
                          </span>
                        ))}
                      </a>
                    )}
                  </div>
                </>
              );
            })()}

            <span className="cp-lbl mt-2">
              {filter === 'recent' ? 'Recent' : 'All'} · {filteredSongs.length}
            </span>

            {filteredSongs.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {filteredSongs.map((song) => {
                  const f = facts.get(song.id)!;
                  const swatch = Array.from({ length: 4 }, (_, i) => f.chords[i] ?? f.chords[i % Math.max(f.chords.length, 1)]);
                  return (
                    <div key={song.id} className="flex items-center gap-1 py-2.5 pl-3 pr-1" style={card}>
                      <a href={songHref(song.id)} className="flex min-w-0 flex-1 items-center gap-3 no-underline" style={{ color: 'inherit' }}>
                        <span
                          className="grid h-12 w-12 shrink-0 grid-cols-2 gap-[3px] rounded-xl p-[5px]"
                          style={{ background: 'var(--cp-s2)' }}
                          aria-hidden="true"
                        >
                          {swatch.map((chord, i) => (
                            <span key={i} className="rounded-[3px]" style={{ background: chord ? hueOf(chord) : 'var(--cp-s3)' }} />
                          ))}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <span className="truncate text-[15px] font-semibold">{song.title}</span>
                          {f.chords.length > 0 && (
                            <span className="cp-mono truncate text-[11px]" style={{ color: 'var(--cp-mu)' }}>
                              {f.chords.slice(0, 4).map((c) => nameOf(c, song, f)).join(' · ')}
                            </span>
                          )}
                          <span className="truncate text-[11px]" style={{ color: 'var(--cp-fa)' }}>{metaOf(song, f)}</span>
                        </span>
                      </a>
                      {songMenu(song)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-sm" style={{ color: 'var(--cp-mu)' }}>
                {searchQuery.trim()
                  ? <>No songs matching "<span style={{ color: 'var(--cp-tx)' }}>{searchQuery}</span>"</>
                  : `No songs edited in the last ${RECENT_DAYS} days`}
              </div>
            )}
          </>
        )}

        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          onSuccess={handleAuthSuccess}
          entryPoint="my_library_gate"
        />

        {activeSong && (
          <MiniPlayer song={activeSong} onClose={handleClosePlayer} />
        )}

        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteConfirm?.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The song will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default Songs;
