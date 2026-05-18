import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
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
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { SITE_ORIGIN, SEO_OG } from '@/lib/seo';

const Songs = () => {
  const navigate = useNavigate();
  const { isFirstTime } = useFirstTimeUser();
  const [songs, setSongs] = useState<Song[]>(() => getSongs());
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Song | null>(null);

  // First-time users go directly to editor
  useEffect(() => {
    if (isFirstTime && songs.length === 0) {
      navigate('/editor', { replace: true });
    }
  }, [isFirstTime, songs.length, navigate]);

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
      <Helmet>
        <title>Chord progression library — Chord Player | Chord Sequence</title>
        <meta name="description" content="Open chordsequence.com to browse your saved chord progressions, open the progression editor, duplicate songs, search titles, and export MP3s." />
        <link rel="canonical" href={`${SITE_ORIGIN}/`} />
        <meta property="og:site_name" content={SEO_OG.siteName} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Chord progression library — Chord Player | Chord Sequence" />
        <meta property="og:description" content="Browse your saved chord progressions on chordsequence.com. Open the editor to build sections, rhythms, transpositions, and MP3 export." />
        <meta property="og:url" content={`${SITE_ORIGIN}/`} />
        <meta property="og:image" content={SEO_OG.imageUrl} />
        <meta property="og:image:width" content={String(SEO_OG.imageWidth)} />
        <meta property="og:image:height" content={String(SEO_OG.imageHeight)} />
        <meta property="og:image:alt" content={SEO_OG.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Chord progression library — Chord Player | Chord Sequence" />
        <meta name="twitter:description" content="Browse your saved chord progressions on chordsequence.com. Open the editor to build sections, rhythms, transpositions, and MP3 export." />
        <meta name="twitter:image" content={SEO_OG.imageUrl} />
        <meta name="twitter:image:alt" content={SEO_OG.imageAlt} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'What is Chord Player on Chord Sequence?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Chord Player is a free online chord progression builder at chordsequence.com. Arrange chords into sections, choose a rhythm style, transpose, preview live, and export your progression as an MP3.',
              },
            },
            {
              '@type': 'Question',
              name: 'Is Chord Sequence free to use?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Chord Player runs entirely in your browser at no cost — no account is required to build progressions or export MP3 files.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I export my chord progression as audio?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Every progression can be exported to MP3 in one click from the editor, ready to share or import into your DAW.',
              },
            },
            {
              '@type': 'Question',
              name: 'Do my saved songs stay private?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Songs are stored locally in your browser by default, so they stay on your device until you choose to export or sync them.',
              },
            },
          ],
        })}</script>
      </Helmet>
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
            <Link to="/editor" className="text-primary font-medium underline underline-offset-4 hover:text-primary/90">
              Open the chord progression editor
            </Link>
            {' '}to start a new song, or use <span className="text-foreground">New Song</span> above when you have saved work in this library.
          </p>
        </section>
        <h2 className="sr-only">Saved songs</h2>
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
