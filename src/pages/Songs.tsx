import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Song } from '@/lib/songs';
import { getSongs, deleteSong, duplicateSong } from '@/lib/songStorage';
import { SongCard } from '@/components/SongCard';
import { EmptyState } from '@/components/EmptyState';
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
import { Music2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

const Songs = () => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[]>(() => getSongs());
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Song | null>(null);

  const refreshSongs = useCallback(() => {
    setSongs(getSongs());
  }, []);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const query = searchQuery.toLowerCase();
    return songs.filter(song => 
      song.title.toLowerCase().includes(query)
    );
  }, [songs, searchQuery]);

  const handleCreateNew = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleOpenSong = useCallback((songId: string) => {
    navigate(`/editor/${songId}`);
  }, [navigate]);

  const handleDuplicate = useCallback((song: Song) => {
    const duplicate = duplicateSong(song.id);
    if (duplicate) {
      refreshSongs();
      toast.success(`Duplicated "${song.title}"`);
    }
  }, [refreshSongs]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    deleteSong(deleteConfirm.id);
    refreshSongs();
    toast.success(`Deleted "${deleteConfirm.title}"`);
    setDeleteConfirm(null);
  }, [deleteConfirm, refreshSongs]);

  const handleExport = useCallback((song: Song) => {
    // Navigate to editor with export flag
    navigate(`/editor/${song.id}?export=true`);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chord Player</h1>
              <p className="text-sm text-muted-foreground">Your saved songs</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6">
        {songs.length > 0 ? (
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
