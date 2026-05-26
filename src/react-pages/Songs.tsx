import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Song } from '@/lib/songs';
import { getSongs, deleteSongWithSync, duplicateSong } from '@/lib/songStorage';
import { SongCard } from '@/components/SongCard';
import { EmptyState } from '@/components/EmptyState';
import { SaveAccountModal } from '@/components/SaveAccountModal';
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
import { Music2, Plus, Search, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { getIsAnonymousUser } from '@/lib/supabase';


const Songs = () => {
  const { isFirstTime, markAsReturningUser } = useFirstTimeUser();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Song | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    getSongs().then(async cloudSongs => {
      setSongs(cloudSongs);
      if (cloudSongs.length > 0) markAsReturningUser();
      setIsLoading(false);
      // Check after ensureAuth() has run inside getSongs()
      const anon = await getIsAnonymousUser();
      setIsAnonymous(anon);
    });
  }, [markAsReturningUser]);

  // First-time users with no songs go directly to editor
  useEffect(() => {
    if (!isLoading && isFirstTime && songs.length === 0) {
      window.location.replace('/editor');
    }
  }, [isLoading, isFirstTime, songs.length]);

  const refreshSongs = useCallback(async () => {
    setSongs(await getSongs());
  }, []);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const query = searchQuery.toLowerCase();
    return songs.filter(song =>
      song.title.toLowerCase().includes(query)
    );
  }, [songs, searchQuery]);

  const handleCreateNew = useCallback(() => {
    window.location.href = '/editor';
  }, []);

  const handleOpenSong = useCallback((songId: string) => {
    window.location.href = `/editor/${songId}`;
  }, []);

  const handleDuplicate = useCallback(async (song: Song) => {
    const duplicate = await duplicateSong(song.id);
    if (duplicate) {
      await refreshSongs();
      toast.success(`Duplicated "${song.title}"`);
    }
  }, [refreshSongs]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await deleteSongWithSync(deleteConfirm.id);
    await refreshSongs();
    toast.success(`Deleted "${deleteConfirm.title}"`);
    setDeleteConfirm(null);
  }, [deleteConfirm, refreshSongs]);

  const handleExport = useCallback((song: Song) => {
    window.location.href = `/editor/${song.id}?export=true`;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chord Player — Your saved songs</h1>
              <p className="text-sm text-muted-foreground">Chord Sequence · chordsequence.com</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6">
        <section
          className="mb-8 rounded-xl border border-border bg-card/50 p-4 sm:p-6 text-sm sm:text-base text-muted-foreground leading-relaxed"
          aria-labelledby="home-seo-intro"
        >
          <h2 id="home-seo-intro" className="text-foreground font-semibold text-base sm:text-lg mb-2">
            Chord progression builder and MP3 export
          </h2>
          <p className="mb-3">
            <strong className="text-foreground font-medium">Chord Player</strong> on{' '}
            <strong className="text-foreground font-medium">Chord Sequence</strong> (chordsequence.com) helps you
            arrange chord progressions in sections, try rhythm styles, transpose in semitones, preview with live
            playback, and export audio to MP3 — free in your browser.
          </p>
          <p>
            <a href="/editor" className="text-primary font-medium underline underline-offset-4 hover:text-primary/90">
              Open the chord progression editor
            </a>
            {' '}to start a new song, or use <span className="text-foreground">New Song</span> above when you have saved work in this library.
          </p>
        </section>
        <h2 className="sr-only">Saved songs</h2>

        {/* Save account banner — shown to anonymous users who have songs */}
        {!isLoading && isAnonymous && songs.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm text-muted-foreground">
                Your songs are saved in <strong className="text-foreground">this browser only</strong>.
                Link an email to access them from any device.
              </p>
            </div>
            <Button size="sm" variant="default" className="shrink-0" onClick={() => setSaveModalOpen(true)}>
              Save account
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : songs.length > 0 ? (
          <>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search songs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                New Song
              </Button>
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
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No songs matching "{searchQuery}"
              </div>
            )}
          </>
        ) : (
          <EmptyState onCreateSong={handleCreateNew} />
        )}
      </main>

      <SaveAccountModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        onSuccess={() => setIsAnonymous(false)}
      />

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
    </div>
  );
};

export default Songs;
