import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Song } from '@/lib/songs';
import { getSongs, deleteSongWithSync, duplicateSong } from '@/lib/songStorage';
import { SongCard } from '@/components/SongCard';
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
import { Plus, Search, Loader2, ShieldCheck, Music2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { getIsAnonymousUser } from '@/lib/supabase';

const Songs = () => {
  const { markAsReturningUser } = useFirstTimeUser();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Song | null>(null);

  useEffect(() => {
    getSongs().then(async cloudSongs => {
      setSongs(cloudSongs);
      if (cloudSongs.length > 0) markAsReturningUser();
      setIsLoading(false);
      const anon = await getIsAnonymousUser();
      setIsAnonymous(anon);
    });
  }, [markAsReturningUser]);

  const refreshSongs = useCallback(async () => {
    setSongs(await getSongs());
  }, []);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const query = searchQuery.toLowerCase();
    return songs.filter(song => song.title.toLowerCase().includes(query));
  }, [songs, searchQuery]);

  const handleCreateNew = useCallback(() => { window.location.href = '/editor'; }, []);
  const handleOpenSong = useCallback((songId: string) => { window.location.href = `/editor/${songId}`; }, []);

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
    window.location.href = `/editor/${song.id}?export=true`;
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">My library</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your saved chord progressions</p>
        </div>
        <Button onClick={handleCreateNew} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          New progression
        </Button>
      </div>

      {/* Save account banner */}
      {!isLoading && isAnonymous && songs.length > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Saved in this browser only — link an email to sync across devices.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={() => setSaveModalOpen(true)}>
            Save account
          </Button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
