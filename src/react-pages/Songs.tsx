import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Song } from '@/lib/songs';
import { getSongs, deleteSongWithSync, duplicateSong } from '@/lib/songStorage';
import { SongCard } from '@/components/SongCard';
import { MiniPlayer } from '@/components/MiniPlayer';
import { AuthModal } from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, Search, Loader2, LogIn, Music2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { useAccountState } from '@/hooks/useAccountState';
import { usePlayback } from '@/contexts/PlaybackContext';
import { getDefaultInstrumentStates } from '@/lib/instruments';

const Songs = () => {
  const { markAsReturningUser } = useFirstTimeUser();
  const { isLoggedIn, isLoading: authLoading, refresh: refreshAuth } = useAccountState();
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const query = searchQuery.toLowerCase();
    return songs.filter(song => song.title.toLowerCase().includes(query));
  }, [songs, searchQuery]);

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
  const handleOpenSong = useCallback((songId: string) => { window.location.href = `/chord-player/${songId}`; }, []);

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

  return (
    <main className={`max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 ${activeSong ? 'pb-28' : ''}`}>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">My library</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your saved chord progressions</p>
        </div>
        {/* Account identity lives in the global navbar now (AccountSlot) — this page
            doesn't need to repeat it, it's already the destination that links to. */}
        <Button onClick={handleCreateNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New progression
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>

      ) : !isLoggedIn ? (
        /* Sign-in gate */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <LogIn className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Sign in to see your library</h2>
          <p className="text-muted-foreground text-sm max-w-sm mb-8">
            Create an account to save chord progressions and access them from any device.
          </p>
          <Button onClick={() => setAuthModalOpen(true)} size="lg" className="gap-2 px-6">
            <LogIn className="h-4 w-4" />
            Sign in / Sign up
          </Button>
        </div>

      ) : songs.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Music2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">No progressions yet</h2>
          <p className="text-muted-foreground text-sm max-w-sm mb-8">
            Create your first chord progression with the editor — drag chords, pick a rhythm style, and export audio.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button onClick={handleCreateNew} size="lg" className="gap-2 px-6">
              <Plus className="h-4 w-4" />
              New progression
            </Button>
            <a
              href="/songs/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse song charts
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Feature hints */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl text-left">
            {[
              { icon: '🎸', title: 'Drag & drop', desc: 'Build sections with chords, reorder them freely' },
              { icon: '🥁', title: '20+ rhythm styles', desc: 'Pop, Rock, Jazz, Latin — with real audio' },
              { icon: '🎵', title: 'Export audio', desc: 'Download your progression as a WAV file' },
            ].map(f => (
              <div key={f.title} className="rounded-xl border border-border bg-card/50 p-4">
                <span className="text-2xl mb-2 block">{f.icon}</span>
                <p className="text-sm font-semibold text-foreground mb-1">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

      ) : (
        /* Songs grid */
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search progressions…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  onOpen={() => handleOpenSong(song.id)}
                  onDuplicate={() => handleDuplicate(song)}
                  onDelete={() => setDeleteConfirm(song)}
                  onExport={() => handleExport(song)}
                  isPlaying={activeSong?.id === song.id && playbackState.isPlaying}
                  onPlay={() => handlePlay(song)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No progressions matching "<span className="text-foreground">{searchQuery}</span>"
            </div>
          )}
        </>
      )}

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onSuccess={handleAuthSuccess}
      />

      {activeSong && (
        <MiniPlayer song={activeSong} onClose={handleClosePlayer} />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteConfirm?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The progression will be permanently deleted.
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
  );
};

export default Songs;
